import { once } from "node:events";

import { Client, GatewayIntentBits } from "discord.js";

import { Bootstrapper } from "./bootstrapper/bootstrapper";
import { StateStore } from "./bootstrapper/stateStore";
import { createCommandRegistry, registerGuildCommands } from "./commands";
import { InMemoryGameNightVoteStore } from "./commands/gamenightVotes";
import { ensureStateFileExists, loadAppConfig } from "./config";
import { registerEvents } from "./events/registerEvents";
import { Logger } from "./lib/logger";
import { TempRoomManager } from "./tempRooms/manager";

const runBot = async (): Promise<void> => {
  const appConfig = loadAppConfig(process.cwd());
  ensureStateFileExists(appConfig.stateFilePath);

  const logger = new Logger(appConfig.env.LOG_LEVEL);
  const stateStore = new StateStore(appConfig.stateFilePath, logger);

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildVoiceStates
    ]
  });

  const bootstrapper = new Bootstrapper({
    client: client as Client<true>,
    serverConfig: appConfig.server,
    stateStore,
    logger,
    clientId: appConfig.env.CLIENT_ID,
    botToken: appConfig.env.DISCORD_BOT_TOKEN
  });

  const tempRoomManager = new TempRoomManager({
    client: client as Client<true>,
    bootstrapper,
    stateStore,
    logger
  });

  const commands = createCommandRegistry();
  const gameNightVotes = new InMemoryGameNightVoteStore(logger);

  registerEvents({
    client: client as Client<true>,
    commands,
    bootstrapper,
    tempRoomManager,
    gameNightVotes,
    logger
  });

  await client.login(appConfig.env.DISCORD_BOT_TOKEN);

  if (!client.isReady()) {
    await once(client, "clientReady");
  }

  if (appConfig.env.GUILD_ID) {
    await registerGuildCommands({
      clientId: appConfig.env.CLIENT_ID,
      guildId: appConfig.env.GUILD_ID,
      token: appConfig.env.DISCORD_BOT_TOKEN,
      logger
    });
  }

  if (process.env.AUTO_BOOTSTRAP_ON_START === "true" && appConfig.env.GUILD_ID) {
    await bootstrapper.bootstrap({
      mode: "configure",
      guildId: appConfig.env.GUILD_ID,
      ownerUserId: appConfig.env.OWNER_USER_ID,
      registerCommands: false
    });
  }
};

runBot().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
