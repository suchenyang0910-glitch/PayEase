import { z } from "zod";
import type { ApiVersion } from "../index";

export const SALARY_LOAN_V2_QUOTE_VERSION: ApiVersion = {
  major: 2,
  minor: 0,
  patch: 0,
};

export const SalaryLoanV2QuoteParamsSchema = z.object({
  brokerApplicationRef: z.string().min(1).max(128),
  requestedAmount: z.object({
    amountMinor: z.string().regex(/^\d+$/),
    currency: z.literal("USD"),
  }),
  tenorDays: z.union([z.literal(15), z.literal(30)]),
  workflowVersion: z.literal("SALARY_LOAN_V2"),
  productRuleVersion: z.string().min(3).max(64),
});
export type SalaryLoanV2QuoteParams = z.infer<
  typeof SalaryLoanV2QuoteParamsSchema
>;

export const SalaryLoanV2QuoteResultSchema = z.object({
  lenderCaseRef: z.string().min(1).max(128),
  quoteSnapshotVersion: z.literal("SALARY_LOAN_V2_QUOTE_SNAPSHOT"),
  principal: z.object({
    amountMinor: z.string().regex(/^\d+$/),
    currency: z.literal("USD"),
  }),
  actualDisbursementAmount: z.object({
    amountMinor: z.string().regex(/^\d+$/),
    currency: z.literal("USD"),
  }),
  lenderInterest: z.object({
    amountMinor: z.string().regex(/^\d+$/),
    currency: z.literal("USD"),
  }),
  totalRepaymentAmount: z.object({
    amountMinor: z.string().regex(/^\d+$/),
    currency: z.literal("USD"),
  }),
  brokerageRemunerationReceivable: z.object({
    amountMinor: z.string().regex(/^\d+$/),
    currency: z.literal("USD"),
  }),
  productRuleVersion: z.string().min(3).max(64),
  brokerageRemunerationRuleVersion: z.string().min(3).max(64),
  lenderInterestRuleVersion: z.string().min(3).max(64),
  generatedAt: z.string().datetime({ offset: true }),
});
export type SalaryLoanV2QuoteResult = z.infer<
  typeof SalaryLoanV2QuoteResultSchema
>;
