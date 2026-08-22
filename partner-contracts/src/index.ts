import { z } from "zod";

export const ApiVersionSchema = z.object({
  major: z.number().int().nonnegative(),
  minor: z.number().int().nonnegative(),
  patch: z.number().int().nonnegative(),
});
export type ApiVersion = z.infer<typeof ApiVersionSchema>;

export const VersionedEnvelope = <
  TParams extends z.ZodTypeAny,
  TResult extends z.ZodTypeAny,
>(
  paramsSchema: TParams,
  resultSchema: TResult,
) =>
  z.object({
    contractVersion: ApiVersionSchema,
    idempotencyKey: z.string().min(8).max(128),
    createdAt: z.string().datetime({ offset: true }),
    params: paramsSchema,
    result: resultSchema.optional(),
    error: z
      .object({
        code: z.string().max(64),
        message: z.string().max(512),
        retryable: z.boolean(),
      })
      .optional(),
  });

export type VersionedEnvelope<P, R> = {
  contractVersion: ApiVersion;
  idempotencyKey: string;
  createdAt: string;
  params: P;
  result?: R;
  error?: { code: string; message: string; retryable: boolean };
};

export const assertContractVersion = (
  received: ApiVersion,
  expected: { major: number; maxMinor: number },
): void => {
  if (received.major !== expected.major) {
    throw new TypeError(
      `Cross-domain contract major mismatch: expected major ${expected.major}, received ${received.major}. This is a breaking change.`,
    );
  }
  if (received.minor > expected.maxMinor) {
    throw new TypeError(
      `Cross-domain contract minor too new: expected <= ${expected.maxMinor}, received ${received.minor}. Roll back client or upgrade server.`,
    );
  }
};

export const CONTRACT_COMPAT_NOTES = Object.freeze({
  v1: "broker ↔ lender / employer v1 契约：向后兼容的新增字段须 optional；删除/改名/必填升级须 bump major；跨域一律以 Zod 在入口 + 出口双重 parse。",
} as const);

export {
  QuoteV1ParamsSchema,
  QuoteV1ResultSchema,
  QUOTE_V1_VERSION,
  type QuoteV1Params,
  type QuoteV1Result,
} from "./templates/quote-v1.template";

export {
  HrEmploymentVerificationV1ParamsSchema,
  HrEmploymentVerificationV1ResultSchema,
  HR_EMPLOYMENT_VERIFICATION_V1_VERSION,
  HR_EMPLOYMENT_VERIFICATION_V1_NOTES,
  type HrEmploymentVerificationV1Params,
  type HrEmploymentVerificationV1Result,
} from "./templates/hr-employment-verification.template";

export {
  FinanceRepaymentReconV1ParamsSchema,
  FinanceRepaymentReconV1ResultSchema,
  FinanceRepaymentReconLineV1Schema,
  FINANCE_REPAYMENT_RECON_V1_VERSION,
  FINANCE_REPAYMENT_RECON_V1_NOTES,
  type FinanceRepaymentReconV1Params,
  type FinanceRepaymentReconV1Result,
  type FinanceRepaymentReconLineV1,
} from "./templates/finance-repayment-recon.template";

export {
  SALARY_LOAN_V2_QUOTE_VERSION,
  SalaryLoanV2QuoteParamsSchema,
  SalaryLoanV2QuoteResultSchema,
  type SalaryLoanV2QuoteParams,
  type SalaryLoanV2QuoteResult,
} from "./templates/salary-loan-v2-quote.template";
