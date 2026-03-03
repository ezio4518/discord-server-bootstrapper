# Homies Discord Server Bootstrapper (TypeScript + discord.js v14)

Production-grade Discord automation to bootstrap and maintain a private gaming/community server named `homies`.

## What This Sets Up

- Idempotent server provisioning (safe re-runs, updates existing resources)
- Two modes:
  - Mode A: create new guild (with fallback)
  - Mode B: configure existing guild (recommended)
- Full production blueprint for channels, roles, permissions, and voice stack
- Slash commands for operations and game nights
- Temporary voice rooms (`➕ Create Room`)
- Auto role assignment on member join (`Member`) and bot join (`Bots`)
- Starter messages auto-seeded in key channels (`welcome`, `rules`, `schedule`, etc.)
- Guild safety defaults applied on bootstrap:
  - Verification level: `Medium`
  - Explicit content filter: `All Members`
  - Default notifications: `Only @mentions`

## Server Blueprint (Default `config/server.json`)

- Categories:
  - `📌 START HERE`
  - `💬 COMMUNITY`
  - `🎮 GAMES`
  - `🗓️ EVENTS`
  - `🧠 SUPPORT`
  - `🏆 SHOWCASE`
  - `🛠️ ADMIN`
  - `🔊 VOICE`
- Includes moderation/support/event channels, slowmode on high-traffic channels, and admin-private areas.
- Voice includes dedicated game rooms + dynamic temp room creation.

## Slash Commands

- `/setup` (admin) - re-run bootstrap in current guild
- `/addgame name:<text> create_voice:<bool optional> voice_limit:<int optional>` (admin)
- `/poll question:<text> options:<comma-separated>`
- `/gamenight title:<text> date:<text> time:<text> game:<AmongUs|Skribbl|Other> notes:<optional> link:<optional>`
- `/result title:<text> game:<AmongUs|Skribbl|Other> winner:<text> score:<optional> summary:<optional> link:<optional>`
- `/room name:<optional> limit:<optional>`

## Project Structure

- `src/cli.ts` - one-shot bootstrap CLI
- `src/bot.ts` - long-running bot runtime
- `src/bootstrapper/*` - resource manager, config, state, orchestration
- `src/commands/*` - slash command modules
- `src/events/*` - interaction/voice/member lifecycle handlers
- `src/tempRooms/manager.ts` - temp voice room lifecycle
- `config/server.json` - production server blueprint
- `data/state.json` - persisted idempotency state

## 1) Create Discord App + Bot

1. Open [Discord Developer Portal](https://discord.com/developers/applications).
2. Create application and add bot.
3. Copy:
  - Bot token (`DISCORD_BOT_TOKEN`)
  - Application ID (`CLIENT_ID`)
4. Enable privileged intent:
  - `SERVER MEMBERS INTENT`

## 2) Configure Environment

Copy and fill env values:

```bash
cp .env.example .env
```

```env
DISCORD_BOT_TOKEN=...
CLIENT_ID=...
GUILD_ID=...
OWNER_USER_ID=...      # optional
LOG_LEVEL=info
AUTO_BOOTSTRAP_ON_START=false
```

## 3) Invite Bot

Use URL (replace `YOUR_CLIENT_ID`):

[Invite Bot](https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8&scope=bot%20applications.commands)

## 4) Install + Build

```bash
npm i
npm run build
```

## 5) Bootstrap

Recommended (Mode B):

```bash
node dist/cli.js --mode configure
```

Optional:

```bash
node dist/cli.js --mode configure --guild-id <GUILD_ID>
node dist/cli.js --mode create --guild-id <FALLBACK_GUILD_ID>
```

## 6) Run Bot Runtime

```bash
node dist/bot.js
```

Keep this process running for slash commands, temp room lifecycle, and member auto-role handling.

## Troubleshooting

- `Missing Access` / `Missing Permissions`
  - Put bot role above managed roles it updates (`Bots`, `Member`, etc.).
- Role order warnings
  - Discord hierarchy blocked role positioning. Move bot role up and rerun `/setup`.
- Commands not visible
  - Re-run bootstrap and wait up to ~1 minute.
- Temp rooms not working
  - Ensure `➕ Create Room` exists and bot can `Manage Channels` + `Move Members`.
