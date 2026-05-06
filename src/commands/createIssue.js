const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const logger = require("../utils/logger");
const {
  getPriorityEmoji,
  getIssueUrl,
  getPriorityColor,
  formatDate,
} = require("../utils/utils");

const MAX_AUTOCOMPLETE_CHOICES = 25;
const ASSIGNEE_OPTION_NAMES = [
  "assignee",
  "assignee-2",
  "assignee-3",
  "assignee-4",
  "assignee-5",
];
const LABEL_OPTION_NAMES = ["label", "label-2"];

function getAssigneeInputsFromOptions(options) {
  return ASSIGNEE_OPTION_NAMES.map((name) =>
    options.getString(name)?.trim(),
  ).filter(Boolean);
}

function getLabelInputsFromOptions(options) {
  return LABEL_OPTION_NAMES.map((name) =>
    options.getString(name)?.trim(),
  ).filter(Boolean);
}

function formatAutocompleteChoice(member) {
  const secondary = member.username || member.email || member.id;
  const label = `${member.name} (${secondary})`;
  return label.length > 100 ? `${label.slice(0, 97)}...` : label;
}

async function resolveDiscordMentions(interaction, members) {
  if (!interaction.guild || members.length === 0) {
    return [];
  }

  try {
    await interaction.guild.members.fetch();
  } catch (error) {
    logger.warn("Unable to fetch guild members for assignee mention mapping", {
      guildId: interaction.guild.id,
      message: error.message,
    });
  }

  const guildMembers = Array.from(interaction.guild.members.cache.values());
  const mentions = [];
  const seenUserIds = new Set();

  const normalize = (value) =>
    String(value || "")
      .trim()
      .toLowerCase();

  for (const member of members) {
    const candidateNames = [
      member.username,
      member.name,
      member.email,
      member.email?.split("@")[0],
    ]
      .filter(Boolean)
      .map(normalize);

    if (candidateNames.length === 0) {
      continue;
    }

    const matchedGuildMember = guildMembers.find((guildMember) => {
      const targets = [
        guildMember.user.username,
        guildMember.user.globalName,
        guildMember.displayName,
        guildMember.nickname,
      ]
        .filter(Boolean)
        .map(normalize);

      return targets.some((target) => candidateNames.includes(target));
    });

    if (matchedGuildMember && !seenUserIds.has(matchedGuildMember.id)) {
      seenUserIds.add(matchedGuildMember.id);
      mentions.push(`<@${matchedGuildMember.id}>`);
    }
  }

  return mentions;
}

module.exports = {
  data: (() => {
    const command = new SlashCommandBuilder()
      .setName("create-issue")
      .setDescription("Create a new issue")
      .addStringOption((option) =>
        option.setName("title").setDescription("Issue title").setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("description")
          .setDescription("Issue description")
          .setRequired(false),
      )
      .addStringOption((option) =>
        option
          .setName("priority")
          .setDescription("Issue priority")
          .setRequired(false)
          .addChoices(
            { name: "Urgent", value: "urgent" },
            { name: "High", value: "high" },
            { name: "Medium", value: "medium" },
            { name: "Low", value: "low" },
          ),
      );

    ASSIGNEE_OPTION_NAMES.forEach((name, index) => {
      command.addStringOption((option) =>
        option
          .setName(name)
          .setDescription(
            index === 0
              ? "Plane assignee (search member by name/username/email)"
              : `Additional assignee ${index + 1}`,
          )
          .setAutocomplete(true)
          .setRequired(false),
      );
    });

    LABEL_OPTION_NAMES.forEach((name, index) => {
      command.addStringOption((option) =>
        option
          .setName(name)
          .setDescription(
            index === 0
              ? "Plane label (search label name)"
              : `Additional label ${index + 1}`,
          )
          .setAutocomplete(true)
          .setRequired(false),
      );
    });

    // Dates as ISO YYYY-MM-DD or freeform
    command
      .addStringOption((option) =>
        option
          .setName("start_date")
          .setDescription("Start date (YYYY-MM-DD)")
          .setRequired(false),
      )
      .addStringOption((option) =>
        option
          .setName("target_date")
          .setDescription("Target date (YYYY-MM-DD)")
          .setRequired(false),
      );

    return command;
  })(),

  async autocomplete(interaction, { planeService, channelConfig }) {
    try {
      if (!planeService || !channelConfig) {
        await interaction.respond([]);
        return;
      }

      const focused = interaction.options.getFocused(true);
      const name = focused.name;
      const query = String(focused.value || "").trim();

      // Assignee autocomplete
      if (ASSIGNEE_OPTION_NAMES.includes(name)) {
        const selectedIds = ASSIGNEE_OPTION_NAMES.filter((n) => n !== name)
          .map((n) => interaction.options.getString(n)?.trim())
          .filter(Boolean)
          .filter((v) =>
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
              v,
            ),
          );

        const members = await planeService.searchProjectMembers(
          query,
          selectedIds,
          MAX_AUTOCOMPLETE_CHOICES,
        );
        const choices = members.map((member) => ({
          name: formatAutocompleteChoice(member),
          value: member.id,
        }));
        await interaction.respond(choices.slice(0, MAX_AUTOCOMPLETE_CHOICES));
        return;
      }

      // Label autocomplete
      if (LABEL_OPTION_NAMES.includes(name)) {
        const selectedIds = LABEL_OPTION_NAMES.filter((n) => n !== name)
          .map((n) => interaction.options.getString(n)?.trim())
          .filter(Boolean)
          .filter((v) =>
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
              v,
            ),
          );

        const labels = await planeService.searchProjectLabels(
          query,
          selectedIds,
          MAX_AUTOCOMPLETE_CHOICES,
        );
        const choices = labels.map((label) => ({
          name: `${label.name}`,
          value: label.id,
        }));
        await interaction.respond(choices.slice(0, MAX_AUTOCOMPLETE_CHOICES));
        return;
      }

      await interaction.respond([]);
    } catch (error) {
      logger.error("Error handling assignee autocomplete", error);
      await interaction.respond([]);
    }
  },

  async execute(interaction, { planeService, channelConfig }) {
    // Check if channel is configured
    if (!planeService || !channelConfig) {
      const notConfiguredEmbed = new EmbedBuilder()
        .setTitle("⚠️ Channel Not Configured")
        .setDescription(
          "This channel is not configured for Plane.\n" +
            "An administrator must use `/plane-setup` to configure this channel first.",
        )
        .setColor(0xfbbf24)
        .setTimestamp();

      await interaction.reply({
        embeds: [notConfiguredEmbed],
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    try {
      logger.info("Creating new issue command initiated", {
        user: interaction.user.tag,
        guild: interaction.guild?.name,
        workspace: channelConfig.workspaceSlug,
        project: channelConfig.projectId,
      });

      const title = interaction.options.getString("title");
      const description = interaction.options.getString("description") || "";
      const priority = interaction.options.getString("priority") || "none";
      const assigneeInputs = getAssigneeInputsFromOptions(interaction.options);
      const labelInputs = getLabelInputsFromOptions(interaction.options);
      const startDate = interaction.options.getString("start_date") || null;
      const targetDate = interaction.options.getString("target_date") || null;

      const { assigneeIds, members } =
        await planeService.resolveProjectAssigneesWithMembers(assigneeInputs);

      const { labelIds, labels } =
        await planeService.resolveLabelIdsWithLabels(labelInputs);

      logger.debug("Issue creation parameters", {
        title,
        description: description ? "Provided" : "Not provided",
        priority,
        assigneeInputs:
          assigneeInputs.length > 0 ? assigneeInputs : "Not provided",
        assignees: assigneeIds.length > 0 ? assigneeIds : "Not provided",
        labels: labelIds.length > 0 ? labelIds : "Not provided",
        startDate,
        targetDate,
      });

      // Show progress
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("⏳ Creating Issue...")
            .setDescription("Please wait while the issue is being created.")
            .setColor(0xfbbf24)
            .setTimestamp(),
        ],
      });

      const issue = await planeService.createIssue(
        title,
        description,
        priority,
        assigneeIds,
        labelIds,
        startDate,
        targetDate,
      );

      logger.info("Issue created successfully", {
        issueId: issue.id,
        sequenceId: issue.sequence_id,
      });

      const latestIssue = await planeService.getIssueById(issue.id);

      const issueUrl = getIssueUrl(
        planeService.config.WORKSPACE_SLUG,
        planeService.config.PROJECT_ID,
        issue.id,
      );

      // Create success embed
      const successEmbed = new EmbedBuilder()
        .setTitle("✅ Issue Created Successfully")
        .setColor(getPriorityColor(priority))
        .setDescription(`>>> ${title}`)
        .addFields(
          {
            name: "Issue Details",
            value: [
              `**ID:** ${latestIssue.formatted_id}`,
              `**Priority:** ${getPriorityEmoji(
                priority,
              )} ${priority.toUpperCase()}`,
              `**Assignees:** ${
                members.length > 0
                  ? members
                      .map(
                        (member) =>
                          member.username || member.email || member.name,
                      )
                      .join(", ")
                  : "None"
              }`,
              `**Labels:** ${labels.length > 0 ? labels.map((l) => l.name).join(", ") : "None"}`,
              `**Start Date:** ${startDate || "None"}`,
              `**Target Date:** ${targetDate || "None"}`,
              `**Description:** ${
                description.length > 100
                  ? description.substring(0, 97) + "..."
                  : description
              }`,
            ].join("\n"),
            inline: false,
          },
          {
            name: "🔗 Quick Actions",
            value: `[View in Plane](${issueUrl})`,
            inline: false,
          },
        )
        .setFooter({ text: `📅 Created: ${formatDate(issue.created_at)}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [successEmbed] });

      const mentions = await resolveDiscordMentions(interaction, members);
      if (mentions.length > 0) {
        await interaction.followUp({
          content: `Assigned Discord members: ${mentions.join(" ")}`,
        });
      }
    } catch (error) {
      logger.error("Error creating issue", error);

      const errorEmbed = new EmbedBuilder()
        .setTitle("❌ Failed to Create Issue")
        .setDescription(
          error.message ||
            "An unexpected error occurred while creating the issue.",
        )
        .setColor(0xdc2626)
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },
};
