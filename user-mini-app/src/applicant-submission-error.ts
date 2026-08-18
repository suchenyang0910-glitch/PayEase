import type { LanguageCode } from "@payease/v1-domain";

const SUBMISSION_ERROR_MESSAGES: Readonly<
  Record<string, Readonly<Record<LanguageCode, string>>>
> = {
  // Keep identity-collision feedback useful without revealing another
  // applicant's application number, review state, factory, or Telegram account.
  IDENTITY_DOCUMENT_ACTIVE_APPLICATION_EXISTS: {
    "zh-CN": "该证件已有正在处理的申请。如认为有误，请联系在线客服。",
    km: "ឯកសារអត្តសញ្ញាណនេះមានពាក្យស្នើសុំកំពុងដំណើរការ។ ប្រសិនបើអ្នកគិតថាវាមិនត្រឹមត្រូវ សូមទាក់ទងសេវាអតិថិជនតាមអនឡាញ។",
    en: "An application is already being processed for this identity document. If you believe this is incorrect, contact online support.",
  },
  TELEGRAM_AUTH_REQUIRED: {
    "zh-CN": "当前登录状态已失效，请返回 Telegram 重新进入后再提交申请。",
    km: "ស្ថានភាពចូលប្រើបច្ចុប្បន្នបានផុតសុពលភាព។ សូមត្រឡប់ទៅ Telegram ហើយចូលមកវិញ មុននឹងដាក់ពាក្យម្តងទៀត។",
    en: "Your session has expired. Return to Telegram and reopen PayEase before submitting again.",
  },
  TELEGRAM_USER_REFERENCE_REQUIRED: {
    "zh-CN": "当前会话信息不完整，请返回 Telegram 重新进入后再提交申请。",
    km: "ព័ត៌មានសម័យបច្ចុប្បន្នមិនពេញលេញទេ។ សូមត្រឡប់ទៅ Telegram ហើយចូលមកវិញ មុននឹងដាក់ពាក្យម្តងទៀត។",
    en: "Your session information is incomplete. Return to Telegram and reopen PayEase before submitting again.",
  },
  PERSONAL_PROFILE_REQUIRED: {
    "zh-CN": "请先完整填写基础资料后再提交申请。",
    km: "សូមបំពេញព័ត៌មានមូលដ្ឋានឱ្យពេញលេញ មុននឹងដាក់ពាក្យ។",
    en: "Complete the basic profile information before submitting the application.",
  },
  EMPLOYER_TENANT_REQUIRED: {
    "zh-CN": "请先选择所属工厂后再提交申请。",
    km: "សូមជ្រើសរោងចក្ររបស់អ្នក មុននឹងដាក់ពាក្យ។",
    en: "Choose your factory before submitting the application.",
  },
  EMPLOYER_TENANT_UNAVAILABLE: {
    "zh-CN": "当前所属工厂暂不可用，请重新选择或联系在线客服。",
    km: "រោងចក្រដែលបានជ្រើសបច្ចុប្បន្នមិនអាចប្រើបានទេ។ សូមជ្រើសរើសម្តងទៀត ឬទាក់ទងសេវាអតិថិជនតាមអនឡាញ។",
    en: "The selected factory is currently unavailable. Choose another factory or contact online support.",
  },
  IDENTITY_DOCUMENT_REQUIRED: {
    "zh-CN": "请先补充证件信息后再提交申请。",
    km: "សូមបំពេញព័ត៌មានឯកសារអត្តសញ្ញាណ មុននឹងដាក់ពាក្យ។",
    en: "Add your identity document information before submitting the application.",
  },
  AMOUNT_OUT_OF_RANGE: {
    "zh-CN": "申请金额需在 USD 10 至 USD 500 之间。",
    km: "ចំនួនស្នើសុំត្រូវស្ថិតនៅចន្លោះ USD 10 ដល់ USD 500។",
    en: "The requested amount must be between USD 10 and USD 500.",
  },
  TELEGRAM_PHONE_VERIFICATION_REQUIRED: {
    "zh-CN": "请先完成 Telegram 手机号验证，再提交申请。",
    km: "សូមបញ្ចប់ការផ្ទៀងផ្ទាត់លេខទូរស័ព្ទ Telegram ជាមុនសិន មុននឹងដាក់ពាក្យ។",
    en: "Complete Telegram phone verification before submitting the application.",
  },
  TELEGRAM_PHONE_MISMATCH: {
    "zh-CN": "你填写的手机号与 Telegram 已验证手机号不一致，请检查后重试。",
    km: "លេខទូរស័ព្ទដែលអ្នកបានបំពេញ មិនត្រូវនឹងលេខដែលបានផ្ទៀងផ្ទាត់ក្នុង Telegram ទេ។ សូមពិនិត្យហើយព្យាយាមម្តងទៀត។",
    en: "The phone number you entered does not match your verified Telegram phone number. Check it and try again.",
  },
  REAPPLICATION_REJECTION_CONDITION_UNRESOLVED: {
    "zh-CN": "当前申请仍在等待期内，请稍后再重新提交。",
    km: "ពាក្យសុំបច្ចុប្បន្ននៅតែស្ថិតក្នុងរយៈពេលរង់ចាំ។ សូមដាក់ស្នើម្តងទៀតនៅពេលក្រោយ។",
    en: "Your current application is still in the waiting period. Submit again later.",
  },
  REAPPLICATION_ACTIVE_APPLICATION_EXISTS: {
    "zh-CN": "你已有正在处理的申请，请先查看当前申请进度。",
    km: "អ្នកមានពាក្យស្នើសុំកំពុងដំណើរការរួចហើយ។ សូមពិនិត្យមើលវឌ្ឍនភាពនៃពាក្យសុំនោះជាមុនសិន។",
    en: "You already have an application in progress. Review its status before starting another one.",
  },
  PERSONAL_DATA_STORAGE_UNAVAILABLE: {
    "zh-CN": "系统暂时无法保存你的资料，请稍后重试。",
    km: "ប្រព័ន្ធមិនអាចរក្សាទុកព័ត៌មានរបស់អ្នកបានជាបណ្តោះអាសន្នទេ។ សូមព្យាយាមម្តងទៀតនៅពេលក្រោយ។",
    en: "We cannot save your profile details right now. Please try again shortly.",
  },
  IDENTITY_DOCUMENT_STORAGE_UNAVAILABLE: {
    "zh-CN": "系统暂时无法保存证件资料，请稍后重试。",
    km: "ប្រព័ន្ធមិនអាចរក្សាទុកព័ត៌មានឯកសារអត្តសញ្ញាណបានជាបណ្តោះអាសន្នទេ។ សូមព្យាយាមម្តងទៀតនៅពេលក្រោយ។",
    en: "We cannot save your identity document right now. Please try again shortly.",
  },
  TELEGRAM_PHONE_STORAGE_UNAVAILABLE: {
    "zh-CN": "暂时无法校验 Telegram 手机号，请稍后重试。",
    km: "មិនអាចផ្ទៀងផ្ទាត់លេខទូរស័ព្ទ Telegram បានជាបណ្តោះអាសន្នទេ។ សូមព្យាយាមម្តងទៀតនៅពេលក្រោយ។",
    en: "We cannot verify your Telegram phone number right now. Please try again shortly.",
  },
};

export function applicantSubmissionErrorMessage(
  code: string | undefined,
  language: LanguageCode,
): string | undefined {
  if (!code) return undefined;
  return SUBMISSION_ERROR_MESSAGES[code]?.[language];
}
