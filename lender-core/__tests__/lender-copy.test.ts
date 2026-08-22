import { describe, expect, it } from "vitest";
import { LENDER_COPY, type LenderActionKey } from "../src/lender-copy.ts";

const actionKeys: readonly LenderActionKey[] = [
  "initialReview",
  "finalReview",
  "resolveReapplication",
  "confirmContract",
  "openDisbursement",
  "disbursementMaker",
  "disbursementChecker",
  "activateRepayment",
  "repaymentMaker",
  "repaymentChecker",
];

describe("lender console translations", () => {
  it("provides non-empty workflow labels for every supported language", () => {
    for (const language of ["zh-CN", "en", "km"] as const) {
      const copy = LENDER_COPY[language];
      expect(copy.title).not.toHaveLength(0);
      expect(copy.checking).not.toHaveLength(0);
      expect(copy.signInDescription).not.toHaveLength(0);
      expect(copy.account).not.toHaveLength(0);
      expect(copy.password).not.toHaveLength(0);
      expect(copy.signIn).not.toHaveLength(0);
      expect(copy.loginFailed).not.toHaveLength(0);
      expect(copy.sessionFailed).not.toHaveLength(0);
      expect(copy.sessionExpired).not.toHaveLength(0);
      expect(copy.actionFailed).not.toHaveLength(0);
      expect(copy.manualApproval).not.toHaveLength(0);
      expect(copy.complaintResolution).not.toHaveLength(0);
      expect(copy.complaintResolutionDescription).not.toHaveLength(0);
      expect(copy.refreshComplaintQueue).not.toHaveLength(0);
      expect(copy.noReferredComplaints).not.toHaveLength(0);
      expect(copy.viewComplaint).not.toHaveLength(0);
      expect(copy.finalResolutionReasonCode).not.toHaveLength(0);
      expect(copy.resolveComplaint).not.toHaveLength(0);
      expect(copy.repaymentQueue).not.toHaveLength(0);
      expect(copy.repaymentQueueDescription).not.toHaveLength(0);
      expect(copy.refreshRepaymentQueue).not.toHaveLength(0);
      expect(copy.noRepaymentWorkItems).not.toHaveLength(0);
      expect(copy.queueLoadFailed).not.toHaveLength(0);
      expect(copy.useWorkItem).not.toHaveLength(0);
      expect(copy.collectionExceptions).not.toHaveLength(0);
      expect(copy.collectionExceptionsDescription).not.toHaveLength(0);
      expect(copy.refreshCollectionExceptions).not.toHaveLength(0);
      expect(copy.noCollectionExceptions).not.toHaveLength(0);
      expect(copy.exceptionLoadFailed).not.toHaveLength(0);
      expect(copy.resolveException).not.toHaveLength(0);
      expect(copy.exceptionReasonCode).not.toHaveLength(0);
      expect(copy.exceptionEvidenceReference).not.toHaveLength(0);
      expect(copy.exceptionResolved).not.toHaveLength(0);
      for (const key of actionKeys)
        expect(copy.actions[key]).not.toHaveLength(0);
    }
  });
});
