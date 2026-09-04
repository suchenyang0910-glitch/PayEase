import { describe, expect, it } from "vitest";
import {
  assertFundsOrderTransition,
  FUNDS_ORDER_EVENT_TO_STATUS,
  POST_CREATE_FUNDS_ORDER_EVENTS,
} from "../src/funds-orders.js";

describe("funds order transitions", () => {
  it("maps terminal events to the expected projection statuses", () => {
    expect(FUNDS_ORDER_EVENT_TO_STATUS.AUTHORIZED).toBe("AUTHORIZED");
    expect(FUNDS_ORDER_EVENT_TO_STATUS.PROCESSING).toBe("PROCESSING");
    expect(FUNDS_ORDER_EVENT_TO_STATUS.SETTLED).toBe("SETTLED");
    expect(POST_CREATE_FUNDS_ORDER_EVENTS).toContain("AUTHORIZATION_REQUESTED");
  });

  it("allows only legal forward transitions", () => {
    expect(
      assertFundsOrderTransition({
        fromStatus: "PENDING_AUTH",
        eventType: "AUTHORIZATION_REQUESTED",
      }),
    ).toBe("PENDING_AUTH");
    expect(
      assertFundsOrderTransition({
        fromStatus: "PENDING_AUTH",
        eventType: "AUTHORIZED",
      }),
    ).toBe("AUTHORIZED");
    expect(
      assertFundsOrderTransition({
        fromStatus: "AUTHORIZED",
        eventType: "PROCESSING",
      }),
    ).toBe("PROCESSING");
    expect(
      assertFundsOrderTransition({
        fromStatus: "PROCESSING",
        eventType: "SETTLED",
      }),
    ).toBe("SETTLED");
  });

  it("rejects projection changes that skip the event transition contract", () => {
    expect(() =>
      assertFundsOrderTransition({
        fromStatus: "PENDING_AUTH",
        eventType: "SETTLED",
      }),
    ).toThrow(/Illegal funds order transition/i);
    expect(() =>
      assertFundsOrderTransition({
        fromStatus: "AUTHORIZED",
        eventType: "AUTHORIZED",
        nextStatus: "SETTLED",
      }),
    ).toThrow(/cannot target/i);
    expect(() =>
      assertFundsOrderTransition({
        fromStatus: "PENDING_AUTH",
        eventType: "AUTHORIZATION_REQUESTED",
        nextStatus: "AUTHORIZED",
      }),
    ).toThrow(/must preserve/i);
    expect(() =>
      assertFundsOrderTransition({
        fromStatus: "AUTHORIZED",
        eventType: "AUTHORIZATION_REQUESTED",
      }),
    ).toThrow(/only allowed from PENDING_AUTH/i);
    expect(() =>
      assertFundsOrderTransition({
        fromStatus: "PENDING_AUTH",
        eventType: "ORDER_CREATED",
        nextStatus: "AUTHORIZED",
      }),
    ).toThrow(/only allowed during creation/i);
  });
});
