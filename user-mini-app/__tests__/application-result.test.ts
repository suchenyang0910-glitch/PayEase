import { describe, expect, it } from "vitest";
import { applicantResult } from "../src/application-result.js";

describe("applicant result display state", () => {
  it("shows a lender offer only when an approved amount exists", () => {
    expect(
      applicantResult({
        status: "CONTRACT_PENDING",
        approvedAmountMinor: "25000",
        rejectionConditionResolved: false,
      }),
    ).toBe("approved");
  });

  it("does not mislabel a rejected application as under review", () => {
    expect(
      applicantResult({
        status: "REJECTED",
        approvedAmountMinor: null,
        rejectionConditionResolved: false,
      }),
    ).toBe("rejected-pending");
  });

  it("allows the new-application UI only after the server resolves the condition", () => {
    expect(
      applicantResult({
        status: "REJECTED",
        approvedAmountMinor: null,
        rejectionConditionResolved: true,
      }),
    ).toBe("rejected-resolved");
  });

  it("keeps all non-final statuses in review", () => {
    expect(
      applicantResult({
        status: "LENDER_FINAL_REVIEW",
        approvedAmountMinor: null,
        rejectionConditionResolved: false,
      }),
    ).toBe("reviewing");
  });
});
