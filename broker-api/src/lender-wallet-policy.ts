import { isControlledPreview } from "./telegram-auth-policy.js";

type LenderWalletEnvironment = Readonly<{
  PAYEASE_DEPLOYMENT_MODE?: string;
  PAYEASE_LENDER_WALLET_INTEGRATION_ENABLED?: string;
}>;

/**
 * A controlled preview may validate Telegram and KYC before a separately
 * operated lender wallet is connected. This is opt-in and must never weaken a
 * non-preview deployment: production defaults to, and requires, the mTLS
 * wallet integration.
 */
export function isLenderWalletIntegrationEnabled(
  environment: LenderWalletEnvironment = process.env,
): boolean {
  const configured = environment.PAYEASE_LENDER_WALLET_INTEGRATION_ENABLED;
  if (configured === undefined || configured.trim() === "") {
    return !isControlledPreview(environment);
  }
  if (configured === "true") return true;
  if (configured === "false" && isControlledPreview(environment)) return false;
  if (configured === "false") {
    throw new Error(
      "PAYEASE_LENDER_WALLET_INTEGRATION_ENABLED=false is only allowed in controlled-preview mode.",
    );
  }
  throw new Error(
    "PAYEASE_LENDER_WALLET_INTEGRATION_ENABLED must be true or false when configured.",
  );
}
