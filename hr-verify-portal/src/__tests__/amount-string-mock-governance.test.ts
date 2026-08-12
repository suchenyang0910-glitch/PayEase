import { describe, it, expect } from "vitest";
import {
  MOCK_EMPLOYMENT_ROWS,
  MOCK_EMPLOYMENT_DETAILS,
} from "../mocks/hr-mocks.static";
import type {
  EmploymentRowMock,
  EmploymentDetailMock,
} from "../mocks/hr-mocks.static";
import { moneySum, formatHuman, moneySub } from "@payease/shared-money";

describe("HR mock data governance: zero real PII + amountMinor CI-10 + status coverage", () => {
  const REAL_LOOKS_LIKE_REAL_ID_RE = /^\d{9,13}$/;

  it("employmentRows amountMinor always string type (CI-10)", () => {
    expect(MOCK_EMPLOYMENT_ROWS).toHaveLength(6);
    for (const r of MOCK_EMPLOYMENT_ROWS) {
      expect(typeof (r as EmploymentRowMock).requestedAmountMinor).toBe(
        "string",
      );
      expect(/^\d+$/.test(r.requestedAmountMinor)).toBe(true);
    }
  });

  it("detail salaries always string minor and no-Number amountMinor", () => {
    expect(MOCK_EMPLOYMENT_DETAILS).toHaveLength(6);
    for (const d of MOCK_EMPLOYMENT_DETAILS) {
      expect(typeof d.monthlyBaseSalaryAmountMinor).toBe("string");
      expect(typeof d.requestedLoanAmountMinor).toBe("string");
      expect(/^\d+$/.test(d.monthlyBaseSalaryAmountMinor)).toBe(true);
      expect(/^\d+$/.test(d.requestedLoanAmountMinor)).toBe(true);
      const { currency } = { currency: d.monthlyBaseSalaryCurrency };
      const m = formatHuman({
        amountMinor: d.monthlyBaseSalaryAmountMinor,
        currency,
      });
      expect(typeof m).toBe("string");
      expect(m.length).toBeGreaterThan(1);
    }
  });

  it("all statuses must cover 5 HR verification statuses (PENDING / APPROVED / REJECTED / UNDER_REVIEW / EXPIRED)", () => {
    const s1 = new Set(MOCK_EMPLOYMENT_ROWS.map((r) => r.status));
    const s2 = new Set(
      MOCK_EMPLOYMENT_DETAILS.map((d) => d.verificationStatus),
    );
    const all = new Set([...s1, ...s2]);
    expect([...all].sort()).toEqual(
      [
        "APPROVED_HR",
        "EXPIRED",
        "PENDING_HR",
        "REJECTED_HR",
        "UNDER_REVIEW",
      ].sort(),
    );
  });

  it("nationalIdLast4 must NOT look like real Khmer IDs (no 9-13 digit strings)", () => {
    for (const d of MOCK_EMPLOYMENT_DETAILS) {
      expect(/^\d{4}$/.test(d.nationalIdLast4)).toBe(true);
      // S0.5 mock constraint: last 4 is always short numeric; the full ID is never in mocks
    }
  });

  it("synthetic names never look like real PayEase employerTaxId patterns (mock only KH-EM-000001...NN format)", () => {
    const ids = new Set([
      ...MOCK_EMPLOYMENT_ROWS.map((r) => r.employerTaxId),
      ...MOCK_EMPLOYMENT_DETAILS.map((d) => d.employerTaxId),
    ]);
    for (const id of ids) {
      expect(/^KH-EM-\d{6}$/.test(id)).toBe(true);
    }
  });

  it("sum of 2 KHR rows via shared-money moneySum precision (Big.js, string minor) no MAX_SAFE_INTEGER", () => {
    const rowA = MOCK_EMPLOYMENT_ROWS[0];
    const rowB = MOCK_EMPLOYMENT_ROWS[1];
    expect(rowA).toBeDefined();
    expect(rowB).toBeDefined();
    if (!rowA || !rowB) throw new Error("S0.5 HR mocks must provide two rows");
    const s = moneySum(
      [
        {
          amountMinor: rowA.requestedAmountMinor,
          currency: rowA.requestedCurrency as "KHR",
        },
        {
          amountMinor: rowB.requestedAmountMinor,
          currency: rowB.requestedCurrency as "KHR",
        },
      ],
      "KHR",
    );
    expect(s.amountMinor).toBe("400000000");
    const diff = moneySub(s, {
      amountMinor: rowA.requestedAmountMinor,
      currency: "KHR",
    });
    expect(diff.amountMinor).toBe(rowB.requestedAmountMinor);
  });
});
