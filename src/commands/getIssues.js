const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const logger = require("../utils/logger");
const {
  getPriorityEmoji,
  formatState,
  formatDate,
  getIssueUrl,
} = require("../utils/utils");

const MAX_AUTOCOMPLETE_CHOICES = 25;

function formatAutocompleteChoice(member) {
  const secondary = member.username || member.email || member.id;
  const label = `${member.name} (${secondary})`;
  return label.length > 100 ? `${label.slice(0, 97)}...` : label;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("get-issues")
    .setDescription("Get a list of issues")
    .addStringOption((option) =>
      option
        .setName("state")
        .setDescription("Filter by state")
        .setRequired(false)
        .addChoices(
          { name: "Backlog", value: "backlog" },
          { name: "Todo", value: "unstarted" },
          { name: "In Progress", value: "started" },
          { name: "Done", value: "completed" },
          { name: "Cancelled", value: "cancelled" },
        ),
    )
    .addStringOption((option) =>
      option
        .setName("priority")
        .setDescription("Filter by priority")
        .setRequired(false)
        .addChoices(
          { name: "Urgent", value: "urgent" },
          { name: "High", value: "high" },
          { name: "Medium", value: "medium" },
          { name: "Low", value: "low" },
        ),
    )
    .addStringOption((option) =>
      option
        .setName("assignee")
        .setDescription(
          "Filter by assignee (search member by name/username/email)",
        )
        .setAutocomplete(true)
        .setRequired(false),
    ),

  async autocomplete(interaction, { planeService, channelConfig }) {
    try {
      if (!planeService || !channelConfig) {
        await interaction.respond([]);
        return;
      }

      const focused = interaction.options.getFocused(true);
      if (focused.name !== "assignee") {
        await interaction.respond([]);
        return;
      }

      const members = await planeService.searchProjectMembers(
        String(focused.value || "").trim(),
        [],
        MAX_AUTOCOMPLETE_CHOICES,
      );

      await interaction.respond(
        members
          .map((member) => ({
            name: formatAutocompleteChoice(member),
            value: member.id,
          }))
          .slice(0, MAX_AUTOCOMPLETE_CHOICES),
      );
    } catch (error) {
      logger.error("Error handling issue assignee autocomplete", error);
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
      const state = interaction.options.getString("state");
      const priority = interaction.options.getString("priority");
      const assignee = interaction.options.getString("assignee")?.trim() || "";

      const assigneeInputs = assignee
        ? assignee
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
        : [];
      const { assigneeIds, members } =
        await planeService.resolveProjectAssigneesWithMembers(assigneeInputs);

      logger.info("Getting issues command initiated", {
        user: interaction.user.tag,
        guild: interaction.guild?.name,
        workspace: channelConfig.workspaceSlug,
        project: channelConfig.projectId,
        filters: {
          state,
          priority,
          assignee: assigneeIds.length > 0 ? assigneeIds : undefined,
        },
      });

      // Show progress
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("⏳ Fetching Issues...")
            .setDescription("Please wait while the issues are being fetched.")
            .setColor(0xfbbf24)
            .setTimestamp(),
        ],
      });

      const response = await planeService.getAllIssues({
        state,
        priority,
        assigneeIds,
      });

      if (!response.results || response.results.length === 0) {
        logger.info("No issues found", {
          filters: { state, priority, assignee: assigneeIds },
        });
        const noIssuesEmbed = new EmbedBuilder()
          .setTitle("📋 No Issues Found")
          .setDescription(
            "No issues match your criteria. Try different filters or create a new issue.",
          )
          .setColor(0x6b7280)
          .setTimestamp();

        await interaction.editReply({ embeds: [noIssuesEmbed] });
        return;
      }

      logger.info("Issues fetched successfully", {
        count: response.results.length,
        totalCount: response.count,
      });

      // Create the main embed
      const issuesEmbed = new EmbedBuilder()
        .setTitle("📋 Issues List")
        .setColor(0x3b82f6)
        .setTimestamp();

      // Add summary field
      issuesEmbed.addFields({
        name: "Summary",
        value: `Showing ${response.results.length} of ${response.count} issues${
          members.length > 0
            ? ` for ${members.map((member) => member.username || member.email || member.name).join(", ")}`
            : ""
        }`,
        inline: false,
      });

      // Add each issue as a field
      response.results.forEach((issue) => {
        const issueUrl = getIssueUrl(
          planeService.config.WORKSPACE_SLUG,
          planeService.config.PROJECT_ID,
          issue.id,
        );
        const priorityEmoji = getPriorityEmoji(issue.priority);
        const stateText = formatState(
          issue.state_detail?.name,
          issue.state_detail?.group,
        );

        issuesEmbed.addFields({
          name: `${issue.formatted_id} ${issue.name}`,
          value: [
            `**Priority:** ${priorityEmoji} ${
              issue.priority?.toUpperCase() || "None"
            }`,
            `**State:** ${stateText}`,
            `**Created:** ${formatDate(issue.created_at)}`,
            `[View in Plane](${issueUrl})`,
          ].join("\n"),
          inline: false,
        });
      });

      await interaction.editReply({ embeds: [issuesEmbed] });
    } catch (error) {
      logger.error("Error fetching issues", error);

      const errorEmbed = new EmbedBuilder()
        .setTitle("❌ Failed to Fetch Issues")
        .setDescription(
          error.message ||
            "An unexpected error occurred while fetching issues.",
        )
        .setColor(0xdc2626)
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },
};
