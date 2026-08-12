import { describe, expect, it } from "vitest";
import { createApplicationSchema } from "../src/validation.js";

describe("controlled-pilot application validation", () => {
  it("accepts a USD request with minor-unit string and valid term", () => {
    expect(
      createApplicationSchema.parse({
        telegramUserRef: "local-user-001",
        preferredLanguage: "km",
        requestedAmount: { amountMinor: "10000", currency: "USD" },
        tenorDays: 30,
      }),
    ).toMatchObject({ tenorDays: 30 });
  });

  it("rejects number money values and an out-of-range term", () => {
    const parsed = createApplicationSchema.safeParse({
      telegramUserRef: "local-user-001",
      preferredLanguage: "en",
      requestedAmount: { amountMinor: 10000, currency: "USD" },
      tenorDays: 181,
    });
    expect(parsed.success).toBe(false);
  });
});
