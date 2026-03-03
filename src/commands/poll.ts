import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageCreateOptions,
  SlashCommandBuilder
} from "discord.js";

import { CommandContext, CommandModule } from "./types";

const NUMBER_REACTIONS = [
  "1️⃣",
  "2️⃣",
  "3️⃣",
  "4️⃣",
  "5️⃣",
  "6️⃣",
  "7️⃣",
  "8️⃣",
  "9️⃣",
  "🔟"
];

const parseOptions = (raw: string): string[] =>
  raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

type SendableTextChannel = {
  send: (options: MessageCreateOptions) => Promise<{ react: (emoji: string) => Promise<unknown> }>;
  toString: () => string;
};

const ensureGuildTextChannel = (interaction: ChatInputCommandInteraction) => {
  const channel = interaction.channel;
  if (
    !channel ||
    !channel.isTextBased() ||
    typeof (channel as { send?: unknown }).send !== "function"
  ) {
    throw new Error("This command can only be used in a sendable text channel.");
  }

  return channel as unknown as SendableTextChannel;
};

export const pollCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Create a quick poll")
    .addStringOption((option) =>
      option.setName("question").setDescription("Poll question").setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("options")
        .setDescription("Comma-separated options")
        .setRequired(true)
    ),

  async execute({ interaction }: CommandContext): Promise<void> {
    const question = interaction.options.getString("question", true);
    const rawOptions = interaction.options.getString("options", true);
    const options = parseOptions(rawOptions);

    if (options.length < 2 || options.length > 10) {
      await interaction.reply({
        ephemeral: true,
        content: "Provide between 2 and 10 comma-separated options."
      });
      return;
    }

    const channel = ensureGuildTextChannel(interaction);
    const embed = new EmbedBuilder()
      .setTitle(`📊 ${question}`)
      .setDescription(options.map((option, index) => `${NUMBER_REACTIONS[index]} ${option}`).join("\n"))
      .setColor(0x2ecc71)
      .setFooter({ text: `Poll by ${interaction.user.tag}` })
      .setTimestamp();

    const pollMessage = await channel.send({ embeds: [embed] });

    for (const [index] of options.entries()) {
      await pollMessage.react(NUMBER_REACTIONS[index]);
    }

    await interaction.reply({
      ephemeral: true,
      content: `Poll posted in ${channel}.`
    });
  }
};
