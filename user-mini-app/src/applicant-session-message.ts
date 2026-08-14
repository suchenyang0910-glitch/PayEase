import type { LanguageCode } from "@payease/v1-domain";

/**
 * A 401/403 on an applicant-only endpoint must not be presented as a generic
 * status refresh failure.  A disabled or expired Telegram Bot session is
 * recoverable by reopening the Mini App from another enabled PayEase Bot.
 */
export function applicantSessionRecoveryMessage(
  language: LanguageCode,
): string {
  switch (language) {
    case "zh-CN":
      return "Telegram 登录已失效，或当前 Bot 暂不可用。请从可用的 PayEase Telegram Bot 重新打开页面。";
    case "km":
      return "វគ្គ Telegram របស់អ្នកបានផុតកំណត់ ឬ Bot បច្ចុប្បន្នមិនអាចប្រើបាន។ សូមបើក PayEase ឡើងវិញពី Telegram Bot ដែលអាចប្រើបាន។";
    default:
      return "Your Telegram session has expired or this Bot is unavailable. Reopen PayEase from an available PayEase Telegram Bot.";
  }
}
