import { describe, expect, it } from "vitest";
import {
  createApplicationSchema,
  disbursementDualControlSchema,
  applicantSupplementResponseSchema,
  lenderFinalReviewSchema,
} from "../src/validation.js";

describe("controlled-pilot application validation", () => {
  it("accepts a USD request with minor-unit string and valid term", () => {
    expect(
      createApplicationSchema.parse({
        telegramUserRef: "local-user-001",
        preferredLanguage: "km",
        requestedAmount: { amountMinor: "10000", currency: "USD" },
        tenorDays: 30,
      }),
    ).toMatchObject({ tenorDays: 30 });
  });

  it("rejects number money values and an out-of-range term", () => {
    const parsed = createApplicationSchema.safeParse({
      telegramUserRef: "local-user-001",
      preferredLanguage: "en",
      requestedAmount: { amountMinor: 10000, currency: "USD" },
      tenorDays: 181,
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts complete personal details but rejects a malformed phone number", () => {
    const valid = {
      telegramUserRef: "local-user-private-profile",
      preferredLanguage: "en",
      requestedAmount: { amountMinor: "10000", currency: "USD" },
      tenorDays: 30,
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
        serviceFeeMinor: "0",
        totalRepayableMinor: "25000",
        installmentCount: 1,
        firstDueDate: "2026-09-13",
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
});
