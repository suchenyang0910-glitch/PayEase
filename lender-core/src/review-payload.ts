export type ReviewDecision = "APPROVED" | "REJECTED" | "RETURNED";

export type FinalReviewTerms = Readonly<{
  approvedAmountMinor: string;
  serviceFeeMinor: string;
  totalRepayableMinor: string;
  installmentCount: number;
  firstDueDate: string;
}>;

/**
 * This is only a user-experience guard. The API validates these terms again
 * before recording an approval, so a modified browser request cannot bypass
 * the lender's authoritative controls.
 */
export function hasValidFinalReviewTerms(terms: FinalReviewTerms): boolean {
  const dueDate = new Date(`${terms.firstDueDate}T00:00:00.000Z`);
  const canonicalDueDate = Number.isNaN(dueDate.getTime())
    ? ""
    : dueDate.toISOString().slice(0, 10);
  if (
    !/^\d+$/.test(terms.approvedAmountMinor) ||
    !/^\d+$/.test(terms.serviceFeeMinor) ||
    !/^\d+$/.test(terms.totalRepayableMinor) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(terms.firstDueDate) ||
    canonicalDueDate !== terms.firstDueDate ||
    !Number.isInteger(terms.installmentCount) ||
    terms.installmentCount < 1 ||
    terms.installmentCount > 6
  ) {
    return false;
  }
  const approvedAmountMinor = BigInt(terms.approvedAmountMinor);
  const serviceFeeMinor = BigInt(terms.serviceFeeMinor);
  const totalRepayableMinor = BigInt(terms.totalRepayableMinor);
  return (
    approvedAmountMinor >= 1000n &&
    approvedAmountMinor <= 50000n &&
    totalRepayableMinor >= approvedAmountMinor + serviceFeeMinor
  );
}

export function finalReviewPayload(
  decision: ReviewDecision,
  reasonCode: string,
  terms: FinalReviewTerms,
):
  | { decision: ReviewDecision; reasonCode: string }
  | (FinalReviewTerms & { decision: "APPROVED"; reasonCode: string }) {
  if (decision !== "APPROVED") return { decision, reasonCode };
  return { decision, reasonCode, ...terms };
}
