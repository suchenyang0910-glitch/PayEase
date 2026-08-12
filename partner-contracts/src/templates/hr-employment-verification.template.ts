import { z } from "zod";
import type { ApiVersion } from "../index";

export const HR_EMPLOYMENT_VERIFICATION_V1_VERSION: ApiVersion = {
  major: 1,
  minor: 0,
  patch: 0,
};

const EMPLOYMENT_STATUS_ENUM = [
  "PENDING_HR",
  "APPROVED_HR",
  "REJECTED_HR",
  "UNDER_REVIEW",
  "EXPIRED",
] as const;

const CURRENCY_ENUM = ["KHR", "USD"] as const;

export const HrEmploymentVerificationV1ParamsSchema = z.object({
  verificationId: z.string().uuid(),
  employeeId: z.string().max(128),
  nationalIdLast4: z.string().regex(/^\d{4}$/),
  employerTaxId: z.string().max(64),
  requestedLoanAmountMinor: z.string().regex(/^\d+$/),
  requestedLoanCurrency: z.enum(CURRENCY_ENUM),
  tenorDays: z.number().int().min(1).max(365),
  requestedAt: z.string().datetime({ offset: true }),
});
export type HrEmploymentVerificationV1Params = z.infer<
  typeof HrEmploymentVerificationV1ParamsSchema
>;

export const HrEmploymentVerificationV1ResultSchema = z.object({
  verificationId: z.string().uuid(),
  employmentStatus: z.enum(EMPLOYMENT_STATUS_ENUM),
  employeeName: z.string().max(128),
  department: z.string().max(128).optional(),
  hiredAt: z.string().date().optional(),
  monthlyBaseSalaryAmountMinor: z.string().regex(/^\d+$/),
  monthlyBaseSalaryCurrency: z.enum(CURRENCY_ENUM),
  payrollDeductionAuthorized: z.boolean(),
  verifiedByHrUserId: z.string().max(128).optional(),
  verifiedAt: z.string().datetime({ offset: true }).optional(),
  rejectionReasonCode: z.string().max(64).optional(),
  rejectionNote: z.string().max(512).optional(),
});
export type HrEmploymentVerificationV1Result = z.infer<
  typeof HrEmploymentVerificationV1ResultSchema
>;

export const HR_EMPLOYMENT_VERIFICATION_V1_NOTES = Object.freeze({
  stub: "S0.5 Zod stub only; do NOT use as production contract. Upgrade to partner-contracts v1 real schema only when S0.2 isolation infrastructure is signed off and S1.0 MVP business rules are frozen.",
  amountMinorRule:
    "All monetary fields are string integer minor units (KHR riel = 1, USD = cents); never a JS number, to avoid MAX_SAFE_INTEGER precision loss on KHR payroll values.",
});
