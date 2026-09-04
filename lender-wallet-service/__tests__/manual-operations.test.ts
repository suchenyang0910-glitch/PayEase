import { describe, expect, it } from "vitest";
import { assertManualOperationTransition } from "../src/manual-operations.js";

describe("controlled manual bank operation transitions", () => {
  it("requires distinct maker and checker before a bank action", () => {
    expect(
      assertManualOperationTransition({
        fromStatus: "REQUESTED",
        eventType: "MAKER_VERIFIED",
        actorRole: "MAKER",
        actorRef: "maker-1",
      }),
    ).toBe("MAKER_VERIFIED");
    expect(() =>
      assertManualOperationTransition({
        fromStatus: "MAKER_VERIFIED",
        eventType: "CHECKER_APPROVED",
        actorRole: "CHECKER",
        actorRef: "maker-1",
        makerRef: "maker-1",
      }),
    ).toThrow(/checker must differ/i);
  });

  it("requires a lender-held evidence reference before recording or settling a bank action", () => {
    expect(() =>
      assertManualOperationTransition({
        fromStatus: "CHECKER_APPROVED",
        eventType: "BANK_TRANSFER_RECORDED",
        actorRole: "MAKER",
        actorRef: "maker-1",
      }),
    ).toThrow(/evidence reference/i);
    expect(
      assertManualOperationTransition({
        fromStatus: "BANK_TRANSFER_RECORDED",
        eventType: "SETTLED",
        actorRole: "CHECKER",
        actorRef: "checker-2",
        evidenceReference: "vault://lender/manual-operation/receipt-001",
      }),
    ).toBe("SETTLED");
  });

  it("does not permit terminal or skipped transitions", () => {
    expect(() =>
      assertManualOperationTransition({
        fromStatus: "REQUESTED",
        eventType: "SETTLED",
        actorRole: "CHECKER",
        actorRef: "checker-2",
        evidenceReference: "vault://lender/manual-operation/receipt-001",
      }),
    ).toThrow(/Illegal manual operation transition/i);
    expect(() =>
      assertManualOperationTransition({
        fromStatus: "SETTLED",
        eventType: "CANCELLED",
        actorRole: "CHECKER",
        actorRef: "checker-2",
      }),
    ).toThrow(/Illegal manual operation transition/i);
  });
});
