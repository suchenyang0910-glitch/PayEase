import { z } from "zod";
import { MoneySchema, moneyAdd, type Money } from "@payease/shared-money";

export const SALARY_LOAN_V2_TENOR_DAYS = [15, 30] as const;
export type SalaryLoanV2TenorDays = (typeof SALARY_LOAN_V2_TENOR_DAYS)[number];

export const FEE_TYPES = [
  "FINANCING_BROKERAGE_REMUNERATION",
  "LENDER_INTEREST",
] as const;
export type FeeType = (typeof FEE_TYPES)[number];

export const CONTRACT_TYPES = [
  "BROKER_SERVICE_AGREEMENT",
  "LENDER_FINAL_CONTRACT",
  "PAYROLL_DEDUCTION_AUTHORIZATION",
  "DIRECT_DEBIT_AUTHORIZATION",
  "CONFIRMATION_VIDEO_SCRIPT",
] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export const EMPLOYER_PAYROLL_COLLECTION_STATUSES = [
  "COLLECTED",
  "PARTIALLY_COLLECTED",
  "NOT_COLLECTED",
] as const;
export type EmployerPayrollCollectionStatus =
  (typeof EMPLOYER_PAYROLL_COLLECTION_STATUSES)[number];

export const ROUNDING_MODES = ["HALF_EVEN", "HALF_UP", "DOWN"] as const;
export type RoundingMode = (typeof ROUNDING_MODES)[number];

export const REPAYMENT_METHODS = [
  "EMPLOYER_PAYROLL_DEDUCTION",
  "USER_DIRECT_DEBIT",
  "USER_MANUAL_PAYMENT",
] as const;
export type RepaymentMethod = (typeof REPAYMENT_METHODS)[number];

export const REVENUE_SHARE_TYPES = [
  "FIXED_MONTHLY",
  "DISBURSED_PRINCIPAL_RATIO",
] as const;
export type EmployerRevenueShareType = (typeof REVENUE_SHARE_TYPES)[number];

const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const ProductRuleSchema = z.object({
  ruleVersion: z.string().min(3).max(64),
  workflowVersion: z.literal("SALARY_LOAN_V2"),
  currency: z.literal("USD"),
  minPrincipalAmountMinor: z.string().regex(/^\d+$/),
  maxPrincipalAmountMinor: z.string().regex(/^\d+$/),
  allowedTenorDays: z
    .array(z.union([z.literal(15), z.literal(30)]))
    .length(2)
    .refine(
      (value) => value[0] === 15 && value[1] === 30,
      "V2 tenor must be [15, 30]",
    ),
  roundingMode: z.enum(ROUNDING_MODES),
  repaymentGraceDays: z.number().int().min(0).max(7),
});
export type ProductRule = z.infer<typeof ProductRuleSchema>;

export const FeeRuleSchema = z.object({
  feeRuleVersion: z.string().min(3).max(64),
  workflowVersion: z.literal("SALARY_LOAN_V2"),
  feeType: z.enum(FEE_TYPES),
  monthlyRateBps: z.number().int().min(0).max(10000),
  paymentTiming: z.enum(["POST_DISBURSEMENT_RECEIVABLE", "REPAYMENT_PLAN"]),
  payeeDomain: z.enum(["BROKER", "LENDER"]),
});
export type FeeRule = z.infer<typeof FeeRuleSchema>;

export const ContractVersionSchema = z.object({
  contractVersion: z.string().min(3).max(64),
  contractType: z.enum(CONTRACT_TYPES),
  owningDomain: z.enum(["BROKER", "LENDER"]),
  language: z.enum(["km", "en", "zh-CN"]),
  effectiveAt: z.string().datetime({ offset: true }),
  documentHash: z.string().regex(/^[0-9a-f]{64}$/),
});
export type ContractVersion = z.infer<typeof ContractVersionSchema>;

const PayrollNodeSchema = z.discriminatedUnion("scheduleType", [
  z.object({
    nodeRef: z.string().min(3).max(64),
    scheduleType: z.literal("FIXED_DAY"),
    dayOfMonth: z.number().int().min(1).max(28),
  }),
  z.object({
    nodeRef: z.string().min(3).max(64),
    scheduleType: z.literal("LAST_DAY_OF_MONTH"),
  }),
]);
export type PayrollNode = z.infer<typeof PayrollNodeSchema>;
const PayrollNodesSchema = z.array(PayrollNodeSchema).min(1).max(2);

export const EmployerPayrollRuleVersionSchema = z
  .object({
    employerPayrollRuleVersion: z.string().min(3).max(64),
    employerTenantRef: z.string().min(1).max(128),
    workflowVersion: z.literal("SALARY_LOAN_V2"),
    collectionCurrency: z.literal("USD"),
    payrollNodes: PayrollNodesSchema,
    allowedRepaymentMethods: z.array(z.enum(REPAYMENT_METHODS)).min(1).max(3),
    defaultRepaymentMethod: z.enum(REPAYMENT_METHODS),
    payrollDeductionEnabled: z.boolean(),
    directDebitEnabled: z.boolean(),
    legalApprovalEnabled: z.boolean(),
    effectiveFrom: z.string().datetime({ offset: true }),
    effectiveUntil: z.string().datetime({ offset: true }).optional(),
  })
  .superRefine((value, ctx) => {
    const uniqueNodeRefs = new Set(
      value.payrollNodes.map((node) => node.nodeRef),
    );
    if (uniqueNodeRefs.size !== value.payrollNodes.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Payroll nodes must use unique nodeRef values",
        path: ["payrollNodes"],
      });
    }

    const uniqueMethods = new Set(value.allowedRepaymentMethods);
    if (uniqueMethods.size !== value.allowedRepaymentMethods.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "allowedRepaymentMethods cannot contain duplicates",
        path: ["allowedRepaymentMethods"],
      });
    }

    if (!uniqueMethods.has(value.defaultRepaymentMethod)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "defaultRepaymentMethod must be allowed by the employer rule",
        path: ["defaultRepaymentMethod"],
      });
    }
  });
export type EmployerPayrollRuleVersion = z.infer<
  typeof EmployerPayrollRuleVersionSchema
>;

export const RepaymentMethodSnapshotSchema = z.object({
  snapshotVersion: z.literal("SALARY_LOAN_V2_REPAYMENT_METHOD_SNAPSHOT"),
  repaymentMethod: z.enum(REPAYMENT_METHODS),
  employerPayrollRuleVersion: z.string().min(3).max(64),
  userAuthorizationRef: z.string().min(3).max(128).optional(),
  collectionPayeeRef: z.string().min(3).max(128),
  frozenAt: z.string().datetime({ offset: true }),
});
export type RepaymentMethodSnapshot = z.infer<
  typeof RepaymentMethodSnapshotSchema
>;

const RepaymentReminderWindowSchema = z.object({
  tMinus3: IsoDateSchema,
  tMinus1: IsoDateSchema,
  tDay: IsoDateSchema,
  graceEndsOn: IsoDateSchema,
});
export type RepaymentReminderWindow = z.infer<
  typeof RepaymentReminderWindowSchema
>;

const RepaymentPlanInstallmentSchema = z.object({
  installmentNumber: z.union([z.literal(1), z.literal(2)]),
  payrollNodeRef: z.string().min(3).max(64),
  dueOn: IsoDateSchema,
  principalDue: MoneySchema,
  lenderInterestDue: MoneySchema,
  totalDue: MoneySchema,
  reminderWindow: RepaymentReminderWindowSchema,
});
export type RepaymentPlanInstallment = z.infer<
  typeof RepaymentPlanInstallmentSchema
>;

export const RepaymentPlanSnapshotSchema = z.object({
  snapshotVersion: z.literal("SALARY_LOAN_V2_REPAYMENT_PLAN_SNAPSHOT"),
  planId: z.string().min(3).max(128),
  workflowVersion: z.literal("SALARY_LOAN_V2"),
  productRuleVersion: z.string().min(3).max(64),
  lenderInterestRuleVersion: z.string().min(3).max(64),
  employerPayrollRuleVersion: z.string().min(3).max(64),
  repaymentMethodSnapshotVersion: z.literal(
    "SALARY_LOAN_V2_REPAYMENT_METHOD_SNAPSHOT",
  ),
  contractualTermDays: z.union([z.literal(15), z.literal(30)]),
  installmentCount: z.union([z.literal(1), z.literal(2)]),
  bufferDays: z.number().int().min(0).max(7),
  generatedAt: z.string().datetime({ offset: true }),
  installments: z.array(RepaymentPlanInstallmentSchema).min(1).max(2),
});
export type RepaymentPlanSnapshot = z.infer<typeof RepaymentPlanSnapshotSchema>;

export const BrokerageRemunerationRuleVersionSchema = z.object({
  brokerageRemunerationRuleVersion: z.string().min(3).max(64),
  workflowVersion: z.literal("SALARY_LOAN_V2"),
  employerTenantRef: z.string().min(1).max(128).optional(),
  feeType: z.literal("FINANCING_BROKERAGE_REMUNERATION"),
  monthlyRateBps: z.number().int().min(0).max(10000),
  paymentTiming: z.literal("POST_DISBURSEMENT_RECEIVABLE"),
  payeeAccountRef: z.string().min(3).max(128),
  reminderOffsetsDays: z.tuple([z.literal(1), z.literal(2), z.literal(3)]),
  effectiveFrom: z.string().datetime({ offset: true }),
  effectiveUntil: z.string().datetime({ offset: true }).optional(),
});
export type BrokerageRemunerationRuleVersion = z.infer<
  typeof BrokerageRemunerationRuleVersionSchema
>;

export const EmployerRevenueShareRuleVersionSchema = z
  .object({
    employerRevenueShareRuleVersion: z.string().min(3).max(64),
    workflowVersion: z.literal("SALARY_LOAN_V2"),
    employerTenantRef: z.string().min(1).max(128),
    revenueShareType: z.enum(REVENUE_SHARE_TYPES),
    fixedMonthlyAmount: MoneySchema.optional(),
    principalRatioBps: z.number().int().min(1).max(10000).optional(),
    settlementCurrency: z.literal("USD"),
    payeeAccountRef: z.string().min(3).max(128),
    effectiveFrom: z.string().datetime({ offset: true }),
    effectiveUntil: z.string().datetime({ offset: true }).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.revenueShareType === "FIXED_MONTHLY" &&
      !value.fixedMonthlyAmount
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "FIXED_MONTHLY requires fixedMonthlyAmount",
        path: ["fixedMonthlyAmount"],
      });
    }
    if (
      value.revenueShareType === "DISBURSED_PRINCIPAL_RATIO" &&
      value.principalRatioBps === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "DISBURSED_PRINCIPAL_RATIO requires principalRatioBps",
        path: ["principalRatioBps"],
      });
    }
  });
export type EmployerRevenueShareRuleVersion = z.infer<
  typeof EmployerRevenueShareRuleVersionSchema
>;

export const BrokerageRemunerationReceivableScheduleSchema = z.object({
  receivableEstablishedOn: IsoDateSchema,
  reminders: z.tuple([IsoDateSchema, IsoDateSchema, IsoDateSchema]),
  dueOn: IsoDateSchema,
});
export type BrokerageRemunerationReceivableSchedule = z.infer<
  typeof BrokerageRemunerationReceivableScheduleSchema
>;

export const SalaryLoanV2QuoteInputSchema = z.object({
  principal: MoneySchema.refine(
    (value) =>
      value.currency === "USD" &&
      BigInt(value.amountMinor) >= 1000n &&
      BigInt(value.amountMinor) <= 50000n,
    "Principal must be USD 10.00 through USD 500.00",
  ),
  tenorDays: z.union([z.literal(15), z.literal(30)]),
  productRule: ProductRuleSchema,
  brokerageRule: BrokerageRemunerationRuleVersionSchema,
  lenderInterestRule: FeeRuleSchema.refine(
    (value) =>
      value.feeType === "LENDER_INTEREST" &&
      value.paymentTiming === "REPAYMENT_PLAN" &&
      value.payeeDomain === "LENDER",
    "Lender interest must stay in the lender repayment plan",
  ),
});
export type SalaryLoanV2QuoteInput = z.infer<
  typeof SalaryLoanV2QuoteInputSchema
>;

export const SalaryLoanV2QuoteSchema = z.object({
  workflowVersion: z.literal("SALARY_LOAN_V2"),
  principal: MoneySchema,
  actualDisbursementAmount: MoneySchema,
  lenderInterest: MoneySchema,
  totalRepaymentAmount: MoneySchema,
  brokerageRemunerationReceivable: MoneySchema,
  contractualTermDays: z.union([z.literal(15), z.literal(30)]),
  productRuleVersion: z.string().min(3).max(64),
  brokerageRemunerationRuleVersion: z.string().min(3).max(64),
  lenderInterestRuleVersion: z.string().min(3).max(64),
});
export type SalaryLoanV2Quote = z.infer<typeof SalaryLoanV2QuoteSchema>;

export const SalaryLoanV2QuoteSnapshotSchema = z.object({
  quoteSnapshotVersion: z.literal("SALARY_LOAN_V2_QUOTE_SNAPSHOT"),
  quoteId: z.string().min(3).max(128),
  generatedAt: z.string().datetime({ offset: true }),
  quote: SalaryLoanV2QuoteSchema,
});
export type SalaryLoanV2QuoteSnapshot = z.infer<
  typeof SalaryLoanV2QuoteSnapshotSchema
>;

function parseIsoDate(value: string): Date {
  if (!IsoDateSchema.safeParse(value).success) {
    throw new Error(`Invalid ISO date: ${value}`);
  }
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid calendar date: ${value}`);
  }
  return date;
}

function formatIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  const date = parseIsoDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatIsoDate(date);
}

function roundQuotient(
  numerator: bigint,
  denominator: bigint,
  roundingMode: RoundingMode,
): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder === 0n) return quotient;
  if (roundingMode === "DOWN") return quotient;
  const doubled = remainder * 2n;
  if (roundingMode === "HALF_UP") {
    return doubled >= denominator ? quotient + 1n : quotient;
  }
  if (doubled < denominator) return quotient;
  if (doubled > denominator) return quotient + 1n;
  return quotient % 2n === 0n ? quotient : quotient + 1n;
}

function calculateProRataFee(
  principalMinor: bigint,
  monthlyRateBps: number,
  tenorDays: SalaryLoanV2TenorDays,
  roundingMode: RoundingMode,
): bigint {
  const numerator = principalMinor * BigInt(monthlyRateBps) * BigInt(tenorDays);
  const denominator = 10000n * 30n;
  return roundQuotient(numerator, denominator, roundingMode);
}

function moneyFromMinor(amountMinor: bigint): Money {
  return { amountMinor: amountMinor.toString(), currency: "USD" };
}

function validateTenorDays(value: number): SalaryLoanV2TenorDays {
  if (value !== 15 && value !== 30) {
    throw new Error("V2 tenor must be 15 or 30 days");
  }
  return value;
}

export function validateEmployerPayrollNodes(
  payrollNodes: readonly PayrollNode[],
): readonly PayrollNode[] {
  const parsed = PayrollNodesSchema.parse(payrollNodes);
  if (new Set(parsed.map((node) => node.nodeRef)).size !== parsed.length) {
    throw new Error("Payroll nodes must use unique nodeRef values");
  }
  return parsed;
}

export function createRepaymentReminderWindow(
  dueOn: string,
  bufferDays: number,
): RepaymentReminderWindow {
  parseIsoDate(dueOn);
  return RepaymentReminderWindowSchema.parse({
    tMinus3: addDays(dueOn, -3),
    tMinus1: addDays(dueOn, -1),
    tDay: dueOn,
    graceEndsOn: addDays(dueOn, bufferDays),
  });
}

export function createBrokerageRemunerationReceivableSchedule(
  disbursedOn: string,
): BrokerageRemunerationReceivableSchedule {
  parseIsoDate(disbursedOn);
  return BrokerageRemunerationReceivableScheduleSchema.parse({
    receivableEstablishedOn: disbursedOn,
    reminders: [
      addDays(disbursedOn, 1),
      addDays(disbursedOn, 2),
      addDays(disbursedOn, 3),
    ],
    dueOn: addDays(disbursedOn, 3),
  });
}

export function resolveBrokerageRemunerationRuleVersion(args: {
  employerTenantRef: string;
  pricedAt: string;
  platformDefaultRule: BrokerageRemunerationRuleVersion;
  employerOverrideRule?: BrokerageRemunerationRuleVersion;
}): BrokerageRemunerationRuleVersion {
  const platformDefaultRule = BrokerageRemunerationRuleVersionSchema.parse(
    args.platformDefaultRule,
  );
  const employerOverrideRule = args.employerOverrideRule
    ? BrokerageRemunerationRuleVersionSchema.parse(args.employerOverrideRule)
    : undefined;
  const pricedAt = new Date(args.pricedAt).getTime();
  if (Number.isNaN(pricedAt)) {
    throw new Error("pricedAt must be a valid datetime");
  }
  if (
    employerOverrideRule &&
    employerOverrideRule.employerTenantRef === args.employerTenantRef &&
    new Date(employerOverrideRule.effectiveFrom).getTime() <= pricedAt &&
    (!employerOverrideRule.effectiveUntil ||
      new Date(employerOverrideRule.effectiveUntil).getTime() >= pricedAt)
  ) {
    return employerOverrideRule;
  }
  return platformDefaultRule;
}

export function createRepaymentMethodSnapshot(args: {
  repaymentMethod: RepaymentMethod;
  employerPayrollRule: EmployerPayrollRuleVersion;
  userAuthorizationRef?: string;
  collectionPayeeRef: string;
  frozenAt: string;
}): RepaymentMethodSnapshot {
  const employerPayrollRule = EmployerPayrollRuleVersionSchema.parse(
    args.employerPayrollRule,
  );
  if (
    !employerPayrollRule.allowedRepaymentMethods.includes(args.repaymentMethod)
  ) {
    throw new Error(
      `${args.repaymentMethod} is not allowed by the employer payroll rule`,
    );
  }
  if (args.repaymentMethod === "EMPLOYER_PAYROLL_DEDUCTION") {
    if (!employerPayrollRule.payrollDeductionEnabled) {
      throw new Error("Employer payroll deduction is not enabled");
    }
    if (!employerPayrollRule.legalApprovalEnabled) {
      throw new Error("Employer payroll deduction requires legal approval");
    }
    if (!args.userAuthorizationRef?.trim()) {
      throw new Error(
        "Employer payroll deduction requires userAuthorizationRef",
      );
    }
  }
  if (args.repaymentMethod === "USER_DIRECT_DEBIT") {
    if (!employerPayrollRule.directDebitEnabled) {
      throw new Error("User direct debit is not enabled");
    }
    if (!employerPayrollRule.legalApprovalEnabled) {
      throw new Error("User direct debit requires legal approval");
    }
    if (!args.userAuthorizationRef?.trim()) {
      throw new Error("User direct debit requires userAuthorizationRef");
    }
  }
  return RepaymentMethodSnapshotSchema.parse({
    snapshotVersion: "SALARY_LOAN_V2_REPAYMENT_METHOD_SNAPSHOT",
    repaymentMethod: args.repaymentMethod,
    employerPayrollRuleVersion: employerPayrollRule.employerPayrollRuleVersion,
    userAuthorizationRef: args.userAuthorizationRef,
    collectionPayeeRef: args.collectionPayeeRef,
    frozenAt: args.frozenAt,
  });
}

export function createRepaymentPlanSnapshot(args: {
  planId: string;
  generatedAt: string;
  contractualTermDays: SalaryLoanV2TenorDays;
  principal: Money;
  lenderInterest: Money;
  productRule: ProductRule;
  lenderInterestRule: FeeRule;
  employerPayrollRule: EmployerPayrollRuleVersion;
  repaymentMethodSnapshot: RepaymentMethodSnapshot;
  dueDates: readonly string[];
}): RepaymentPlanSnapshot {
  const principal = MoneySchema.parse(args.principal);
  const lenderInterest = MoneySchema.parse(args.lenderInterest);
  const productRule = ProductRuleSchema.parse(args.productRule);
  const lenderInterestRule = FeeRuleSchema.parse(args.lenderInterestRule);
  const employerPayrollRule = EmployerPayrollRuleVersionSchema.parse(
    args.employerPayrollRule,
  );
  const repaymentMethodSnapshot = RepaymentMethodSnapshotSchema.parse(
    args.repaymentMethodSnapshot,
  );
  const dueDates = z.array(IsoDateSchema).min(1).max(2).parse(args.dueDates);
  const installmentCount = dueDates.length as 1 | 2;

  validateTenorDays(args.contractualTermDays);
  if (principal.currency !== "USD" || lenderInterest.currency !== "USD") {
    throw new Error("Repayment plan snapshot only supports USD");
  }
  if (
    repaymentMethodSnapshot.employerPayrollRuleVersion !==
    employerPayrollRule.employerPayrollRuleVersion
  ) {
    throw new Error(
      "Repayment method snapshot must freeze the same employer payroll rule version",
    );
  }
  if (installmentCount > employerPayrollRule.payrollNodes.length) {
    throw new Error(
      "Repayment plan cannot span more payroll nodes than the employer provides",
    );
  }
  if (
    dueDates.some((dueOn, index) => index > 0 && dueOn <= dueDates[index - 1]!)
  ) {
    throw new Error("Repayment plan due dates must be in ascending order");
  }

  const principalMinor = BigInt(principal.amountMinor);
  const lenderInterestMinor = BigInt(lenderInterest.amountMinor);
  const firstPrincipalMinor =
    installmentCount === 1 ? principalMinor : principalMinor / 2n;
  const firstInterestMinor =
    installmentCount === 1 ? lenderInterestMinor : lenderInterestMinor / 2n;
  const secondPrincipalMinor = principalMinor - firstPrincipalMinor;
  const secondInterestMinor = lenderInterestMinor - firstInterestMinor;

  const installments = dueDates.map((dueOn, index) => {
    const isFirst = index === 0;
    const principalDue = moneyFromMinor(
      installmentCount === 1
        ? principalMinor
        : isFirst
          ? firstPrincipalMinor
          : secondPrincipalMinor,
    );
    const lenderInterestDue = moneyFromMinor(
      installmentCount === 1
        ? lenderInterestMinor
        : isFirst
          ? firstInterestMinor
          : secondInterestMinor,
    );
    return {
      installmentNumber: (index + 1) as 1 | 2,
      payrollNodeRef: employerPayrollRule.payrollNodes[index]!.nodeRef,
      dueOn,
      principalDue,
      lenderInterestDue,
      totalDue: moneyAdd(principalDue, lenderInterestDue),
      reminderWindow: createRepaymentReminderWindow(
        dueOn,
        productRule.repaymentGraceDays,
      ),
    };
  });

  return RepaymentPlanSnapshotSchema.parse({
    snapshotVersion: "SALARY_LOAN_V2_REPAYMENT_PLAN_SNAPSHOT",
    planId: args.planId,
    workflowVersion: "SALARY_LOAN_V2",
    productRuleVersion: productRule.ruleVersion,
    lenderInterestRuleVersion: lenderInterestRule.feeRuleVersion,
    employerPayrollRuleVersion: employerPayrollRule.employerPayrollRuleVersion,
    repaymentMethodSnapshotVersion: repaymentMethodSnapshot.snapshotVersion,
    contractualTermDays: args.contractualTermDays,
    installmentCount,
    bufferDays: productRule.repaymentGraceDays,
    generatedAt: args.generatedAt,
    installments,
  });
}

export function calculateSalaryLoanV2Quote(
  input: SalaryLoanV2QuoteInput,
): SalaryLoanV2Quote {
  const parsed = SalaryLoanV2QuoteInputSchema.parse(input);
  const principalMinor = BigInt(parsed.principal.amountMinor);
  const brokerageMinor = calculateProRataFee(
    principalMinor,
    parsed.brokerageRule.monthlyRateBps,
    parsed.tenorDays,
    parsed.productRule.roundingMode,
  );
  const lenderInterestMinor = calculateProRataFee(
    principalMinor,
    parsed.lenderInterestRule.monthlyRateBps,
    parsed.tenorDays,
    parsed.productRule.roundingMode,
  );
  return {
    workflowVersion: "SALARY_LOAN_V2",
    principal: parsed.principal,
    actualDisbursementAmount: parsed.principal,
    lenderInterest: moneyFromMinor(lenderInterestMinor),
    totalRepaymentAmount: moneyAdd(
      parsed.principal,
      moneyFromMinor(lenderInterestMinor),
    ),
    brokerageRemunerationReceivable: moneyFromMinor(brokerageMinor),
    contractualTermDays: parsed.tenorDays,
    productRuleVersion: parsed.productRule.ruleVersion,
    brokerageRemunerationRuleVersion:
      parsed.brokerageRule.brokerageRemunerationRuleVersion,
    lenderInterestRuleVersion: parsed.lenderInterestRule.feeRuleVersion,
  };
}

export function createSalaryLoanV2QuoteSnapshot(
  quoteId: string,
  generatedAt: string,
  quote: SalaryLoanV2Quote,
): SalaryLoanV2QuoteSnapshot {
  return SalaryLoanV2QuoteSnapshotSchema.parse({
    quoteSnapshotVersion: "SALARY_LOAN_V2_QUOTE_SNAPSHOT",
    quoteId,
    generatedAt,
    quote,
  });
}

export const DEFAULT_PRODUCT_RULE_V2: ProductRule = {
  ruleVersion: "PRODUCT-RULE-V2-20260821",
  workflowVersion: "SALARY_LOAN_V2",
  currency: "USD",
  minPrincipalAmountMinor: "1000",
  maxPrincipalAmountMinor: "50000",
  allowedTenorDays: [15, 30],
  roundingMode: "HALF_EVEN",
  repaymentGraceDays: 3,
};

export const DEFAULT_BROKERAGE_REMUNERATION_RULE_V2: BrokerageRemunerationRuleVersion =
  {
    brokerageRemunerationRuleVersion: "BROKERAGE-RULE-V2-20260821",
    workflowVersion: "SALARY_LOAN_V2",
    feeType: "FINANCING_BROKERAGE_REMUNERATION",
    monthlyRateBps: 1050,
    paymentTiming: "POST_DISBURSEMENT_RECEIVABLE",
    payeeAccountRef: "KHMERX-BROKERAGE-ACCOUNT",
    reminderOffsetsDays: [1, 2, 3],
    effectiveFrom: "2026-08-21T00:00:00.000Z",
  };

export const DEFAULT_LENDER_INTEREST_RULE_V2: FeeRule = {
  feeRuleVersion: "LENDER-INTEREST-V2-20260821",
  workflowVersion: "SALARY_LOAN_V2",
  feeType: "LENDER_INTEREST",
  monthlyRateBps: 150,
  paymentTiming: "REPAYMENT_PLAN",
  payeeDomain: "LENDER",
};

export const DEFAULT_CONTRACT_VERSIONS_V2: readonly ContractVersion[] = [
  {
    contractVersion: "BROKER-SERVICE-AGREEMENT-V2-ZH-20260821",
    contractType: "BROKER_SERVICE_AGREEMENT",
    owningDomain: "BROKER",
    language: "zh-CN",
    effectiveAt: "2026-08-21T00:00:00.000Z",
    documentHash: "1".repeat(64),
  },
  {
    contractVersion: "LENDER-FINAL-CONTRACT-V2-EN-20260821",
    contractType: "LENDER_FINAL_CONTRACT",
    owningDomain: "LENDER",
    language: "en",
    effectiveAt: "2026-08-21T00:00:00.000Z",
    documentHash: "2".repeat(64),
  },
  {
    contractVersion: "PAYROLL-AUTH-V2-KM-20260821",
    contractType: "PAYROLL_DEDUCTION_AUTHORIZATION",
    owningDomain: "BROKER",
    language: "km",
    effectiveAt: "2026-08-21T00:00:00.000Z",
    documentHash: "3".repeat(64),
  },
] as const;

export const DEFAULT_EMPLOYER_PAYROLL_RULE_V2: EmployerPayrollRuleVersion = {
  employerPayrollRuleVersion: "EMPLOYER-PAYROLL-V2-20260821",
  employerTenantRef: "FACTORY-A",
  workflowVersion: "SALARY_LOAN_V2",
  collectionCurrency: "USD",
  payrollNodes: [
    { nodeRef: "PAYDAY-1", scheduleType: "FIXED_DAY", dayOfMonth: 15 },
    { nodeRef: "PAYDAY-2", scheduleType: "LAST_DAY_OF_MONTH" },
  ],
  allowedRepaymentMethods: [
    "EMPLOYER_PAYROLL_DEDUCTION",
    "USER_MANUAL_PAYMENT",
  ],
  defaultRepaymentMethod: "USER_MANUAL_PAYMENT",
  payrollDeductionEnabled: true,
  directDebitEnabled: false,
  legalApprovalEnabled: true,
  effectiveFrom: "2026-08-21T00:00:00.000Z",
};

export const DEFAULT_EMPLOYER_REVENUE_SHARE_RULE_V2: EmployerRevenueShareRuleVersion =
  {
    employerRevenueShareRuleVersion: "EMPLOYER-REVENUE-SHARE-V2-20260821",
    workflowVersion: "SALARY_LOAN_V2",
    employerTenantRef: "FACTORY-A",
    revenueShareType: "DISBURSED_PRINCIPAL_RATIO",
    principalRatioBps: 250,
    settlementCurrency: "USD",
    payeeAccountRef: "FACTORY-A-AUTHORIZED-PAYEE",
    effectiveFrom: "2026-08-21T00:00:00.000Z",
  };

const QUOTE_FIXTURE_PRINCIPAL_15_DAYS: Money = {
  amountMinor: "10000",
  currency: "USD",
};

const QUOTE_FIXTURE_PRINCIPAL_30_DAYS: Money = {
  amountMinor: "10000",
  currency: "USD",
};

export const SALARY_LOAN_V2_QUOTE_FIXTURES = [
  {
    principal: QUOTE_FIXTURE_PRINCIPAL_15_DAYS,
    tenorDays: 15 as const,
    expected: {
      lenderInterestMinor: "75",
      brokerageRemunerationMinor: "525",
      totalRepaymentAmountMinor: "10075",
    },
  },
  {
    principal: QUOTE_FIXTURE_PRINCIPAL_30_DAYS,
    tenorDays: 30 as const,
    expected: {
      lenderInterestMinor: "150",
      brokerageRemunerationMinor: "1050",
      totalRepaymentAmountMinor: "10150",
    },
  },
] as const;
