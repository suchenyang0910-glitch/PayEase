type TelegramAuthEnvironment = Readonly<{
  NODE_ENV?: string;
  PAYEASE_DEPLOYMENT_MODE?: string;
  REQUIRE_TELEGRAM_AUTH?: string;
}>;

/**
 * Applicant identity is verified by default.  The only opt-out is the
 * explicitly labelled controlled-preview deployment, where UX work can be
 * reviewed without real Telegram traffic.  Tests retain an explicit opt-in so
 * their disposable fixtures can cover both paths.
 */
export function requiresTelegramAuthentication(
  environment: TelegramAuthEnvironment = process.env,
): boolean {
  if (environment.NODE_ENV === "test") {
    return environment.REQUIRE_TELEGRAM_AUTH === "true";
  }
  if (environment.PAYEASE_DEPLOYMENT_MODE === "controlled-preview") {
    return environment.REQUIRE_TELEGRAM_AUTH === "true";
  }
  return true;
}
