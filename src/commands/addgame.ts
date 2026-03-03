import {
  CategoryChannel,
  ChannelType,
  Guild,
  PermissionFlagsBits,
  SlashCommandBuilder
} from "discord.js";

import { withRetry } from "../lib/retry";
import { CommandContext, CommandModule } from "./types";

const toTextChannelName = (raw: string): string =>
  raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);

const toVoiceChannelName = (raw: string): string => `${raw.trim().slice(0, 72)} Room`;

const resolveCategory = async (
  guild: Guild,
  preferredId: string | undefined,
  fallbackNameFragment: string
): Promise<CategoryChannel | null> => {
  if (preferredId) {
    const byId = await guild.channels.fetch(preferredId).catch(() => null);
    if (byId && byId.type === ChannelType.GuildCategory) {
      return byId;
    }
  }

  return (
    guild.channels.cache.find(
      (channel): channel is CategoryChannel =>
        channel.type === ChannelType.GuildCategory &&
        channel.name.toLowerCase().includes(fallbackNameFragment.toLowerCase())
    ) ?? null
  );
};

export const addGameCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName("addgame")
    .setDescription("Create channels for a new game under GAMES and VOICE")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("Game name, e.g. Rocket League")
        .setRequired(true)
        .setMaxLength(60)
    )
    .addBooleanOption((option) =>
      option
        .setName("create_voice")
        .setDescription("Create a voice room for this game (default: true)")
        .setRequired(false)
    )
    .addIntegerOption((option) =>
      option
        .setName("voice_limit")
        .setDescription("Optional user limit for voice room")
        .setRequired(false)
        .setMinValue(0)
        .setMaxValue(99)
    ),

  async execute({ bootstrapper, interaction, logger }: CommandContext): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({ ephemeral: true, content: "This command is guild-only." });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const gameNameRaw = interaction.options.getString("name", true);
    const createVoice = interaction.options.getBoolean("create_voice") ?? true;
    const voiceLimit = interaction.options.getInteger("voice_limit") ?? 0;

    const textName = toTextChannelName(gameNameRaw);
    if (!textName) {
      await interaction.editReply("Invalid game name. Use letters/numbers and spaces.");
      return;
    }

    const voiceName = toVoiceChannelName(gameNameRaw);
    const guildState = bootstrapper.getGuildState(interaction.guild.id);

    const gamesCategory = await resolveCategory(interaction.guild, guildState.categories.games, "games");
    const voiceCategory = await resolveCategory(interaction.guild, guildState.categories.voice, "voice");

    if (!gamesCategory) {
      await interaction.editReply("Could not find the GAMES category. Run `/setup` first.");
      return;
    }

    if (createVoice && !voiceCategory) {
      await interaction.editReply("Could not find the VOICE category. Run `/setup` first.");
      return;
    }

    const existingText = interaction.guild.channels.cache.find(
      (channel) =>
        channel.type === ChannelType.GuildText &&
        channel.parentId === gamesCategory.id &&
        channel.name === textName
    );

    const textChannel =
      existingText ??
      (await withRetry(
        `create game text channel ${textName}`,
        () =>
          interaction.guild!.channels.create({
            name: textName,
            type: ChannelType.GuildText,
            parent: gamesCategory.id
          }),
        logger
      ));

    let voiceChannelMention = "(not requested)";

    if (createVoice && voiceCategory) {
      const existingVoice = interaction.guild.channels.cache.find(
        (channel) =>
          channel.type === ChannelType.GuildVoice &&
          channel.parentId === voiceCategory.id &&
          channel.name === voiceName
      );

      const voiceChannel =
        existingVoice ??
        (await withRetry(
          `create game voice channel ${voiceName}`,
          () =>
            interaction.guild!.channels.create({
              name: voiceName,
              type: ChannelType.GuildVoice,
              parent: voiceCategory.id,
              userLimit: voiceLimit
            }),
          logger
        ));

      voiceChannelMention = `<#${voiceChannel.id}>`;
    }

    await interaction.editReply(
      `Game channels ready. Text: <#${textChannel.id}> | Voice: ${voiceChannelMention}`
    );
  }
};
