import fs from "node:fs";
import path from "node:path";

import {
  CategoryChannel,
  ChannelType,
  Guild,
  GuildBasedChannel,
  OverwriteResolvable,
  Role,
  Snowflake,
  VoiceChannel
} from "discord.js";

import { Logger } from "../lib/logger";
import { resolvePermissionBits } from "../lib/permissions";
import { withRetry } from "../lib/retry";
import {
  CategoryConfig,
  ChannelConfig,
  EmojiConfig,
  PermissionOverwriteConfig,
  RoleConfig
} from "./schema";
import { GuildState } from "./types";

type ManagedChannelType = ChannelType.GuildText | ChannelType.GuildVoice;

const toDiscordChannelType = (kind: ChannelConfig["type"]): ManagedChannelType => {
  if (kind === "GUILD_TEXT") {
    return ChannelType.GuildText;
  }

  return ChannelType.GuildVoice;
};

const toColorInt = (color?: string): number => {
  if (!color) {
    return 0;
  }

  return Number.parseInt(color.replace("#", ""), 16);
};

const toRoleColors = (
  color?: string
): { primaryColor: number; secondaryColor?: number; tertiaryColor?: number } | undefined => {
  if (!color) {
    return undefined;
  }

  return { primaryColor: toColorInt(color) };
};

export class ResourceManager {
  constructor(
    private readonly guild: Guild,
    private readonly guildState: GuildState,
    private readonly logger: Logger
  ) {}

  getState(): GuildState {
    return this.guildState;
  }

  async ensureRole(roleConfig: RoleConfig): Promise<Role> {
    const stateRoleId = this.guildState.roles[roleConfig.key];

    let role: Role | null = null;

    if (stateRoleId) {
      const fetched = await this.guild.roles.fetch(stateRoleId).catch(() => null);
      if (fetched && !this.isManagedOrUneditable(fetched)) {
        role = fetched;
      } else if (fetched) {
        this.logger.warn(`State role for ${roleConfig.name} is managed/uneditable; resolving fallback`, {
          roleId: fetched.id
        });
      }
    }

    if (!role) {
      role =
        this.guild.roles.cache.find(
          (candidate) => candidate.name === roleConfig.name && !this.isManagedOrUneditable(candidate)
        ) ?? null;
    }

    const permissions = resolvePermissionBits(roleConfig.permissions);

    if (!role) {
      role = await this.createRole(roleConfig, permissions);
      this.logger.info(`Created role ${roleConfig.name}`);
    } else {
      let replaced = false;
      try {
        await withRetry(
          `update role ${roleConfig.name}`,
          () =>
            role!.edit({
              name: roleConfig.name,
              colors: toRoleColors(roleConfig.color),
              hoist: roleConfig.hoist,
              mentionable: roleConfig.mentionable,
              permissions
            }),
          this.logger
        );
      } catch (error) {
        this.logger.warn(`Updating role ${roleConfig.name} failed; creating replacement role`, {
          error: error instanceof Error ? error.message : String(error)
        });
        role = await this.createRole(roleConfig, permissions);
        replaced = true;
      }
      this.logger.info(`${replaced ? "Replaced" : "Updated"} role ${roleConfig.name}`);
    }

    this.guildState.roles[roleConfig.key] = role.id;

    return role;
  }

  private async createRole(roleConfig: RoleConfig, permissions: bigint[]): Promise<Role> {
    return withRetry(
      `create role ${roleConfig.name}`,
      () =>
        this.guild.roles.create({
          name: roleConfig.name,
          colors: toRoleColors(roleConfig.color),
          hoist: roleConfig.hoist,
          mentionable: roleConfig.mentionable,
          permissions
        }),
      this.logger
    );
  }

  private isManagedOrUneditable(role: Role): boolean {
    return role.managed || !role.editable;
  }

  async ensureRoleOrdering(roleConfigs: RoleConfig[]): Promise<void> {
    const createdRoles = roleConfigs
      .map((config) => this.guild.roles.cache.get(this.guildState.roles[config.key]))
      .filter((role): role is Role => Boolean(role));

    if (createdRoles.length !== roleConfigs.length) {
      this.logger.warn("Skipping role ordering because one or more role IDs are missing in state");
      return;
    }

    const desiredBottomToTop = createdRoles.slice().reverse();
    const positions = desiredBottomToTop.map((role, index) => ({
      role: role.id,
      position: 1 + index
    }));

    await withRetry(
      "set role positions",
      () => this.guild.roles.setPositions(positions),
      this.logger
    ).catch((error) => {
      this.logger.warn("Could not set exact role positions", {
        error: error instanceof Error ? error.message : String(error)
      });
    });
  }

  async ensureCategory(categoryConfig: CategoryConfig, position: number): Promise<CategoryChannel> {
    const savedId = this.guildState.categories[categoryConfig.key];

    let category: CategoryChannel | null = null;

    if (savedId) {
      const fetched = await this.guild.channels.fetch(savedId).catch(() => null);
      if (fetched && fetched.type === ChannelType.GuildCategory) {
        category = fetched;
      }
    }

    if (!category) {
      category =
        this.guild.channels.cache.find(
          (channel): channel is CategoryChannel =>
            channel.type === ChannelType.GuildCategory && channel.name === categoryConfig.name
        ) ?? null;
    }

    const permissionOverwrites = this.resolvePermissionOverwrites(categoryConfig.permissionOverwrites);

    if (!category) {
      category = await withRetry(
        `create category ${categoryConfig.name}`,
        () =>
          this.guild.channels.create({
            name: categoryConfig.name,
            type: ChannelType.GuildCategory,
            permissionOverwrites,
            position
          }),
        this.logger
      );
      this.logger.info(`Created category ${categoryConfig.name}`);
    } else {
      await withRetry(
        `update category ${categoryConfig.name}`,
        () =>
          category!.edit({
            name: categoryConfig.name,
            position,
            permissionOverwrites
          }),
        this.logger
      );
      this.logger.info(`Updated category ${categoryConfig.name}`);
    }

    this.guildState.categories[categoryConfig.key] = category.id;
    return category;
  }

  async ensureChannel(
    category: CategoryChannel,
    channelConfig: ChannelConfig,
    position: number
  ): Promise<GuildBasedChannel> {
    const savedId = this.guildState.channels[channelConfig.key];
    const targetType = toDiscordChannelType(channelConfig.type);

    let channel: GuildBasedChannel | null = null;

    if (savedId) {
      const fetched = await this.guild.channels.fetch(savedId).catch(() => null);
      if (fetched && fetched.type === targetType) {
        channel = fetched;
      }
    }

    if (!channel) {
      channel =
        this.guild.channels.cache.find(
          (candidate) =>
            candidate.type === targetType &&
            candidate.name === channelConfig.name &&
            candidate.parentId === category.id
        ) ?? null;
    }

    const permissionOverwrites = this.resolvePermissionOverwrites(channelConfig.permissionOverwrites);

    const baseOptions = {
      name: channelConfig.name,
      parent: category.id,
      position,
      permissionOverwrites
    };

    if (!channel) {
      if (channelConfig.type === "GUILD_TEXT") {
        channel = await withRetry(
          `create channel ${channelConfig.name}`,
          () =>
            this.guild.channels.create({
              ...baseOptions,
              type: ChannelType.GuildText,
              topic: channelConfig.topic,
              rateLimitPerUser: channelConfig.slowmode ?? 0
            }),
          this.logger
        );
      } else {
        channel = await withRetry(
          `create channel ${channelConfig.name}`,
          () =>
            this.guild.channels.create({
              ...baseOptions,
              type: ChannelType.GuildVoice,
              userLimit: channelConfig.userLimit ?? 0
            }),
          this.logger
        );
      }
      this.logger.info(`Created channel ${channelConfig.name}`);
    } else {
      const existingChannel = channel;
      await withRetry(
        `update channel ${channelConfig.name}`,
        async () => {
          if (channelConfig.type === "GUILD_TEXT" && existingChannel.type === ChannelType.GuildText) {
            await existingChannel.edit({
              ...baseOptions,
              topic: channelConfig.topic,
              rateLimitPerUser: channelConfig.slowmode ?? 0
            });
            return;
          }

          if (channelConfig.type === "GUILD_VOICE" && existingChannel.type === ChannelType.GuildVoice) {
            await existingChannel.edit({
              ...baseOptions,
              userLimit: channelConfig.userLimit ?? 0
            });
            return;
          }

          await existingChannel.edit(baseOptions);
        },
        this.logger
      );
      this.logger.info(`Updated channel ${channelConfig.name}`);
    }

    this.guildState.channels[channelConfig.key] = channel.id;
    return channel;
  }

  async ensureEmojis(emojis: EmojiConfig[]): Promise<void> {
    for (const emoji of emojis) {
      const existing = this.guild.emojis.cache.find((candidate) => candidate.name === emoji.name);
      if (existing) {
        continue;
      }

      const attachment = this.resolveEmojiSource(emoji.source);
      await withRetry(
        `create emoji ${emoji.name}`,
        () =>
          this.guild.emojis.create({
            name: emoji.name,
            attachment
          }),
        this.logger
      ).catch((error) => {
        this.logger.warn(`Failed to create emoji ${emoji.name}`, {
          error: error instanceof Error ? error.message : String(error)
        });
      });
    }
  }

  async setAfkChannel(channelKey: string, timeoutSeconds = 300): Promise<void> {
    const channelId = this.guildState.channels[channelKey];
    if (!channelId) {
      this.logger.warn(`AFK channel key ${channelKey} not found in state`);
      return;
    }

    const afkChannel = await this.guild.channels.fetch(channelId).catch(() => null);
    if (!afkChannel || afkChannel.type !== ChannelType.GuildVoice) {
      this.logger.warn("Configured AFK channel is missing or not voice");
      return;
    }

    await withRetry(
      "set guild AFK settings",
      () =>
        this.guild.edit({
          afkChannel,
          afkTimeout: timeoutSeconds
        }),
      this.logger
    );
  }

  resolvePermissionOverwrites(
    overwriteConfigs: PermissionOverwriteConfig[] | undefined
  ): OverwriteResolvable[] | undefined {
    if (!overwriteConfigs || overwriteConfigs.length === 0) {
      return undefined;
    }

    return overwriteConfigs.map((overwriteConfig) => {
      const id = this.resolveTargetId(overwriteConfig.target);

      return {
        id,
        allow: resolvePermissionBits(overwriteConfig.allow),
        deny: resolvePermissionBits(overwriteConfig.deny)
      };
    });
  }

  private resolveTargetId(target: string): Snowflake {
    if (target === "@everyone") {
      return this.guild.id;
    }

    const roleFromState = this.guildState.roles[target];
    if (roleFromState) {
      return roleFromState;
    }

    const byName = this.guild.roles.cache.find((role) => role.name === target);
    if (byName) {
      return byName.id;
    }

    throw new Error(`Cannot resolve permission target: ${target}`);
  }

  private resolveEmojiSource(source: string): string {
    if (source.startsWith("http://") || source.startsWith("https://") || source.startsWith("data:")) {
      return source;
    }

    const resolved = path.isAbsolute(source) ? source : path.join(process.cwd(), source);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Emoji source file does not exist: ${resolved}`);
    }

    return resolved;
  }

  getVoiceCategoryId(): string | null {
    return this.guildState.categories.voice ?? null;
  }

  getCreateRoomChannelId(): string | null {
    return this.guildState.channels.create_room ?? null;
  }

  getChannelIdByKey(key: string): string | null {
    return this.guildState.channels[key] ?? null;
  }

  async getVoiceChannelByKey(key: string): Promise<VoiceChannel | null> {
    const channelId = this.getChannelIdByKey(key);
    if (!channelId) {
      return null;
    }

    const channel = await this.guild.channels.fetch(channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildVoice) {
      return null;
    }

    return channel;
  }
}
