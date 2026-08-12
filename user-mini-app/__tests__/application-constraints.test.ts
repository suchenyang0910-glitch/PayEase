import { describe, expect, it } from "vitest";
import { ApplicationInputSchema, translate } from "@payease/v1-domain";

describe("user mini app application constraints", () => {
  it("accepts the V1 minimum and maximum USD amounts and exposes Khmer labels", () => {
    expect(
      ApplicationInputSchema.safeParse({
        id: "APP-3",
        applicantUserId: "telegram-3",
        preferredLanguage: "km",
        requestedAmount: { amountMinor: "1000", currency: "USD" },
        tenorDays: 7,
      }).success,
    ).toBe(true);
    expect(
      ApplicationInputSchema.safeParse({
        id: "APP-4",
        applicantUserId: "telegram-4",
        preferredLanguage: "km",
        requestedAmount: { amountMinor: "50001", currency: "USD" },
        tenorDays: 7,
      }).success,
    ).toBe(false);
    expect(translate("km", "submit")).toContain("ដាក់");
  });
});
