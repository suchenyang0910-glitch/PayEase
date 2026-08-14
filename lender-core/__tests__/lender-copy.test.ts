import { describe, expect, it } from "vitest";
import { LENDER_COPY, type LenderActionKey } from "../src/lender-copy.js";

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
      expect(copy.signInDescription).not.toHaveLength(0);
      expect(copy.account).not.toHaveLength(0);
      expect(copy.password).not.toHaveLength(0);
      expect(copy.signIn).not.toHaveLength(0);
      expect(copy.loginFailed).not.toHaveLength(0);
      expect(copy.sessionFailed).not.toHaveLength(0);
      expect(copy.actionFailed).not.toHaveLength(0);
      expect(copy.manualApproval).not.toHaveLength(0);
      for (const key of actionKeys)
        expect(copy.actions[key]).not.toHaveLength(0);
    }
  });
});
