export const APPROVAL_CASE_AGGREGATE_TYPES = [
  "APPLICATION",
  "DISBURSEMENT",
  "WRITE_OFF",
  "COMPLAINT",
  "CONTRACT_TEMPLATE",
  "PRODUCT_RULE",
] as const;
export type ApprovalCaseAggregateType =
  (typeof APPROVAL_CASE_AGGREGATE_TYPES)[number];

export const APPROVAL_CASE_STATUSES = [
  "PENDING",
  "RETURNED",
  "REJECTED",
  "CANCELLED",
  "COMPLETED",
] as const;
export type ApprovalCaseStatus = (typeof APPROVAL_CASE_STATUSES)[number];

export const APPROVAL_CASE_ACTIONS = [
  "APPROVE",
  "REJECT",
  "RETURN",
  "REQUEST_SUPPLEMENT",
  "ESCALATE",
  "CANCEL",
] as const;
export type ApprovalCaseAction = (typeof APPROVAL_CASE_ACTIONS)[number];

export const APPROVAL_WORKFLOW_DEFINITION_CODES = [
  "SALARY_LOAN_APPLICATION_V1",
  "DISBURSEMENT_APPROVAL_V1",
  "WRITE_OFF_APPROVAL_V1",
  "COMPLAINT_FINAL_REVIEW_V1",
] as const;
export type ApprovalWorkflowDefinitionCode =
  (typeof APPROVAL_WORKFLOW_DEFINITION_CODES)[number];

export const APPROVAL_WORKFLOW_STEPS = [
  "BROKER_REVIEW",
  "EMPLOYER_VERIFICATION",
  "LENDER_KYC_REVIEW",
  "CREDIT_MAKER_REVIEW",
  "CREDIT_CHECKER_REVIEW",
  "OFFER_READY",
  "DISBURSEMENT_MAKER_REVIEW",
  "DISBURSEMENT_CHECKER_REVIEW",
  "MANUAL_DISBURSEMENT_EXECUTION",
  "WRITE_OFF_MAKER_REVIEW",
  "WRITE_OFF_CHECKER_REVIEW",
  "RECONCILIATION",
  "COMPLAINT_FINAL_REVIEW",
] as const;
export type ApprovalWorkflowStep = (typeof APPROVAL_WORKFLOW_STEPS)[number];

export const APPROVAL_ROLE_CODES = [
  "SYSTEM",
  "APPLICANT",
  "OPS_PLATFORM_ADMIN",
  "OPS_PROFILE_REVIEWER",
  "OPS_SUPERVISOR",
  "OPS_SERVICE_AGENT",
  "EMPLOYER_ADMIN",
  "EMPLOYER_HR_VERIFIER",
  "PARTNER_ADMIN",
  "PARTNER_KYC_REVIEWER",
  "PARTNER_CREDIT_MAKER",
  "PARTNER_CREDIT_CHECKER",
  "PARTNER_CONTRACT_REVIEWER",
  "PARTNER_DISBURSEMENT_MAKER",
  "PARTNER_DISBURSEMENT_CHECKER",
  "PARTNER_WRITE_OFF_MAKER",
  "PARTNER_WRITE_OFF_CHECKER",
  "PARTNER_COMPLAINT_OFFICER",
  "AUDIT_VIEWER",
] as const;
export type ApprovalRoleCode = (typeof APPROVAL_ROLE_CODES)[number];

export type ApprovalCaseEvent = Readonly<{
  step: ApprovalWorkflowStep;
  action: ApprovalCaseAction;
  actorUserId: string;
  actorRoleCode: ApprovalRoleCode;
  reasonCode?: string;
  reasonNote?: string;
  inputSnapshotHash: string;
  idempotencyKey: string;
  occurredAt: string;
  currentRound: number;
}>;

export type ApprovalCase = Readonly<{
  approvalCaseId: string;
  aggregateType: ApprovalCaseAggregateType;
  aggregateId: string;
  workflowDefinitionCode: ApprovalWorkflowDefinitionCode;
  workflowDefinitionVersion: number;
  currentStep: ApprovalWorkflowStep;
  status: ApprovalCaseStatus;
  assignedDepartmentId?: string;
  assignedRoleCode?: ApprovalRoleCode;
  assigneeId?: string;
  currentRound: number;
  strategyRequiresChecker: boolean;
  history: readonly ApprovalCaseEvent[];
}>;

export type CreateApprovalCaseInput = Readonly<{
  approvalCaseId: string;
  aggregateType: ApprovalCaseAggregateType;
  aggregateId: string;
  workflowDefinitionCode?: ApprovalWorkflowDefinitionCode;
  workflowDefinitionVersion: number;
  assignedDepartmentId?: string;
  assignedRoleCode?: ApprovalRoleCode;
  assigneeId?: string;
  strategyRequiresChecker?: boolean;
}>;

export type ApprovalActionCommand = Readonly<{
  action: ApprovalCaseAction;
  actorUserId: string;
  actorRoleCode: ApprovalRoleCode;
  reasonCode?: string;
  reasonNote?: string;
  inputSnapshotHash: string;
  idempotencyKey: string;
  occurredAt: string;
}>;

type TransitionResult = Readonly<{
  nextStep: ApprovalWorkflowStep;
  status: ApprovalCaseStatus;
  nextAssignedRoleCode?: ApprovalRoleCode;
  incrementRound?: boolean;
}>;

const reasonRequiredActions = new Set<ApprovalCaseAction>([
  "REJECT",
  "RETURN",
  "REQUEST_SUPPLEMENT",
  "ESCALATE",
  "CANCEL",
]);

const stepRoleGuards: Readonly<
  Record<ApprovalWorkflowStep, readonly ApprovalRoleCode[]>
> = {
  BROKER_REVIEW: [
    "OPS_PROFILE_REVIEWER",
    "OPS_SUPERVISOR",
    "OPS_PLATFORM_ADMIN",
  ],
  EMPLOYER_VERIFICATION: [
    "EMPLOYER_HR_VERIFIER",
    "EMPLOYER_ADMIN",
    "OPS_SUPERVISOR",
  ],
  LENDER_KYC_REVIEW: ["PARTNER_KYC_REVIEWER", "PARTNER_ADMIN"],
  CREDIT_MAKER_REVIEW: ["PARTNER_CREDIT_MAKER", "PARTNER_ADMIN"],
  CREDIT_CHECKER_REVIEW: ["PARTNER_CREDIT_CHECKER", "PARTNER_ADMIN"],
  OFFER_READY: ["SYSTEM", "PARTNER_ADMIN"],
  DISBURSEMENT_MAKER_REVIEW: ["PARTNER_DISBURSEMENT_MAKER", "PARTNER_ADMIN"],
  DISBURSEMENT_CHECKER_REVIEW: [
    "PARTNER_DISBURSEMENT_CHECKER",
    "PARTNER_ADMIN",
  ],
  MANUAL_DISBURSEMENT_EXECUTION: [
    "PARTNER_DISBURSEMENT_MAKER",
    "PARTNER_ADMIN",
  ],
  WRITE_OFF_MAKER_REVIEW: ["PARTNER_WRITE_OFF_MAKER", "PARTNER_ADMIN"],
  WRITE_OFF_CHECKER_REVIEW: ["PARTNER_WRITE_OFF_CHECKER", "PARTNER_ADMIN"],
  RECONCILIATION: ["OPS_SUPERVISOR", "PARTNER_ADMIN", "SYSTEM"],
  COMPLAINT_FINAL_REVIEW: [
    "PARTNER_COMPLAINT_OFFICER",
    "PARTNER_ADMIN",
    "OPS_SERVICE_AGENT",
  ],
};

const stepActions: Readonly<
  Record<ApprovalWorkflowStep, readonly ApprovalCaseAction[]>
> = {
  BROKER_REVIEW: [
    "APPROVE",
    "REJECT",
    "RETURN",
    "REQUEST_SUPPLEMENT",
    "ESCALATE",
    "CANCEL",
  ],
  EMPLOYER_VERIFICATION: [
    "APPROVE",
    "REJECT",
    "RETURN",
    "REQUEST_SUPPLEMENT",
    "ESCALATE",
    "CANCEL",
  ],
  LENDER_KYC_REVIEW: [
    "APPROVE",
    "REJECT",
    "RETURN",
    "REQUEST_SUPPLEMENT",
    "ESCALATE",
    "CANCEL",
  ],
  CREDIT_MAKER_REVIEW: [
    "APPROVE",
    "REJECT",
    "RETURN",
    "REQUEST_SUPPLEMENT",
    "ESCALATE",
    "CANCEL",
  ],
  CREDIT_CHECKER_REVIEW: ["APPROVE", "REJECT", "RETURN", "ESCALATE", "CANCEL"],
  OFFER_READY: [],
  DISBURSEMENT_MAKER_REVIEW: [
    "APPROVE",
    "REJECT",
    "RETURN",
    "ESCALATE",
    "CANCEL",
  ],
  DISBURSEMENT_CHECKER_REVIEW: [
    "APPROVE",
    "REJECT",
    "RETURN",
    "ESCALATE",
    "CANCEL",
  ],
  MANUAL_DISBURSEMENT_EXECUTION: [],
  WRITE_OFF_MAKER_REVIEW: ["APPROVE", "REJECT", "RETURN", "ESCALATE", "CANCEL"],
  WRITE_OFF_CHECKER_REVIEW: [
    "APPROVE",
    "REJECT",
    "RETURN",
    "ESCALATE",
    "CANCEL",
  ],
  RECONCILIATION: [],
  COMPLAINT_FINAL_REVIEW: ["APPROVE", "REJECT", "RETURN", "ESCALATE", "CANCEL"],
};

const checkerProtectedSteps: Readonly<
  Partial<Record<ApprovalWorkflowStep, ApprovalWorkflowStep>>
> = {
  CREDIT_CHECKER_REVIEW: "CREDIT_MAKER_REVIEW",
  DISBURSEMENT_CHECKER_REVIEW: "DISBURSEMENT_MAKER_REVIEW",
  WRITE_OFF_CHECKER_REVIEW: "WRITE_OFF_MAKER_REVIEW",
};

const applicationDefaultStartStep = "BROKER_REVIEW" as const;

export function defaultWorkflowDefinitionCode(
  aggregateType: ApprovalCaseAggregateType,
): ApprovalWorkflowDefinitionCode {
  switch (aggregateType) {
    case "APPLICATION":
      return "SALARY_LOAN_APPLICATION_V1";
    case "DISBURSEMENT":
      return "DISBURSEMENT_APPROVAL_V1";
    case "WRITE_OFF":
      return "WRITE_OFF_APPROVAL_V1";
    case "COMPLAINT":
      return "COMPLAINT_FINAL_REVIEW_V1";
    case "CONTRACT_TEMPLATE":
    case "PRODUCT_RULE":
      return "COMPLAINT_FINAL_REVIEW_V1";
  }
}

function defaultStepForWorkflow(
  workflowDefinitionCode: ApprovalWorkflowDefinitionCode,
): ApprovalWorkflowStep {
  switch (workflowDefinitionCode) {
    case "SALARY_LOAN_APPLICATION_V1":
      return applicationDefaultStartStep;
    case "DISBURSEMENT_APPROVAL_V1":
      return "DISBURSEMENT_MAKER_REVIEW";
    case "WRITE_OFF_APPROVAL_V1":
      return "WRITE_OFF_MAKER_REVIEW";
    case "COMPLAINT_FINAL_REVIEW_V1":
      return "COMPLAINT_FINAL_REVIEW";
  }
}

function defaultAssignedRoleForStep(
  step: ApprovalWorkflowStep,
): ApprovalRoleCode | undefined {
  return stepRoleGuards[step][0];
}

export function createApprovalCase(
  input: CreateApprovalCaseInput,
): ApprovalCase {
  if (!input.approvalCaseId.trim()) {
    throw new Error("approvalCaseId is required");
  }
  if (!input.aggregateId.trim()) {
    throw new Error("aggregateId is required");
  }
  if (input.workflowDefinitionVersion < 1) {
    throw new Error("workflowDefinitionVersion must be >= 1");
  }
  const workflowDefinitionCode =
    input.workflowDefinitionCode ??
    defaultWorkflowDefinitionCode(input.aggregateType);
  const currentStep = defaultStepForWorkflow(workflowDefinitionCode);
  return {
    approvalCaseId: input.approvalCaseId,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    workflowDefinitionCode,
    workflowDefinitionVersion: input.workflowDefinitionVersion,
    currentStep,
    status: "PENDING",
    assignedDepartmentId: input.assignedDepartmentId,
    assignedRoleCode:
      input.assignedRoleCode ?? defaultAssignedRoleForStep(currentStep),
    assigneeId: input.assigneeId,
    currentRound: 1,
    strategyRequiresChecker: input.strategyRequiresChecker ?? false,
    history: [],
  };
}

export function isActorAuthorizedForStep(
  step: ApprovalWorkflowStep,
  actorRoleCode: ApprovalRoleCode,
): boolean {
  return stepRoleGuards[step].includes(actorRoleCode);
}

export function isActionAllowedForStep(
  step: ApprovalWorkflowStep,
  action: ApprovalCaseAction,
): boolean {
  return stepActions[step].includes(action);
}

function assertCaseOpen(item: ApprovalCase): void {
  if (item.status === "COMPLETED") {
    throw new Error("Completed approval cases are immutable");
  }
  if (item.status === "REJECTED") {
    throw new Error("Rejected approval cases are immutable");
  }
  if (item.status === "CANCELLED") {
    throw new Error("Cancelled approval cases are immutable");
  }
}

function assertCommand(command: ApprovalActionCommand): void {
  if (!command.actorUserId.trim()) {
    throw new Error("actorUserId is required");
  }
  if (!/^[0-9a-f]{64}$/.test(command.inputSnapshotHash)) {
    throw new Error("inputSnapshotHash must be a lowercase sha256 digest");
  }
  if (!/^[A-Za-z0-9._:-]{16,128}$/.test(command.idempotencyKey)) {
    throw new Error("idempotencyKey format is invalid");
  }
  if (
    reasonRequiredActions.has(command.action) &&
    !command.reasonCode?.trim()
  ) {
    throw new Error(`reasonCode is required for ${command.action}`);
  }
}

function assertActor(item: ApprovalCase, command: ApprovalActionCommand): void {
  if (!isActorAuthorizedForStep(item.currentStep, command.actorRoleCode)) {
    throw new Error(
      `Role ${command.actorRoleCode} cannot act on ${item.currentStep}`,
    );
  }
  if (!isActionAllowedForStep(item.currentStep, command.action)) {
    throw new Error(
      `Action ${command.action} is not allowed on ${item.currentStep}`,
    );
  }
}

function assertDistinctActorPerRound(
  item: ApprovalCase,
  command: ApprovalActionCommand,
): void {
  const priorStep = checkerProtectedSteps[item.currentStep];
  if (!priorStep) return;
  const makerEvent = item.history.find(
    (entry) =>
      entry.step === priorStep &&
      entry.currentRound === item.currentRound &&
      entry.action === "APPROVE",
  );
  if (!makerEvent) {
    throw new Error(`Maker approval is required before ${item.currentStep}`);
  }
  if (makerEvent.actorUserId === command.actorUserId) {
    throw new Error(
      `Role ${command.actorRoleCode} cannot review its own maker decision`,
    );
  }
}

function handleIdempotentReplay(
  item: ApprovalCase,
  command: ApprovalActionCommand,
): ApprovalCase | undefined {
  const duplicate = item.history.find(
    (entry) => entry.idempotencyKey === command.idempotencyKey,
  );
  if (!duplicate) return undefined;
  const isSameCommand =
    duplicate.action === command.action &&
    duplicate.actorUserId === command.actorUserId &&
    duplicate.actorRoleCode === command.actorRoleCode &&
    duplicate.reasonCode === command.reasonCode &&
    duplicate.reasonNote === command.reasonNote &&
    duplicate.inputSnapshotHash === command.inputSnapshotHash;
  if (!isSameCommand) {
    throw new Error("Idempotency key is already bound to a different action");
  }
  return item;
}

function transitionForApplicationCase(
  item: ApprovalCase,
  command: ApprovalActionCommand,
): TransitionResult {
  switch (item.currentStep) {
    case "BROKER_REVIEW":
      switch (command.action) {
        case "APPROVE":
          return {
            nextStep: "EMPLOYER_VERIFICATION",
            status: "PENDING",
            nextAssignedRoleCode: "EMPLOYER_HR_VERIFIER",
          };
        case "RETURN":
        case "REQUEST_SUPPLEMENT":
          return {
            nextStep: "BROKER_REVIEW",
            status: "RETURNED",
            nextAssignedRoleCode: "OPS_PROFILE_REVIEWER",
            incrementRound: true,
          };
        case "ESCALATE":
          return {
            nextStep: "BROKER_REVIEW",
            status: "PENDING",
            nextAssignedRoleCode: "OPS_SUPERVISOR",
          };
        case "REJECT":
          return {
            nextStep: "BROKER_REVIEW",
            status: "REJECTED",
            nextAssignedRoleCode: "OPS_PROFILE_REVIEWER",
          };
        case "CANCEL":
          return {
            nextStep: "BROKER_REVIEW",
            status: "CANCELLED",
            nextAssignedRoleCode: "OPS_PROFILE_REVIEWER",
          };
      }
      break;
    case "EMPLOYER_VERIFICATION":
      switch (command.action) {
        case "APPROVE":
          return {
            nextStep: "LENDER_KYC_REVIEW",
            status: "PENDING",
            nextAssignedRoleCode: "PARTNER_KYC_REVIEWER",
          };
        case "RETURN":
        case "REQUEST_SUPPLEMENT":
          return {
            nextStep: "BROKER_REVIEW",
            status: "RETURNED",
            nextAssignedRoleCode: "OPS_PROFILE_REVIEWER",
            incrementRound: true,
          };
        case "ESCALATE":
          return {
            nextStep: "EMPLOYER_VERIFICATION",
            status: "PENDING",
            nextAssignedRoleCode: "EMPLOYER_ADMIN",
          };
        case "REJECT":
          return {
            nextStep: "EMPLOYER_VERIFICATION",
            status: "REJECTED",
            nextAssignedRoleCode: "EMPLOYER_HR_VERIFIER",
          };
        case "CANCEL":
          return {
            nextStep: "EMPLOYER_VERIFICATION",
            status: "CANCELLED",
            nextAssignedRoleCode: "EMPLOYER_HR_VERIFIER",
          };
      }
      break;
    case "LENDER_KYC_REVIEW":
      switch (command.action) {
        case "APPROVE":
          return {
            nextStep: "CREDIT_MAKER_REVIEW",
            status: "PENDING",
            nextAssignedRoleCode: "PARTNER_CREDIT_MAKER",
          };
        case "RETURN":
        case "REQUEST_SUPPLEMENT":
          return {
            nextStep: "BROKER_REVIEW",
            status: "RETURNED",
            nextAssignedRoleCode: "OPS_PROFILE_REVIEWER",
            incrementRound: true,
          };
        case "ESCALATE":
          return {
            nextStep: "LENDER_KYC_REVIEW",
            status: "PENDING",
            nextAssignedRoleCode: "PARTNER_ADMIN",
          };
        case "REJECT":
          return {
            nextStep: "LENDER_KYC_REVIEW",
            status: "REJECTED",
            nextAssignedRoleCode: "PARTNER_KYC_REVIEWER",
          };
        case "CANCEL":
          return {
            nextStep: "LENDER_KYC_REVIEW",
            status: "CANCELLED",
            nextAssignedRoleCode: "PARTNER_KYC_REVIEWER",
          };
      }
      break;
    case "CREDIT_MAKER_REVIEW":
      switch (command.action) {
        case "APPROVE":
          return item.strategyRequiresChecker
            ? {
                nextStep: "CREDIT_CHECKER_REVIEW",
                status: "PENDING",
                nextAssignedRoleCode: "PARTNER_CREDIT_CHECKER",
              }
            : {
                nextStep: "OFFER_READY",
                status: "COMPLETED",
                nextAssignedRoleCode: "PARTNER_CREDIT_MAKER",
              };
        case "RETURN":
        case "REQUEST_SUPPLEMENT":
          return {
            nextStep: "LENDER_KYC_REVIEW",
            status: "RETURNED",
            nextAssignedRoleCode: "PARTNER_KYC_REVIEWER",
            incrementRound: true,
          };
        case "ESCALATE":
          return {
            nextStep: "CREDIT_MAKER_REVIEW",
            status: "PENDING",
            nextAssignedRoleCode: "PARTNER_ADMIN",
          };
        case "REJECT":
          return {
            nextStep: "CREDIT_MAKER_REVIEW",
            status: "REJECTED",
            nextAssignedRoleCode: "PARTNER_CREDIT_MAKER",
          };
        case "CANCEL":
          return {
            nextStep: "CREDIT_MAKER_REVIEW",
            status: "CANCELLED",
            nextAssignedRoleCode: "PARTNER_CREDIT_MAKER",
          };
      }
      break;
    case "CREDIT_CHECKER_REVIEW":
      switch (command.action) {
        case "APPROVE":
          return {
            nextStep: "OFFER_READY",
            status: "COMPLETED",
            nextAssignedRoleCode: "PARTNER_CREDIT_CHECKER",
          };
        case "RETURN":
          return {
            nextStep: "CREDIT_MAKER_REVIEW",
            status: "RETURNED",
            nextAssignedRoleCode: "PARTNER_CREDIT_MAKER",
            incrementRound: true,
          };
        case "ESCALATE":
          return {
            nextStep: "CREDIT_CHECKER_REVIEW",
            status: "PENDING",
            nextAssignedRoleCode: "PARTNER_ADMIN",
          };
        case "REJECT":
          return {
            nextStep: "CREDIT_CHECKER_REVIEW",
            status: "REJECTED",
            nextAssignedRoleCode: "PARTNER_CREDIT_CHECKER",
          };
        case "CANCEL":
          return {
            nextStep: "CREDIT_CHECKER_REVIEW",
            status: "CANCELLED",
            nextAssignedRoleCode: "PARTNER_CREDIT_CHECKER",
          };
        case "REQUEST_SUPPLEMENT":
          break;
      }
      break;
    case "OFFER_READY":
    case "DISBURSEMENT_MAKER_REVIEW":
    case "DISBURSEMENT_CHECKER_REVIEW":
    case "MANUAL_DISBURSEMENT_EXECUTION":
    case "WRITE_OFF_MAKER_REVIEW":
    case "WRITE_OFF_CHECKER_REVIEW":
    case "RECONCILIATION":
    case "COMPLAINT_FINAL_REVIEW":
      break;
  }
  throw new Error(
    `Unhandled application workflow transition: ${item.currentStep} + ${command.action}`,
  );
}

function transitionForDisbursementCase(
  item: ApprovalCase,
  command: ApprovalActionCommand,
): TransitionResult {
  switch (item.currentStep) {
    case "DISBURSEMENT_MAKER_REVIEW":
      switch (command.action) {
        case "APPROVE":
          return {
            nextStep: "DISBURSEMENT_CHECKER_REVIEW",
            status: "PENDING",
            nextAssignedRoleCode: "PARTNER_DISBURSEMENT_CHECKER",
          };
        case "RETURN":
          return {
            nextStep: "DISBURSEMENT_MAKER_REVIEW",
            status: "RETURNED",
            nextAssignedRoleCode: "PARTNER_DISBURSEMENT_MAKER",
            incrementRound: true,
          };
        case "ESCALATE":
          return {
            nextStep: "DISBURSEMENT_MAKER_REVIEW",
            status: "PENDING",
            nextAssignedRoleCode: "PARTNER_ADMIN",
          };
        case "REJECT":
          return {
            nextStep: "DISBURSEMENT_MAKER_REVIEW",
            status: "REJECTED",
            nextAssignedRoleCode: "PARTNER_DISBURSEMENT_MAKER",
          };
        case "CANCEL":
          return {
            nextStep: "DISBURSEMENT_MAKER_REVIEW",
            status: "CANCELLED",
            nextAssignedRoleCode: "PARTNER_DISBURSEMENT_MAKER",
          };
        case "REQUEST_SUPPLEMENT":
          break;
      }
      break;
    case "DISBURSEMENT_CHECKER_REVIEW":
      switch (command.action) {
        case "APPROVE":
          return {
            nextStep: "MANUAL_DISBURSEMENT_EXECUTION",
            status: "COMPLETED",
            nextAssignedRoleCode: "PARTNER_DISBURSEMENT_MAKER",
          };
        case "RETURN":
          return {
            nextStep: "DISBURSEMENT_MAKER_REVIEW",
            status: "RETURNED",
            nextAssignedRoleCode: "PARTNER_DISBURSEMENT_MAKER",
            incrementRound: true,
          };
        case "ESCALATE":
          return {
            nextStep: "DISBURSEMENT_CHECKER_REVIEW",
            status: "PENDING",
            nextAssignedRoleCode: "PARTNER_ADMIN",
          };
        case "REJECT":
          return {
            nextStep: "DISBURSEMENT_CHECKER_REVIEW",
            status: "REJECTED",
            nextAssignedRoleCode: "PARTNER_DISBURSEMENT_CHECKER",
          };
        case "CANCEL":
          return {
            nextStep: "DISBURSEMENT_CHECKER_REVIEW",
            status: "CANCELLED",
            nextAssignedRoleCode: "PARTNER_DISBURSEMENT_CHECKER",
          };
        case "REQUEST_SUPPLEMENT":
          break;
      }
      break;
    default:
      break;
  }
  throw new Error(
    `Unhandled disbursement workflow transition: ${item.currentStep} + ${command.action}`,
  );
}

function transitionForWriteOffCase(
  item: ApprovalCase,
  command: ApprovalActionCommand,
): TransitionResult {
  switch (item.currentStep) {
    case "WRITE_OFF_MAKER_REVIEW":
      switch (command.action) {
        case "APPROVE":
          return {
            nextStep: "WRITE_OFF_CHECKER_REVIEW",
            status: "PENDING",
            nextAssignedRoleCode: "PARTNER_WRITE_OFF_CHECKER",
          };
        case "RETURN":
          return {
            nextStep: "WRITE_OFF_MAKER_REVIEW",
            status: "RETURNED",
            nextAssignedRoleCode: "PARTNER_WRITE_OFF_MAKER",
            incrementRound: true,
          };
        case "ESCALATE":
          return {
            nextStep: "WRITE_OFF_MAKER_REVIEW",
            status: "PENDING",
            nextAssignedRoleCode: "PARTNER_ADMIN",
          };
        case "REJECT":
          return {
            nextStep: "WRITE_OFF_MAKER_REVIEW",
            status: "REJECTED",
            nextAssignedRoleCode: "PARTNER_WRITE_OFF_MAKER",
          };
        case "CANCEL":
          return {
            nextStep: "WRITE_OFF_MAKER_REVIEW",
            status: "CANCELLED",
            nextAssignedRoleCode: "PARTNER_WRITE_OFF_MAKER",
          };
        case "REQUEST_SUPPLEMENT":
          break;
      }
      break;
    case "WRITE_OFF_CHECKER_REVIEW":
      switch (command.action) {
        case "APPROVE":
          return {
            nextStep: "RECONCILIATION",
            status: "COMPLETED",
            nextAssignedRoleCode: "OPS_SUPERVISOR",
          };
        case "RETURN":
          return {
            nextStep: "WRITE_OFF_MAKER_REVIEW",
            status: "RETURNED",
            nextAssignedRoleCode: "PARTNER_WRITE_OFF_MAKER",
            incrementRound: true,
          };
        case "ESCALATE":
          return {
            nextStep: "WRITE_OFF_CHECKER_REVIEW",
            status: "PENDING",
            nextAssignedRoleCode: "PARTNER_ADMIN",
          };
        case "REJECT":
          return {
            nextStep: "WRITE_OFF_CHECKER_REVIEW",
            status: "REJECTED",
            nextAssignedRoleCode: "PARTNER_WRITE_OFF_CHECKER",
          };
        case "CANCEL":
          return {
            nextStep: "WRITE_OFF_CHECKER_REVIEW",
            status: "CANCELLED",
            nextAssignedRoleCode: "PARTNER_WRITE_OFF_CHECKER",
          };
        case "REQUEST_SUPPLEMENT":
          break;
      }
      break;
    default:
      break;
  }
  throw new Error(
    `Unhandled write-off workflow transition: ${item.currentStep} + ${command.action}`,
  );
}

function transitionForComplaintCase(
  item: ApprovalCase,
  command: ApprovalActionCommand,
): TransitionResult {
  if (item.currentStep !== "COMPLAINT_FINAL_REVIEW") {
    throw new Error(
      `Unhandled complaint workflow step ${item.currentStep} for ${item.workflowDefinitionCode}`,
    );
  }
  switch (command.action) {
    case "APPROVE":
      return {
        nextStep: "COMPLAINT_FINAL_REVIEW",
        status: "COMPLETED",
        nextAssignedRoleCode: "PARTNER_COMPLAINT_OFFICER",
      };
    case "RETURN":
      return {
        nextStep: "COMPLAINT_FINAL_REVIEW",
        status: "RETURNED",
        nextAssignedRoleCode: "OPS_SERVICE_AGENT",
        incrementRound: true,
      };
    case "ESCALATE":
      return {
        nextStep: "COMPLAINT_FINAL_REVIEW",
        status: "PENDING",
        nextAssignedRoleCode: "PARTNER_ADMIN",
      };
    case "REJECT":
      return {
        nextStep: "COMPLAINT_FINAL_REVIEW",
        status: "REJECTED",
        nextAssignedRoleCode: "PARTNER_COMPLAINT_OFFICER",
      };
    case "CANCEL":
      return {
        nextStep: "COMPLAINT_FINAL_REVIEW",
        status: "CANCELLED",
        nextAssignedRoleCode: "PARTNER_COMPLAINT_OFFICER",
      };
    case "REQUEST_SUPPLEMENT":
      break;
  }
  throw new Error(
    `Unhandled complaint workflow transition: ${item.currentStep} + ${command.action}`,
  );
}

function nextTransition(
  item: ApprovalCase,
  command: ApprovalActionCommand,
): TransitionResult {
  switch (item.workflowDefinitionCode) {
    case "SALARY_LOAN_APPLICATION_V1":
      return transitionForApplicationCase(item, command);
    case "DISBURSEMENT_APPROVAL_V1":
      return transitionForDisbursementCase(item, command);
    case "WRITE_OFF_APPROVAL_V1":
      return transitionForWriteOffCase(item, command);
    case "COMPLAINT_FINAL_REVIEW_V1":
      return transitionForComplaintCase(item, command);
  }
}

export function applyApprovalAction(
  item: ApprovalCase,
  command: ApprovalActionCommand,
): ApprovalCase {
  assertCaseOpen(item);
  assertCommand(command);
  const replay = handleIdempotentReplay(item, command);
  if (replay) return replay;
  assertActor(item, command);
  assertDistinctActorPerRound(item, command);

  const transition = nextTransition(item, command);
  const event: ApprovalCaseEvent = {
    step: item.currentStep,
    action: command.action,
    actorUserId: command.actorUserId,
    actorRoleCode: command.actorRoleCode,
    ...(command.reasonCode ? { reasonCode: command.reasonCode } : {}),
    ...(command.reasonNote ? { reasonNote: command.reasonNote } : {}),
    inputSnapshotHash: command.inputSnapshotHash,
    idempotencyKey: command.idempotencyKey,
    occurredAt: command.occurredAt,
    currentRound: item.currentRound,
  };

  return {
    ...item,
    currentStep: transition.nextStep,
    status: transition.status,
    assignedRoleCode: transition.nextAssignedRoleCode,
    assigneeId: undefined,
    currentRound: transition.incrementRound
      ? item.currentRound + 1
      : item.currentRound,
    history: [...item.history, event],
  };
}
