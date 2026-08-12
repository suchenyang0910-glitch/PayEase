import { describe, expect, it } from "vitest";
import {
  createDraftApplication,
  recordApproval,
  transitionApplication,
} from "@payease/v1-domain";

describe("broker operations workflow", () => {
  it("sends a document-complete application to employer verification", () => {
    let item = createDraftApplication({
      id: "APP-1",
      applicantUserId: "telegram-1",
      preferredLanguage: "km",
      requestedAmount: { amountMinor: "1000", currency: "USD" },
      tenorDays: 7,
    });
    item = transitionApplication(
      item,
      "SUBMITTED",
      "telegram-1",
      "2026-08-12T08:00:00.000Z",
    );
    item = transitionApplication(
      item,
      "BROKER_REVIEW",
      "broker-1",
      "2026-08-12T08:01:00.000Z",
    );
    item = recordApproval(item, {
      stage: "BROKER_REVIEW",
      decision: "APPROVED",
      actorUserId: "broker-1",
      actorRole: "BROKER_REVIEWER",
      reasonCode: "DOCUMENTS_COMPLETE",
      occurredAt: "2026-08-12T08:02:00.000Z",
    });
    expect(item.status).toBe("EMPLOYER_VERIFICATION");
  });
});
