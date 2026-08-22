import { describe, expect, it } from "vitest";
import {
  applyRepaymentWorkItemSelection,
  canResolveCollectionException,
  LENDER_REPAYMENT_QUEUE_AUTO_REFRESH_MS,
  type RepaymentWorkItem,
} from "../src/lender-repayment-queue.ts";

const payrollWorkItem: RepaymentWorkItem = {
  workItemId: "work-item-001",
  applicationNo: "APP-20260822-UAT-PAYROLL",
  collectionSequence: 1,
  selectedRepaymentMethod: "EMPLOYER_PAYROLL_DEDUCTION",
  sourceType: "EMPLOYER_PAYROLL_REPORT",
  collectionResult: "PARTIALLY_COLLECTED",
  reportedAmountMinor: "10000",
  evidenceReference: "PAYROLL-PARTIAL-UAT-001",
  workItemStatus: "EXCEPTION",
  createdAt: "2026-08-22T00:00:00Z",
};

describe("lender repayment queue helpers", () => {
  it("uses a stable auto-refresh interval for lender repayment queues", () => {
    expect(LENDER_REPAYMENT_QUEUE_AUTO_REFRESH_MS).toBe(30_000);
  });

  it("backfills application number, reason code, and evidence reference from a selected work item", () => {
    expect(applyRepaymentWorkItemSelection(payrollWorkItem)).toEqual({
      applicationNo: "APP-20260822-UAT-PAYROLL",
      reasonCode: "QUEUE_PARTIALLY_COLLECTED",
      evidenceReference: "PAYROLL-PARTIAL-UAT-001",
    });
  });

  it("only enables exception resolution for checker role with valid reason and evidence", () => {
    expect(
      canResolveCollectionException({
        roles: ["LENDER_REPAYMENT_CHECKER"],
        reasonCode: "ALTERNATE_COLLECTION_RECORDED",
        evidenceReference: "EXCEPTION-RESOLUTION-001",
      }),
    ).toBe(true);
    expect(
      canResolveCollectionException({
        roles: ["LENDER_REPAYMENT_MAKER"],
        reasonCode: "ALTERNATE_COLLECTION_RECORDED",
        evidenceReference: "EXCEPTION-RESOLUTION-001",
      }),
    ).toBe(false);
    expect(
      canResolveCollectionException({
        roles: ["LENDER_REPAYMENT_CHECKER"],
        reasonCode: "bad code",
        evidenceReference: "EXCEPTION-RESOLUTION-001",
      }),
    ).toBe(false);
    expect(
      canResolveCollectionException({
        roles: ["LENDER_REPAYMENT_CHECKER"],
        reasonCode: "ALTERNATE_COLLECTION_RECORDED",
        evidenceReference: "x",
      }),
    ).toBe(false);
  });
});
