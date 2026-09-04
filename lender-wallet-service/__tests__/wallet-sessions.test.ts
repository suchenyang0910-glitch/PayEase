import { describe, expect, it } from "vitest";
import { WalletSessionStore } from "../src/wallet-sessions.js";

describe("wallet sessions", () => {
  it("creates and reads a non-expired session", () => {
    const store = new WalletSessionStore();
    const session = store.create({
      applicationNo: "APP-20260831-001",
      walletOperationJumpRef: "woj_1234567890abcdef1234567890abcd",
      operationType: "WITHDRAWAL",
      externalWalletRef: "wallet-ext-001",
      walletStatus: "WALLET_AVAILABLE",
      availableBalanceMinor: "25000",
      currency: "USD",
      expiresAt: "2099-08-31T00:00:00.000Z",
    });
    expect(store.get(session.sessionToken)).toMatchObject({
      applicationNo: "APP-20260831-001",
      operationType: "WITHDRAWAL",
    });
  });

  it("drops an expired session on read", () => {
    const store = new WalletSessionStore();
    const session = store.create({
      applicationNo: "APP-20260831-002",
      walletOperationJumpRef: "woj_abcdef1234567890abcdef1234567890",
      operationType: "REPAYMENT",
      externalWalletRef: null,
      walletStatus: "WALLET_PENDING",
      availableBalanceMinor: "0",
      currency: "USD",
      expiresAt: "2020-01-01T00:00:00.000Z",
    });
    expect(
      store.get(session.sessionToken, Date.parse("2026-08-31T00:00:00.000Z")),
    ).toBeUndefined();
  });
});
