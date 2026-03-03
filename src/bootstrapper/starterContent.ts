import { GuildState } from "./types";

const roleMention = (guildState: GuildState, key: string): string => {
  const id = guildState.roles[key];
  return id ? `<@&${id}>` : `@${key}`;
};

const channelMention = (guildState: GuildState, key: string): string => {
  const id = guildState.channels[key];
  return id ? `<#${id}>` : `#${key}`;
};

export const buildStarterContent = (guildState: GuildState): Record<string, string> => {
  const adminMention = roleMention(guildState, "admin");
  const modMention = roleMention(guildState, "mod");
  const hostMention = roleMention(guildState, "gameHost");
  const rulesChannel = channelMention(guildState, "rules");
  const rolesChannel = channelMention(guildState, "roles");
  const introductionsChannel = channelMention(guildState, "introductions");
  const lfgChannel = channelMention(guildState, "lfg");
  const generalChannel = channelMention(guildState, "general");
  const botCommandsChannel = channelMention(guildState, "bot_commands");
  const gameChatChannel = channelMention(guildState, "game_chat");
  const scheduleChannel = channelMention(guildState, "schedule");
  const helpDeskChannel = channelMention(guildState, "help_desk");

  return {
    welcome:
      `# Welcome to **homies**\nWe're here for chill games, voice hangs, and clean vibes.\n\n1. Read ${rulesChannel}\n2. Check ${rolesChannel}\n3. Introduce yourself in ${introductionsChannel}\n4. Use ${lfgChannel} to find teammates`,

    rules: "Rules:\n1. There are no fucking rules.",

    server_guide:
      `# Server Guide\n- ${generalChannel}: day-to-day chat\n- ${botCommandsChannel}: run bot commands\n- ${gameChatChannel}: gaming talk\n- ${scheduleChannel}: upcoming game nights\n- ${helpDeskChannel}: ask for help`,

    roles:
      "# Role Pickup\nUse this channel for role selection setup.\n\nCurrent managed roles:\n- Owner\n- Admin\n- Mod\n- Game Host\n- Event Manager\n- Member\n- Bots\n- Muted",

    announcements:
      `# Announcements\nOnly ${adminMention} and ${modMention} can post here.`,

    changelog:
      "# Changelog\nServer structure and bot automation changes will be posted here.",

    faq:
      `# FAQ\nQ: How do I join events?\nA: Watch ${scheduleChannel} and vote on game-night posts.\n\nQ: How do I find teammates?\nA: Post in ${lfgChannel} with game and time.`,

    general:
      "# General Chat\nKeep it friendly, keep it active, and enjoy the lobby.",

    introductions:
      "# Introductions\nDrop a short intro:\n- Name/nickname\n- Favorite games\n- Typical play times",

    lfg:
      "# Looking For Group\nPost format:\n`Game | Rank/Mode | Region | Time | Spots needed`",

    schedule:
      `# Game Night Schedule\nEvent leads: ${hostMention}.\nUse \/gamenight to post structured events with RSVP buttons.`,

    polls:
      "# Polls\nUse `/poll question:<text> options:<a,b,c>` to collect votes.",

    help_desk:
      "# Help Desk\nNeed support? Post the issue with steps/screenshots and we’ll help.",

    suggestions:
      "# Suggestions\nShare feature ideas for channels, games, events, or bot improvements.",

    bot_commands:
      "# Bot Commands\nAvailable commands: `/setup`, `/addgame`, `/poll`, `/gamenight`, `/room`.",

    bot_logs:
      "# Bot Logs\nOperational logs and automation notes are posted/checked here by admins.",

    mod_log:
      "# Mod Log\nStaff-only moderation actions and notes.",

    reports:
      "# Reports\nStaff triage channel for member reports and incidents."
  };
};
