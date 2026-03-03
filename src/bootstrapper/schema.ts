import { z } from "zod";

const permissionOverwriteSchema = z.object({
  target: z.string().min(1),
  allow: z.array(z.string()).default([]),
  deny: z.array(z.string()).default([])
});

const channelSchema = z.object({
  key: z.string().min(1),
  type: z.enum(["GUILD_TEXT", "GUILD_VOICE"]),
  name: z.string().min(1),
  topic: z.string().max(1024).optional(),
  slowmode: z.number().int().min(0).max(21600).optional(),
  userLimit: z.number().int().min(0).max(99).optional(),
  permissionOverwrites: z.array(permissionOverwriteSchema).optional()
});

const categorySchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  permissionOverwrites: z.array(permissionOverwriteSchema).optional(),
  channels: z.array(channelSchema).min(1)
});

const roleSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  color: z
    .string()
    .regex(/^#?[0-9a-fA-F]{6}$/)
    .optional(),
  mentionable: z.boolean().default(false),
  hoist: z.boolean().default(false),
  permissions: z.array(z.string()).default([])
});

const emojiSchema = z.object({
  name: z.string().min(2).max(32),
  source: z.string().min(1)
});

export const serverConfigSchema = z.object({
  serverName: z.string().min(2),
  roles: z.array(roleSchema).min(1),
  categories: z.array(categorySchema).min(1),
  emojis: z.array(emojiSchema).optional().default([])
});

export const envSchema = z.object({
  DISCORD_BOT_TOKEN: z.string().min(1),
  CLIENT_ID: z.string().min(1),
  GUILD_ID: z.string().min(1).optional(),
  OWNER_USER_ID: z.string().min(1).optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info")
});

export type ServerConfig = z.infer<typeof serverConfigSchema>;
export type Environment = z.infer<typeof envSchema>;
export type RoleConfig = z.infer<typeof roleSchema>;
export type CategoryConfig = z.infer<typeof categorySchema>;
export type ChannelConfig = z.infer<typeof channelSchema>;
export type PermissionOverwriteConfig = z.infer<typeof permissionOverwriteSchema>;
export type EmojiConfig = z.infer<typeof emojiSchema>;
