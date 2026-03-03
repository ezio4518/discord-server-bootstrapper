import { DiscordAPIError } from "discord.js";

import { Logger } from "./logger";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const parseRetryDelayMs = (error: unknown): number | null => {
  if (error instanceof DiscordAPIError) {
    const retryAfter = (error.rawError as { retry_after?: number } | undefined)?.retry_after;
    if (typeof retryAfter === "number") {
      return Math.ceil(retryAfter * 1000);
    }
    if (error.status === 429) {
      return 1500;
    }
  }

  return null;
};

export async function withRetry<T>(
  operationName: string,
  operation: () => Promise<T>,
  logger: Logger,
  maxAttempts = 5
): Promise<T> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < maxAttempts) {
    attempt += 1;

    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const retryDelay = parseRetryDelayMs(error);
      const canRetry = retryDelay !== null || attempt < maxAttempts;

      if (!canRetry || attempt >= maxAttempts) {
        break;
      }

      const backoffDelay = retryDelay ?? Math.min(7500, 400 * 2 ** (attempt - 1));
      logger.warn(`${operationName} failed (attempt ${attempt}/${maxAttempts}), retrying`, {
        delayMs: backoffDelay
      });
      await sleep(backoffDelay);
    }
  }

  throw new Error(`${operationName} failed after ${maxAttempts} attempts`, {
    cause: lastError
  });
}
