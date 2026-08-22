import { describe, expect, it } from "vitest";
import {
  applyBrokerWorkflowEvent,
  applyLenderCaseEvent,
  createBrokerWorkflow,
  createLenderCase,
  createSuccessorApplicationCutover,
  type BrokerWorkflowEvent,
  type LenderCaseEvent,
} from "../src/index.js";

const brokerEvent = (
  eventType: BrokerWorkflowEvent["eventType"],
  eventId: string,
  overrides: Partial<BrokerWorkflowEvent> = {},
): BrokerWorkflowEvent => ({
  eventId,
  eventType,
  sourceDomain: "BROKER",
  actorUserRef: "broker-user-1",
  occurredAt: "2026-08-21T08:00:00.000Z",
  ...overrides,
});

const lenderEvent = (
  eventType: LenderCaseEvent["eventType"],
  eventId: string,
  overrides: Partial<LenderCaseEvent> = {},
): LenderCaseEvent => ({
  eventId,
  eventType,
  sourceDomain: "LENDER",
  actorUserRef: "lender-user-1",
  occurredAt: "2026-08-21T08:00:00.000Z",
  ...overrides,
});

function brokerToContractEvidenceCollected(ref: string) {
  let broker = createBrokerWorkflow(ref);
  broker = applyBrokerWorkflowEvent(
    broker,
    brokerEvent("APPLICATION_SUBMITTED", `${ref}-01`),
  );
  broker = applyBrokerWorkflowEvent(
    broker,
    brokerEvent("BROKER_PRECHECK_STARTED", `${ref}-02`),
  );
  broker = applyBrokerWorkflowEvent(
    broker,
    brokerEvent("BROKER_PRECHECK_PASSED", `${ref}-03`),
  );
  broker = applyBrokerWorkflowEvent(
    broker,
    brokerEvent("EMPLOYER_VERIFIED", `${ref}-04`),
  );
  broker = applyBrokerWorkflowEvent(
    broker,
    brokerEvent("DECISION_AVAILABLE", `${ref}-05`, { sourceDomain: "LENDER" }),
  );
  broker = applyBrokerWorkflowEvent(
    broker,
    brokerEvent("FINAL_CONTRACT_READY", `${ref}-06`, {
      sourceDomain: "LENDER",
    }),
  );
  broker = applyBrokerWorkflowEvent(
    broker,
    brokerEvent("FINAL_CONTRACT_SIGNATURE_CAPTURED", `${ref}-07`),
  );
  broker = applyBrokerWorkflowEvent(
    broker,
    brokerEvent("FINAL_CONTRACT_VIDEO_CAPTURED", `${ref}-08`),
  );
  broker = applyBrokerWorkflowEvent(
    broker,
    brokerEvent("PAYROLL_AUTH_CAPTURED", `${ref}-09`),
  );
  return broker;
}

describe("salary loan v2 workflow isolation", () => {
  it("moves to READY_FOR_DISBURSEMENT from lender evidence acceptance without pre-disbursement fee blockers", () => {
    let broker = brokerToContractEvidenceCollected("BRK-APP-0001");
    broker = applyBrokerWorkflowEvent(
      broker,
      brokerEvent("CONTRACT_EVIDENCE_SUBMITTED", "evt-10", {
        evidencePackageRef: "CEP-0001",
        evidencePackageHash: "a".repeat(64),
      }),
    );
    broker = applyBrokerWorkflowEvent(
      broker,
      brokerEvent("CONTRACT_EVIDENCE_ACCEPTED", "evt-11", {
        sourceDomain: "LENDER",
      }),
    );
    broker = applyBrokerWorkflowEvent(
      broker,
      brokerEvent("READY_FOR_DISBURSEMENT", "evt-12", {
        sourceDomain: "LENDER",
      }),
    );

    expect(broker.localStatus).toBe("READY_FOR_DISBURSEMENT");
    expect(broker.brokerageRemunerationStatus).toBe("NOT_DUE");
  });

  it("does not let a broker supplement submission directly resume lender review", () => {
    let lender = createLenderCase("LND-CASE-0001");
    lender = applyLenderCaseEvent(
      lender,
      lenderEvent("MORE_INFORMATION_REQUIRED", "lnd-evt-01"),
    );

    expect(() =>
      applyLenderCaseEvent(lender, lenderEvent("DECISION_MADE", "lnd-evt-02")),
    ).toThrow(/active review/);

    lender = applyLenderCaseEvent(
      lender,
      lenderEvent("LENDER_SUPPLEMENT_RECEIVED", "lnd-evt-03"),
    );
    lender = applyLenderCaseEvent(
      lender,
      lenderEvent("LENDER_REVIEW_RESUMED", "lnd-evt-04"),
    );

    expect(lender.localStatus).toBe("LENDER_REVIEWING");
  });

  it("rejects lender contract acceptance before all three evidence items are collected", () => {
    let broker = createBrokerWorkflow("BRK-APP-0003");
    broker = applyBrokerWorkflowEvent(
      broker,
      brokerEvent("APPLICATION_SUBMITTED", "evt-a1"),
    );
    broker = applyBrokerWorkflowEvent(
      broker,
      brokerEvent("BROKER_PRECHECK_STARTED", "evt-a2"),
    );
    broker = applyBrokerWorkflowEvent(
      broker,
      brokerEvent("BROKER_PRECHECK_PASSED", "evt-a3"),
    );
    broker = applyBrokerWorkflowEvent(
      broker,
      brokerEvent("EMPLOYER_VERIFIED", "evt-a4"),
    );
    broker = applyBrokerWorkflowEvent(
      broker,
      brokerEvent("DECISION_AVAILABLE", "evt-a5", { sourceDomain: "LENDER" }),
    );
    broker = applyBrokerWorkflowEvent(
      broker,
      brokerEvent("FINAL_CONTRACT_READY", "evt-a6", { sourceDomain: "LENDER" }),
    );
    broker = applyBrokerWorkflowEvent(
      broker,
      brokerEvent("FINAL_CONTRACT_SIGNATURE_CAPTURED", "evt-a7"),
    );

    expect(() =>
      applyBrokerWorkflowEvent(
        broker,
        brokerEvent("CONTRACT_EVIDENCE_ACCEPTED", "evt-a8", {
          sourceDomain: "LENDER",
        }),
      ),
    ).toThrow(/not available|All contract evidence/);
  });

  it("requires lender-side receipt of evidence before readiness for disbursement", () => {
    let lender = createLenderCase("LND-CASE-0003");
    lender = applyLenderCaseEvent(
      lender,
      lenderEvent("DECISION_MADE", "lnd-b1"),
    );
    lender = applyLenderCaseEvent(
      lender,
      lenderEvent("FINAL_CONTRACT_READY", "lnd-b2"),
    );

    expect(() =>
      applyLenderCaseEvent(
        lender,
        lenderEvent("READY_FOR_DISBURSEMENT", "lnd-b3"),
      ),
    ).toThrow(/accepted contract evidence first/);

    lender = applyLenderCaseEvent(
      lender,
      lenderEvent("CONTRACT_EVIDENCE_RECEIVED", "lnd-b4", {
        sourceDomain: "BROKER",
        evidencePackageRef: "CEP-0002",
        evidencePackageHash: "b".repeat(64),
        externalEventRef: "broker-contract-evidence-b4",
      }),
    );
    lender = applyLenderCaseEvent(
      lender,
      lenderEvent("CONTRACT_EVIDENCE_ACCEPTED", "lnd-b5"),
    );
    lender = applyLenderCaseEvent(
      lender,
      lenderEvent("READY_FOR_DISBURSEMENT", "lnd-b6"),
    );

    expect(lender.localStatus).toBe("READY_FOR_DISBURSEMENT");
  });

  it("rejects forged source domains for lender acceptance and broker readiness projections", () => {
    let broker = brokerToContractEvidenceCollected("BRK-APP-0004");
    broker = applyBrokerWorkflowEvent(
      broker,
      brokerEvent("CONTRACT_EVIDENCE_SUBMITTED", "evt-c10", {
        evidencePackageRef: "CEP-0003",
        evidencePackageHash: "c".repeat(64),
      }),
    );

    expect(() =>
      applyBrokerWorkflowEvent(
        broker,
        brokerEvent("CONTRACT_EVIDENCE_ACCEPTED", "evt-c11", {
          sourceDomain: "BROKER",
        }),
      ),
    ).toThrow(/must originate from LENDER/);

    expect(() =>
      applyBrokerWorkflowEvent(
        broker,
        brokerEvent("READY_FOR_DISBURSEMENT", "evt-c12", {
          sourceDomain: "BROKER",
        }),
      ),
    ).toThrow(/must originate from LENDER/);
  });

  it("rejects brokerage remuneration payment submission before disbursement", () => {
    let broker = brokerToContractEvidenceCollected("BRK-APP-0005");
    broker = applyBrokerWorkflowEvent(
      broker,
      brokerEvent("CONTRACT_EVIDENCE_SUBMITTED", "evt-d10", {
        evidencePackageRef: "CEP-0005",
        evidencePackageHash: "d".repeat(64),
      }),
    );
    broker = applyBrokerWorkflowEvent(
      broker,
      brokerEvent("CONTRACT_EVIDENCE_ACCEPTED", "evt-d11", {
        sourceDomain: "LENDER",
      }),
    );
    broker = applyBrokerWorkflowEvent(
      broker,
      brokerEvent("READY_FOR_DISBURSEMENT", "evt-d12", {
        sourceDomain: "LENDER",
      }),
    );

    expect(() =>
      applyBrokerWorkflowEvent(
        broker,
        brokerEvent("BROKERAGE_REMUNERATION_PAYMENT_SUBMITTED", "evt-d13", {
          paymentAmountMinor: "525",
          paymentCurrency: "USD",
          paymentProofRef: "PRF-BROKER-0005",
        }),
      ),
    ).toThrow(/only apply after disbursement/);
  });

  it("tracks brokerage remuneration due and acceptance only after disbursement", () => {
    let broker = brokerToContractEvidenceCollected("BRK-APP-0006");
    broker = applyBrokerWorkflowEvent(
      broker,
      brokerEvent("CONTRACT_EVIDENCE_SUBMITTED", "evt-e10", {
        evidencePackageRef: "CEP-0006",
        evidencePackageHash: "e".repeat(64),
      }),
    );
    broker = applyBrokerWorkflowEvent(
      broker,
      brokerEvent("CONTRACT_EVIDENCE_ACCEPTED", "evt-e11", {
        sourceDomain: "LENDER",
      }),
    );
    broker = applyBrokerWorkflowEvent(
      broker,
      brokerEvent("READY_FOR_DISBURSEMENT", "evt-e12", {
        sourceDomain: "LENDER",
      }),
    );
    broker = applyBrokerWorkflowEvent(
      broker,
      brokerEvent("DISBURSEMENT_STARTED", "evt-e13", {
        sourceDomain: "LENDER",
      }),
    );
    broker = applyBrokerWorkflowEvent(
      broker,
      brokerEvent("DISBURSED", "evt-e14", {
        sourceDomain: "LENDER",
      }),
    );
    broker = applyBrokerWorkflowEvent(
      broker,
      brokerEvent("BROKERAGE_REMUNERATION_PAYMENT_SUBMITTED", "evt-e15", {
        paymentAmountMinor: "525",
        paymentCurrency: "USD",
        paymentProofRef: "PRF-BROKER-0006",
      }),
    );
    broker = applyBrokerWorkflowEvent(
      broker,
      brokerEvent("BROKERAGE_REMUNERATION_PAYMENT_ACCEPTED", "evt-e16", {
        sourceDomain: "BROKER",
        paymentAmountMinor: "525",
        paymentCurrency: "USD",
        paymentProofRef: "PRF-BROKER-0006",
      }),
    );

    expect(broker.localStatus).toBe("BROKERAGE_REMUNERATION_DUE");
    expect(broker.brokerageRemunerationStatus).toBe("ACCEPTED");
    expect(broker.paymentAllocations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          paymentType: "BROKERAGE_REMUNERATION_PAYMENT_PROOF",
          amountMinor: "525",
          proofRef: "PRF-BROKER-0006",
        }),
      ]),
    );
  });

  it("rejects payment acceptance events without amount and proof evidence", () => {
    let broker = createBrokerWorkflow("BRK-APP-0007");
    broker = applyBrokerWorkflowEvent(
      broker,
      brokerEvent("BROKER_CASE_CLOSED", "evt-f0"),
    );

    expect(() =>
      applyBrokerWorkflowEvent(
        {
          ...createBrokerWorkflow("BRK-APP-0007A"),
          localStatus: "DISBURSED",
          brokerageRemunerationStatus: "DUE",
        },
        brokerEvent("BROKERAGE_REMUNERATION_PAYMENT_ACCEPTED", "evt-f1", {
          sourceDomain: "BROKER",
          paymentCurrency: "USD",
        }),
      ),
    ).toThrow(/paymentAmountMinor|paymentProofRef/);
  });

  it("rejects lender contract acceptance before a broker evidence packet is received", () => {
    let lender = createLenderCase("LND-CASE-0005");
    lender = applyLenderCaseEvent(
      lender,
      lenderEvent("DECISION_MADE", "lnd-d1"),
    );
    lender = applyLenderCaseEvent(
      lender,
      lenderEvent("FINAL_CONTRACT_READY", "lnd-d2"),
    );

    expect(() =>
      applyLenderCaseEvent(
        lender,
        lenderEvent("CONTRACT_EVIDENCE_ACCEPTED", "lnd-d3"),
      ),
    ).toThrow(/must be received before lender acceptance/);
  });

  it("keeps broker and lender closures as separate local facts", () => {
    const broker = applyBrokerWorkflowEvent(
      createBrokerWorkflow("BRK-APP-0002"),
      brokerEvent("BROKER_CASE_CLOSED", "evt-closed-01"),
    );
    const lender = applyLenderCaseEvent(
      createLenderCase("LND-CASE-0002"),
      lenderEvent("LENDER_CASE_CLOSED", "lnd-closed-01"),
    );

    expect(broker.localStatus).toBe("BROKER_CLOSED");
    expect(lender.localStatus).toBe("LENDER_CLOSED");
  });

  it("records cutover strategy without mutating the legacy application reference", () => {
    const cutover = createSuccessorApplicationCutover(
      "LEGACY-APP-0001",
      "BRK-APP-V2-0001",
      "ops-supervisor-1",
      "2026-08-21T10:00:00.000Z",
    );

    expect(cutover).toMatchObject({
      workflowVersion: "SALARY_LOAN_V2",
      cutoverDecision: "CUTOVER_TO_V2",
      sourceApplicationRef: "LEGACY-APP-0001",
      successorApplicationRef: "BRK-APP-V2-0001",
    });
  });
});
