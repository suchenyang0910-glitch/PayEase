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
    botIds.add(botId);
    return {
      botId,
      botToken,
      enabled: enabled ?? true,
    };
  });
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
