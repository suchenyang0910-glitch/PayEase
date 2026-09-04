import { describe, expect, it } from "vitest";
import {
  applicantPaymentProofReviewSchema,
  applicantReassessmentBrokerReviewSchema,
  createApplicationSchema,
  disbursementDualControlSchema,
  employerCollectionVerificationSchema,
  applicantSupplementResponseSchema,
  kycLocationEvidenceCreateSchema,
  lenderFinalReviewSchema,
  serviceAreaZoneCreateSchema,
  serviceAreaZoneDraftPatchSchema,
  walletOperationJumpCreateSchema,
} from "../src/validation.js";

const baseCreateApplicationPayload = {
  telegramUserRef: "local-user-001",
  preferredLanguage: "km" as const,
  requestedAmount: { amountMinor: "10000", currency: "USD" as const },
  tenorDays: 30 as const,
  selectedRepaymentMethod: "SMILE_WALLET_AUTHORIZATION" as const,
  authorizationSnapshot: {
    employerVerificationAuthorized: true as const,
    serviceAgreementAuthorized: true as const,
    postDisbursementBrokerageAuthorized: true as const,
  },
};

describe("controlled-pilot application validation", () => {
  it("accepts a USD request with Day 2 workflow fields", () => {
    expect(
      createApplicationSchema.parse(baseCreateApplicationPayload),
    ).toMatchObject({
      tenorDays: 30,
      selectedRepaymentMethod: "SMILE_WALLET_AUTHORIZATION",
    });
  });

  it("rejects number money values and an out-of-range term", () => {
    const parsed = createApplicationSchema.safeParse({
      ...baseCreateApplicationPayload,
      preferredLanguage: "en",
      requestedAmount: { amountMinor: 10000, currency: "USD" },
      tenorDays: 181,
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts complete personal details but rejects a malformed phone number", () => {
    const valid = {
      ...baseCreateApplicationPayload,
      telegramUserRef: "local-user-private-profile",
      preferredLanguage: "en" as const,
      personalProfile: {
        fullName: "Test Applicant",
        phone: "+85512345678",
        employerName: "Pilot Factory",
      },
      personalDataAndPhoneConsent: true,
    };
    expect(createApplicationSchema.safeParse(valid).success).toBe(true);
    expect(
      createApplicationSchema.safeParse({
        ...valid,
        personalProfile: { ...valid.personalProfile, phone: "not-a-phone" },
      }).success,
    ).toBe(false);
    expect(
      createApplicationSchema.safeParse({
        ...valid,
        personalDataAndPhoneConsent: undefined,
      }).success,
    ).toBe(false);
  });

  it("locks new applications to SMILE wallet authorization", () => {
    expect(
      createApplicationSchema.safeParse({
        ...baseCreateApplicationPayload,
        selectedRepaymentMethod: "EMPLOYER_PAYROLL_DEDUCTION",
      }).success,
    ).toBe(false);
    expect(
      createApplicationSchema.safeParse({
        ...baseCreateApplicationPayload,
        authorizationSnapshot: {
          ...baseCreateApplicationPayload.authorizationSnapshot,
          directDebitAuthorized: true,
        },
      }).success,
    ).toBe(false);
  });

  it("requires distinct maker and checker roles for disbursement control", () => {
    expect(
      disbursementDualControlSchema.safeParse({
        release: {
          actorUserRef: "maker-001",
          actorRole: "LENDER_DISBURSEMENT_MAKER",
          reasonCode: "RELEASE_APPROVED",
        },
        confirmation: {
          actorUserRef: "checker-001",
          actorRole: "LENDER_DISBURSEMENT_CHECKER",
          reasonCode: "RECEIPT_VERIFIED",
        },
        evidenceReference: "SIM-DISB-001",
      }).success,
    ).toBe(true);
    expect(
      disbursementDualControlSchema.safeParse({
        release: {
          actorUserRef: "maker-001",
          actorRole: "LENDER_DISBURSEMENT_CHECKER",
          reasonCode: "RELEASE_APPROVED",
        },
        confirmation: {
          actorUserRef: "checker-001",
          actorRole: "LENDER_DISBURSEMENT_CHECKER",
          reasonCode: "RECEIPT_VERIFIED",
        },
        evidenceReference: "SIM-DISB-001",
      }).success,
    ).toBe(false);
  });

  it("requires an approved amount when final lender review approves", () => {
    expect(
      lenderFinalReviewSchema.safeParse({
        decision: "APPROVED",
        reasonCode: "FINAL_APPROVAL",
      }).success,
    ).toBe(false);
    expect(
      lenderFinalReviewSchema.safeParse({
        decision: "APPROVED",
        reasonCode: "FINAL_APPROVAL",
        approvedAmountMinor: "25000",
        actualDisbursementAmountMinor: "25000",
        lenderInterestMinor: "500",
        totalRepaymentAmountMinor: "25500",
        brokerageRemunerationReceivableMinor: "3500",
        installmentCount: 1,
        firstDueDate: "2026-09-13",
        productRuleVersion: "PRODUCT-RULE-V2-20260821",
        brokerageRemunerationRuleVersion: "BROKERAGE-RULE-V2-20260821",
        lenderInterestRuleVersion: "LENDER-INTEREST-V2-20260821",
      }).success,
    ).toBe(true);
  });

  it("allows only bounded non-empty text for a supplement response", () => {
    expect(
      applicantSupplementResponseSchema.safeParse({
        message: "I have corrected the requested information.",
      }).success,
    ).toBe(true);
    expect(
      applicantSupplementResponseSchema.safeParse({ message: "short" }).success,
    ).toBe(false);
    expect(
      applicantSupplementResponseSchema.safeParse({
        message: "x".repeat(2001),
      }).success,
    ).toBe(false);
  });

  it("accepts only controlled payment-proof review statuses and reason codes", () => {
    expect(
      applicantPaymentProofReviewSchema.safeParse({
        status: "RECONCILED",
        reasonCode: "PROOF_MATCHED",
      }).success,
    ).toBe(true);
    expect(
      applicantPaymentProofReviewSchema.safeParse({
        status: "UNDER_REVIEW",
        reasonCode: "PROOF_MATCHED",
      }).success,
    ).toBe(false);
  });

  it("requires a valid reassessment review decision payload", () => {
    expect(
      applicantReassessmentBrokerReviewSchema.safeParse({
        decision: "APPROVED",
        reasonCode: "REASSESSMENT_ELIGIBLE",
      }).success,
    ).toBe(true);
    expect(
      applicantReassessmentBrokerReviewSchema.safeParse({
        decision: "APPROVED",
        reasonCode: "bad reason",
      }).success,
    ).toBe(false);
  });

  it("accepts an optional payroll collection sequence for employer finance reporting", () => {
    expect(
      employerCollectionVerificationSchema.safeParse({
        collectionResult: "COLLECTED",
        reasonCode: "PAYROLL_INSTALLMENT_COLLECTION_REPORTED",
        collectionSequence: 1,
        actualCollectedAmountMinor: "12750",
        evidenceReference: "PAYROLL-EVIDENCE-001",
      }).success,
    ).toBe(true);
    expect(
      employerCollectionVerificationSchema.safeParse({
        collectionResult: "NOT_COLLECTED",
        reasonCode: "PAYROLL_INSTALLMENT_NOT_COLLECTED",
        collectionSequence: 3,
        actualCollectedAmountMinor: "1",
        evidenceReference: "PAYROLL-EVIDENCE-002",
      }).success,
    ).toBe(false);
  });

  it("rejects unknown sensitive fields on wallet operation jump creation", () => {
    expect(
      walletOperationJumpCreateSchema.safeParse({
        operationType: "WITHDRAWAL",
        requestedAmountMinor: "20000",
      }).success,
    ).toBe(false);
    expect(
      walletOperationJumpCreateSchema.safeParse({
        operationType: "REPAYMENT",
        otp: "123456",
      }).success,
    ).toBe(false);
  });

  it("validates service area zone polygons and tenant scope rules", () => {
    const valid = {
      zoneRef: "ZONE-PPH-001",
      displayName: "Phnom Penh service area",
      scopeType: "PLATFORM" as const,
      polygonGeoJson: {
        type: "Polygon" as const,
        coordinates: [
          [
            [104.9, 11.56],
            [104.93, 11.56],
            [104.93, 11.59],
            [104.9, 11.56],
          ],
        ],
      },
      effectiveFrom: "2026-09-01T00:00:00.000Z",
      effectiveUntil: "2026-12-01T00:00:00.000Z",
      changeReason: "Initial rollout",
    };
    expect(serviceAreaZoneCreateSchema.safeParse(valid).success).toBe(true);
    expect(
      serviceAreaZoneCreateSchema.safeParse({
        ...valid,
        scopeType: "EMPLOYER_TENANT",
      }).success,
    ).toBe(false);
    expect(
      serviceAreaZoneDraftPatchSchema.safeParse({
        displayName: valid.displayName,
        scopeType: "EMPLOYER_TENANT",
        employerTenantId: "4c16e7c6-6a31-4d22-9f47-4b5f9f6db201",
        polygonGeoJson: valid.polygonGeoJson,
        effectiveFrom: valid.effectiveFrom,
        effectiveUntil: valid.effectiveUntil,
        changeReason: valid.changeReason,
      }).success,
    ).toBe(true);
    expect(
      serviceAreaZoneCreateSchema.safeParse({
        ...valid,
        polygonGeoJson: {
          type: "Polygon",
          coordinates: [
            [
              [104.9, 11.56],
              [104.93, 11.59],
              [104.9, 11.56],
            ],
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("accepts only strict KYC location evidence payloads", () => {
    expect(
      kycLocationEvidenceCreateSchema.safeParse({
        latitude: 11.5564,
        longitude: 104.9282,
        horizontalAccuracyMeters: 80,
        capturedAt: "2026-09-01T10:00:00.000Z",
        consentVersion: "KYC_LOCATION_V1",
      }).success,
    ).toBe(true);
    expect(
      kycLocationEvidenceCreateSchema.safeParse({
        latitude: 11.5564,
        longitude: 104.9282,
        horizontalAccuracyMeters: 80,
        capturedAt: "2026-09-01T10:00:00.000Z",
        consentVersion: "KYC_LOCATION_V1",
        zoneRef: "ZONE-PPH-001",
      }).success,
    ).toBe(false);
    expect(
      kycLocationEvidenceCreateSchema.safeParse({
        latitude: 91,
        longitude: 104.9282,
        horizontalAccuracyMeters: 80,
        capturedAt: "2026-09-01T10:00:00.000Z",
        consentVersion: "bad",
      }).success,
    ).toBe(false);
  });
});
