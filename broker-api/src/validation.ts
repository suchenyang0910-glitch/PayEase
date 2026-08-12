import { z } from "zod";

export const languageSchema = z.enum(["km", "en", "zh-CN"]);

export const createApplicationSchema = z.object({
  telegramUserRef: z.string().min(3).max(128),
  preferredLanguage: languageSchema,
  requestedAmount: z.object({
    amountMinor: z.string().regex(/^\d+$/),
    currency: z.literal("USD"),
  }),
  tenorDays: z.number().int().min(7).max(180),
});

export const brokerReviewSchema = z.object({
  actorUserRef: z.string().min(3).max(128),
  actorRole: z.literal("BROKER_OFFICER"),
  decision: z.enum(["APPROVED", "REJECTED", "RETURNED"]),
  reasonCode: z.string().min(1).max(64),
});
