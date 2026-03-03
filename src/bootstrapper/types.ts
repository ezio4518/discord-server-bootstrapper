import { Guild } from "discord.js";

export interface GuildState {
  roles: Record<string, string>;
  categories: Record<string, string>;
  channels: Record<string, string>;
  meta: Record<string, string>;
  tempRooms: {
    ownerToChannel: Record<string, string>;
    channelToOwner: Record<string, string>;
  };
}

export interface StateFile {
  guilds: Record<string, GuildState>;
}

export interface BootstrapContext {
  guild: Guild;
  guildState: GuildState;
}

export type BootstrapMode = "create" | "configure";

export interface BootstrapOptions {
  mode: BootstrapMode;
  guildId?: string;
  ownerUserId?: string;
  registerCommands?: boolean;
}
