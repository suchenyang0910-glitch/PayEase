import type { LanguageCode } from "@payease/v1-domain";

// Keep identity-collision feedback useful without revealing another
// applicant's application number, review state, factory, or Telegram account.
export function applicantSubmissionErrorMessage(
  code: string | undefined,
  language: LanguageCode,
): string | undefined {
  if (code !== "IDENTITY_DOCUMENT_ACTIVE_APPLICATION_EXISTS") return undefined;
  if (language === "zh-CN") {
    return "该证件已有正在处理的申请。如认为有误，请联系客户服务。";
  }
  if (language === "km") {
    return "ឯកសារអត្តសញ្ញាណនេះមានពាក្យស្នើសុំកំពុងដំណើរការ។ ប្រសិនបើអ្នកគិតថាវាមិនត្រឹមត្រូវ សូមទាក់ទងផ្នែកសេវាកម្មអតិថិជន។";
  }
  return "An application is already being processed for this identity document. If you believe this is incorrect, contact customer service.";
}
