import { createHmac, timingSafeEqual } from "node:crypto";

export type TelegramBotConfig = Readonly<{
  botId: string;
  botToken: string;
  enabled: boolean;
  entryUrl?: string;
  webhookSecret?: string;
}>;

export type VerifiedTelegramContact = Readonly<{
  telegramUserRef: string;
  phoneNumber: string;
}>;

export type VerifiedTelegramIdentity = Readonly<{
  telegramUserRef: string;
  authenticatedBotId: string;
  initDataHash: string;
}>;

const maxInitDataAgeSeconds = 5 * 60;

function configuredTelegramEntryUrl(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string")
    throw new Error("Telegram bot entry URL is invalid");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Telegram bot entry URL is invalid");
  }
  const supportedHost = url.hostname === "t.me" || url.hostname === "www.t.me";
  if (
    url.protocol !== "https:" ||
    !supportedHost ||
    url.username ||
    url.password ||
    url.hash ||
    !/^\/[A-Za-z0-9_]{5,}(?:\/[A-Za-z0-9_]{1,64})?$/.test(url.pathname)
  ) {
    throw new Error("Telegram bot entry URL is invalid");
  }
  return url.toString();
}

function configuredTelegramWebhookSecret(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(value)) {
    throw new Error("Telegram bot webhook secret is invalid");
  }
  return value;
}

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
    const entryUrl = configuredTelegramEntryUrl(config.entryUrl);
    const webhookSecret = configuredTelegramWebhookSecret(config.webhookSecret);
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
      entryUrl,
      webhookSecret,
    };
  });
}

/**
 * Entry links are intentionally optional operational metadata. They let a
 * user recover through another enabled Bot without ever exposing Bot tokens
 * or internal numeric IDs in the Mini App.
 */
export function enabledTelegramBotEntryUrls(
  source = process.env.TELEGRAM_BOTS_JSON,
): string[] {
  return [
    ...new Set(
      configuredTelegramBots(source)
        .filter((bot) => bot.enabled && bot.entryUrl)
        .map((bot) => bot.entryUrl!),
    ),
  ];
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
 * Production availability requires independently usable recovery Bots.
 * At least two Bots must be enabled concurrently so that users can open a
 * healthy entry point immediately if one Bot is disabled during an incident.
 * A disabled Bot may remain in configuration for audit and token rotation,
 * but it cannot count as the recovery path.
 */
export function requireTelegramRecoveryTopology(
  source = process.env.TELEGRAM_BOTS_JSON,
): TelegramBotConfig[] {
  const bots = requireEnabledTelegramBot(source);
  const enabledBots = bots.filter((bot) => bot.enabled);
  if (enabledBots.length < 2) {
    throw new Error(
      "TELEGRAM_BOTS_JSON must contain at least two enabled distinct Telegram bots for recovery",
    );
  }
  // An enabled Bot is not a usable recovery path unless the Mini App can
  // safely show a public deep link to it after a session is invalidated.
  if (enabledBots.some((bot) => !bot.entryUrl)) {
    throw new Error(
      "Every enabled Telegram bot must configure a public recovery entry URL",
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

/**
 * Authenticates the Bot API webhook secret configured through Telegram's
 * setWebhook `secret_token` option. This protects the inbound contact update
 * path without ever accepting a Bot token over HTTP.
 */
export function isTelegramWebhookSecretValid(
  botId: string,
  suppliedSecret: string | undefined,
  bots: readonly TelegramBotConfig[],
): boolean {
  const expectedSecret = bots.find(
    (bot) => bot.botId === botId && bot.enabled,
  )?.webhookSecret;
  if (!expectedSecret || !suppliedSecret) return false;
  const expected = Buffer.from(expectedSecret, "utf8");
  const supplied = Buffer.from(suppliedSecret, "utf8");
  return (
    expected.length === supplied.length && timingSafeEqual(expected, supplied)
  );
}

/**
 * Accept only a contact which Telegram identifies as belonging to the same
 * person who sent the private-chat update. Forwarded contacts and group-chat
 * contacts are deliberately ignored: they are not phone ownership proof.
 */
export function verifiedTelegramContactFromUpdate(
  update: unknown,
): VerifiedTelegramContact | undefined {
  if (!update || typeof update !== "object") return undefined;
  const message = (update as { message?: unknown }).message;
  if (!message || typeof message !== "object") return undefined;
  const record = message as {
    chat?: { type?: unknown };
    from?: { id?: unknown };
    contact?: { user_id?: unknown; phone_number?: unknown };
  };
  const telegramUserId = record.from?.id;
  const contactUserId = record.contact?.user_id;
  const phoneNumber = record.contact?.phone_number;
  if (
    record.chat?.type !== "private" ||
    typeof telegramUserId !== "number" ||
    !Number.isSafeInteger(telegramUserId) ||
    telegramUserId <= 0 ||
    contactUserId !== telegramUserId ||
    typeof phoneNumber !== "string" ||
    !/^\+?[0-9][0-9 ()-]{5,31}$/.test(phoneNumber)
  ) {
    return undefined;
  }
  return {
    telegramUserRef: `telegram-${telegramUserId}`,
    phoneNumber: phoneNumber.trim(),
  };
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
