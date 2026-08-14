import { describe, expect, it } from "vitest";
import { BROKER_COPY, LANGUAGE_LABELS } from "../src/broker-copy";

describe("broker console language copy", () => {
  it("has complete operational copy for every supported language", () => {
    for (const language of ["zh-CN", "en", "km"] as const) {
      const copy = BROKER_COPY[language];
      expect(LANGUAGE_LABELS[language].trim()).not.toBe("");
      expect(copy.title.trim()).not.toBe("");
      expect(copy.signIn.trim()).not.toBe("");
      expect(copy.loginFailed.trim()).not.toBe("");
      expect(copy.sessionFailed.trim()).not.toBe("");
      expect(copy.reviewTitle.trim()).not.toBe("");
      expect(copy.directoryTitle.trim()).not.toBe("");
      expect(copy.profileAccessRecorded.trim()).not.toBe("");
      expect(copy.unavailableDescription.trim()).not.toBe("");
    }
  });
});
