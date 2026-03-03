import { GuildMember, SlashCommandBuilder } from "discord.js";

import { CommandContext, CommandModule } from "./types";

export const roomCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName("room")
    .setDescription("Create a temporary voice room")
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("Optional room name")
        .setRequired(false)
        .setMaxLength(80)
    )
    .addIntegerOption((option) =>
      option
        .setName("limit")
        .setDescription("Optional room member limit")
        .setRequired(false)
        .setMinValue(0)
        .setMaxValue(99)
    ),

  async execute({ interaction, tempRoomManager }: CommandContext): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({
        ephemeral: true,
        content: "This command is guild-only."
      });
      return;
    }

    const member = interaction.member;
    if (!(member instanceof GuildMember)) {
      await interaction.reply({
        ephemeral: true,
        content: "Could not resolve your guild member profile."
      });
      return;
    }

    if (!member.voice.channelId) {
      await interaction.reply({
        ephemeral: true,
        content: "Join a voice channel first, then run `/room`."
      });
      return;
    }

    const customName = interaction.options.getString("name") ?? undefined;
    const limit = interaction.options.getInteger("limit") ?? undefined;

    const room = await tempRoomManager.createManualRoom({
      guild: interaction.guild,
      member,
      roomName: customName,
      userLimit: limit
    });

    await interaction.reply({
      ephemeral: true,
      content: `Created temporary room ${room}.`
    });
  }
};
