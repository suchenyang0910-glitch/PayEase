type TelegramAuthEnvironment = Readonly<{
  NODE_ENV?: string;
  PAYEASE_DEPLOYMENT_MODE?: string;
  PAYEASE_ALLOW_UNAUTHENTICATED_PREVIEW?: string;
  REQUIRE_TELEGRAM_AUTH?: string;
  REQUIRE_TELEGRAM_PHONE_VERIFICATION?: string;
}>;

/** A preview marker is useful to prevent accidental use as a real service. */
export function isControlledPreview(
  environment: TelegramAuthEnvironment = process.env,
): boolean {
  return environment.PAYEASE_DEPLOYMENT_MODE === "controlled-preview";
}

/**
 * Applicant identity is verified by default. A controlled preview remains
 * verified unless its operator also supplies the explicit opt-out marker.
 * This prevents a public preview label alone from becoming a production
 * authentication bypass. Tests retain an explicit opt-in so disposable
 * fixtures can cover both paths.
 */
export function requiresTelegramAuthentication(
  environment: TelegramAuthEnvironment = process.env,
): boolean {
  if (environment.NODE_ENV === "test") {
    return environment.REQUIRE_TELEGRAM_AUTH === "true";
  }
  if (isControlledPreview(environment)) {
    return (
      environment.REQUIRE_TELEGRAM_AUTH === "true" ||
      environment.PAYEASE_ALLOW_UNAUTHENTICATED_PREVIEW !== "true"
    );
  }
  return true;
}

/**
 * A deliberately unauthenticated preview may show static UX only. It must
 * never accept applications or other applicant data, even if a deployment
 * accidentally supplies otherwise valid storage credentials.
 */
export function isUnauthenticatedControlledPreview(
  environment: TelegramAuthEnvironment = process.env,
): boolean {
  return (
    isControlledPreview(environment) &&
    !requiresTelegramAuthentication(environment)
  );
}

/**
 * Contact sharing is an opt-in production gate. It remains disabled until
 * every enabled Bot has a configured webhook secret and the operations team
 * has verified delivery, so a deployment cannot accidentally lock applicants
 * out by merely adding the database migration.
 */
export function requiresTelegramPhoneVerification(
  environment: TelegramAuthEnvironment = process.env,
): boolean {
  return (
    requiresTelegramAuthentication(environment) &&
    environment.REQUIRE_TELEGRAM_PHONE_VERIFICATION === "true"
  );
}
