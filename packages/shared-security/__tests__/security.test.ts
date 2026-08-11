import { describe, expect, test } from "vitest";
import {
  maskKhNationalId,
  maskPhone,
  maskCardPan,
  maskEmail,
  maskGeneric,
  assertMoneyShape,
  PositiveMoneySchema,
  NonNegativeMoneySchema,
  asPii,
  piiOf,
  PII_CLASS_META,
  maskByType,
} from "../src/index";

describe("@payease/shared-security (S0.1 PII 脱敏 + Money 运行时守卫 CI-10)", () => {
  test("maskKhNationalId: 9-12 位", () => {
    // 9 位: 首 2 + 中 5 + 末 2
    expect(maskKhNationalId("123456789")).toBe("12*****89");
    // 12 位: 首 2 + 中 8 + 末 2
    expect(maskKhNationalId("1234-5678-9012")).toBe("12********12");
    expect(maskKhNationalId("")).toBe("");
  });

  test("maskPhone: 保留前 3 后 4", () => {
    // +85512345678 共 12 字: +85 首3 / 5678 末4 / 中间 5
    expect(maskPhone("+85512345678")).toBe("+85*****5678");
    // 0123456789 共 10 字: 012 首3 / 6789 末4 / 中间 3
    expect(maskPhone("0123456789")).toBe("012***6789");
    expect(maskPhone("")).toBe("");
  });

  test("maskCardPan: PCI 前 4 后 4，中间全 *; 非 PAN 全星", () => {
    expect(maskCardPan("4111111111111111")).toBe("4111********1111");
    expect(maskCardPan("4111-1111-1111-1111")).toBe("4111********1111");
    expect(maskCardPan("abc")).toBe("********");
    expect(maskCardPan("")).toBe("");
  });

  test("maskEmail: 本地首末字 + 域名 host 首末字脱敏", () => {
    // local=alice.bob(9字): a*******b
    // domain=example.com.kh -> tld=kh, host="example.com"(11字) -> e*********m
    expect(maskEmail("alice.bob@example.com.kh")).toBe(
      "a*******b@e*********m.kh",
    );
    expect(maskEmail("ab@x.io")).toBe("**@*.io");
    expect(maskEmail("notanemail")).toBe("*****@***");
    expect(maskEmail("")).toBe("");
  });

  test("maskGeneric 两端各留 1 字", () => {
    expect(maskGeneric("abcdefghij")).toBe("a********j");
  });

  test("PII tag / untag + class 分级", () => {
    const phonePii = asPii("+85512345678", "CONFIDENTIAL");
    expect(piiOf(phonePii)).toBe("+85512345678");
    expect(phonePii.__piiClass).toBe("CONFIDENTIAL");
    expect(PII_CLASS_META.RESTRICTED.examples).toContain("身份证号");
  });

  test("assertMoneyShape: 合法对象通过; 非法 shape 抛错（CI-10 守卫 number 型断言", () => {
    const good = {
      fee: { amountMinor: "100", currency: "USD" },
      discount: { amountMinor: "0", currency: "USD" },
    };
    expect(() => assertMoneyShape(good, ["fee", "discount"])).not.toThrow();

    const bad1 = { cost: 123 } as unknown as { cost: unknown };
    expect(() => assertMoneyShape(bad1, ["cost"])).toThrow(
      /expected object Money but got number/,
    );

    const bad2 = { cost: { amountMinor: "100.5", currency: "USD" } };
    expect(() => assertMoneyShape(bad2, ["cost"])).toThrow(
      /valid integer string/,
    );

    const bad3 = { cost: { amountMinor: "100", currency: "EUR" } };
    expect(() => assertMoneyShape(bad3, ["cost"])).toThrow(
      /Expected 'KHR' | enum/,
    );
  });

  test("PositiveMoneySchema / NonNegativeMoneySchema zod 运行时守卫", () => {
    expect(
      PositiveMoneySchema.safeParse({ amountMinor: "1", currency: "KHR" })
        .success,
    ).toBe(true);
    expect(
      PositiveMoneySchema.safeParse({ amountMinor: "0", currency: "KHR" })
        .success,
    ).toBe(false);
    expect(
      PositiveMoneySchema.safeParse({ amountMinor: "-5", currency: "KHR" })
        .success,
    ).toBe(false);
    expect(
      NonNegativeMoneySchema.safeParse({ amountMinor: "0", currency: "USD" })
        .success,
    ).toBe(true);
  });

  test("maskByType 表驱动", () => {
    expect(maskByType("card_pan", "4111111111111111")).toBe("4111********1111");
    expect(maskByType("unknown_type", "hello")).toBe("h***o");
  });
});
