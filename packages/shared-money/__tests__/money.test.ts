import { describe, expect, test } from "vitest";
import {
  MoneySchema,
  ZeroMoney,
  moneyAdd,
  moneySub,
  moneyMulScalar,
  moneyDivScalar,
  moneyEq,
  moneyGt,
  moneyLt,
  moneyCmp,
  moneyNegate,
  moneyAbs,
  moneyIsZero,
  moneyIsPositive,
  moneyIsNegative,
  fromMajor,
  toMajorString,
  formatHuman,
  moneySum,
  moneySafeParse,
  type Money,
} from "../src/index";

describe("@payease/shared-money (CI-10 amountMinor string, never number)", () => {
  const kh100: Money = { amountMinor: "100", currency: "KHR" };
  const kh200: Money = { amountMinor: "200", currency: "KHR" };
  const us150: Money = { amountMinor: "150", currency: "USD" };
  const us325: Money = { amountMinor: "325", currency: "USD" };

  test("MoneySchema: amountMinor must be string integer; number or decimal rejected", () => {
    expect(
      MoneySchema.safeParse({ amountMinor: "150", currency: "USD" }).success,
    ).toBe(true);
    expect(
      MoneySchema.safeParse({ amountMinor: "150.5", currency: "USD" }).success,
    ).toBe(false);
    const badNumber = MoneySchema.safeParse({
      amountMinor: 150,
      currency: "USD",
    } as unknown as Money);
    expect(badNumber.success).toBe(false);
    expect(
      (
        badNumber as {
          success: false;
          error: { issues: Array<{ message: string }> };
        }
      ).error.issues[0].message,
    ).toContain("never number");
    expect(
      MoneySchema.safeParse({ amountMinor: "150", currency: "EUR" }).success,
    ).toBe(false);
  });

  test("ZeroMoney is type-consistent", () => {
    expect(ZeroMoney("KHR")).toEqual({ amountMinor: "0", currency: "KHR" });
    expect(ZeroMoney("USD")).toEqual({ amountMinor: "0", currency: "USD" });
  });

  test("add/sub same currency; cross-currency throws", () => {
    expect(moneyAdd(kh100, kh200)).toEqual({
      amountMinor: "300",
      currency: "KHR",
    });
    expect(moneySub(kh200, kh100)).toEqual({
      amountMinor: "100",
      currency: "KHR",
    });
    expect(() => moneyAdd(kh100, us150)).toThrow(/currency mismatch/);
  });

  test("mul/div scalar round half even", () => {
    const tax = moneyMulScalar(
      { amountMinor: "1000", currency: "USD" },
      "0.07",
    );
    expect(tax.amountMinor).toBe("70");
    const threeWay = moneyDivScalar(
      { amountMinor: "1000", currency: "USD" },
      3,
    );
    expect(threeWay.amountMinor).toBe("333");
  });

  test("compare + eq", () => {
    expect(moneyEq(us150, { amountMinor: "150", currency: "USD" })).toBe(true);
    expect(moneyGt(us325, us150)).toBe(true);
    expect(moneyLt(us150, us325)).toBe(true);
    expect(moneyCmp(us150, us325)).toBe(-1);
    expect(moneyCmp(us325, us150)).toBe(1);
    expect(moneyCmp(us150, { amountMinor: "150", currency: "USD" })).toBe(0);
  });

  test("negate / abs / signs", () => {
    const neg = moneyNegate(kh100);
    expect(neg.amountMinor).toBe("-100");
    expect(moneyAbs(neg)).toEqual(kh100);
    expect(moneyIsZero(ZeroMoney("KHR"))).toBe(true);
    expect(moneyIsPositive(kh100)).toBe(true);
    expect(moneyIsNegative(neg)).toBe(true);
  });

  test("fromMajor / toMajorString for KHR (无 minor) 与 USD (2 位小数)", () => {
    const kh = fromMajor(1234, "KHR");
    expect(kh.amountMinor).toBe("1234");
    const us = fromMajor("12.345", "USD");
    // 银行家舍入 roundHalfEven: 1234.5 前一位偶数 4 → 1234；若为 1235.5 → 1236
    expect(us.amountMinor).toBe("1234");
    const usUp = fromMajor("12.355", "USD");
    // 12.355 * 100 = 1235.5，前一位奇数 5 → 进位 1236
    expect(usUp.amountMinor).toBe("1236");
    expect(toMajorString({ amountMinor: "1234", currency: "KHR" })).toBe(
      "1234",
    );
    expect(toMajorString({ amountMinor: "1234", currency: "USD" })).toBe(
      "12.34",
    );
  });

  test("formatHuman", () => {
    expect(formatHuman({ amountMinor: "12345", currency: "USD" })).toContain(
      "123.45 USD",
    );
    expect(formatHuman({ amountMinor: "12345", currency: "KHR" })).toContain(
      "12345 KHR",
    );
  });

  test("moneySum + currency guard", () => {
    const list: Money[] = [
      { amountMinor: "100", currency: "USD" },
      { amountMinor: "250", currency: "USD" },
      { amountMinor: "75", currency: "USD" },
    ];
    expect(moneySum(list, "USD")).toEqual({
      amountMinor: "425",
      currency: "USD",
    });
    expect(moneySum([], "KHR")).toEqual(ZeroMoney("KHR"));
    expect(() =>
      moneySum(
        [
          { amountMinor: "1", currency: "USD" },
          { amountMinor: "1", currency: "KHR" },
        ],
        "USD",
      ),
    ).toThrow(/mixed currency/);
  });

  test("large amountMinor: exceeds MAX_SAFE_INTEGER (2^53-1) still precise as string + big.js", () => {
    const huge = "9999999999999999999999";
    const a: Money = { amountMinor: huge, currency: "USD" };
    const b: Money = { amountMinor: "1", currency: "USD" };
    expect(moneyAdd(a, b).amountMinor).toBe("10000000000000000000000");
    const parsed = moneySafeParse({ amountMinor: huge, currency: "USD" });
    expect(parsed.success).toBe(true);
  });
});
