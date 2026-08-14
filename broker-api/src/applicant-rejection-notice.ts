export type ApplicantRejectionNoticeCode =
  | "INFORMATION_INCOMPLETE"
  | "EMPLOYMENT_OR_INCOME_UNVERIFIED"
  | "PRODUCT_ELIGIBILITY_NOT_MET"
  | "LENDER_DECISION";

/**
 * Maps an internal reviewer reason to the small, applicant-safe vocabulary.
 * Internal reason codes must never be returned to the applicant because they
 * can disclose fraud controls, risk-policy thresholds or third-party data.
 */
export function applicantRejectionNoticeCode(
  applicationStatus: string,
  internalReasonCode: string | null,
): ApplicantRejectionNoticeCode | null {
  if (applicationStatus !== "REJECTED") return null;

  switch (internalReasonCode) {
    case "INCOMPLETE_INFORMATION":
    case "DOCUMENTS_INCOMPLETE":
    case "SUPPLEMENT_REQUIRED":
      return "INFORMATION_INCOMPLETE";
    case "EMPLOYMENT_NOT_VERIFIED":
    case "SALARY_NOT_VERIFIED":
    case "EMPLOYMENT_OR_INCOME_UNVERIFIED":
      return "EMPLOYMENT_OR_INCOME_UNVERIFIED";
    case "PRODUCT_ELIGIBILITY_NOT_MET":
      return "PRODUCT_ELIGIBILITY_NOT_MET";
    default:
      return "LENDER_DECISION";
  }
}
