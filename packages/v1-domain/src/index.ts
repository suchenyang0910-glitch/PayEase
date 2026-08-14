import { z } from "zod";
import { MoneySchema, type Money } from "@payease/shared-money";

export const LANGUAGE_CODES = ["km", "en", "zh-CN"] as const;
export type LanguageCode = (typeof LANGUAGE_CODES)[number];

export const APPLICATION_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "BROKER_REVIEW",
  "EMPLOYER_VERIFICATION",
  "EMPLOYER_FINANCE_VERIFICATION",
  "LENDER_INITIAL_REVIEW",
  "LENDER_FINAL_REVIEW",
  "CONTRACT_PENDING",
  "USER_CONTRACT_CONFIRMED",
  "CONTRACT_CONFIRMED",
  "DISBURSEMENT_PENDING",
  "DISBURSED",
  "REPAYMENT_ACTIVE",
  "SETTLED",
  "REJECTED",
  "CLOSED",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPROVAL_STAGES = [
  "BROKER_REVIEW",
  "EMPLOYER_VERIFICATION",
  "EMPLOYER_FINANCE_VERIFICATION",
  "LENDER_INITIAL_REVIEW",
  "LENDER_FINAL_REVIEW",
  "DISBURSEMENT_RELEASE",
  "DISBURSEMENT_CONFIRMATION",
  "REPAYMENT_WRITE_OFF",
  "REPAYMENT_CONFIRMATION",
] as const;
export type ApprovalStage = (typeof APPROVAL_STAGES)[number];

export const DECISIONS = ["APPROVED", "REJECTED", "RETURNED"] as const;
export type Decision = (typeof DECISIONS)[number];

export type ApprovalRecord = Readonly<{
  stage: ApprovalStage;
  decision: Decision;
  actorUserId: string;
  actorRole: string;
  reasonCode: string;
  reviewRound?: number;
  internalNote?: string;
  occurredAt: string;
}>;

export type AuditEvent = Readonly<{
  eventType:
    | "APPLICATION_SUBMITTED"
    | "APPROVAL_RECORDED"
    | "USER_CONTRACT_CONFIRMED"
    | "CONTRACT_CONFIRMED"
    | "DISBURSEMENT_RECORDED"
    | "REPAYMENT_RECORDED";
  actorUserId: string;
  occurredAt: string;
  reasonCode?: string;
  evidenceReference?: string;
}>;

export type LoanApplication = Readonly<{
  id: string;
  applicantUserId: string;
  preferredLanguage: LanguageCode;
  requestedAmount: Money;
  tenorDays: number;
  status: ApplicationStatus;
  rejectionConditionResolved: boolean;
  reviewRound: number;
  supplementRequested: boolean;
  approvals: readonly ApprovalRecord[];
  auditEvents: readonly AuditEvent[];
}>;

export const ApplicationInputSchema = z.object({
  id: z.string().min(1),
  applicantUserId: z.string().min(1),
  preferredLanguage: z.enum(LANGUAGE_CODES),
  requestedAmount: MoneySchema.refine(
    (money) =>
      money.currency === "USD" &&
      BigInt(money.amountMinor) >= 1000n &&
      BigInt(money.amountMinor) <= 50000n,
    "V1 amount must be USD 10.00 through USD 500.00",
  ),
  tenorDays: z.number().int().min(7).max(180),
});

const NEXT_STATUS: Readonly<
  Record<ApplicationStatus, readonly ApplicationStatus[]>
> = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["BROKER_REVIEW"],
  BROKER_REVIEW: ["EMPLOYER_VERIFICATION", "REJECTED", "CLOSED"],
  EMPLOYER_VERIFICATION: [
    "EMPLOYER_FINANCE_VERIFICATION",
    "REJECTED",
    "CLOSED",
  ],
  EMPLOYER_FINANCE_VERIFICATION: [
    "LENDER_INITIAL_REVIEW",
    "REJECTED",
    "CLOSED",
  ],
  LENDER_INITIAL_REVIEW: ["LENDER_FINAL_REVIEW", "REJECTED", "CLOSED"],
  LENDER_FINAL_REVIEW: ["CONTRACT_PENDING", "REJECTED", "CLOSED"],
  CONTRACT_PENDING: ["USER_CONTRACT_CONFIRMED", "CLOSED"],
  USER_CONTRACT_CONFIRMED: ["CONTRACT_CONFIRMED", "CLOSED"],
  CONTRACT_CONFIRMED: ["DISBURSEMENT_PENDING"],
  DISBURSEMENT_PENDING: ["DISBURSED", "CLOSED"],
  DISBURSED: ["REPAYMENT_ACTIVE"],
  REPAYMENT_ACTIVE: ["SETTLED", "CLOSED"],
  SETTLED: [],
  REJECTED: ["SUBMITTED"],
  CLOSED: [],
};

const STAGE_TO_STATUS: Readonly<Record<ApprovalStage, ApplicationStatus>> = {
  BROKER_REVIEW: "BROKER_REVIEW",
  EMPLOYER_VERIFICATION: "EMPLOYER_VERIFICATION",
  EMPLOYER_FINANCE_VERIFICATION: "EMPLOYER_FINANCE_VERIFICATION",
  LENDER_INITIAL_REVIEW: "LENDER_INITIAL_REVIEW",
  LENDER_FINAL_REVIEW: "LENDER_FINAL_REVIEW",
  DISBURSEMENT_RELEASE: "DISBURSEMENT_PENDING",
  DISBURSEMENT_CONFIRMATION: "DISBURSEMENT_PENDING",
  REPAYMENT_WRITE_OFF: "REPAYMENT_ACTIVE",
  REPAYMENT_CONFIRMATION: "REPAYMENT_ACTIVE",
};

const stageResult = (
  stage: ApprovalStage,
  decision: Decision,
): ApplicationStatus | undefined => {
  if (decision === "REJECTED") return "REJECTED";
  if (decision === "RETURNED") return undefined;
  const current = STAGE_TO_STATUS[stage];
  const candidates = NEXT_STATUS[current];
  return candidates.find((candidate) => candidate !== "REJECTED");
};

export const createDraftApplication = (
  input: z.input<typeof ApplicationInputSchema>,
): LoanApplication => {
  const parsed = ApplicationInputSchema.parse(input);
  return {
    ...parsed,
    status: "DRAFT",
    rejectionConditionResolved: false,
    reviewRound: 1,
    supplementRequested: false,
    approvals: [],
    auditEvents: [],
  };
};

export const transitionApplication = (
  application: LoanApplication,
  toStatus: ApplicationStatus,
  actorUserId: string,
  occurredAt: string,
  reasonCode?: string,
): LoanApplication => {
  if (
    application.status === "REJECTED" &&
    toStatus === "SUBMITTED" &&
    !application.rejectionConditionResolved
  ) {
    throw new Error(
      "Rejected application cannot be resubmitted until its condition is resolved",
    );
  }
  if (!NEXT_STATUS[application.status].includes(toStatus)) {
    throw new Error(`Invalid transition: ${application.status} -> ${toStatus}`);
  }
  const event: AuditEvent = {
    eventType:
      toStatus === "SUBMITTED" ? "APPLICATION_SUBMITTED" : "APPROVAL_RECORDED",
    actorUserId,
    occurredAt,
    ...(reasonCode === undefined ? {} : { reasonCode }),
  };
  return {
    ...application,
    status: toStatus,
    auditEvents: [...application.auditEvents, event],
  };
};

export const resolveRejectionCondition = (
  application: LoanApplication,
): LoanApplication => ({ ...application, rejectionConditionResolved: true });

export const recordApproval = (
  application: LoanApplication,
  approval: ApprovalRecord,
): LoanApplication => {
  if (STAGE_TO_STATUS[approval.stage] !== application.status) {
    throw new Error(
      `Approval stage ${approval.stage} is not available in ${application.status}`,
    );
  }
  const reviewRound = approval.reviewRound ?? application.reviewRound;
  if (reviewRound !== application.reviewRound) {
    throw new Error("Approval review round does not match the application");
  }
  const normalizedApproval = { ...approval, reviewRound };
  const sameStage = application.approvals.filter(
    (item) =>
      item.stage === normalizedApproval.stage &&
      (item.reviewRound ?? 1) === normalizedApproval.reviewRound,
  );
  if (sameStage.some((item) => item.actorUserId === approval.actorUserId)) {
    throw new Error("The same account cannot approve the same stage twice");
  }
  if (normalizedApproval.decision === "RETURNED") {
    return {
      ...application,
      reviewRound: application.reviewRound + 1,
      supplementRequested: true,
      approvals: [...application.approvals, normalizedApproval],
      auditEvents: [
        ...application.auditEvents,
        {
          eventType: "APPROVAL_RECORDED",
          actorUserId: normalizedApproval.actorUserId,
          occurredAt: normalizedApproval.occurredAt,
          reasonCode: normalizedApproval.reasonCode,
        },
      ],
    };
  }
  const next = stageResult(
    normalizedApproval.stage,
    normalizedApproval.decision,
  );
  if (next === undefined)
    throw new Error("Approval did not produce a state transition");
  return {
    ...application,
    status: next,
    supplementRequested: false,
    approvals: [...application.approvals, normalizedApproval],
    auditEvents: [
      ...application.auditEvents,
      {
        eventType: "APPROVAL_RECORDED",
        actorUserId: normalizedApproval.actorUserId,
        occurredAt: normalizedApproval.occurredAt,
        reasonCode: normalizedApproval.reasonCode,
      },
    ],
  };
};

export const confirmContract = (
  application: LoanApplication,
  actorUserId: string,
  occurredAt: string,
  evidenceReference: string,
): LoanApplication => {
  const updated = transitionApplication(
    application,
    "USER_CONTRACT_CONFIRMED",
    actorUserId,
    occurredAt,
  );
  return {
    ...updated,
    auditEvents: [
      ...updated.auditEvents.slice(0, -1),
      {
        eventType: "USER_CONTRACT_CONFIRMED",
        actorUserId,
        occurredAt,
        evidenceReference,
      },
    ],
  };
};

export const recordLenderContractConfirmation = (
  application: LoanApplication,
  actorUserId: string,
  occurredAt: string,
  evidenceReference: string,
): LoanApplication => {
  const updated = transitionApplication(
    application,
    "CONTRACT_CONFIRMED",
    actorUserId,
    occurredAt,
  );
  return {
    ...updated,
    auditEvents: [
      ...updated.auditEvents.slice(0, -1),
      {
        eventType: "CONTRACT_CONFIRMED",
        actorUserId,
        occurredAt,
        evidenceReference,
      },
    ],
  };
};

export const recordDualControl = (
  application: LoanApplication,
  firstStage: "DISBURSEMENT_RELEASE" | "REPAYMENT_WRITE_OFF",
  firstApproval: ApprovalRecord,
  secondApproval: ApprovalRecord,
): LoanApplication => {
  const requiredSecond: ApprovalStage =
    firstStage === "DISBURSEMENT_RELEASE"
      ? "DISBURSEMENT_CONFIRMATION"
      : "REPAYMENT_CONFIRMATION";
  if (
    firstApproval.stage !== firstStage ||
    secondApproval.stage !== requiredSecond
  ) {
    throw new Error("Invalid dual-control stage pairing");
  }
  if (firstApproval.actorUserId === secondApproval.actorUserId) {
    throw new Error("Dual control requires two distinct accounts");
  }
  if (STAGE_TO_STATUS[firstStage] !== application.status) {
    throw new Error(
      `Approval stage ${firstStage} is not available in ${application.status}`,
    );
  }
  if (
    firstApproval.decision !== "APPROVED" ||
    secondApproval.decision !== "APPROVED"
  ) {
    throw new Error("Dual control can only complete when both approvals agree");
  }
  const next = stageResult(firstStage, "APPROVED");
  if (next === undefined)
    throw new Error("Dual control did not produce a state transition");
  const auditEvents: readonly AuditEvent[] = [
    ...application.auditEvents,
    {
      eventType: "APPROVAL_RECORDED",
      actorUserId: firstApproval.actorUserId,
      occurredAt: firstApproval.occurredAt,
      reasonCode: firstApproval.reasonCode,
    },
    {
      eventType: "APPROVAL_RECORDED",
      actorUserId: secondApproval.actorUserId,
      occurredAt: secondApproval.occurredAt,
      reasonCode: secondApproval.reasonCode,
    },
  ];
  return {
    ...application,
    status: next,
    approvals: [...application.approvals, firstApproval, secondApproval],
    auditEvents,
  };
};

export const markFundsEvent = (
  application: LoanApplication,
  eventType: "DISBURSEMENT_RECORDED" | "REPAYMENT_RECORDED",
  actorUserId: string,
  occurredAt: string,
  evidenceReference: string,
): LoanApplication => ({
  ...application,
  auditEvents: [
    ...application.auditEvents,
    { eventType, actorUserId, occurredAt, evidenceReference },
  ],
});

export const I18N_LABELS: Readonly<
  Record<LanguageCode, Readonly<Record<string, string>>>
> = {
  "zh-CN": {
    submit: "提交申请",
    approved: "已同意",
    rejected: "已拒绝",
    returned: "退回补件",
  },
  en: {
    submit: "Submit application",
    approved: "Approved",
    rejected: "Rejected",
    returned: "Return for documents",
  },
  km: {
    submit: "ដាក់ពាក្យស្នើសុំ",
    approved: "បានយល់ព្រម",
    rejected: "ត្រូវបានបដិសេធ",
    returned: "ត្រឡប់សម្រាប់ឯកសារ",
  },
};

export const translate = (language: LanguageCode, key: string): string =>
  I18N_LABELS[language][key] ?? key;
