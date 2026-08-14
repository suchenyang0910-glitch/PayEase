import { describe, expect, it } from "vitest";
import {
  finalReviewPayload,
  hasValidFinalReviewTerms,
} from "../src/review-payload.ts";

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

  it("guards invalid approved terms before they become a manual request", () => {
    expect(hasValidFinalReviewTerms(terms)).toBe(true);
    expect(
      hasValidFinalReviewTerms({ ...terms, approvedAmountMinor: "999" }),
    ).toBe(false);
    expect(
      hasValidFinalReviewTerms({ ...terms, totalRepayableMinor: "25499" }),
    ).toBe(false);
    expect(hasValidFinalReviewTerms({ ...terms, installmentCount: 0 })).toBe(
      false,
    );
    expect(
      hasValidFinalReviewTerms({ ...terms, firstDueDate: "15/09/2026" }),
    ).toBe(false);
    expect(
      hasValidFinalReviewTerms({ ...terms, firstDueDate: "2026-02-29" }),
    ).toBe(false);
  });
});
