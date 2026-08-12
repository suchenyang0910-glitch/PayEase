import { describe, it, expect } from "vitest";
import {
  MOCK_REPAYMENT_ROWS,
  MOCK_RECON_LINES,
} from "../mocks/fin-mocks.static";
import type {
  RepaymentRowMock,
  ReconLineMock,
} from "../mocks/fin-mocks.static";
import { moneySum, moneySub, formatHuman } from "@payease/shared-money";

describe("Finance mock data governance: zero real PII + amountMinor CI-10 + status enum coverage", () => {
  it("repayment rows always typeof string for all three amountMinor columns + /^\\d+$/ regex", () => {
    expect(MOCK_REPAYMENT_ROWS).toHaveLength(6);
    for (const r of MOCK_REPAYMENT_ROWS) {
      expect(typeof (r as RepaymentRowMock).principalDueAmountMinor).toBe(
        "string",
      );
      expect(typeof r.interestDueAmountMinor).toBe("string");
      expect(typeof r.totalDueAmountMinor).toBe("string");
      expect(/^\d+$/.test(r.principalDueAmountMinor)).toBe(true);
      expect(/^\d+$/.test(r.interestDueAmountMinor)).toBe(true);
      expect(/^\d+$/.test(r.totalDueAmountMinor)).toBe(true);
    }
  });

  it("recon lines expected/settled Money.amountMinor always string + no decimals", () => {
    expect(MOCK_RECON_LINES).toHaveLength(5);
    for (const l of MOCK_RECON_LINES) {
      expect(typeof l.expected.amountMinor).toBe("string");
      expect(typeof l.settled.amountMinor).toBe("string");
      expect(/^\d+$/.test(l.expected.amountMinor)).toBe(true);
      expect(/^\d+$/.test(l.settled.amountMinor)).toBe(true);
      expect(["KHR", "USD"] as const).toContain(l.expected.currency);
      expect(["KHR", "USD"] as const).toContain(l.settled.currency);
    }
  });

  it("repayment status enum covers 3 states: DUE / PAID / OVERDUE", () => {
    const states = new Set(MOCK_REPAYMENT_ROWS.map((r) => r.status));
    expect([...states].sort()).toEqual(["DUE", "OVERDUE", "PAID"].sort());
  });

  it("recon status enum covers all 5 states: MATCHED / DIFF_PENDING / DIFF_RESOLVED / UNMATCHED / POSTED_TO_GL", () => {
    const states = new Set(MOCK_RECON_LINES.map((l) => l.status));
    expect([...states].sort()).toEqual(
      [
        "MATCHED",
        "DIFF_PENDING",
        "DIFF_RESOLVED",
        "UNMATCHED",
        "POSTED_TO_GL",
      ].sort(),
    );
  });

  it("synthetic lender partner IDs are only LENDER-A / LENDER-B / LENDER-C (no real partner IDs)", () => {
    const set = new Set(MOCK_REPAYMENT_ROWS.map((r) => r.lenderPartnerId));
    expect([...set].sort()).toEqual(
      ["LENDER-A", "LENDER-B", "LENDER-C"].sort(),
    );
  });

  it("synthetic borrower names never look like real PII (placeholder combination only)", () => {
    const names = new Set(MOCK_REPAYMENT_ROWS.map((r) => r.borrowerName));
    const sorted = [...names].sort();
    expect(sorted).toEqual(
      [
        "Chanthou Meng",
        "Chea Srey Mom",
        "Horng Piseth",
        "Pisey Lim",
        "Sok Dara",
        "Srey Mao",
      ].sort(),
    );
  });

  it("rc-2 KHR mock: expected 137,500,000 vs settled 137,499,995 diff === 5 KHR via shared-money moneySub", () => {
    const rc2 = MOCK_RECON_LINES.find((l) => l.id === "rc-2")!;
    const diff = moneySub(rc2.expected, rc2.settled);
    expect(diff.currency).toBe("KHR");
    expect(diff.amountMinor).toBe("5");
    expect(formatHuman(diff)).toBe("៛5 KHR");
  });

  it("rp-1 and rp-2 KHR total sums: 137,500,000 + 80,250,000 === 217,750,000 via Big.js string precision", () => {
    const rp1 = MOCK_REPAYMENT_ROWS[0];
    const rp2 = MOCK_REPAYMENT_ROWS[1];
    expect(rp1).toBeDefined();
    expect(rp2).toBeDefined();
    if (!rp1 || !rp2)
      throw new Error(
        "S0.5 finance mocks must provide the first two repayment rows",
      );
    const s = moneySum(
      [
        { amountMinor: rp1.totalDueAmountMinor, currency: rp1.currency },
        { amountMinor: rp2.totalDueAmountMinor, currency: rp2.currency },
      ],
      "KHR",
    );
    expect(s.amountMinor).toBe("217750000");
  });
});
