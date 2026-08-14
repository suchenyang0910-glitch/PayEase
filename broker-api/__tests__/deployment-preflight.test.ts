import { describe, expect, it } from "vitest";
import {
  serializeDeploymentPreflight,
  telegramAuthenticationPreflight,
} from "../src/deployment-preflight.js";

const validRecoveryBots = JSON.stringify([
  {
    botId: "123456789",
    botToken: "preflight-token-one-not-real-00001",
    enabled: true,
  },
  {
    botId: "987654321",
    botToken: "preflight-token-two-not-real-00002",
    enabled: true,
  },
]);
const validPiiKey = Buffer.alloc(32, 4).toString("base64");

describe("Telegram deployment preflight", () => {
  it("reports safe Bot identifiers for a valid recovery topology", () => {
    expect(
      telegramAuthenticationPreflight({
        PAYEASE_DEPLOYMENT_MODE: "production",
        TELEGRAM_BOTS_JSON: validRecoveryBots,
        PAYEASE_PII_ENCRYPTION_KEY: validPiiKey,
      }),
    ).toEqual({
      ready: true,
      authenticationRequired: true,
      controlledPreview: false,
      configuredBotIds: ["123456789", "987654321"],
      enabledBotCount: 2,
      piiEncryptionRequired: true,
      piiEncryptionReady: true,
      piiActiveKeyVersion: "v1",
    });
  });

  it("fails before a replacement when an authenticated deployment has no recovery Bot", () => {
    const result = telegramAuthenticationPreflight({
      PAYEASE_DEPLOYMENT_MODE: "production",
      TELEGRAM_BOTS_JSON: JSON.stringify([
        {
          botId: "123456789",
          botToken: "preflight-token-one-not-real-00001",
          enabled: true,
        },
      ]),
      PAYEASE_PII_ENCRYPTION_KEY: validPiiKey,
    });
    expect(result.ready).toBe(false);
    expect(result.error).toContain("at least two distinct Telegram bots");
    expect(result.configuredBotIds).toEqual(["123456789"]);
    expect(result.enabledBotCount).toBe(1);
  });

  it("allows only an explicit unauthenticated controlled preview without Bots", () => {
    expect(
      telegramAuthenticationPreflight({
        PAYEASE_DEPLOYMENT_MODE: "controlled-preview",
        REQUIRE_TELEGRAM_AUTH: "false",
        PAYEASE_ALLOW_UNAUTHENTICATED_PREVIEW: "true",
      }),
    ).toEqual({
      ready: true,
      authenticationRequired: false,
      controlledPreview: true,
      configuredBotIds: [],
      enabledBotCount: 0,
      piiEncryptionRequired: false,
      piiEncryptionReady: true,
    });
  });

  it("fails before an authenticated deployment when the active PII key is absent", () => {
    const result = telegramAuthenticationPreflight({
      PAYEASE_DEPLOYMENT_MODE: "production",
      TELEGRAM_BOTS_JSON: validRecoveryBots,
    });
    expect(result.ready).toBe(false);
    expect(result.piiEncryptionRequired).toBe(true);
    expect(result.piiEncryptionReady).toBe(false);
    expect(result.error).toContain("PAYEASE_PII_ENCRYPTION_KEY is required");
  });

  it("serializes only operational metadata and never deployment secrets", () => {
    const output = serializeDeploymentPreflight({
      PAYEASE_DEPLOYMENT_MODE: "production",
      TELEGRAM_BOTS_JSON: validRecoveryBots,
      PAYEASE_PII_ENCRYPTION_KEY: validPiiKey,
    });

    expect(JSON.parse(output)).toMatchObject({
      ready: true,
      configuredBotIds: ["123456789", "987654321"],
      piiActiveKeyVersion: "v1",
    });
    expect(output).not.toContain("preflight-token-one-not-real-00001");
    expect(output).not.toContain("preflight-token-two-not-real-00002");
    expect(output).not.toContain(validPiiKey);
  });
});
