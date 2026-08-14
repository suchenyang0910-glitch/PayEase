import { describe, expect, it } from "vitest";
import {
  parseBrokerSupplementResponseDetail,
  parseBrokerSupplementResponseList,
} from "../src/broker-supplement-response";

describe("broker supplement response parsing", () => {
  it("accepts metadata lists without a plaintext response", () => {
    expect(
      parseBrokerSupplementResponseList({
        responses: [
          {
            responseNo: "SUP-20260815-ABCD1234",
            applicantLanguage: "km",
            submittedAt: "2026-08-15T00:00:00.000Z",
          },
        ],
      }),
    ).toEqual([
      {
        responseNo: "SUP-20260815-ABCD1234",
        applicantLanguage: "km",
        submittedAt: "2026-08-15T00:00:00.000Z",
      },
    ]);
  });

  it("rejects malformed metadata and incomplete plaintext details", () => {
    expect(
      parseBrokerSupplementResponseList({ responses: [{}] }),
    ).toBeUndefined();
    expect(
      parseBrokerSupplementResponseDetail({
        responseNo: "SUP-20260815-ABCD1234",
        applicationNo: "APP-1",
      }),
    ).toBeUndefined();
  });
});
