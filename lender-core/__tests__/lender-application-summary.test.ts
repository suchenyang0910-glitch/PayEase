import { describe, expect, it } from "vitest";
import {
  allowedLenderActionRoutes,
  lenderApplicationStatusLabel,
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
    expect(parsed?.terms?.serviceFee).toEqual({
      amountMinor: "500",
      currency: "USD",
    });
  });

  it.each([
    ["LENDER_INITIAL_REVIEW", false, ["lender-initial-review"]],
    ["LENDER_FINAL_REVIEW", false, ["lender-final-review"]],
    ["REJECTED", false, ["reapplication-condition-resolved"]],
    ["REJECTED", true, []],
    ["USER_CONTRACT_CONFIRMED", false, ["contract-confirmation"]],
    ["CONTRACT_CONFIRMED", false, ["open-disbursement"]],
    [
      "DISBURSEMENT_PENDING",
      false,
      ["disbursement-release", "disbursement-confirmation"],
    ],
    ["DISBURSED", false, ["activate-repayment"]],
    [
      "REPAYMENT_ACTIVE",
      false,
      ["repayment-write-off", "repayment-confirmation"],
    ],
    ["SETTLED", false, []],
  ] as const)(
    "only exposes actions matching authoritative status %s",
    (status, rejectionConditionResolved, expectedRoutes) => {
      const parsed = parseLenderApplicationSummary(activeRepaymentCase)!;
      expect(
        allowedLenderActionRoutes({
          ...parsed,
          application: {
            ...parsed.application,
            status,
            rejectionConditionResolved,
          },
        }),
      ).toEqual(expectedRoutes);
    },
  );

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

  it("renders application statuses in the operator's selected language", () => {
    expect(lenderApplicationStatusLabel("DISBURSEMENT_PENDING", "en")).toBe(
      "Disbursement pending",
    );
    expect(lenderApplicationStatusLabel("DISBURSEMENT_PENDING", "zh-CN")).toBe(
      "待放款",
    );
    expect(lenderApplicationStatusLabel("DISBURSEMENT_PENDING", "km")).toBe(
      "រង់ចាំការបញ្ចេញប្រាក់",
    );
    expect(lenderApplicationStatusLabel("FUTURE_STATUS", "en")).toBe(
      "FUTURE_STATUS",
    );
  });
});
