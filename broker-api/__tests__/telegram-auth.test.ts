import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  configuredTelegramBots,
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
  it("accepts initData from any enabled trusted bot and normalizes the user", () => {
    const firstToken = "a".repeat(24);
    const secondToken = "b".repeat(24);
    const bots = configuredTelegramBots(
      JSON.stringify([
        { botId: "111111111", botToken: firstToken, enabled: false },
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
        signedInitData(firstToken),
        bots,
        2000000001,
      ),
    ).toBeUndefined();
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
  });
});
