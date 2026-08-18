import { describe, expect, it } from "vitest";
import {
  applyApprovalAction,
  createApprovalCase,
  isActionAllowedForStep,
  isActorAuthorizedForStep,
} from "../src/approval-engine.js";

const hash = (digit: string) => digit.repeat(64);
const key = (value: string) => `approval-key-${value}-0001`;

describe("shared approval engine", () => {
  it("moves an application case to offered after broker, employer, kyc, maker and checker approvals", () => {
    let item = createApprovalCase({
      approvalCaseId: "case-app-1",
      aggregateType: "APPLICATION",
      aggregateId: "application-1",
      workflowDefinitionVersion: 1,
      strategyRequiresChecker: true,
    });

    item = applyApprovalAction(item, {
      action: "APPROVE",
      actorUserId: "ops-reviewer-1",
      actorRoleCode: "OPS_PROFILE_REVIEWER",
      inputSnapshotHash: hash("1"),
      idempotencyKey: key("broker"),
      occurredAt: "2026-08-18T08:00:00.000Z",
    });
    item = applyApprovalAction(item, {
      action: "APPROVE",
      actorUserId: "hr-reviewer-1",
      actorRoleCode: "EMPLOYER_HR_VERIFIER",
      inputSnapshotHash: hash("2"),
      idempotencyKey: key("employer"),
      occurredAt: "2026-08-18T08:05:00.000Z",
    });
    item = applyApprovalAction(item, {
      action: "APPROVE",
      actorUserId: "kyc-reviewer-1",
      actorRoleCode: "PARTNER_KYC_REVIEWER",
      inputSnapshotHash: hash("3"),
      idempotencyKey: key("kyc"),
      occurredAt: "2026-08-18T08:10:00.000Z",
    });
    item = applyApprovalAction(item, {
      action: "APPROVE",
      actorUserId: "credit-maker-1",
      actorRoleCode: "PARTNER_CREDIT_MAKER",
      inputSnapshotHash: hash("4"),
      idempotencyKey: key("credit-maker"),
      occurredAt: "2026-08-18T08:15:00.000Z",
    });
    item = applyApprovalAction(item, {
      action: "APPROVE",
      actorUserId: "credit-checker-1",
      actorRoleCode: "PARTNER_CREDIT_CHECKER",
      inputSnapshotHash: hash("5"),
      idempotencyKey: key("credit-checker"),
      occurredAt: "2026-08-18T08:20:00.000Z",
    });

    expect(item).toMatchObject({
      currentStep: "OFFER_READY",
      status: "COMPLETED",
      assignedRoleCode: "PARTNER_CREDIT_CHECKER",
    });
    expect(item.history).toHaveLength(5);
  });

  it("rejects an unauthorized role on the current step", () => {
    const item = createApprovalCase({
      approvalCaseId: "case-app-2",
      aggregateType: "APPLICATION",
      aggregateId: "application-2",
      workflowDefinitionVersion: 1,
    });

    expect(() =>
      applyApprovalAction(item, {
        action: "APPROVE",
        actorUserId: "hr-reviewer-1",
        actorRoleCode: "EMPLOYER_HR_VERIFIER",
        inputSnapshotHash: hash("6"),
        idempotencyKey: key("wrong-role"),
        occurredAt: "2026-08-18T08:00:00.000Z",
      }),
    ).toThrow(/cannot act/);
  });

  it("replays the same idempotent approval without creating a second event", () => {
    const item = createApprovalCase({
      approvalCaseId: "case-app-3",
      aggregateType: "APPLICATION",
      aggregateId: "application-3",
      workflowDefinitionVersion: 1,
    });
    const command = {
      action: "APPROVE" as const,
      actorUserId: "ops-reviewer-1",
      actorRoleCode: "OPS_PROFILE_REVIEWER" as const,
      inputSnapshotHash: hash("7"),
      idempotencyKey: key("broker-replay"),
      occurredAt: "2026-08-18T08:00:00.000Z",
    };

    const once = applyApprovalAction(item, command);
    const replayed = applyApprovalAction(once, command);

    expect(replayed).toBe(once);
    expect(replayed.history).toHaveLength(1);
  });

  it("blocks idempotency key reuse for a different action payload", () => {
    let item = createApprovalCase({
      approvalCaseId: "case-app-4",
      aggregateType: "APPLICATION",
      aggregateId: "application-4",
      workflowDefinitionVersion: 1,
    });
    item = applyApprovalAction(item, {
      action: "APPROVE",
      actorUserId: "ops-reviewer-1",
      actorRoleCode: "OPS_PROFILE_REVIEWER",
      inputSnapshotHash: hash("8"),
      idempotencyKey: key("conflict"),
      occurredAt: "2026-08-18T08:00:00.000Z",
    });

    expect(() =>
      applyApprovalAction(item, {
        action: "APPROVE",
        actorUserId: "hr-reviewer-1",
        actorRoleCode: "EMPLOYER_HR_VERIFIER",
        inputSnapshotHash: hash("9"),
        idempotencyKey: key("conflict"),
        occurredAt: "2026-08-18T08:05:00.000Z",
      }),
    ).toThrow(/Idempotency key/);
  });

  it("enforces maker-checker separation for credit approval", () => {
    let item = createApprovalCase({
      approvalCaseId: "case-app-5",
      aggregateType: "APPLICATION",
      aggregateId: "application-5",
      workflowDefinitionVersion: 1,
      strategyRequiresChecker: true,
    });
    item = applyApprovalAction(item, {
      action: "APPROVE",
      actorUserId: "ops-reviewer-1",
      actorRoleCode: "OPS_PROFILE_REVIEWER",
      inputSnapshotHash: hash("a"),
      idempotencyKey: key("broker-2"),
      occurredAt: "2026-08-18T08:00:00.000Z",
    });
    item = applyApprovalAction(item, {
      action: "APPROVE",
      actorUserId: "hr-reviewer-1",
      actorRoleCode: "EMPLOYER_HR_VERIFIER",
      inputSnapshotHash: hash("b"),
      idempotencyKey: key("employer-2"),
      occurredAt: "2026-08-18T08:05:00.000Z",
    });
    item = applyApprovalAction(item, {
      action: "APPROVE",
      actorUserId: "kyc-reviewer-1",
      actorRoleCode: "PARTNER_KYC_REVIEWER",
      inputSnapshotHash: hash("c"),
      idempotencyKey: key("kyc-2"),
      occurredAt: "2026-08-18T08:10:00.000Z",
    });
    item = applyApprovalAction(item, {
      action: "APPROVE",
      actorUserId: "credit-user-1",
      actorRoleCode: "PARTNER_CREDIT_MAKER",
      inputSnapshotHash: hash("d"),
      idempotencyKey: key("credit-maker-2"),
      occurredAt: "2026-08-18T08:15:00.000Z",
    });

    expect(() =>
      applyApprovalAction(item, {
        action: "APPROVE",
        actorUserId: "credit-user-1",
        actorRoleCode: "PARTNER_CREDIT_CHECKER",
        inputSnapshotHash: hash("e"),
        idempotencyKey: key("credit-checker-2"),
        occurredAt: "2026-08-18T08:20:00.000Z",
      }),
    ).toThrow(/own maker decision/);
  });

  it("returns to broker review and increments the round when supplement is requested", () => {
    let item = createApprovalCase({
      approvalCaseId: "case-app-6",
      aggregateType: "APPLICATION",
      aggregateId: "application-6",
      workflowDefinitionVersion: 1,
    });
    item = applyApprovalAction(item, {
      action: "APPROVE",
      actorUserId: "ops-reviewer-1",
      actorRoleCode: "OPS_PROFILE_REVIEWER",
      inputSnapshotHash: hash("f"),
      idempotencyKey: key("broker-3"),
      occurredAt: "2026-08-18T08:00:00.000Z",
    });

    item = applyApprovalAction(item, {
      action: "REQUEST_SUPPLEMENT",
      actorUserId: "hr-reviewer-1",
      actorRoleCode: "EMPLOYER_HR_VERIFIER",
      reasonCode: "EMPLOYMENT_PROOF_MISMATCH",
      inputSnapshotHash: hash("0"),
      idempotencyKey: key("supplement"),
      occurredAt: "2026-08-18T08:05:00.000Z",
    });

    expect(item).toMatchObject({
      currentStep: "BROKER_REVIEW",
      status: "RETURNED",
      currentRound: 2,
      assignedRoleCode: "OPS_PROFILE_REVIEWER",
    });
  });

  it("completes disbursement approval with distinct maker and checker accounts", () => {
    let item = createApprovalCase({
      approvalCaseId: "case-disbursement-1",
      aggregateType: "DISBURSEMENT",
      aggregateId: "instruction-1",
      workflowDefinitionVersion: 1,
    });

    item = applyApprovalAction(item, {
      action: "APPROVE",
      actorUserId: "disbursement-maker-1",
      actorRoleCode: "PARTNER_DISBURSEMENT_MAKER",
      inputSnapshotHash: hash("2"),
      idempotencyKey: key("disbursement-maker"),
      occurredAt: "2026-08-18T09:00:00.000Z",
    });
    item = applyApprovalAction(item, {
      action: "APPROVE",
      actorUserId: "disbursement-checker-1",
      actorRoleCode: "PARTNER_DISBURSEMENT_CHECKER",
      inputSnapshotHash: hash("3"),
      idempotencyKey: key("disbursement-checker"),
      occurredAt: "2026-08-18T09:05:00.000Z",
    });

    expect(item).toMatchObject({
      currentStep: "MANUAL_DISBURSEMENT_EXECUTION",
      status: "COMPLETED",
      assignedRoleCode: "PARTNER_DISBURSEMENT_MAKER",
    });
  });

  it("exposes step guards for UI and API consumers", () => {
    expect(
      isActorAuthorizedForStep("BROKER_REVIEW", "OPS_PROFILE_REVIEWER"),
    ).toBe(true);
    expect(
      isActorAuthorizedForStep("BROKER_REVIEW", "PARTNER_CREDIT_MAKER"),
    ).toBe(false);
    expect(isActionAllowedForStep("CREDIT_CHECKER_REVIEW", "APPROVE")).toBe(
      true,
    );
    expect(
      isActionAllowedForStep("MANUAL_DISBURSEMENT_EXECUTION", "APPROVE"),
    ).toBe(false);
  });
});
