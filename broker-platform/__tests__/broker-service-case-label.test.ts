import { describe, expect, it } from "vitest";
import {
  brokerServiceCaseStatusLabel,
  brokerServiceCaseTypeLabel,
} from "../src/broker-service-case-label";

describe("broker service-case labels", () => {
  it("localizes types and status for every supported operator language", () => {
    expect(brokerServiceCaseTypeLabel("COMPLAINT", "en")).toBe("Complaint");
    expect(brokerServiceCaseTypeLabel("COMPLAINT", "zh-CN")).toBe("投诉");
    expect(brokerServiceCaseTypeLabel("COMPLAINT", "km")).toBe("បណ្តឹងតវ៉ា");
    expect(brokerServiceCaseStatusLabel("ACKNOWLEDGED", "en")).toBe(
      "Acknowledged",
    );
    expect(brokerServiceCaseStatusLabel("ACKNOWLEDGED", "zh-CN")).toBe(
      "处理中",
    );
    expect(brokerServiceCaseStatusLabel("ACKNOWLEDGED", "km")).toBe(
      "បានទទួលយក",
    );
  });

  it("keeps unknown server values visible for operator diagnosis", () => {
    expect(brokerServiceCaseTypeLabel("FUTURE_TYPE", "en")).toBe("FUTURE_TYPE");
    expect(brokerServiceCaseStatusLabel("FUTURE_STATUS", "en")).toBe(
      "FUTURE_STATUS",
    );
  });
});
