import fs from "node:fs";

import { Logger } from "../lib/logger";
import { GuildState, StateFile } from "./types";

const emptyGuildState = (): GuildState => ({
  roles: {},
  categories: {},
  channels: {},
  meta: {},
  tempRooms: {
    ownerToChannel: {},
    channelToOwner: {}
  }
});

export class StateStore {
  private state: StateFile | null = null;

  constructor(
    private readonly stateFilePath: string,
    private readonly logger: Logger
  ) {}

  private loadState(): StateFile {
    if (this.state) {
      return this.state;
    }

    try {
      const raw = fs.readFileSync(this.stateFilePath, "utf8");
      const parsed = JSON.parse(raw) as StateFile;
      if (!parsed.guilds || typeof parsed.guilds !== "object") {
        this.state = { guilds: {} };
      } else {
        this.state = parsed;
      }
    } catch {
      this.logger.warn("State file missing or invalid; creating a new one");
      this.state = { guilds: {} };
    }

    return this.state;
  }

  getGuildState(guildId: string): GuildState {
    const loaded = this.loadState();
    if (!loaded.guilds[guildId]) {
      loaded.guilds[guildId] = emptyGuildState();
    }

    return loaded.guilds[guildId];
  }

  save(): void {
    const loaded = this.loadState();
    fs.writeFileSync(this.stateFilePath, JSON.stringify(loaded, null, 2), "utf8");
  }
}
