import { describe, expect, it } from "vitest";
import { FINANCE_COPY } from "../finance-copy";
import { financeReconciliationNotice } from "../finance-reconciliation-action";

describe("finance reconciliation result", () => {
  it("does not report a successful record after a network failure", async () => {
    const result = await financeReconciliationNotice(
      async () => Promise.reject(new Error("offline")),
      FINANCE_COPY.en,
    );
    expect(result.succeeded).toBe(false);
    expect(result.notice).toContain(FINANCE_COPY.en.requestFailed);
    expect(result.notice).not.toContain(`${FINANCE_COPY.en.recorded}:`);
  });
});
