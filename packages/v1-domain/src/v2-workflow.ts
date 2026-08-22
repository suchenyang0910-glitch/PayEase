import { z } from "zod";

export const WORKFLOW_VERSIONS = ["LEGACY_V1", "SALARY_LOAN_V2"] as const;
export type WorkflowVersion = (typeof WORKFLOW_VERSIONS)[number];

export const BROKER_WORKFLOW_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "BROKER_REVIEW",
  "EMPLOYER_VERIFICATION",
  "LENDER_PACKAGE_SENT",
  "LENDER_MORE_INFO_REQUIRED",
  "LENDER_DECISION_RECEIVED",
  "FINAL_CONTRACT_READY",
  "CONTRACT_EVIDENCE_COLLECTED",
  "READY_FOR_DISBURSEMENT",
  "DISBURSEMENT_PROCESSING",
  "DISBURSEMENT_EXCEPTION",
  "DISBURSED",
  "BROKERAGE_REMUNERATION_DUE",
  "BROKERAGE_REMUNERATION_OVERDUE",
  "PAYROLL_COLLECTION_PENDING",
  "COLLECTION_RECONCILIATION_PENDING",
  "COLLECTION_EXCEPTION",
  "PAID_OFF",
  "REJECTED",
  "BROKER_CLOSED",
  "LENDER_CLOSED",
] as const;
export type BrokerWorkflowStatus = (typeof BROKER_WORKFLOW_STATUSES)[number];

export const LENDER_CASE_STATUSES = [
  "LENDER_REVIEWING",
  "LENDER_MORE_INFO_REQUIRED",
  "DECISION_MADE",
  "FINAL_CONTRACT_READY",
  "CONTRACT_EVIDENCE_ACCEPTED",
  "READY_FOR_DISBURSEMENT",
  "DISBURSEMENT_PROCESSING",
  "DISBURSEMENT_EXCEPTION",
  "DISBURSED",
  "PAYROLL_COLLECTION_PENDING",
  "COLLECTION_RECONCILIATION_PENDING",
  "COLLECTION_EXCEPTION",
  "PAID_OFF",
  "REJECTED",
  "LENDER_CLOSED",
] as const;
export type LenderCaseStatus = (typeof LENDER_CASE_STATUSES)[number];

export const BROKERAGE_REMUNERATION_PROJECTION_STATUSES = [
  "NOT_DUE",
  "DUE",
  "REVIEWING",
  "ACCEPTED",
  "OVERDUE",
] as const;
export type BrokerageRemunerationProjectionStatus =
  (typeof BROKERAGE_REMUNERATION_PROJECTION_STATUSES)[number];

export const BROKER_WORKFLOW_EVENT_TYPES = [
  "APPLICATION_SUBMITTED",
  "BROKER_PRECHECK_STARTED",
  "BROKER_PRECHECK_PASSED",
  "EMPLOYER_VERIFICATION_STARTED",
  "EMPLOYER_VERIFIED",
  "APPLICATION_PACKAGE_SUBMITTED",
  "MORE_INFORMATION_REQUIRED",
  "DECISION_AVAILABLE",
  "FINAL_CONTRACT_READY",
  "FINAL_CONTRACT_SIGNATURE_CAPTURED",
  "FINAL_CONTRACT_VIDEO_CAPTURED",
  "PAYROLL_AUTH_CAPTURED",
  "CONTRACT_EVIDENCE_SUBMITTED",
  "CONTRACT_EVIDENCE_ACCEPTED",
  "BROKERAGE_REMUNERATION_DUE",
  "BROKERAGE_REMUNERATION_PAYMENT_SUBMITTED",
  "BROKERAGE_REMUNERATION_PAYMENT_ACCEPTED",
  "BROKERAGE_REMUNERATION_OVERDUE",
  "READY_FOR_DISBURSEMENT",
  "DISBURSEMENT_STARTED",
  "DISBURSEMENT_FAILED",
  "DISBURSED",
  "PAYROLL_COLLECTION_SCHEDULED",
  "PAYROLL_COLLECTION_REPORTED",
  "PARTIALLY_COLLECTED_REPORTED",
  "NOT_COLLECTED_REPORTED",
  "LOAN_SETTLED",
  "DECISION_REJECTED",
  "BROKER_CASE_CLOSED",
  "LENDER_CASE_CLOSED",
] as const;
export type BrokerWorkflowEventType =
  (typeof BROKER_WORKFLOW_EVENT_TYPES)[number];

export const LENDER_CASE_EVENT_TYPES = [
  "LENDER_APPLICATION_RECEIVED",
  "MORE_INFORMATION_REQUIRED",
  "LENDER_SUPPLEMENT_RECEIVED",
  "LENDER_REVIEW_RESUMED",
  "DECISION_MADE",
  "FINAL_CONTRACT_READY",
  "CONTRACT_EVIDENCE_RECEIVED",
  "CONTRACT_EVIDENCE_ACCEPTED",
  "READY_FOR_DISBURSEMENT",
  "DISBURSEMENT_STARTED",
  "DISBURSEMENT_FAILED",
  "DISBURSED",
  "PAYROLL_COLLECTION_SCHEDULED",
  "PAYROLL_COLLECTION_REPORTED",
  "PARTIALLY_COLLECTED_REPORTED",
  "NOT_COLLECTED_REPORTED",
  "EXCEPTIONAL_PRINCIPAL_PAYMENT_RECEIVED",
  "LOAN_SETTLED",
  "DECISION_REJECTED",
  "LENDER_CASE_CLOSED",
] as const;
export type LenderCaseEventType = (typeof LENDER_CASE_EVENT_TYPES)[number];

export const CROSS_DOMAIN_EVENT_TYPES = [
  "APPLICATION_PACKAGE_SUBMITTED",
  "DECISION_AVAILABLE",
  "CONTRACT_EVIDENCE_SUBMITTED",
  "READY_FOR_DISBURSEMENT",
  "DISBURSED",
  "PAYROLL_COLLECTION_REPORTED",
  "BROKER_CASE_CLOSED",
  "LENDER_CASE_CLOSED",
] as const;
export type CrossDomainEventType = (typeof CROSS_DOMAIN_EVENT_TYPES)[number];

export const PAYMENT_PROOF_TYPES = [
  "BROKERAGE_REMUNERATION_PAYMENT_PROOF",
  "LENDER_INTEREST_PAYMENT_PROOF",
  "EXCEPTIONAL_PRINCIPAL_PAYMENT_PROOF",
] as const;
export type PaymentProofType = (typeof PAYMENT_PROOF_TYPES)[number];

export const PAYMENT_ALLOCATION_STATUSES = [
  "PENDING",
  "REVIEWING",
  "ACCEPTED",
  "REJECTED",
] as const;
export type PaymentAllocationStatus =
  (typeof PAYMENT_ALLOCATION_STATUSES)[number];

export const EVENT_SOURCE_DOMAINS = [
  "BROKER",
  "LENDER",
  "EMPLOYER",
  "SYSTEM",
] as const;
export type EventSourceDomain = (typeof EVENT_SOURCE_DOMAINS)[number];

export const CUTOVER_DECISIONS = [
  "CONTINUE_LEGACY_FLOW",
  "CUTOVER_TO_V2",
] as const;
export type CutoverDecision = (typeof CUTOVER_DECISIONS)[number];

export const CrossDomainEventEnvelopeSchema = z.object({
  eventId: z.string().min(8).max(128),
  eventType: z.enum(CROSS_DOMAIN_EVENT_TYPES),
  schemaVersion: z.string().min(3).max(64),
  sourceDomain: z.enum(["BROKER", "LENDER"]),
  targetDomain: z.enum(["BROKER", "LENDER"]),
  occurredAt: z.string().datetime({ offset: true }),
  brokerApplicationRef: z.string().min(1).max(128).optional(),
  lenderCaseRef: z.string().min(1).max(128).optional(),
  payloadHash: z.string().regex(/^[0-9a-f]{64}$/),
});
export type CrossDomainEventEnvelope = z.infer<
  typeof CrossDomainEventEnvelopeSchema
>;

export const HistoricalCutoverSchema = z.object({
  workflowVersion: z.enum(WORKFLOW_VERSIONS),
  legacyStatus: z.string().min(1).max(64).optional(),
  cutoverDecision: z.enum(CUTOVER_DECISIONS).optional(),
  cutoverAt: z.string().datetime({ offset: true }).optional(),
  cutoverOperator: z.string().min(1).max(128).optional(),
  sourceApplicationRef: z.string().min(1).max(128).optional(),
  successorApplicationRef: z.string().min(1).max(128).optional(),
});
export type HistoricalCutover = z.infer<typeof HistoricalCutoverSchema>;

export type PaymentAllocation = Readonly<{
  paymentType: PaymentProofType;
  payeeDomain: "BROKER" | "LENDER";
  reviewStatus: PaymentAllocationStatus;
  amountMinor: string;
  currency: "USD";
  proofRef: string;
  externalEventRef?: string;
  acceptedByDomain?: "BROKER" | "LENDER";
}>;

export type BrokerWorkflowEvent = Readonly<{
  eventId: string;
  eventType: BrokerWorkflowEventType;
  sourceDomain: EventSourceDomain;
  actorUserRef: string;
  occurredAt: string;
  reasonCode?: string;
  paymentAmountMinor?: string;
  paymentCurrency?: "USD";
  paymentProofRef?: string;
  externalEventRef?: string;
  evidencePackageRef?: string;
  evidencePackageHash?: string;
}>;

export type LenderCaseEvent = Readonly<{
  eventId: string;
  eventType: LenderCaseEventType;
  sourceDomain: EventSourceDomain;
  actorUserRef: string;
  occurredAt: string;
  reasonCode?: string;
  paymentAmountMinor?: string;
  paymentCurrency?: "USD";
  paymentProofRef?: string;
  externalEventRef?: string;
  evidencePackageRef?: string;
  evidencePackageHash?: string;
}>;

export type BrokerWorkflowRecord = Readonly<{
  brokerApplicationRef: string;
  workflowVersion: "SALARY_LOAN_V2";
  localStatus: BrokerWorkflowStatus;
  brokerageRemunerationStatus: BrokerageRemunerationProjectionStatus;
  contractEvidence: Readonly<{
    signatureCaptured: boolean;
    videoCaptured: boolean;
    payrollAuthorizationCaptured: boolean;
    submittedToLender: boolean;
    submissionEventRef?: string;
    lenderAcceptanceEventRef?: string;
  }>;
  paymentAllocations: readonly PaymentAllocation[];
  history: readonly BrokerWorkflowEvent[];
}>;

export type LenderCaseRecord = Readonly<{
  lenderCaseRef: string;
  workflowVersion: "SALARY_LOAN_V2";
  localStatus: LenderCaseStatus;
  contractEvidencePacket: Readonly<{
    received: boolean;
    packageRef?: string;
    packageHash?: string;
    receivedEventRef?: string;
    acceptedEventRef?: string;
  }>;
  history: readonly LenderCaseEvent[];
}>;

export function createBrokerWorkflow(
  brokerApplicationRef: string,
): BrokerWorkflowRecord {
  if (!brokerApplicationRef.trim()) {
    throw new Error("brokerApplicationRef is required");
  }
  return {
    brokerApplicationRef,
    workflowVersion: "SALARY_LOAN_V2",
    localStatus: "DRAFT",
    brokerageRemunerationStatus: "NOT_DUE",
    contractEvidence: {
      signatureCaptured: false,
      videoCaptured: false,
      payrollAuthorizationCaptured: false,
      submittedToLender: false,
    },
    paymentAllocations: [],
    history: [],
  };
}

export function createLenderCase(lenderCaseRef: string): LenderCaseRecord {
  if (!lenderCaseRef.trim()) {
    throw new Error("lenderCaseRef is required");
  }
  return {
    lenderCaseRef,
    workflowVersion: "SALARY_LOAN_V2",
    localStatus: "LENDER_REVIEWING",
    contractEvidencePacket: {
      received: false,
    },
    history: [],
  };
}

function recordAllocation(
  item: BrokerWorkflowRecord,
  paymentType: PaymentProofType,
  reviewStatus: PaymentAllocationStatus,
  details: Readonly<{
    amountMinor: string;
    currency: "USD";
    proofRef: string;
    externalEventRef?: string;
    acceptedByDomain?: "BROKER" | "LENDER";
  }>,
): readonly PaymentAllocation[] {
  const payeeDomain =
    paymentType === "BROKERAGE_REMUNERATION_PAYMENT_PROOF"
      ? "BROKER"
      : "LENDER";
  const others = item.paymentAllocations.filter(
    (allocation) => allocation.paymentType !== paymentType,
  );
  return [...others, { paymentType, payeeDomain, reviewStatus, ...details }];
}
function assertSourceDomain(
  eventType: string,
  sourceDomain: EventSourceDomain,
  allowedDomains: readonly EventSourceDomain[],
): void {
  if (!allowedDomains.includes(sourceDomain)) {
    throw new Error(
      `${eventType} must originate from ${allowedDomains.join(" or ")}`,
    );
  }
}

function assertPaymentEventPayload(event: {
  paymentAmountMinor?: string;
  paymentCurrency?: "USD";
  paymentProofRef?: string;
  externalEventRef?: string;
}): asserts event is typeof event & {
  paymentAmountMinor: string;
  paymentCurrency: "USD";
  paymentProofRef: string;
} {
  if (!event.paymentAmountMinor || !/^\d+$/.test(event.paymentAmountMinor)) {
    throw new Error(
      "paymentAmountMinor is required for payment evidence events",
    );
  }
  if (event.paymentCurrency !== "USD") {
    throw new Error(
      "paymentCurrency must be USD for salary-loan v2 payment evidence",
    );
  }
  if (!event.paymentProofRef?.trim()) {
    throw new Error("paymentProofRef is required for payment evidence events");
  }
}

function assertContractEvidenceCollected(item: BrokerWorkflowRecord): void {
  if (
    !item.contractEvidence.signatureCaptured ||
    !item.contractEvidence.videoCaptured ||
    !item.contractEvidence.payrollAuthorizationCaptured
  ) {
    throw new Error(
      "All contract evidence must be collected before lender acceptance",
    );
  }
}

function assertContractEvidencePacket(event: {
  evidencePackageRef?: string;
  evidencePackageHash?: string;
  externalEventRef?: string;
}): asserts event is typeof event & {
  evidencePackageRef: string;
  evidencePackageHash: string;
} {
  if (!event.evidencePackageRef?.trim()) {
    throw new Error(
      "evidencePackageRef is required for contract evidence receipt",
    );
  }
  if (
    !event.evidencePackageHash ||
    !/^[0-9a-f]{64}$/.test(event.evidencePackageHash)
  ) {
    throw new Error("evidencePackageHash must be a lowercase sha256 digest");
  }
}

function assertBrokerEventSource(event: BrokerWorkflowEvent): void {
  switch (event.eventType) {
    case "BROKERAGE_REMUNERATION_PAYMENT_ACCEPTED":
      assertSourceDomain(event.eventType, event.sourceDomain, ["BROKER"]);
      return;
    case "CONTRACT_EVIDENCE_ACCEPTED":
    case "DECISION_AVAILABLE":
    case "FINAL_CONTRACT_READY":
    case "READY_FOR_DISBURSEMENT":
    case "DISBURSEMENT_STARTED":
    case "DISBURSED":
      assertSourceDomain(event.eventType, event.sourceDomain, ["LENDER"]);
      return;
    default:
      return;
  }
}

function assertLenderEventSource(event: LenderCaseEvent): void {
  switch (event.eventType) {
    case "CONTRACT_EVIDENCE_RECEIVED":
      assertSourceDomain(event.eventType, event.sourceDomain, ["BROKER"]);
      return;
    case "CONTRACT_EVIDENCE_ACCEPTED":
    case "READY_FOR_DISBURSEMENT":
    case "DISBURSEMENT_STARTED":
    case "DISBURSEMENT_FAILED":
    case "DISBURSED":
    case "DECISION_MADE":
    case "FINAL_CONTRACT_READY":
    case "LENDER_CASE_CLOSED":
      assertSourceDomain(event.eventType, event.sourceDomain, ["LENDER"]);
      return;
    default:
      return;
  }
}

export function applyBrokerWorkflowEvent(
  item: BrokerWorkflowRecord,
  event: BrokerWorkflowEvent,
): BrokerWorkflowRecord {
  assertBrokerEventSource(event);
  const nextHistory = [...item.history, event];
  switch (event.eventType) {
    case "APPLICATION_SUBMITTED":
      if (item.localStatus !== "DRAFT") {
        throw new Error("Invalid transition: only drafts can be submitted");
      }
      return { ...item, localStatus: "SUBMITTED", history: nextHistory };
    case "BROKER_PRECHECK_STARTED":
      if (item.localStatus !== "SUBMITTED") {
        throw new Error("Invalid transition into BROKER_REVIEW");
      }
      return { ...item, localStatus: "BROKER_REVIEW", history: nextHistory };
    case "BROKER_PRECHECK_PASSED":
      if (item.localStatus !== "BROKER_REVIEW") {
        throw new Error("Invalid transition into EMPLOYER_VERIFICATION");
      }
      return {
        ...item,
        localStatus: "EMPLOYER_VERIFICATION",
        history: nextHistory,
      };
    case "EMPLOYER_VERIFICATION_STARTED":
      if (
        item.localStatus !== "BROKER_REVIEW" &&
        item.localStatus !== "EMPLOYER_VERIFICATION"
      ) {
        throw new Error(
          "Employer verification can only start after broker review",
        );
      }
      return {
        ...item,
        localStatus: "EMPLOYER_VERIFICATION",
        history: nextHistory,
      };
    case "EMPLOYER_VERIFIED":
      if (item.localStatus !== "EMPLOYER_VERIFICATION") {
        throw new Error("Employer verification is not active");
      }
      return {
        ...item,
        localStatus: "LENDER_PACKAGE_SENT",
        history: nextHistory,
      };
    case "APPLICATION_PACKAGE_SUBMITTED":
      if (
        item.localStatus !== "EMPLOYER_VERIFICATION" &&
        item.localStatus !== "LENDER_PACKAGE_SENT"
      ) {
        throw new Error(
          "A lender package can only be submitted after employer verification",
        );
      }
      return {
        ...item,
        localStatus: "LENDER_PACKAGE_SENT",
        history: nextHistory,
      };
    case "MORE_INFORMATION_REQUIRED":
      return {
        ...item,
        localStatus: "LENDER_MORE_INFO_REQUIRED",
        history: nextHistory,
      };
    case "DECISION_AVAILABLE":
      if (
        item.localStatus !== "LENDER_PACKAGE_SENT" &&
        item.localStatus !== "LENDER_MORE_INFO_REQUIRED"
      ) {
        throw new Error("Decision projection requires a lender package");
      }
      return {
        ...item,
        localStatus: "LENDER_DECISION_RECEIVED",
        history: nextHistory,
      };
    case "FINAL_CONTRACT_READY":
      if (item.localStatus !== "LENDER_DECISION_RECEIVED") {
        throw new Error(
          "Contract can only be prepared after a lender decision",
        );
      }
      return {
        ...item,
        localStatus: "FINAL_CONTRACT_READY",
        history: nextHistory,
      };
    case "FINAL_CONTRACT_SIGNATURE_CAPTURED":
    case "FINAL_CONTRACT_VIDEO_CAPTURED":
    case "PAYROLL_AUTH_CAPTURED": {
      if (
        item.localStatus !== "FINAL_CONTRACT_READY" &&
        item.localStatus !== "CONTRACT_EVIDENCE_COLLECTED"
      ) {
        throw new Error(
          "Contract evidence can only be collected on a ready contract",
        );
      }
      const contractEvidence = {
        signatureCaptured:
          item.contractEvidence.signatureCaptured ||
          event.eventType === "FINAL_CONTRACT_SIGNATURE_CAPTURED",
        videoCaptured:
          item.contractEvidence.videoCaptured ||
          event.eventType === "FINAL_CONTRACT_VIDEO_CAPTURED",
        payrollAuthorizationCaptured:
          item.contractEvidence.payrollAuthorizationCaptured ||
          event.eventType === "PAYROLL_AUTH_CAPTURED",
        submittedToLender: item.contractEvidence.submittedToLender,
        submissionEventRef: item.contractEvidence.submissionEventRef,
        lenderAcceptanceEventRef:
          item.contractEvidence.lenderAcceptanceEventRef,
      };
      const localStatus =
        contractEvidence.signatureCaptured &&
        contractEvidence.videoCaptured &&
        contractEvidence.payrollAuthorizationCaptured
          ? "CONTRACT_EVIDENCE_COLLECTED"
          : "FINAL_CONTRACT_READY";
      return { ...item, contractEvidence, localStatus, history: nextHistory };
    }
    case "CONTRACT_EVIDENCE_SUBMITTED":
      if (item.localStatus !== "CONTRACT_EVIDENCE_COLLECTED") {
        throw new Error(
          "Complete contract evidence is required before submission",
        );
      }
      assertContractEvidencePacket(event);
      return {
        ...item,
        contractEvidence: {
          ...item.contractEvidence,
          submittedToLender: true,
          submissionEventRef: event.eventId,
        },
        history: nextHistory,
      };
    case "CONTRACT_EVIDENCE_ACCEPTED":
      if (item.localStatus !== "CONTRACT_EVIDENCE_COLLECTED") {
        throw new Error("Contract evidence acceptance is not available");
      }
      assertContractEvidenceCollected(item);
      if (!item.contractEvidence.submittedToLender) {
        throw new Error(
          "Contract evidence must be submitted before lender acceptance",
        );
      }
      return {
        ...item,
        contractEvidence: {
          ...item.contractEvidence,
          lenderAcceptanceEventRef: event.externalEventRef ?? event.eventId,
        },
        history: nextHistory,
      };
    case "READY_FOR_DISBURSEMENT":
      if (item.localStatus !== "CONTRACT_EVIDENCE_COLLECTED") {
        throw new Error(
          "Ready-for-disbursement requires accepted contract evidence",
        );
      }
      if (!item.contractEvidence.lenderAcceptanceEventRef) {
        throw new Error(
          "Lender contract evidence acceptance must be projected first",
        );
      }
      return {
        ...item,
        localStatus: "READY_FOR_DISBURSEMENT",
        history: nextHistory,
      };
    case "BROKERAGE_REMUNERATION_DUE":
      if (
        item.localStatus !== "DISBURSED" &&
        item.localStatus !== "BROKERAGE_REMUNERATION_DUE" &&
        item.localStatus !== "BROKERAGE_REMUNERATION_OVERDUE"
      ) {
        throw new Error(
          "Brokerage remuneration only becomes due after disbursement",
        );
      }
      return {
        ...item,
        localStatus: "BROKERAGE_REMUNERATION_DUE",
        brokerageRemunerationStatus: "DUE",
        history: nextHistory,
      };
    case "BROKERAGE_REMUNERATION_PAYMENT_SUBMITTED":
      assertPaymentEventPayload(event);
      if (
        item.localStatus !== "DISBURSED" &&
        item.localStatus !== "BROKERAGE_REMUNERATION_DUE" &&
        item.localStatus !== "BROKERAGE_REMUNERATION_OVERDUE"
      ) {
        throw new Error(
          "Brokerage remuneration payments only apply after disbursement",
        );
      }
      return {
        ...item,
        localStatus: "BROKERAGE_REMUNERATION_DUE",
        brokerageRemunerationStatus: "REVIEWING",
        paymentAllocations: recordAllocation(
          item,
          "BROKERAGE_REMUNERATION_PAYMENT_PROOF",
          "REVIEWING",
          {
            amountMinor: event.paymentAmountMinor,
            currency: event.paymentCurrency,
            proofRef: event.paymentProofRef,
            externalEventRef: event.externalEventRef ?? event.eventId,
          },
        ),
        history: nextHistory,
      };
    case "BROKERAGE_REMUNERATION_PAYMENT_ACCEPTED": {
      assertPaymentEventPayload(event);
      return {
        ...item,
        localStatus: "BROKERAGE_REMUNERATION_DUE",
        brokerageRemunerationStatus: "ACCEPTED",
        paymentAllocations: recordAllocation(
          item,
          "BROKERAGE_REMUNERATION_PAYMENT_PROOF",
          "ACCEPTED",
          {
            amountMinor: event.paymentAmountMinor,
            currency: event.paymentCurrency,
            proofRef: event.paymentProofRef,
            externalEventRef: event.externalEventRef ?? event.eventId,
            acceptedByDomain: "BROKER",
          },
        ),
        history: nextHistory,
      };
    }
    case "BROKERAGE_REMUNERATION_OVERDUE":
      if (
        item.localStatus !== "BROKERAGE_REMUNERATION_DUE" &&
        item.localStatus !== "DISBURSED"
      ) {
        throw new Error(
          "Brokerage remuneration can only become overdue after disbursement",
        );
      }
      return {
        ...item,
        localStatus: "BROKERAGE_REMUNERATION_OVERDUE",
        brokerageRemunerationStatus: "OVERDUE",
        history: nextHistory,
      };
    case "DISBURSEMENT_STARTED":
      if (item.localStatus !== "READY_FOR_DISBURSEMENT") {
        throw new Error(
          "Disbursement can only start from READY_FOR_DISBURSEMENT",
        );
      }
      return {
        ...item,
        localStatus: "DISBURSEMENT_PROCESSING",
        history: nextHistory,
      };
    case "DISBURSEMENT_FAILED":
      if (item.localStatus !== "DISBURSEMENT_PROCESSING") {
        throw new Error("Disbursement failures require an active disbursement");
      }
      return {
        ...item,
        localStatus: "DISBURSEMENT_EXCEPTION",
        history: nextHistory,
      };
    case "DISBURSED":
      if (item.localStatus !== "DISBURSEMENT_PROCESSING") {
        throw new Error("Only active disbursements can settle");
      }
      return {
        ...item,
        localStatus: "DISBURSED",
        brokerageRemunerationStatus: "DUE",
        history: nextHistory,
      };
    case "PAYROLL_COLLECTION_SCHEDULED":
      if (
        item.localStatus !== "DISBURSED" &&
        item.localStatus !== "BROKERAGE_REMUNERATION_DUE" &&
        item.localStatus !== "BROKERAGE_REMUNERATION_OVERDUE"
      ) {
        throw new Error(
          "Payroll collection can only be scheduled after disbursement",
        );
      }
      return {
        ...item,
        localStatus: "PAYROLL_COLLECTION_PENDING",
        history: nextHistory,
      };
    case "PAYROLL_COLLECTION_REPORTED":
      if (item.localStatus !== "PAYROLL_COLLECTION_PENDING") {
        throw new Error(
          "Payroll collection reporting requires a pending payroll cycle",
        );
      }
      return {
        ...item,
        localStatus: "COLLECTION_RECONCILIATION_PENDING",
        history: nextHistory,
      };
    case "PARTIALLY_COLLECTED_REPORTED":
    case "NOT_COLLECTED_REPORTED":
      if (item.localStatus !== "PAYROLL_COLLECTION_PENDING") {
        throw new Error(
          "Collection exceptions require a pending payroll cycle",
        );
      }
      return {
        ...item,
        localStatus: "COLLECTION_EXCEPTION",
        history: nextHistory,
      };
    case "LOAN_SETTLED":
      if (
        item.localStatus !== "COLLECTION_RECONCILIATION_PENDING" &&
        item.localStatus !== "COLLECTION_EXCEPTION"
      ) {
        throw new Error("Settlement requires collection reconciliation");
      }
      return { ...item, localStatus: "PAID_OFF", history: nextHistory };
    case "DECISION_REJECTED":
      return { ...item, localStatus: "REJECTED", history: nextHistory };
    case "BROKER_CASE_CLOSED":
      return { ...item, localStatus: "BROKER_CLOSED", history: nextHistory };
    case "LENDER_CASE_CLOSED":
      return { ...item, localStatus: "LENDER_CLOSED", history: nextHistory };
  }
  const unreachable: never = event.eventType;
  throw new Error(`Unhandled broker workflow event: ${unreachable}`);
}

export function applyLenderCaseEvent(
  item: LenderCaseRecord,
  event: LenderCaseEvent,
): LenderCaseRecord {
  assertLenderEventSource(event);
  const history = [...item.history, event];
  switch (event.eventType) {
    case "LENDER_APPLICATION_RECEIVED":
      return { ...item, localStatus: "LENDER_REVIEWING", history };
    case "MORE_INFORMATION_REQUIRED":
      return { ...item, localStatus: "LENDER_MORE_INFO_REQUIRED", history };
    case "LENDER_SUPPLEMENT_RECEIVED":
      if (item.localStatus !== "LENDER_MORE_INFO_REQUIRED") {
        throw new Error(
          "Supplements are only accepted while more information is required",
        );
      }
      return { ...item, history };
    case "LENDER_REVIEW_RESUMED":
      if (item.localStatus !== "LENDER_MORE_INFO_REQUIRED") {
        throw new Error("Lender review can only resume from supplement review");
      }
      return { ...item, localStatus: "LENDER_REVIEWING", history };
    case "DECISION_MADE":
      if (item.localStatus !== "LENDER_REVIEWING") {
        throw new Error("A lender decision requires an active review");
      }
      return { ...item, localStatus: "DECISION_MADE", history };
    case "FINAL_CONTRACT_READY":
      if (item.localStatus !== "DECISION_MADE") {
        throw new Error("Contract preparation requires a made decision");
      }
      return { ...item, localStatus: "FINAL_CONTRACT_READY", history };
    case "CONTRACT_EVIDENCE_RECEIVED":
      assertContractEvidencePacket(event);
      if (item.localStatus !== "FINAL_CONTRACT_READY") {
        throw new Error(
          "Contract evidence packets can only be received for a ready contract",
        );
      }
      return {
        ...item,
        contractEvidencePacket: {
          received: true,
          packageRef: event.evidencePackageRef,
          packageHash: event.evidencePackageHash,
          receivedEventRef: event.externalEventRef ?? event.eventId,
        },
        history,
      };
    case "CONTRACT_EVIDENCE_ACCEPTED":
      if (item.localStatus !== "FINAL_CONTRACT_READY") {
        throw new Error(
          "Contract evidence acceptance requires a ready contract",
        );
      }
      if (!item.contractEvidencePacket.received) {
        throw new Error(
          "Contract evidence must be received before lender acceptance",
        );
      }
      return {
        ...item,
        localStatus: "CONTRACT_EVIDENCE_ACCEPTED",
        contractEvidencePacket: {
          ...item.contractEvidencePacket,
          acceptedEventRef: event.externalEventRef ?? event.eventId,
        },
        history,
      };
    case "READY_FOR_DISBURSEMENT":
      if (item.localStatus !== "CONTRACT_EVIDENCE_ACCEPTED") {
        throw new Error(
          "Ready-for-disbursement requires accepted contract evidence first",
        );
      }
      return { ...item, localStatus: "READY_FOR_DISBURSEMENT", history };
    case "DISBURSEMENT_STARTED":
      if (item.localStatus !== "READY_FOR_DISBURSEMENT") {
        throw new Error(
          "Disbursement can only start from READY_FOR_DISBURSEMENT",
        );
      }
      return { ...item, localStatus: "DISBURSEMENT_PROCESSING", history };
    case "DISBURSEMENT_FAILED":
      if (item.localStatus !== "DISBURSEMENT_PROCESSING") {
        throw new Error(
          "Disbursement failures require an in-flight disbursement",
        );
      }
      return { ...item, localStatus: "DISBURSEMENT_EXCEPTION", history };
    case "DISBURSED":
      if (item.localStatus !== "DISBURSEMENT_PROCESSING") {
        throw new Error("Disbursement completion requires processing state");
      }
      return { ...item, localStatus: "DISBURSED", history };
    case "PAYROLL_COLLECTION_SCHEDULED":
      if (item.localStatus !== "DISBURSED") {
        throw new Error(
          "Payroll collection can only be scheduled after disbursement",
        );
      }
      return { ...item, localStatus: "PAYROLL_COLLECTION_PENDING", history };
    case "PAYROLL_COLLECTION_REPORTED":
      if (item.localStatus !== "PAYROLL_COLLECTION_PENDING") {
        throw new Error(
          "Payroll collection reporting requires a pending cycle",
        );
      }
      return {
        ...item,
        localStatus: "COLLECTION_RECONCILIATION_PENDING",
        history,
      };
    case "PARTIALLY_COLLECTED_REPORTED":
    case "NOT_COLLECTED_REPORTED":
      if (item.localStatus !== "PAYROLL_COLLECTION_PENDING") {
        throw new Error("Collection exceptions require a pending cycle");
      }
      return { ...item, localStatus: "COLLECTION_EXCEPTION", history };
    case "EXCEPTIONAL_PRINCIPAL_PAYMENT_RECEIVED":
      if (item.localStatus !== "COLLECTION_EXCEPTION") {
        throw new Error(
          "Exceptional principal payments only apply to collection exceptions",
        );
      }
      return {
        ...item,
        localStatus: "COLLECTION_RECONCILIATION_PENDING",
        history,
      };
    case "LOAN_SETTLED":
      if (
        item.localStatus !== "COLLECTION_RECONCILIATION_PENDING" &&
        item.localStatus !== "COLLECTION_EXCEPTION"
      ) {
        throw new Error("Settlement requires collection reconciliation");
      }
      return { ...item, localStatus: "PAID_OFF", history };
    case "DECISION_REJECTED":
      return { ...item, localStatus: "REJECTED", history };
    case "LENDER_CASE_CLOSED":
      return { ...item, localStatus: "LENDER_CLOSED", history };
  }
  const unreachable: never = event.eventType;
  throw new Error(`Unhandled lender case event: ${unreachable}`);
}

export function createSuccessorApplicationCutover(
  sourceApplicationRef: string,
  successorApplicationRef: string,
  cutoverOperator: string,
  occurredAt: string,
): HistoricalCutover {
  return HistoricalCutoverSchema.parse({
    workflowVersion: "SALARY_LOAN_V2",
    cutoverDecision: "CUTOVER_TO_V2",
    cutoverAt: occurredAt,
    cutoverOperator,
    sourceApplicationRef,
    successorApplicationRef,
  });
}
