import {
  ButtonInteraction,
  ChatInputCommandInteraction,
  Client,
  Collection
} from "discord.js";

import { Bootstrapper } from "../bootstrapper/bootstrapper";
import { Logger } from "../lib/logger";
import { TempRoomManager } from "../tempRooms/manager";

export interface CommandContext {
  client: Client<true>;
  interaction: ChatInputCommandInteraction;
  bootstrapper: Bootstrapper;
  tempRoomManager: TempRoomManager;
  gameNightVotes: GameNightVoteStore;
  logger: Logger;
}

export interface GameNightVoteStore {
  initializeMessage(messageId: string): void;
  handleVote(interaction: ButtonInteraction, choice: "going" | "maybe" | "cant"): Promise<void>;
}

export interface CommandModule {
  data: {
    name: string;
    toJSON(): unknown;
  };
  execute(context: CommandContext): Promise<void>;
}

export type CommandRegistry = Collection<string, CommandModule>;
