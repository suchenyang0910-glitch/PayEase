type TelegramAuthEnvironment = Readonly<{
  NODE_ENV?: string;
  PAYEASE_DEPLOYMENT_MODE?: string;
  PAYEASE_ALLOW_UNAUTHENTICATED_PREVIEW?: string;
  REQUIRE_TELEGRAM_AUTH?: string;
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
