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
  decision: z.enum(["APPROVED", "REJECTED", "RETURNED"]),
  reasonCode: z.string().min(1).max(64),
});

const approvalDecisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED", "RETURNED"]),
  reasonCode: z.string().min(1).max(64),
});

export const employerVerificationSchema = approvalDecisionSchema;
export const lenderInitialReviewSchema = approvalDecisionSchema;
export const lenderFinalReviewSchema = approvalDecisionSchema
  .extend({ approvedAmountMinor: z.string().regex(/^\d+$/).optional() })
  .superRefine((value, context) => {
    if (value.decision === "APPROVED" && !value.approvedAmountMinor) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["approvedAmountMinor"],
        message: "An approved final review requires an approved amount.",
      });
    }
  });

export const contractConfirmationSchema = z.object({
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
  reasonCode: z.string().min(1).max(64),
});

// The authenticated account is the actor of record. Request bodies only carry
// the business reason/evidence required to perform the controlled action.
export const makerApprovalSchema = z.object({
  reasonCode: z.string().min(1).max(64),
});

export const checkerApprovalSchema = makerApprovalSchema.extend({
  evidenceReference: z.string().min(3).max(160),
});

export const reconciliationAssignSchema = z.object({
  assigneeLoginName: z.string().regex(/^[a-z0-9._-]{3,64}$/),
});

export const reconciliationResolutionSchema = z.object({
  reasonCode: z.string().min(1).max(128),
});

export const bootstrapAdminSchema = z.object({
  loginName: z.string().regex(/^[a-z0-9._-]{3,64}$/),
  password: z.string().min(16).max(128),
  preferredLanguage: languageSchema,
});

export const loginSchema = z.object({
  loginName: z.string().min(3).max(64),
  password: z.string().min(1).max(128),
});

export const preferredLanguageUpdateSchema = z.object({
  preferredLanguage: languageSchema,
});

export const departmentCreateSchema = z.object({
  domain: z.enum(["OPS", "BROKER", "LENDER", "EMPLOYER"]),
  code: z.string().regex(/^[A-Z0-9_]{3,64}$/),
  displayNameZh: z.string().min(1).max(80),
  displayNameEn: z.string().min(1).max(80),
  displayNameKm: z.string().min(1).max(160),
});

export const roleCreateSchema = z.object({
  domain: z.enum(["OPS", "BROKER", "LENDER", "EMPLOYER"]),
  code: z.string().regex(/^[A-Z0-9_]{3,64}$/),
  displayNameZh: z.string().min(1).max(80),
  displayNameEn: z.string().min(1).max(80),
  displayNameKm: z.string().min(1).max(160),
});

export const adminAccountCreateSchema = z.object({
  loginName: z.string().regex(/^[a-z0-9._-]{3,64}$/),
  password: z.string().min(16).max(128),
  departmentCode: z.string().regex(/^[A-Z0-9_]{3,64}$/),
  roleCodes: z
    .array(z.string().regex(/^[A-Z0-9_]{3,64}$/))
    .min(1)
    .max(4),
  preferredLanguage: languageSchema,
});
