import { timingSafeEqual } from "node:crypto";

export type CsrfScope = "admin" | "applicant";

const cookieNames: Record<CsrfScope, string> = {
  admin: "__Host-payease_admin_csrf",
  applicant: "__Host-payease_applicant_csrf",
};

export function cookieValue(
  cookieHeader: string | undefined,
  name: string,
): string | undefined {
  return cookieHeader
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

/**
 * A double-submit token is intentionally readable by the first-party UI so it
 * can be echoed in X-CSRF-Token. The session cookie remains HttpOnly.
 */
export function csrfCookie(
  scope: CsrfScope,
  token: string,
  maxAgeSeconds: number,
): string {
  const sameSite = scope === "applicant" ? "None; Partitioned" : "Strict";
  return `${cookieNames[scope]}=${token}; Secure; SameSite=${sameSite}; Path=/; Max-Age=${maxAgeSeconds}`;
}

export function expiredCsrfCookie(scope: CsrfScope): string {
  const sameSite = scope === "applicant" ? "None; Partitioned" : "Strict";
  return `${cookieNames[scope]}=; Secure; SameSite=${sameSite}; Path=/; Max-Age=0`;
}

export function hasValidDoubleSubmitCsrf(
  scope: CsrfScope,
  cookieHeader: string | undefined,
  csrfHeader: string | string[] | undefined,
): boolean {
  const cookie = cookieValue(cookieHeader, cookieNames[scope]);
  const header = typeof csrfHeader === "string" ? csrfHeader : undefined;
  if (!cookie || !header || cookie.length !== header.length) return false;
  return timingSafeEqual(Buffer.from(cookie), Buffer.from(header));
}

export function csrfCookieName(scope: CsrfScope): string {
  return cookieNames[scope];
}
