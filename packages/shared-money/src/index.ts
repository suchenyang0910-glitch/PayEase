import Big from "big.js";
import { z } from "zod";

export type Currency = "KHR" | "USD";

export const CURRENCIES: ReadonlyArray<Currency> = ["KHR", "USD"];

export interface Money {
  readonly amountMinor: string;
  readonly currency: Currency;
}

export const CURRENCY_META: Record<
  Currency,
  {
    readonly name: string;
    readonly symbol: string;
    readonly decimalDigits: number;
    readonly countryCode: string;
  }
> = {
  KHR: {
    name: "Cambodian Riel",
    symbol: "៛",
    decimalDigits: 0,
    countryCode: "KH",
  },
  USD: { name: "US Dollar", symbol: "$", decimalDigits: 2, countryCode: "US" },
};

const MINOR_RE = /^-?\d+$/;

export const MoneySchema = z.object({
  amountMinor: z
    .string({
      required_error: "amountMinor is required",
      invalid_type_error:
        "amountMinor must be a string (never number), to avoid JS MAX_SAFE_INTEGER precision loss",
    })
    .regex(
      MINOR_RE,
      "amountMinor must be a valid integer string (no decimals)",
    ),
  currency: z.enum(["KHR", "USD"], {
    required_error: "currency is required",
    invalid_type_error: "currency must be KHR or USD",
  }),
});

export const ZeroMoney = (currency: Currency): Money => ({
  amountMinor: "0",
  currency,
});

const assertSameCurrency = (a: Money, b: Money): void => {
  if (a.currency !== b.currency) {
    throw new TypeError(
      `Money currency mismatch: ${a.currency} vs ${b.currency}. Conversion must happen explicitly outside shared-money.`,
    );
  }
};

export const moneyAdd = (a: Money, b: Money): Money => {
  assertSameCurrency(a, b);
  return {
    amountMinor: new Big(a.amountMinor).plus(b.amountMinor).toFixed(0),
    currency: a.currency,
  };
};

export const moneySub = (a: Money, b: Money): Money => {
  assertSameCurrency(a, b);
  return {
    amountMinor: new Big(a.amountMinor).minus(b.amountMinor).toFixed(0),
    currency: a.currency,
  };
};

export const moneyMulScalar = (a: Money, scalar: number | string): Money => ({
  amountMinor: new Big(a.amountMinor)
    .times(scalar)
    .round(0, Big.roundHalfEven)
    .toFixed(0),
  currency: a.currency,
});

export const moneyDivScalar = (a: Money, scalar: number | string): Money => ({
  amountMinor: new Big(a.amountMinor)
    .div(scalar)
    .round(0, Big.roundHalfEven)
    .toFixed(0),
  currency: a.currency,
});

export const moneyEq = (a: Money, b: Money): boolean =>
  a.currency === b.currency && new Big(a.amountMinor).eq(b.amountMinor);

export const moneyGt = (a: Money, b: Money): boolean => {
  assertSameCurrency(a, b);
  return new Big(a.amountMinor).gt(b.amountMinor);
};

export const moneyGte = (a: Money, b: Money): boolean => {
  assertSameCurrency(a, b);
  return new Big(a.amountMinor).gte(b.amountMinor);
};

export const moneyLt = (a: Money, b: Money): boolean => {
  assertSameCurrency(a, b);
  return new Big(a.amountMinor).lt(b.amountMinor);
};

export const moneyLte = (a: Money, b: Money): boolean => {
  assertSameCurrency(a, b);
  return new Big(a.amountMinor).lte(b.amountMinor);
};

export const moneyCmp = (a: Money, b: Money): -1 | 0 | 1 => {
  assertSameCurrency(a, b);
  const c = new Big(a.amountMinor).cmp(b.amountMinor);
  return c < 0 ? -1 : c > 0 ? 1 : 0;
};

export const moneyNegate = (a: Money): Money => ({
  amountMinor: new Big(a.amountMinor).neg().toFixed(0),
  currency: a.currency,
});

export const moneyAbs = (a: Money): Money => ({
  amountMinor: new Big(a.amountMinor).abs().toFixed(0),
  currency: a.currency,
});

export const moneyIsZero = (a: Money): boolean => new Big(a.amountMinor).eq(0);
export const moneyIsPositive = (a: Money): boolean =>
  new Big(a.amountMinor).gt(0);
export const moneyIsNegative = (a: Money): boolean =>
  new Big(a.amountMinor).lt(0);

export const fromMajor = (
  amountMajor: number | string,
  currency: Currency,
): Money => {
  const digits = CURRENCY_META[currency].decimalDigits;
  const factor = new Big(10).pow(digits);
  return {
    amountMinor: new Big(amountMajor)
      .times(factor)
      .round(0, Big.roundHalfEven)
      .toFixed(0),
    currency,
  };
};

export const toMajorBig = (a: Money): Big => {
  const digits = CURRENCY_META[a.currency].decimalDigits;
  return new Big(a.amountMinor).div(new Big(10).pow(digits));
};

export const toMajorString = (a: Money, digits?: number): string => {
  const d =
    digits === undefined ? CURRENCY_META[a.currency].decimalDigits : digits;
  return toMajorBig(a).toFixed(d);
};

export const formatHuman = (a: Money): string => {
  const meta = CURRENCY_META[a.currency];
  const major = toMajorString(a);
  return `${meta.symbol}${major} ${a.currency}`;
};

export const roundHalfEvenMinor = (a: Money): Money => ({
  amountMinor: new Big(a.amountMinor).round(0, Big.roundHalfEven).toFixed(0),
  currency: a.currency,
});

export const assertMoney = (value: unknown): asserts value is Money => {
  MoneySchema.parse(value);
};

export const moneyFromSchema = (value: unknown): Money =>
  MoneySchema.parse(value);

export const moneySafeParse = (
  value: unknown,
): z.SafeParseReturnType<unknown, Money> => MoneySchema.safeParse(value);

export const moneySum = (
  items: ReadonlyArray<Money>,
  currency: Currency,
): Money => {
  if (items.length === 0) return ZeroMoney(currency);
  const bad = items.find((i) => i.currency !== currency);
  if (bad) {
    throw new TypeError(
      `moneySum mixed currency: expected ${currency}, got ${bad.currency}`,
    );
  }
  const total = items.reduce((acc, i) => acc.plus(i.amountMinor), new Big(0));
  return { amountMinor: total.toFixed(0), currency };
};
