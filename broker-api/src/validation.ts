import { z } from "zod";

export const languageSchema = z.enum(["km", "en", "zh-CN"]);

export const createApplicationSchema = z
  .object({
    // Only controlled-preview mode accepts this compatibility value. Production
    // derives the reference solely from a verified Telegram Mini App session.
    telegramUserRef: z.string().min(3).max(128).optional(),
    preferredLanguage: languageSchema,
    requestedAmount: z.object({
      amountMinor: z.string().regex(/^\d+$/),
      currency: z.literal("USD"),
    }),
    tenorDays: z.number().int().min(7).max(180),
    personalProfile: z
      .object({
        fullName: z.string().trim().min(1).max(120),
        phone: z
          .string()
          .trim()
          .regex(/^\+?[0-9][0-9 ()-]{5,31}$/),
        employerName: z.string().trim().min(1).max(160),
      })
      .optional(),
    // A profile includes a phone number.  Both categories therefore require an
    // explicit affirmative action from the applicant before persistence.
    personalDataAndPhoneConsent: z.literal(true).optional(),
  })
  .superRefine((value, context) => {
    if (value.personalProfile && value.personalDataAndPhoneConsent !== true) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["personalDataAndPhoneConsent"],
        message:
          "Personal-data and phone consent is required when submitting a profile.",
      });
    }
  });

export const telegramSessionSchema = z.object({
  initData: z.string().min(32).max(8192),
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
  .extend({
    approvedAmountMinor: z.string().regex(/^\d+$/).optional(),
    serviceFeeMinor: z.string().regex(/^\d+$/).optional(),
    totalRepayableMinor: z.string().regex(/^\d+$/).optional(),
    installmentCount: z.number().int().min(1).max(6).optional(),
    firstDueDate: z.string().date().optional(),
  })
  .superRefine((value, context) => {
    if (value.decision !== "APPROVED") return;
    for (const field of [
      "approvedAmountMinor",
      "serviceFeeMinor",
      "totalRepayableMinor",
      "installmentCount",
      "firstDueDate",
    ] as const) {
      if (value[field] === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: "An approved final review requires contractual terms.",
        });
      }
    }
    if (
      value.approvedAmountMinor &&
      value.serviceFeeMinor &&
      value.totalRepayableMinor &&
      BigInt(value.totalRepayableMinor) <
        BigInt(value.approvedAmountMinor) + BigInt(value.serviceFeeMinor)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["totalRepayableMinor"],
        message:
          "Total repayable amount must include principal and service fee.",
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

export const adminAccountActivitySchema = z.object({
  isActive: z.boolean(),
});

export const adminAccountRolesUpdateSchema = z.object({
  roleCodes: z
    .array(z.string().regex(/^[A-Z0-9_]{3,64}$/))
    .min(1)
    .max(4)
    .refine((codes) => new Set(codes).size === codes.length, {
      message: "Role codes must be unique.",
    }),
});
