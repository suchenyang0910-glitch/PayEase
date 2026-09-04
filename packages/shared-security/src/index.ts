import { z } from "zod";
import { MoneySchema, moneySafeParse, type Money } from "@payease/shared-money";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type PiiClass = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";

export const PII_CLASS_LABELS: ReadonlyArray<PiiClass> = [
  "PUBLIC",
  "INTERNAL",
  "CONFIDENTIAL",
  "RESTRICTED",
];

export const PII_CLASS_META: Record<
  PiiClass,
  {
    readonly label: string;
    readonly examples: ReadonlyArray<string>;
    readonly requiresMaskDepth: number;
  }
> = {
  PUBLIC: { label: "公开", examples: ["产品名"], requiresMaskDepth: 0 },
  INTERNAL: { label: "内部", examples: ["内部工单ID"], requiresMaskDepth: 1 },
  CONFIDENTIAL: {
    label: "敏感",
    examples: ["手机号", "邮箱"],
    requiresMaskDepth: 2,
  },
  RESTRICTED: {
    label: "受限 (PCI/AML/KBA)",
    examples: ["身份证号", "银行卡号", "KYC 照片", "签名密文"],
    requiresMaskDepth: 3,
  },
};

export interface PiiTagged<T> {
  readonly __piiClass: PiiClass;
  readonly value: T;
}

export const asPii = <T>(value: T, cls: PiiClass): PiiTagged<T> => ({
  __piiClass: cls,
  value,
});

export const piiOf = <T>(tagged: PiiTagged<T>): T => tagged.value;

export const KH_NATIONAL_ID_RE = /^\d{9,12}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const GENERIC_PHONE_RE = /^\+?[0-9]{8,16}$/;
export const CARD_PAN_RE = /^\d{13,19}$/;

const MASK_CHAR = "*";

const maskMiddle = (
  raw: string,
  keepHead: number,
  keepTail: number,
  minLen = 6,
): string => {
  if (typeof raw !== "string") return "";
  if (raw.length < keepHead + keepTail + minLen) {
    return MASK_CHAR.repeat(Math.max(raw.length, 1));
  }
  const head = raw.slice(0, keepHead);
  const tail = raw.slice(-keepTail);
  const midLen = raw.length - keepHead - keepTail;
  return `${head}${MASK_CHAR.repeat(midLen)}${tail}`;
};

export const maskKhNationalId = (nationalId: string): string => {
  if (!nationalId) return "";
  return maskMiddle(nationalId.replace(/\s|-/g, ""), 2, 2, 2);
};

export const maskPhone = (phone: string): string => {
  if (!phone) return "";
  const digits = phone.replace(/[^\d+]/g, "");
  return maskMiddle(digits, 3, 4, 2);
};

export const maskCardPan = (pan: string): string => {
  if (!pan) return "";
  const digits = pan.replace(/\s|-/g, "");
  if (!CARD_PAN_RE.test(digits)) return MASK_CHAR.repeat(8);
  return maskMiddle(digits, 4, 4, 8);
};

export const maskEmail = (email: string): string => {
  if (!email) return "";
  const parts = email.split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1])
    return MASK_CHAR.repeat(5) + "@***";
  const local = parts[0]!;
  const domain = parts[1]!;
  const maskedLocal =
    local.length <= 2
      ? MASK_CHAR.repeat(local.length)
      : maskMiddle(local, 1, 1, 3);
  return `${maskedLocal}@${maskDomainTail(domain)}`;
};

const maskDomainTail = (domain: string): string => {
  const parts = domain.split(".");
  if (parts.length < 2) return MASK_CHAR.repeat(Math.max(domain.length, 3));
  const tld = parts[parts.length - 1]!;
  const host = parts.slice(0, -1).join(".");
  return `${maskMiddle(host, 1, 1, 2)}.${tld}`;
};

export const maskGeneric = (value: string): string =>
  maskMiddle(value, 1, 1, 3);

export const assertMoneyShape = <T extends object>(
  obj: T,
  keys: ReadonlyArray<keyof T>,
): void => {
  for (const k of keys) {
    const v = obj[k];
    if (v === null || v === undefined) continue;
    if (typeof v !== "object") {
      throw new TypeError(
        `Money guard failed for key ${String(k)}: expected object Money but got ${typeof v}`,
      );
    }
    const parsed = moneySafeParse(v);
    if (!parsed.success) {
      throw new TypeError(
        `Money guard failed for key ${String(k)}: ${parsed.error.issues
          .map((i) => `${i.path.join(".")} ${i.message}`)
          .join("; ")}`,
      );
    }
  }
};

export const MoneyGuardSchema = MoneySchema;

export const PositiveMoneySchema = MoneySchema.refine(
  (m) => {
    const p = moneySafeParse(m);
    return p.success && BigInt(p.data.amountMinor) > 0n;
  },
  { message: "amountMinor must be a positive integer string" },
);

export const NonNegativeMoneySchema = MoneySchema.refine(
  (m) => {
    const p = moneySafeParse(m);
    return p.success && BigInt(p.data.amountMinor) >= 0n;
  },
  { message: "amountMinor must be a non-negative integer string" },
);

export const moneyFromAny = (any: unknown): Money => MoneySchema.parse(any);

export type MaskFn = (v: string) => string;

const MASK_MAP: Record<string, MaskFn> = {
  kh_national_id: maskKhNationalId,
  phone: maskPhone,
  card_pan: maskCardPan,
  email: maskEmail,
  generic: maskGeneric,
};

export const PII_MASK_KEYS = Object.freeze(Object.keys(MASK_MAP));

export const maskByType = (type: string, value: string): string => {
  const fn = MASK_MAP[type] ?? maskGeneric;
  return fn(value);
};

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
  "WALLET_CREDIT_CONFIRMED",
  "WALLET_OPERATION_RESULT",
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
  configuredSecrets: Readonly<
    Record<
      string,
      Readonly<{
        algorithm: DomainEventAlgorithm;
        sourceDomain: DomainEventSourceDomain;
        secret: string;
      }>
    >
  >;
}): boolean {
  const configured = args.configuredSecrets[args.headers.keyId];
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

export const walletBrokerExchangeHeadersSchema = z.object({
  algorithm: z.literal("HMAC-SHA256"),
  keyId: z.string().min(3).max(64),
  nonce: z.string().min(12).max(128),
  timestampMillis: z.string().regex(/^\d{13}$/),
  signature: z.string().regex(/^[A-Fa-f0-9]{64}$/),
});

export const walletBrokerExchangeRequestSchema = z
  .object({
    jumpRef: z.string().regex(/^woj_[A-Za-z0-9]{24,64}$/),
    jumpToken: z.string().min(20).max(256),
    operationType: z.enum(["WITHDRAWAL", "REPAYMENT"]),
  })
  .strict();

export const walletBrokerExchangeResponseSchema = z
  .object({
    applicationNo: z.string().min(1),
    walletOperationJumpRef: z.string().regex(/^woj_[A-Za-z0-9]{24,64}$/),
    operationType: z.enum(["WITHDRAWAL", "REPAYMENT"]),
    externalWalletRef: z.string().min(3).max(128).nullable(),
    walletStatus: z.string().min(3).max(64),
    availableBalanceMinor: z.string().regex(/^\d+$/),
    currency: z.literal("USD"),
    brokerSessionNonce: z.string().min(12).max(128),
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type WalletBrokerExchangeHeaders = z.infer<
  typeof walletBrokerExchangeHeadersSchema
>;
export type WalletBrokerExchangeRequest = z.infer<
  typeof walletBrokerExchangeRequestSchema
>;
export type WalletBrokerExchangeResponse = z.infer<
  typeof walletBrokerExchangeResponseSchema
>;
