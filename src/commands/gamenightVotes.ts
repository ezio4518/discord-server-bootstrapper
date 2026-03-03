import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  MessageActionRowComponentBuilder
} from "discord.js";

import { Logger } from "../lib/logger";
import { GameNightVoteStore } from "./types";

type VoteChoice = "going" | "maybe" | "cant";

type VoteSnapshot = {
  going: Set<string>;
  maybe: Set<string>;
  cant: Set<string>;
};

const emptySnapshot = (): VoteSnapshot => ({
  going: new Set<string>(),
  maybe: new Set<string>(),
  cant: new Set<string>()
});

const buildButtons = (votes: VoteSnapshot): ActionRowBuilder<MessageActionRowComponentBuilder> => {
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>();

  row.addComponents(
    new ButtonBuilder()
      .setCustomId("gamenight:going")
      .setLabel(`Going (${votes.going.size})`)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("gamenight:maybe")
      .setLabel(`Maybe (${votes.maybe.size})`)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("gamenight:cant")
      .setLabel(`Can't (${votes.cant.size})`)
      .setStyle(ButtonStyle.Danger)
  );

  return row;
};

export class InMemoryGameNightVoteStore implements GameNightVoteStore {
  private readonly votesByMessageId = new Map<string, VoteSnapshot>();

  constructor(private readonly logger: Logger) {}

  initializeMessage(messageId: string): void {
    if (!this.votesByMessageId.has(messageId)) {
      this.votesByMessageId.set(messageId, emptySnapshot());
    }
  }

  async handleVote(interaction: ButtonInteraction, choice: VoteChoice): Promise<void> {
    const messageId = interaction.message.id;
    const userId = interaction.user.id;

    this.initializeMessage(messageId);
    const snapshot = this.votesByMessageId.get(messageId);

    if (!snapshot) {
      await interaction.reply({
        ephemeral: true,
        content: "This game night vote is not tracked anymore."
      });
      return;
    }

    snapshot.going.delete(userId);
    snapshot.maybe.delete(userId);
    snapshot.cant.delete(userId);
    snapshot[choice].add(userId);

    await interaction.update({
      components: [buildButtons(snapshot)]
    });

    this.logger.info("Recorded game night vote", {
      messageId,
      userId,
      choice
    });
  }

  createButtons(messageId: string): ActionRowBuilder<MessageActionRowComponentBuilder> {
    this.initializeMessage(messageId);
    const votes = this.votesByMessageId.get(messageId) ?? emptySnapshot();
    return buildButtons(votes);
  }
}
