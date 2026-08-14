import {
  configuredTelegramBots,
  requireTelegramRecoveryTopology,
  type TelegramBotConfig,
} from "./telegram-auth.js";
import {
  isControlledPreview,
  requiresTelegramAuthentication,
} from "./telegram-auth-policy.js";

type AuthenticationEnvironment = Readonly<{
  PAYEASE_DEPLOYMENT_MODE?: string;
  PAYEASE_ALLOW_UNAUTHENTICATED_PREVIEW?: string;
  REQUIRE_TELEGRAM_AUTH?: string;
  TELEGRAM_BOTS_JSON?: string;
}>;

export type TelegramAuthenticationPreflight = Readonly<{
  ready: boolean;
  authenticationRequired: boolean;
  controlledPreview: boolean;
  configuredBotIds: string[];
  enabledBotCount: number;
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
    };
  }
  try {
    requireTelegramRecoveryTopology(environment.TELEGRAM_BOTS_JSON);
    return {
      ready: true,
      authenticationRequired,
      controlledPreview,
      ...summary,
    };
  } catch (error) {
    return {
      ready: false,
      authenticationRequired,
      controlledPreview,
      ...summary,
      error:
        error instanceof Error
          ? error.message
          : "Telegram authentication topology is invalid",
    };
  }
}

function printPreflightAndSetExitCode() {
  const result = telegramAuthenticationPreflight();
  // Never serialize TELEGRAM_BOTS_JSON or a Bot token. Bot IDs are suitable
  // operational identifiers for an approved deployment log.
  console.log(JSON.stringify(result));
  if (!result.ready) process.exitCode = 1;
}

if (process.argv[1]?.endsWith("deployment-preflight.js")) {
  printPreflightAndSetExitCode();
}
