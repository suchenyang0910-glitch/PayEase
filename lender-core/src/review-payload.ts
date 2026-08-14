export type ReviewDecision = "APPROVED" | "REJECTED" | "RETURNED";

export type FinalReviewTerms = Readonly<{
  approvedAmountMinor: string;
  serviceFeeMinor: string;
  totalRepayableMinor: string;
  installmentCount: number;
  firstDueDate: string;
}>;

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
