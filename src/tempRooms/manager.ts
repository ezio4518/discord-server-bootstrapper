import {
  ChannelType,
  Client,
  Guild,
  GuildMember,
  VoiceBasedChannel,
  VoiceChannel,
  VoiceState
} from "discord.js";

import { Bootstrapper } from "../bootstrapper/bootstrapper";
import { StateStore } from "../bootstrapper/stateStore";
import { Logger } from "../lib/logger";
import { withRetry } from "../lib/retry";

interface TempRoomManagerOptions {
  client: Client<true>;
  bootstrapper: Bootstrapper;
  stateStore: StateStore;
  logger: Logger;
}

interface ManualRoomInput {
  guild: Guild;
  member: GuildMember;
  roomName?: string;
  userLimit?: number;
}

const DELETE_DELAY_MS = 60_000;

const sanitizeRoomName = (name: string): string => {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return "Room";
  }

  return trimmed.slice(0, 100);
};

export class TempRoomManager {
  private readonly creationLocks = new Set<string>();
  private readonly deletionTimers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly options: TempRoomManagerOptions) {}

  async createManualRoom(input: ManualRoomInput): Promise<VoiceChannel> {
    const channel = await this.ensureTempRoom({
      guild: input.guild,
      member: input.member,
      roomName: input.roomName,
      userLimit: input.userLimit
    });

    await withRetry(
      "move member to manual temp room",
      () => input.member.voice.setChannel(channel),
      this.options.logger
    );

    return channel;
  }

  async handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
    const member = newState.member ?? oldState.member;
    if (!member || member.user.bot) {
      return;
    }

    const guild = newState.guild ?? oldState.guild;
    const guildState = this.options.bootstrapper.getGuildState(guild.id);

    const createRoomChannelId = guildState.channels.create_room;

    if (newState.channelId && newState.channelId === createRoomChannelId) {
      await this.ensureTempRoom({ guild, member });
    }

    if (oldState.channelId && guildState.tempRooms.channelToOwner[oldState.channelId]) {
      await this.scheduleDeleteIfEmpty(guild, oldState.channelId);
    }

    if (newState.channelId && guildState.tempRooms.channelToOwner[newState.channelId]) {
      this.cancelPendingDelete(newState.channelId);
    }
  }

  private async ensureTempRoom(params: {
    guild: Guild;
    member: GuildMember;
    roomName?: string;
    userLimit?: number;
  }): Promise<VoiceChannel> {
    const lockKey = `${params.guild.id}:${params.member.id}`;
    if (this.creationLocks.has(lockKey)) {
      const existing = await this.getUserTempRoom(params.guild, params.member.id);
      if (existing) {
        return existing;
      }

      throw new Error("Temporary room creation already in progress");
    }

    this.creationLocks.add(lockKey);

    try {
      const guildState = this.options.bootstrapper.getGuildState(params.guild.id);
      const existing = await this.getUserTempRoom(params.guild, params.member.id);
      if (existing) {
        await withRetry(
          "move member to existing temp room",
          () => params.member.voice.setChannel(existing),
          this.options.logger
        );
        return existing;
      }

      const voiceCategoryId = guildState.categories.voice;
      if (!voiceCategoryId) {
        throw new Error("Voice category ID is missing from bootstrap state.");
      }

      const resolvedName = sanitizeRoomName(params.roomName ?? `Room - ${params.member.user.username}`);
      const userLimit = params.userLimit ?? 0;

      const channel = await withRetry(
        "create temporary voice room",
        () =>
          params.guild.channels.create({
            name: resolvedName,
            type: ChannelType.GuildVoice,
            parent: voiceCategoryId,
            userLimit
          }),
        this.options.logger
      );

      if (channel.type !== ChannelType.GuildVoice) {
        throw new Error("Created temporary channel is not a voice channel");
      }

      guildState.tempRooms.ownerToChannel[params.member.id] = channel.id;
      guildState.tempRooms.channelToOwner[channel.id] = params.member.id;
      this.options.stateStore.save();

      await withRetry(
        "move member to temporary room",
        () => params.member.voice.setChannel(channel),
        this.options.logger
      );

      this.options.logger.info("Temporary room created", {
        guildId: params.guild.id,
        channelId: channel.id,
        ownerId: params.member.id
      });

      return channel;
    } finally {
      this.creationLocks.delete(lockKey);
    }
  }

  private async getUserTempRoom(guild: Guild, userId: string): Promise<VoiceChannel | null> {
    const guildState = this.options.bootstrapper.getGuildState(guild.id);
    const channelId = guildState.tempRooms.ownerToChannel[userId];
    if (!channelId) {
      return null;
    }

    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildVoice) {
      delete guildState.tempRooms.ownerToChannel[userId];
      if (channelId) {
        delete guildState.tempRooms.channelToOwner[channelId];
      }
      this.options.stateStore.save();
      return null;
    }

    return channel;
  }

  private async scheduleDeleteIfEmpty(guild: Guild, channelId: string): Promise<void> {
    const channel = (await guild.channels.fetch(channelId).catch(() => null)) as VoiceBasedChannel | null;
    if (!channel || channel.type !== ChannelType.GuildVoice || channel.members.size > 0) {
      return;
    }

    if (this.deletionTimers.has(channelId)) {
      return;
    }

    const timeout = setTimeout(async () => {
      this.deletionTimers.delete(channelId);

      const fresh = (await guild.channels.fetch(channelId).catch(() => null)) as VoiceBasedChannel | null;
      if (!fresh || fresh.type !== ChannelType.GuildVoice) {
        await this.cleanupDeletedChannelState(guild, channelId);
        return;
      }

      if (fresh.members.size > 0) {
        return;
      }

      await withRetry(
        "delete empty temporary voice room",
        () => fresh.delete("Temporary room cleanup"),
        this.options.logger
      ).catch((error) => {
        this.options.logger.warn("Failed to delete temporary channel", {
          channelId,
          error: error instanceof Error ? error.message : String(error)
        });
      });

      await this.cleanupDeletedChannelState(guild, channelId);
      this.options.logger.info("Deleted empty temporary room", {
        guildId: guild.id,
        channelId
      });
    }, DELETE_DELAY_MS);

    this.deletionTimers.set(channelId, timeout);
  }

  private cancelPendingDelete(channelId: string): void {
    const timer = this.deletionTimers.get(channelId);
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    this.deletionTimers.delete(channelId);
  }

  private async cleanupDeletedChannelState(guild: Guild, channelId: string): Promise<void> {
    const guildState = this.options.bootstrapper.getGuildState(guild.id);
    const ownerId = guildState.tempRooms.channelToOwner[channelId];

    if (ownerId) {
      delete guildState.tempRooms.ownerToChannel[ownerId];
    }
    delete guildState.tempRooms.channelToOwner[channelId];

    this.options.stateStore.save();
  }
}
