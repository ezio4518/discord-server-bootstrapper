import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";

import { CommandContext, CommandModule } from "./types";

export const setupCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Run or re-run full server bootstrap")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute({ bootstrapper, interaction, logger }: CommandContext): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({
        ephemeral: true,
        content: "This command is guild-only."
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      await bootstrapper.bootstrapGuild(interaction.guild, {
        registerCommands: true
      });

      await interaction.editReply("Bootstrap completed successfully.");
    } catch (error) {
      logger.error("/setup failed", {
        error: error instanceof Error ? error.message : String(error)
      });
      await interaction.editReply("Bootstrap failed. Check bot logs for details.");
    }
  }
};
