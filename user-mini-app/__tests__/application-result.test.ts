import { describe, expect, it } from "vitest";
import {
  applicantResult,
  borrowEntryAction,
  canWithdrawApplicantApplication,
} from "../src/application-result.ts";

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

  it.each([
    ["USER_CONTRACT_CONFIRMED", "contract-processing"],
    ["CONTRACT_CONFIRMED", "contract-processing"],
    ["DISBURSEMENT_PENDING", "contract-processing"],
    ["DISBURSED", "funded"],
    ["REPAYMENT_ACTIVE", "repayment-active"],
    ["SETTLED", "settled"],
  ] as const)("shows %s as its actual loan lifecycle", (status, expected) => {
    expect(
      applicantResult({
        status,
        approvedAmountMinor: "25000",
        rejectionConditionResolved: false,
        supplementRequested: false,
      }),
    ).toBe(expected);
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

  it("separates eligible withdrawal from signed or funded application states", () => {
    expect(canWithdrawApplicantApplication("BROKER_REVIEW")).toBe(true);
    expect(canWithdrawApplicantApplication("CONTRACT_PENDING")).toBe(true);
    expect(canWithdrawApplicantApplication("USER_CONTRACT_CONFIRMED")).toBe(
      false,
    );
    expect(canWithdrawApplicantApplication("REPAYMENT_ACTIVE")).toBe(false);
    expect(
      applicantResult({
        status: "CLOSED",
        approvedAmountMinor: null,
        rejectionConditionResolved: false,
        supplementRequested: false,
      }),
    ).toBe("withdrawn");
  });

  it("sends draft borrowers back to continue their application", () => {
    expect(borrowEntryAction(undefined, true)).toBe("continue-draft");
  });

  it("prevents a reviewing borrower from creating a duplicate application", () => {
    expect(borrowEntryAction("reviewing", false)).toBe("view-progress");
    expect(borrowEntryAction("supplement-requested", false)).toBe(
      "view-progress",
    );
  });

  it("routes approved and contract-processing borrowers to signing", () => {
    expect(borrowEntryAction("approved", false)).toBe("review-sign");
    expect(borrowEntryAction("contract-processing", false)).toBe("review-sign");
  });

  it("routes funded and repayment-active borrowers to the bill view", () => {
    expect(borrowEntryAction("funded", false)).toBe("view-bill");
    expect(borrowEntryAction("repayment-active", false)).toBe("view-bill");
  });

  it("only allows a fresh application after a final reusable outcome", () => {
    expect(borrowEntryAction("settled", false)).toBe("apply-new");
    expect(borrowEntryAction("withdrawn", false)).toBe("apply-new");
    expect(borrowEntryAction("rejected-resolved", false)).toBe("apply-new");
    expect(borrowEntryAction("rejected-pending", false)).toBe(
      "view-explanation",
    );
  });
});
