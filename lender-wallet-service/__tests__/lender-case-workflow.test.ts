import { describe, expect, it } from "vitest";
import { nextLenderCaseState } from "../src/lender-case-workflow.js";

const evidenceReference = "vault://lender/cases/evidence-001";

describe("lender case workflow policy", () => {
  it("requires the KYC/AML role and evidence before a case can move to credit review", () => {
    expect(() =>
      nextLenderCaseState({
        action: "KYC_AML_PASSED",
        stage: "KYC_AML_REVIEW",
        status: "OPEN",
        roles: ["LENDER_CREDIT_REVIEWER"],
        evidenceReference,
        actorRef: "operator:kyc",
      }),
    ).toThrow("LENDER_CASE_ROLE_FORBIDDEN");
    expect(() =>
      nextLenderCaseState({
        action: "KYC_AML_PASSED",
        stage: "KYC_AML_REVIEW",
        status: "OPEN",
        roles: ["LENDER_KYC_AML_REVIEWER"],
        actorRef: "operator:kyc",
      }),
    ).toThrow("LENDER_CASE_EVIDENCE_REQUIRED");
  });

  it("requires an independent contract checker", () => {
    expect(() =>
      nextLenderCaseState({
        action: "CONTRACT_APPROVED",
        stage: "CONTRACT_CHECKER",
        status: "OPEN",
        roles: ["LENDER_CONTRACT_CHECKER"],
        evidenceReference,
        contractMakerRef: "operator:same-person",
        actorRef: "operator:same-person",
      }),
    ).toThrow("LENDER_CONTRACT_CHECKER_MUST_DIFFER_FROM_MAKER");
  });

  it("prevents a complaint officer from changing the credit workflow", () => {
    expect(() =>
      nextLenderCaseState({
        action: "CREDIT_APPROVED",
        stage: "CREDIT_APPROVAL",
        status: "OPEN",
        roles: ["LENDER_COMPLAINT_OFFICER"],
        evidenceReference,
        actorRef: "operator:complaint",
      }),
    ).toThrow("LENDER_CASE_ROLE_FORBIDDEN");
  });
});
