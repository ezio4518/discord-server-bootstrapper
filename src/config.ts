import fs from "node:fs";
import path from "node:path";

import dotenv from "dotenv";

import { Environment, ServerConfig, envSchema, serverConfigSchema } from "./bootstrapper/schema";

export interface AppConfig {
  env: Environment;
  server: ServerConfig;
  stateFilePath: string;
}

const readJsonFile = <T>(filePath: string): T => {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as T;
};

export const loadAppConfig = (cwd = process.cwd()): AppConfig => {
  dotenv.config({ path: path.join(cwd, ".env") });

  const envParsed = envSchema.safeParse(process.env);
  if (!envParsed.success) {
    const message = envParsed.error.issues.map((issue) => issue.message).join(", ");
    throw new Error(`Invalid .env configuration: ${message}`);
  }

  const serverConfigPath = path.join(cwd, "config", "server.json");
  if (!fs.existsSync(serverConfigPath)) {
    throw new Error(`Missing server config file at ${serverConfigPath}`);
  }

  const serverParsed = serverConfigSchema.safeParse(readJsonFile<unknown>(serverConfigPath));
  if (!serverParsed.success) {
    const message = serverParsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid config/server.json: ${message}`);
  }

  const stateFilePath = path.join(cwd, "data", "state.json");

  return {
    env: envParsed.data,
    server: serverParsed.data,
    stateFilePath
  };
};

export const ensureStateFileExists = (stateFilePath: string): void => {
  const dir = path.dirname(stateFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(stateFilePath)) {
    fs.writeFileSync(
      stateFilePath,
      JSON.stringify({ guilds: {} }, null, 2),
      "utf8"
    );
  }
};
