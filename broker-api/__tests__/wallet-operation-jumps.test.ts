import { describe, expect, it } from "vitest";

import {
  buildWalletOperationJump,
  configuredWalletOperationJumpSettings,
} from "../src/wallet-operation-jumps.js";

describe("wallet operation jump settings", () => {
  it("derives a default allowlist from the configured SMILE wallet URL", () => {
    const settings = configuredWalletOperationJumpSettings({
      PAYEASE_SMILE_WALLET_BASE_URL: "https://wallet.smile.test/entry",
    });
    expect(settings).toMatchObject({
      ttlSeconds: 900,
    });
    expect(settings?.allowedHosts).toEqual(new Set(["wallet.smile.test"]));
  });

  it("rejects non-HTTPS SMILE wallet URLs", () => {
    expect(() =>
      configuredWalletOperationJumpSettings({
        PAYEASE_SMILE_WALLET_BASE_URL: "http://wallet.smile.test/entry",
      }),
    ).toThrow(/HTTPS/i);
  });

  it("builds a signed jump URL bound to the configured host", () => {
    const settings = configuredWalletOperationJumpSettings({
      PAYEASE_SMILE_WALLET_BASE_URL: "https://wallet.smile.test/entry",
      PAYEASE_SMILE_WALLET_ALLOWED_HOSTS: "wallet.smile.test",
      PAYEASE_WALLET_JUMP_TTL_SECONDS: "300",
    });
    expect(settings).toBeDefined();
    const jump = buildWalletOperationJump({
      settings: settings!,
      operationType: "REPAYMENT",
    });
    const url = new URL(jump.walletOperationUrl);
    expect(url.origin).toBe("https://wallet.smile.test");
    expect(url.pathname).toBe("/entry");
    expect(url.searchParams.get("jump_ref")).toBe(jump.walletOperationJumpRef);
    expect(url.searchParams.get("jump_token")).toBeNull();
    const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
    expect(fragment.get("jump_token")).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(fragment.get("jump_token")).not.toContain("telegram");
    expect(fragment.get("jump_token")).not.toContain("APP-20260830-001");
    expect(jump.targetHost).toBe("wallet.smile.test");
  });
});
