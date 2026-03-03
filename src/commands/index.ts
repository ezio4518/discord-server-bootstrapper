import { Collection, Routes } from "discord.js";
import { REST } from "@discordjs/rest";

import { Logger } from "../lib/logger";
import { withRetry } from "../lib/retry";
import { addGameCommand } from "./addgame";
import { gamenightCommand } from "./gamenight";
import { pollCommand } from "./poll";
import { resultCommand } from "./result";
import { roomCommand } from "./room";
import { setupCommand } from "./setup";
import { CommandModule, CommandRegistry } from "./types";

const commandModules: CommandModule[] = [
  setupCommand,
  addGameCommand,
  pollCommand,
  gamenightCommand,
  resultCommand,
  roomCommand
];

export const createCommandRegistry = (): CommandRegistry => {
  const registry = new Collection<string, CommandModule>();
  for (const module of commandModules) {
    registry.set(module.data.name, module);
  }

  return registry;
};

interface RegisterGuildCommandsInput {
  clientId: string;
  guildId: string;
  token: string;
  logger: Logger;
}

export const registerGuildCommands = async ({
  clientId,
  guildId,
  token,
  logger
}: RegisterGuildCommandsInput): Promise<void> => {
  const rest = new REST({ version: "10" }).setToken(token);
  const body = commandModules.map((command) => command.data.toJSON());

  await withRetry(
    `register slash commands for guild ${guildId}`,
    async () => {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body
      });
    },
    logger
  );

  logger.info(`Registered ${body.length} guild slash commands`);
};

export { commandModules };
