import { describe, expect, it } from "vitest";
import { IDENTITY_RECORD_COPY } from "../identity-record-copy";

describe("factory identity-record verification copy", () => {
  it("has a non-empty label, validation message, and action in every language", () => {
    for (const language of ["zh-CN", "en", "km"] as const) {
      const copy = IDENTITY_RECORD_COPY[language];
      expect(copy.label.trim()).not.toBe("");
      expect(copy.required.trim()).not.toBe("");
      expect(copy.action.trim()).not.toBe("");
    }
  });
});
