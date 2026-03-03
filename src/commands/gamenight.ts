import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageCreateOptions,
  MessageActionRowComponentBuilder,
  SlashCommandBuilder
} from "discord.js";

import { CommandContext, CommandModule } from "./types";

export const gamenightCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName("gamenight")
    .setDescription("Schedule a game night event")
    .addStringOption((option) =>
      option.setName("title").setDescription("Event title").setRequired(true)
    )
    .addStringOption((option) =>
      option.setName("date").setDescription("Date (e.g. Friday, Mar 14)").setRequired(true)
    )
    .addStringOption((option) =>
      option.setName("time").setDescription("Time (e.g. 8:30 PM IST)").setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("game")
        .setDescription("Game")
        .setRequired(true)
        .addChoices(
          { name: "AmongUs", value: "AmongUs" },
          { name: "Skribbl", value: "Skribbl" },
          { name: "Other", value: "Other" }
        )
    )
    .addStringOption((option) =>
      option
        .setName("notes")
        .setDescription("Optional notes")
        .setRequired(false)
        .setMaxLength(1000)
    )
    .addStringOption((option) =>
      option
        .setName("link")
        .setDescription("Optional external game link (custom room link)")
        .setRequired(false)
        .setMaxLength(300)
    ),

  async execute({ bootstrapper, interaction, gameNightVotes }: CommandContext): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({
        ephemeral: true,
        content: "This command is guild-only."
      });
      return;
    }

    const title = interaction.options.getString("title", true);
    const date = interaction.options.getString("date", true);
    const time = interaction.options.getString("time", true);
    const game = interaction.options.getString("game", true);
    const notes = interaction.options.getString("notes") ?? "-";
    const externalLink = interaction.options.getString("link") ?? "-";

    const guildState = bootstrapper.getGuildState(interaction.guild.id);
    const scheduleChannelId = guildState.channels.schedule;

    const fallbackChannel = interaction.channel;
    const targetChannel = scheduleChannelId
      ? await interaction.guild.channels.fetch(scheduleChannelId).catch(() => fallbackChannel)
      : fallbackChannel;

    if (
      !targetChannel ||
      !targetChannel.isTextBased() ||
      typeof (targetChannel as { send?: unknown }).send !== "function"
    ) {
      await interaction.reply({
        ephemeral: true,
        content: "Could not locate a sendable #schedule channel."
      });
      return;
    }

    const voiceKeyByGame: Record<string, string> = {
      AmongUs: "among_us_1",
      Skribbl: "skribbl_room",
      Other: "party_room"
    };

    const fallbackVoiceKey = "lobby_chill";
    const selectedVoiceKey = voiceKeyByGame[game] ?? fallbackVoiceKey;
    const selectedVoiceId =
      guildState.channels[selectedVoiceKey] ?? guildState.channels[fallbackVoiceKey];

    let voiceInviteUrl = "-";
    if (selectedVoiceId) {
      const voiceChannel = await interaction.guild.channels.fetch(selectedVoiceId).catch(() => null);
      if (voiceChannel && voiceChannel.type === ChannelType.GuildVoice) {
        const invite = await voiceChannel
          .createInvite({
            maxAge: 60 * 60 * 24 * 7,
            maxUses: 0,
            unique: true,
            reason: `Game night invite created by ${interaction.user.tag}`
          })
          .catch(() => null);

        if (invite?.url) {
          voiceInviteUrl = invite.url;
        }
      }
    }

    const embed = new EmbedBuilder()
      .setTitle(`🎮 ${title}`)
      .addFields(
        { name: "Game", value: game, inline: true },
        { name: "Date", value: date, inline: true },
        { name: "Time", value: time, inline: true },
        { name: "Voice Join Link", value: voiceInviteUrl },
        { name: "External Game Link", value: externalLink },
        { name: "Notes", value: notes }
      )
      .setColor(0x5865f2)
      .setFooter({ text: `Created by ${interaction.user.tag}` })
      .setTimestamp();

    const placeholderRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("gamenight:going")
        .setLabel("Going (0)")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("gamenight:maybe")
        .setLabel("Maybe (0)")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("gamenight:cant")
        .setLabel("Can't (0)")
        .setStyle(ButtonStyle.Danger)
    );

    const message = await (targetChannel as unknown as {
      send: (options: MessageCreateOptions) => Promise<{ id: string }>;
      toString: () => string;
    }).send({
      content: "React using the buttons below:",
      embeds: [embed],
      components: [placeholderRow]
    });

    gameNightVotes.initializeMessage(message.id);

    await interaction.reply({
      ephemeral: true,
      content: `Game night posted in ${targetChannel}.`
    });
  }
};
