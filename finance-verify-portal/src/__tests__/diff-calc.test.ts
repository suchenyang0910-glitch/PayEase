import { describe, it, expect } from "vitest";
import { diffLine } from "../pages/diff-calc";
import type { Money } from "@payease/shared-money";

describe("diffLine pure function (ReconciliationPage helper)", () => {
  it("returns expected - settled when currencies match", () => {
    const diff = diffLine({
      expected: { amountMinor: "137500000", currency: "KHR" },
      settled: { amountMinor: "137499995", currency: "KHR" },
    });
    expect(diff).toEqual({ amountMinor: "5", currency: "KHR" });
  });

  it("returns 0 when expected === settled (MATCHED line)", () => {
    const diff = diffLine({
      expected: { amountMinor: "26800", currency: "USD" },
      settled: { amountMinor: "26800", currency: "USD" },
    });
    expect(diff).toEqual({ amountMinor: "0", currency: "USD" });
  });

  it("returns negative amountMinor when settled > expected (over-payment mock)", () => {
    const diff = diffLine({
      expected: { amountMinor: "10000", currency: "USD" },
      settled: { amountMinor: "10500", currency: "USD" },
    });
    expect(diff.amountMinor).toBe("-500");
    expect(diff.currency).toBe("USD");
  });

  it("returns zero amountMinor in expected.currency when currencies mismatch (safe fallback, no auto FX)", () => {
    const diff = diffLine({
      expected: { amountMinor: "10000000", currency: "KHR" },
      settled: { amountMinor: "2500", currency: "USD" },
    });
    expect(diff).toEqual({ amountMinor: "0", currency: "KHR" });
  });

  it("handles zero settled (UNMATCHED settlement scenario)", () => {
    const diff = diffLine({
      expected: { amountMinor: "32100", currency: "USD" },
      settled: { amountMinor: "0", currency: "USD" },
    });
    expect(diff).toEqual({ amountMinor: "32100", currency: "USD" });
  });

  it("does not mutate input arguments (pure function, readonly inputs)", () => {
    const expected: Money = { amountMinor: "100", currency: "USD" };
    const settled: Money = { amountMinor: "60", currency: "USD" };
    const origExpected = { ...expected };
    const origSettled = { ...settled };
    const _ = diffLine({ expected, settled });
    expect(expected).toEqual(origExpected);
    expect(settled).toEqual(origSettled);
  });
});
