import { describe, expect, it } from "vitest";
import {
  brokerJumpExchangeRequestSchema,
  createWalletStatusEvent,
  sha256Token,
  verifyWalletChannelCallbackRequest,
  walletChannelCallbackHeaders,
  walletBrokerRequestHeaders,
} from "../src/protocol.js";
import { sha256Hex, stableJson } from "@payease/shared-security";

describe("lender wallet protocol", () => {
  it("accepts the minimal broker jump exchange payload", () => {
    expect(
      brokerJumpExchangeRequestSchema.parse({
        jumpRef: "woj_1234567890abcdef1234567890abcd",
        jumpToken: "abc1234567890defghijklmnopqrstuv",
        operationType: "WITHDRAWAL",
      }),
    ).toMatchObject({
      operationType: "WITHDRAWAL",
    });
  });

  it("hashes opaque wallet ticket fragments without embedding PII", () => {
    const hash = sha256Token("opaque-fragment-token");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain("APP-20260831");
  });

  it("creates a lender wallet credit event and signed transport headers", () => {
    const event = createWalletStatusEvent({
      applicationNo: "APP-20260831-003",
      externalWalletRef: "wallet-ext-003",
      availableBalanceMinor: "8800",
      idempotencyKey: "idem-wallet-credit-003",
    });
    expect(event.eventType).toBe("WALLET_CREDIT_CONFIRMED");
    const headers = walletBrokerRequestHeaders({
      method: "POST",
      path: "/v1/local/domain-events/inbox/receive",
      payload: event,
      keyId: "lender-hmac-v1",
      secret: "lender-test-secret",
    });
    expect(headers["x-payease-wallet-signature"]).toMatch(/^[a-f0-9]{64}$/);
  });

  it("signs and verifies wallet channel callbacks", () => {
    const payload = {
      provider: "bank-sim",
      orderRef: "WALLET-ORDER-001",
      callbackRef: "callback-001",
      eventType: "AUTHORIZED",
      amountMinor: "8800",
      occurredAt: "2026-09-03T10:00:00.000Z",
      metadata: { provider: "bank-sim" },
    } as const;
    const headers = walletChannelCallbackHeaders({
      method: "POST",
      path: "/v1/wallet/channel-callbacks/funds-orders",
      payload,
      keyId: "lender-channel-hmac-v1",
      secret: "channel-test-secret",
    });
    expect(
      verifyWalletChannelCallbackRequest({
        method: "POST",
        path: "/v1/wallet/channel-callbacks/funds-orders",
        timestampMillis: headers["x-payease-wallet-callback-timestamp-millis"]!,
        nonce: headers["x-payease-wallet-callback-nonce"]!,
        keyId: headers["x-payease-wallet-callback-key-id"]!,
        bodySha256: sha256Hex(stableJson(payload)),
        signature: headers["x-payease-wallet-callback-signature"]!,
        secret: "channel-test-secret",
      }),
    ).toBe(true);
  });
});
