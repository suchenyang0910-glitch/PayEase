import { describe, expect, it } from "vitest";
import {
  applicantPhase,
  progressStepForPhase,
} from "../src/application-progress.js";

describe("applicant application progress", () => {
  it.each([
    ["SUBMITTED", "broker-review", 1],
    ["EMPLOYER_VERIFICATION", "employer-verification", 1],
    ["LENDER_FINAL_REVIEW", "lender-review", 2],
    ["USER_CONTRACT_CONFIRMED", "contract-and-disbursement", 3],
    ["DISBURSEMENT_PENDING", "contract-and-disbursement", 3],
    ["REPAYMENT_ACTIVE", "repayment", 3],
    ["SETTLED", "settled", 3],
    ["REJECTED", "rejected", 3],
  ] as const)("maps %s to the applicant phase", (status, phase, step) => {
    expect(applicantPhase(status)).toBe(phase);
    expect(progressStepForPhase(phase)).toBe(step);
  });

  it("uses a conservative broker-review fallback for an unknown server state", () => {
    expect(applicantPhase("FUTURE_STATE")).toBe("broker-review");
  });
});
