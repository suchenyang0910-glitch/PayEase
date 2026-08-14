export type ApplicantPhase =
  | "broker-review"
  | "employer-verification"
  | "lender-review"
  | "contract-and-disbursement"
  | "repayment"
  | "settled"
  | "rejected";

export function applicantPhase(status: string): ApplicantPhase {
  switch (status) {
    case "SUBMITTED":
    case "BROKER_REVIEW":
      return "broker-review";
    case "EMPLOYER_VERIFICATION":
    case "EMPLOYER_FINANCE_VERIFICATION":
      return "employer-verification";
    case "LENDER_INITIAL_REVIEW":
    case "LENDER_FINAL_REVIEW":
      return "lender-review";
    case "CONTRACT_PENDING":
    case "USER_CONTRACT_CONFIRMED":
    case "CONTRACT_CONFIRMED":
    case "DISBURSEMENT_PENDING":
    case "DISBURSED":
      return "contract-and-disbursement";
    case "REPAYMENT_ACTIVE":
      return "repayment";
    case "SETTLED":
    case "CLOSED":
      return "settled";
    case "REJECTED":
      return "rejected";
    default:
      return "broker-review";
  }
}

export function progressStepForPhase(phase: ApplicantPhase): number {
  switch (phase) {
    case "broker-review":
    case "employer-verification":
      return 1;
    case "lender-review":
      return 2;
    default:
      return 3;
  }
}
