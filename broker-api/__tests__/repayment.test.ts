import { describe, expect, it } from "vitest";
import {
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
