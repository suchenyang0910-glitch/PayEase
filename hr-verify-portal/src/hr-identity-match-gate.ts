export type HrIdentityMatchQueueItem = Readonly<{
  stage: string;
  identityDocumentType: "NATIONAL_ID" | "PASSPORT" | null;
  identityMatchStatus: "PENDING" | "MATCHED" | "NOT_MATCHED";
}>;

// The API remains authoritative, but this prevents a predictable operator
// error: an HR approver should not be invited to advance a documented
// applicant before recording the required factory-record identity match.
export function requiresIdentityMatchBeforeApproval(
  item: HrIdentityMatchQueueItem | undefined,
): boolean {
  return Boolean(
    item?.stage === "EMPLOYER_VERIFICATION" &&
    item.identityDocumentType !== null &&
    item.identityMatchStatus !== "MATCHED",
  );
}
