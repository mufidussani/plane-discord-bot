const { REST, Routes } = require("discord.js");
const fs = require("node:fs");
const path = require("node:path");
const config = require("./config/config");

const commands = [];
const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((file) => file.endsWith(".js"));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ("data" in command && "execute" in command) {
    commands.push(command.data.toJSON());
  }
}

const rest = new REST().setToken(config.DISCORD_TOKEN);

(async () => {
  try {
    console.log("Started refreshing application (/) commands.");

    // If a GUILD_ID is provided, register commands to that guild for instant propagation.
    // Otherwise fall back to global commands (may take up to 1 hour to update).
    if (process.env.GUILD_ID) {
      console.log("Registering commands to guild:", process.env.GUILD_ID);
      await rest.put(
        Routes.applicationGuildCommands(
          process.env.CLIENT_ID,
          process.env.GUILD_ID,
        ),
        { body: commands },
      );
    } else {
      console.log(
        "Registering global application commands (may take up to 1 hour to propagate)",
      );
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
        body: commands,
      });
    }

    console.log("Successfully reloaded application (/) commands.");
  } catch (error) {
    console.error(error);
  }
})();
