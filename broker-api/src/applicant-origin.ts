const allowedProtocols = new Set(["https:"]);

/**
 * Parse a comma-separated, exact Origin allowlist. Entries must be HTTPS
 * origins only; paths, credentials and wildcard hosts are deliberately
 * rejected because they weaken cookie-backed request validation.
 */
export function configuredApplicantOrigins(
  source = process.env.PAYEASE_APPLICANT_ALLOWED_ORIGINS,
): string[] {
  if (!source) return [];
  const origins = source
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!origins.length)
    throw new Error("PAYEASE_APPLICANT_ALLOWED_ORIGINS must not be empty");

  const unique = new Set<string>();
  for (const value of origins) {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error("Applicant Origin allowlist contains an invalid URL");
    }
    if (
      !allowedProtocols.has(parsed.protocol) ||
      parsed.origin !== value ||
      parsed.username ||
      parsed.password ||
      parsed.hostname.includes("*")
    ) {
      throw new Error(
        "Applicant Origin allowlist entries must be exact HTTPS origins",
      );
    }
    if (unique.has(parsed.origin))
      throw new Error("Applicant Origin allowlist entries must be unique");
    unique.add(parsed.origin);
  }
  return [...unique];
}

export function requireConfiguredApplicantOrigins(
  source = process.env.PAYEASE_APPLICANT_ALLOWED_ORIGINS,
): string[] {
  const origins = configuredApplicantOrigins(source);
  if (!origins.length) {
    throw new Error(
      "PAYEASE_APPLICANT_ALLOWED_ORIGINS must contain at least one exact HTTPS origin",
    );
  }
  return origins;
}

export function isAllowedApplicantOrigin(
  origin: string | undefined,
  origins: readonly string[],
): boolean {
  return Boolean(origin && origins.includes(origin));
}
