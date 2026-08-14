import { describe, expect, it } from "vitest";
import { FINANCE_COPY, FINANCE_LANGUAGE_LABELS } from "../finance-copy";

describe("finance portal copy", () => {
  it("has complete non-empty copy and a language label for every supported language", () => {
    for (const [language, copy] of Object.entries(FINANCE_COPY)) {
      expect(
        FINANCE_LANGUAGE_LABELS[
          language as keyof typeof FINANCE_LANGUAGE_LABELS
        ],
      ).toBeTruthy();
      expect(copy.title).toBeTruthy();
      expect(copy.queueTitle).toBeTruthy();
      expect(copy.requestFailed).toBeTruthy();
      expect(copy.unavailableDescription).toBeTruthy();
    }
  });
});
