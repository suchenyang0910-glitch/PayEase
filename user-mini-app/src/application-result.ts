export type ApplicantApplication = Readonly<{
  status: string;
  approvedAmountMinor: string | null;
  rejectionConditionResolved: boolean;
  rejectionNoticeCode:
    | "INFORMATION_INCOMPLETE"
    | "EMPLOYMENT_OR_INCOME_UNVERIFIED"
    | "PRODUCT_ELIGIBILITY_NOT_MET"
    | "LENDER_DECISION"
    | null;
  supplementRequested: boolean;
}>;

export type ApplicantResult =
  | "approved"
  | "contract-processing"
  | "funded"
  | "repayment-active"
  | "settled"
  | "supplement-requested"
  | "rejected-resolved"
  | "rejected-pending"
  | "withdrawn"
  | "reviewing";

export type BorrowEntryAction =
  | "start"
  | "continue-draft"
  | "view-progress"
  | "review-sign"
  | "view-bill"
  | "apply-new"
  | "view-explanation";

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
  if (application?.status === "SETTLED") return "settled";
  if (application?.status === "REPAYMENT_ACTIVE") return "repayment-active";
  if (application?.status === "DISBURSED") return "funded";
  if (
    application?.status === "USER_CONTRACT_CONFIRMED" ||
    application?.status === "CONTRACT_CONFIRMED" ||
    application?.status === "DISBURSEMENT_PENDING"
  ) {
    return "contract-processing";
  }
  if (application?.status === "REJECTED") {
    return application.rejectionConditionResolved
      ? "rejected-resolved"
      : "rejected-pending";
  }
  if (application?.supplementRequested) return "supplement-requested";
  if (application?.approvedAmountMinor) return "approved";
  return "reviewing";
}

export function borrowEntryAction(
  result: ApplicantResult | undefined,
  hasDraft: boolean,
): BorrowEntryAction {
  if (result === "reviewing" || result === "supplement-requested") {
    return "view-progress";
  }
  if (result === "approved" || result === "contract-processing") {
    return "review-sign";
  }
  if (result === "funded" || result === "repayment-active") {
    return "view-bill";
  }
  if (result === "rejected-pending") {
    return "view-explanation";
  }
  if (
    result === "settled" ||
    result === "withdrawn" ||
    result === "rejected-resolved"
  ) {
    return "apply-new";
  }
  if (hasDraft) {
    return "continue-draft";
  }
  return "start";
}
