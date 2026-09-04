import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * ABA PayWay is intentionally isolated from the generic channel simulator.
 * No outbound payment or payout is enabled here: that requires a merchant
 * sandbox account, beneficiary whitelisting, and an approved channel runbook.
 */
export const abaPayWayEnvironmentSchema = z.enum(["sandbox", "production"]);
export type AbaPayWayEnvironment = z.infer<typeof abaPayWayEnvironmentSchema>;

const ABA_PAYWAY_ORIGINS: Readonly<Record<AbaPayWayEnvironment, string>> = {
  sandbox: "https://checkout-sandbox.payway.com.kh",
  production: "https://checkout.payway.com.kh",
};

export type AbaPayWayConfig = Readonly<{
  environment: AbaPayWayEnvironment;
  merchantId: string;
  callbackSecret: string;
  checkoutOrigin: string;
}>;

export function resolveAbaPayWayConfig(
  values: Readonly<Record<string, string | undefined>> = process.env,
): AbaPayWayConfig | undefined {
  const environment = values.PAYEASE_ABA_PAYWAY_ENVIRONMENT;
  const merchantId = values.PAYEASE_ABA_PAYWAY_MERCHANT_ID;
  const callbackSecret = values.PAYEASE_ABA_PAYWAY_CALLBACK_SECRET;
  const supplied = [environment, merchantId, callbackSecret].filter(
    (value) => value !== undefined && value !== "",
  ).length;

  if (supplied === 0) return undefined;
  if (supplied !== 3) {
    throw new Error("PAYEASE_ABA_PAYWAY_CONFIGURATION_INCOMPLETE");
  }

  const parsedEnvironment = abaPayWayEnvironmentSchema.parse(environment);
  if (!merchantId || !callbackSecret) {
    throw new Error("PAYEASE_ABA_PAYWAY_CONFIGURATION_INCOMPLETE");
  }
  return {
    environment: parsedEnvironment,
    merchantId,
    callbackSecret,
    checkoutOrigin: ABA_PAYWAY_ORIGINS[parsedEnvironment],
  };
}

/** Only fixed official HTTPS origins are permitted; callers cannot supply a URL. */
export function abaPayWayCheckoutUrl(config: AbaPayWayConfig): URL {
  return new URL("/api/payment-gateway/v3/checkout", config.checkoutOrigin);
}

const callbackScalarSchema = z.union([z.string(), z.number(), z.boolean()]);

export const abaPayWayCallbackPayloadSchema = z
  .object({
    tran_id: z.string().min(1).max(128),
    status: z.union([z.string(), z.number()]),
  })
  .catchall(z.union([callbackScalarSchema, z.array(callbackScalarSchema)]));

/**
 * PayWay callback signing canonicalisation: keys sorted ascending, values
 * concatenated, arrays serialised as JSON, then HMAC-SHA512/Base64.
 * Object-valued fields are rejected rather than silently canonicalised.
 */
export function abaPayWayCallbackSigningMessage(
  payload: Readonly<Record<string, unknown>>,
): string {
  return Object.keys(payload)
    .sort((left, right) => left.localeCompare(right))
    .map((key) => {
      const value = payload[key];
      if (Array.isArray(value)) return JSON.stringify(value);
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        return String(value);
      }
      throw new Error("ABA_PAYWAY_CALLBACK_UNSUPPORTED_VALUE");
    })
    .join("");
}

export function verifyAbaPayWayCallback(
  args: Readonly<{
    payload: Record<string, unknown>;
    signature: string | string[] | undefined;
    callbackSecret: string;
  }>,
): boolean {
  if (typeof args.signature !== "string" || args.signature.trim() === "") {
    return false;
  }
  try {
    abaPayWayCallbackPayloadSchema.parse(args.payload);
    const expected = createHmac("sha512", args.callbackSecret)
      .update(abaPayWayCallbackSigningMessage(args.payload))
      .digest();
    const actual = Buffer.from(args.signature.trim(), "base64");
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  } catch {
    return false;
  }
}
