import { describe, expect, it } from "vitest";
import {
  confirmContract,
  createDraftApplication,
  markFundsEvent,
  recordApproval,
  recordDualControl,
  resolveRejectionCondition,
  transitionApplication,
  translate,
} from "../src/index.js";

const application = () =>
  createDraftApplication({
    id: "APP-DEMO-001",
    applicantUserId: "tg-1001",
    preferredLanguage: "km",
    requestedAmount: { amountMinor: "25000", currency: "USD" },
    tenorDays: 30,
  });

const approval = (
  stage: Parameters<typeof recordApproval>[1]["stage"],
  actorUserId: string,
) => ({
  stage,
  decision: "APPROVED" as const,
  actorUserId,
  actorRole: "LENDER_REVIEWER",
  reasonCode: "APPROVED_BY_POLICY",
  occurredAt: "2026-08-12T08:00:00.000Z",
});

describe("V1 controlled-pilot workflow", () => {
  it("moves an application through approval, contract and dual-controlled disbursement", () => {
    let item = application();
    item = transitionApplication(
      item,
      "SUBMITTED",
      "tg-1001",
      "2026-08-12T07:00:00.000Z",
    );
    item = transitionApplication(
      item,
      "BROKER_REVIEW",
      "broker-1",
      "2026-08-12T07:01:00.000Z",
    );
    item = recordApproval(item, approval("BROKER_REVIEW", "broker-1"));
    item = recordApproval(item, approval("EMPLOYER_VERIFICATION", "hr-1"));
    item = recordApproval(
      item,
      approval("EMPLOYER_FINANCE_VERIFICATION", "employer-finance-1"),
    );
    item = recordApproval(item, approval("LENDER_INITIAL_REVIEW", "lender-1"));
    item = recordApproval(item, approval("LENDER_FINAL_REVIEW", "lender-2"));
    item = confirmContract(
      item,
      "tg-1001",
      "2026-08-12T08:20:00.000Z",
      "contract-sha256:demo",
    );
    item = transitionApplication(
      item,
      "DISBURSEMENT_PENDING",
      "lender-2",
      "2026-08-12T08:21:00.000Z",
    );
    item = recordDualControl(
      item,
      "DISBURSEMENT_RELEASE",
      approval("DISBURSEMENT_RELEASE", "finance-1"),
      approval("DISBURSEMENT_CONFIRMATION", "finance-2"),
    );
    item = markFundsEvent(
      item,
      "DISBURSEMENT_RECORDED",
      "finance-2",
      "2026-08-12T09:00:00.000Z",
      "receipt:demo-1",
    );
    expect(item.status).toBe("DISBURSED");
    expect(item.auditEvents.at(-1)?.eventType).toBe("DISBURSEMENT_RECORDED");
  });

  it("does not allow the same account to perform both sides of a fund operation", () => {
    let item = application();
    item = transitionApplication(
      item,
      "SUBMITTED",
      "tg-1001",
      "2026-08-12T07:00:00.000Z",
    );
    item = transitionApplication(
      item,
      "BROKER_REVIEW",
      "broker-1",
      "2026-08-12T07:01:00.000Z",
    );
    item = recordApproval(item, approval("BROKER_REVIEW", "broker-1"));
    item = recordApproval(item, approval("EMPLOYER_VERIFICATION", "hr-1"));
    item = recordApproval(
      item,
      approval("EMPLOYER_FINANCE_VERIFICATION", "employer-finance-1"),
    );
    item = recordApproval(item, approval("LENDER_INITIAL_REVIEW", "lender-1"));
    item = recordApproval(item, approval("LENDER_FINAL_REVIEW", "lender-2"));
    item = confirmContract(
      item,
      "tg-1001",
      "2026-08-12T08:20:00.000Z",
      "contract-sha256:demo",
    );
    item = transitionApplication(
      item,
      "DISBURSEMENT_PENDING",
      "lender-2",
      "2026-08-12T08:21:00.000Z",
    );
    expect(() =>
      recordDualControl(
        item,
        "DISBURSEMENT_RELEASE",
        approval("DISBURSEMENT_RELEASE", "finance-1"),
        approval("DISBURSEMENT_CONFIRMATION", "finance-1"),
      ),
    ).toThrow(/distinct accounts/);
  });

  it("requires two distinct accounts for repayment write-off and preserves the receipt event", () => {
    let item = application();
    item = transitionApplication(
      item,
      "SUBMITTED",
      "tg-1001",
      "2026-08-12T07:00:00.000Z",
    );
    item = transitionApplication(
      item,
      "BROKER_REVIEW",
      "broker-1",
      "2026-08-12T07:01:00.000Z",
    );
    item = recordApproval(item, approval("BROKER_REVIEW", "broker-1"));
    item = recordApproval(item, approval("EMPLOYER_VERIFICATION", "hr-1"));
    item = recordApproval(
      item,
      approval("EMPLOYER_FINANCE_VERIFICATION", "employer-finance-1"),
    );
    item = recordApproval(item, approval("LENDER_INITIAL_REVIEW", "lender-1"));
    item = recordApproval(item, approval("LENDER_FINAL_REVIEW", "lender-2"));
    item = confirmContract(
      item,
      "tg-1001",
      "2026-08-12T08:20:00.000Z",
      "contract-sha256:demo",
    );
    item = transitionApplication(
      item,
      "DISBURSEMENT_PENDING",
      "lender-2",
      "2026-08-12T08:21:00.000Z",
    );
    item = recordDualControl(
      item,
      "DISBURSEMENT_RELEASE",
      approval("DISBURSEMENT_RELEASE", "finance-1"),
      approval("DISBURSEMENT_CONFIRMATION", "finance-2"),
    );
    item = transitionApplication(
      item,
      "REPAYMENT_ACTIVE",
      "finance-2",
      "2026-08-12T09:01:00.000Z",
    );
    item = recordDualControl(
      item,
      "REPAYMENT_WRITE_OFF",
      approval("REPAYMENT_WRITE_OFF", "collections-1"),
      approval("REPAYMENT_CONFIRMATION", "finance-3"),
    );
    item = markFundsEvent(
      item,
      "REPAYMENT_RECORDED",
      "finance-3",
      "2026-08-12T10:00:00.000Z",
      "manual-receipt:demo-2",
    );
    expect(item.status).toBe("SETTLED");
    expect(item.auditEvents.at(-1)?.eventType).toBe("REPAYMENT_RECORDED");
  });

  it("requires the rejection condition to be resolved before resubmission", () => {
    let item = application();
    item = transitionApplication(
      item,
      "SUBMITTED",
      "tg-1001",
      "2026-08-12T07:00:00.000Z",
    );
    item = transitionApplication(
      item,
      "BROKER_REVIEW",
      "broker-1",
      "2026-08-12T07:01:00.000Z",
    );
    item = recordApproval(item, {
      ...approval("BROKER_REVIEW", "broker-1"),
      decision: "REJECTED",
      reasonCode: "MISSING_DOCUMENT",
    });
    expect(() =>
      transitionApplication(
        item,
        "SUBMITTED",
        "tg-1001",
        "2026-08-12T10:00:00.000Z",
      ),
    ).toThrow(/condition is resolved/);
    expect(resolveRejectionCondition(item).rejectionConditionResolved).toBe(
      true,
    );
  });

  it("has controlled trilingual labels", () => {
    expect(translate("zh-CN", "submit")).toBe("提交申请");
    expect(translate("en", "approved")).toBe("Approved");
    expect(translate("km", "rejected")).toBe("ត្រូវបានបដិសេធ");
  });
});
