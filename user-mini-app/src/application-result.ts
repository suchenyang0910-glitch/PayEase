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
  | "reviewing";

/**
 * Converts server-authoritative application state into the four states that
 * the applicant dashboard is allowed to present.  In particular, a rejected
 * application must never be presented as an offer or as still under review.
 */
export function applicantResult(
  application: ApplicantApplication | undefined,
): ApplicantResult {
  if (application?.supplementRequested) return "supplement-requested";
  if (application?.approvedAmountMinor) return "approved";
  if (application?.status === "REJECTED") {
    return application.rejectionConditionResolved
      ? "rejected-resolved"
      : "rejected-pending";
  }
  return "reviewing";
}
