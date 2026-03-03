import { ChannelType, EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";

import { CommandContext, CommandModule } from "./types";

export const resultCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName("result")
    .setDescription("Post a structured game result in #results")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
    .addStringOption((option) =>
      option.setName("title").setDescription("Result title").setRequired(true).setMaxLength(120)
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
      option.setName("winner").setDescription("Winner or winning team").setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("score")
        .setDescription("Optional score (e.g. 3-1)")
        .setRequired(false)
        .setMaxLength(50)
    )
    .addStringOption((option) =>
      option
        .setName("summary")
        .setDescription("Short summary")
        .setRequired(false)
        .setMaxLength(600)
    )
    .addStringOption((option) =>
      option
        .setName("link")
        .setDescription("Optional VOD/clip/screenshot link")
        .setRequired(false)
        .setMaxLength(300)
    ),

  async execute({ bootstrapper, interaction }: CommandContext): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({ ephemeral: true, content: "This command is guild-only." });
      return;
    }

    const title = interaction.options.getString("title", true);
    const game = interaction.options.getString("game", true);
    const winner = interaction.options.getString("winner", true);
    const score = interaction.options.getString("score") ?? "-";
    const summary = interaction.options.getString("summary") ?? "-";
    const link = interaction.options.getString("link") ?? "-";

    const guildState = bootstrapper.getGuildState(interaction.guild.id);
    const resultsChannelId = guildState.channels.results;

    const fallbackChannel = interaction.channel;
    const targetChannel = resultsChannelId
      ? await interaction.guild.channels.fetch(resultsChannelId).catch(() => fallbackChannel)
      : fallbackChannel;

    if (
      !targetChannel ||
      !targetChannel.isTextBased() ||
      targetChannel.type !== ChannelType.GuildText ||
      typeof (targetChannel as { send?: unknown }).send !== "function"
    ) {
      await interaction.reply({
        ephemeral: true,
        content: "Could not locate a sendable #results channel. Run `/setup` first."
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`🏁 ${title}`)
      .addFields(
        { name: "Game", value: game, inline: true },
        { name: "Winner", value: winner, inline: true },
        { name: "Score", value: score, inline: true },
        { name: "Summary", value: summary },
        { name: "Link", value: link }
      )
      .setColor(0xf1c40f)
      .setFooter({ text: `Posted by ${interaction.user.tag}` })
      .setTimestamp();

    await (targetChannel as unknown as {
      send: (payload: { embeds: EmbedBuilder[] }) => Promise<unknown>;
      toString: () => string;
    }).send({ embeds: [embed] });

    await interaction.reply({
      ephemeral: true,
      content: `Result posted in ${targetChannel}.`
    });
  }
};
