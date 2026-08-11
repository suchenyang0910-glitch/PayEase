import { z } from "zod";
import { MoneySchema, moneySafeParse, type Money } from "@payease/shared-money";

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
