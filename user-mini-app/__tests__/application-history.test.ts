import { describe, expect, it } from "vitest";
import {
  prependApplicationHistory,
  type ApplicationHistoryEntry,
} from "../src/application-history.js";

function entry(applicationNo: string): ApplicationHistoryEntry {
  return {
    applicationNo,
    status: "BROKER_REVIEW",
    requestedAmountMinor: "5000",
    currency: "USD",
    tenorDays: 30,
    approvedAmountMinor: null,
    rejectionConditionResolved: false,
    supplementRequested: false,
    createdAt: "2026-08-14T00:00:00.000Z",
  };
}

describe("applicant history", () => {
  it("puts a newly submitted application first", () => {
    expect(
      prependApplicationHistory([entry("APP-OLD")], entry("APP-NEW")),
    ).toEqual([entry("APP-NEW"), entry("APP-OLD")]);
  });

  it("does not duplicate an application when its summary is refreshed", () => {
    expect(
      prependApplicationHistory([entry("APP-ONE")], entry("APP-ONE")),
    ).toEqual([entry("APP-ONE")]);
  });
});
