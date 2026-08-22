import { describe, expect, it } from "vitest";
import {
  calculateSalaryLoanV2Quote,
  createBrokerageRemunerationReceivableSchedule,
  createRepaymentMethodSnapshot,
  createRepaymentPlanSnapshot,
  createSalaryLoanV2QuoteSnapshot,
  DEFAULT_BROKERAGE_REMUNERATION_RULE_V2,
  DEFAULT_EMPLOYER_PAYROLL_RULE_V2,
  DEFAULT_LENDER_INTEREST_RULE_V2,
  DEFAULT_PRODUCT_RULE_V2,
  resolveBrokerageRemunerationRuleVersion,
  SALARY_LOAN_V2_QUOTE_FIXTURES,
  validateEmployerPayrollNodes,
} from "../src/index.js";

describe("salary loan v2 Day 1 rules", () => {
  it("prices only 15 and 30 day tenors without deducting disbursement principal", () => {
    for (const fixture of SALARY_LOAN_V2_QUOTE_FIXTURES) {
      const quote = calculateSalaryLoanV2Quote({
        principal: fixture.principal,
        tenorDays: fixture.tenorDays,
        productRule: DEFAULT_PRODUCT_RULE_V2,
        brokerageRule: DEFAULT_BROKERAGE_REMUNERATION_RULE_V2,
        lenderInterestRule: DEFAULT_LENDER_INTEREST_RULE_V2,
      });

      expect(quote.actualDisbursementAmount.amountMinor).toBe(
        fixture.principal.amountMinor,
      );
      expect(quote.lenderInterest.amountMinor).toBe(
        fixture.expected.lenderInterestMinor,
      );
      expect(quote.brokerageRemunerationReceivable.amountMinor).toBe(
        fixture.expected.brokerageRemunerationMinor,
      );
      expect(quote.totalRepaymentAmount.amountMinor).toBe(
        fixture.expected.totalRepaymentAmountMinor,
      );
    }
  });

  it("freezes a quote snapshot with explicit rule versions", () => {
    const quote = calculateSalaryLoanV2Quote({
      principal: { amountMinor: "25000", currency: "USD" },
      tenorDays: 30,
      productRule: DEFAULT_PRODUCT_RULE_V2,
      brokerageRule: DEFAULT_BROKERAGE_REMUNERATION_RULE_V2,
      lenderInterestRule: DEFAULT_LENDER_INTEREST_RULE_V2,
    });

    const snapshot = createSalaryLoanV2QuoteSnapshot(
      "QUOTE-V2-0001",
      "2026-08-21T12:00:00.000Z",
      quote,
    );

    expect(snapshot.quote.productRuleVersion).toBe(
      DEFAULT_PRODUCT_RULE_V2.ruleVersion,
    );
    expect(snapshot.quote.brokerageRemunerationRuleVersion).toBe(
      DEFAULT_BROKERAGE_REMUNERATION_RULE_V2.brokerageRemunerationRuleVersion,
    );
    expect(snapshot.quote.lenderInterestRuleVersion).toBe(
      DEFAULT_LENDER_INTEREST_RULE_V2.feeRuleVersion,
    );
  });

  it("rejects unsupported tenor values before pricing", () => {
    expect(() =>
      calculateSalaryLoanV2Quote({
        principal: { amountMinor: "12000", currency: "USD" },
        tenorDays: 20 as 15,
        productRule: DEFAULT_PRODUCT_RULE_V2,
        brokerageRule: DEFAULT_BROKERAGE_REMUNERATION_RULE_V2,
        lenderInterestRule: DEFAULT_LENDER_INTEREST_RULE_V2,
      }),
    ).toThrow(/Invalid input/);
  });

  it("uses the rounding mode frozen on the product rule version", () => {
    const halfEvenQuote = calculateSalaryLoanV2Quote({
      principal: { amountMinor: "10000", currency: "USD" },
      tenorDays: 15,
      productRule: DEFAULT_PRODUCT_RULE_V2,
      brokerageRule: {
        ...DEFAULT_BROKERAGE_REMUNERATION_RULE_V2,
        monthlyRateBps: 1,
      },
      lenderInterestRule: {
        ...DEFAULT_LENDER_INTEREST_RULE_V2,
        monthlyRateBps: 0,
      },
    });

    const halfUpQuote = calculateSalaryLoanV2Quote({
      principal: { amountMinor: "10000", currency: "USD" },
      tenorDays: 15,
      productRule: {
        ...DEFAULT_PRODUCT_RULE_V2,
        ruleVersion: "PRODUCT-RULE-V2-HALF-UP",
        roundingMode: "HALF_UP",
      },
      brokerageRule: {
        ...DEFAULT_BROKERAGE_REMUNERATION_RULE_V2,
        brokerageRemunerationRuleVersion: "BROKERAGE-RULE-V2-HALF-UP",
        monthlyRateBps: 1,
      },
      lenderInterestRule: {
        ...DEFAULT_LENDER_INTEREST_RULE_V2,
        feeRuleVersion: "LENDER-INTEREST-V2-HALF-UP",
        monthlyRateBps: 0,
      },
    });

    expect(halfEvenQuote.brokerageRemunerationReceivable.amountMinor).toBe("0");
    expect(halfUpQuote.brokerageRemunerationReceivable.amountMinor).toBe("1");
  });

  it("validates one or two payroll nodes and rejects duplicates", () => {
    expect(
      validateEmployerPayrollNodes(
        DEFAULT_EMPLOYER_PAYROLL_RULE_V2.payrollNodes,
      ),
    ).toHaveLength(2);
    expect(() =>
      validateEmployerPayrollNodes([
        { nodeRef: "PAYDAY-1", scheduleType: "FIXED_DAY", dayOfMonth: 15 },
        { nodeRef: "PAYDAY-1", scheduleType: "LAST_DAY_OF_MONTH" },
      ]),
    ).toThrow(/unique nodeRef/i);
  });

  it("requires authorization before enabling payroll deduction or direct debit", () => {
    expect(() =>
      createRepaymentMethodSnapshot({
        repaymentMethod: "EMPLOYER_PAYROLL_DEDUCTION",
        employerPayrollRule: DEFAULT_EMPLOYER_PAYROLL_RULE_V2,
        collectionPayeeRef: "LENDER-COLLECTION-ACCOUNT",
        frozenAt: "2026-08-21T09:00:00.000Z",
      }),
    ).toThrow(/userAuthorizationRef/);

    expect(() =>
      createRepaymentMethodSnapshot({
        repaymentMethod: "USER_DIRECT_DEBIT",
        employerPayrollRule: {
          ...DEFAULT_EMPLOYER_PAYROLL_RULE_V2,
          allowedRepaymentMethods: ["USER_DIRECT_DEBIT", "USER_MANUAL_PAYMENT"],
          defaultRepaymentMethod: "USER_MANUAL_PAYMENT",
        },
        collectionPayeeRef: "LENDER-COLLECTION-ACCOUNT",
        frozenAt: "2026-08-21T09:00:00.000Z",
        userAuthorizationRef: "AUTH-001",
      }),
    ).toThrow(/not enabled/);
  });

  it("freezes one-node repayment plan with T-3/T-1/T reminders and a 3-day buffer", () => {
    const method = createRepaymentMethodSnapshot({
      repaymentMethod: "USER_MANUAL_PAYMENT",
      employerPayrollRule: DEFAULT_EMPLOYER_PAYROLL_RULE_V2,
      collectionPayeeRef: "LENDER-COLLECTION-ACCOUNT",
      frozenAt: "2026-08-21T09:00:00.000Z",
    });

    const plan = createRepaymentPlanSnapshot({
      planId: "PLAN-ONE-NODE-001",
      generatedAt: "2026-08-21T10:00:00.000Z",
      contractualTermDays: 15,
      principal: { amountMinor: "10001", currency: "USD" },
      lenderInterest: { amountMinor: "151", currency: "USD" },
      productRule: DEFAULT_PRODUCT_RULE_V2,
      lenderInterestRule: DEFAULT_LENDER_INTEREST_RULE_V2,
      employerPayrollRule: DEFAULT_EMPLOYER_PAYROLL_RULE_V2,
      repaymentMethodSnapshot: method,
      dueDates: ["2026-08-31"],
    });

    expect(plan.installmentCount).toBe(1);
    expect(plan.installments[0]).toMatchObject({
      payrollNodeRef: "PAYDAY-1",
      dueOn: "2026-08-31",
      principalDue: { amountMinor: "10001", currency: "USD" },
      lenderInterestDue: { amountMinor: "151", currency: "USD" },
      totalDue: { amountMinor: "10152", currency: "USD" },
      reminderWindow: {
        tMinus3: "2026-08-28",
        tMinus1: "2026-08-30",
        tDay: "2026-08-31",
        graceEndsOn: "2026-09-03",
      },
    });
  });

  it("splits odd cents into the second installment on a two-node plan", () => {
    const method = createRepaymentMethodSnapshot({
      repaymentMethod: "EMPLOYER_PAYROLL_DEDUCTION",
      employerPayrollRule: DEFAULT_EMPLOYER_PAYROLL_RULE_V2,
      userAuthorizationRef: "PAYROLL-AUTH-001",
      collectionPayeeRef: "LENDER-COLLECTION-ACCOUNT",
      frozenAt: "2026-08-21T09:00:00.000Z",
    });

    const plan = createRepaymentPlanSnapshot({
      planId: "PLAN-TWO-NODE-001",
      generatedAt: "2026-08-21T10:00:00.000Z",
      contractualTermDays: 30,
      principal: { amountMinor: "10001", currency: "USD" },
      lenderInterest: { amountMinor: "151", currency: "USD" },
      productRule: DEFAULT_PRODUCT_RULE_V2,
      lenderInterestRule: DEFAULT_LENDER_INTEREST_RULE_V2,
      employerPayrollRule: DEFAULT_EMPLOYER_PAYROLL_RULE_V2,
      repaymentMethodSnapshot: method,
      dueDates: ["2026-09-15", "2026-09-30"],
    });

    expect(plan.installmentCount).toBe(2);
    expect(plan.installments[0]?.principalDue.amountMinor).toBe("5000");
    expect(plan.installments[0]?.lenderInterestDue.amountMinor).toBe("75");
    expect(plan.installments[1]?.principalDue.amountMinor).toBe("5001");
    expect(plan.installments[1]?.lenderInterestDue.amountMinor).toBe("76");
    expect(plan.installments[1]?.reminderWindow.graceEndsOn).toBe("2026-10-03");
  });

  it("uses the employer override brokerage rule when effective", () => {
    const resolved = resolveBrokerageRemunerationRuleVersion({
      employerTenantRef: "FACTORY-A",
      pricedAt: "2026-08-21T12:00:00.000Z",
      platformDefaultRule: DEFAULT_BROKERAGE_REMUNERATION_RULE_V2,
      employerOverrideRule: {
        ...DEFAULT_BROKERAGE_REMUNERATION_RULE_V2,
        brokerageRemunerationRuleVersion: "FACTORY-A-BROKERAGE-RULE",
        employerTenantRef: "FACTORY-A",
        monthlyRateBps: 900,
      },
    });

    expect(resolved.monthlyRateBps).toBe(900);
    expect(resolved.brokerageRemunerationRuleVersion).toBe(
      "FACTORY-A-BROKERAGE-RULE",
    );
  });

  it("creates D+1/D+2/D+3 brokerage remuneration reminders after disbursement", () => {
    const schedule =
      createBrokerageRemunerationReceivableSchedule("2026-08-31");
    expect(schedule).toEqual({
      receivableEstablishedOn: "2026-08-31",
      reminders: ["2026-09-01", "2026-09-02", "2026-09-03"],
      dueOn: "2026-09-03",
    });
  });

  it("rejects number amountMinor values on new money DTO inputs", () => {
    expect(() =>
      calculateSalaryLoanV2Quote({
        principal: { amountMinor: 10000, currency: "USD" } as never,
        tenorDays: 15,
        productRule: DEFAULT_PRODUCT_RULE_V2,
        brokerageRule: DEFAULT_BROKERAGE_REMUNERATION_RULE_V2,
        lenderInterestRule: DEFAULT_LENDER_INTEREST_RULE_V2,
      }),
    ).toThrow(/amountMinor must be a string/);
  });

  it("rejects repayment plans that try to use more payroll nodes than the employer provides", () => {
    const method = createRepaymentMethodSnapshot({
      repaymentMethod: "USER_MANUAL_PAYMENT",
      employerPayrollRule: {
        ...DEFAULT_EMPLOYER_PAYROLL_RULE_V2,
        payrollNodes: [
          { nodeRef: "PAYDAY-1", scheduleType: "FIXED_DAY", dayOfMonth: 15 },
        ],
      },
      collectionPayeeRef: "LENDER-COLLECTION-ACCOUNT",
      frozenAt: "2026-08-21T09:00:00.000Z",
    });

    expect(() =>
      createRepaymentPlanSnapshot({
        planId: "PLAN-BAD-001",
        generatedAt: "2026-08-21T10:00:00.000Z",
        contractualTermDays: 30,
        principal: { amountMinor: "10000", currency: "USD" },
        lenderInterest: { amountMinor: "150", currency: "USD" },
        productRule: DEFAULT_PRODUCT_RULE_V2,
        lenderInterestRule: DEFAULT_LENDER_INTEREST_RULE_V2,
        employerPayrollRule: {
          ...DEFAULT_EMPLOYER_PAYROLL_RULE_V2,
          payrollNodes: [
            { nodeRef: "PAYDAY-1", scheduleType: "FIXED_DAY", dayOfMonth: 15 },
          ],
        },
        repaymentMethodSnapshot: method,
        dueDates: ["2026-09-15", "2026-09-30"],
      }),
    ).toThrow(/more payroll nodes than the employer provides/);
  });
});
