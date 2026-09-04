import { describe, expect, it } from "vitest";
import {
  buildSalaryLoanV2RepaymentSchedule,
  buildRepaymentSchedule,
  formatApplicantLoanSummary,
  summarizeRepaymentSchedule,
} from "../src/repayment.js";

describe("repayment schedule", () => {
  it("splits minor units exactly and puts the unavoidable remainder in the final period", () => {
    expect(buildRepaymentSchedule("25501", 2, "2026-09-15")).toEqual([
      { installmentNo: 1, dueDate: "2026-09-15", amountDueMinor: "12750" },
      { installmentNo: 2, dueDate: "2026-10-15", amountDueMinor: "12751" },
    ]);
  });

  it("builds a V2 payroll-node schedule with principal and interest split separately", () => {
    expect(
      buildSalaryLoanV2RepaymentSchedule({
        principalAmountMinor: "10001",
        lenderInterestMinor: "151",
        contractualTermDays: 30,
        installmentCount: 2,
        firstDueDate: "2026-09-15",
        selectedRepaymentMethod: "SMILE_WALLET_AUTHORIZATION",
        employerPayrollRuleVersion: "EMPLOYER-PAYROLL-V2-20260821",
        payrollNodes: [
          { nodeRef: "PAYDAY-1", scheduleType: "FIXED_DAY", dayOfMonth: 15 },
          { nodeRef: "PAYDAY-2", scheduleType: "LAST_DAY_OF_MONTH" },
        ],
        collectionPayeeRef: "LENDER-COLLECTION-ACCOUNT",
        productRuleVersion: "PRODUCT-RULE-V2-20260821",
        lenderInterestRuleVersion: "LENDER-INTEREST-V2-20260821",
      }),
    ).toEqual([
      {
        installmentNo: 1,
        dueDate: "2026-09-15",
        amountDueMinor: "5075",
        principalDueMinor: "5000",
        lenderInterestDueMinor: "75",
        payrollNodeRef: "PAYDAY-1",
      },
      {
        installmentNo: 2,
        dueDate: "2026-09-30",
        amountDueMinor: "5077",
        principalDueMinor: "5001",
        lenderInterestDueMinor: "76",
        payrollNodeRef: "PAYDAY-2",
      },
    ]);
  });

  it("reports paid and unpaid periods, remaining balance, and the next due item", () => {
    const summary = summarizeRepaymentSchedule([
      {
        installmentNo: 1,
        dueDate: "2026-09-15",
        amountDueMinor: "12750",
        amountPaidMinor: "12750",
        status: "PAID",
      },
      {
        installmentNo: 2,
        dueDate: "2026-10-15",
        amountDueMinor: "12751",
        amountPaidMinor: "0",
        status: "PENDING",
      },
    ]);
    expect(summary).toMatchObject({
      periodCount: 2,
      paidPeriods: 1,
      unpaidPeriods: 1,
      overduePeriods: 0,
      totalDueMinor: "25501",
      totalPaidMinor: "12750",
      outstandingMinor: "12751",
      overdueOutstandingMinor: "0",
      nextInstallment: { installmentNo: 2, amountDueMinor: "12751" },
    });
  });

  it("reports past-due pending installments without inventing a late fee", () => {
    const summary = summarizeRepaymentSchedule(
      [
        {
          installmentNo: 1,
          dueDate: "2026-09-15",
          amountDueMinor: "12750",
          amountPaidMinor: "0",
          status: "PENDING",
        },
        {
          installmentNo: 2,
          dueDate: "2026-10-15",
          amountDueMinor: "12751",
          amountPaidMinor: "0",
          status: "PENDING",
        },
      ],
      "2026-10-15",
    );
    expect(summary).toMatchObject({
      overduePeriods: 1,
      overdueOutstandingMinor: "12750",
      outstandingMinor: "25501",
    });
  });

  it("rejects an invalid contract schedule before it can be persisted", () => {
    expect(() => buildRepaymentSchedule("25.50", 2, "2026-09-15")).toThrow();
    expect(() => buildRepaymentSchedule("25500", 0, "2026-09-15")).toThrow();
    expect(() => buildRepaymentSchedule("25500", 2, "not-a-date")).toThrow();
    expect(() =>
      buildSalaryLoanV2RepaymentSchedule({
        principalAmountMinor: "10000",
        lenderInterestMinor: "150",
        contractualTermDays: 30,
        installmentCount: 2,
        firstDueDate: "2026-09-14",
        selectedRepaymentMethod: "EMPLOYER_PAYROLL_DEDUCTION",
        employerPayrollRuleVersion: "EMPLOYER-PAYROLL-V2-20260821",
        payrollNodes: [
          { nodeRef: "PAYDAY-1", scheduleType: "FIXED_DAY", dayOfMonth: 15 },
          { nodeRef: "PAYDAY-2", scheduleType: "LAST_DAY_OF_MONTH" },
        ],
        payrollDeductionAuthorizationRef: "PAYROLL-AUTH-001",
        collectionPayeeRef: "LENDER-COLLECTION-ACCOUNT",
        productRuleVersion: "PRODUCT-RULE-V2-20260821",
        lenderInterestRuleVersion: "LENDER-INTEREST-V2-20260821",
      }),
    ).toThrow(/does not match a configured payroll node/);
  });

  it("keeps the user-facing API shape complete and free of internal database names", () => {
    const repayment = summarizeRepaymentSchedule([]);
    expect(
      formatApplicantLoanSummary(
        {
          applicationNo: "APP-20260814-ABCD",
          status: "CONTRACT_PENDING",
          requestedAmountMinor: "25000",
          currency: "USD",
          tenorDays: 30,
          approvedAmountMinor: "25000",
          rejectionConditionResolved: false,
        },
        {
          approvedAmountMinor: "25000",
          serviceFeeMinor: "500",
          totalRepayableMinor: "25500",
          installmentCount: 2,
          firstDueDate: "2026-09-15",
        },
        repayment,
      ),
    ).toEqual({
      application: {
        applicationNo: "APP-20260814-ABCD",
        status: "CONTRACT_PENDING",
        requestedAmountMinor: "25000",
        currency: "USD",
        tenorDays: 30,
        approvedAmountMinor: "25000",
        rejectionConditionResolved: false,
      },
      terms: {
        approvedAmountMinor: "25000",
        serviceFeeMinor: "500",
        totalRepayableMinor: "25500",
        installmentCount: 2,
        firstDueDate: "2026-09-15",
      },
      repayment,
    });
  });
});
