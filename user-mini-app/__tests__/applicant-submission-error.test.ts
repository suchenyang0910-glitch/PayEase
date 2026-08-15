import { describe, expect, it } from "vitest";
import { applicantSubmissionErrorMessage } from "../src/applicant-submission-error";

describe("applicant submission error messages", () => {
  it("explains an identity collision without exposing another application", () => {
    const message = applicantSubmissionErrorMessage(
      "IDENTITY_DOCUMENT_ACTIVE_APPLICATION_EXISTS",
      "en",
    );
    expect(message).toContain("identity document");
    expect(message).not.toMatch(/APP-|BROKER_REVIEW|Telegram/i);
  });

  it("provides the collision message in all supported languages", () => {
    for (const language of ["en", "zh-CN", "km"] as const) {
      expect(
        applicantSubmissionErrorMessage(
          "IDENTITY_DOCUMENT_ACTIVE_APPLICATION_EXISTS",
          language,
        ),
      ).toBeTruthy();
    }
  });

  it("does not replace unrelated submission errors", () => {
    expect(
      applicantSubmissionErrorMessage("SUBMISSION_FAILED", "en"),
    ).toBeUndefined();
  });
});
