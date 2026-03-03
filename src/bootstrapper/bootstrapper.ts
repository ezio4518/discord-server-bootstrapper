import {
  ChannelType,
  Client,
  Guild,
  GuildDefaultMessageNotifications,
  GuildExplicitContentFilter,
  GuildMember,
  TextChannel,
  GuildVerificationLevel
} from "discord.js";

import { registerGuildCommands } from "../commands";
import { Logger } from "../lib/logger";
import { withRetry } from "../lib/retry";
import { buildStarterContent } from "./starterContent";
import { ServerConfig } from "./schema";
import { ResourceManager } from "./resourceManager";
import { StateStore } from "./stateStore";
import { BootstrapMode, BootstrapOptions, GuildState } from "./types";

interface BootstrapperOptions {
  client: Client<true>;
  serverConfig: ServerConfig;
  stateStore: StateStore;
  logger: Logger;
  clientId: string;
  botToken: string;
}

export class Bootstrapper {
  private readonly guildLocks = new Set<string>();

  constructor(private readonly options: BootstrapperOptions) {}

  async bootstrap(options: BootstrapOptions): Promise<{ guild: Guild; manager: ResourceManager }> {
    const guild = await this.resolveGuild(options.mode, options.guildId);
    return this.bootstrapGuild(guild, {
      ownerUserId: options.ownerUserId,
      registerCommands: options.registerCommands ?? true
    });
  }

  async bootstrapGuild(
    guild: Guild,
    options: { ownerUserId?: string; registerCommands?: boolean } = {}
  ): Promise<{ guild: Guild; manager: ResourceManager }> {
    const lockKey = guild.id;
    if (this.guildLocks.has(lockKey)) {
      throw new Error(`Bootstrap already in progress for guild ${guild.id}`);
    }

    this.guildLocks.add(lockKey);

    try {
      return await this.bootstrapGuildUnsafe(guild, {
        ownerUserId: options.ownerUserId,
        registerCommands: options.registerCommands ?? true
      });
    } finally {
      this.guildLocks.delete(lockKey);
    }
  }

  getGuildState(guildId: string): GuildState {
    return this.options.stateStore.getGuildState(guildId);
  }

  async handleMemberJoin(member: GuildMember): Promise<void> {
    const guildState = this.options.stateStore.getGuildState(member.guild.id);
    const targetRoleId = member.user.bot ? guildState.roles.bots : guildState.roles.member;

    if (!targetRoleId) {
      return;
    }

    if (member.roles.cache.has(targetRoleId)) {
      return;
    }

    await withRetry(
      `assign ${member.user.bot ? "Bots" : "Member"} role on join`,
      () => member.roles.add(targetRoleId),
      this.options.logger
    ).catch((error) => {
      this.options.logger.warn("Failed to assign default role on member join", {
        guildId: member.guild.id,
        userId: member.id,
        roleId: targetRoleId,
        error: error instanceof Error ? error.message : String(error)
      });
    });
  }

  private async resolveGuild(mode: BootstrapMode, guildId?: string): Promise<Guild> {
    if (mode === "create") {
      this.options.logger.info("Mode A selected: create new server");
      const created = await this.tryCreateGuild();
      if (created) {
        return created;
      }

      if (!guildId) {
        throw new Error(
          "Guild creation failed and no GUILD_ID was provided for fallback configure mode"
        );
      }

      this.options.logger.warn("Falling back to configure existing server mode");
      return this.fetchExistingGuild(guildId);
    }

    if (!guildId) {
      throw new Error("GUILD_ID is required for configure mode");
    }

    this.options.logger.info("Mode B selected: configure existing server");
    return this.fetchExistingGuild(guildId);
  }

  private async tryCreateGuild(): Promise<Guild | null> {
    if (this.options.client.guilds.cache.size >= 10) {
      this.options.logger.warn(
        "Bot is in 10 or more guilds; Discord may reject guild creation for this application"
      );
    }

    try {
      const guild = await withRetry(
        `create guild ${this.options.serverConfig.serverName}`,
        () => this.options.client.guilds.create({ name: this.options.serverConfig.serverName }),
        this.options.logger
      );
      this.options.logger.info(`Created guild ${guild.name} (${guild.id})`);
      return guild;
    } catch (error) {
      this.options.logger.warn("Guild creation failed", {
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  private async fetchExistingGuild(guildId: string): Promise<Guild> {
    const guild = await withRetry(
      `fetch guild ${guildId}`,
      () => this.options.client.guilds.fetch(guildId),
      this.options.logger
    );

    return guild;
  }

  private async bootstrapGuildUnsafe(
    guild: Guild,
    options: { ownerUserId?: string; registerCommands: boolean }
  ): Promise<{ guild: Guild; manager: ResourceManager }> {
    const guildState = this.options.stateStore.getGuildState(guild.id);
    const manager = new ResourceManager(guild, guildState, this.options.logger);

    this.options.logger.info(`Bootstrapping guild ${guild.name} (${guild.id})`);
    await this.applyGuildDefaults(guild);

    for (const roleConfig of this.options.serverConfig.roles) {
      await manager.ensureRole(roleConfig);
    }
    await manager.ensureRoleOrdering(this.options.serverConfig.roles);

    await this.assignOwnerRole(guild, guildState, options.ownerUserId);
    await this.assignBotRole(guild, guildState);

    for (const [categoryIndex, categoryConfig] of this.options.serverConfig.categories.entries()) {
      const category = await manager.ensureCategory(categoryConfig, categoryIndex);

      for (const [channelIndex, channelConfig] of categoryConfig.channels.entries()) {
        await manager.ensureChannel(category, channelConfig, channelIndex);
      }
    }

    await this.pruneObsoleteChannels(guild, guildState);

    guildState.meta.voiceCategoryId = manager.getVoiceCategoryId() ?? "";
    guildState.meta.createRoomChannelId = manager.getCreateRoomChannelId() ?? "";

    await manager.setAfkChannel("afk");
    await manager.ensureEmojis(this.options.serverConfig.emojis);
    await this.seedStarterMessages(guild, guildState);

    this.options.stateStore.save();

    if (options.registerCommands) {
      await registerGuildCommands({
        clientId: this.options.clientId,
        guildId: guild.id,
        token: this.options.botToken,
        logger: this.options.logger
      });
    }

    this.options.logger.info(`Bootstrap completed for guild ${guild.id}`);

    return { guild, manager };
  }

  private async applyGuildDefaults(guild: Guild): Promise<void> {
    await withRetry(
      "apply guild safety defaults",
      () =>
        guild.edit({
          verificationLevel: GuildVerificationLevel.Medium,
          explicitContentFilter: GuildExplicitContentFilter.AllMembers,
          defaultMessageNotifications: GuildDefaultMessageNotifications.OnlyMentions
        }),
      this.options.logger
    ).catch((error) => {
      this.options.logger.warn("Failed to apply guild safety defaults", {
        error: error instanceof Error ? error.message : String(error)
      });
    });
  }

  private async seedStarterMessages(guild: Guild, guildState: GuildState): Promise<void> {
    const genericStarterContent: Record<string, string> = {};
    for (const categoryConfig of this.options.serverConfig.categories) {
      for (const channelConfig of categoryConfig.channels) {
        if (channelConfig.type !== "GUILD_TEXT") {
          continue;
        }

        const prettyName = channelConfig.name
          .replace(/-/g, " ")
          .replace(/\b\w/g, (match) => match.toUpperCase());

        genericStarterContent[channelConfig.key] = `# ${prettyName}\nUse this channel for ${channelConfig.name.replace(/-/g, " ")}.`;
      }
    }

    const starterContent = {
      ...genericStarterContent,
      ...buildStarterContent(guildState)
    };

    for (const [channelKey, content] of Object.entries(starterContent)) {
      const channelId = guildState.channels[channelKey];
      if (!channelId) {
        continue;
      }

      const fetchedChannel = await guild.channels.fetch(channelId).catch(() => null);
      if (!fetchedChannel || fetchedChannel.type !== ChannelType.GuildText) {
        continue;
      }

      const channel = fetchedChannel as TextChannel;
      const metaKey = `seedMessage:${channelKey}`;
      const knownMessageId = guildState.meta[metaKey];

      let shouldCreate = true;

      if (knownMessageId) {
        const existing = await channel.messages.fetch(knownMessageId).catch(() => null);
        if (existing) {
          shouldCreate = false;
          if (existing.content !== content) {
            await withRetry(
              `update starter message in #${channel.name}`,
              () => existing.edit(content),
              this.options.logger
            );
            this.options.logger.info(`Updated starter message in #${channel.name}`);
          }
        }
      }

      if (!shouldCreate) {
        continue;
      }

      if (!knownMessageId) {
        const recentMessages = await channel.messages.fetch({ limit: 1 }).catch(() => null);
        if (recentMessages && recentMessages.size > 0) {
          continue;
        }
      }

      const sent = await withRetry(
        `create starter message in #${channel.name}`,
        () => channel.send(content),
        this.options.logger
      ).catch((error) => {
        this.options.logger.warn(`Failed seeding starter message in #${channel.name}`, {
          error: error instanceof Error ? error.message : String(error)
        });
        return null;
      });

      if (!sent) {
        continue;
      }

      guildState.meta[metaKey] = sent.id;
      this.options.logger.info(`Seeded starter message in #${channel.name}`);
    }
  }

  private async pruneObsoleteChannels(guild: Guild, guildState: GuildState): Promise<void> {
    const configuredChannelKeys = new Set(
      this.options.serverConfig.categories.flatMap((category) =>
        category.channels.map((channel) => channel.key)
      )
    );

    for (const [channelKey, channelId] of Object.entries({ ...guildState.channels })) {
      if (configuredChannelKeys.has(channelKey)) {
        continue;
      }

      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (channel) {
        await withRetry(
          `delete obsolete channel ${channel.name}`,
          async () => {
            await channel.delete("Channel removed from server.json config");
          },
          this.options.logger
        ).catch((error) => {
          this.options.logger.warn(`Failed deleting obsolete channel ${channel.name}`, {
            error: error instanceof Error ? error.message : String(error)
          });
        });
      }

      delete guildState.channels[channelKey];
      delete guildState.meta[`seedMessage:${channelKey}`];
      this.options.logger.info(`Removed stale state for channel key ${channelKey}`);
    }
  }

  private async assignOwnerRole(
    guild: Guild,
    guildState: GuildState,
    ownerUserId?: string
  ): Promise<void> {
    if (!ownerUserId) {
      return;
    }

    const ownerRoleId = guildState.roles.owner;
    if (!ownerRoleId) {
      this.options.logger.warn("Owner role missing from state; skipping OWNER_USER_ID assignment");
      return;
    }

    const member = await guild.members.fetch(ownerUserId).catch(() => null);
    if (!member) {
      this.options.logger.warn("OWNER_USER_ID is not a member of this guild");
      return;
    }

    if (!member.roles.cache.has(ownerRoleId)) {
      await withRetry(
        "assign owner role",
        () => member.roles.add(ownerRoleId),
        this.options.logger
      );
      this.options.logger.info(`Assigned Owner role to ${ownerUserId}`);
    }
  }

  private async assignBotRole(guild: Guild, guildState: GuildState): Promise<void> {
    const botsRoleId = guildState.roles.bots;
    if (!botsRoleId) {
      this.options.logger.warn("Bots role missing from state; skipping bot role assignment");
      return;
    }

    const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
    if (!me) {
      this.options.logger.warn("Could not fetch bot member for role assignment");
      return;
    }

    if (!me.roles.cache.has(botsRoleId)) {
      await withRetry(
        "assign Bots role to bot member",
        () => me.roles.add(botsRoleId),
        this.options.logger
      );
      this.options.logger.info("Assigned Bots role to the bot account");
    }
  }
}
