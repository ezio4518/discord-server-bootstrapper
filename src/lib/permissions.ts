import { PermissionFlagsBits } from "discord.js";

export const resolvePermissionBits = (permissionNames: string[]): bigint[] => {
  return permissionNames.map((permissionName) => {
    const value = PermissionFlagsBits[permissionName as keyof typeof PermissionFlagsBits];
    if (typeof value !== "bigint") {
      throw new Error(`Unknown Discord permission flag: ${permissionName}`);
    }

    return value;
  });
};
