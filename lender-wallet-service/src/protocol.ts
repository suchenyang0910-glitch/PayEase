import { z } from "zod";
import {
  createOutgoingDomainEvent,
  sha256Hex,
  signDomainEventRequest,
  stableJson,
  walletBrokerExchangeHeadersSchema,
  walletBrokerExchangeRequestSchema,
  walletBrokerExchangeResponseSchema as sharedWalletBrokerExchangeResponseSchema,
  type DomainEventEnvelope,
  type WalletBrokerExchangeRequest,
} from "@payease/shared-security";
import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

const brokerJumpExchangeResponseSchema =
  sharedWalletBrokerExchangeResponseSchema.strict();

export const walletChannelCallbackHeadersSchema = z.object({
  algorithm: z.literal("HMAC-SHA256"),
  keyId: z.string().min(3).max(64),
  nonce: z.string().min(12).max(128),
  timestampMillis: z.string().regex(/^\d{13}$/),
  signature: z.string().regex(/^[A-Fa-f0-9]{64}$/),
});

export const walletChannelCallbackRequestSchema = z
  .object({
    provider: z.string().regex(/^[A-Za-z0-9._-]{2,64}$/),
    orderRef: z.string().min(3).max(128),
    callbackRef: z.string().min(8).max(128),
    eventType: z.enum([
      "AUTHORIZED",
      "PROCESSING",
      "SETTLED",
      "FAILED",
      "CANCELLED",
    ]),
    amountMinor: z.string().regex(/^\d+$/).optional(),
    settledAmountMinor: z.string().regex(/^\d+$/).optional(),
    occurredAt: z.string().datetime({ offset: true }),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export function sha256Token(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(args: {
  method: string;
  path: string;
  timestampMillis: string;
  nonce: string;
  keyId: string;
  bodySha256: string;
}): string {
  return [
    args.method.toUpperCase(),
    args.path,
    args.bodySha256,
    args.timestampMillis,
    args.nonce,
    args.keyId,
  ].join("\n");
}

export function signWalletBrokerRequest(args: {
  method: string;
  path: string;
  timestampMillis: string;
  nonce: string;
  keyId: string;
  bodySha256: string;
  secret: string;
}): string {
  return createHmac("sha256", args.secret)
    .update(canonical(args))
    .digest("hex");
}

export function verifyWalletBrokerRequest(args: {
  method: string;
  path: string;
  timestampMillis: string;
  nonce: string;
  keyId: string;
  bodySha256: string;
  signature: string;
  secret: string;
}): boolean {
  const expected = signWalletBrokerRequest(args);
  const actualBuffer = Buffer.from(args.signature.toLowerCase(), "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export function walletBrokerRequestHeaders(args: {
  method: string;
  path: string;
  payload: Record<string, unknown>;
  keyId: string;
  secret: string;
}): Readonly<Record<string, string>> {
  const timestampMillis = String(Date.now());
  const nonce = `wallet-${randomUUID()}`;
  const bodySha256 = sha256Hex(stableJson(args.payload));
  return {
    "x-payease-wallet-algo": "HMAC-SHA256",
    "x-payease-wallet-key-id": args.keyId,
    "x-payease-wallet-timestamp-millis": timestampMillis,
    "x-payease-wallet-nonce": nonce,
    "x-payease-wallet-signature": signWalletBrokerRequest({
      method: args.method,
      path: args.path,
      timestampMillis,
      nonce,
      keyId: args.keyId,
      bodySha256,
      secret: args.secret,
    }),
  };
}

export function signWalletChannelCallbackRequest(args: {
  method: string;
  path: string;
  timestampMillis: string;
  nonce: string;
  keyId: string;
  bodySha256: string;
  secret: string;
}): string {
  return createHmac("sha256", args.secret)
    .update(
      canonical({
        method: args.method,
        path: args.path,
        timestampMillis: args.timestampMillis,
        nonce: args.nonce,
        keyId: args.keyId,
        bodySha256: args.bodySha256,
      }),
    )
    .digest("hex");
}

export function verifyWalletChannelCallbackRequest(args: {
  method: string;
  path: string;
  timestampMillis: string;
  nonce: string;
  keyId: string;
  bodySha256: string;
  signature: string;
  secret: string;
}): boolean {
  const expected = signWalletChannelCallbackRequest(args);
  const actualBuffer = Buffer.from(args.signature.toLowerCase(), "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export function walletChannelCallbackHeaders(args: {
  method: string;
  path: string;
  payload: Record<string, unknown>;
  keyId: string;
  secret: string;
}): Readonly<Record<string, string>> {
  const timestampMillis = String(Date.now());
  const nonce = `wallet-channel-${randomUUID()}`;
  const bodySha256 = sha256Hex(stableJson(args.payload));
  return {
    "x-payease-wallet-callback-algo": "HMAC-SHA256",
    "x-payease-wallet-callback-key-id": args.keyId,
    "x-payease-wallet-callback-timestamp-millis": timestampMillis,
    "x-payease-wallet-callback-nonce": nonce,
    "x-payease-wallet-callback-signature": signWalletChannelCallbackRequest({
      method: args.method,
      path: args.path,
      timestampMillis,
      nonce,
      keyId: args.keyId,
      bodySha256,
      secret: args.secret,
    }),
  };
}

export function createWalletStatusEvent(args: {
  applicationNo: string;
  externalWalletRef: string;
  availableBalanceMinor: string;
  idempotencyKey: string;
  eventId?: string;
  occurredAt?: string;
}): DomainEventEnvelope {
  return createOutgoingDomainEvent({
    eventId:
      args.eventId ?? `evt_wallet_credit_${randomUUID().replaceAll("-", "")}`,
    eventType: "WALLET_CREDIT_CONFIRMED",
    sourceDomain: "LENDER",
    occurredAt: args.occurredAt ?? new Date().toISOString(),
    idempotencyKey: args.idempotencyKey,
    externalApplicationRef: args.applicationNo,
    payload: {
      externalWalletRef: args.externalWalletRef,
      walletStatus: "WALLET_AVAILABLE",
      availableBalanceMinor: args.availableBalanceMinor,
      currency: "USD",
    },
  });
}

export function createWalletOperationResultEvent(args: {
  applicationNo: string;
  externalWalletRef: string;
  orderRef: string;
  operationType: "WITHDRAWAL" | "REPAYMENT";
  operationStatus: "AUTHORIZED" | "PROCESSING" | "SETTLED" | "FAILED";
  requestedAmountMinor: string;
  settledAmountMinor: string | null;
  idempotencyKey: string;
  eventId?: string;
  occurredAt?: string;
}): DomainEventEnvelope {
  return createOutgoingDomainEvent({
    eventId:
      args.eventId ??
      `evt_wallet_operation_${randomUUID().replaceAll("-", "")}`,
    eventType: "WALLET_OPERATION_RESULT",
    sourceDomain: "LENDER",
    occurredAt: args.occurredAt ?? new Date().toISOString(),
    idempotencyKey: args.idempotencyKey,
    externalApplicationRef: args.applicationNo,
    payload: {
      externalWalletRef: args.externalWalletRef,
      orderRef: args.orderRef,
      operationType: args.operationType,
      operationStatus: args.operationStatus,
      requestedAmountMinor: args.requestedAmountMinor,
      settledAmountMinor: args.settledAmountMinor,
      currency: "USD",
    },
  });
}

export {
  walletBrokerExchangeHeadersSchema,
  walletBrokerExchangeRequestSchema as brokerJumpExchangeRequestSchema,
  brokerJumpExchangeResponseSchema,
};

export type { WalletBrokerExchangeRequest as BrokerJumpExchangeRequest };

export type BrokerJumpExchangeResponse = z.infer<
  typeof brokerJumpExchangeResponseSchema
>;
export type WalletChannelCallbackHeaders = z.infer<
  typeof walletChannelCallbackHeadersSchema
>;
export type WalletChannelCallbackRequest = z.infer<
  typeof walletChannelCallbackRequestSchema
>;
