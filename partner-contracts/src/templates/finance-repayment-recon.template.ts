import { z } from "zod";
import type { ApiVersion } from "../index";

export const FINANCE_REPAYMENT_RECON_V1_VERSION: ApiVersion = {
  major: 1,
  minor: 0,
  patch: 0,
};

const RECON_STATUS_ENUM = [
  "MATCHED",
  "DIFF_PENDING",
  "DIFF_RESOLVED",
  "UNMATCHED",
  "POSTED_TO_GL",
] as const;

const CURRENCY_ENUM = ["KHR", "USD"] as const;

export const FinanceRepaymentReconLineV1Schema = z.object({
  reconLineId: z.string().uuid(),
  date: z.string().date(),
  description: z.string().max(512),
  applicationId: z.string().max(64).optional(),
  lenderPartnerId: z.string().max(64).optional(),
  expectedAmountMinor: z.string().regex(/^\d+$/),
  expectedCurrency: z.enum(CURRENCY_ENUM),
  settledAmountMinor: z.string().regex(/^\d+$/),
  settledCurrency: z.enum(CURRENCY_ENUM),
  differenceAmountMinor: z.string().regex(/^-?\d+$/),
  differenceCurrency: z.enum(CURRENCY_ENUM),
  settlementReference: z.string().max(256).optional(),
  settlementChannel: z.enum(["BANK_ABA", "BANK_WING", "BANK_ACLEDA", "STRIPE", "PAYWAY", "INTERNAL_NETTING", "OTHER"]).optional(),
  reconStatus: z.enum(RECON_STATUS_ENUM),
  reconNotes: z.string().max(512).optional(),
});
export type FinanceRepaymentReconLineV1 = z.infer<
  typeof FinanceRepaymentReconLineV1Schema
>;

export const FinanceRepaymentReconV1ParamsSchema = z.object({
  reconBatchId: z.string().uuid(),
  windowStartInclusive: z.string().date(),
  windowEndInclusive: z.string().date(),
  currency: z.enum(CURRENCY_ENUM),
  runAt: z.string().datetime({ offset: true }),
  runByFinanceUserId: z.string().max(128),
});
export type FinanceRepaymentReconV1Params = z.infer<
  typeof FinanceRepaymentReconV1ParamsSchema
>;

export const FinanceRepaymentReconV1ResultSchema = z.object({
  reconBatchId: z.string().uuid(),
  totalLines: z.number().int().nonnegative(),
  matchedLines: z.number().int().nonnegative(),
  diffLines: z.number().int().nonnegative(),
  unmatchedLines: z.number().int().nonnegative(),
  totalExpectedAmountMinor: z.string().regex(/^\d+$/),
  totalExpectedCurrency: z.enum(CURRENCY_ENUM),
  totalSettledAmountMinor: z.string().regex(/^\d+$/),
  totalSettledCurrency: z.enum(CURRENCY_ENUM),
  netDifferenceAmountMinor: z.string().regex(/^-?\d+$/),
  netDifferenceCurrency: z.enum(CURRENCY_ENUM),
  lines: z.array(FinanceRepaymentReconLineV1Schema),
});
export type FinanceRepaymentReconV1Result = z.infer<
  typeof FinanceRepaymentReconV1ResultSchema
>;

export const FINANCE_REPAYMENT_RECON_V1_NOTES = Object.freeze({
  stub: "S0.5 Zod stub only; not a production contract. Real bank/ERP/GL/Stripe/PayWay integration must wait for S0.2 isolation infrastructure and S1.0 MVP sign-off.",
  postingRule: "All reconciliation postings (to GL, to lender settlement accounts, to KHR VAT e-invoice) are deferred to S1.0 backend; this schema describes data shape only, not execution.",
  amountMinorRule: "Every monetary column is a string integer minor unit. KHR = 1 riel; USD = 1 cent; no decimals; no JS number.",
});
