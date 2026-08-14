import { describe, expect, it } from "vitest";
import { applicantResult } from "../src/application-result.ts";

describe("applicant result display state", () => {
  it("shows a lender offer only when an approved amount exists", () => {
    expect(
      applicantResult({
        status: "CONTRACT_PENDING",
        approvedAmountMinor: "25000",
        rejectionConditionResolved: false,
        supplementRequested: false,
      }),
    ).toBe("approved");
  });

  it("does not mislabel a rejected application as under review", () => {
    expect(
      applicantResult({
        status: "REJECTED",
        approvedAmountMinor: null,
        rejectionConditionResolved: false,
        supplementRequested: false,
      }),
    ).toBe("rejected-pending");
  });

  it("allows the new-application UI only after the server resolves the condition", () => {
    expect(
      applicantResult({
        status: "REJECTED",
        approvedAmountMinor: null,
        rejectionConditionResolved: true,
        supplementRequested: false,
      }),
    ).toBe("rejected-resolved");
  });

  it("keeps all non-final statuses in review", () => {
    expect(
      applicantResult({
        status: "LENDER_FINAL_REVIEW",
        approvedAmountMinor: null,
        rejectionConditionResolved: false,
        supplementRequested: false,
      }),
    ).toBe("reviewing");
  });

  it("explains a supplement request before considering an offer or rejection", () => {
    expect(
      applicantResult({
        status: "BROKER_REVIEW",
        approvedAmountMinor: null,
        rejectionConditionResolved: false,
        supplementRequested: true,
      }),
    ).toBe("supplement-requested");
  });

  it("never masks a final rejection with a stale supplement flag", () => {
    expect(
      applicantResult({
        status: "REJECTED",
        approvedAmountMinor: null,
        rejectionConditionResolved: false,
        supplementRequested: true,
      }),
    ).toBe("rejected-pending");
  });
});
