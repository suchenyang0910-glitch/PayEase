export type RepaymentWorkItem = Readonly<{
  workItemId: string;
  applicationNo: string;
  collectionSequence: number;
  selectedRepaymentMethod:
    "EMPLOYER_PAYROLL_DEDUCTION" | "USER_DIRECT_DEBIT" | "USER_MANUAL_PAYMENT";
  sourceType:
    | "EMPLOYER_PAYROLL_REPORT"
    | "USER_DIRECT_DEBIT_REPORT"
    | "USER_MANUAL_PAYMENT_PROOF"
    | "REFUND_REVERSAL";
  collectionResult:
    | "COLLECTED"
    | "PARTIALLY_COLLECTED"
    | "NOT_COLLECTED"
    | "DIRECT_DEBIT_FAILED"
    | "AUTHORIZATION_EXPIRED"
    | "REFUND_REVERSED";
  reportedAmountMinor: string;
  evidenceReference: string;
  workItemStatus: "OPEN" | "PROCESSING" | "EXCEPTION";
  createdAt: string;
}>;

export type CollectionExceptionItem = Readonly<{
  exceptionId: string;
  workItemId: string;
  applicationNo: string;
  collectionSequence: number;
  selectedRepaymentMethod:
    "EMPLOYER_PAYROLL_DEDUCTION" | "USER_DIRECT_DEBIT" | "USER_MANUAL_PAYMENT";
  exceptionType:
    | "PARTIALLY_COLLECTED"
    | "NOT_COLLECTED"
    | "DIRECT_DEBIT_FAILED"
    | "AUTHORIZATION_EXPIRED"
    | "REFUND_REVERSED";
  reasonCode: string;
  evidenceReference: string;
  reportedAmountMinor: string;
  createdAt: string;
}>;

export const LENDER_REPAYMENT_QUEUE_AUTO_REFRESH_MS = 30_000;

export function applyRepaymentWorkItemSelection(
  item: RepaymentWorkItem,
): Readonly<{
  applicationNo: string;
  reasonCode: string;
  evidenceReference: string;
}> {
  return {
    applicationNo: item.applicationNo,
    reasonCode: `QUEUE_${item.collectionResult}`,
    evidenceReference: item.evidenceReference,
  };
}

export function canResolveCollectionException(args: {
  roles: readonly string[];
  reasonCode: string;
  evidenceReference: string;
}): boolean {
  return (
    args.roles.includes("LENDER_REPAYMENT_CHECKER") &&
    /^[A-Z0-9_]{3,64}$/.test(args.reasonCode) &&
    args.evidenceReference.trim().length >= 3
  );
}
