import { describe, expect, it } from "vitest";
import { usdInputToMinor } from "../src/usd-amount.ts";

describe("usdInputToMinor", () => {
  it("converts valid USD input without floating point arithmetic", () => {
    expect(usdInputToMinor("10")).toBe("1000");
    expect(usdInputToMinor("123.45")).toBe("12345");
    expect(usdInputToMinor("500.00")).toBe("50000");
  });

  it("rejects malformed values and values outside the V1 product range", () => {
    for (const input of ["", "09", "9.99", "500.01", "10.001", "1e2", "-10"]) {
      expect(usdInputToMinor(input)).toBeUndefined();
    }
  });
});
