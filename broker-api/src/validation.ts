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

const approvalDecisionSchema = z.object({
  actorUserRef: z.string().min(3).max(128),
  actorRole: z.string().min(3).max(64),
  decision: z.enum(["APPROVED", "REJECTED", "RETURNED"]),
  reasonCode: z.string().min(1).max(64),
});

export const employerVerificationSchema = approvalDecisionSchema.extend({
  actorRole: z.enum(["EMPLOYER_HR", "EMPLOYER_FINANCE"]),
});

export const lenderInitialReviewSchema = approvalDecisionSchema.extend({
  actorRole: z.literal("LENDER_CREDIT_OFFICER"),
});

export const lenderFinalReviewSchema = approvalDecisionSchema.extend({
  actorRole: z.literal("LENDER_CREDIT_REVIEWER"),
});

export const contractConfirmationSchema = z.object({
  actorUserRef: z.string().min(3).max(128),
  actorRole: z.literal("LENDER_CONTRACT_OFFICER"),
  evidenceReference: z.string().min(3).max(160),
});

const dualControlActorSchema = z.object({
  actorUserRef: z.string().min(3).max(128),
  actorRole: z.string().min(3).max(64),
  reasonCode: z.string().min(1).max(64),
});

export const disbursementDualControlSchema = z.object({
  release: dualControlActorSchema.extend({
    actorRole: z.literal("LENDER_DISBURSEMENT_MAKER"),
  }),
  confirmation: dualControlActorSchema.extend({
    actorRole: z.literal("LENDER_DISBURSEMENT_CHECKER"),
  }),
  evidenceReference: z.string().min(3).max(160),
});

export const repaymentDualControlSchema = z.object({
  writeOff: dualControlActorSchema.extend({
    actorRole: z.literal("LENDER_REPAYMENT_MAKER"),
  }),
  confirmation: dualControlActorSchema.extend({
    actorRole: z.literal("LENDER_REPAYMENT_CHECKER"),
  }),
  evidenceReference: z.string().min(3).max(160),
});

export const lifecycleActorSchema = z.object({
  actorUserRef: z.string().min(3).max(128),
  actorRole: z.string().min(3).max(64),
  reasonCode: z.string().min(1).max(64),
});
