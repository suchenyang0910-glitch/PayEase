import { describe, expect, it } from "vitest";
import { finalReviewPayload } from "../src/review-payload.js";

const terms = {
  approvedAmountMinor: "25000",
  serviceFeeMinor: "500",
  totalRepayableMinor: "25500",
  installmentCount: 2,
  firstDueDate: "2026-09-15",
};

describe("lender final review payload", () => {
  it("includes contractual terms only for an approval", () => {
    expect(finalReviewPayload("APPROVED", "MANUAL_APPROVAL", terms)).toEqual({
      decision: "APPROVED",
      reasonCode: "MANUAL_APPROVAL",
      ...terms,
    });
  });

  it.each(["REJECTED", "RETURNED"] as const)(
    "does not accidentally send approval terms for %s",
    (decision) => {
      expect(finalReviewPayload(decision, "MISSING_DOCUMENT", terms)).toEqual({
        decision,
        reasonCode: "MISSING_DOCUMENT",
      });
    },
  );
});
