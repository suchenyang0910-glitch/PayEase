import { z } from "zod";
import type { ApiVersion } from "../index";

export const QuoteV1ParamsSchema = z.object({
  employerTaxId: z.string().max(64),
  requestedAmountMinorKHR: z.string().regex(/^\d+$/),
  tenorDays: z.number().int().min(7).max(90),
  userId: z.string().uuid(),
});
export type QuoteV1Params = z.infer<typeof QuoteV1ParamsSchema>;

export const QuoteV1ResultSchema = z.object({
  quoteId: z.string().uuid(),
  principalMinorKHR: z.string().regex(/^\d+$/),
  totalRepayMinorKHR: z.string().regex(/^\d+$/),
  feeBreakdown: z.array(
    z.object({
      name: z.string().max(64),
      amountMinorKHR: z.string().regex(/^\d+$/),
    }),
  ),
  apyPctBps: z.number().int().min(0).max(10000),
  expiresAt: z.string().datetime({ offset: true }),
});
export type QuoteV1Result = z.infer<typeof QuoteV1ResultSchema>;

export const QUOTE_V1_VERSION: ApiVersion = { major: 1, minor: 0, patch: 0 };
