import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const DOMAIN_EVENT_SOURCE_DOMAINS = ["BROKER", "LENDER"] as const;
export const DOMAIN_EVENT_TARGET_DOMAINS = ["BROKER", "LENDER"] as const;
export const DOMAIN_EVENT_TYPES = [
  "APPLICATION_PACKAGE_SUBMITTED",
  "LENDER_APPLICATION_RECEIVED",
  "LENDER_MORE_INFO_REQUIRED",
  "LENDER_DECISION_AVAILABLE",
  "CONTRACT_EVIDENCE_SUBMITTED",
  "EMPLOYER_DEDUCTION_REPORTED",
  "DISBURSEMENT_CONFIRMED",
  "COLLECTION_ACCEPTED",
  "COLLECTION_EXCEPTION",
] as const;
export const DOMAIN_EVENT_ALGORITHMS = ["HMAC-SHA256"] as const;

export type DomainEventSourceDomain =
  (typeof DOMAIN_EVENT_SOURCE_DOMAINS)[number];
export type DomainEventTargetDomain =
  (typeof DOMAIN_EVENT_TARGET_DOMAINS)[number];
export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[number];
export type DomainEventAlgorithm = (typeof DOMAIN_EVENT_ALGORITHMS)[number];

export const domainEventEnvelopeSchema = z
  .object({
    eventId: z.string().min(8).max(80),
    eventType: z.enum(DOMAIN_EVENT_TYPES),
    eventVersion: z.literal("v1"),
    sourceDomain: z.enum(DOMAIN_EVENT_SOURCE_DOMAINS),
    occurredAt: z.string().datetime({ offset: true }),
    idempotencyKey: z.string().min(8).max(128),
    externalApplicationRef: z.string().min(3).max(128),
    payload: z.record(z.string(), z.unknown()),
    payloadSha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .superRefine((value, context) => {
    const expected = sha256Hex(stableJson(value.payload));
    if (value.payloadSha256 !== expected) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["payloadSha256"],
        message: "payloadSha256 must match the payload body.",
      });
    }
  });

export type DomainEventEnvelope = z.infer<typeof domainEventEnvelopeSchema>;

export const domainEventHeadersSchema = z.object({
  algorithm: z.enum(DOMAIN_EVENT_ALGORITHMS),
  keyId: z.string().min(3).max(64),
  nonce: z.string().min(12).max(128),
  timestampMillis: z.string().regex(/^\d{13}$/),
  signature: z.string().regex(/^[A-Fa-f0-9]{64}$/),
});

export type DomainEventHeaders = z.infer<typeof domainEventHeadersSchema>;

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, nestedValue]) =>
          `${JSON.stringify(key)}:${stableJson(nestedValue)}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function buildDomainEventCanonicalMessage(args: {
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

export function configuredDomainEventSharedSecrets(): Readonly<
  Record<
    string,
    Readonly<{
      algorithm: DomainEventAlgorithm;
      sourceDomain: DomainEventSourceDomain;
      secret: string;
    }>
  >
> {
  return {
    "broker-hmac-v1": {
      algorithm: "HMAC-SHA256",
      sourceDomain: "BROKER",
      secret:
        process.env.PAYEASE_BROKER_EVENT_SHARED_SECRET ??
        `broker_test_only_${"*".repeat(40)}`,
    },
    "lender-hmac-v1": {
      algorithm: "HMAC-SHA256",
      sourceDomain: "LENDER",
      secret:
        process.env.PAYEASE_LENDER_EVENT_SHARED_SECRET ??
        `lender_test_only_${"*".repeat(40)}`,
    },
  };
}

export function signDomainEventRequest(args: {
  method: string;
  path: string;
  timestampMillis: string;
  nonce: string;
  keyId: string;
  bodySha256: string;
  secret: string;
}): string {
  const canonical = buildDomainEventCanonicalMessage(args);
  return createHmac("sha256", args.secret).update(canonical).digest("hex");
}

export function verifyDomainEventSignature(args: {
  method: string;
  path: string;
  headers: DomainEventHeaders;
  bodySha256: string;
  sourceDomain: DomainEventSourceDomain;
  secrets?: ReturnType<typeof configuredDomainEventSharedSecrets>;
}): boolean {
  const secrets = args.secrets ?? configuredDomainEventSharedSecrets();
  const configured = secrets[args.headers.keyId];
  if (
    !configured ||
    configured.algorithm !== args.headers.algorithm ||
    configured.sourceDomain !== args.sourceDomain
  ) {
    return false;
  }
  const expected = signDomainEventRequest({
    method: args.method,
    path: args.path,
    timestampMillis: args.headers.timestampMillis,
    nonce: args.headers.nonce,
    keyId: args.headers.keyId,
    bodySha256: args.bodySha256,
    secret: configured.secret,
  });
  const actualBuffer = Buffer.from(args.headers.signature.toLowerCase(), "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export function isDomainEventTimestampWithinWindow(args: {
  timestampMillis: string;
  now?: number;
  maxSkewMillis?: number;
}): boolean {
  const now = args.now ?? Date.now();
  const maxSkewMillis = args.maxSkewMillis ?? 300_000;
  const timestamp = Number(args.timestampMillis);
  return (
    Number.isFinite(timestamp) && Math.abs(now - timestamp) <= maxSkewMillis
  );
}

export function createOutgoingDomainEvent(args: {
  eventId: string;
  eventType: DomainEventType;
  sourceDomain: DomainEventSourceDomain;
  occurredAt: string;
  idempotencyKey: string;
  externalApplicationRef: string;
  payload: Record<string, unknown>;
}): DomainEventEnvelope {
  return domainEventEnvelopeSchema.parse({
    ...args,
    eventVersion: "v1",
    payloadSha256: sha256Hex(stableJson(args.payload)),
  });
}
