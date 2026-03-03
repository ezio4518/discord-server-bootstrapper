import { Events, VoiceState } from "discord.js";

import { Logger } from "../lib/logger";
import { TempRoomManager } from "../tempRooms/manager";

export const createVoiceStateUpdateHandler = (
  tempRoomManager: TempRoomManager,
  logger: Logger
) => {
  return async (oldState: VoiceState, newState: VoiceState) => {
    try {
      await tempRoomManager.handleVoiceStateUpdate(oldState, newState);
    } catch (error) {
      logger.error("Voice state handler failed", {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };
};
