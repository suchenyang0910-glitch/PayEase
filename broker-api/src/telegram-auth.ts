import { createHmac, timingSafeEqual } from "node:crypto";

export type TelegramBotConfig = Readonly<{
  botId: string;
  botToken: string;
  enabled: boolean;
}>;

export type VerifiedTelegramIdentity = Readonly<{
  telegramUserRef: string;
  authenticatedBotId: string;
  initDataHash: string;
}>;

const maxInitDataAgeSeconds = 5 * 60;

export function configuredTelegramBots(
  source = process.env.TELEGRAM_BOTS_JSON,
): TelegramBotConfig[] {
  if (!source) return [];
  const parsed: unknown = JSON.parse(source);
  if (!Array.isArray(parsed))
    throw new Error("TELEGRAM_BOTS_JSON must be an array");
  const botIds = new Set<string>();
  const botTokens = new Set<string>();
  return parsed.map((entry) => {
    if (!entry || typeof entry !== "object") {
      throw new Error("Telegram bot configuration must be an object");
    }
    const config = entry as Record<string, unknown>;
    const botId = typeof config.botId === "string" ? config.botId : "";
    const botToken = typeof config.botToken === "string" ? config.botToken : "";
    const enabled = config.enabled;
    if (
      !/^\d{5,20}$/.test(botId) ||
      botToken.length < 20 ||
      (enabled !== undefined && typeof enabled !== "boolean")
    ) {
      throw new Error("Telegram bot configuration is invalid");
    }
    if (botIds.has(botId)) throw new Error("Telegram bot IDs must be unique");
    // One token belongs to exactly one Telegram Bot. Duplicating it under
    // separate IDs would make incident attribution and disablement ambiguous.
    if (botTokens.has(botToken))
      throw new Error("Telegram bot tokens must be unique");
    botIds.add(botId);
    botTokens.add(botToken);
    return {
      botId,
      botToken,
      enabled: enabled ?? true,
    };
  });
}

/**
 * Fail deployment readiness early when applicant authentication is expected.
 * This must be used only by the startup path: request handlers intentionally
 * re-read configuration so an incident response can disable one Bot without
 * restarting the service.
 */
export function requireEnabledTelegramBot(
  source = process.env.TELEGRAM_BOTS_JSON,
): TelegramBotConfig[] {
  const bots = configuredTelegramBots(source);
  if (!bots.some((bot) => bot.enabled)) {
    throw new Error(
      "TELEGRAM_BOTS_JSON must contain at least one enabled Telegram bot",
    );
  }
  return bots;
}

/**
 * Production availability requires an independently configured recovery Bot.
 * At least one Bot must be enabled to accept a new login, while a second
 * configured Bot may be disabled during an incident and later rotated or
 * restored without rebuilding the applicant identity store.
 */
export function requireTelegramRecoveryTopology(
  source = process.env.TELEGRAM_BOTS_JSON,
): TelegramBotConfig[] {
  const bots = requireEnabledTelegramBot(source);
  if (bots.length < 2) {
    throw new Error(
      "TELEGRAM_BOTS_JSON must contain at least two distinct Telegram bots for recovery",
    );
  }
  return bots;
}

/**
 * A bot can be disabled during an incident without deleting its configuration.
 * Callers must check this for an existing session as well as at login time:
 * otherwise a compromised bot could retain access through sessions minted just
 * before it was disabled.
 */
export function isTelegramBotEnabled(
  botId: string,
  bots: readonly TelegramBotConfig[],
): boolean {
  return bots.some((bot) => bot.botId === botId && bot.enabled);
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "hex");
  const rightBytes = Buffer.from(right, "hex");
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

export function verifyTelegramMiniAppInitData(
  initData: string,
  bots: readonly TelegramBotConfig[],
  nowSeconds = Math.floor(Date.now() / 1000),
): VerifiedTelegramIdentity | undefined {
  const params = new URLSearchParams(initData);
  const suppliedHash = params.get("hash");
  const user = params.get("user");
  const authDate = Number(params.get("auth_date"));
  if (!suppliedHash || !user || !Number.isSafeInteger(authDate))
    return undefined;
  if (
    authDate > nowSeconds + 60 ||
    nowSeconds - authDate > maxInitDataAgeSeconds
  ) {
    return undefined;
  }
  let telegramUserId: number;
  try {
    const parsedUser = JSON.parse(user) as { id?: unknown };
    telegramUserId = Number(parsedUser.id);
  } catch {
    return undefined;
  }
  if (!Number.isSafeInteger(telegramUserId) || telegramUserId <= 0)
    return undefined;

  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  for (const bot of bots) {
    if (!bot.enabled) continue;
    const secret = createHmac("sha256", "WebAppData")
      .update(bot.botToken)
      .digest();
    const expectedHash = createHmac("sha256", secret)
      .update(dataCheckString)
      .digest("hex");
    if (safeEqual(expectedHash, suppliedHash)) {
      return {
        telegramUserRef: `telegram-${telegramUserId}`,
        authenticatedBotId: bot.botId,
        initDataHash: createHmac("sha256", "PayEaseTelegramInitData")
          .update(initData)
          .digest("hex"),
      };
    }
  }
  return undefined;
}
