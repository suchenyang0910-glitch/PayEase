import { describe, expect, it } from "vitest";
import {
  cookieValue,
  csrfCookie,
  csrfCookieName,
  expiredCsrfCookie,
  hasValidDoubleSubmitCsrf,
} from "../src/csrf.js";

describe("double-submit CSRF helpers", () => {
  it("uses separate host-only cookies for admin and applicant sessions", () => {
    expect(csrfCookieName("admin")).not.toBe(csrfCookieName("applicant"));
    expect(csrfCookie("admin", "abc", 1800)).toContain(
      "__Host-payease_admin_csrf=abc; Secure; SameSite=Strict; Path=/; Max-Age=1800",
    );
    expect(csrfCookie("applicant", "abc", 900)).toContain(
      "SameSite=None; Partitioned",
    );
    expect(expiredCsrfCookie("applicant")).toContain("Max-Age=0");
  });

  it("requires an exact same-scope cookie and header", () => {
    const header = "__Host-payease_admin_csrf=token-1; payease_session=session";
    expect(cookieValue(header, "__Host-payease_admin_csrf")).toBe("token-1");
    expect(hasValidDoubleSubmitCsrf("admin", header, "token-1")).toBe(true);
    expect(hasValidDoubleSubmitCsrf("admin", header, "token-2")).toBe(false);
    expect(hasValidDoubleSubmitCsrf("applicant", header, "token-1")).toBe(
      false,
    );
    expect(hasValidDoubleSubmitCsrf("admin", header, ["token-1"])).toBe(false);
  });
});
