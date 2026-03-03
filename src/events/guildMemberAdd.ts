import { GuildMember } from "discord.js";

import { Bootstrapper } from "../bootstrapper/bootstrapper";
import { Logger } from "../lib/logger";

export const createGuildMemberAddHandler = (bootstrapper: Bootstrapper, logger: Logger) => {
  return async (member: GuildMember) => {
    try {
      await bootstrapper.handleMemberJoin(member);
    } catch (error) {
      logger.error("GuildMemberAdd handler failed", {
        guildId: member.guild.id,
        userId: member.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };
};
