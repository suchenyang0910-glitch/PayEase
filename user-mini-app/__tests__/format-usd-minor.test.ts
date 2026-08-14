import { describe, expect, it } from "vitest";
import { formatUsdMinor } from "../src/format-usd-minor.js";

describe("USD minor-unit formatting", () => {
  it("renders normal, negative and missing monetary values", () => {
    expect(formatUsdMinor("12345")).toBe("$123.45");
    expect(formatUsdMinor("-5")).toBe("-$0.05");
    expect(formatUsdMinor(undefined)).toBe("$0.00");
    expect(formatUsdMinor("not-an-amount")).toBe("$0.00");
  });

  it("does not lose precision beyond Number.MAX_SAFE_INTEGER", () => {
    expect(formatUsdMinor("9007199254740993")).toBe("$90,071,992,547,409.93");
  });
});
