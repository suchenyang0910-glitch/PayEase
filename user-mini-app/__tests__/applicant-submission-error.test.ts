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

  it("maps phone verification and mismatch errors to actionable guidance", () => {
    expect(
      applicantSubmissionErrorMessage(
        "TELEGRAM_PHONE_VERIFICATION_REQUIRED",
        "zh-CN",
      ),
    ).toContain("Telegram 手机号验证");
    expect(
      applicantSubmissionErrorMessage("TELEGRAM_PHONE_MISMATCH", "zh-CN"),
    ).toContain("不一致");
  });

  it("maps profile and factory issues to concrete next steps", () => {
    expect(
      applicantSubmissionErrorMessage("PERSONAL_PROFILE_REQUIRED", "zh-CN"),
    ).toContain("完整填写基础资料");
    expect(
      applicantSubmissionErrorMessage("EMPLOYER_TENANT_UNAVAILABLE", "zh-CN"),
    ).toContain("所属工厂");
  });

  it("does not replace unrelated submission errors", () => {
    expect(
      applicantSubmissionErrorMessage("SUBMISSION_FAILED", "en"),
    ).toBeUndefined();
  });
});
