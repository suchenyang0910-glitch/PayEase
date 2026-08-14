import { describe, expect, it } from "vitest";
import { applicantSessionRecoveryMessage } from "../src/applicant-session-message.ts";

describe("applicant session recovery message", () => {
  it("explains how to recover from a disabled or expired Telegram Bot session", () => {
    expect(applicantSessionRecoveryMessage("en")).toContain("available");
    expect(applicantSessionRecoveryMessage("zh-CN")).toContain("重新打开");
    expect(applicantSessionRecoveryMessage("km")).toContain("Telegram");
  });
});
