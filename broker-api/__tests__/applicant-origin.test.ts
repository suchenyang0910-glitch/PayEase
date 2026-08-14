import { describe, expect, it } from "vitest";
import {
  configuredApplicantOrigins,
  isAllowedApplicantOrigin,
  requireConfiguredApplicantOrigins,
} from "../src/applicant-origin.js";

describe("applicant Origin allowlist", () => {
  it("accepts exact, unique HTTPS origins only", () => {
    const origins = configuredApplicantOrigins(
      "https://payease-user.khmerx.org, https://borrower.example.test",
    );
    expect(origins).toEqual([
      "https://payease-user.khmerx.org",
      "https://borrower.example.test",
    ]);
    expect(
      isAllowedApplicantOrigin("https://payease-user.khmerx.org", origins),
    ).toBe(true);
    expect(isAllowedApplicantOrigin("https://attacker.example", origins)).toBe(
      false,
    );
  });

  it.each([
    "http://payease-user.khmerx.org",
    "https://payease-user.khmerx.org/path",
    "https://user:p@payease-user.khmerx.org",
    "https://*.khmerx.org",
    "https://payease-user.khmerx.org,https://payease-user.khmerx.org",
  ])("rejects a weak allowlist entry: %s", (source) => {
    expect(() => configuredApplicantOrigins(source)).toThrow();
  });

  it("fails closed when production configuration is missing", () => {
    expect(() => requireConfiguredApplicantOrigins("")).toThrow(
      "at least one exact HTTPS origin",
    );
  });
});
