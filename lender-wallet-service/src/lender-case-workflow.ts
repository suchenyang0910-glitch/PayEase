/**
 * Lender-domain case workflow policy.  This is deliberately independent from
 * Broker application state: the lender stores only its own case projection and
 * append-only decisions/evidence references.
 */
export const LENDER_OPERATOR_ROLES = [
  "LENDER_KYC_AML_REVIEWER",
  "LENDER_CREDIT_REVIEWER",
  "LENDER_CREDIT_APPROVER",
  "LENDER_CONTRACT_MAKER",
  "LENDER_CONTRACT_CHECKER",
  "LENDER_DISBURSEMENT_MAKER",
  "LENDER_DISBURSEMENT_CHECKER",
  "LENDER_SERVICING_ACCOUNTING",
  "LENDER_COMPLAINT_OFFICER",
  "LENDER_AUDITOR",
  "LENDER_WALLET_MAKER",
  "LENDER_WALLET_CHECKER",
  "LENDER_WALLET_ADMIN",
] as const;

export type LenderOperatorRole = (typeof LENDER_OPERATOR_ROLES)[number];
export type LenderCaseStage =
  | "KYC_AML_REVIEW"
  | "CREDIT_REVIEW"
  | "CREDIT_APPROVAL"
  | "CONTRACT_MAKER"
  | "CONTRACT_CHECKER"
  | "DISBURSEMENT_MAKER"
  | "DISBURSEMENT_CHECKER"
  | "SERVICING"
  | "COMPLAINT"
  | "CLOSED";
export type LenderCaseStatus =
  | "OPEN"
  | "AWAITING_INFORMATION"
  | "NEEDS_REWORK"
  | "ACTIVE"
  | "REJECTED"
  | "SETTLED"
  | "CLOSED";

export const LENDER_CASE_ACTIONS = [
  "KYC_AML_PASSED",
  "KYC_AML_MORE_INFO_REQUIRED",
  "KYC_AML_REJECTED",
  "CREDIT_REVIEW_PASSED",
  "CREDIT_MORE_INFO_REQUIRED",
  "CREDIT_APPROVED",
  "CREDIT_REJECTED",
  "CONTRACT_DRAFTED",
  "CONTRACT_APPROVED",
  "CONTRACT_REJECTED",
  "DISBURSEMENT_PREPARED",
  "DISBURSEMENT_APPROVED",
  "DISBURSEMENT_FAILED",
  "REPAYMENT_RECORDED",
  "LOAN_SETTLED",
  "SERVICING_EXCEPTION",
  "COMPLAINT_ACKNOWLEDGED",
  "COMPLAINT_RESOLVED",
  "COMPLAINT_CLOSED",
] as const;
export type LenderCaseAction = (typeof LENDER_CASE_ACTIONS)[number];

type WorkflowTarget = Readonly<{
  stage: LenderCaseStage;
  status: LenderCaseStatus;
}>;
type WorkflowRule = Readonly<{
  role: LenderOperatorRole;
  allowed: readonly WorkflowTarget[];
  requiresEvidence?: boolean;
  makerSeparation?: "CONTRACT" | "DISBURSEMENT";
}>;

const WORKFLOW: Readonly<Record<LenderCaseAction, WorkflowRule>> = {
  KYC_AML_PASSED: {
    role: "LENDER_KYC_AML_REVIEWER",
    allowed: [{ stage: "CREDIT_REVIEW", status: "OPEN" }],
    requiresEvidence: true,
  },
  KYC_AML_MORE_INFO_REQUIRED: {
    role: "LENDER_KYC_AML_REVIEWER",
    allowed: [{ stage: "KYC_AML_REVIEW", status: "AWAITING_INFORMATION" }],
    requiresEvidence: true,
  },
  KYC_AML_REJECTED: {
    role: "LENDER_KYC_AML_REVIEWER",
    allowed: [{ stage: "CLOSED", status: "REJECTED" }],
    requiresEvidence: true,
  },
  CREDIT_REVIEW_PASSED: {
    role: "LENDER_CREDIT_REVIEWER",
    allowed: [{ stage: "CREDIT_APPROVAL", status: "OPEN" }],
    requiresEvidence: true,
  },
  CREDIT_MORE_INFO_REQUIRED: {
    role: "LENDER_CREDIT_REVIEWER",
    allowed: [{ stage: "CREDIT_REVIEW", status: "AWAITING_INFORMATION" }],
    requiresEvidence: true,
  },
  CREDIT_APPROVED: {
    role: "LENDER_CREDIT_APPROVER",
    allowed: [{ stage: "CONTRACT_MAKER", status: "OPEN" }],
    requiresEvidence: true,
  },
  CREDIT_REJECTED: {
    role: "LENDER_CREDIT_APPROVER",
    allowed: [{ stage: "CLOSED", status: "REJECTED" }],
    requiresEvidence: true,
  },
  CONTRACT_DRAFTED: {
    role: "LENDER_CONTRACT_MAKER",
    allowed: [{ stage: "CONTRACT_CHECKER", status: "OPEN" }],
    requiresEvidence: true,
  },
  CONTRACT_APPROVED: {
    role: "LENDER_CONTRACT_CHECKER",
    allowed: [{ stage: "DISBURSEMENT_MAKER", status: "OPEN" }],
    requiresEvidence: true,
    makerSeparation: "CONTRACT",
  },
  CONTRACT_REJECTED: {
    role: "LENDER_CONTRACT_CHECKER",
    allowed: [{ stage: "CONTRACT_MAKER", status: "NEEDS_REWORK" }],
    requiresEvidence: true,
    makerSeparation: "CONTRACT",
  },
  DISBURSEMENT_PREPARED: {
    role: "LENDER_DISBURSEMENT_MAKER",
    allowed: [{ stage: "DISBURSEMENT_CHECKER", status: "OPEN" }],
    requiresEvidence: true,
  },
  DISBURSEMENT_APPROVED: {
    role: "LENDER_DISBURSEMENT_CHECKER",
    allowed: [{ stage: "SERVICING", status: "ACTIVE" }],
    requiresEvidence: true,
    makerSeparation: "DISBURSEMENT",
  },
  DISBURSEMENT_FAILED: {
    role: "LENDER_DISBURSEMENT_CHECKER",
    allowed: [{ stage: "DISBURSEMENT_MAKER", status: "NEEDS_REWORK" }],
    requiresEvidence: true,
    makerSeparation: "DISBURSEMENT",
  },
  REPAYMENT_RECORDED: {
    role: "LENDER_SERVICING_ACCOUNTING",
    allowed: [{ stage: "SERVICING", status: "ACTIVE" }],
    requiresEvidence: true,
  },
  LOAN_SETTLED: {
    role: "LENDER_SERVICING_ACCOUNTING",
    allowed: [{ stage: "CLOSED", status: "SETTLED" }],
    requiresEvidence: true,
  },
  SERVICING_EXCEPTION: {
    role: "LENDER_SERVICING_ACCOUNTING",
    allowed: [{ stage: "SERVICING", status: "AWAITING_INFORMATION" }],
    requiresEvidence: true,
  },
  COMPLAINT_ACKNOWLEDGED: {
    role: "LENDER_COMPLAINT_OFFICER",
    allowed: [{ stage: "COMPLAINT", status: "ACTIVE" }],
    requiresEvidence: true,
  },
  COMPLAINT_RESOLVED: {
    role: "LENDER_COMPLAINT_OFFICER",
    allowed: [{ stage: "COMPLAINT", status: "AWAITING_INFORMATION" }],
    requiresEvidence: true,
  },
  COMPLAINT_CLOSED: {
    role: "LENDER_COMPLAINT_OFFICER",
    allowed: [{ stage: "CLOSED", status: "CLOSED" }],
    requiresEvidence: true,
  },
};

export function lenderCaseActionPolicy(action: LenderCaseAction): WorkflowRule {
  return WORKFLOW[action];
}

export function nextLenderCaseState(
  args: Readonly<{
    action: LenderCaseAction;
    stage: LenderCaseStage;
    status: LenderCaseStatus;
    roles: readonly string[];
    evidenceReference?: string;
    contractMakerRef?: string | null;
    disbursementMakerRef?: string | null;
    actorRef: string;
  }>,
): WorkflowTarget {
  const rule = lenderCaseActionPolicy(args.action);
  if (!args.roles.includes(rule.role))
    throw new Error("LENDER_CASE_ROLE_FORBIDDEN");
  if (rule.requiresEvidence && !args.evidenceReference?.trim()) {
    throw new Error("LENDER_CASE_EVIDENCE_REQUIRED");
  }
  if (
    rule.makerSeparation === "CONTRACT" &&
    args.contractMakerRef === args.actorRef
  ) {
    throw new Error("LENDER_CONTRACT_CHECKER_MUST_DIFFER_FROM_MAKER");
  }
  if (
    rule.makerSeparation === "DISBURSEMENT" &&
    args.disbursementMakerRef === args.actorRef
  ) {
    throw new Error("LENDER_DISBURSEMENT_CHECKER_MUST_DIFFER_FROM_MAKER");
  }
  const target = rule.allowed[0];
  if (!target) throw new Error("LENDER_CASE_ACTION_POLICY_INVALID");
  return target;
}

export function canReadLenderCases(roles: readonly string[]): boolean {
  return roles.some((role) =>
    LENDER_OPERATOR_ROLES.includes(role as LenderOperatorRole),
  );
}
