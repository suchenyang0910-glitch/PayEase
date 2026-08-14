import { describe, expect, it } from "vitest";
import {
  allowedLenderActionRoutes,
  lenderSummaryLines,
  parseLenderApplicationSummary,
} from "../src/lender-application-summary.ts";

const activeRepaymentCase = {
  application: {
    applicationNo: "APP-20260815-0001",
    status: "REPAYMENT_ACTIVE",
    requestedAmountMinor: "25000",
    currency: "USD",
    tenorDays: 30,
    approvedAmountMinor: "20000",
    rejectionConditionResolved: false,
  },
  terms: {
    approvedAmountMinor: "20000",
    serviceFeeMinor: "500",
    totalRepayableMinor: "20500",
    installmentCount: 2,
    firstDueDate: "2026-09-15",
  },
  repayment: {
    paidPeriods: 1,
    unpaidPeriods: 1,
    outstandingMinor: "10250",
  },
};

describe("lender application summary", () => {
  it("parses an authoritative case view using Money strings", () => {
    const parsed = parseLenderApplicationSummary(activeRepaymentCase);
    expect(parsed?.application.requestedAmount).toEqual({
      amountMinor: "25000",
      currency: "USD",
    });
    expect(lenderSummaryLines(parsed!)).toContain("Requested: $250.00 USD");
    expect(lenderSummaryLines(parsed!)).toContain(
      "Repayment: 1 paid / 1 unpaid; outstanding $102.50 USD",
    );
  });

  it("only exposes actions that match the authoritative case status", () => {
    const parsed = parseLenderApplicationSummary(activeRepaymentCase)!;
    expect(allowedLenderActionRoutes(parsed)).toEqual([
      "repayment-write-off",
      "repayment-confirmation",
    ]);
    expect(
      allowedLenderActionRoutes({
        ...parsed,
        application: {
          ...parsed.application,
          status: "REJECTED",
          rejectionConditionResolved: true,
        },
      }),
    ).toEqual([]);
  });

  it("rejects malformed response data rather than rendering it as an operator case", () => {
    expect(
      parseLenderApplicationSummary({
        ...activeRepaymentCase,
        application: {
          ...activeRepaymentCase.application,
          requestedAmountMinor: 25000,
        },
      }),
    ).toBeUndefined();
  });
});
