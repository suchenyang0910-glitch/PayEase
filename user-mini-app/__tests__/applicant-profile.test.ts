import { describe, expect, it } from "vitest";
import { applicantProfileValidationError } from "../src/applicant-profile.ts";

describe("applicant profile validation", () => {
  const valid = {
    fullName: "Test Applicant",
    phone: "+855 12 345 678",
    employerName: "Pilot Factory",
  };

  it("accepts the public API's supported phone format", () => {
    expect(applicantProfileValidationError(valid)).toBeUndefined();
  });

  it("rejects missing fields and malformed phone numbers before submission", () => {
    expect(applicantProfileValidationError({ ...valid, fullName: "  " })).toBe(
      "REQUIRED",
    );
    expect(
      applicantProfileValidationError({ ...valid, phone: "not-a-phone" }),
    ).toBe("PHONE_INVALID");
  });
});
