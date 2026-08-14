import { describe, expect, it } from "vitest";
import { applicantRejectionNoticeCode } from "../src/applicant-rejection-notice.js";

describe("applicant rejection notice", () => {
  it("does not disclose any reviewer reason before an application is rejected", () => {
    expect(
      applicantRejectionNoticeCode(
        "LENDER_FINAL_REVIEW",
        "SALARY_NOT_VERIFIED",
      ),
    ).toBeNull();
  });

  it("maps internal codes to controlled applicant-facing categories", () => {
    expect(
      applicantRejectionNoticeCode("REJECTED", "DOCUMENTS_INCOMPLETE"),
    ).toBe("INFORMATION_INCOMPLETE");
    expect(
      applicantRejectionNoticeCode("REJECTED", "SALARY_NOT_VERIFIED"),
    ).toBe("EMPLOYMENT_OR_INCOME_UNVERIFIED");
    expect(
      applicantRejectionNoticeCode("REJECTED", "PRODUCT_ELIGIBILITY_NOT_MET"),
    ).toBe("PRODUCT_ELIGIBILITY_NOT_MET");
  });

  it("uses a generic lender decision for unmapped internal reasons", () => {
    expect(applicantRejectionNoticeCode("REJECTED", "FRAUD_SIGNAL_42")).toBe(
      "LENDER_DECISION",
    );
    expect(applicantRejectionNoticeCode("REJECTED", null)).toBe(
      "LENDER_DECISION",
    );
  });
});
