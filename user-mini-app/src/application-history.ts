export type ApplicationHistoryEntry = Readonly<{
  applicationNo: string;
  status: string;
  requestedAmountMinor: string;
  currency: string;
  tenorDays: number;
  approvedAmountMinor: string | null;
  rejectionConditionResolved: boolean;
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
