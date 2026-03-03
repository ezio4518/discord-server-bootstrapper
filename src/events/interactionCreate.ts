import { ButtonInteraction, Events, Interaction } from "discord.js";

import { Bootstrapper } from "../bootstrapper/bootstrapper";
import { Logger } from "../lib/logger";
import { TempRoomManager } from "../tempRooms/manager";
import { CommandRegistry, GameNightVoteStore } from "../commands/types";

interface InteractionCreateHandlerInput {
  commands: CommandRegistry;
  bootstrapper: Bootstrapper;
  tempRoomManager: TempRoomManager;
  gameNightVotes: GameNightVoteStore;
  logger: Logger;
}

const isGameNightButton = (interaction: ButtonInteraction): boolean =>
  interaction.customId.startsWith("gamenight:");

const extractGameNightChoice = (
  interaction: ButtonInteraction
): "going" | "maybe" | "cant" | null => {
  const [, choice] = interaction.customId.split(":");
  if (choice === "going" || choice === "maybe" || choice === "cant") {
    return choice;
  }

  return null;
};

export const createInteractionCreateHandler = ({
  commands,
  bootstrapper,
  tempRoomManager,
  gameNightVotes,
  logger
}: InteractionCreateHandlerInput) => {
  return async (interaction: Interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const command = commands.get(interaction.commandName);
        if (!command) {
          await interaction.reply({
            ephemeral: true,
            content: `Unknown command: ${interaction.commandName}`
          });
          return;
        }

        await command.execute({
          client: interaction.client,
          interaction,
          bootstrapper,
          tempRoomManager,
          gameNightVotes,
          logger
        });
        return;
      }

      if (interaction.isButton() && isGameNightButton(interaction)) {
        const choice = extractGameNightChoice(interaction);
        if (!choice) {
          await interaction.reply({
            ephemeral: true,
            content: "Unknown game night vote button."
          });
          return;
        }

        await gameNightVotes.handleVote(interaction, choice);
      }
    } catch (error) {
      logger.error("Interaction handler failed", {
        error: error instanceof Error ? error.message : String(error)
      });

      if (interaction.isRepliable()) {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            ephemeral: true,
            content: "Command failed due to an unexpected error."
          });
        } else {
          await interaction.reply({
            ephemeral: true,
            content: "Command failed due to an unexpected error."
          });
        }
      }
    }
  };
};
