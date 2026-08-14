import { describe, expect, it } from "vitest";
import { parseApplicantServiceCaseList } from "../src/service-case-list.ts";

describe("applicant service-case list", () => {
  it("accepts applicant-safe metadata only", () => {
    expect(
      parseApplicantServiceCaseList({
        cases: [
          {
            caseNo: "CASE-20260815-TEST0001",
            caseType: "COMPLAINT",
            status: "RESOLVED",
            createdAt: "2026-08-15T00:00:00.000Z",
            updatedAt: "2026-08-16T00:00:00.000Z",
          },
        ],
      }),
    ).toMatchObject([
      {
        caseNo: "CASE-20260815-TEST0001",
        caseType: "COMPLAINT",
        status: "RESOLVED",
      },
    ]);
  });

  it("fails closed for malformed response data", () => {
    expect(parseApplicantServiceCaseList({ cases: [{}] })).toBeUndefined();
    expect(
      parseApplicantServiceCaseList({
        cases: [
          {
            caseNo: "CASE-1",
            caseType: "COMPLAINT",
            status: "INTERNAL_REVIEW",
            createdAt: "now",
            updatedAt: "now",
          },
        ],
      }),
    ).toBeUndefined();
  });
});
