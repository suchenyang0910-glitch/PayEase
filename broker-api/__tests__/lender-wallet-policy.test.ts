import { describe, expect, it } from "vitest";
import { isLenderWalletIntegrationEnabled } from "../src/lender-wallet-policy.js";

describe("lender wallet deployment policy", () => {
  it("keeps the integration enabled by default outside an explicit preview", () => {
    expect(
      isLenderWalletIntegrationEnabled({
        PAYEASE_DEPLOYMENT_MODE: "production",
      }),
    ).toBe(true);
  });

  it("requires an explicit enablement value for a lender-enabled preview", () => {
    expect(
      isLenderWalletIntegrationEnabled({
        PAYEASE_DEPLOYMENT_MODE: "controlled-preview",
        PAYEASE_LENDER_WALLET_INTEGRATION_ENABLED: "true",
      }),
    ).toBe(true);
  });

  it("allows a controlled preview to fail closed for wallet operations", () => {
    expect(
      isLenderWalletIntegrationEnabled({
        PAYEASE_DEPLOYMENT_MODE: "controlled-preview",
        PAYEASE_LENDER_WALLET_INTEGRATION_ENABLED: "false",
      }),
    ).toBe(false);
  });

  it("rejects a disabled wallet integration outside controlled preview", () => {
    expect(() =>
      isLenderWalletIntegrationEnabled({
        PAYEASE_DEPLOYMENT_MODE: "production",
        PAYEASE_LENDER_WALLET_INTEGRATION_ENABLED: "false",
      }),
    ).toThrow(/controlled-preview/);
  });
});
