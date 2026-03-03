import { Client, Events } from "discord.js";

import { Logger } from "../lib/logger";

export const createReadyHandler = (logger: Logger) => {
  return (client: Client<true>) => {
    logger.info(`Logged in as ${client.user.tag}`);
    logger.info(`Connected guild count: ${client.guilds.cache.size}`);
  };
};
