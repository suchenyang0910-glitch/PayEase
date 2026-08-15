import { describe, expect, it } from "vitest";
import { requiresIdentityMatchBeforeApproval } from "../hr-identity-match-gate";

describe("HR identity match approval gate", () => {
  it("requires a match for a documented HR verification", () => {
    expect(
      requiresIdentityMatchBeforeApproval({
        stage: "EMPLOYER_VERIFICATION",
        identityDocumentType: "NATIONAL_ID",
        identityMatchStatus: "PENDING",
      }),
    ).toBe(true);
  });

  it("allows approval only after a documented applicant is matched", () => {
    expect(
      requiresIdentityMatchBeforeApproval({
        stage: "EMPLOYER_VERIFICATION",
        identityDocumentType: "PASSPORT",
        identityMatchStatus: "MATCHED",
      }),
    ).toBe(false);
  });

  it("does not apply the new gate to legacy records without a document", () => {
    expect(
      requiresIdentityMatchBeforeApproval({
        stage: "EMPLOYER_VERIFICATION",
        identityDocumentType: null,
        identityMatchStatus: "PENDING",
      }),
    ).toBe(false);
  });
});
