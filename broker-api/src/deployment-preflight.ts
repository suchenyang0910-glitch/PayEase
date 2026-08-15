import {
  configuredTelegramBots,
  requireTelegramRecoveryTopology,
  type TelegramBotConfig,
} from "./telegram-auth.js";
import {
  isControlledPreview,
  requiresTelegramAuthentication,
  requiresTelegramPhoneVerification,
} from "./telegram-auth-policy.js";
import {
  identityDocumentLookupPreflight,
  personalDataEncryptionPreflight,
} from "./personal-profile.js";

type AuthenticationEnvironment = Readonly<{
  PAYEASE_DEPLOYMENT_MODE?: string;
  PAYEASE_ALLOW_UNAUTHENTICATED_PREVIEW?: string;
  REQUIRE_TELEGRAM_AUTH?: string;
  REQUIRE_TELEGRAM_PHONE_VERIFICATION?: string;
  TELEGRAM_BOTS_JSON?: string;
  PAYEASE_PII_ENCRYPTION_KEY?: string;
  PAYEASE_PII_ENCRYPTION_KEY_VERSION?: string;
  PAYEASE_PII_ENCRYPTION_KEYS_JSON?: string;
  PAYEASE_IDENTITY_LOOKUP_KEY?: string;
}>;

export type TelegramAuthenticationPreflight = Readonly<{
  ready: boolean;
  authenticationRequired: boolean;
  controlledPreview: boolean;
  configuredBotIds: string[];
  enabledBotCount: number;
  piiEncryptionRequired: boolean;
  piiEncryptionReady: boolean;
  piiActiveKeyVersion?: string;
  error?: string;
}>;

function safeBotSummary(bots: readonly TelegramBotConfig[]) {
  return {
    configuredBotIds: bots.map((bot) => bot.botId),
    enabledBotCount: bots.filter((bot) => bot.enabled).length,
  };
}

/**
 * Checks deployment authentication topology without logging Telegram tokens.
 * It is deliberately runnable before replacing an API container, so a missing
 * recovery Bot cannot turn a healthy preview into a restart loop.
 */
export function telegramAuthenticationPreflight(
  environment: AuthenticationEnvironment = process.env,
): TelegramAuthenticationPreflight {
  const authenticationRequired = requiresTelegramAuthentication(environment);
  const controlledPreview = isControlledPreview(environment);
  // An explicit unauthenticated controlled preview has no applicant data
  // collection path. Every authenticated deployment must prove its active PII
  // key before the container is replaced.
  const piiEncryptionRequired = authenticationRequired;
  let piiEncryptionReady = !piiEncryptionRequired;
  let piiActiveKeyVersion: string | undefined;
  let piiError: string | undefined;
  if (piiEncryptionRequired) {
    try {
      piiActiveKeyVersion =
        personalDataEncryptionPreflight(environment).activeKeyVersion;
      identityDocumentLookupPreflight(environment.PAYEASE_IDENTITY_LOOKUP_KEY);
      piiEncryptionReady = true;
    } catch (error) {
      piiError =
        error instanceof Error
          ? error.message
          : "PII encryption configuration is invalid";
    }
  }
  let bots: TelegramBotConfig[];
  try {
    bots = configuredTelegramBots(environment.TELEGRAM_BOTS_JSON);
  } catch (error) {
    return {
      ready: false,
      authenticationRequired,
      controlledPreview,
      configuredBotIds: [],
      enabledBotCount: 0,
      piiEncryptionRequired,
      piiEncryptionReady,
      piiActiveKeyVersion,
      error:
        error instanceof Error ? error.message : "Invalid Bot configuration",
    };
  }
  const summary = safeBotSummary(bots);
  if (!authenticationRequired) {
    return {
      ready: true,
      authenticationRequired,
      controlledPreview,
      ...summary,
      piiEncryptionRequired,
      piiEncryptionReady,
      piiActiveKeyVersion,
    };
  }
  try {
    requireTelegramRecoveryTopology(environment.TELEGRAM_BOTS_JSON);
    if (
      requiresTelegramPhoneVerification(environment) &&
      bots.some((bot) => bot.enabled && !bot.webhookSecret)
    ) {
      throw new Error(
        "Every enabled Telegram bot must configure a webhook secret before Telegram phone verification can be required",
      );
    }
    return {
      ready: piiEncryptionReady,
      authenticationRequired,
      controlledPreview,
      ...summary,
      piiEncryptionRequired,
      piiEncryptionReady,
      piiActiveKeyVersion,
      ...(piiError ? { error: piiError } : {}),
    };
  } catch (error) {
    return {
      ready: false,
      authenticationRequired,
      controlledPreview,
      ...summary,
      piiEncryptionRequired,
      piiEncryptionReady,
      piiActiveKeyVersion,
      error:
        error instanceof Error
          ? error.message
          : "Telegram authentication topology is invalid",
    };
  }
}

/**
 * Produces the only preflight payload allowed in deployment logs. Keep the
 * input environment out of this function's return shape: it contains Bot
 * tokens and PII encryption keys.
 */
function serializePreflightResult(
  result: TelegramAuthenticationPreflight,
): string {
  return JSON.stringify(result);
}

export function serializeDeploymentPreflight(
  environment: AuthenticationEnvironment = process.env,
): string {
  return serializePreflightResult(telegramAuthenticationPreflight(environment));
}

function printPreflightAndSetExitCode() {
  const result = telegramAuthenticationPreflight();
  // Never serialize TELEGRAM_BOTS_JSON or a Bot token. Bot IDs are suitable
  // operational identifiers for an approved deployment log. The serializer
  // is separately tested against both Bot and PII secret values.
  console.log(serializePreflightResult(result));
  if (!result.ready) process.exitCode = 1;
}

if (process.argv[1]?.endsWith("deployment-preflight.js")) {
  printPreflightAndSetExitCode();
}
