import { Client, Events } from "discord.js";

import { Bootstrapper } from "../bootstrapper/bootstrapper";
import { Logger } from "../lib/logger";
import { TempRoomManager } from "../tempRooms/manager";
import { CommandRegistry, GameNightVoteStore } from "../commands/types";
import { createGuildMemberAddHandler } from "./guildMemberAdd";
import { createInteractionCreateHandler } from "./interactionCreate";
import { createReadyHandler } from "./ready";
import { createVoiceStateUpdateHandler } from "./voiceStateUpdate";

interface RegisterEventsInput {
  client: Client<true>;
  commands: CommandRegistry;
  bootstrapper: Bootstrapper;
  tempRoomManager: TempRoomManager;
  gameNightVotes: GameNightVoteStore;
  logger: Logger;
}

export const registerEvents = ({
  client,
  commands,
  bootstrapper,
  tempRoomManager,
  gameNightVotes,
  logger
}: RegisterEventsInput): void => {
  client.on(
    Events.InteractionCreate,
    createInteractionCreateHandler({
      commands,
      bootstrapper,
      tempRoomManager,
      gameNightVotes,
      logger
    })
  );

  client.on(Events.VoiceStateUpdate, createVoiceStateUpdateHandler(tempRoomManager, logger));
  client.on(Events.GuildMemberAdd, createGuildMemberAddHandler(bootstrapper, logger));
  client.once(Events.ClientReady, createReadyHandler(logger));
};
