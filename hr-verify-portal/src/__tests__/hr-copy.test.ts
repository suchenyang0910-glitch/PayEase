import { describe, expect, it } from "vitest";
import { HR_COPY, HR_LANGUAGE_LABELS } from "../hr-copy";

describe("HR portal language copy", () => {
  it("has complete verification copy for every supported language", () => {
    for (const language of ["zh-CN", "en", "km"] as const) {
      const copy = HR_COPY[language];
      expect(HR_LANGUAGE_LABELS[language].trim()).not.toBe("");
      expect(copy.title.trim()).not.toBe("");
      expect(copy.confirmEmployment.trim()).not.toBe("");
      expect(copy.requestFailed.trim()).not.toBe("");
      expect(copy.sessionExpired.trim()).not.toBe("");
      expect(copy.unavailableDescription.trim()).not.toBe("");
    }
  });
});
