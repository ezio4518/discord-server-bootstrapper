import { once } from "node:events";

import { Command } from "commander";
import { Client, GatewayIntentBits } from "discord.js";

import { Bootstrapper } from "./bootstrapper/bootstrapper";
import { StateStore } from "./bootstrapper/stateStore";
import { ensureStateFileExists, loadAppConfig } from "./config";
import { Logger } from "./lib/logger";

interface CliOptions {
  mode: "create" | "configure";
  guildId?: string;
  ownerUserId?: string;
  registerCommands: boolean;
}

const parseArgs = async (): Promise<CliOptions> => {
  const program = new Command();

  program
    .name("discord-bootstrapper")
    .description("Bootstrap a Discord gaming server")
    .option("--mode <mode>", "create | configure", "configure")
    .option("--guild-id <id>", "Target guild id (Mode B)")
    .option("--owner-user-id <id>", "User id to assign Owner role")
    .option("--no-register-commands", "Skip slash command registration");

  await program.parseAsync(process.argv);

  const options = program.opts<{
    mode: string;
    guildId?: string;
    ownerUserId?: string;
    registerCommands: boolean;
  }>();

  if (options.mode !== "create" && options.mode !== "configure") {
    throw new Error(`Invalid --mode value: ${options.mode}`);
  }

  return {
    mode: options.mode,
    guildId: options.guildId,
    ownerUserId: options.ownerUserId,
    registerCommands: options.registerCommands
  };
};

const run = async (): Promise<void> => {
  const cliOptions = await parseArgs();
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

  try {
    await client.login(appConfig.env.DISCORD_BOT_TOKEN);
    if (!client.isReady()) {
      await once(client, "clientReady");
    }

    const bootstrapper = new Bootstrapper({
      client: client as Client<true>,
      serverConfig: appConfig.server,
      stateStore,
      logger,
      clientId: appConfig.env.CLIENT_ID,
      botToken: appConfig.env.DISCORD_BOT_TOKEN
    });

    const result = await bootstrapper.bootstrap({
      mode: cliOptions.mode,
      guildId: cliOptions.guildId ?? appConfig.env.GUILD_ID,
      ownerUserId: cliOptions.ownerUserId ?? appConfig.env.OWNER_USER_ID,
      registerCommands: cliOptions.registerCommands
    });

    logger.info(`Bootstrap finished for guild ${result.guild.name} (${result.guild.id})`);
  } finally {
    client.destroy();
  }
};

run().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
