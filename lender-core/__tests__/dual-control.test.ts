import { describe, expect, it } from "vitest";
import {
  createDraftApplication,
  recordDualControl,
  transitionApplication,
} from "@payease/v1-domain";

describe("lender manual disbursement", () => {
  it("does not permit the same lender account to be maker and checker", () => {
    let item = createDraftApplication({
      id: "APP-2",
      applicantUserId: "telegram-2",
      preferredLanguage: "en",
      requestedAmount: { amountMinor: "25000", currency: "USD" },
      tenorDays: 30,
    });
    item = transitionApplication(
      item,
      "SUBMITTED",
      "telegram-2",
      "2026-08-12T08:00:00.000Z",
    );
    item = transitionApplication(
      item,
      "BROKER_REVIEW",
      "broker-1",
      "2026-08-12T08:01:00.000Z",
    );
    item = { ...item, status: "DISBURSEMENT_PENDING" as const };
    const decision = {
      decision: "APPROVED" as const,
      actorUserId: "finance-1",
      actorRole: "FINANCE",
      reasonCode: "CHECKED",
      occurredAt: "2026-08-12T08:02:00.000Z",
    };
    expect(() =>
      recordDualControl(
        item,
        "DISBURSEMENT_RELEASE",
        { ...decision, stage: "DISBURSEMENT_RELEASE" },
        { ...decision, stage: "DISBURSEMENT_CONFIRMATION" },
      ),
    ).toThrow(/distinct accounts/);
  });
});
