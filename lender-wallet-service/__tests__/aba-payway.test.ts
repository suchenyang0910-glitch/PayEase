import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  abaPayWayCallbackSigningMessage,
  abaPayWayCheckoutUrl,
  resolveAbaPayWayConfig,
  verifyAbaPayWayCallback,
} from "../src/aba-payway.js";

const sandboxConfig = {
  PAYEASE_ABA_PAYWAY_ENVIRONMENT: "sandbox",
  PAYEASE_ABA_PAYWAY_MERCHANT_ID: "sandbox-merchant",
  PAYEASE_ABA_PAYWAY_CALLBACK_SECRET: "sandbox-callback-secret",
} as const;

describe("ABA PayWay boundary", () => {
  it("stays disabled when ABA has not been configured", () => {
    expect(resolveAbaPayWayConfig({})).toBeUndefined();
    expect(() =>
      resolveAbaPayWayConfig({
        PAYEASE_ABA_PAYWAY_ENVIRONMENT: "sandbox",
      }),
    ).toThrow("PAYEASE_ABA_PAYWAY_CONFIGURATION_INCOMPLETE");
  });

  it("pins checkout to the official sandbox origin", () => {
    const config = resolveAbaPayWayConfig(sandboxConfig);
    expect(config).toBeDefined();
    expect(abaPayWayCheckoutUrl(config!).origin).toBe(
      "https://checkout-sandbox.payway.com.kh",
    );
  });

  it("verifies HMAC-SHA512 callback signatures over sorted fields", () => {
    const payload = {
      tran_id: "PAYEASE-W-001",
      status: "0",
      amount: "25.50",
      items: ["wallet", "withdrawal"],
    } as const;
    const signature = createHmac(
      "sha512",
      sandboxConfig.PAYEASE_ABA_PAYWAY_CALLBACK_SECRET,
    )
      .update(abaPayWayCallbackSigningMessage(payload))
      .digest("base64");

    expect(
      verifyAbaPayWayCallback({
        payload,
        signature,
        callbackSecret: sandboxConfig.PAYEASE_ABA_PAYWAY_CALLBACK_SECRET,
      }),
    ).toBe(true);
    expect(
      verifyAbaPayWayCallback({
        payload: { ...payload, amount: "25.51" },
        signature,
        callbackSecret: sandboxConfig.PAYEASE_ABA_PAYWAY_CALLBACK_SECRET,
      }),
    ).toBe(false);
  });
});
