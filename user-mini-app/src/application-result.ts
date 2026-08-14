export type ApplicantApplication = Readonly<{
  status: string;
  approvedAmountMinor: string | null;
  rejectionConditionResolved: boolean;
  supplementRequested: boolean;
}>;

export type ApplicantResult =
  | "approved"
  | "supplement-requested"
  | "rejected-resolved"
  | "rejected-pending"
  | "withdrawn"
  | "reviewing";

const withdrawableStatuses = new Set([
  "BROKER_REVIEW",
  "EMPLOYER_VERIFICATION",
  "EMPLOYER_FINANCE_VERIFICATION",
  "LENDER_INITIAL_REVIEW",
  "LENDER_FINAL_REVIEW",
  "CONTRACT_PENDING",
]);

export function canWithdrawApplicantApplication(status: string): boolean {
  return withdrawableStatuses.has(status);
}

/**
 * Converts server-authoritative application state into the four states that
 * the applicant dashboard is allowed to present.  In particular, a rejected
 * application must never be presented as an offer or as still under review.
 */
export function applicantResult(
  application: ApplicantApplication | undefined,
): ApplicantResult {
  if (application?.status === "CLOSED") return "withdrawn";
  if (application?.status === "REJECTED") {
    return application.rejectionConditionResolved
      ? "rejected-resolved"
      : "rejected-pending";
  }
  if (application?.supplementRequested) return "supplement-requested";
  if (application?.approvedAmountMinor) return "approved";
  return "reviewing";
}
