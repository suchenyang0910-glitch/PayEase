import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  HrEmploymentVerificationV1ParamsSchema,
  HrEmploymentVerificationV1ResultSchema,
} from "../templates/hr-employment-verification.template";
import {
  FinanceRepaymentReconLineV1Schema,
  FinanceRepaymentReconV1ResultSchema,
} from "../templates/finance-repayment-recon.template";

function buildValidHrParams(
  overrides: Partial<{ requestedLoanAmountMinor: string | number }> = {},
) {
  return {
    verificationId: "00000000-0000-4000-8000-000000000001",
    employeeId: "ev-EMP-000001",
    nationalIdLast4: "0001",
    employerTaxId: "KH-EM-000001",
    requestedLoanAmountMinor: "50000000",
    requestedLoanCurrency: "KHR" as const,
    tenorDays: 90,
    requestedAt: "2026-08-01T00:00:00+07:00",
    ...overrides,
  };
}

function buildValidHrResult(
  overrides: Partial<{ monthlyBaseSalaryAmountMinor: string | number }> = {},
) {
  return {
    verificationId: "00000000-0000-4000-8000-000000000001",
    employmentStatus: "APPROVED_HR" as const,
    employeeName: "Sok Dara",
    department: "Operations",
    hiredAt: "2024-01-15",
    monthlyBaseSalaryAmountMinor: "80000000",
    monthlyBaseSalaryCurrency: "KHR" as const,
    payrollDeductionAuthorized: true,
    verifiedByHrUserId: "hr-user-001",
    verifiedAt: "2026-08-02T10:00:00+07:00",
    ...overrides,
  };
}

function buildValidReconLine(
  overrides: Partial<{
    expectedAmountMinor: string | number;
    settledAmountMinor: string | number;
    differenceAmountMinor: string | number;
  }> = {},
) {
  return {
    reconLineId: "00000000-0000-4000-8000-000000000001",
    date: "2026-08-05",
    description: "Repayment rc-1 LENDER-A",
    applicationId: "app-000001",
    lenderPartnerId: "LENDER-A",
    expectedAmountMinor: "137500000",
    expectedCurrency: "KHR" as const,
    settledAmountMinor: "137500000",
    settledCurrency: "KHR" as const,
    differenceAmountMinor: "0",
    differenceCurrency: "KHR" as const,
    settlementReference: "ABA-TRF-20260805-0001",
    settlementChannel: "BANK_ABA" as const,
    reconStatus: "MATCHED" as const,
    reconNotes: "auto matched",
    ...overrides,
  };
}

function buildValidReconResult(
  overrides: Partial<{
    totalExpectedAmountMinor: string | number;
    totalSettledAmountMinor: string | number;
    netDifferenceAmountMinor: string | number;
  }> = {},
) {
  const line = FinanceRepaymentReconLineV1Schema.parse(buildValidReconLine());
  return {
    reconBatchId: "00000000-0000-4000-8000-000000000099",
    totalLines: 1,
    matchedLines: 1,
    diffLines: 0,
    unmatchedLines: 0,
    totalExpectedAmountMinor: line.expectedAmountMinor,
    totalExpectedCurrency: line.expectedCurrency,
    totalSettledAmountMinor: line.settledAmountMinor,
    totalSettledCurrency: line.settledCurrency,
    netDifferenceAmountMinor: line.differenceAmountMinor,
    netDifferenceCurrency: line.differenceCurrency,
    lines: [line],
    ...overrides,
  };
}

describe("CI-10: partner-contracts Zod schemas must reject JS numbers for any amountMinor field", () => {
  describe("HrEmploymentVerificationV1ParamsSchema.requestedLoanAmountMinor", () => {
    it("accepts numeric string (CI-10 compliant)", () => {
      const ok =
        HrEmploymentVerificationV1ParamsSchema.safeParse(buildValidHrParams());
      expect(ok.success).toBe(true);
      if (ok.success) expect(ok.data.requestedLoanAmountMinor).toBe("50000000");
    });
    it("accepts numeric string for small zero/one values", () => {
      const z = HrEmploymentVerificationV1ParamsSchema.safeParse(
        buildValidHrParams({ requestedLoanAmountMinor: "0" }),
      );
      expect(z.success).toBe(true);
      const one = HrEmploymentVerificationV1ParamsSchema.safeParse(
        buildValidHrParams({ requestedLoanAmountMinor: "1" }),
      );
      expect(one.success).toBe(true);
    });
    it("REJECTS JS number (literal integer) — must not silently coerce", () => {
      const fail = HrEmploymentVerificationV1ParamsSchema.safeParse(
        buildValidHrParams({
          requestedLoanAmountMinor: 50000000 as unknown as string,
        }),
      );
      expect(fail.success).toBe(false);
      if (!fail.success) {
        const pathHits = fail.error.issues.some(
          (i) => i.path.join(".") === "requestedLoanAmountMinor",
        );
        expect(pathHits).toBe(true);
      }
    });
    it("REJECTS decimal string or non-digit string", () => {
      const dec = HrEmploymentVerificationV1ParamsSchema.safeParse(
        buildValidHrParams({ requestedLoanAmountMinor: "500000.00" }),
      );
      expect(dec.success).toBe(false);
      const letters = HrEmploymentVerificationV1ParamsSchema.safeParse(
        buildValidHrParams({ requestedLoanAmountMinor: "abc" }),
      );
      expect(letters.success).toBe(false);
    });
  });

  describe("HrEmploymentVerificationV1ResultSchema.monthlyBaseSalaryAmountMinor", () => {
    it("accepts numeric string", () => {
      const ok =
        HrEmploymentVerificationV1ResultSchema.safeParse(buildValidHrResult());
      expect(ok.success).toBe(true);
    });
    it("REJECTS JS number", () => {
      const fail = HrEmploymentVerificationV1ResultSchema.safeParse(
        buildValidHrResult({
          monthlyBaseSalaryAmountMinor: 80000000 as unknown as string,
        }),
      );
      expect(fail.success).toBe(false);
      if (!fail.success) {
        const hit = fail.error.issues.some(
          (i) => i.path.join(".") === "monthlyBaseSalaryAmountMinor",
        );
        expect(hit).toBe(true);
      }
    });
  });

  describe("FinanceRepaymentReconLineV1Schema — three amountMinor columns", () => {
    it("accepts numeric strings for all three columns (expected/settled/difference)", () => {
      const ok = FinanceRepaymentReconLineV1Schema.safeParse(
        buildValidReconLine(),
      );
      expect(ok.success).toBe(true);
      if (ok.success) {
        expect(typeof ok.data.expectedAmountMinor).toBe("string");
        expect(typeof ok.data.settledAmountMinor).toBe("string");
        expect(typeof ok.data.differenceAmountMinor).toBe("string");
        expect(/^\d+$/.test(ok.data.expectedAmountMinor)).toBe(true);
        expect(/^-?\d+$/.test(ok.data.differenceAmountMinor)).toBe(true);
      }
    });
    it("REJECTS JS number in expectedAmountMinor", () => {
      const fail = FinanceRepaymentReconLineV1Schema.safeParse(
        buildValidReconLine({
          expectedAmountMinor: 137500000 as unknown as string,
        }),
      );
      expect(fail.success).toBe(false);
    });
    it("REJECTS JS number in settledAmountMinor", () => {
      const fail = FinanceRepaymentReconLineV1Schema.safeParse(
        buildValidReconLine({
          settledAmountMinor: 137499995 as unknown as string,
        }),
      );
      expect(fail.success).toBe(false);
    });
    it("REJECTS JS number in differenceAmountMinor (including negative signed)", () => {
      const fail = FinanceRepaymentReconLineV1Schema.safeParse(
        buildValidReconLine({ differenceAmountMinor: -5 as unknown as string }),
      );
      expect(fail.success).toBe(false);
    });
    it("accepts negative-signed string only in differenceAmountMinor", () => {
      const ok = FinanceRepaymentReconLineV1Schema.safeParse(
        buildValidReconLine({ differenceAmountMinor: "-5" }),
      );
      expect(ok.success).toBe(true);
    });
  });

  describe("FinanceRepaymentReconV1ResultSchema batch aggregates", () => {
    it("accepts numeric strings for all aggregate amountMinor columns", () => {
      const ok = FinanceRepaymentReconV1ResultSchema.safeParse(
        buildValidReconResult(),
      );
      expect(ok.success).toBe(true);
    });
    it("REJECTS JS number in totalExpectedAmountMinor", () => {
      const fail = FinanceRepaymentReconV1ResultSchema.safeParse(
        buildValidReconResult({
          totalExpectedAmountMinor: 137500000 as unknown as string,
        }),
      );
      expect(fail.success).toBe(false);
    });
    it("REJECTS JS number in netDifferenceAmountMinor", () => {
      const fail = FinanceRepaymentReconV1ResultSchema.safeParse(
        buildValidReconResult({
          netDifferenceAmountMinor: 5 as unknown as string,
        }),
      );
      expect(fail.success).toBe(false);
    });
  });

  describe("Zod safety: never add coerce/transform to amountMinor", () => {
    it("schema for amountMinor must be plain z.string().regex, not z.coerce.number or transform", () => {
      const schemasToAudit: Array<[string, z.ZodTypeAny, Array<string>]> = [
        [
          "HrEmploymentVerificationV1Params.requestedLoanAmountMinor",
          HrEmploymentVerificationV1ParamsSchema,
          ["requestedLoanAmountMinor"],
        ],
        [
          "HrEmploymentVerificationV1Result.monthlyBaseSalaryAmountMinor",
          HrEmploymentVerificationV1ResultSchema,
          ["monthlyBaseSalaryAmountMinor"],
        ],
        [
          "FinanceRepaymentReconLine.expectedAmountMinor",
          FinanceRepaymentReconLineV1Schema,
          ["expectedAmountMinor"],
        ],
        [
          "FinanceRepaymentReconLine.settledAmountMinor",
          FinanceRepaymentReconLineV1Schema,
          ["settledAmountMinor"],
        ],
        [
          "FinanceRepaymentReconLine.differenceAmountMinor",
          FinanceRepaymentReconLineV1Schema,
          ["differenceAmountMinor"],
        ],
      ];
      for (const [label, root, fieldPath] of schemasToAudit) {
        let node: z.ZodTypeAny = root;
        if (root instanceof z.ZodObject) {
          for (const k of fieldPath) {
            const field = (
              root.shape as Record<string, z.ZodTypeAny | undefined>
            )[k];
            if (!field) throw new Error(`${label}: missing schema field ${k}`);
            node = field;
          }
        }
        const nodeType = node._def.typeName;
        expect(nodeType).not.toBe("ZodNumber");
        expect(nodeType).not.toBe("ZodEffects");
        expect(nodeType).toBe("ZodString");
      }
    });
  });
});
