import { z } from "zod";

export const languageSchema = z.enum(["km", "en", "zh-CN"]);
const REPAYMENT_METHODS = [
  "EMPLOYER_PAYROLL_DEDUCTION",
  "USER_DIRECT_DEBIT",
  "USER_MANUAL_PAYMENT",
] as const;
const repaymentMethodSchema = z.enum(REPAYMENT_METHODS);
const authorizationSnapshotSchema = z
  .object({
    employerVerificationAuthorized: z.literal(true),
    serviceAgreementAuthorized: z.literal(true),
    postDisbursementBrokerageAuthorized: z.literal(true),
    payrollDeductionAuthorized: z.boolean(),
    directDebitAuthorized: z.boolean(),
  })
  .superRefine((value, context) => {
    if (value.payrollDeductionAuthorized && value.directDebitAuthorized) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["directDebitAuthorized"],
        message:
          "Payroll deduction and direct debit authorization cannot both be active for the same application snapshot.",
      });
    }
  });

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
    tenorDays: z.union([z.literal(15), z.literal(30)]),
    selectedRepaymentMethod: repaymentMethodSchema,
    authorizationSnapshot: authorizationSnapshotSchema,
    employerTenantId: z.string().uuid().optional(),
    identityDocument: z
      .object({
        type: z.enum(["NATIONAL_ID", "PASSPORT"]),
        number: z
          .string()
          .trim()
          .regex(/^[A-Za-z0-9][A-Za-z0-9 -]{4,63}$/),
      })
      .optional(),
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
    if (
      value.selectedRepaymentMethod === "EMPLOYER_PAYROLL_DEDUCTION" &&
      value.authorizationSnapshot.payrollDeductionAuthorized !== true
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["authorizationSnapshot", "payrollDeductionAuthorized"],
        message:
          "Employer payroll deduction requires an explicit payroll deduction authorization.",
      });
    }
    if (
      value.selectedRepaymentMethod === "USER_DIRECT_DEBIT" &&
      value.authorizationSnapshot.directDebitAuthorized !== true
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["authorizationSnapshot", "directDebitAuthorized"],
        message:
          "User direct debit requires an explicit direct debit authorization.",
      });
    }
    if (
      value.selectedRepaymentMethod === "USER_MANUAL_PAYMENT" &&
      (value.authorizationSnapshot.payrollDeductionAuthorized ||
        value.authorizationSnapshot.directDebitAuthorized)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["authorizationSnapshot"],
        message:
          "Manual payment cannot submit payroll deduction or direct debit authorization.",
      });
    }
  });

export const applicantDraftStageSchema = z.enum(["welcome", "details"]);
export const applicantDraftFormStepSchema = z.enum([
  "profile",
  "contacts",
  "payout",
  "supplements",
  "confirm",
]);

export const applicantApplicationDraftSchema = z.object({
  version: z.literal(1),
  stage: applicantDraftStageSchema,
  formStep: applicantDraftFormStepSchema,
  amountInput: z.string().max(32),
  term: z.union([z.literal(15), z.literal(30)]),
  selectedRepaymentMethod: repaymentMethodSchema,
  name: z.string().max(120),
  residentialAddress: z.string().max(240),
  phone: z.string().max(32),
  employer: z.string().max(160),
  emergencyContactOneName: z.string().max(120),
  emergencyContactOnePhone: z.string().max(32),
  emergencyContactTwoName: z.string().max(120),
  emergencyContactTwoPhone: z.string().max(32),
  employerTenantId: z.string().uuid().or(z.literal("")),
  bankName: z.string().max(120),
  bankAccountNumber: z.string().max(64),
  bankAccountHolder: z.string().max(120),
  identityDocumentType: z.enum(["NATIONAL_ID", "PASSPORT"]),
  identityDocumentNumber: z.string().max(64),
  livenessPrepared: z.boolean(),
  wealthProofAttached: z.boolean(),
  consent: z.boolean(),
  employerVerificationAuthorized: z.boolean(),
  serviceAgreementAuthorized: z.boolean(),
  postDisbursementBrokerageAuthorized: z.boolean(),
  payrollDeductionAuthorized: z.boolean(),
  directDebitAuthorized: z.boolean(),
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
export const employerCollectionVerificationSchema = z
  .object({
    collectionResult: z.enum([
      "COLLECTED",
      "PARTIALLY_COLLECTED",
      "NOT_COLLECTED",
    ]),
    reasonCode: z.string().min(1).max(64),
    collectionSequence: z.number().int().min(1).max(2).optional(),
    actualCollectedAmountMinor: z.string().regex(/^\d+$/),
    evidenceReference: z.string().trim().min(3).max(160),
  })
  .superRefine((value, context) => {
    const actual = BigInt(value.actualCollectedAmountMinor);
    if (value.collectionResult === "NOT_COLLECTED" && actual !== 0n) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["actualCollectedAmountMinor"],
        message:
          "A not-collected payroll report must use 0 as the actual amount.",
      });
    }
    if (
      value.collectionResult === "COLLECTED" &&
      value.actualCollectedAmountMinor === "0"
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["actualCollectedAmountMinor"],
        message:
          "A collected payroll report must record a positive actual amount.",
      });
    }
    if (
      value.collectionResult === "PARTIALLY_COLLECTED" &&
      value.actualCollectedAmountMinor === "0"
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["actualCollectedAmountMinor"],
        message:
          "A partially-collected payroll report must record the deducted amount.",
      });
    }
  });
export const lenderInitialReviewSchema = approvalDecisionSchema;
export const lenderFinalReviewSchema = approvalDecisionSchema
  .extend({
    approvedAmountMinor: z.string().regex(/^\d+$/).optional(),
    actualDisbursementAmountMinor: z.string().regex(/^\d+$/).optional(),
    lenderInterestMinor: z.string().regex(/^\d+$/).optional(),
    totalRepaymentAmountMinor: z.string().regex(/^\d+$/).optional(),
    brokerageRemunerationReceivableMinor: z.string().regex(/^\d+$/).optional(),
    installmentCount: z.number().int().min(1).max(2).optional(),
    firstDueDate: z.string().date().optional(),
    productRuleVersion: z.string().min(3).max(64).optional(),
    brokerageRemunerationRuleVersion: z.string().min(3).max(64).optional(),
    lenderInterestRuleVersion: z.string().min(3).max(64).optional(),
  })
  .superRefine((value, context) => {
    if (value.decision !== "APPROVED") return;
    for (const field of [
      "approvedAmountMinor",
      "actualDisbursementAmountMinor",
      "lenderInterestMinor",
      "totalRepaymentAmountMinor",
      "brokerageRemunerationReceivableMinor",
      "installmentCount",
      "firstDueDate",
      "productRuleVersion",
      "brokerageRemunerationRuleVersion",
      "lenderInterestRuleVersion",
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
      value.actualDisbursementAmountMinor &&
      value.lenderInterestMinor &&
      value.totalRepaymentAmountMinor &&
      BigInt(value.actualDisbursementAmountMinor) !==
        BigInt(value.approvedAmountMinor)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["actualDisbursementAmountMinor"],
        message:
          "Actual disbursement must equal the approved principal for V2 salary loans.",
      });
    }
    if (
      value.approvedAmountMinor &&
      value.lenderInterestMinor &&
      value.totalRepaymentAmountMinor &&
      BigInt(value.totalRepaymentAmountMinor) !==
        BigInt(value.approvedAmountMinor) + BigInt(value.lenderInterestMinor)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["totalRepaymentAmountMinor"],
        message:
          "Total repayment amount must equal principal plus lender interest.",
      });
    }
  });

export const contractConfirmationSchema = z.object({
  evidenceReference: z.string().min(3).max(160),
});

export const applicantServiceCaseCreateSchema = z.object({
  caseType: z.enum(["SERVICE_QUERY", "COMPLAINT"]),
  // Free text may contain sensitive information, so the API encrypts it before
  // persistence and never includes it in an audit event payload.
  message: z.string().trim().min(10).max(2000),
});

export const applicantSupplementResponseSchema = z.object({
  // This is deliberately a text-only acknowledgement/explanation channel.
  // Identity documents and banking details require the separate, approved
  // encrypted-document collection flow and must never be pasted into it.
  message: z.string().trim().min(10).max(2000),
});

export const applicantPaymentProofUploadSchema = z
  .object({
    fileName: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .regex(/^[^\\/\u0000-\u001f]+$/),
    contentType: z.enum([
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ]),
    contentBase64: z
      .string()
      .trim()
      .min(16)
      .max(2_800_000)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
    transferReference: z.string().trim().min(3).max(120).optional(),
  })
  .superRefine((value, context) => {
    try {
      const size = Buffer.from(value.contentBase64, "base64").byteLength;
      if (size < 1 || size > 2 * 1024 * 1024) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["contentBase64"],
          message: "Payment proof file must be between 1 byte and 2 MiB.",
        });
      }
    } catch {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contentBase64"],
        message: "Payment proof content must be valid base64.",
      });
    }
  });

export const applicantReassessmentRequestSchema = z
  .object({
    addressChanged: z.boolean(),
    employerUpdated: z.boolean(),
    wealthProofDeclared: z.boolean(),
    note: z.string().trim().min(10).max(1000).optional(),
  })
  .superRefine((value, context) => {
    if (
      !value.addressChanged &&
      !value.employerUpdated &&
      !value.wealthProofDeclared &&
      !value.note
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["note"],
        message:
          "Provide at least one reassessment update flag or an explanatory note.",
      });
    }
  });

export const applicantPaymentProofReviewSchema = z.object({
  status: z.enum(["NEEDS_MORE", "RECONCILED", "EXCEPTION"]),
  reasonCode: z
    .string()
    .trim()
    .regex(/^[A-Z0-9_]{3,64}$/),
});

const reassessmentReviewDecisionSchema = z.object({
  decision: z.enum(["APPROVED", "RETURNED", "REJECTED"]),
  reasonCode: z
    .string()
    .trim()
    .regex(/^[A-Z0-9_]{3,64}$/),
});

export const applicantReassessmentBrokerReviewSchema =
  reassessmentReviewDecisionSchema;
export const applicantReassessmentLenderReviewSchema =
  reassessmentReviewDecisionSchema;

export const applicantServiceCaseLenderResolutionSchema = z.object({
  reasonCode: z
    .string()
    .trim()
    .regex(/^[A-Z0-9_]{3,64}$/),
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

export const lenderCollectionWorkItemCreateSchema = z
  .object({
    sourceType: z.enum([
      "USER_DIRECT_DEBIT_REPORT",
      "USER_MANUAL_PAYMENT_PROOF",
      "REFUND_REVERSAL",
    ]),
    collectionResult: z.enum([
      "COLLECTED",
      "PARTIALLY_COLLECTED",
      "NOT_COLLECTED",
      "DIRECT_DEBIT_FAILED",
      "AUTHORIZATION_EXPIRED",
      "REFUND_REVERSED",
    ]),
    reasonCode: z.string().min(1).max(64),
    collectionSequence: z.number().int().min(1).max(2).optional(),
    actualCollectedAmountMinor: z.string().regex(/^\d+$/),
    evidenceReference: z.string().trim().min(3).max(160),
    sourceReference: z.string().trim().min(3).max(160).optional(),
  })
  .superRefine((value, context) => {
    const actual = BigInt(value.actualCollectedAmountMinor);
    if (
      [
        "NOT_COLLECTED",
        "DIRECT_DEBIT_FAILED",
        "AUTHORIZATION_EXPIRED",
        "REFUND_REVERSED",
      ].includes(value.collectionResult) &&
      actual !== 0n
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["actualCollectedAmountMinor"],
        message:
          "A failed, expired, not-collected, or reversed collection must use 0 as the actual amount.",
      });
    }
    if (
      (value.collectionResult === "COLLECTED" ||
        value.collectionResult === "PARTIALLY_COLLECTED") &&
      actual === 0n
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["actualCollectedAmountMinor"],
        message:
          "A collected or partially-collected collection must record a positive actual amount.",
      });
    }
    if (
      value.sourceType === "REFUND_REVERSAL" &&
      value.collectionResult !== "REFUND_REVERSED"
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["collectionResult"],
        message:
          "Refund reversal fixtures must use REFUND_REVERSED as the collection result.",
      });
    }
  });

export const lenderCollectionExceptionResolutionSchema = z.object({
  reasonCode: z.string().min(1).max(64),
  evidenceReference: z.string().trim().min(3).max(160),
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

export const employerTenantCreateSchema = z.object({
  externalRef: z.string().regex(/^[A-Z0-9_-]{3,64}$/),
  displayName: z.string().trim().min(1).max(160),
});
