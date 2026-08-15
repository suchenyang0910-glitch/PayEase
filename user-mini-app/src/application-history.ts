export type ApplicationHistoryEntry = Readonly<{
  applicationNo: string;
  status: string;
  requestedAmountMinor: string;
  currency: string;
  tenorDays: number;
  approvedAmountMinor: string | null;
  rejectionConditionResolved: boolean;
  rejectionNoticeCode:
    | "INFORMATION_INCOMPLETE"
    | "EMPLOYMENT_OR_INCOME_UNVERIFIED"
    | "PRODUCT_ELIGIBILITY_NOT_MET"
    | "LENDER_DECISION"
    | null;
  supplementRequested: boolean;
  employerTenantDisplayName?: string | null;
  createdAt: string;
}>;

export function prependApplicationHistory(
  current: readonly ApplicationHistoryEntry[],
  next: ApplicationHistoryEntry,
): ApplicationHistoryEntry[] {
  return [
    next,
    ...current.filter((item) => item.applicationNo !== next.applicationNo),
  ];
}
