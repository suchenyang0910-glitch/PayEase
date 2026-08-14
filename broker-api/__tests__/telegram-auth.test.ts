import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  configuredTelegramBots,
  enabledTelegramBotEntryUrls,
  isTelegramBotEnabled,
  requireEnabledTelegramBot,
  requireTelegramRecoveryTopology,
  verifyTelegramMiniAppInitData,
} from "../src/telegram-auth.js";

function signedInitData(botToken: string): string {
  const params = new URLSearchParams({
    auth_date: "2000000000",
    query_id: "AAE",
    user: JSON.stringify({ id: 123456789, first_name: "Preview" }),
  });
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  params.set(
    "hash",
    createHmac("sha256", secret).update(dataCheckString).digest("hex"),
  );
  return params.toString();
}

describe("Telegram multi-bot Mini App verification", () => {
  it("accepts initData from either enabled trusted bot and normalizes the user", () => {
    const firstToken = "a".repeat(24);
    const secondToken = "b".repeat(24);
    const bots = configuredTelegramBots(
      JSON.stringify([
        { botId: "111111111", botToken: firstToken, enabled: true },
        { botId: "222222222", botToken: secondToken, enabled: true },
      ]),
    );
    expect(
      verifyTelegramMiniAppInitData(
        signedInitData(secondToken),
        bots,
        2000000001,
      ),
    ).toMatchObject({
      telegramUserRef: "telegram-123456789",
      authenticatedBotId: "222222222",
    });
    expect(
      verifyTelegramMiniAppInitData(
        signedInitData(secondToken),
        bots,
        2000000001,
      ),
    ).toMatchObject({ telegramUserRef: "telegram-123456789" });
    expect(
      verifyTelegramMiniAppInitData(
        signedInitData(firstToken),
        bots,
        2000000001,
      ),
    ).toMatchObject({
      telegramUserRef: "telegram-123456789",
      authenticatedBotId: "111111111",
    });
  });

  it("rejects stale or altered initData", () => {
    const token = "c".repeat(24);
    const bots = configuredTelegramBots(
      JSON.stringify([{ botId: "333333333", botToken: token }]),
    );
    expect(
      verifyTelegramMiniAppInitData(signedInitData(token), bots, 2000000400),
    ).toBeUndefined();
    expect(
      verifyTelegramMiniAppInitData(
        `${signedInitData(token)}&start_param=altered`,
        bots,
        2000000001,
      ),
    ).toBeUndefined();
    expect(
      verifyTelegramMiniAppInitData(signedInitData(token), bots, 1999999900),
    ).toBeUndefined();
    expect(
      verifyTelegramMiniAppInitData(
        "auth_date=2000000000&user=%7B%7D&hash=bad",
        bots,
        2000000001,
      ),
    ).toBeUndefined();
  });

  it("fails closed when bot configuration is malformed or duplicates a bot identity", () => {
    expect(() => configuredTelegramBots("not-json")).toThrow();
    expect(() =>
      configuredTelegramBots(
        JSON.stringify([
          {
            botId: "444444444",
            botToken: "z".repeat(24),
            enabled: "false",
          },
        ]),
      ),
    ).toThrow("invalid");
    expect(() =>
      configuredTelegramBots(
        JSON.stringify([
          { botId: "555555555", botToken: "d".repeat(24) },
          { botId: "555555555", botToken: "e".repeat(24) },
        ]),
      ),
    ).toThrow("unique");
    expect(() =>
      configuredTelegramBots(
        JSON.stringify([
          { botId: "555555556", botToken: "f".repeat(24) },
          { botId: "555555557", botToken: "f".repeat(24) },
        ]),
      ),
    ).toThrow("Telegram bot tokens must be unique");
  });

  it("rejects startup configuration with no enabled recovery Bot", () => {
    expect(() => requireEnabledTelegramBot("")).toThrow("at least one enabled");
    expect(() =>
      requireEnabledTelegramBot(
        JSON.stringify([
          { botId: "888888888", botToken: "h".repeat(24), enabled: false },
        ]),
      ),
    ).toThrow("at least one enabled");
    expect(
      requireEnabledTelegramBot(
        JSON.stringify([
          { botId: "999999999", botToken: "i".repeat(24), enabled: true },
        ]),
      ),
    ).toHaveLength(1);
  });

  it("requires two enabled Bots and public recovery links for each", () => {
    expect(() =>
      requireTelegramRecoveryTopology(
        JSON.stringify([
          { botId: "100000001", botToken: "j".repeat(24), enabled: true },
        ]),
      ),
    ).toThrow("at least two enabled distinct");
    expect(() =>
      requireTelegramRecoveryTopology(
        JSON.stringify([
          {
            botId: "100000002",
            botToken: "k".repeat(24),
            enabled: true,
            entryUrl: "https://t.me/payease_primary?startapp=apply",
          },
          { botId: "100000003", botToken: "l".repeat(24), enabled: false },
        ]),
      ),
    ).toThrow("at least two enabled distinct");
    expect(() =>
      requireTelegramRecoveryTopology(
        JSON.stringify([
          { botId: "100000004", botToken: "m".repeat(24), enabled: true },
          {
            botId: "100000005",
            botToken: "n".repeat(24),
            enabled: true,
            entryUrl: "https://t.me/payease_recovery?startapp=apply",
          },
        ]),
      ),
    ).toThrow("public recovery entry URL");
  });

  it("treats a disabled bot as unavailable without disabling a healthy fallback bot", () => {
    const disabledToken = "f".repeat(24);
    const fallbackToken = "g".repeat(24);
    const bots = configuredTelegramBots(
      JSON.stringify([
        { botId: "666666666", botToken: disabledToken, enabled: false },
        { botId: "777777777", botToken: fallbackToken, enabled: true },
      ]),
    );

    expect(isTelegramBotEnabled("666666666", bots)).toBe(false);
    expect(isTelegramBotEnabled("777777777", bots)).toBe(true);
    expect(isTelegramBotEnabled("missing-bot", bots)).toBe(false);
    expect(
      verifyTelegramMiniAppInitData(
        signedInitData(disabledToken),
        bots,
        2000000001,
      ),
    ).toBeUndefined();
    expect(
      verifyTelegramMiniAppInitData(
        signedInitData(fallbackToken),
        bots,
        2000000001,
      ),
    ).toMatchObject({ authenticatedBotId: "777777777" });
  });

  it("returns only enabled public Bot entry URLs for session recovery", () => {
    const source = JSON.stringify([
      {
        botId: "700000001",
        botToken: "m".repeat(24),
        enabled: true,
        entryUrl: "https://t.me/payease_primary?startapp=apply",
      },
      {
        botId: "700000002",
        botToken: "n".repeat(24),
        enabled: false,
        entryUrl: "https://t.me/payease_recovery",
      },
      {
        botId: "700000003",
        botToken: "o".repeat(24),
        enabled: true,
        entryUrl: "https://t.me/payease_recovery",
      },
    ]);
    expect(enabledTelegramBotEntryUrls(source)).toEqual([
      "https://t.me/payease_primary?startapp=apply",
      "https://t.me/payease_recovery",
    ]);
    expect(() =>
      configuredTelegramBots(
        JSON.stringify([
          {
            botId: "700000004",
            botToken: "p".repeat(24),
            entryUrl: "http://not-telegram.example/unsafe",
          },
        ]),
      ),
    ).toThrow("entry URL is invalid");
  });
});
