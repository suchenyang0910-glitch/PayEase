import { describe, expect, it } from "vitest";
import {
  applicantResult,
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
});
