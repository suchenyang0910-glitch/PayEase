import {
  createRepaymentMethodSnapshot,
  createRepaymentPlanSnapshot,
  DEFAULT_EMPLOYER_PAYROLL_RULE_V2,
  DEFAULT_LENDER_INTEREST_RULE_V2,
  DEFAULT_PRODUCT_RULE_V2,
  type EmployerPayrollRuleVersion,
  type RepaymentMethod,
} from "@payease/v1-domain";

export type RepaymentScheduleItem = Readonly<{
  installmentNo: number;
  dueDate: string;
  amountDueMinor: string;
  principalDueMinor?: string;
  lenderInterestDueMinor?: string;
  payrollNodeRef?: string | null;
  amountPaidMinor: string;
  status: "PENDING" | "PAID";
}>;

export type RepaymentScheduleSummary = Readonly<{
  periodCount: number;
  paidPeriods: number;
  unpaidPeriods: number;
  overduePeriods: number;
  totalDueMinor: string;
  totalPaidMinor: string;
  outstandingMinor: string;
  overdueOutstandingMinor: string;
  nextInstallment: null | Pick<
    RepaymentScheduleItem,
    "installmentNo" | "dueDate" | "amountDueMinor"
  >;
  installments: readonly RepaymentScheduleItem[];
}>;

export type ApplicantLoanSummary = Readonly<{
  application: Readonly<{
    applicationNo: string;
    status: string;
    requestedAmountMinor: string;
    currency: string;
    tenorDays: number;
    approvedAmountMinor: string | null;
    rejectionConditionResolved: boolean;
    rejectionCoolingOffEndsAt?: string | null;
    rejectionCoolingOffDaysRemaining?: number | null;
    rejectionNoticeCode:
      | "INFORMATION_INCOMPLETE"
      | "EMPLOYMENT_OR_INCOME_UNVERIFIED"
      | "PRODUCT_ELIGIBILITY_NOT_MET"
      | "LENDER_DECISION"
      | null;
    supplementRequested: boolean;
    // The selected factory name is shown only in the applicant's own
    // authorised summary. It is not an employer membership or volume view.
    employerTenantDisplayName?: string | null;
  }>;
  terms: null | Readonly<{
    approvedAmountMinor: string;
    serviceFeeMinor: string;
    totalRepayableMinor: string;
    installmentCount: number;
    firstDueDate: string;
  }>;
  quote?: null | Readonly<{
    principalAmountMinor: string;
    actualDisbursementAmountMinor: string;
    lenderInterestMinor: string;
    totalRepaymentAmountMinor: string;
    brokerageRemunerationReceivableMinor: string;
    productRuleVersion: string;
    brokerageRemunerationRuleVersion: string;
    lenderInterestRuleVersion: string;
    installmentCount: number;
    firstDueDate: string;
    repaymentGraceDays: number;
  }>;
  repayment: RepaymentScheduleSummary;
  workflow?: Readonly<{
    workflowVersion: "LEGACY_V1" | "SALARY_LOAN_V2";
    selectedRepaymentMethod?: string | null;
    availableRepaymentMethods?: readonly string[];
    collectionScope?: "PRINCIPAL_AND_INTEREST" | null;
    employerVerificationAuthorized?: boolean;
    serviceAgreementAuthorized?: boolean;
    postDisbursementBrokerageAuthorized?: boolean;
    payrollDeductionAuthorized?: boolean;
    directDebitAuthorized?: boolean;
  }>;
  recordDetail?: Readonly<{
    createdAt: string;
    updatedAt: string;
    canUploadPaymentProof: boolean;
    canRequestReassessment: boolean;
  }>;
  repaymentProof?: null | Readonly<{
    proofNo: string;
    status: "UNDER_REVIEW" | "NEEDS_MORE" | "RECONCILED" | "EXCEPTION";
    fileName: string;
    contentType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
    transferReference?: string;
    submittedAt: string;
  }>;
  reassessmentRequest?: null | Readonly<{
    requestNo: string;
    status: "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "DECLINED" | "CLOSED";
    addressChanged: boolean;
    employerUpdated: boolean;
    wealthProofDeclared: boolean;
    submittedAt: string;
  }>;
  timeline?: ReadonlyArray<
    Readonly<{
      occurredAt: string;
      entryType:
        | "STATUS"
        | "APPROVAL"
        | "PAYMENT_PROOF_SUBMITTED"
        | "PAYMENT_PROOF_REVIEWED"
        | "REASSESSMENT_SUBMITTED"
        | "REASSESSMENT_APPROVAL";
      status?: string;
      stage?: string;
      decision?: string;
      actorUserRef?: string;
      actorRole?: string;
      reasonCode?: string;
      referenceNo?: string;
    }>
  >;
}>;

export function formatApplicantLoanSummary(
  application: ApplicantLoanSummary["application"],
  terms: ApplicantLoanSummary["terms"],
  repayment: RepaymentScheduleSummary,
  extras: Pick<
    ApplicantLoanSummary,
    | "workflow"
    | "quote"
    | "recordDetail"
    | "repaymentProof"
    | "reassessmentRequest"
    | "timeline"
  > = {},
): ApplicantLoanSummary {
  return { application, terms, repayment, ...extras };
}

export function buildRepaymentSchedule(
  totalRepayableMinor: string,
  installmentCount: number,
  firstDueDate: string,
): Array<
  Pick<RepaymentScheduleItem, "installmentNo" | "dueDate" | "amountDueMinor">
> {
  if (!/^\d+$/.test(totalRepayableMinor)) {
    throw new Error("total repayable amount must be a minor-unit string");
  }
  if (!Number.isInteger(installmentCount) || installmentCount < 1) {
    throw new Error("installment count must be a positive integer");
  }
  const firstDue = new Date(`${firstDueDate}T00:00:00.000Z`);
  if (Number.isNaN(firstDue.getTime()))
    throw new Error("first due date is invalid");

  const total = BigInt(totalRepayableMinor);
  const count = BigInt(installmentCount);
  const base = total / count;
  const remainder = total % count;
  return Array.from({ length: installmentCount }, (_, offset) => {
    const due = new Date(firstDue);
    due.setUTCDate(due.getUTCDate() + offset * 30);
    const amountDue = base + (offset + 1 === installmentCount ? remainder : 0n);
    return {
      installmentNo: offset + 1,
      dueDate: due.toISOString().slice(0, 10),
      amountDueMinor: amountDue.toString(),
    };
  });
}

function parseIsoDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error("due date is invalid");
  }
  return date;
}

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function endOfMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function normalizePayrollNodes(
  rule: EmployerPayrollRuleVersion,
  firstDueDate: string,
  installmentCount: number,
): EmployerPayrollRuleVersion["payrollNodes"] {
  const firstDue = parseIsoDate(firstDueDate);
  const matchingIndex = rule.payrollNodes.findIndex((node) => {
    if (node.scheduleType === "FIXED_DAY") {
      return firstDue.getUTCDate() === node.dayOfMonth;
    }
    return (
      firstDue.getUTCDate() ===
      endOfMonth(firstDue.getUTCFullYear(), firstDue.getUTCMonth())
    );
  });
  if (matchingIndex === -1) {
    throw new Error("first due date does not match a configured payroll node");
  }
  const rotated = rule.payrollNodes.map(
    (_, offset) =>
      rule.payrollNodes[(matchingIndex + offset) % rule.payrollNodes.length]!,
  );
  return rotated.slice(0, installmentCount as 1 | 2);
}

function coerceConfiguredPayrollNodes(args: {
  payrollNodes: EmployerPayrollRuleVersion["payrollNodes"] | null | undefined;
  installmentCount: 1 | 2;
}): EmployerPayrollRuleVersion["payrollNodes"] {
  const configured =
    Array.isArray(args.payrollNodes) && args.payrollNodes.length > 0
      ? args.payrollNodes
      : DEFAULT_EMPLOYER_PAYROLL_RULE_V2.payrollNodes;
  if (configured.length === 1 && args.installmentCount === 2) {
    const first = configured[0]!;
    return first.scheduleType === "FIXED_DAY"
      ? [first, { nodeRef: "PAYDAY-2", scheduleType: "LAST_DAY_OF_MONTH" }]
      : [
          {
            nodeRef: "PAYDAY-1",
            scheduleType: "FIXED_DAY",
            dayOfMonth: 15,
          },
          first,
        ];
  }
  return configured;
}

function nextPayrollOccurrence(
  afterDate: string,
  node: EmployerPayrollRuleVersion["payrollNodes"][number],
): string {
  const start = parseIsoDate(afterDate);
  let year = start.getUTCFullYear();
  let month = start.getUTCMonth();
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const day =
      node.scheduleType === "FIXED_DAY"
        ? Math.min(node.dayOfMonth, endOfMonth(year, month))
        : endOfMonth(year, month);
    const candidate = new Date(Date.UTC(year, month, day));
    if (candidate > start) {
      return toIsoDate(candidate);
    }
    month += 1;
    if (month === 12) {
      month = 0;
      year += 1;
    }
  }
  throw new Error("unable to resolve the next payroll occurrence");
}

export function buildSalaryLoanV2RepaymentSchedule(args: {
  principalAmountMinor: string;
  lenderInterestMinor: string;
  contractualTermDays: 15 | 30;
  installmentCount: 1 | 2;
  firstDueDate: string;
  selectedRepaymentMethod: RepaymentMethod;
  employerPayrollRuleVersion: string | null | undefined;
  payrollNodes: EmployerPayrollRuleVersion["payrollNodes"] | null | undefined;
  payrollDeductionAuthorizationRef?: string | null;
  collectionPayeeRef: string;
  productRuleVersion: string;
  lenderInterestRuleVersion: string;
}): Array<
  Pick<
    RepaymentScheduleItem,
    | "installmentNo"
    | "dueDate"
    | "amountDueMinor"
    | "principalDueMinor"
    | "lenderInterestDueMinor"
    | "payrollNodeRef"
  >
> {
  if (!/^\d+$/.test(args.principalAmountMinor)) {
    throw new Error("principal amount must be a minor-unit string");
  }
  if (!/^\d+$/.test(args.lenderInterestMinor)) {
    throw new Error("lender interest amount must be a minor-unit string");
  }
  if (![1, 2].includes(args.installmentCount)) {
    throw new Error("installment count must be 1 or 2");
  }

  const baseRule: EmployerPayrollRuleVersion = {
    ...DEFAULT_EMPLOYER_PAYROLL_RULE_V2,
    employerPayrollRuleVersion:
      args.employerPayrollRuleVersion ??
      DEFAULT_EMPLOYER_PAYROLL_RULE_V2.employerPayrollRuleVersion,
    payrollNodes: coerceConfiguredPayrollNodes({
      payrollNodes: args.payrollNodes,
      installmentCount: args.installmentCount,
    }),
  };
  const payrollNodes = normalizePayrollNodes(
    baseRule,
    args.firstDueDate,
    args.installmentCount,
  );
  const employerPayrollRule: EmployerPayrollRuleVersion = {
    ...baseRule,
    payrollNodes,
  };
  const repaymentMethodSnapshot = createRepaymentMethodSnapshot({
    repaymentMethod: args.selectedRepaymentMethod,
    employerPayrollRule,
    userAuthorizationRef: args.payrollDeductionAuthorizationRef ?? undefined,
    collectionPayeeRef: args.collectionPayeeRef,
    frozenAt: `${args.firstDueDate}T00:00:00.000Z`,
  });
  const dueDates: string[] = [args.firstDueDate];
  for (let offset = 1; offset < args.installmentCount; offset += 1) {
    dueDates.push(
      nextPayrollOccurrence(
        dueDates[offset - 1]!,
        payrollNodes[offset % payrollNodes.length]!,
      ),
    );
  }
  const plan = createRepaymentPlanSnapshot({
    planId: `REPAYMENT-PLAN-${baseRule.employerPayrollRuleVersion}-${args.firstDueDate}`,
    generatedAt: `${args.firstDueDate}T00:00:00.000Z`,
    contractualTermDays: args.contractualTermDays,
    principal: { amountMinor: args.principalAmountMinor, currency: "USD" },
    lenderInterest: { amountMinor: args.lenderInterestMinor, currency: "USD" },
    productRule: {
      ...DEFAULT_PRODUCT_RULE_V2,
      ruleVersion: args.productRuleVersion,
    },
    lenderInterestRule: {
      ...DEFAULT_LENDER_INTEREST_RULE_V2,
      feeRuleVersion: args.lenderInterestRuleVersion,
    },
    employerPayrollRule,
    repaymentMethodSnapshot,
    dueDates,
  });

  return plan.installments.map((installment) => ({
    installmentNo: installment.installmentNumber,
    dueDate: installment.dueOn,
    amountDueMinor: installment.totalDue.amountMinor,
    principalDueMinor: installment.principalDue.amountMinor,
    lenderInterestDueMinor: installment.lenderInterestDue.amountMinor,
    payrollNodeRef: installment.payrollNodeRef,
  }));
}

export function summarizeRepaymentSchedule(
  schedule: readonly RepaymentScheduleItem[],
  asOfDate = new Date().toISOString().slice(0, 10),
): RepaymentScheduleSummary {
  const paidPeriods = schedule.filter((item) => item.status === "PAID").length;
  // This is an informational, server-calculated view only. It deliberately
  // does not add a late fee or mutate the loan status: those are lender and
  // local-law policy decisions outside the applicant dashboard.
  const overdueInstallments = schedule.filter(
    (item) => item.status === "PENDING" && item.dueDate < asOfDate,
  );
  const totalDue = schedule.reduce(
    (total, item) => total + BigInt(item.amountDueMinor),
    0n,
  );
  const totalPaid = schedule.reduce(
    (total, item) => total + BigInt(item.amountPaidMinor),
    0n,
  );
  const nextInstallment = schedule.find((item) => item.status === "PENDING");
  return {
    periodCount: schedule.length,
    paidPeriods,
    unpaidPeriods: schedule.length - paidPeriods,
    overduePeriods: overdueInstallments.length,
    totalDueMinor: totalDue.toString(),
    totalPaidMinor: totalPaid.toString(),
    outstandingMinor: (totalDue - totalPaid).toString(),
    overdueOutstandingMinor: overdueInstallments
      .reduce((total, item) => total + BigInt(item.amountDueMinor), 0n)
      .toString(),
    nextInstallment: nextInstallment
      ? {
          installmentNo: nextInstallment.installmentNo,
          dueDate: nextInstallment.dueDate,
          amountDueMinor: nextInstallment.amountDueMinor,
        }
      : null,
    installments: schedule,
  };
}
