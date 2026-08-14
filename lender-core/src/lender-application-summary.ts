import { MoneySchema, formatHuman, type Money } from "@payease/shared-money";

type LenderDisplayLanguage = "zh-CN" | "en" | "km";

const APPLICATION_STATUS_LABELS: Readonly<
  Record<LenderDisplayLanguage, Readonly<Record<string, string>>>
> = {
  en: {
    DRAFT: "Draft",
    SUBMITTED: "Submitted",
    BROKER_REVIEW: "Broker review",
    EMPLOYER_VERIFICATION: "Employer verification",
    EMPLOYER_FINANCE_VERIFICATION: "Employer finance verification",
    LENDER_INITIAL_REVIEW: "Initial credit review",
    LENDER_FINAL_REVIEW: "Final credit review",
    CONTRACT_PENDING: "Awaiting applicant confirmation",
    USER_CONTRACT_CONFIRMED: "Applicant confirmed contract",
    CONTRACT_CONFIRMED: "Contract confirmed",
    DISBURSEMENT_PENDING: "Disbursement pending",
    DISBURSED: "Disbursed",
    REPAYMENT_ACTIVE: "Repayment active",
    SETTLED: "Settled",
    REJECTED: "Rejected",
    CLOSED: "Closed",
  },
  "zh-CN": {
    DRAFT: "草稿",
    SUBMITTED: "已提交",
    BROKER_REVIEW: "助贷审核中",
    EMPLOYER_VERIFICATION: "企业在职核验中",
    EMPLOYER_FINANCE_VERIFICATION: "企业财务核验中",
    LENDER_INITIAL_REVIEW: "初审中",
    LENDER_FINAL_REVIEW: "终审中",
    CONTRACT_PENDING: "待用户确认合同",
    USER_CONTRACT_CONFIRMED: "用户已确认合同",
    CONTRACT_CONFIRMED: "合同已确认",
    DISBURSEMENT_PENDING: "待放款",
    DISBURSED: "已放款",
    REPAYMENT_ACTIVE: "还款中",
    SETTLED: "已结清",
    REJECTED: "已拒绝",
    CLOSED: "已关闭",
  },
  km: {
    DRAFT: "សេចក្តីព្រាង",
    SUBMITTED: "បានដាក់ស្នើ",
    BROKER_REVIEW: "កំពុងត្រួតពិនិត្យដោយដៃគូជំនួយឥណទាន",
    EMPLOYER_VERIFICATION: "កំពុងផ្ទៀងផ្ទាត់និយោជក",
    EMPLOYER_FINANCE_VERIFICATION: "កំពុងផ្ទៀងផ្ទាត់ហិរញ្ញវត្ថុនិយោជក",
    LENDER_INITIAL_REVIEW: "កំពុងពិនិត្យឥណទានដំបូង",
    LENDER_FINAL_REVIEW: "កំពុងពិនិត្យឥណទានចុងក្រោយ",
    CONTRACT_PENDING: "រង់ចាំការបញ្ជាក់កិច្ចសន្យាពីអ្នកប្រើ",
    USER_CONTRACT_CONFIRMED: "អ្នកប្រើបានបញ្ជាក់កិច្ចសន្យា",
    CONTRACT_CONFIRMED: "កិច្ចសន្យាបានបញ្ជាក់",
    DISBURSEMENT_PENDING: "រង់ចាំការបញ្ចេញប្រាក់",
    DISBURSED: "បានបញ្ចេញប្រាក់",
    REPAYMENT_ACTIVE: "កំពុងសងប្រាក់",
    SETTLED: "បានទូទាត់រួច",
    REJECTED: "បានបដិសេធ",
    CLOSED: "បានបិទ",
  },
};

export function lenderApplicationStatusLabel(
  status: string,
  language: LenderDisplayLanguage,
): string {
  return APPLICATION_STATUS_LABELS[language][status] ?? status;
}

export type LenderApplicationSummary = Readonly<{
  application: Readonly<{
    applicationNo: string;
    status: string;
    requestedAmount: Money;
    tenorDays: number;
    approvedAmount: Money | null;
    rejectionConditionResolved: boolean;
  }>;
  terms: null | Readonly<{
    approvedAmount: Money;
    serviceFee: Money;
    totalRepayable: Money;
    installmentCount: number;
    firstDueDate: string;
  }>;
  repayment: Readonly<{
    paidPeriods: number;
    unpaidPeriods: number;
    outstanding: Money;
  }>;
}>;

function requiredText(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function money(amountMinor: unknown, currency: unknown): Money | undefined {
  const parsed = MoneySchema.safeParse({ amountMinor, currency });
  return parsed.success ? parsed.data : undefined;
}

/** Parses the lender-authorized case view before it is displayed to an operator. */
export function parseLenderApplicationSummary(
  payload: unknown,
): LenderApplicationSummary | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const root = payload as Record<string, unknown>;
  if (
    !root.application ||
    typeof root.application !== "object" ||
    !root.repayment ||
    typeof root.repayment !== "object"
  ) {
    return undefined;
  }
  const application = root.application as Record<string, unknown>;
  const repayment = root.repayment as Record<string, unknown>;
  const applicationNo = requiredText(application.applicationNo);
  const status = requiredText(application.status);
  const requestedAmount = money(
    application.requestedAmountMinor,
    application.currency,
  );
  const tenorDays = nonNegativeInteger(application.tenorDays);
  const paidPeriods = nonNegativeInteger(repayment.paidPeriods);
  const unpaidPeriods = nonNegativeInteger(repayment.unpaidPeriods);
  const outstanding = money(repayment.outstandingMinor, application.currency);
  if (
    !applicationNo ||
    !status ||
    !requestedAmount ||
    !tenorDays ||
    paidPeriods === undefined ||
    unpaidPeriods === undefined ||
    !outstanding ||
    typeof application.rejectionConditionResolved !== "boolean"
  ) {
    return undefined;
  }
  let approvedAmount: Money | null;
  if (application.approvedAmountMinor === null) {
    approvedAmount = null;
  } else {
    const parsedApprovedAmount = money(
      application.approvedAmountMinor,
      application.currency,
    );
    if (!parsedApprovedAmount) return undefined;
    approvedAmount = parsedApprovedAmount;
  }

  let terms: LenderApplicationSummary["terms"] = null;
  if (root.terms !== null) {
    if (!root.terms || typeof root.terms !== "object") return undefined;
    const rawTerms = root.terms as Record<string, unknown>;
    const termsApprovedAmount = money(
      rawTerms.approvedAmountMinor,
      application.currency,
    );
    const serviceFee = money(rawTerms.serviceFeeMinor, application.currency);
    const totalRepayable = money(
      rawTerms.totalRepayableMinor,
      application.currency,
    );
    const installmentCount = nonNegativeInteger(rawTerms.installmentCount);
    const firstDueDate = requiredText(rawTerms.firstDueDate);
    if (
      !termsApprovedAmount ||
      !serviceFee ||
      !totalRepayable ||
      !installmentCount ||
      !firstDueDate
    ) {
      return undefined;
    }
    terms = {
      approvedAmount: termsApprovedAmount,
      serviceFee,
      totalRepayable,
      installmentCount,
      firstDueDate,
    };
  }
  return {
    application: {
      applicationNo,
      status,
      requestedAmount,
      tenorDays,
      approvedAmount,
      rejectionConditionResolved: application.rejectionConditionResolved,
    },
    terms,
    repayment: { paidPeriods, unpaidPeriods, outstanding },
  };
}

export function allowedLenderActionRoutes(
  summary: LenderApplicationSummary,
): readonly string[] {
  switch (summary.application.status) {
    case "LENDER_INITIAL_REVIEW":
      return ["lender-initial-review"];
    case "LENDER_FINAL_REVIEW":
      return ["lender-final-review"];
    case "REJECTED":
      return summary.application.rejectionConditionResolved
        ? []
        : ["reapplication-condition-resolved"];
    case "USER_CONTRACT_CONFIRMED":
      return ["contract-confirmation"];
    case "CONTRACT_CONFIRMED":
      return ["open-disbursement"];
    case "DISBURSEMENT_PENDING":
      return ["disbursement-release", "disbursement-confirmation"];
    case "DISBURSED":
      return ["activate-repayment"];
    case "REPAYMENT_ACTIVE":
      return ["repayment-write-off", "repayment-confirmation"];
    default:
      return [];
  }
}

export function lenderSummaryLines(
  summary: LenderApplicationSummary,
): readonly string[] {
  const lines = [
    `Status: ${summary.application.status}`,
    `Requested: ${formatHuman(summary.application.requestedAmount)}`,
    `Tenor: ${summary.application.tenorDays} days`,
  ];
  if (summary.application.approvedAmount) {
    lines.push(`Approved: ${formatHuman(summary.application.approvedAmount)}`);
  }
  if (summary.terms) {
    lines.push(
      `Repayable: ${formatHuman(summary.terms.totalRepayable)}`,
      `Schedule: ${summary.terms.installmentCount} installments; first due ${summary.terms.firstDueDate}`,
    );
  }
  lines.push(
    `Repayment: ${summary.repayment.paidPeriods} paid / ${summary.repayment.unpaidPeriods} unpaid; outstanding ${formatHuman(summary.repayment.outstanding)}`,
  );
  return lines;
}
