import { useEffect, useRef, useState } from "react";
import type { LanguageCode } from "@payease/v1-domain";
import {
  applicantPhase,
  progressStepForPhase,
  type ApplicantPhase,
} from "./application-progress.ts";
import {
  prependApplicationHistory,
  type ApplicationHistoryEntry,
} from "./application-history.ts";
import {
  applicantResult,
  borrowEntryAction,
  canWithdrawApplicantApplication,
  type ApplicantResult,
} from "./application-result.ts";
import { isControlledPreviewBuild } from "./deployment-mode.ts";
import { formatUsdMinor } from "./format-usd-minor.ts";
import { usdInputToMinor } from "./usd-amount.ts";
import { applicantProfileValidationError } from "./applicant-profile.ts";
import { applicantSubmissionErrorMessage } from "./applicant-submission-error.ts";
import { notificationDeepLink } from "./applicant-notification.ts";
import {
  requestTelegramSingleLocation,
  type SingleKycLocationSnapshot,
} from "./telegram-location.ts";
import { requestTelegramPhoneContact } from "./telegram-phone-contact.ts";
import { resolveTelegramInitData } from "./telegram-webapp-init-data.ts";
import {
  APPLICATION_FORM_STEPS,
  useApplicationDraft,
  type ApplicationDraftValues,
  type ApplicationFormStep,
} from "./hooks/useApplicationDraft.ts";
import { useApplicantNotifications } from "./hooks/useApplicantNotifications.ts";
import { useApplicantSession } from "./hooks/useApplicantSession.ts";
import {
  parseApplicantServiceCaseList,
  applicantServiceCaseLabel,
  type ApplicantServiceCase,
} from "./service-case-list.ts";
import { HomePage } from "./pages/HomePage.tsx";
import { HelpDetailPage } from "./pages/HelpDetailPage.tsx";
import { OrderDetailPage } from "./pages/OrderDetailPage.tsx";
import { RepaymentPage } from "./pages/RepaymentPage.tsx";
import { ApplicationFlow } from "./features/application/ApplicationFlow.tsx";
import { NotificationsWorkspace } from "./features/notifications/NotificationsWorkspace.tsx";
import { OrdersWorkspace } from "./features/orders/OrdersWorkspace.tsx";
import { ProfileWorkspace } from "./features/profile/ProfileWorkspace.tsx";
import { USER_SKELETON_COPY, type UserTab } from "./copy/user-copy.ts";
import "./app.css";

type Stage = "welcome" | "details" | "submitted" | "offer";
type OrdersView = "borrow" | "records" | "reassessment";
type RecordFilter =
  "ALL" | "IN_REVIEW" | "PENDING_CONTRACT" | "ACTIVE" | "SETTLED" | "CLOSED";
type RepaymentProofStatus =
  "NOT_SUBMITTED" | "UNDER_REVIEW" | "NEEDS_MORE" | "RECONCILED" | "EXCEPTION";
type ApplicantTimelineEntry = {
  occurredAt: string;
  entryType:
    | "STATUS"
    | "APPROVAL"
    | "PAYMENT_PROOF_SUBMITTED"
    | "PAYMENT_PROOF_REVIEWED"
    | "REASSESSMENT_SUBMITTED"
    | "REASSESSMENT_APPROVAL";
  status?: string;
  stage?: string;
  decision?: string;
  actorUserRef?: string;
  actorRole?: string;
  reasonCode?: string;
  referenceNo?: string;
};

type KycLocationStatus = {
  assessmentResult:
    "MATCH" | "OUT_OF_ZONE" | "OUT_OF_COUNTRY" | "LOW_ACCURACY" | "UNAVAILABLE";
  submittedAt: string;
};

type UserSummary = {
  application: {
    applicationNo: string;
    status: string;
    requestedAmountMinor: string;
    currency: string;
    tenorDays: number;
    approvedAmountMinor: string | null;
    rejectionConditionResolved: boolean;
    rejectionCoolingOffEndsAt?: string | null;
    rejectionCoolingOffDaysRemaining?: number | null;
    rejectionNoticeCode:
      | "INFORMATION_INCOMPLETE"
      | "EMPLOYMENT_OR_INCOME_UNVERIFIED"
      | "PRODUCT_ELIGIBILITY_NOT_MET"
      | "LENDER_DECISION"
      | null;
    supplementRequested: boolean;
    employerTenantDisplayName?: string | null;
  };
  terms: null | {
    approvedAmountMinor: string;
    serviceFeeMinor: string;
    totalRepayableMinor: string;
    installmentCount: number;
    firstDueDate: string;
  };
  quote?: null | {
    principalAmountMinor: string;
    actualDisbursementAmountMinor: string;
    lenderInterestMinor: string;
    totalRepaymentAmountMinor: string;
    brokerageRemunerationReceivableMinor: string;
    productRuleVersion: string;
    brokerageRemunerationRuleVersion: string;
    lenderInterestRuleVersion: string;
    installmentCount: number;
    firstDueDate: string;
    repaymentGraceDays: number;
  };
  repayment: {
    periodCount: number;
    paidPeriods: number;
    unpaidPeriods: number;
    overduePeriods: number;
    totalDueMinor: string;
    totalPaidMinor: string;
    outstandingMinor: string;
    overdueOutstandingMinor: string;
    nextInstallment: null | {
      installmentNo: number;
      dueDate: string;
      amountDueMinor: string;
    };
    installments: Array<{
      installmentNo: number;
      dueDate: string;
      amountDueMinor: string;
      amountPaidMinor: string;
      status: "PENDING" | "PAID";
    }>;
  };
  workflow?: {
    workflowVersion: "LEGACY_V1" | "SALARY_LOAN_V2";
    selectedRepaymentMethod?: RepaymentMethod | null;
    availableRepaymentMethods?: RepaymentMethod[];
    collectionScope?: "PRINCIPAL_AND_INTEREST" | null;
    employerVerificationAuthorized?: boolean;
    serviceAgreementAuthorized?: boolean;
    postDisbursementBrokerageAuthorized?: boolean;
  };
  recordDetail?: {
    createdAt: string;
    updatedAt: string;
    canUploadPaymentProof: boolean;
    canRequestReassessment: boolean;
  };
  repaymentProof?: null | {
    proofNo: string;
    status: Exclude<RepaymentProofStatus, "NOT_SUBMITTED">;
    fileName: string;
    contentType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
    transferReference?: string;
    submittedAt: string;
  };
  reassessmentRequest?: null | {
    requestNo: string;
    status: "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "DECLINED" | "CLOSED";
    addressChanged: boolean;
    employerUpdated: boolean;
    wealthProofDeclared: boolean;
    submittedAt: string;
  };
  kycLocation?: null | KycLocationStatus;
  timeline?: ApplicantTimelineEntry[];
};

type RepaymentMethod = "SMILE_WALLET_AUTHORIZATION";

type ApplicationListEntry = ApplicationHistoryEntry;

type EmployerTenantDirectory = {
  tenants: Array<{
    id: string;
    displayName: string;
  }>;
};

type TelegramPhoneVerification = {
  verified: boolean;
  required: boolean;
  verifiedAt?: string;
};

type VerifiedProfileView = {
  displayName: string | null;
  username: string | null;
  photoUrl: string | null;
  telegramVerified: boolean;
  phoneVerificationStatus: "VERIFIED" | "PENDING" | "NOT_STARTED";
  employerDisplayName: string | null;
  language: LanguageCode;
  activeApplication?: {
    referenceMasked?: string;
    status: string;
    nextAction: string;
  };
  activeBill?: {
    referenceMasked?: string;
    status: string;
    dueDate: string | null;
  };
  kycLocation?: null | KycLocationStatus;
};

function factoryFormCopy(language: LanguageCode) {
  if (language === "zh-CN") {
    return {
      factory: "选择工厂",
      factoryPlaceholder: "请选择您工作的工厂",
      identityType: "证件类型",
      nationalId: "身份证",
      passport: "护照",
      identityNumber: "身份证/护照号码",
      required: "请选择工厂并填写有效证件号码。",
    };
  }
  if (language === "km") {
    return {
      factory: "ជ្រើសរោងចក្រ",
      factoryPlaceholder: "សូមជ្រើសរើសរោងចក្រដែលអ្នកធ្វើការ",
      identityType: "ប្រភេទឯកសារ",
      nationalId: "អត្តសញ្ញាណប័ណ្ណ",
      passport: "លិខិតឆ្លងដែន",
      identityNumber: "លេខអត្តសញ្ញាណប័ណ្ណ / លិខិតឆ្លងដែន",
      required: "សូមជ្រើសរើសរោងចក្រ និងបំពេញលេខឯកសារដែលមានសុពលភាព។",
    };
  }
  return {
    factory: "Select factory",
    factoryPlaceholder: "Choose the factory where you work",
    identityType: "Document type",
    nationalId: "National ID",
    passport: "Passport",
    identityNumber: "National ID / passport number",
    required: "Select your factory and enter a valid identity document number.",
  };
}

function phoneVerificationCopy(language: LanguageCode) {
  if (language === "zh-CN") {
    return {
      verified: "Telegram 手机号已验证",
      required: "提交申请前需通过 Telegram 验证手机号。",
      request: "通过 Telegram 验证手机号",
      check: "检查手机号验证",
      refresh: "刷新验证状态",
      sent: "Telegram 已收到请求，请返回后刷新验证状态。",
      cancelled: "你取消了 Telegram 手机号验证。",
      unsupported: "请在 Telegram 内打开页面以验证手机号。",
    };
  }
  if (language === "km") {
    return {
      verified: "លេខទូរស័ព្ទ Telegram ត្រូវបានផ្ទៀងផ្ទាត់",
      required: "ត្រូវផ្ទៀងផ្ទាត់លេខទូរស័ព្ទតាម Telegram មុនដាក់ពាក្យ។",
      request: "ផ្ទៀងផ្ទាត់លេខទូរស័ព្ទតាម Telegram",
      check: "ពិនិត្យការផ្ទៀងផ្ទាត់លេខទូរស័ព្ទ",
      refresh: "ធ្វើបច្ចុប្បន្នភាពស្ថានភាព",
      sent: "Telegram បានទទួលសំណើ។ សូមត្រឡប់មកវិញ ហើយធ្វើបច្ចុប្បន្នភាពស្ថានភាព។",
      cancelled: "អ្នកបានបោះបង់ការផ្ទៀងផ្ទាត់លេខទូរស័ព្ទ Telegram។",
      unsupported:
        "សូមបើកទំព័រនេះនៅក្នុង Telegram ដើម្បីផ្ទៀងផ្ទាត់លេខទូរស័ព្ទ។",
    };
  }
  return {
    verified: "Telegram phone number verified",
    required: "Verify your phone number through Telegram before submitting.",
    request: "Verify phone number with Telegram",
    check: "Check phone verification",
    refresh: "Refresh verification status",
    sent: "Telegram received the request. Return here and refresh the verification status.",
    cancelled: "You cancelled Telegram phone verification.",
    unsupported: "Open this page in Telegram to verify your phone number.",
  };
}

function kycLocationCopy(language: LanguageCode) {
  if (language === "zh-CN") {
    return {
      title: "当前位置核验",
      description:
        "定位仅用于本次身份与服务区域核验，不会持续追踪。若无法获取定位，工作人员可能联系你补充资料。",
      authorize: "授权当前位置",
      confirm: "确认提交定位核验",
      recapture: "重新获取定位",
      refresh: "刷新核验状态",
      idle: "尚未提交定位核验",
      pending: "已获取当前位置，请确认后再提交核验",
      success: "已提交服务区域核验",
      review: "资料将进入人工复核",
      lowAccuracy: "定位精度不足，请在信号更好的位置重试",
      unavailable: "当前暂无法获取定位，可继续提交资料",
      cancelled: "本次未提交定位核验",
      unsupported: "请在 Telegram 内完成当前位置授权",
      capturedAt: "定位获取时间",
      accuracy: "定位精度",
      meters: "米",
    };
  }
  if (language === "km") {
    return {
      title: "ការផ្ទៀងផ្ទាត់ទីតាំងបច្ចុប្បន្ន",
      description:
        "ទីតាំងត្រូវបានប្រើសម្រាប់ការផ្ទៀងផ្ទាត់អត្តសញ្ញាណ និងតំបន់សេវាកម្មតែម្តងប៉ុណ្ណោះ ហើយមិនតាមដានជាបន្តទេ។ ប្រសិនបើមិនអាចយកទីតាំងបាន បុគ្គលិកអាចទាក់ទងអ្នកសម្រាប់ឯកសារបន្ថែម។",
      authorize: "អនុញ្ញាតទីតាំងបច្ចុប្បន្ន",
      confirm: "បញ្ជាក់ដាក់ស្នើការផ្ទៀងផ្ទាត់ទីតាំង",
      recapture: "យកទីតាំងម្តងទៀត",
      refresh: "ផ្ទុកស្ថានភាពឡើងវិញ",
      idle: "មិនទាន់ដាក់ការផ្ទៀងផ្ទាត់ទីតាំងទេ",
      pending: "បានយកទីតាំងរួចហើយ សូមបញ្ជាក់មុនដាក់ស្នើ",
      success: "ការផ្ទៀងផ្ទាត់តំបន់សេវាកម្មត្រូវបានដាក់ស្នើរួច",
      review: "ទិន្នន័យនេះនឹងចូលទៅការពិនិត្យដោយមនុស្ស",
      lowAccuracy:
        "ភាពត្រឹមត្រូវនៃទីតាំងមិនគ្រប់គ្រាន់ទេ សូមសាកល្បងម្ដងទៀតនៅកន្លែងដែលមានសញ្ញាល្អជាងនេះ",
      unavailable:
        "បច្ចុប្បន្នមិនអាចយកទីតាំងបានទេ ប៉ុន្តែអ្នកអាចបន្តដាក់ព័ត៌មានបាន",
      cancelled: "មិនបានដាក់ការផ្ទៀងផ្ទាត់ទីតាំងលើកនេះទេ",
      unsupported: "សូមបើក PayEase ក្នុង Telegram ដើម្បីអនុញ្ញាតទីតាំង",
      capturedAt: "ពេលយកទីតាំង",
      accuracy: "ភាពត្រឹមត្រូវ",
      meters: "ម៉ែត្រ",
    };
  }
  return {
    title: "Current location check",
    description:
      "Location is used only for this identity and service-area check. We do not track you continuously. If it cannot be collected, our team may contact you for supporting details.",
    authorize: "Authorize current location",
    confirm: "Confirm and submit location check",
    recapture: "Capture location again",
    refresh: "Refresh location status",
    idle: "No location check submitted yet",
    pending: "Location captured. Please confirm before submitting the check.",
    success: "Service-area check submitted",
    review: "This application will continue to manual review",
    lowAccuracy:
      "Location accuracy is too low. Please try again where the signal is stronger.",
    unavailable:
      "Location is temporarily unavailable. You may still continue your submission.",
    cancelled: "Location check was not submitted this time.",
    unsupported: "Open PayEase inside Telegram to authorize location.",
    capturedAt: "Captured at",
    accuracy: "Accuracy",
    meters: "m",
  };
}

function trustedTelegramEntryPoint(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  const supportedHost = url.hostname === "t.me" || url.hostname === "www.t.me";
  if (
    url.protocol !== "https:" ||
    !supportedHost ||
    url.username ||
    url.password ||
    url.hash ||
    !/^\/[A-Za-z0-9_]{5,}(?:\/[A-Za-z0-9_]{1,64})?$/.test(url.pathname)
  ) {
    return undefined;
  }
  return url.toString();
}

function recoveryEntryPointLabel(
  language: LanguageCode,
  index: number,
): string {
  if (language === "zh-CN")
    return `通过备用 Telegram Bot ${index + 1} 重新打开`;
  if (language === "km") return `បើកឡើងវិញតាម Telegram Bot បម្រុង ${index + 1}`;
  return `Reopen from backup Telegram Bot ${index + 1}`;
}

function ApplicantError({
  message,
  entryPoints,
  language,
}: {
  message: string;
  entryPoints: string[];
  language: LanguageCode;
}): JSX.Element {
  return (
    <div className="error" role="alert">
      <p>{message}</p>
      {entryPoints.length ? (
        <div
          className="recovery-entrypoints"
          aria-label="Telegram recovery options"
        >
          {entryPoints.map((entryPoint, index) => (
            <a
              key={entryPoint}
              href={entryPoint}
              target="_blank"
              rel="noreferrer"
            >
              {recoveryEntryPointLabel(language, index)}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function applicantRejectionNotice(
  noticeCode: UserSummary["application"]["rejectionNoticeCode"],
  language: LanguageCode,
): string | undefined {
  if (!noticeCode) return undefined;
  const copy: Record<
    LanguageCode,
    Record<NonNullable<typeof noticeCode>, string>
  > = {
    en: {
      INFORMATION_INCOMPLETE:
        "Please complete or correct the application information before applying again.",
      EMPLOYMENT_OR_INCOME_UNVERIFIED:
        "Please complete employment or income verification before applying again.",
      PRODUCT_ELIGIBILITY_NOT_MET:
        "The current product eligibility requirements are not met. Contact the licensed lender for available options.",
      LENDER_DECISION:
        "This application was not approved. Contact the licensed lender's customer service team if you need assistance.",
    },
    "zh-CN": {
      INFORMATION_INCOMPLETE: "请补充或更正申请资料后再重新申请。",
      EMPLOYMENT_OR_INCOME_UNVERIFIED: "请先完成在职或收入核验后再重新申请。",
      PRODUCT_ELIGIBILITY_NOT_MET:
        "当前未满足产品申请条件；如需协助，请联系客服了解可申请产品。",
      LENDER_DECISION: "本次申请未获批准；如需协助，请联系客服。",
    },
    km: {
      INFORMATION_INCOMPLETE:
        "សូមបំពេញ ឬកែតម្រូវព័ត៌មានពាក្យសុំ មុនពេលដាក់ពាក្យម្ដងទៀត។",
      EMPLOYMENT_OR_INCOME_UNVERIFIED:
        "សូមបំពេញការផ្ទៀងផ្ទាត់ការងារ ឬប្រាក់ចំណូល មុនពេលដាក់ពាក្យម្ដងទៀត។",
      PRODUCT_ELIGIBILITY_NOT_MET:
        "លក្ខខណ្ឌផលិតផលបច្ចុប្បន្នមិនត្រូវគ្នាទេ។ សូមទាក់ទងស្ថាប័នផ្តល់កម្ចី។",
      LENDER_DECISION:
        "ពាក្យសុំរបស់អ្នកមិនត្រូវបានអនុម័តទេ។ សូមទាក់ទងផ្នែកសេវាកម្មអតិថិជនរបស់ស្ថាប័នផ្តល់កម្ចី។",
    },
  };
  return copy[language][noticeCode];
}

function applicantCoolingOffDaysRemaining(
  summary: UserSummary | undefined,
): number | null {
  const days = summary?.application.rejectionCoolingOffDaysRemaining;
  if (typeof days !== "number" || !Number.isFinite(days)) return null;
  return Math.max(1, Math.ceil(days));
}

function applicantPhaseLabel(
  phase: ApplicantPhase,
  language: LanguageCode,
): string {
  const labelsByLanguage: Record<
    LanguageCode,
    Record<ApplicantPhase, string>
  > = {
    "zh-CN": {
      "broker-review": "资料审核中",
      "employer-verification": "企业在职与薪资核验中",
      "lender-review": "额度审核中",
      "contract-and-disbursement": "签约 / 放款处理中",
      repayment: "还款进行中",
      settled: "已结清",
      rejected: "未获批准",
    },
    en: {
      "broker-review": "Broker document review",
      "employer-verification": "Employer verification",
      "lender-review": "Licensed lender review",
      "contract-and-disbursement": "Contract / disbursement in progress",
      repayment: "Repayment in progress",
      settled: "Settled",
      rejected: "Not approved",
    },
    km: {
      "broker-review": "កំពុងពិនិត្យឯកសារដោយក្រុមការងារ",
      "employer-verification": "កំពុងផ្ទៀងផ្ទាត់ដោយក្រុមហ៊ុន",
      "lender-review": "កំពុងពិនិត្យដោយស្ថាប័នមានអាជ្ញាប័ណ្ណ",
      "contract-and-disbursement": "កំពុងចុះកិច្ចសន្យា / បើកប្រាក់",
      repayment: "កំពុងសងប្រាក់",
      settled: "បានបិទបញ្ចប់",
      rejected: "មិនត្រូវបានអនុម័ត",
    },
  };
  return labelsByLanguage[language][phase];
}

function applicantLifecycleCopy(
  result: ApplicantResult,
  language: LanguageCode,
): { title: string; message: string } | undefined {
  const copy: Partial<
    Record<
      ApplicantResult,
      Record<LanguageCode, { title: string; message: string }>
    >
  > = {
    "contract-processing": {
      en: {
        title: "Contract and disbursement in progress",
        message:
          "Your confirmation is recorded. The licensed lender is completing its contract and disbursement process.",
      },
      "zh-CN": {
        title: "签约与放款处理中",
        message: "你的确认已记录，合同与放款流程正在处理中。",
      },
      km: {
        title: "កំពុងដំណើរការកិច្ចសន្យា និងបើកប្រាក់",
        message:
          "ការបញ្ជាក់របស់អ្នកត្រូវបានកត់ត្រា។ ស្ថាប័នមានអាជ្ញាប័ណ្ណកំពុងបំពេញកិច្ចសន្យា និងដំណើរការបើកប្រាក់។",
      },
    },
    funded: {
      en: {
        title: "Loan disbursed",
        message:
          "The licensed lender has recorded the disbursement. Your repayment schedule will appear when it becomes active.",
      },
      "zh-CN": {
        title: "贷款已放款",
        message: "放款已记录；还款计划生效后将在此显示。",
      },
      km: {
        title: "បានបើកប្រាក់កម្ចី",
        message:
          "ស្ថាប័នមានអាជ្ញាប័ណ្ណបានកត់ត្រាការបើកប្រាក់។ តារាងសងប្រាក់នឹងបង្ហាញនៅទីនេះពេលចាប់ផ្តើមមានសុពលភាព។",
      },
    },
    "repayment-active": {
      en: {
        title: "Repayment in progress",
        message: "Review the paid, unpaid and next-payment details below.",
      },
      "zh-CN": {
        title: "还款进行中",
        message: "请在下方查看已还、未还及下一期还款信息。",
      },
      km: {
        title: "កំពុងសងប្រាក់",
        message:
          "សូមពិនិត្យព័ត៌មានការបង់រួច មិនទាន់បង់ និងការបង់បន្ទាប់ខាងក្រោម។",
      },
    },
    settled: {
      en: {
        title: "Loan settled",
        message:
          "All recorded repayment obligations for this loan are complete.",
      },
      "zh-CN": {
        title: "贷款已结清",
        message: "该笔贷款的已记录还款义务均已完成。",
      },
      km: {
        title: "កម្ចីបានបិទបញ្ចប់",
        message:
          "កាតព្វកិច្ចសងប្រាក់ដែលបានកត់ត្រាទាំងអស់សម្រាប់កម្ចីនេះត្រូវបានបំពេញ។",
      },
    },
  };
  return copy[result]?.[language];
}

function applicationSectionCopy(language: LanguageCode) {
  if (language === "zh-CN") {
    return {
      address: "现居地址",
      basicProfile: "基础资料",
      identityContacts: "身份与联系人",
      employerPayout: "企业与收款账户",
      supplements: "补充材料",
      agreement: "服务协议与授权",
      submitConfirm: "提交确认",
      contact1: "紧急联系人 1",
      contact1Phone: "紧急联系人 1 手机号",
      contact2: "紧急联系人 2",
      contact2Phone: "紧急联系人 2 手机号",
      bankName: "收款银行",
      bankAccount: "收款账号 / 卡号",
      accountHolder: "持卡人姓名",
      liveness: "活体材料已准备",
      wealthProof: "补充收入或财富证明（可选）",
      agreementSummary:
        "服务协议、数据授权、企业核验授权将随本次申请一并确认。",
      confirmSummary:
        "点击确认提交仅表示申请已送审，不代表已获批。借款合同将在审批通过后单独展示。",
      saveAndContinue: "保存并继续",
      submitApplication: "确认提交",
      preparation: "申请前准备：身份资料、两位联系人、所属工厂、收款账户。",
    };
  }
  if (language === "km") {
    return {
      address: "អាសយដ្ឋានបច្ចុប្បន្ន",
      basicProfile: "ព័ត៌មានមូលដ្ឋាន",
      identityContacts: "អត្តសញ្ញាណ និងអ្នកទំនាក់ទំនង",
      employerPayout: "ក្រុមហ៊ុន និងគណនីទទួលប្រាក់",
      supplements: "ឯកសារបន្ថែម",
      agreement: "កិច្ចព្រមព្រៀង និងការអនុញ្ញាត",
      submitConfirm: "បញ្ជាក់ការដាក់ស្នើ",
      contact1: "អ្នកទំនាក់ទំនងបន្ទាន់ 1",
      contact1Phone: "លេខទូរស័ព្ទអ្នកទំនាក់ទំនង 1",
      contact2: "អ្នកទំនាក់ទំនងបន្ទាន់ 2",
      contact2Phone: "លេខទូរស័ព្ទអ្នកទំនាក់ទំនង 2",
      bankName: "ធនាគារទទួលប្រាក់",
      bankAccount: "លេខគណនី / កាត",
      accountHolder: "ឈ្មោះម្ចាស់គណនី",
      liveness: "បានរៀបចំឯកសារផ្ទៀងផ្ទាត់ជីវិត",
      wealthProof: "បន្ថែមភស្តុតាងចំណូល ឬទ្រព្យសម្បត្តិ (ស្រេចចិត្ត)",
      agreementSummary:
        "កិច្ចព្រមព្រៀងសេវាកម្ម ការអនុញ្ញាតទិន្នន័យ និងការផ្ទៀងផ្ទាត់ក្រុមហ៊ុន នឹងត្រូវបញ្ជាក់ជាមួយពាក្យសុំនេះ។",
      confirmSummary:
        "ការចុចបញ្ជាក់មានន័យតែថាពាក្យសុំត្រូវបានដាក់ស្នើ មិនមែនអនុម័តរួចទេ។ កិច្ចសន្យាប្រាក់កម្ចីនឹងបង្ហាញបន្ទាប់ពីអនុម័ត។",
      saveAndContinue: "រក្សាទុក និងបន្ត",
      submitApplication: "បញ្ជាក់ការដាក់ស្នើ",
      preparation:
        "ការរៀបចំមុនដាក់ពាក្យ៖ ឯកសារអត្តសញ្ញាណ អ្នកទំនាក់ទំនង 2 នាក់ រោងចក្រ និងគណនីទទួលប្រាក់។",
    };
  }
  return {
    address: "Current address",
    basicProfile: "Basic profile",
    identityContacts: "Identity & contacts",
    employerPayout: "Employer & payout account",
    supplements: "Supplementary materials",
    agreement: "Service agreement & consent",
    submitConfirm: "Submit confirmation",
    contact1: "Emergency contact 1",
    contact1Phone: "Emergency contact 1 phone",
    contact2: "Emergency contact 2",
    contact2Phone: "Emergency contact 2 phone",
    bankName: "Receiving bank",
    bankAccount: "Account / card number",
    accountHolder: "Account holder name",
    liveness: "Liveness material prepared",
    wealthProof: "Add income or wealth proof (optional)",
    agreementSummary:
      "The service agreement, data authorization, and employer-verification authorization are confirmed before submission.",
    confirmSummary:
      "Submitting confirms review intake only. It does not mean approval, and the loan contract appears only after approval.",
    saveAndContinue: "Save and continue",
    submitApplication: "Confirm submission",
    preparation:
      "Prepare your identity document, two contacts, factory information, and payout account.",
  };
}

function applicationStepCopy(
  language: LanguageCode,
): Readonly<Record<ApplicationFormStep, { title: string; hint: string }>> {
  if (language === "zh-CN") {
    return {
      profile: {
        title: "基础资料",
        hint: "先填写你的基本信息，系统会为你保存当前进度。",
      },
      contacts: {
        title: "联系人",
        hint: "再补充两位紧急联系人，方便审核团队联系核实。",
      },
      payout: {
        title: "工厂与收款账户",
        hint: "继续填写工厂、证件和收款账户信息。",
      },
      supplements: {
        title: "补充资料",
        hint: "按需要勾选补充材料准备情况，下一步进入确认。",
      },
      confirm: {
        title: "确认提交",
        hint: "确认授权与申请摘要后，再正式提交审核。",
      },
    };
  }
  if (language === "km") {
    return {
      profile: {
        title: "ព័ត៌មានមូលដ្ឋាន",
        hint: "បំពេញព័ត៌មានមូលដ្ឋានជាមុនសិន ហើយប្រព័ន្ធនឹងរក្សាទុកវឌ្ឍនភាពបច្ចុប្បន្ន។",
      },
      contacts: {
        title: "អ្នកទំនាក់ទំនង",
        hint: "បន្ទាប់មក បន្ថែមអ្នកទំនាក់ទំនងបន្ទាន់ 2 នាក់ សម្រាប់ការផ្ទៀងផ្ទាត់។",
      },
      payout: {
        title: "រោងចក្រ និងគណនីទទួលប្រាក់",
        hint: "បន្តបំពេញព័ត៌មានរោងចក្រ ឯកសារ និងគណនីទទួលប្រាក់។",
      },
      supplements: {
        title: "ឯកសារបន្ថែម",
        hint: "ជ្រើសរើសស្ថានភាពឯកសារបន្ថែម ហើយបន្តទៅជំហានបញ្ជាក់។",
      },
      confirm: {
        title: "បញ្ជាក់ការដាក់ស្នើ",
        hint: "ពិនិត្យការអនុញ្ញាត និងសេចក្តីសង្ខេប មុនពេលដាក់ស្នើជាផ្លូវការ។",
      },
    };
  }
  return {
    profile: {
      title: "Basic profile",
      hint: "Start with your basic information. We will save your progress for this step.",
    },
    contacts: {
      title: "Contacts",
      hint: "Add two emergency contacts so the review team can verify the application.",
    },
    payout: {
      title: "Factory and payout account",
      hint: "Continue with factory, identity document, and payout account details.",
    },
    supplements: {
      title: "Supplementary materials",
      hint: "Mark the supporting materials you have prepared before the final confirmation.",
    },
    confirm: {
      title: "Confirm and submit",
      hint: "Review the authorization and application summary before final submission.",
    },
  };
}

function stepNavigationCopy(language: LanguageCode): {
  next: string;
  previous: string;
  saved: string;
  summary: string;
  completedLabel: string;
} {
  if (language === "zh-CN") {
    return {
      next: "保存并继续",
      previous: "上一步",
      saved: "当前步骤已保存，下次进入可继续填写。",
      summary: "申请摘要",
      completedLabel: "已完成",
    };
  }
  if (language === "km") {
    return {
      next: "រក្សាទុក និងបន្ត",
      previous: "ត្រឡប់ទៅជំហានមុន",
      saved: "ជំហានបច្ចុប្បន្នត្រូវបានរក្សាទុក ហើយអាចបន្តបានពេលក្រោយ។",
      summary: "សេចក្តីសង្ខេបពាក្យសុំ",
      completedLabel: "បានបញ្ចប់",
    };
  }
  return {
    next: "Save and continue",
    previous: "Previous step",
    saved: "This step is saved. You can continue from here next time.",
    summary: "Application summary",
    completedLabel: "Completed",
  };
}

function applicationHistoryFilter(status: string): RecordFilter {
  if (
    [
      "SUBMITTED",
      "BROKER_REVIEW",
      "EMPLOYER_VERIFICATION",
      "LENDER_INITIAL_REVIEW",
      "LENDER_FINAL_REVIEW",
    ].includes(status)
  ) {
    return "IN_REVIEW";
  }
  if (["CONTRACT_PENDING", "USER_CONTRACT_CONFIRMED"].includes(status)) {
    return "PENDING_CONTRACT";
  }
  if (
    ["DISBURSEMENT_PENDING", "DISBURSED", "REPAYMENT_ACTIVE"].includes(status)
  ) {
    return "ACTIVE";
  }
  if (status === "SETTLED") return "SETTLED";
  if (["REJECTED", "CLOSED"].includes(status)) return "CLOSED";
  return "ALL";
}

function maskedApplicationNo(value: string): string {
  if (value.length <= 8) return value;
  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}

function displayDate(value: string | null | undefined): string {
  if (!value) return "—";
  const isoIndex = value.indexOf("T");
  if (isoIndex > 0) return value.slice(0, isoIndex);
  return value;
}

function formatWorkflowCode(value: string | null | undefined): string {
  if (!value) return "—";
  return value
    .toLowerCase()
    .split("_")
    .map((part) => (part ? `${part[0]!.toUpperCase()}${part.slice(1)}` : part))
    .join(" ");
}

function applicantTimelineTitle(
  entry: ApplicantTimelineEntry,
  language: LanguageCode,
): string {
  const copy: Record<
    LanguageCode,
    Record<ApplicantTimelineEntry["entryType"], string>
  > = {
    en: {
      STATUS: "Application status updated",
      APPROVAL: "Approval step updated",
      PAYMENT_PROOF_SUBMITTED: "Payment proof submitted",
      PAYMENT_PROOF_REVIEWED: "Payment proof reviewed",
      REASSESSMENT_SUBMITTED: "Reassessment requested",
      REASSESSMENT_APPROVAL: "Reassessment approval updated",
    },
    "zh-CN": {
      STATUS: "申请状态已更新",
      APPROVAL: "审批节点已更新",
      PAYMENT_PROOF_SUBMITTED: "付款凭证已提交",
      PAYMENT_PROOF_REVIEWED: "付款凭证已审核",
      REASSESSMENT_SUBMITTED: "重新评估申请已提交",
      REASSESSMENT_APPROVAL: "重新评估审批已更新",
    },
    km: {
      STATUS: "ស្ថានភាពពាក្យសុំត្រូវបានអាប់ដេត",
      APPROVAL: "ជំហានអនុម័តត្រូវបានអាប់ដេត",
      PAYMENT_PROOF_SUBMITTED: "បង្កាន់ដៃបង់ប្រាក់ត្រូវបានដាក់ស្នើ",
      PAYMENT_PROOF_REVIEWED: "បង្កាន់ដៃបង់ប្រាក់ត្រូវបានពិនិត្យ",
      REASSESSMENT_SUBMITTED: "សំណើវាយតម្លៃឡើងវិញត្រូវបានដាក់ស្នើ",
      REASSESSMENT_APPROVAL: "ការអនុម័តវាយតម្លៃឡើងវិញត្រូវបានអាប់ដេត",
    },
  };
  return copy[language][entry.entryType];
}

function applicantTimelineDetail(
  entry: ApplicantTimelineEntry,
  language: LanguageCode,
): string {
  const label = (en: string, zh: string, kmText: string): string => {
    if (language === "zh-CN") return zh;
    if (language === "km") return kmText;
    return en;
  };
  const parts = [displayDate(entry.occurredAt)];
  if (entry.status) {
    parts.push(
      `${label("Status", "状态", "ស្ថានភាព")}: ${formatWorkflowCode(entry.status)}`,
    );
  }
  if (entry.stage) {
    parts.push(
      `${label("Stage", "节点", "ដំណាក់កាល")}: ${formatWorkflowCode(entry.stage)}`,
    );
  }
  if (entry.decision) {
    parts.push(
      `${label("Decision", "决定", "សេចក្តីសម្រេច")}: ${formatWorkflowCode(entry.decision)}`,
    );
  }
  if (entry.referenceNo) {
    parts.push(`${label("Reference", "编号", "លេខយោង")}: ${entry.referenceNo}`);
  }
  if (entry.reasonCode) {
    parts.push(
      `${label("Reason", "原因码", "កូដមូលហេតុ")}: ${formatWorkflowCode(entry.reasonCode)}`,
    );
  }
  return parts.join(" · ");
}

const labels: Record<LanguageCode, Record<string, string>> = {
  "zh-CN": {
    brand: "薪易贷",
    telegram: "Telegram 已连接",
    welcome: "工资到账前，资金周转更从容",
    intro: "面向合作企业员工的薪资周转服务。额度、合同与放款以审核结果为准。",
    amount: "申请金额",
    customAmount: "输入申请金额（USD 10–500）",
    amountInvalid: "请输入 USD 10.00 至 500.00 的金额，最多两位小数。",
    term: "借款期限",
    start: "开始申请",
    details: "填写个人资料",
    name: "姓名",
    phone: "手机号码",
    phoneInvalid: "请输入有效的手机号码。",
    employer: "所在企业",
    consent: "我已阅读并同意个人信息授权与隐私说明",
    send: "提交审核",
    submitted: "申请已提交",
    submittedNote: "资料已提交，系统将继续进入审核流程。",
    review: "审核进度",
    apply: "提交申请",
    broker: "资料审核",
    lender: "额度审核",
    offer: "额度结果",
    back: "返回修改",
    check: "查看申请状态",
    reviewing: "审核中",
    noOffer: "额度和费用以审核结果为准。",
    demo: "受控预览环境",
    previewReadOnly: "此预览仅供查看，不能提交申请或填写个人资料。",
    secured: "信息仅用于本次申请处理",
    usd: "USD",
    expected: "预计处理：工作时段 0–1.5 小时响应",
    status: "申请编号",
    refresh: "刷新状态",
    installments: "还款期数",
    firstDueDate: "首期还款日",
    telegramLogin: "使用 Telegram 继续",
    formIntro:
      "请填写真实且完整的资料。提交后，审核团队仅在你的授权范围内处理申请。",
  },
  en: {
    brand: "PayEase",
    telegram: "Telegram connected",
    welcome: "More flexibility before payday",
    intro:
      "Salary liquidity support for employees of partner companies. The licensed lender controls credit, contracts and disbursement.",
    amount: "Requested amount",
    customAmount: "Enter requested amount (USD 10–500)",
    amountInvalid:
      "Enter an amount from USD 10.00 to 500.00, with up to two decimals.",
    term: "Loan term",
    start: "Start application",
    details: "Your details",
    name: "Full name",
    phone: "Mobile number",
    phoneInvalid: "Enter a valid mobile number.",
    employer: "Employer",
    consent: "I agree to the personal-data authorization and privacy notice",
    send: "Submit for broker review",
    submitted: "Application submitted",
    submittedNote:
      "Our broker team will check the application and send it to the licensed lender.",
    review: "Application progress",
    apply: "Apply",
    broker: "Broker review",
    lender: "Lender review",
    offer: "Offer result",
    back: "Back",
    check: "View application status",
    reviewing: "Under review",
    noOffer: "The licensed lender independently decides the limit and fees.",
    demo: "Controlled preview",
    previewReadOnly:
      "This preview is view-only. Applications and personal data entry are disabled.",
    secured: "Used only for this application",
    usd: "USD",
    expected: "Expected response during business hours: 0–1.5 hours",
    status: "Application number",
    refresh: "Refresh status",
    installments: "Installments",
    firstDueDate: "First repayment date",
    telegramLogin: "Continue with Telegram",
    formIntro:
      "Please provide complete and accurate details. The broker processes your application only within your authorization.",
  },
  km: {
    brand: "PayEase",
    telegram: "Telegram បានភ្ជាប់",
    welcome: "សាច់ប្រាក់ងាយស្រួល មុនថ្ងៃបើកប្រាក់ខែ",
    intro:
      "សេវាសម្រាប់បុគ្គលិកក្រុមហ៊ុនដៃគូ។ ស្ថាប័នមានអាជ្ញាប័ណ្ណជាអ្នកសម្រេចឥណទាន កិច្ចសន្យា និងការបើកប្រាក់។",
    amount: "ចំនួនទឹកប្រាក់ស្នើ",
    customAmount: "បញ្ចូលចំនួនទឹកប្រាក់ (USD 10–500)",
    amountInvalid:
      "សូមបញ្ចូលចំនួនចាប់ពី USD 10.00 ដល់ 500.00 ដោយមានទសភាគអតិបរមាពីរខ្ទង់។",
    term: "រយៈពេល",
    start: "ចាប់ផ្តើមដាក់ពាក្យ",
    details: "ព័ត៌មានរបស់អ្នក",
    name: "ឈ្មោះពេញ",
    phone: "លេខទូរស័ព្ទ",
    phoneInvalid: "សូមបញ្ចូលលេខទូរស័ព្ទត្រឹមត្រូវ។",
    employer: "ក្រុមហ៊ុន",
    consent: "ខ្ញុំយល់ព្រមលើការអនុញ្ញាតប្រើព័ត៌មានផ្ទាល់ខ្លួន",
    send: "ដាក់ស្នើសម្រាប់ការពិនិត្យ",
    submitted: "បានដាក់ពាក្យរួច",
    submittedNote:
      "ក្រុមការងារនឹងពិនិត្យព័ត៌មាន ហើយបញ្ជូនទៅស្ថាប័នមានអាជ្ញាប័ណ្ណ។",
    review: "ដំណើរការពាក្យ",
    apply: "ដាក់ពាក្យ",
    broker: "ពិនិត្យដោយក្រុមការងារ",
    lender: "ពិនិត្យដោយស្ថាប័ន",
    offer: "លទ្ធផលទំហំឥណទាន",
    back: "ត្រឡប់ក្រោយ",
    check: "មើលស្ថានភាព",
    reviewing: "កំពុងពិនិត្យ",
    noOffer: "ស្ថាប័នមានអាជ្ញាប័ណ្ណសម្រេចទំហំ និងថ្លៃសេវាដោយឯករាជ្យ។",
    demo: "បរិស្ថានសាកល្បងគ្រប់គ្រង",
    previewReadOnly:
      "ការមើលជាមុននេះសម្រាប់មើលតែប៉ុណ្ណោះ។ ការដាក់ពាក្យ និងការបញ្ចូលព័ត៌មានផ្ទាល់ខ្លួនត្រូវបានបិទ។",
    secured: "ប្រើសម្រាប់ពាក្យនេះតែប៉ុណ្ណោះ",
    usd: "USD",
    expected: "ពេលឆ្លើយតបក្នុងម៉ោងធ្វើការ៖ 0–1.5 ម៉ោង",
    status: "លេខពាក្យ",
    refresh: "ធ្វើបច្ចុប្បន្នភាពស្ថានភាព",
    installments: "ចំនួនវគ្គសង",
    firstDueDate: "កាលបរិច្ឆេទសងលើកដំបូង",
    telegramLogin: "បន្តជាមួយ Telegram",
    formIntro:
      "សូមបំពេញព័ត៌មានឱ្យពេញលេញ និងត្រឹមត្រូវ។ ក្រុមការងារប្រើព័ត៌មានតាមការអនុញ្ញាតរបស់អ្នកប៉ុណ្ណោះ។",
  },
};

const amountOptions = [10, 50, 100, 200, 500];
const terms = [15, 30];
const APPLICANT_PHONE_PATTERN = /^\+?[0-9][0-9 ()-]{5,31}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type TelegramWebApp = Readonly<{
  initData?: string;
  initDataUnsafe?: { user?: { id?: number } };
  ready?: () => void;
  expand?: () => void;
}>;

function telegramWebApp(): TelegramWebApp | undefined {
  return (
    window as Window & {
      Telegram?: { WebApp?: TelegramWebApp };
    }
  ).Telegram?.WebApp;
}

function telegramUserRef(): string {
  const id = telegramWebApp()?.initDataUnsafe?.user?.id;
  return id ? `telegram-${id}` : `preview-${crypto.randomUUID()}`;
}

function telegramInitData(): string | undefined {
  const webApp = telegramWebApp();
  // Telegram's bridge can arrive just after the Vite bundle in an embedded
  // WebView. Signal readiness and allow the caller to retry briefly rather
  // than permanently falling back to the unauthenticated profile state.
  webApp?.ready?.();
  webApp?.expand?.();
  try {
    return resolveTelegramInitData(
      webApp,
      window.location,
      window.sessionStorage,
    );
  } catch {
    return webApp?.initData || undefined;
  }
}

function trustedTelegramPhotoUrl(
  photoUrl: string | null | undefined,
): string | undefined {
  if (!photoUrl) return undefined;
  try {
    const url = new URL(photoUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.hash) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function readStoredLanguagePreference(): LanguageCode | undefined {
  try {
    const stored = window.localStorage.getItem("payease.language");
    if (stored === "en" || stored === "zh-CN" || stored === "km") {
      return stored;
    }
  } catch {
    /* ignore storage access failures in embedded webviews */
  }
  return undefined;
}

export function App(): JSX.Element {
  const [initialLanguagePreference] = useState<LanguageCode | undefined>(() =>
    readStoredLanguagePreference(),
  );
  const [language, setLanguage] = useState<LanguageCode>(
    () => initialLanguagePreference ?? "km",
  );
  const [
    requiresInitialLanguageSelection,
    setRequiresInitialLanguageSelection,
  ] = useState(() => !initialLanguagePreference);
  const currentLanguage = useRef<LanguageCode>("km");
  const languageChangedByApplicant = useRef(false);
  const [stage, setStage] = useState<Stage>("welcome");
  const [formStep, setFormStep] = useState<ApplicationFormStep>("profile");
  const [ordersView, setOrdersView] = useState<OrdersView>("borrow");
  const [recordFilter, setRecordFilter] = useState<RecordFilter>("ALL");
  const [amountInput, setAmountInput] = useState("50");
  const [term, setTerm] = useState(30);
  const [selectedRepaymentMethod, setSelectedRepaymentMethod] =
    useState<RepaymentMethod>("SMILE_WALLET_AUTHORIZATION");
  const [name, setName] = useState("");
  const [residentialAddress, setResidentialAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [employer, setEmployer] = useState("");
  const [emergencyContactOneName, setEmergencyContactOneName] = useState("");
  const [emergencyContactOnePhone, setEmergencyContactOnePhone] = useState("");
  const [emergencyContactTwoName, setEmergencyContactTwoName] = useState("");
  const [emergencyContactTwoPhone, setEmergencyContactTwoPhone] = useState("");
  const [employerTenantId, setEmployerTenantId] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankAccountHolder, setBankAccountHolder] = useState("");
  const [employerTenants, setEmployerTenants] = useState<
    EmployerTenantDirectory["tenants"]
  >([]);
  const [identityDocumentType, setIdentityDocumentType] = useState<
    "NATIONAL_ID" | "PASSPORT"
  >("NATIONAL_ID");
  const [identityDocumentNumber, setIdentityDocumentNumber] = useState("");
  const [livenessPrepared, setLivenessPrepared] = useState(false);
  const [wealthProofAttached, setWealthProofAttached] = useState(false);
  const [consent, setConsent] = useState(false);
  const [employerVerificationAuthorized, setEmployerVerificationAuthorized] =
    useState(false);
  const [serviceAgreementAuthorized, setServiceAgreementAuthorized] =
    useState(false);
  const [
    postDisbursementBrokerageAuthorized,
    setPostDisbursementBrokerageAuthorized,
  ] = useState(false);
  const [repaymentProofFile, setRepaymentProofFile] = useState<File | null>(
    null,
  );
  const [applicationNo, setApplicationNo] = useState("");
  const [approvedAmountMinor, setApprovedAmountMinor] = useState<string>();
  const [summary, setSummary] = useState<UserSummary>();
  const [applicationHistory, setApplicationHistory] = useState<
    ApplicationListEntry[]
  >([]);
  const [verifiedProfile, setVerifiedProfile] = useState<
    VerifiedProfileView | undefined
  >();
  const [profilePhotoFailed, setProfilePhotoFailed] = useState(false);
  const [applicantSession, setApplicantSession] = useState(false);
  const [kycLocation, setKycLocation] = useState<KycLocationStatus | null>(
    null,
  );
  const [pendingKycLocation, setPendingKycLocation] =
    useState<SingleKycLocationSnapshot | null>(null);
  const [kycLocationNotice, setKycLocationNotice] = useState("");
  const [kycLocationSubmitting, setKycLocationSubmitting] = useState(false);
  const [phoneVerification, setPhoneVerification] = useState<
    TelegramPhoneVerification | undefined
  >();
  const [phoneVerificationNotice, setPhoneVerificationNotice] = useState("");
  const [recoveryEntryPoints, setRecoveryEntryPoints] = useState<string[]>([]);
  const [withdrawalConfirmationRequested, setWithdrawalConfirmationRequested] =
    useState(false);
  const [walletOperationNotice, setWalletOperationNotice] = useState("");
  const [serviceCaseType, setServiceCaseType] = useState<
    "SERVICE_QUERY" | "COMPLAINT"
  >("SERVICE_QUERY");
  const [serviceCaseMessage, setServiceCaseMessage] = useState("");
  const [serviceCaseNotice, setServiceCaseNotice] = useState("");
  const [serviceCases, setServiceCases] = useState<ApplicantServiceCase[]>([]);
  const [serviceCasesLoaded, setServiceCasesLoaded] = useState(false);
  const [serviceCasesLoading, setServiceCasesLoading] = useState(false);
  const [supplementMessage, setSupplementMessage] = useState("");
  const [supplementNotice, setSupplementNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState<UserTab>("home");
  const currentPageRef = useRef<UserTab>("home");
  const t = labels[language];
  const factoryCopy = factoryFormCopy(language);
  const phoneCopy = phoneVerificationCopy(language);
  const kycCopy = kycLocationCopy(language);
  const applicationCopy = applicationSectionCopy(language);
  const stepCopy = applicationStepCopy(language);
  const stepNavCopy = stepNavigationCopy(language);
  const amountInputError =
    t.amountInvalid ?? "Enter an amount from USD 10.00 to 500.00.";
  const phoneInputError = t.phoneInvalid ?? "Enter a valid mobile number.";
  const requestedAmountMinor = usdInputToMinor(amountInput);
  const showPreviewBadge = isControlledPreviewBuild(
    import.meta.env.VITE_PAYEASE_DEPLOYMENT_MODE,
  );
  const result = applicantResult(summary?.application);
  const lifecycleCopy = applicantLifecycleCopy(result, language);
  const visiblePhase = summary
    ? applicantPhase(summary.application.status)
    : undefined;
  const repaymentProof = summary?.repaymentProof ?? null;
  const repaymentProofStatus: RepaymentProofStatus =
    repaymentProof?.status ?? "NOT_SUBMITTED";
  const repaymentProofReference = repaymentProof?.proofNo ?? "";
  const usesControlledWalletRepayment = Boolean(
    summary && summary.repayment.periodCount > 0,
  );
  const showLegacyRepaymentProofFlow = Boolean(
    summary?.recordDetail?.canUploadPaymentProof &&
    !usesControlledWalletRepayment &&
    (repaymentProofStatus === "NOT_SUBMITTED" ||
      repaymentProofStatus === "NEEDS_MORE"),
  );
  const reassessmentRequest = summary?.reassessmentRequest ?? null;
  const reassessmentSubmitted = Boolean(reassessmentRequest);

  useEffect(() => {
    currentLanguage.current = language;
  }, [language]);

  useEffect(() => {
    setSelectedRepaymentMethod("SMILE_WALLET_AUTHORIZATION");
  }, [employerTenantId]);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  function applicantRequest(input: RequestInfo | URL, init?: RequestInit) {
    const existingHeaders = init?.headers as Record<string, string> | undefined;
    let headers = existingHeaders;
    if (
      ["POST", "PUT", "PATCH", "DELETE"].includes(
        (init?.method ?? "GET").toUpperCase(),
      )
    ) {
      const csrfCookie = document.cookie
        .split(";")
        .map((part) => part.trim())
        .find(
          (part) =>
            part.startsWith("__Host-payease_applicant_csrf=") ||
            part.startsWith("payease_applicant_csrf="),
        );
      const token = csrfCookie?.slice(csrfCookie.indexOf("=") + 1);
      if (token) headers = { ...existingHeaders, "X-CSRF-Token": token };
    }
    return fetch(input, {
      ...init,
      credentials: "include",
      ...(headers ? { headers } : {}),
    });
  }

  const { recoverApplicantSession } = useApplicantSession({
    applicantRequest,
    applicantSession,
    language,
    setApplicantSession,
    setLanguage,
    setError,
    setRecoveryEntryPoints,
    setApplicationHistory,
    currentLanguageRef: currentLanguage,
    languageChangedByApplicantRef: languageChangedByApplicant,
    getTelegramInitData: telegramInitData,
    readStoredLanguagePreference,
    normalizeRecoveryEntryPoint: trustedTelegramEntryPoint,
    clearApplicantSensitiveDraft,
    loadVerifiedProfile,
    checkStatus,
  });

  const {
    clearNotificationSelection,
    loadNotifications,
    markAllNotificationsRead,
    nextNotificationPage,
    notifications,
    notificationPage,
    openNotificationDetail: showNotificationDetail,
    paginatedNotifications,
    previousNotificationPage,
    resetNotifications,
    selectedNotification,
    notificationItemCount,
    unreadNotificationCount,
    notificationPageCount,
  } = useApplicantNotifications({
    applicantSession,
    applicantRequest,
    recoverApplicantSession,
  });

  const { clearPersistedApplicationDraft, persistApplicationDraft } =
    useApplicationDraft({
      applicantSession,
      applicantRequest,
      currentValues: {
        amountInput,
        term,
        selectedRepaymentMethod,
        name,
        residentialAddress,
        phone,
        employer,
        emergencyContactOneName,
        emergencyContactOnePhone,
        emergencyContactTwoName,
        emergencyContactTwoPhone,
        employerTenantId,
        bankName,
        bankAccountNumber,
        bankAccountHolder,
        identityDocumentType,
        identityDocumentNumber,
        livenessPrepared,
        wealthProofAttached,
        consent,
        employerVerificationAuthorized,
        serviceAgreementAuthorized,
        postDisbursementBrokerageAuthorized,
      } as ApplicationDraftValues,
      currentFormStep: formStep,
      restoreValues: (draft) => {
        setAmountInput(draft.amountInput);
        setTerm(draft.term);
        setSelectedRepaymentMethod("SMILE_WALLET_AUTHORIZATION");
        setName(draft.name);
        setResidentialAddress(draft.residentialAddress);
        setPhone(draft.phone);
        setEmployer(draft.employer);
        setEmergencyContactOneName(draft.emergencyContactOneName);
        setEmergencyContactOnePhone(draft.emergencyContactOnePhone);
        setEmergencyContactTwoName(draft.emergencyContactTwoName);
        setEmergencyContactTwoPhone(draft.emergencyContactTwoPhone);
        setEmployerTenantId(draft.employerTenantId);
        setBankName(draft.bankName);
        setBankAccountNumber(draft.bankAccountNumber);
        setBankAccountHolder(draft.bankAccountHolder);
        setIdentityDocumentType(draft.identityDocumentType);
        setIdentityDocumentNumber(draft.identityDocumentNumber);
        setLivenessPrepared(draft.livenessPrepared);
        setWealthProofAttached(draft.wealthProofAttached);
        setConsent(draft.consent);
        setEmployerVerificationAuthorized(draft.employerVerificationAuthorized);
        setServiceAgreementAuthorized(draft.serviceAgreementAuthorized);
        setPostDisbursementBrokerageAuthorized(
          draft.postDisbursementBrokerageAuthorized,
        );
      },
      recoverApplicantSession,
      setStage,
      setFormStep,
      skipRestore: Boolean(
        new URLSearchParams(window.location.search).get("application"),
      ),
    });

  function contactStepError(): string | undefined {
    if (
      !emergencyContactOneName.trim() ||
      !emergencyContactOnePhone.trim() ||
      !emergencyContactTwoName.trim() ||
      !emergencyContactTwoPhone.trim()
    ) {
      return language === "en"
        ? "Complete both emergency contacts before continuing."
        : language === "km"
          ? "សូមបំពេញព័ត៌មានអ្នកទំនាក់ទំនងបន្ទាន់ទាំងពីរ មុននឹងបន្ត។"
          : "请先完整填写两位紧急联系人信息。";
    }
    if (
      !APPLICANT_PHONE_PATTERN.test(emergencyContactOnePhone.trim()) ||
      !APPLICANT_PHONE_PATTERN.test(emergencyContactTwoPhone.trim())
    ) {
      return language === "en"
        ? "Enter valid phone numbers for both emergency contacts."
        : language === "km"
          ? "សូមបញ្ចូលលេខទូរស័ព្ទត្រឹមត្រូវសម្រាប់អ្នកទំនាក់ទំនងបន្ទាន់ទាំងពីរ។"
          : "请填写有效的紧急联系人手机号。";
    }
    return undefined;
  }

  function hasValidEmployerTenantSelection(): boolean {
    if (!applicantSession) return true;
    if (!UUID_PATTERN.test(employerTenantId)) return false;
    return employerTenants.some((tenant) => tenant.id === employerTenantId);
  }

  function payoutStepError(): string | undefined {
    if (
      !bankName.trim() ||
      !bankAccountNumber.trim() ||
      !bankAccountHolder.trim()
    ) {
      return language === "en"
        ? "Complete the payout account information before continuing."
        : language === "km"
          ? "សូមបំពេញព័ត៌មានគណនីទទួលប្រាក់ មុននឹងបន្ត។"
          : "请先完整填写收款账户信息。";
    }
    if (
      applicantSession &&
      (!hasValidEmployerTenantSelection() ||
        !/^[A-Za-z0-9][A-Za-z0-9 -]{4,63}$/.test(identityDocumentNumber.trim()))
    ) {
      return factoryCopy.required;
    }
    return undefined;
  }

  function goToApplicationStep(nextStep: ApplicationFormStep) {
    setError("");
    setStage("details");
    setFormStep(nextStep);
    persistApplicationDraft({ stage: "details", formStep: nextStep });
  }

  function revisitApplicationStep(targetStep: ApplicationFormStep) {
    const targetIndex = APPLICATION_FORM_STEPS.indexOf(targetStep);
    const currentIndex = APPLICATION_FORM_STEPS.indexOf(formStep);
    if (targetIndex < 0 || targetIndex > currentIndex) return;
    goToApplicationStep(targetStep);
  }

  function saveCurrentApplicationStep() {
    if (formStep === "profile") {
      const profileError = applicantProfileValidationError({
        fullName: name,
        phone,
        employerName: employer,
      });
      if (!residentialAddress.trim()) {
        setError(
          language === "en"
            ? "Enter your current address before continuing."
            : language === "km"
              ? "សូមបញ្ចូលអាសយដ្ឋានបច្ចុប្បន្ន មុននឹងបន្ត។"
              : "请先填写现居地址后再继续。",
        );
        return;
      }
      if (profileError === "PHONE_INVALID") {
        setError(phoneInputError);
        return;
      }
      if (profileError === "REQUIRED") {
        setError(
          language === "en"
            ? "Complete your basic profile before continuing."
            : language === "km"
              ? "សូមបំពេញព័ត៌មានមូលដ្ឋានឱ្យពេញលេញ មុននឹងបន្ត។"
              : "请先完整填写基础资料后再继续。",
        );
        return;
      }
      goToApplicationStep("contacts");
      return;
    }
    if (formStep === "contacts") {
      const message = contactStepError();
      if (message) {
        setError(message);
        return;
      }
      goToApplicationStep("payout");
      return;
    }
    if (formStep === "payout") {
      const message = payoutStepError();
      if (message) {
        setError(message);
        return;
      }
      goToApplicationStep("supplements");
      return;
    }
    if (formStep === "supplements") {
      goToApplicationStep("confirm");
    }
  }

  function goToPreviousApplicationStep() {
    const currentIndex = APPLICATION_FORM_STEPS.indexOf(formStep);
    if (currentIndex <= 0) {
      setStage("welcome");
      setError("");
      persistApplicationDraft({ stage: "welcome", formStep });
      return;
    }
    const previousStep = APPLICATION_FORM_STEPS[currentIndex - 1]!;
    setError("");
    setFormStep(previousStep);
    persistApplicationDraft({ stage: "details", formStep: previousStep });
  }

  function clearApplicantSensitiveDraft() {
    // These values may be visible to the next person who opens the same
    // Telegram WebView. They are never persisted client-side, but React state
    // must still be cleared when the identity session ends or changes.
    setName("");
    setResidentialAddress("");
    setPhone("");
    setEmployer("");
    setEmergencyContactOneName("");
    setEmergencyContactOnePhone("");
    setEmergencyContactTwoName("");
    setEmergencyContactTwoPhone("");
    setEmployerTenantId("");
    setBankName("");
    setBankAccountNumber("");
    setBankAccountHolder("");
    setIdentityDocumentType("NATIONAL_ID");
    setIdentityDocumentNumber("");
    setLivenessPrepared(false);
    setWealthProofAttached(false);
    setConsent(false);
    setRepaymentProofFile(null);
    setServiceCaseMessage("");
    setServiceCaseNotice("");
    setSupplementMessage("");
    setSupplementNotice("");
    setPhoneVerification(undefined);
    setPhoneVerificationNotice("");
    setVerifiedProfile(undefined);
    setKycLocation(null);
    setKycLocationNotice("");
    setProfilePhotoFailed(false);
    setFormStep("profile");
  }

  async function loadVerifiedProfile(): Promise<
    VerifiedProfileView | undefined
  > {
    const response = await applicantRequest(
      "/api/v1/local/public/profile/view",
    );
    if (!response || typeof response !== "object" || !("ok" in response)) {
      return undefined;
    }
    if (response.status === 401) {
      await recoverApplicantSession();
      return undefined;
    }
    const payload = (await response.json().catch(() => undefined)) as
      VerifiedProfileView | undefined;
    if (
      !response.ok ||
      !payload ||
      typeof payload.telegramVerified !== "boolean" ||
      !payload.language
    ) {
      return undefined;
    }
    setVerifiedProfile(payload);
    setKycLocation(payload.kycLocation ?? null);
    setPendingKycLocation(null);
    setProfilePhotoFailed(false);
    return payload;
  }

  async function loadKycLocationStatus(): Promise<void> {
    if (!applicantSession) return;
    try {
      const response = await applicantRequest(
        "/api/v1/local/public/kyc-location-evidence/status",
      );
      if (
        !response ||
        typeof response !== "object" ||
        !("status" in response)
      ) {
        return;
      }
      if (response.status === 401) {
        await recoverApplicantSession();
        return;
      }
      const payload = (await response.json().catch(() => undefined)) as
        { kycLocation?: KycLocationStatus | null } | undefined;
      if (response.ok && payload && "kycLocation" in payload) {
        setKycLocation(payload.kycLocation ?? null);
        setPendingKycLocation(null);
      }
    } catch {
      /* ignore optional status prefetch failures */
    }
  }

  async function loadPhoneVerification(): Promise<void> {
    if (!applicantSession) {
      setError(
        language === "zh-CN"
          ? "Telegram 登录正在建立，请稍候再检查手机号验证。"
          : language === "en"
            ? "Telegram sign-in is still being established. Please check phone verification again shortly."
            : "ការចូល Telegram កំពុងត្រូវបានបង្កើត។ សូមពិនិត្យការផ្ទៀងផ្ទាត់លេខទូរស័ព្ទម្តងទៀតបន្តិចទៀត។",
      );
      return;
    }
    const response = await applicantRequest(
      "/api/v1/local/public/profile/telegram-phone-verification",
    );
    if (response.status === 401) {
      await recoverApplicantSession();
      return;
    }
    const payload = (await response.json().catch(() => undefined)) as
      TelegramPhoneVerification | undefined;
    if (
      response.ok &&
      payload &&
      typeof payload.verified === "boolean" &&
      typeof payload.required === "boolean"
    ) {
      setPhoneVerification(payload);
    }
  }

  useEffect(() => {
    const existingApplication = new URLSearchParams(window.location.search).get(
      "application",
    );
    if (existingApplication) {
      setApplicationNo(existingApplication);
      setStage("submitted");
    }
  }, []);

  useEffect(() => {
    if (stage !== "details" || !applicantSession) return;
    let cancelled = false;
    const request = applicantRequest("/api/v1/local/public/employer-tenants");
    if (request && typeof (request as Promise<unknown>).then === "function") {
      void (request as Promise<Response>)
        .then(async (response) => {
          const payload = (await response.json()) as EmployerTenantDirectory;
          if (!response.ok || !Array.isArray(payload.tenants)) return;
          if (cancelled) return;
          setEmployerTenants(payload.tenants);
          if (
            employerTenantId &&
            !payload.tenants.some((tenant) => tenant.id === employerTenantId)
          ) {
            setEmployerTenantId("");
          }
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [applicantSession, stage]);

  async function requestKycLocationEvidence(): Promise<void> {
    setKycLocationSubmitting(true);
    setKycLocationNotice("");
    try {
      const location = await requestTelegramSingleLocation(window);
      if (location.kind !== "success") {
        setKycLocationNotice(
          location.kind === "unsupported"
            ? kycCopy.unsupported
            : kycCopy.cancelled,
        );
        return;
      }
      setPendingKycLocation(location.snapshot);
      setKycLocationNotice(kycCopy.pending);
    } finally {
      setKycLocationSubmitting(false);
    }
  }

  async function submitKycLocationEvidence(): Promise<void> {
    if (!pendingKycLocation) return;
    setKycLocationSubmitting(true);
    setKycLocationNotice("");
    try {
      const response = await applicantRequest(
        "/api/v1/local/public/kyc-location-evidence",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...pendingKycLocation,
            consentVersion: "KYC_LOCATION_V1",
          }),
        },
      );
      if (response.status === 401 || response.status === 403) {
        await recoverApplicantSession();
        return;
      }
      const payload = (await response.json().catch(() => undefined)) as
        { kycLocation?: KycLocationStatus; code?: string } | undefined;
      if (!response.ok || !payload?.kycLocation) {
        setKycLocationNotice(kycCopy.unavailable);
        return;
      }
      setKycLocation(payload.kycLocation);
      setPendingKycLocation(null);
      setKycLocationNotice(
        payload.kycLocation.assessmentResult === "MATCH"
          ? kycCopy.success
          : payload.kycLocation.assessmentResult === "LOW_ACCURACY"
            ? kycCopy.lowAccuracy
            : payload.kycLocation.assessmentResult === "UNAVAILABLE"
              ? kycCopy.unavailable
              : kycCopy.review,
      );
    } finally {
      setKycLocationSubmitting(false);
    }
  }

  async function submit() {
    const amountMinor = requestedAmountMinor;
    if (!amountMinor) {
      setError(amountInputError);
      return;
    }
    if (!residentialAddress.trim()) {
      setError(
        language === "en"
          ? "Enter your current address before submitting."
          : language === "km"
            ? "សូមបញ្ចូលអាសយដ្ឋានបច្ចុប្បន្ន មុននឹងដាក់ស្នើ។"
            : "请先填写现居地址后再提交。",
      );
      return;
    }
    const profileError = applicantProfileValidationError({
      fullName: name,
      phone,
      employerName: employer,
    });
    if (profileError === "PHONE_INVALID") {
      setError(phoneInputError);
      return;
    }
    if (profileError === "REQUIRED" || !consent) {
      setError(
        language === "en"
          ? "Complete your details and consent first."
          : language === "km"
            ? "សូមបំពេញព័ត៌មាន និងយល់ព្រមជាមុន។"
            : "请先完整填写资料并确认授权。",
      );
      return;
    }
    const contactsError = contactStepError();
    if (contactsError) {
      setError(contactsError);
      return;
    }
    const payoutError = payoutStepError();
    if (payoutError) {
      setError(payoutError);
      return;
    }
    if (!employerVerificationAuthorized || !serviceAgreementAuthorized) {
      setError(
        language === "en"
          ? "Confirm the employer-verification and broker service authorizations first."
          : language === "km"
            ? "សូមបញ្ជាក់ការអនុញ្ញាតផ្ទៀងផ្ទាត់ក្រុមហ៊ុន និងកិច្ចព្រមព្រៀងសេវាជាមុនសិន។"
            : "请先确认企业核验授权和助贷服务协议授权。",
      );
      return;
    }
    if (!postDisbursementBrokerageAuthorized) {
      setError(
        language === "en"
          ? "Acknowledge that the KhmerX brokerage remuneration becomes due only after disbursement."
          : language === "km"
            ? "សូមបញ្ជាក់ថាកម្រៃជើងសារ KhmerX នឹងក្លាយជាបំណុលបន្ទាប់ពីបើកប្រាក់ប៉ុណ្ណោះ។"
            : "请先确认 KhmerX 融资居间服务费仅在放款后形成应收。",
      );
      return;
    }
    if (
      applicantSession &&
      (!hasValidEmployerTenantSelection() ||
        !/^[A-Za-z0-9][A-Za-z0-9 -]{4,63}$/.test(identityDocumentNumber.trim()))
    ) {
      setError(factoryCopy.required);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await applicantRequest("/api/v1/local/applications", {
        method: "POST",
        // Same-origin HttpOnly cookie retains the opaque application access
        // token; it is never readable by JavaScript or placed in the URL.
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          telegramUserRef: telegramUserRef(),
          preferredLanguage: language,
          requestedAmount: {
            amountMinor,
            currency: "USD",
          },
          tenorDays: term,
          selectedRepaymentMethod: "SMILE_WALLET_AUTHORIZATION",
          authorizationSnapshot: {
            employerVerificationAuthorized,
            serviceAgreementAuthorized,
            postDisbursementBrokerageAuthorized,
          },
          ...(employerTenantId
            ? {
                employerTenantId,
                identityDocument: {
                  type: identityDocumentType,
                  number: identityDocumentNumber.trim(),
                },
              }
            : {}),
          personalProfile: {
            fullName: name.trim(),
            phone: phone.trim(),
            employerName: employer.trim(),
          },
          personalDataAndPhoneConsent: true,
        }),
      });
      const payload = (await response.json()) as {
        applicationNo?: string;
        code?: string;
        fields?: string[];
      };
      if (
        response.status === 409 &&
        payload.applicationNo &&
        [
          "REAPPLICATION_ACTIVE_APPLICATION_EXISTS",
          "REAPPLICATION_REJECTION_CONDITION_UNRESOLVED",
        ].includes(payload.code ?? "")
      ) {
        // The API deliberately prevents a second active application. Its
        // response identifies the existing record, so take the applicant to
        // that record rather than showing a misleading generic failure.
        window.history.replaceState(
          null,
          "",
          `?application=${encodeURIComponent(payload.applicationNo)}`,
        );
        await checkStatus(payload.applicationNo);
        return;
      }
      const submissionError = applicantSubmissionErrorMessage(
        payload.code,
        language,
      );
      if (submissionError) {
        setError(submissionError);
        return;
      }
      if (
        payload.code === "VALIDATION_ERROR" &&
        Array.isArray(payload.fields) &&
        (payload.fields.includes("employerTenantId") ||
          payload.fields.includes("identityDocument.number"))
      ) {
        setError(factoryCopy.required);
        return;
      }
      if (!response.ok || !payload.applicationNo)
        throw new Error(payload.code ?? "SUBMISSION_FAILED");
      setApplicationNo(payload.applicationNo);
      setApplicationHistory((current) =>
        prependApplicationHistory(current, {
          applicationNo: payload.applicationNo!,
          status: "BROKER_REVIEW",
          requestedAmountMinor: amountMinor,
          currency: "USD",
          tenorDays: term,
          approvedAmountMinor: null,
          rejectionConditionResolved: false,
          rejectionNoticeCode: null,
          supplementRequested: false,
          createdAt: new Date().toISOString(),
        }),
      );
      window.history.replaceState(
        null,
        "",
        `?application=${encodeURIComponent(payload.applicationNo)}`,
      );
      await clearPersistedApplicationDraft();
      setStage("submitted");
      setFormStep("profile");
    } catch (error) {
      const submissionError =
        error instanceof Error
          ? applicantSubmissionErrorMessage(error.message, language)
          : undefined;
      setError(
        submissionError ??
          (language === "en"
            ? "We could not submit this application. Please try again."
            : language === "km"
              ? "មិនអាចដាក់ពាក្យបានទេ។ សូមព្យាយាមម្ដងទៀត។"
              : "申请暂时未能提交，请稍后重试。"),
      );
    } finally {
      setLoading(false);
    }
  }

  async function checkStatus(targetApplicationNo = applicationNo) {
    if (!targetApplicationNo) return;
    if (targetApplicationNo !== applicationNo) {
      setServiceCases([]);
      setServiceCasesLoaded(false);
    }
    setLoading(true);
    setError("");
    try {
      const response = await applicantRequest(
        `/api/v1/local/public/applications/${encodeURIComponent(targetApplicationNo)}`,
        { credentials: "include" },
      );
      if (response.status === 401 || response.status === 403) {
        await recoverApplicantSession();
        return;
      }
      const payload = (await response.json()) as UserSummary;
      if (!response.ok) throw new Error("STATUS_FAILED");
      if (payload.workflow) {
        setSelectedRepaymentMethod(
          payload.workflow.selectedRepaymentMethod ??
            "SMILE_WALLET_AUTHORIZATION",
        );
        setEmployerVerificationAuthorized(
          payload.workflow.employerVerificationAuthorized ?? false,
        );
        setServiceAgreementAuthorized(
          payload.workflow.serviceAgreementAuthorized ?? false,
        );
        setPostDisbursementBrokerageAuthorized(
          payload.workflow.postDisbursementBrokerageAuthorized ?? false,
        );
      }
      setApprovedAmountMinor(
        payload.application.approvedAmountMinor ?? undefined,
      );
      // Keep the selected historical application addressable after a refresh
      // or Telegram WebView reopen. Only change the URL after the server has
      // authorised and returned the requested record.
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}?application=${encodeURIComponent(targetApplicationNo)}`,
      );
      setApplicationNo(targetApplicationNo);
      setSummary(payload);
      setKycLocation(payload.kycLocation ?? null);
      setWithdrawalConfirmationRequested(false);
      setStage("offer");
      if (currentPage === "home") setCurrentPage("orders");
    } catch {
      setError(
        language === "en"
          ? "We could not refresh the application status."
          : language === "km"
            ? "មិនអាចធ្វើបច្ចុប្បន្នភាពស្ថានភាពបានទេ។"
            : "暂时无法刷新申请状态。",
      );
    } finally {
      setLoading(false);
    }
  }

  async function uploadPaymentProof() {
    if (!applicationNo || !repaymentProofFile) return;
    const supportedContentTypes = new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ]);
    if (!supportedContentTypes.has(repaymentProofFile.type)) {
      setError(
        language === "en"
          ? "Please choose a JPG, PNG, WebP, or PDF payment proof."
          : language === "zh-CN"
            ? "请选择 JPG、PNG、WebP 或 PDF 格式的付款凭证。"
            : "សូមជ្រើសរើសបង្កាន់ដៃប្រភេទ JPG, PNG, WebP ឬ PDF។",
      );
      return;
    }
    if (repaymentProofFile.size > 2 * 1024 * 1024) {
      setError(
        language === "en"
          ? "Payment proof must be 2 MiB or smaller."
          : language === "zh-CN"
            ? "付款凭证需小于等于 2 MiB。"
            : "បង្កាន់ដៃទូទាត់ត្រូវតែមានទំហំតូចជាង ឬស្មើ 2 MiB។",
      );
      return;
    }
    setLoading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", repaymentProofFile, repaymentProofFile.name);
      const response = await applicantRequest(
        `/api/v1/local/public/applications/${encodeURIComponent(applicationNo)}/payment-proofs`,
        {
          method: "POST",
          headers: { "idempotency-key": crypto.randomUUID() },
          body: formData,
        },
      );
      if (response.status === 401 || response.status === 403) {
        await recoverApplicantSession();
        return;
      }
      const payload = (await response.json().catch(() => undefined)) as
        { proofNo?: string; status?: string; code?: string } | undefined;
      if (!response.ok || typeof payload?.proofNo !== "string") {
        throw new Error(payload?.code ?? "PAYMENT_PROOF_UPLOAD_FAILED");
      }
      setRepaymentProofFile(null);
      await checkStatus(applicationNo);
    } catch {
      setError(
        language === "en"
          ? "We could not upload your payment proof. Please try again."
          : language === "zh-CN"
            ? "暂时无法上传付款凭证，请稍后重试。"
            : "មិនអាចបញ្ចូលបង្កាន់ដៃទូទាត់បានទេ សូមព្យាយាមម្តងទៀត។",
      );
    } finally {
      setLoading(false);
    }
  }

  async function submitReassessmentRequest() {
    if (!applicationNo) return;
    setLoading(true);
    setError("");
    try {
      const response = await applicantRequest(
        `/api/v1/local/public/applications/${encodeURIComponent(applicationNo)}/reassessment-requests`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            addressChanged: true,
            employerUpdated: Boolean(employerTenantId),
            wealthProofDeclared: wealthProofAttached,
          }),
        },
      );
      if (response.status === 401 || response.status === 403) {
        await recoverApplicantSession();
        return;
      }
      const payload = (await response.json().catch(() => undefined)) as
        { requestNo?: string; status?: string; code?: string } | undefined;
      if (!response.ok || typeof payload?.requestNo !== "string") {
        throw new Error(payload?.code ?? "REASSESSMENT_REQUEST_FAILED");
      }
      await checkStatus(applicationNo);
      setOrdersView("reassessment");
    } catch {
      setError(
        language === "en"
          ? "We could not submit your reassessment request. Please try again."
          : language === "zh-CN"
            ? "暂时无法提交重新评估申请，请稍后重试。"
            : "មិនអាចដាក់សំណើវាយតម្លៃឡើងវិញបានទេ សូមព្យាយាមម្តងទៀត។",
      );
    } finally {
      setLoading(false);
    }
  }

  async function confirmDisplayedContract() {
    if (!applicationNo) return;
    setLoading(true);
    setError("");
    try {
      const response = await applicantRequest(
        `/api/v1/local/public/applications/${encodeURIComponent(applicationNo)}/contract-confirmation`,
        { method: "POST", credentials: "include" },
      );
      const payload = (await response.json()) as {
        status?: string;
        code?: string;
      };
      if (!response.ok || payload.status !== "USER_CONTRACT_CONFIRMED") {
        throw new Error(payload.code ?? "CONTRACT_CONFIRMATION_FAILED");
      }
      setSummary((current) =>
        current
          ? {
              ...current,
              application: {
                ...current.application,
                status: "USER_CONTRACT_CONFIRMED",
              },
            }
          : current,
      );
    } catch {
      setError(
        language === "en"
          ? "We could not record your confirmation. Please try again."
          : language === "km"
            ? "មិនអាចកត់ត្រាការបញ្ជាក់របស់អ្នកបានទេ។ សូមព្យាយាមម្ដងទៀត។"
            : "暂时无法记录你的确认，请稍后重试。",
      );
    } finally {
      setLoading(false);
    }
  }

  async function startWalletOperationJump(
    operationType: "WITHDRAWAL" | "REPAYMENT",
  ) {
    if (!applicationNo) return;
    setLoading(true);
    setError("");
    setWalletOperationNotice("");
    try {
      const response = await applicantRequest(
        `/api/v1/local/public/applications/${encodeURIComponent(applicationNo)}/wallet-operation-jumps`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ operationType }),
        },
      );
      if (response.status === 401 || response.status === 403) {
        await recoverApplicantSession();
        return;
      }
      const payload = (await response.json().catch(() => undefined)) as
        | {
            walletOperationUrl?: string;
            walletOperationJumpRef?: string;
            expiresAt?: string;
            code?: string;
          }
        | undefined;
      if (!response.ok || typeof payload?.walletOperationUrl !== "string") {
        throw new Error(payload?.code ?? "WALLET_OPERATION_JUMP_FAILED");
      }
      setWalletOperationNotice(
        language === "en"
          ? `Opening the SMILE wallet page for secure ${operationType === "REPAYMENT" ? "repayment" : "withdrawal"} authorization.`
          : language === "zh-CN"
            ? `正在打开 SMILE 受控钱包页以完成${operationType === "REPAYMENT" ? "还款" : "提现"}授权。`
            : `កំពុងបើកទំព័រ SMILE wallet ដើម្បីបន្តការអនុញ្ញាត${operationType === "REPAYMENT" ? "សងប្រាក់" : "ដកប្រាក់"}។`,
      );
      window.open(payload.walletOperationUrl, "_self", "noopener,noreferrer");
    } catch {
      setError(
        language === "en"
          ? "We could not open the SMILE wallet page. Please try again."
          : language === "zh-CN"
            ? "暂时无法打开 SMILE 钱包页，请稍后重试。"
            : "មិនអាចបើកទំព័រ SMILE wallet បានទេ សូមព្យាយាមម្តងទៀត។",
      );
    } finally {
      setLoading(false);
    }
  }

  async function withdrawApplication() {
    if (!applicationNo) return;
    setLoading(true);
    setError("");
    try {
      const response = await applicantRequest(
        `/api/v1/local/public/applications/${encodeURIComponent(applicationNo)}/withdraw`,
        { method: "POST", credentials: "include" },
      );
      if (response.status === 401 || response.status === 403) {
        await recoverApplicantSession();
        return;
      }
      const payload = (await response.json()) as {
        applicationNo?: string;
        status?: string;
        withdrawn?: boolean;
      };
      if (
        !response.ok ||
        payload.applicationNo !== applicationNo ||
        payload.status !== "CLOSED" ||
        payload.withdrawn !== true
      ) {
        throw new Error("WITHDRAWAL_FAILED");
      }
      setSummary((current) =>
        current
          ? {
              ...current,
              application: { ...current.application, status: "CLOSED" },
            }
          : current,
      );
      setApplicationHistory((current) =>
        current.map((item) =>
          item.applicationNo === applicationNo
            ? { ...item, status: "CLOSED" }
            : item,
        ),
      );
      setWithdrawalConfirmationRequested(false);
    } catch {
      setError(
        language === "en"
          ? "We could not withdraw this application. Please contact the licensed lender if it has progressed to contract processing."
          : language === "km"
            ? "មិនអាចដកពាក្យសុំនេះបានទេ។ សូមទាក់ទងស្ថាប័នមានអាជ្ញាប័ណ្ណ ប្រសិនបើពាក្យសុំបានចូលដំណាក់កាលកិច្ចសន្យា។"
            : "暂时无法撤回该申请；如已进入合同处理，请联系客服。",
      );
    } finally {
      setLoading(false);
    }
  }

  async function submitServiceCase() {
    if (!applicationNo || !serviceCaseMessage.trim()) return;
    setLoading(true);
    setError("");
    setServiceCaseNotice("");
    try {
      const response = await applicantRequest(
        `/api/v1/local/public/applications/${encodeURIComponent(applicationNo)}/service-cases`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            caseType: serviceCaseType,
            message: serviceCaseMessage.trim(),
          }),
        },
      );
      if (response.status === 401 || response.status === 403) {
        await recoverApplicantSession();
        return;
      }
      const payload = (await response.json().catch(() => undefined)) as
        { caseNo?: unknown; status?: unknown } | undefined;
      if (
        !response.ok ||
        typeof payload?.caseNo !== "string" ||
        payload.status !== "OPEN"
      ) {
        throw new Error("service case submission failed");
      }
      setServiceCaseMessage("");
      setServiceCaseNotice(
        language === "en"
          ? `Your case ${payload.caseNo} has been received. The broker team will coordinate with the licensed lender where required.`
          : language === "zh-CN"
            ? `已收到你的工单 ${payload.caseNo}。如需进一步处理，客服团队会继续跟进。`
            : `យើងបានទទួលសំណើ ${payload.caseNo} របស់អ្នក។ ក្រុមសេវាកម្មនឹងសម្របសម្រួលជាមួយស្ថាប័នមានអាជ្ញាប័ណ្ណនៅពេលចាំបាច់។`,
      );
      await loadServiceCases({ quiet: true });
    } catch {
      setError(
        language === "en"
          ? "We could not submit your support request. Please try again."
          : language === "zh-CN"
            ? "暂时无法提交客服工单，请稍后重试。"
            : "មិនអាចដាក់សំណើសេវាកម្មបានទេ សូមព្យាយាមម្តងទៀត។",
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadServiceCases(options: { quiet?: boolean } = {}) {
    if (!applicationNo) return;
    setServiceCasesLoading(true);
    try {
      const response = await applicantRequest(
        `/api/v1/local/public/applications/${encodeURIComponent(applicationNo)}/service-cases`,
        { credentials: "include" },
      );
      if (response.status === 401 || response.status === 403) {
        await recoverApplicantSession();
        return;
      }
      const payload: unknown = await response.json().catch(() => undefined);
      const cases = response.ok
        ? parseApplicantServiceCaseList(payload)
        : undefined;
      if (!cases && !options.quiet) {
        setServiceCaseNotice(
          language === "en"
            ? "Your case history is temporarily unavailable."
            : language === "zh-CN"
              ? "暂时无法读取你的工单记录。"
              : "មិនអាចមើលប្រវត្តិសំណើរបស់អ្នកបានជាបណ្តោះអាសន្នទេ។",
        );
        return;
      }
      if (!cases) return;
      setServiceCases(cases);
      setServiceCasesLoaded(true);
    } catch {
      if (!options.quiet) {
        setServiceCaseNotice(
          language === "en"
            ? "Your case history is temporarily unavailable."
            : language === "zh-CN"
              ? "暂时无法读取你的工单记录。"
              : "មិនអាចមើលប្រវត្តិសំណើរបស់អ្នកបានជាបណ្តោះអាសន្នទេ។",
        );
      }
    } finally {
      setServiceCasesLoading(false);
    }
  }

  async function submitSupplementResponse() {
    if (!applicationNo || supplementMessage.trim().length < 10) return;
    setLoading(true);
    setError("");
    setSupplementNotice("");
    try {
      const response = await applicantRequest(
        `/api/v1/local/public/applications/${encodeURIComponent(applicationNo)}/supplement-responses`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: supplementMessage.trim() }),
        },
      );
      const payload = (await response.json().catch(() => undefined)) as
        { responseNo?: unknown } | undefined;
      if (!response.ok || typeof payload?.responseNo !== "string") {
        throw new Error("supplement response submission failed");
      }
      setSupplementMessage("");
      setSupplementNotice(
        language === "en"
          ? `Your response ${payload.responseNo} has been sent to the broker review team.`
          : language === "zh-CN"
            ? `你的补充说明 ${payload.responseNo} 已发送给审核团队。`
            : `ការឆ្លើយតបបន្ថែម ${payload.responseNo} របស់អ្នកត្រូវបានផ្ញើទៅក្រុមពិនិត្យរួចហើយ។`,
      );
    } catch {
      setError(
        language === "en"
          ? "We could not send your supplementary response. Please try again."
          : language === "zh-CN"
            ? "暂时无法发送补充说明，请稍后重试。"
            : "មិនអាចផ្ញើការឆ្លើយតបបន្ថែមបានទេ សូមព្យាយាមម្ដងទៀត។",
      );
    } finally {
      setLoading(false);
    }
  }

  function changeLanguage(nextLanguage: LanguageCode) {
    languageChangedByApplicant.current = true;
    setLanguage(nextLanguage);
    setRequiresInitialLanguageSelection(false);
    try {
      window.localStorage.setItem("payease.language", nextLanguage);
    } catch {
      /* storage access failures do not prevent a language change */
    }
  }

  function startNewApplication() {
    clearApplicantSensitiveDraft();
    void clearPersistedApplicationDraft();
    setSummary(undefined);
    setApprovedAmountMinor(undefined);
    setApplicationNo("");
    setAmountInput("50");
    setTerm(30);
    setOrdersView("borrow");
    setServiceCases([]);
    setServiceCasesLoaded(false);
    setWithdrawalConfirmationRequested(false);
    setError("");
    window.history.replaceState(null, "", window.location.pathname);
    setStage("welcome");
    if (currentPage !== "orders") setCurrentPage("orders");
  }

  function openRecordCenter() {
    setOrdersView("records");
    setCurrentPage("orders");
  }

  function openReassessmentCenter() {
    setOrdersView("reassessment");
    setCurrentPage("orders");
  }

  function openNotificationsCenter() {
    clearNotificationSelection();
    setCurrentPage("notifications");
    if (applicantSession) {
      void loadNotifications();
    }
  }

  async function openNotificationDetail(notificationId: string) {
    setCurrentPage("notification-detail");
    await showNotificationDetail(notificationId);
  }

  async function openNotificationLinkedTarget(
    notification: (typeof notifications)[number],
  ) {
    const target = notificationDeepLink(notification, language);
    await checkStatus(notification.applicationNo);
    if (target.destination === "repayment") {
      setCurrentPage("repayment");
      return;
    }
    if (target.destination === "reassessment") {
      setOrdersView("reassessment");
      setCurrentPage("orders");
      return;
    }
    setCurrentPage("order-detail");
  }

  async function logoutApplicant() {
    setLoading(true);
    try {
      await clearPersistedApplicationDraft();
      const response = await applicantRequest(
        "/api/v1/local/public/telegram-sessions/logout",
        { method: "POST", credentials: "include" },
      );
      if (!response.ok) throw new Error("LOGOUT_FAILED");
      clearApplicantSensitiveDraft();
      setApplicantSession(false);
      setApplicationHistory([]);
      setSummary(undefined);
      setApprovedAmountMinor(undefined);
      setApplicationNo("");
      setServiceCases([]);
      setServiceCasesLoaded(false);
      resetNotifications();
      window.history.replaceState(null, "", window.location.pathname);
      setStage("welcome");
      setCurrentPage("home");
    } catch {
      setError(
        language === "en"
          ? "We could not sign you out. Please try again."
          : language === "km"
            ? "មិនអាចចាកចេញបានទេ។ សូមព្យាយាមម្ដងទៀត។"
            : "暂时无法退出，请重试。",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const applicationNoParam = query.get("application");
    if (
      (query.get("page") === "order-detail" || applicationNoParam) &&
      applicationNoParam
    ) {
      setApplicationNo(applicationNoParam);
      setCurrentPage("order-detail");
    }
  }, []);

  const currentStep = visiblePhase
    ? progressStepForPhase(visiblePhase)
    : stage === "welcome" || stage === "details"
      ? 0
      : stage === "submitted"
        ? 1
        : 3;
  const canWithdraw = Boolean(
    summary && canWithdrawApplicantApplication(summary.application.status),
  );
  const hasDraft = Boolean(
    !summary &&
    !applicationNo &&
    (stage === "details" ||
      stage === "welcome" ||
      name.trim() ||
      residentialAddress.trim() ||
      phone.trim() ||
      employer.trim() ||
      emergencyContactOneName.trim() ||
      emergencyContactOnePhone.trim() ||
      emergencyContactTwoName.trim() ||
      emergencyContactTwoPhone.trim() ||
      employerTenantId ||
      bankName.trim() ||
      bankAccountNumber.trim() ||
      bankAccountHolder.trim() ||
      identityDocumentNumber.trim() ||
      consent ||
      livenessPrepared ||
      wealthProofAttached),
  );
  const formStepIndex = APPLICATION_FORM_STEPS.indexOf(formStep);
  const summaryItems: Array<{ label: string; value: string }> = [
    {
      label: t.amount ?? "",
      value: requestedAmountMinor
        ? `${formatUsdMinor(requestedAmountMinor)} · ${term}d`
        : "—",
    },
    {
      label:
        language === "en"
          ? "Repayment path"
          : language === "km"
            ? "ផ្លូវសងប្រាក់"
            : "还款路径",
      value:
        language === "en"
          ? "SMILE wallet authorization"
          : language === "km"
            ? "ការអនុញ្ញាតតាម SMILE wallet"
            : "SMILE 钱包授权",
    },
    { label: t.name ?? "", value: name.trim() || "—" },
    { label: t.phone ?? "", value: phone.trim() || "—" },
    { label: t.employer ?? "", value: employer.trim() || "—" },
    {
      label: applicationCopy.contact1,
      value: emergencyContactOneName.trim()
        ? `${emergencyContactOneName.trim()} · ${emergencyContactOnePhone.trim() || "—"}`
        : "—",
    },
    {
      label: applicationCopy.contact2,
      value: emergencyContactTwoName.trim()
        ? `${emergencyContactTwoName.trim()} · ${emergencyContactTwoPhone.trim() || "—"}`
        : "—",
    },
    {
      label: applicationCopy.bankAccount,
      value: bankAccountNumber.trim() || "—",
    },
    {
      label:
        language === "en"
          ? "Independent authorizations"
          : language === "km"
            ? "ការអនុញ្ញាតដាច់ដោយឡែក"
            : "独立授权",
      value:
        [
          employerVerificationAuthorized
            ? language === "en"
              ? "Employer verification"
              : language === "km"
                ? "ការផ្ទៀងផ្ទាត់ក្រុមហ៊ុន"
                : "企业核验"
            : null,
          serviceAgreementAuthorized
            ? language === "en"
              ? "Service agreement"
              : language === "km"
                ? "កិច្ចព្រមព្រៀងសេវា"
                : "服务协议"
            : null,
          postDisbursementBrokerageAuthorized
            ? language === "en"
              ? "Post-disbursement brokerage"
              : language === "km"
                ? "កម្រៃជើងសារបន្ទាប់ពីបើកប្រាក់"
                : "放款后服务费应收"
            : null,
        ]
          .filter(Boolean)
          .join(" · ") || "—",
    },
  ];
  const renderApplicantError = () =>
    error ? (
      <ApplicantError
        message={error}
        entryPoints={recoveryEntryPoints}
        language={language}
      />
    ) : null;
  const historyFilters: Array<{ key: RecordFilter; label: string }> = [
    {
      key: "ALL",
      label:
        language === "en" ? "All" : language === "zh-CN" ? "全部" : "ទាំងអស់",
    },
    {
      key: "IN_REVIEW",
      label:
        language === "en"
          ? "In review"
          : language === "zh-CN"
            ? "申请中"
            : "កំពុងពិនិត្យ",
    },
    {
      key: "PENDING_CONTRACT",
      label:
        language === "en"
          ? "Pending contract"
          : language === "zh-CN"
            ? "待签约"
            : "រង់ចាំកិច្ចសន្យា",
    },
    {
      key: "ACTIVE",
      label:
        language === "en"
          ? "Active"
          : language === "zh-CN"
            ? "进行中"
            : "កំពុងដំណើរការ",
    },
    {
      key: "SETTLED",
      label:
        language === "en"
          ? "Settled"
          : language === "zh-CN"
            ? "已结清"
            : "បានបិទបញ្ចប់",
    },
    {
      key: "CLOSED",
      label:
        language === "en"
          ? "Closed"
          : language === "zh-CN"
            ? "已关闭"
            : "បានបិទ",
    },
  ];
  const filteredHistory =
    recordFilter === "ALL"
      ? applicationHistory
      : applicationHistory.filter(
          (item) => applicationHistoryFilter(item.status) === recordFilter,
        );
  const entryAction = borrowEntryAction(summary ? result : undefined, hasDraft);
  const rejectionNotice = applicantRejectionNotice(
    summary?.application.rejectionNoticeCode ?? null,
    language,
  );
  const rejectionCoolingOffDays = applicantCoolingOffDaysRemaining(summary);
  const borrowEntryUi = (() => {
    switch (entryAction) {
      case "continue-draft":
        return {
          statusLabel:
            language === "en"
              ? "Draft saved"
              : language === "zh-CN"
                ? "草稿已保存"
                : "បានរក្សាទុកជាសេចក្តីព្រាង",
          title:
            language === "en"
              ? "Continue your salary loan application"
              : language === "zh-CN"
                ? "继续填写薪资贷申请"
                : "បន្តបំពេញពាក្យសុំប្រាក់ខែ",
          description:
            language === "en"
              ? "Resume the saved application instead of creating a new one."
              : language === "zh-CN"
                ? "继续上次保存的申请，不会重复创建新申请。"
                : "បន្តពីពាក្យសុំដែលបានរក្សាទុក ដោយមិនបង្កើតពាក្យសុំថ្មីម្តងទៀត។",
          disabled: false,
          cta:
            language === "en"
              ? "Continue application"
              : language === "zh-CN"
                ? "继续填写"
                : "បន្តការដាក់ពាក្យ",
        };
      case "view-progress":
        return {
          statusLabel:
            language === "en"
              ? "Credit review in progress"
              : language === "zh-CN"
                ? "额度审批中"
                : "ពាក្យសុំកំពុងពិនិត្យ",
          title:
            language === "en"
              ? "Your credit application is under review"
              : language === "zh-CN"
                ? "你的额度申请正在审核中"
                : "មើលវឌ្ឍនភាពពាក្យសុំបច្ចុប្បន្ន",
          description:
            language === "en"
              ? "Your personal details have been submitted. Please wait for the review result."
              : language === "zh-CN"
                ? "你的个人资料已提交，请等待额度审核结果。"
                : "មានពាក្យសុំកំពុងដំណើរការរួចហើយ ដូច្នេះមិនអាចបង្កើតពាក្យសុំទីពីរបានទេ។",
          disabled: false,
          cta:
            language === "en"
              ? "Credit under review"
              : language === "zh-CN"
                ? "额度审批中"
                : "មើលវឌ្ឍនភាពពាក្យសុំ",
        };
      case "review-sign":
        return {
          statusLabel:
            language === "en"
              ? "Credit approved"
              : language === "zh-CN"
                ? "额度已获批"
                : "សំណើរត្រៀមរួច",
          title:
            language === "en"
              ? "An approved credit limit is ready for loan application"
              : language === "zh-CN"
                ? "额度已获批，可以继续申请贷款"
                : "សូមពិនិត្យចំនួនដែលបានអនុម័ត និងលក្ខខណ្ឌ មុនពេលចុះហត្ថលេខា",
          description:
            language === "en"
              ? "The service agreement stays before submission and the loan agreement appears only after approval."
              : language === "zh-CN"
                ? "服务协议在提交前确认，借款合同仅会在获批报价后出现。"
                : "កិច្ចព្រមព្រៀងសេវាកម្មត្រូវបានបញ្ជាក់មុនដាក់ពាក្យ ហើយកិច្ចសន្យាប្រាក់កម្ចីនឹងបង្ហាញបន្ទាប់ពីអនុម័តប៉ុណ្ណោះ។",
          disabled: false,
          cta:
            language === "en"
              ? "Apply for loan"
              : language === "zh-CN"
                ? "申请贷款"
                : "មើល និងចុះហត្ថលេខាលើកិច្ចសន្យា",
        };
      case "view-bill":
        return {
          statusLabel:
            language === "en"
              ? "Repayment active"
              : language === "zh-CN"
                ? "账单处理中"
                : "ការសងប្រាក់កំពុងដំណើរការ",
          title:
            language === "en"
              ? "Manage the current bill instead of applying again"
              : language === "zh-CN"
                ? "当前已有放款，请先处理账单而不是再次申请"
                : "មានប្រាក់កម្ចីកំពុងដំណើរការរួចហើយ សូមគ្រប់គ្រងវិក្កយបត្រមុន",
          description:
            language === "en"
              ? "Open the SMILE wallet page from PayEase and complete bank authorization there."
              : language === "zh-CN"
                ? "请先从 PayEase 打开 SMILE 钱包页，并在其中完成银行授权。"
                : "សូមបើកទំព័រ SMILE wallet ពី PayEase ហើយបំពេញការអនុញ្ញាតធនាគារនៅទីនោះ។",
          disabled: false,
          cta:
            language === "en"
              ? "View current bill"
              : language === "zh-CN"
                ? "查看当前账单"
                : "មើលវិក្កយបត្របច្ចុប្បន្ន",
        };
      case "view-explanation":
        return {
          statusLabel:
            language === "en"
              ? "Cooling-off period"
              : language === "zh-CN"
                ? "冷静期内"
                : "មិនទាន់អាចដាក់ពាក្យឡើងវិញបានទេ",
          title:
            language === "en"
              ? "You cannot resubmit yet"
              : language === "zh-CN"
                ? "暂不可重新提交"
                : "មើលការពន្យល់អំពីពាក្យសុំបច្ចុប្បន្ន",
          description:
            language === "en"
              ? `${rejectionNotice ?? "This credit application was not approved."} Please wait ${rejectionCoolingOffDays ?? 7} day${rejectionCoolingOffDays === 1 ? "" : "s"} before resubmitting.`
              : language === "zh-CN"
                ? `${rejectionNotice ?? "本次额度申请未获批准。"} 还需等待 ${rejectionCoolingOffDays ?? 7} 天后才能重新提交。`
                : "បង្ហាញតែការពន្យល់ដែលអាចអនុវត្តបាន និងមានភាពអព្យាក្រឹត ប៉ុណ្ណោះ។",
          disabled: true,
          cta:
            language === "en"
              ? "Resubmit"
              : language === "zh-CN"
                ? "重新提交"
                : "មើលការពន្យល់",
        };
      case "apply-new":
        return {
          statusLabel:
            language === "en"
              ? result === "rejected-resolved"
                ? "Eligible to resubmit"
                : "Ready for a new credit application"
              : language === "zh-CN"
                ? result === "rejected-resolved"
                  ? "可重新提交"
                  : "可申请额度"
                : "អាចដាក់ពាក្យឡើងវិញបាន",
          title:
            language === "en"
              ? result === "rejected-resolved"
                ? "The cooling-off restriction has been lifted"
                : "Start a new credit application"
              : language === "zh-CN"
                ? result === "rejected-resolved"
                  ? "冷静期已解除，可以重新提交"
                  : "开始新的额度申请"
                : "ចាប់ផ្តើមពាក្យសុំប្រាក់ខែថ្មី",
          description:
            language === "en"
              ? result === "rejected-resolved"
                ? "Your previous rejection reason remains available in the record detail. You may now submit a new credit application."
                : "Eligibility still follows the review rules and any outstanding-cap controls."
              : language === "zh-CN"
                ? result === "rejected-resolved"
                  ? "上一笔拒绝原因仍可在记录详情中查看，现在可以重新提交额度申请。"
                  : "是否可重新申请仍以审核规则和未结清额度限制为准。"
                : language === "km"
                  ? "សិទ្ធិក្នុងការដាក់ពាក្យឡើងវិញនៅតែអាស្រ័យលើច្បាប់របស់ស្ថាប័នហិរញ្ញវត្ថុ និងកម្រិតមិនទាន់សង។"
                  : "",
          disabled: false,
          cta:
            language === "en"
              ? result === "rejected-resolved"
                ? "Resubmit"
                : "Apply for credit"
              : language === "zh-CN"
                ? result === "rejected-resolved"
                  ? "重新提交"
                  : "申请额度"
                : "ដាក់ពាក្យសុំកម្ចីថ្មី",
        };
      case "start":
      default:
        return {
          statusLabel:
            language === "en"
              ? "Ready to apply"
              : language === "zh-CN"
                ? "可开始申请"
                : "ត្រៀមរួចសម្រាប់ដាក់ពាក្យ",
          title:
            language === "en"
              ? "Start your salary loan application"
              : language === "zh-CN"
                ? "开始薪资贷申请"
                : "ចាប់ផ្តើមពាក្យសុំប្រាក់ខែរបស់អ្នក",
          description:
            language === "en"
              ? "Choose USD 10–500 with a 15-day or 30-day term. Final fees and contract terms appear only after review."
              : language === "zh-CN"
                ? "可申请 USD 10–500，仅支持 15 天或 30 天；完整费用和合同条款将在审核后展示。"
                : "អាចស្នើសុំ USD 10–500 សម្រាប់រយៈពេល 15 ឬ 30 ថ្ងៃ ប៉ុណ្ណោះ; ថ្លៃ និងលក្ខខណ្ឌនឹងបង្ហាញបន្ទាប់ពីពិនិត្យ។",
          disabled: false,
          cta:
            language === "en"
              ? "Apply for credit"
              : language === "zh-CN"
                ? "申请额度"
                : "ចាប់ផ្តើមដាក់ពាក្យ",
        };
    }
  })();
  function openBorrowEntry(): void {
    switch (entryAction) {
      case "start":
      case "apply-new":
        startNewApplication();
        return;
      case "continue-draft":
        setOrdersView("borrow");
        setStage("details");
        setCurrentPage("orders");
        return;
      case "view-progress":
      case "review-sign":
      case "view-explanation":
        if (applicationNo) {
          setCurrentPage("order-detail");
          return;
        }
        setOrdersView("borrow");
        setCurrentPage("orders");
        return;
      case "view-bill":
        setCurrentPage("repayment");
        return;
      default:
        setOrdersView("borrow");
        setCurrentPage("orders");
    }
  }

  function kycLocationStatusSummary(
    status: KycLocationStatus | null | undefined,
  ): string {
    if (!status) return kycCopy.idle;
    switch (status.assessmentResult) {
      case "MATCH":
        return kycCopy.success;
      case "LOW_ACCURACY":
        return kycCopy.lowAccuracy;
      case "UNAVAILABLE":
        return kycCopy.unavailable;
      case "OUT_OF_ZONE":
      case "OUT_OF_COUNTRY":
      default:
        return kycCopy.review;
    }
  }

  return (
    <main className="shell" lang={language}>
      {(() => {
        const pageBody = (
          <>
            {stage === "details" && formStep === "confirm" && (
              <section className="application-card">
                <h3>{kycCopy.title}</h3>
                <p className="response-note">{kycCopy.description}</p>
                <div className="reviewing">
                  <span className="pulse" />
                  {pendingKycLocation
                    ? kycCopy.pending
                    : kycLocationStatusSummary(kycLocation)}
                </div>
                {pendingKycLocation ? (
                  <div className="response-note" style={{ marginTop: 12 }}>
                    <div>
                      {kycCopy.capturedAt}:{" "}
                      {displayDate(pendingKycLocation.capturedAt)}
                    </div>
                    <div>
                      {kycCopy.accuracy}:{" "}
                      {Math.round(pendingKycLocation.horizontalAccuracyMeters)}
                      {kycCopy.meters}
                    </div>
                  </div>
                ) : null}
                {kycLocation ? (
                  <p className="response-note">
                    {displayDate(kycLocation.submittedAt)}
                    {" · "}
                    {kycLocationStatusSummary(kycLocation)}
                  </p>
                ) : null}
                <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
                  <button
                    className="primary"
                    disabled={!applicantSession || kycLocationSubmitting}
                    onClick={() =>
                      void (pendingKycLocation
                        ? submitKycLocationEvidence()
                        : requestKycLocationEvidence())
                    }
                  >
                    {kycLocationSubmitting
                      ? "…"
                      : pendingKycLocation
                        ? kycCopy.confirm
                        : kycCopy.authorize}
                  </button>
                  {pendingKycLocation ? (
                    <button
                      className="secondary"
                      disabled={!applicantSession || kycLocationSubmitting}
                      onClick={() => void requestKycLocationEvidence()}
                    >
                      {kycCopy.recapture}
                    </button>
                  ) : null}
                  <button
                    className="secondary"
                    disabled={!applicantSession || kycLocationSubmitting}
                    onClick={() => void loadKycLocationStatus()}
                  >
                    {kycCopy.refresh}
                  </button>
                </div>
                {kycLocationNotice ? (
                  <p className="response-note">{kycLocationNotice}</p>
                ) : null}
              </section>
            )}
            {(stage === "welcome" || stage === "details") && (
              <ApplicationFlow
                stage={stage}
                language={language}
                t={t}
                applicationCopy={applicationCopy}
                stepCopy={stepCopy}
                stepNavCopy={stepNavCopy}
                phoneCopy={phoneCopy}
                factoryCopy={factoryCopy}
                amountOptions={amountOptions}
                terms={terms}
                amountInput={amountInput}
                term={term}
                requestedAmountDisplay={
                  requestedAmountMinor
                    ? formatUsdMinor(requestedAmountMinor)
                    : "—"
                }
                showPreviewBadge={showPreviewBadge}
                formStep={formStep}
                formStepIndex={formStepIndex}
                employerTenants={employerTenants}
                phoneVerification={phoneVerification}
                phoneVerificationNotice={phoneVerificationNotice}
                applicantSession={applicantSession}
                residentialAddress={residentialAddress}
                name={name}
                phone={phone}
                employer={employer}
                emergencyContactOneName={emergencyContactOneName}
                emergencyContactOnePhone={emergencyContactOnePhone}
                emergencyContactTwoName={emergencyContactTwoName}
                emergencyContactTwoPhone={emergencyContactTwoPhone}
                employerTenantId={employerTenantId}
                identityDocumentType={identityDocumentType}
                identityDocumentNumber={identityDocumentNumber}
                bankName={bankName}
                bankAccountNumber={bankAccountNumber}
                bankAccountHolder={bankAccountHolder}
                livenessPrepared={livenessPrepared}
                wealthProofAttached={wealthProofAttached}
                consent={consent}
                employerVerificationAuthorized={employerVerificationAuthorized}
                serviceAgreementAuthorized={serviceAgreementAuthorized}
                postDisbursementBrokerageAuthorized={
                  postDisbursementBrokerageAuthorized
                }
                summaryItems={summaryItems}
                loading={loading}
                renderError={renderApplicantError}
                onAmountInputChange={setAmountInput}
                onTermChange={setTerm}
                onStart={() => {
                  const amountMinor = requestedAmountMinor;
                  if (!amountMinor) {
                    setError(amountInputError);
                    return;
                  }
                  setError("");
                  setFormStep("profile");
                  persistApplicationDraft({
                    stage: "details",
                    formStep: "profile",
                  });
                  setStage("details");
                }}
                onBack={goToPreviousApplicationStep}
                onSelectStep={revisitApplicationStep}
                onSaveCurrentStep={saveCurrentApplicationStep}
                onSubmit={() => void submit()}
                onResidentialAddressChange={setResidentialAddress}
                onNameChange={setName}
                onPhoneChange={setPhone}
                onEmployerChange={setEmployer}
                onContactOneNameChange={setEmergencyContactOneName}
                onContactOnePhoneChange={setEmergencyContactOnePhone}
                onContactTwoNameChange={setEmergencyContactTwoName}
                onContactTwoPhoneChange={setEmergencyContactTwoPhone}
                onCheckPhoneVerification={() => void loadPhoneVerification()}
                onRequestPhoneContact={() =>
                  requestTelegramPhoneContact(window, (result) => {
                    setPhoneVerificationNotice(
                      result === "sent"
                        ? phoneCopy.sent
                        : result === "cancelled"
                          ? phoneCopy.cancelled
                          : phoneCopy.unsupported,
                    );
                  })
                }
                onEmployerTenantChange={setEmployerTenantId}
                onIdentityDocumentTypeChange={setIdentityDocumentType}
                onIdentityDocumentNumberChange={setIdentityDocumentNumber}
                onBankNameChange={setBankName}
                onBankAccountNumberChange={setBankAccountNumber}
                onBankAccountHolderChange={setBankAccountHolder}
                onLivenessPreparedChange={setLivenessPrepared}
                onWealthProofAttachedChange={setWealthProofAttached}
                onConsentChange={setConsent}
                onEmployerVerificationAuthorizedChange={
                  setEmployerVerificationAuthorized
                }
                onServiceAgreementAuthorizedChange={
                  setServiceAgreementAuthorized
                }
                onPostDisbursementBrokerageAuthorizedChange={
                  setPostDisbursementBrokerageAuthorized
                }
              />
            )}

            {stage === "submitted" && (
              <section className="result-card">
                <div className="success-icon">✓</div>
                <h2>{t.submitted}</h2>
                <p>{t.submittedNote}</p>
                <div className="application-number">
                  <span>{t.status}</span>
                  <strong>{applicationNo}</strong>
                </div>
                <div className="reviewing">
                  <span className="pulse" />
                  {t.review}: {t.reviewing}
                </div>
                {error ? (
                  <ApplicantError
                    message={error}
                    entryPoints={recoveryEntryPoints}
                    language={language}
                  />
                ) : null}
                <button
                  className="primary"
                  disabled={loading}
                  onClick={() => void checkStatus()}
                >
                  {loading ? "…" : t.check}
                  <span>→</span>
                </button>
              </section>
            )}
            {stage === "offer" && (
              <section className="result-card">
                <div className="review-icon">⌛</div>
                <h2>
                  {lifecycleCopy?.title ??
                    (result === "withdrawn"
                      ? language === "en"
                        ? "Application withdrawn"
                        : language === "zh-CN"
                          ? "申请已撤回"
                          : "ពាក្យសុំត្រូវបានដកវិញ"
                      : result === "approved"
                        ? t.offer
                        : result.startsWith("rejected")
                          ? language === "en"
                            ? "Application not approved"
                            : language === "zh-CN"
                              ? "申请未获批准"
                              : "ពាក្យសុំមិនត្រូវបានអនុម័ត"
                          : result === "supplement-requested"
                            ? language === "en"
                              ? "Additional information needed"
                              : language === "zh-CN"
                                ? "需要补充资料"
                                : "ត្រូវការព័ត៌មានបន្ថែម"
                            : t.reviewing)}
                </h2>
                {error ? (
                  <ApplicantError
                    message={error}
                    entryPoints={recoveryEntryPoints}
                    language={language}
                  />
                ) : null}
                <p>
                  {lifecycleCopy?.message ??
                    (result === "withdrawn"
                      ? language === "en"
                        ? "This application is closed and will not continue to review or contract processing."
                        : language === "zh-CN"
                          ? "该申请已关闭，不会继续进入审核或合同处理。"
                          : "ពាក្យសុំនេះត្រូវបានបិទ ហើយនឹងមិនបន្តទៅការពិនិត្យ ឬដំណើរការកិច្ចសន្យាទេ។"
                      : result === "approved"
                        ? language === "en"
                          ? "The licensed lender has returned your approved limit."
                          : language === "km"
                            ? "ស្ថាប័នមានអាជ្ញាប័ណ្ណបានផ្តល់ទំហំដែលបានអនុម័ត។"
                            : "你的审核额度已更新。"
                        : result === "rejected-resolved"
                          ? language === "en"
                            ? "The lender has marked the reapplication condition as resolved. You may submit a new application."
                            : language === "zh-CN"
                              ? "再次申请条件已解除，你可以提交新的申请。"
                              : "ស្ថាប័នផ្តល់កម្ចីបានបញ្ជាក់ថាលក្ខខណ្ឌដាក់ពាក្យសុំឡើងវិញត្រូវបានដោះស្រាយ។"
                          : result === "rejected-pending"
                            ? language === "en"
                              ? `This credit application was not approved. Please wait ${rejectionCoolingOffDays ?? 7} day${rejectionCoolingOffDays === 1 ? "" : "s"} before resubmitting.`
                              : language === "zh-CN"
                                ? `本次申请未获批准。还需等待 ${rejectionCoolingOffDays ?? 7} 天后才能重新提交。`
                                : "ស្ថាប័នផ្តល់កម្ចីមិនបានអនុម័តពាក្យសុំនេះទេ។ មិនអាចដាក់ពាក្យសុំឡើងវិញបានទេ រហូតដល់លក្ខខណ្ឌត្រូវបានដោះស្រាយ។"
                            : result === "supplement-requested"
                              ? language === "en"
                                ? "The review team needs supplementary information. Please follow the broker's instructions; your application remains open."
                                : language === "zh-CN"
                                  ? "审核团队需要补充资料。请按页面提示补充；你的申请仍保持有效。"
                                  : "ក្រុមពិនិត្យត្រូវការព័ត៌មានបន្ថែម។ សូមអនុវត្តតាមការណែនាំរបស់ក្រុមជំនួយឥណទាន; ពាក្យសុំរបស់អ្នកនៅតែមានសុពលភាព។"
                              : t.noOffer)}
                </p>
                {result.startsWith("rejected") ? (
                  <p
                    className="response-note"
                    aria-label="Reapplication guidance"
                  >
                    {applicantRejectionNotice(
                      summary?.application.rejectionNoticeCode ?? null,
                      language,
                    ) ??
                      (language === "en"
                        ? "The licensed lender can provide the next-step guidance for this application."
                        : language === "zh-CN"
                          ? "客服可为本次申请提供下一步指引。"
                          : "ស្ថាប័នផ្តល់កម្ចីអាចផ្តល់ការណែនាំសម្រាប់ជំហានបន្ទាប់នៃពាក្យសុំនេះ។")}
                  </p>
                ) : null}
                {result === "supplement-requested" ? (
                  <section
                    className="next-payment supplement-response"
                    aria-label="Supplementary response"
                  >
                    <strong>
                      {language === "en"
                        ? "Send a supplementary response"
                        : language === "zh-CN"
                          ? "提交补充说明"
                          : "ផ្ញើការឆ្លើយតបបន្ថែម"}
                    </strong>
                    <small>
                      {language === "en"
                        ? "Explain what you have corrected or when you can provide the requested item. Do not include passwords, full card numbers, one-time codes, ID images or bank documents here."
                        : language === "zh-CN"
                          ? "请说明已更正的内容，或何时可提供所需材料。请勿在此填写密码、完整银行卡号、一次性验证码、证件照片或银行文件。"
                          : "សូមពន្យល់អំពីអ្វីដែលអ្នកបានកែតម្រូវ ឬពេលវេលាដែលអាចផ្តល់ឯកសារបាន។ កុំបញ្ចូលពាក្យសម្ងាត់ លេខកាតពេញ លេខកូដម្តង រូបថតអត្តសញ្ញាណប័ណ្ណ ឬឯកសារធនាគារនៅទីនេះ។"}
                    </small>
                    <label className="field-label">
                      {language === "en"
                        ? "Your response"
                        : language === "zh-CN"
                          ? "你的补充说明"
                          : "ការឆ្លើយតបរបស់អ្នក"}
                      <textarea
                        value={supplementMessage}
                        onChange={(event) =>
                          setSupplementMessage(event.target.value)
                        }
                        maxLength={2000}
                        rows={4}
                      />
                    </label>
                    <button
                      className="primary"
                      disabled={loading || supplementMessage.trim().length < 10}
                      onClick={() => void submitSupplementResponse()}
                    >
                      {language === "en"
                        ? "Send response"
                        : language === "zh-CN"
                          ? "发送说明"
                          : "ផ្ញើការឆ្លើយតប"}
                    </button>
                    {supplementNotice ? (
                      <p className="response-note">{supplementNotice}</p>
                    ) : null}
                  </section>
                ) : null}
                <div className="application-number">
                  <span>{t.status}</span>
                  <strong>{applicationNo}</strong>
                </div>
                <button
                  className="back-link refresh-status"
                  aria-label={t.refresh}
                  disabled={loading}
                  onClick={() => void checkStatus()}
                >
                  {t.refresh}
                </button>
                {canWithdraw ? (
                  <section
                    className="next-payment"
                    aria-label="Withdraw application"
                  >
                    <strong>
                      {language === "en"
                        ? "Need to stop this application?"
                        : language === "zh-CN"
                          ? "需要撤回申请吗？"
                          : "ត្រូវការដកពាក្យសុំនេះវិញឬ?"}
                    </strong>
                    <small>
                      {language === "en"
                        ? "You can withdraw before you confirm the loan contract."
                        : language === "zh-CN"
                          ? "在确认贷款合同前，你可以撤回申请。"
                          : "អ្នកអាចដកពាក្យសុំវិញ មុនពេលអ្នកបញ្ជាក់កិច្ចសន្យាប្រាក់កម្ចី។"}
                    </small>
                    {withdrawalConfirmationRequested ? (
                      <button
                        className="primary"
                        disabled={loading}
                        onClick={() => void withdrawApplication()}
                      >
                        {language === "en"
                          ? "Confirm withdrawal"
                          : language === "zh-CN"
                            ? "确认撤回"
                            : "បញ្ជាក់ការដកវិញ"}
                      </button>
                    ) : (
                      <button
                        className="back-link"
                        disabled={loading}
                        onClick={() => setWithdrawalConfirmationRequested(true)}
                      >
                        {language === "en"
                          ? "Withdraw application"
                          : language === "zh-CN"
                            ? "撤回申请"
                            : "ដកពាក្យសុំវិញ"}
                      </button>
                    )}
                  </section>
                ) : null}
                {result === "withdrawn" ? (
                  <p className="response-note">
                    {language === "en"
                      ? "No further action is required for this withdrawn application."
                      : language === "zh-CN"
                        ? "该已撤回申请无需进一步操作。"
                        : "មិនត្រូវការសកម្មភាពបន្ថែមសម្រាប់ពាក្យសុំដែលបានដកវិញនេះទេ។"}
                  </p>
                ) : result === "approved" ? (
                  <p className="response-note">
                    {language === "en"
                      ? "Approved limit: "
                      : language === "km"
                        ? "ទំហំបានអនុម័ត៖ "
                        : "审核额度："}
                    <strong>{formatUsdMinor(approvedAmountMinor)}</strong>
                  </p>
                ) : result === "rejected-resolved" ? (
                  <button className="primary" onClick={startNewApplication}>
                    {borrowEntryUi.cta}
                  </button>
                ) : (
                  <p className="response-note">{t.expected}</p>
                )}
                {result === "withdrawn" ? (
                  <button className="primary" onClick={startNewApplication}>
                    {borrowEntryUi.cta}
                  </button>
                ) : null}
                {summary ? (
                  <section
                    className="loan-dashboard"
                    aria-label="Loan dashboard"
                  >
                    <div className="dashboard-heading">
                      <strong>
                        {language === "en"
                          ? "Your loan information"
                          : language === "km"
                            ? "ព័ត៌មានឥណទានរបស់អ្នក"
                            : "我的贷款信息"}
                      </strong>
                      <span>
                        {applicantPhaseLabel(
                          applicantPhase(summary.application.status),
                          language,
                        )}
                      </span>
                    </div>
                    <div className="metric-grid">
                      <div>
                        <span>
                          {language === "en"
                            ? "Requested"
                            : language === "km"
                              ? "បានស្នើ"
                              : "申请金额"}
                        </span>
                        <b>
                          {formatUsdMinor(
                            summary.application.requestedAmountMinor,
                          )}
                        </b>
                      </div>
                      <div>
                        <span>{t.installments}</span>
                        <b>
                          {summary.quote?.installmentCount ??
                            summary.terms?.installmentCount ??
                            "—"}
                        </b>
                      </div>
                      <div>
                        <span>{t.firstDueDate}</span>
                        <b>
                          {displayDate(
                            summary.quote?.firstDueDate ??
                              summary.terms?.firstDueDate,
                          )}
                        </b>
                      </div>
                      <div>
                        <span>
                          {language === "en"
                            ? "Principal"
                            : language === "km"
                              ? "ដើមប្រាក់"
                              : "贷款本金"}
                        </span>
                        <b>
                          {summary.quote
                            ? formatUsdMinor(summary.quote.principalAmountMinor)
                            : summary.terms
                              ? formatUsdMinor(
                                  summary.terms.approvedAmountMinor,
                                )
                              : "—"}
                        </b>
                      </div>
                      <div>
                        <span>
                          {language === "en"
                            ? "Lender interest"
                            : language === "km"
                              ? "ការប្រាក់របស់ស្ថាប័ន"
                              : "持牌机构利息"}
                        </span>
                        <b>
                          {summary.quote
                            ? formatUsdMinor(summary.quote.lenderInterestMinor)
                            : summary.terms
                              ? formatUsdMinor(summary.terms.serviceFeeMinor)
                              : "—"}
                        </b>
                      </div>
                      <div>
                        <span>
                          {language === "en"
                            ? "Brokerage receivable"
                            : language === "km"
                              ? "កម្រៃជើងសារត្រូវទូទាត់បន្ទាប់ពីបើកប្រាក់"
                              : "放款后融资居间服务费应收"}
                        </span>
                        <b>
                          {summary.quote
                            ? formatUsdMinor(
                                summary.quote
                                  .brokerageRemunerationReceivableMinor,
                              )
                            : "—"}
                        </b>
                      </div>
                      <div>
                        <span>
                          {language === "en"
                            ? "Total repayment"
                            : language === "km"
                              ? "សរុបត្រូវសង"
                              : "应还总额"}
                        </span>
                        <b>
                          {summary.quote
                            ? formatUsdMinor(
                                summary.quote.totalRepaymentAmountMinor,
                              )
                            : summary.terms
                              ? formatUsdMinor(
                                  summary.terms.totalRepayableMinor,
                                )
                              : "—"}
                        </b>
                      </div>
                      <div>
                        <span>
                          {language === "en"
                            ? "Actual disbursement"
                            : language === "km"
                              ? "ចំនួនទឹកប្រាក់បើកជាក់ស្តែង"
                              : "实际到账"}
                        </span>
                        <b>
                          {summary.quote
                            ? formatUsdMinor(
                                summary.quote.actualDisbursementAmountMinor,
                              )
                            : "—"}
                        </b>
                      </div>
                      {summary.quote ? (
                        <>
                          <div>
                            <span>
                              {language === "en"
                                ? "Grace period"
                                : language === "km"
                                  ? "រយៈពេលអនុគ្រោះ"
                                  : "缓冲期"}
                            </span>
                            <b>
                              {summary.quote.repaymentGraceDays}{" "}
                              {language === "en"
                                ? "days"
                                : language === "km"
                                  ? "ថ្ងៃ"
                                  : "天"}
                            </b>
                          </div>
                          <div>
                            <span>
                              {language === "en"
                                ? "Rule versions"
                                : language === "km"
                                  ? "កំណែច្បាប់"
                                  : "规则版本"}
                            </span>
                            <b>
                              {summary.quote.productRuleVersion} /{" "}
                              {summary.quote.lenderInterestRuleVersion}
                            </b>
                          </div>
                        </>
                      ) : null}
                      <div>
                        <span>
                          {language === "en"
                            ? "Loan term"
                            : language === "km"
                              ? "រយៈពេលកម្ចី"
                              : "贷款期限"}
                        </span>
                        <b>
                          {summary.application.tenorDays}{" "}
                          {language === "en"
                            ? "days"
                            : language === "km"
                              ? "ថ្ងៃ"
                              : "天"}
                        </b>
                      </div>
                      {summary.application.employerTenantDisplayName ? (
                        <div>
                          <span>{factoryCopy.factory}</span>
                          <b>{summary.application.employerTenantDisplayName}</b>
                        </div>
                      ) : null}
                    </div>
                    {summary.application.status === "CONTRACT_PENDING" ? (
                      <section
                        className="next-payment"
                        aria-label="Contract confirmation"
                      >
                        <strong>
                          {language === "en"
                            ? "Confirm the displayed loan terms"
                            : language === "km"
                              ? "បញ្ជាក់លក្ខខណ្ឌកម្ចីដែលបានបង្ហាញ"
                              : "确认已展示的贷款条款"}
                        </strong>
                        <small>
                          {language === "en"
                            ? "This records your Telegram confirmation. Legal electronic-signature validation remains subject to local legal review."
                            : language === "km"
                              ? "វាកត់ត្រាការបញ្ជាក់តាម Telegram របស់អ្នក។ សុពលភាពហត្ថលេខាអេឡិចត្រូនិកនៅត្រូវពិនិត្យតាមច្បាប់មូលដ្ឋាន។"
                              : "此操作记录你的 Telegram 确认；电子签约法律效力仍以当地法务审查为准。"}
                        </small>
                        <button
                          className="primary"
                          disabled={loading}
                          onClick={() => void confirmDisplayedContract()}
                        >
                          {language === "en"
                            ? "Confirm terms"
                            : language === "km"
                              ? "បញ្ជាក់លក្ខខណ្ឌ"
                              : "确认条款"}
                        </button>
                      </section>
                    ) : summary.application.status ===
                      "USER_CONTRACT_CONFIRMED" ? (
                      <p className="response-note">
                        {language === "en"
                          ? "Your confirmation is recorded. The lender is completing its contract record."
                          : language === "km"
                            ? "ការបញ្ជាក់របស់អ្នកត្រូវបានកត់ត្រា។ ស្ថាប័នផ្តល់កម្ចីកំពុងបំពេញកំណត់ត្រាកិច្ចសន្យា។"
                            : "你的确认已记录，合同记录正在处理中。"}
                      </p>
                    ) : null}
                    {summary.repayment.periodCount > 0 ? (
                      <>
                        <div className="repayment-summary">
                          <div>
                            <span>
                              {language === "en"
                                ? "Paid periods"
                                : language === "km"
                                  ? "បង់រួច"
                                  : "已还期数"}
                            </span>
                            <b>
                              {summary.repayment.paidPeriods} /{" "}
                              {summary.repayment.periodCount}
                            </b>
                          </div>
                          <div>
                            <span>
                              {language === "en"
                                ? "Unpaid periods"
                                : language === "km"
                                  ? "មិនទាន់បង់"
                                  : "未还期数"}
                            </span>
                            <b>{summary.repayment.unpaidPeriods}</b>
                          </div>
                          <div>
                            <span>
                              {language === "en"
                                ? "Outstanding"
                                : language === "km"
                                  ? "នៅសល់ត្រូវសង"
                                  : "待还金额"}
                            </span>
                            <b>
                              {formatUsdMinor(
                                summary.repayment.outstandingMinor,
                              )}
                            </b>
                          </div>
                          <div>
                            <span>
                              {language === "en"
                                ? "Total paid"
                                : language === "km"
                                  ? "សរុបបានបង់"
                                  : "已还金额"}
                            </span>
                            <b>
                              {formatUsdMinor(summary.repayment.totalPaidMinor)}
                            </b>
                          </div>
                          <div>
                            <span>
                              {language === "en"
                                ? "Past due"
                                : language === "km"
                                  ? "ហួសកាលកំណត់"
                                  : "逾期期数 / 金额"}
                            </span>
                            <b>
                              {summary.repayment.overduePeriods} ·{" "}
                              {formatUsdMinor(
                                summary.repayment.overdueOutstandingMinor,
                              )}
                            </b>
                          </div>
                        </div>
                        {summary.repayment.nextInstallment ? (
                          <div className="next-payment">
                            <span>
                              {language === "en"
                                ? "Next payment"
                                : language === "km"
                                  ? "ការបង់បន្ទាប់"
                                  : "下一期还款"}
                            </span>
                            <strong>
                              {formatUsdMinor(
                                summary.repayment.nextInstallment
                                  .amountDueMinor,
                              )}
                            </strong>
                            <small>
                              #{summary.repayment.nextInstallment.installmentNo}{" "}
                              ·{" "}
                              {displayDate(
                                summary.repayment.nextInstallment.dueDate,
                              )}
                            </small>
                          </div>
                        ) : (
                          <div className="next-payment settled">
                            <span>
                              {language === "en"
                                ? "All installments are recorded as paid"
                                : language === "km"
                                  ? "បានកត់ត្រាការបង់គ្រប់កំណត់"
                                  : "全部期次已记录为已还"}
                            </span>
                          </div>
                        )}
                        <section
                          className="next-payment"
                          aria-label="SMILE wallet authorization"
                        >
                          <strong>
                            {language === "en"
                              ? "Continue in SMILE wallet"
                              : language === "km"
                                ? "បន្តនៅក្នុង SMILE wallet"
                                : "前往 SMILE 钱包页"}
                          </strong>
                          <small>
                            {language === "en"
                              ? "PayEase will only create a one-time jump. Your repayment amount, bank authorization, and payment password are handled inside the licensed lender's SMILE wallet page."
                              : language === "km"
                                ? "PayEase បង្កើតតែការលោតម្តងតែមួយប៉ុណ្ណោះ។ ចំនួនទឹកប្រាក់សង ការអនុញ្ញាតធនាគារ និងពាក្យសម្ងាត់ទូទាត់របស់អ្នក នឹងត្រូវដំណើរការនៅក្នុងទំព័រ SMILE wallet របស់ស្ថាប័នមានអាជ្ញាប័ណ្ណ។"
                                : "PayEase 只负责创建一次性跳转；还款金额、银行授权和支付密码都只在持牌机构的 SMILE 钱包页内处理。"}
                          </small>
                          {summary.repayment.unpaidPeriods > 0 ? (
                            <button
                              type="button"
                              className="primary"
                              disabled={loading}
                              onClick={() =>
                                void startWalletOperationJump("REPAYMENT")
                              }
                            >
                              {language === "en"
                                ? "Open SMILE wallet"
                                : language === "km"
                                  ? "បើក SMILE wallet"
                                  : "打开 SMILE 钱包页"}
                            </button>
                          ) : null}
                          {walletOperationNotice ? (
                            <p className="response-note">
                              {walletOperationNotice}
                            </p>
                          ) : null}
                        </section>
                        <div className="installments">
                          {summary.repayment.installments.map((item) => (
                            <div key={item.installmentNo}>
                              <span>
                                #{item.installmentNo} ·{" "}
                                {displayDate(item.dueDate)}
                              </span>
                              <b>{formatUsdMinor(item.amountDueMinor)}</b>
                              <em
                                className={
                                  item.status === "PAID" ? "paid" : "pending"
                                }
                              >
                                {item.status === "PAID"
                                  ? language === "en"
                                    ? "Paid"
                                    : language === "km"
                                      ? "បានបង់"
                                      : "已还"
                                  : language === "en"
                                    ? "Pending"
                                    : language === "km"
                                      ? "មិនទាន់បង់"
                                      : "待还"}
                              </em>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="response-note">
                        {language === "en"
                          ? "Repayment periods and payment fees will be generated after the licensed lender confirms disbursement."
                          : language === "km"
                            ? "កាលវិភាគបង់ និងថ្លៃបង់នឹងបង្កើតបន្ទាប់ពីស្ថាប័នមានអាជ្ញាប័ណ្ណបញ្ជាក់ការបើកប្រាក់។"
                            : "确认放款后，系统将生成还款期次、费用及账单。"}
                      </p>
                    )}
                    <section
                      className="next-payment"
                      aria-label="Customer support and complaints"
                    >
                      <strong>
                        {language === "en"
                          ? "Customer support and complaints"
                          : language === "zh-CN"
                            ? "客服与投诉"
                            : "សេវាអតិថិជន និងបណ្តឹង"}
                      </strong>
                      <small>
                        {language === "en"
                          ? "For a complaint, the licensed lender is responsible for the final outcome. Do not include passwords, card numbers or one-time codes."
                          : language === "zh-CN"
                            ? "投诉将由相关团队继续处理。请勿填写密码、银行卡完整号码或一次性验证码。"
                            : "សម្រាប់បណ្តឹង ស្ថាប័នមានអាជ្ញាប័ណ្ណទទួលខុសត្រូវលើលទ្ធផលចុងក្រោយ។ សូមកុំបញ្ចូលពាក្យសម្ងាត់ លេខកាតពេញលេញ ឬលេខកូដម្តងទៀត។"}
                      </small>
                      <label className="field-label">
                        {language === "en"
                          ? "Request type"
                          : language === "zh-CN"
                            ? "问题类型"
                            : "ប្រភេទសំណើ"}
                        <select
                          value={serviceCaseType}
                          onChange={(event) =>
                            setServiceCaseType(
                              event.target.value as
                                "SERVICE_QUERY" | "COMPLAINT",
                            )
                          }
                        >
                          <option value="SERVICE_QUERY">
                            {language === "en"
                              ? "Service question"
                              : language === "zh-CN"
                                ? "客服咨询"
                                : "សំណួរសេវាកម្ម"}
                          </option>
                          <option value="COMPLAINT">
                            {language === "en"
                              ? "Complaint"
                              : language === "zh-CN"
                                ? "投诉"
                                : "បណ្តឹង"}
                          </option>
                        </select>
                      </label>
                      <label className="field-label">
                        {language === "en"
                          ? "Tell us what happened"
                          : language === "zh-CN"
                            ? "请说明情况"
                            : "សូមពិពណ៌នាអំពីបញ្ហា"}
                        <textarea
                          value={serviceCaseMessage}
                          onChange={(event) =>
                            setServiceCaseMessage(event.target.value)
                          }
                          maxLength={2000}
                          rows={4}
                        />
                      </label>
                      <button
                        className="primary"
                        disabled={
                          loading || serviceCaseMessage.trim().length < 10
                        }
                        onClick={() => void submitServiceCase()}
                      >
                        {language === "en"
                          ? "Submit support case"
                          : language === "zh-CN"
                            ? "提交客服工单"
                            : "ដាក់សំណើសេវាកម្ម"}
                      </button>
                      <button
                        className="secondary"
                        disabled={loading || serviceCasesLoading}
                        onClick={() => void loadServiceCases()}
                      >
                        {serviceCasesLoading
                          ? "…"
                          : language === "en"
                            ? "View my case history"
                            : language === "zh-CN"
                              ? "查看我的工单记录"
                              : "មើលប្រវត្តិសំណើរបស់ខ្ញុំ"}
                      </button>
                      {serviceCaseNotice ? (
                        <p className="response-note">{serviceCaseNotice}</p>
                      ) : null}
                      {serviceCasesLoaded ? (
                        serviceCases.length === 0 ? (
                          <p className="response-note">
                            {language === "en"
                              ? "No support cases have been recorded for this application."
                              : language === "zh-CN"
                                ? "该申请暂无客服或投诉工单。"
                                : "មិនទាន់មានសំណើសេវាកម្ម ឬបណ្តឹងសម្រាប់ពាក្យស្នើសុំនេះទេ។"}
                          </p>
                        ) : (
                          <ul className="application-history">
                            {serviceCases.map((serviceCase) => (
                              <li key={serviceCase.caseNo}>
                                <strong>{serviceCase.caseNo}</strong>
                                <span>
                                  {applicantServiceCaseLabel(
                                    serviceCase,
                                    language,
                                  )}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )
                      ) : null}
                    </section>
                  </section>
                ) : null}
              </section>
            )}

            {applicationHistory.length > 0 ? (
              <section
                className="history-card"
                aria-label="Application history"
              >
                <div className="progress-title">
                  <span>
                    {language === "en"
                      ? "Your applications"
                      : language === "zh-CN"
                        ? "我的申请记录"
                        : "ពាក្យសុំរបស់អ្នក"}
                  </span>
                  <small>{applicationHistory.length}</small>
                </div>
                <div className="history-list">
                  {applicationHistory.map((item) => {
                    const phase = applicantPhase(item.status);
                    return (
                      <button
                        className="history-item"
                        key={item.applicationNo}
                        onClick={async () => {
                          if (item.applicationNo !== applicationNo) {
                            setServiceCases([]);
                            setServiceCasesLoaded(false);
                          }
                          await checkStatus(item.applicationNo);
                          setCurrentPage("order-detail");
                        }}
                        disabled={loading}
                      >
                        <span>
                          <strong>
                            {formatUsdMinor(item.requestedAmountMinor)}
                          </strong>
                          <small>{item.applicationNo}</small>
                          {item.employerTenantDisplayName ? (
                            <small>
                              {factoryCopy.factory}:{" "}
                              {item.employerTenantDisplayName}
                            </small>
                          ) : null}
                        </span>
                        <em>{applicantPhaseLabel(phase, language)}</em>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </>
        );
        switch (currentPage) {
          case "orders":
            return (
              <HomePage
                language={language}
                current={currentPage}
                onChange={setCurrentPage}
                showPreviewBadge={showPreviewBadge}
                applicantSession={applicantSession}
                loading={loading}
                onLanguageChange={changeLanguage}
                onLogout={() => void logoutApplicant()}
                borrowEntryLabel={borrowEntryUi.cta}
                borrowEntryHint={borrowEntryUi.description}
                borrowEntryDisabled={borrowEntryUi.disabled}
                onBorrowEntry={openBorrowEntry}
                onOpenNotifications={openNotificationsCenter}
                onOpenRecords={openRecordCenter}
                onOpenReassessment={openReassessmentCenter}
                unreadNotificationCount={unreadNotificationCount}
              >
                <OrdersWorkspace
                  language={language}
                  empty={applicationHistory.length === 0}
                  onOpenFirst={() => {
                    if (!applicationHistory[0]) return;
                    setApplicationNo(applicationHistory[0].applicationNo);
                    void checkStatus(applicationHistory[0].applicationNo);
                    setCurrentPage("order-detail");
                  }}
                  currentStep={currentStep}
                  reviewLabel={t.review ?? ""}
                  securedLabel={t.secured ?? ""}
                  progressLabels={[
                    t.apply ?? "",
                    t.broker ?? "",
                    t.lender ?? "",
                    t.offer ?? "",
                  ]}
                  ordersView={ordersView}
                  onSelectOrdersView={setOrdersView}
                  pageBody={pageBody}
                  filteredHistory={filteredHistory}
                  historyFilters={historyFilters}
                  recordFilter={recordFilter}
                  onRecordFilterChange={setRecordFilter}
                  onOpenHistoryItem={async (applicationNo) => {
                    setOrdersView("records");
                    await checkStatus(applicationNo);
                    setCurrentPage("order-detail");
                  }}
                  result={result}
                  wealthProofAttached={wealthProofAttached}
                  employerTenantId={employerTenantId}
                  reassessmentSubmitted={reassessmentSubmitted}
                  reassessmentRequest={reassessmentRequest ?? undefined}
                  canRequestReassessment={
                    summary?.recordDetail?.canRequestReassessment ?? false
                  }
                  onSubmitReassessmentRequest={() =>
                    void submitReassessmentRequest()
                  }
                  displayDate={displayDate}
                  maskApplicationNo={maskedApplicationNo}
                  phaseLabelForStatus={(status) =>
                    applicantPhaseLabel(applicantPhase(status), language)
                  }
                  historyActionLabelForStatus={(status) =>
                    applicationHistoryFilter(status) === "PENDING_CONTRACT"
                      ? language === "en"
                        ? "View approved terms"
                        : language === "zh-CN"
                          ? "查看获批报价"
                          : "មើលលក្ខខណ្ឌដែលបានអនុម័ត"
                      : applicationHistoryFilter(status) === "ACTIVE"
                        ? language === "en"
                          ? "View bill"
                          : language === "zh-CN"
                            ? "查看账单"
                            : "មើលវិក្កយបត្រ"
                        : language === "en"
                          ? "View details"
                          : language === "zh-CN"
                            ? "查看详情"
                            : "មើលលម្អិត"
                  }
                />
              </HomePage>
            );
          case "order-detail":
            return (
              <HomePage
                language={language}
                current={currentPage}
                onChange={setCurrentPage}
                showPreviewBadge={showPreviewBadge}
                applicantSession={applicantSession}
                loading={loading}
                onLanguageChange={changeLanguage}
                onLogout={() => void logoutApplicant()}
                borrowEntryLabel={borrowEntryUi.cta}
                borrowEntryHint={borrowEntryUi.description}
                borrowEntryDisabled={borrowEntryUi.disabled}
                onBorrowEntry={openBorrowEntry}
                onOpenNotifications={openNotificationsCenter}
                onOpenRecords={openRecordCenter}
                onOpenReassessment={openReassessmentCenter}
                unreadNotificationCount={unreadNotificationCount}
              >
                <OrderDetailPage
                  language={language}
                  applicationNo={applicationNo || null}
                  onBack={() => setCurrentPage("orders")}
                >
                  {stage === "submitted" && (
                    <section className="result-card">
                      <div className="success-icon">✓</div>
                      <h2>{t.submitted}</h2>
                      <p>{t.submittedNote}</p>
                      <div className="application-number">
                        <span>{t.status}</span>
                        <strong>{applicationNo}</strong>
                      </div>
                      <div className="reviewing">
                        <span className="pulse" />
                        {t.review}: {t.reviewing}
                      </div>
                      {error ? (
                        <ApplicantError
                          message={error}
                          entryPoints={recoveryEntryPoints}
                          language={language}
                        />
                      ) : null}
                      <button
                        className="primary"
                        disabled={loading}
                        onClick={() => void checkStatus()}
                      >
                        {loading ? "…" : t.check}
                        <span>→</span>
                      </button>
                    </section>
                  )}
                  {stage === "offer" && (
                    <section className="result-card">
                      <div className="review-icon">⌛</div>
                      <h2>
                        {lifecycleCopy?.title ??
                          (result === "withdrawn"
                            ? language === "en"
                              ? "Application withdrawn"
                              : language === "zh-CN"
                                ? "申请已撤回"
                                : "ពាក្យសុំត្រូវបានដកវិញ"
                            : result === "approved"
                              ? t.offer
                              : result.startsWith("rejected")
                                ? language === "en"
                                  ? "Application not approved"
                                  : language === "zh-CN"
                                    ? "申请未获批准"
                                    : "ពាក្យសុំមិនត្រូវបានអនុម័ត"
                                : result === "supplement-requested"
                                  ? language === "en"
                                    ? "Additional information needed"
                                    : language === "zh-CN"
                                      ? "需要补充资料"
                                      : "ត្រូវការព័ត៌មានបន្ថែម"
                                  : t.reviewing)}
                      </h2>
                      {error ? (
                        <ApplicantError
                          message={error}
                          entryPoints={recoveryEntryPoints}
                          language={language}
                        />
                      ) : null}
                      <p>
                        {lifecycleCopy?.message ??
                          (result === "withdrawn"
                            ? language === "en"
                              ? "This application is closed and will not continue to review or contract processing."
                              : language === "zh-CN"
                                ? "该申请已关闭，不会继续进入审核或合同处理。"
                                : "ពាក្យសុំនេះត្រូវបានបិទ ហើយនឹងមិនបន្តទៅការពិនិត្យ ឬដំណើរការកិច្ចសន្យាទេ។"
                            : result === "approved"
                              ? language === "en"
                                ? "The licensed lender has returned your approved limit."
                                : language === "km"
                                  ? "ស្ថាប័នមានអាជ្ញាប័ណ្ណបានផ្តល់ទំហំដែលបានអនុម័ត។"
                                  : "你的审核额度已更新。"
                              : result === "rejected-resolved"
                                ? language === "en"
                                  ? "The lender has marked the reapplication condition as resolved. You may submit a new application."
                                  : language === "zh-CN"
                                    ? "再次申请条件已解除，你可以提交新的申请。"
                                    : "ស្ថាប័នផ្តល់កម្ចីបានបញ្ជាក់ថាលក្ខខណ្ឌដាក់ពាក្យសុំឡើងវិញត្រូវបានដោះស្រាយ។"
                                : result === "rejected-pending"
                                  ? language === "en"
                                    ? `This credit application was not approved. Please wait ${rejectionCoolingOffDays ?? 7} day${rejectionCoolingOffDays === 1 ? "" : "s"} before resubmitting.`
                                    : language === "zh-CN"
                                      ? `本次申请未获批准。还需等待 ${rejectionCoolingOffDays ?? 7} 天后才能重新提交。`
                                      : "ស្ថាប័នផ្តល់កម្ចីមិនបានអនុម័តពាក្យសុំនេះទេ។ មិនអាចដាក់ពាក្យសុំឡើងវិញបានទេ រហូតដល់លក្ខខណ្ឌត្រូវបានដោះស្រាយ។"
                                  : result === "supplement-requested"
                                    ? language === "en"
                                      ? "The review team needs supplementary information. Please follow the broker's instructions; your application remains open."
                                      : language === "zh-CN"
                                        ? "审核团队需要补充资料。请按页面提示补充；你的申请仍保持有效。"
                                        : "ក្រុមពិនិត្យត្រូវការព័ត៌មានបន្ថែម។ សូមអនុវត្តតាមការណែនាំរបស់ក្រុមជំនួយឥណទាន; ពាក្យសុំរបស់អ្នកនៅតែមានសុពលភាព។"
                                    : t.noOffer)}
                      </p>
                      {result.startsWith("rejected") ? (
                        <p
                          className="response-note"
                          aria-label="Reapplication guidance"
                        >
                          {applicantRejectionNotice(
                            summary?.application.rejectionNoticeCode ?? null,
                            language,
                          ) ??
                            (language === "en"
                              ? "The licensed lender can provide the next-step guidance for this application."
                              : language === "zh-CN"
                                ? "客服可为本次申请提供下一步指引。"
                                : "ស្ថាប័នផ្តល់កម្ចីអាចផ្តល់ការណែនាំសម្រាប់ជំហានបន្ទាប់នៃពាក្យសុំនេះ។")}
                        </p>
                      ) : null}
                      {result === "supplement-requested" ? (
                        <section
                          className="next-payment supplement-response"
                          aria-label="Supplementary response"
                        >
                          <strong>
                            {language === "en"
                              ? "Send a supplementary response"
                              : language === "zh-CN"
                                ? "提交补充说明"
                                : "ផ្ញើការឆ្លើយតបបន្ថែម"}
                          </strong>
                          <small>
                            {language === "en"
                              ? "Explain what you have corrected or when you can provide the requested item. Do not include passwords, full card numbers, one-time codes, ID images or bank documents here."
                              : language === "zh-CN"
                                ? "请说明已更正的内容，或何时可提供所需材料。请勿在此填写密码、完整银行卡号、一次性验证码、证件照片或银行文件。"
                                : "សូមពន្យល់អំពីអ្វីដែលអ្នកបានកែតម្រូវ ឬពេលវេលាដែលអាចផ្តល់ឯកសារបាន។ កុំបញ្ចូលពាក្យសម្ងាត់ លេខកាតពេញ លេខកូដម្តង រូបថតអត្តសញ្ញាណប័ណ្ណ ឬឯកសារធនាគារនៅទីនេះ។"}
                          </small>
                          <label className="field-label">
                            {language === "en"
                              ? "Your response"
                              : language === "zh-CN"
                                ? "你的补充说明"
                                : "ការឆ្លើយតបរបស់អ្នក"}
                            <textarea
                              value={supplementMessage}
                              onChange={(event) =>
                                setSupplementMessage(event.target.value)
                              }
                              maxLength={2000}
                              rows={4}
                            />
                          </label>
                          <button
                            className="primary"
                            disabled={
                              loading || supplementMessage.trim().length < 10
                            }
                            onClick={() => void submitSupplementResponse()}
                          >
                            {language === "en"
                              ? "Send response"
                              : language === "zh-CN"
                                ? "发送说明"
                                : "ផ្ញើការឆ្លើយតប"}
                          </button>
                          {supplementNotice ? (
                            <p className="response-note">{supplementNotice}</p>
                          ) : null}
                        </section>
                      ) : null}
                      <div className="application-number">
                        <span>{t.status}</span>
                        <strong>{applicationNo}</strong>
                      </div>
                      <button
                        className="back-link refresh-status"
                        aria-label={t.refresh}
                        disabled={loading}
                        onClick={() => void checkStatus()}
                      >
                        {t.refresh}
                      </button>
                      {canWithdraw ? (
                        <section
                          className="next-payment"
                          aria-label="Withdraw application"
                        >
                          <strong>
                            {language === "en"
                              ? "Need to stop this application?"
                              : language === "zh-CN"
                                ? "需要撤回申请吗？"
                                : "ត្រូវការដកពាក្យសុំនេះវិញឬ?"}
                          </strong>
                          <small>
                            {language === "en"
                              ? "You can withdraw before you confirm the loan contract."
                              : language === "zh-CN"
                                ? "在确认贷款合同前，你可以撤回申请。"
                                : "អ្នកអាចដកពាក្យសុំវិញ មុនពេលអ្នកបញ្ជាក់កិច្ចសន្យាប្រាក់កម្ចី។"}
                          </small>
                          {withdrawalConfirmationRequested ? (
                            <button
                              className="primary"
                              disabled={loading}
                              onClick={() => void withdrawApplication()}
                            >
                              {language === "en"
                                ? "Confirm withdrawal"
                                : language === "zh-CN"
                                  ? "确认撤回"
                                  : "បញ្ជាក់ការដកវិញ"}
                            </button>
                          ) : (
                            <button
                              className="back-link"
                              disabled={loading}
                              onClick={() =>
                                setWithdrawalConfirmationRequested(true)
                              }
                            >
                              {language === "en"
                                ? "Withdraw application"
                                : language === "zh-CN"
                                  ? "撤回申请"
                                  : "ដកពាក្យសុំវិញ"}
                            </button>
                          )}
                        </section>
                      ) : null}
                      {result === "withdrawn" ? (
                        <p className="response-note">
                          {language === "en"
                            ? "No further action is required for this withdrawn application."
                            : language === "zh-CN"
                              ? "该已撤回申请无需进一步操作。"
                              : "មិនត្រូវការសកម្មភាពបន្ថែមសម្រាប់ពាក្យសុំដែលបានដកវិញនេះទេ។"}
                        </p>
                      ) : result === "approved" ? (
                        <p className="response-note">
                          {language === "en"
                            ? "Approved limit: "
                            : language === "km"
                              ? "ទំហំបានអនុម័ត៖ "
                              : "审核额度："}
                          <strong>{formatUsdMinor(approvedAmountMinor)}</strong>
                        </p>
                      ) : result === "rejected-resolved" ? (
                        <button
                          className="primary"
                          onClick={startNewApplication}
                        >
                          {borrowEntryUi.cta}
                        </button>
                      ) : (
                        <p className="response-note">{t.expected}</p>
                      )}
                      {result === "withdrawn" ? (
                        <button
                          className="primary"
                          onClick={startNewApplication}
                        >
                          {borrowEntryUi.cta}
                        </button>
                      ) : null}
                      {summary ? (
                        <section
                          className="loan-dashboard"
                          aria-label="Loan dashboard"
                        >
                          <div className="dashboard-heading">
                            <strong>
                              {language === "en"
                                ? "Your loan information"
                                : language === "km"
                                  ? "ព័ត៌មានឥណទានរបស់អ្នក"
                                  : "我的贷款信息"}
                            </strong>
                            <span>
                              {applicantPhaseLabel(
                                applicantPhase(summary.application.status),
                                language,
                              )}
                            </span>
                          </div>
                          <h3
                            className={`phase-title phase-title--${applicantPhase(summary.application.status)}`}
                          >
                            {applicantPhaseLabel(
                              applicantPhase(summary.application.status),
                              language,
                            )}
                          </h3>
                          <div className="metric-grid">
                            <div>
                              <span>
                                {language === "en"
                                  ? "Applied amount"
                                  : language === "km"
                                    ? "ចំនួនស្នើសុំ"
                                    : "申请金额"}
                              </span>
                              <b>
                                {formatUsdMinor(
                                  summary.application.requestedAmountMinor,
                                )}
                              </b>
                            </div>
                            {approvedAmountMinor ? (
                              <div>
                                <span>
                                  {language === "en"
                                    ? "Principal"
                                    : language === "zh-CN"
                                      ? "贷款本金"
                                      : "ដើមប្រាក់"}
                                </span>
                                <b>
                                  {formatUsdMinor(
                                    summary.quote?.principalAmountMinor ??
                                      approvedAmountMinor,
                                  )}
                                </b>
                              </div>
                            ) : null}
                            <div>
                              <span>
                                {language === "en"
                                  ? "Lender interest"
                                  : language === "km"
                                    ? "ការប្រាក់របស់ស្ថាប័ន"
                                    : "持牌机构利息"}
                              </span>
                              <b>
                                {summary.quote
                                  ? formatUsdMinor(
                                      summary.quote.lenderInterestMinor,
                                    )
                                  : summary.terms
                                    ? formatUsdMinor(
                                        summary.terms.serviceFeeMinor,
                                      )
                                    : "—"}
                              </b>
                            </div>
                            <div>
                              <span>
                                {language === "en"
                                  ? "Brokerage receivable"
                                  : language === "km"
                                    ? "កម្រៃជើងសារត្រូវទូទាត់បន្ទាប់ពីបើកប្រាក់"
                                    : "放款后融资居间服务费应收"}
                              </span>
                              <b>
                                {summary.quote
                                  ? formatUsdMinor(
                                      summary.quote
                                        .brokerageRemunerationReceivableMinor,
                                    )
                                  : "—"}
                              </b>
                            </div>
                            <div>
                              <span>
                                {language === "en"
                                  ? "Total repayment"
                                  : language === "km"
                                    ? "សរុបត្រូវសង"
                                    : "应还总额"}
                              </span>
                              <b>
                                {summary.quote
                                  ? formatUsdMinor(
                                      summary.quote.totalRepaymentAmountMinor,
                                    )
                                  : summary.terms
                                    ? formatUsdMinor(
                                        summary.terms.totalRepayableMinor,
                                      )
                                    : "—"}
                              </b>
                            </div>
                            <div>
                              <span>
                                {language === "en"
                                  ? "Actual disbursement"
                                  : language === "km"
                                    ? "ចំនួនទឹកប្រាក់បើកជាក់ស្តែង"
                                    : "实际到账"}
                              </span>
                              <b>
                                {summary.quote
                                  ? formatUsdMinor(
                                      summary.quote
                                        .actualDisbursementAmountMinor,
                                    )
                                  : "—"}
                              </b>
                            </div>
                            {summary.quote || summary.terms ? (
                              <>
                                <div>
                                  <span>
                                    {language === "en"
                                      ? "Installments"
                                      : language === "km"
                                        ? "ប្រភេទការបង់ប្រាក់"
                                        : "分期数"}
                                  </span>
                                  <b>
                                    {summary.quote?.installmentCount ??
                                      summary.terms?.installmentCount ??
                                      "—"}
                                  </b>
                                </div>
                                <div>
                                  <span>
                                    {language === "en"
                                      ? "First repayment date"
                                      : language === "zh-CN"
                                        ? "首次还款日期"
                                        : "ថ្ងៃសងប្រាក់ដំបូង"}
                                  </span>
                                  <b>
                                    {displayDate(
                                      summary.quote?.firstDueDate ??
                                        summary.terms?.firstDueDate,
                                    )}
                                  </b>
                                </div>
                              </>
                            ) : null}
                            <div>
                              <span>
                                {language === "en"
                                  ? "Loan term"
                                  : language === "km"
                                    ? "រយៈពេលកម្ចី"
                                    : "贷款期限"}
                              </span>
                              <b>
                                {summary.application.tenorDays}{" "}
                                {language === "en"
                                  ? "days"
                                  : language === "km"
                                    ? "ថ្ងៃ"
                                    : "天"}
                              </b>
                            </div>
                            {summary.application.employerTenantDisplayName ? (
                              <div>
                                <span>{factoryCopy.factory}</span>
                                <b>
                                  {
                                    summary.application
                                      .employerTenantDisplayName
                                  }
                                </b>
                              </div>
                            ) : null}
                          </div>
                          {summary.application.status === "CONTRACT_PENDING" ? (
                            <section
                              className="next-payment"
                              aria-label="Contract confirmation"
                            >
                              <strong>
                                {language === "en"
                                  ? "Confirm the displayed loan terms"
                                  : language === "km"
                                    ? "បញ្ជាក់លក្ខខណ្ឌកម្ចីដែលបានបង្ហាញ"
                                    : "确认已展示的贷款条款"}
                              </strong>
                              <small>
                                {language === "en"
                                  ? "This records your Telegram confirmation. Legal electronic-signature validation remains subject to local legal review."
                                  : language === "km"
                                    ? "វាកត់ត្រាការបញ្ជាក់តាម Telegram របស់អ្នក។ សុពលភាពហត្ថលេខាអេឡិចត្រូនិកនៅត្រូវពិនិត្យតាមច្បាប់មូលដ្ឋាន។"
                                    : "此操作记录你的 Telegram 确认；电子签约法律效力仍以当地法务审查为准。"}
                              </small>
                              <button
                                className="primary"
                                disabled={loading}
                                onClick={() => void confirmDisplayedContract()}
                              >
                                {language === "en"
                                  ? "Confirm terms"
                                  : language === "km"
                                    ? "បញ្ជាក់លក្ខខណ្ឌ"
                                    : "确认条款"}
                              </button>
                            </section>
                          ) : summary.application.status ===
                            "USER_CONTRACT_CONFIRMED" ? (
                            <p className="response-note">
                              {language === "en"
                                ? "Your confirmation is recorded. The lender is completing its contract record."
                                : language === "km"
                                  ? "ការបញ្ជាក់របស់អ្នកត្រូវបានកត់ត្រា។ ស្ថាប័នផ្តល់កម្ចីកំពុងបំពេញកំណត់ត្រាកិច្ចសន្យា។"
                                  : "你的确认已记录，合同记录正在处理中。"}
                            </p>
                          ) : null}
                          {summary.repayment.periodCount > 0 ? (
                            <>
                              <div className="repayment-summary">
                                <div>
                                  <span>
                                    {language === "en"
                                      ? "Paid periods"
                                      : language === "km"
                                        ? "បង់រួច"
                                        : "已还期数"}
                                  </span>
                                  <b>
                                    {summary.repayment.paidPeriods} /{" "}
                                    {summary.repayment.periodCount}
                                  </b>
                                </div>
                                <div>
                                  <span>
                                    {language === "en"
                                      ? "Unpaid periods"
                                      : language === "km"
                                        ? "មិនទាន់បង់"
                                        : "未还期数"}
                                  </span>
                                  <b>{summary.repayment.unpaidPeriods}</b>
                                </div>
                                <div>
                                  <span>
                                    {language === "en"
                                      ? "Outstanding"
                                      : language === "km"
                                        ? "នៅសល់ត្រូវសង"
                                        : "待还金额"}
                                  </span>
                                  <b>
                                    {formatUsdMinor(
                                      summary.repayment.outstandingMinor,
                                    )}
                                  </b>
                                </div>
                                <div>
                                  <span>
                                    {language === "en"
                                      ? "Total paid"
                                      : language === "km"
                                        ? "សរុបបានបង់"
                                        : "已还金额"}
                                  </span>
                                  <b>
                                    {formatUsdMinor(
                                      summary.repayment.totalPaidMinor,
                                    )}
                                  </b>
                                </div>
                                <div>
                                  <span>
                                    {language === "en"
                                      ? "Past due"
                                      : language === "km"
                                        ? "ហួសកាលកំណត់"
                                        : "逾期期数 / 金额"}
                                  </span>
                                  <b>
                                    {summary.repayment.overduePeriods} ·{" "}
                                    {formatUsdMinor(
                                      summary.repayment.overdueOutstandingMinor,
                                    )}
                                  </b>
                                </div>
                              </div>
                              {summary.repayment.nextInstallment ? (
                                <div className="next-payment">
                                  <span>
                                    {language === "en"
                                      ? "Next payment"
                                      : language === "km"
                                        ? "ការបង់បន្ទាប់"
                                        : "下一期还款"}
                                  </span>
                                  <strong>
                                    {formatUsdMinor(
                                      summary.repayment.nextInstallment
                                        .amountDueMinor,
                                    )}
                                  </strong>
                                  <small>
                                    #
                                    {
                                      summary.repayment.nextInstallment
                                        .installmentNo
                                    }{" "}
                                    ·{" "}
                                    {displayDate(
                                      summary.repayment.nextInstallment.dueDate,
                                    )}
                                  </small>
                                </div>
                              ) : (
                                <div className="next-payment settled">
                                  <span>
                                    {language === "en"
                                      ? "All installments are recorded as paid"
                                      : language === "km"
                                        ? "បានកត់ត្រាការបង់គ្រប់កំណត់"
                                        : "全部期次已记录为已还"}
                                  </span>
                                </div>
                              )}
                              <section
                                className="next-payment"
                                aria-label="SMILE wallet authorization"
                              >
                                <strong>
                                  {language === "en"
                                    ? "Continue in SMILE wallet"
                                    : language === "km"
                                      ? "បន្តនៅក្នុង SMILE wallet"
                                      : "前往 SMILE 钱包页"}
                                </strong>
                                <small>
                                  {language === "en"
                                    ? "PayEase will only create a one-time jump. Your repayment amount, bank authorization, and payment password are handled inside the licensed lender's SMILE wallet page."
                                    : language === "km"
                                      ? "PayEase បង្កើតតែការលោតម្តងតែមួយប៉ុណ្ណោះ។ ចំនួនទឹកប្រាក់សង ការអនុញ្ញាតធនាគារ និងពាក្យសម្ងាត់ទូទាត់របស់អ្នក នឹងត្រូវដំណើរការនៅក្នុងទំព័រ SMILE wallet របស់ស្ថាប័នមានអាជ្ញាប័ណ្ណ។"
                                      : "PayEase 只负责创建一次性跳转；还款金额、银行授权和支付密码都只在持牌机构的 SMILE 钱包页内处理。"}
                                </small>
                                {summary.repayment.unpaidPeriods > 0 ? (
                                  <button
                                    type="button"
                                    className="primary"
                                    disabled={loading}
                                    onClick={() =>
                                      void startWalletOperationJump("REPAYMENT")
                                    }
                                  >
                                    {language === "en"
                                      ? "Open SMILE wallet"
                                      : language === "km"
                                        ? "បើក SMILE wallet"
                                        : "打开 SMILE 钱包页"}
                                  </button>
                                ) : null}
                                {walletOperationNotice ? (
                                  <p className="response-note">
                                    {walletOperationNotice}
                                  </p>
                                ) : null}
                              </section>
                              <div className="installments">
                                {summary.repayment.installments.map((item) => (
                                  <div key={item.installmentNo}>
                                    <span>
                                      #{item.installmentNo} ·{" "}
                                      {displayDate(item.dueDate)}
                                    </span>
                                    <b>{formatUsdMinor(item.amountDueMinor)}</b>
                                    <em
                                      className={
                                        item.status === "PAID"
                                          ? "paid"
                                          : "pending"
                                      }
                                    >
                                      {item.status === "PAID"
                                        ? language === "en"
                                          ? "Paid"
                                          : language === "km"
                                            ? "បានបង់"
                                            : "已还"
                                        : language === "en"
                                          ? "Pending"
                                          : language === "km"
                                            ? "មិនទាន់បង់"
                                            : "待还"}
                                    </em>
                                  </div>
                                ))}
                              </div>
                            </>
                          ) : (
                            <p className="response-note">
                              {language === "en"
                                ? "Repayment periods and payment fees will be generated after the licensed lender confirms disbursement."
                                : language === "km"
                                  ? "កាលវិភាគបង់ និងថ្លៃបង់នឹងបង្កើតបន្ទាប់ពីស្ថាប័នមានអាជ្ញាប័ណ្ណបញ្ជាក់ការបើកប្រាក់។"
                                  : "确认放款后，系统将生成还款期次、费用及账单。"}
                            </p>
                          )}
                          <section
                            className="next-payment"
                            aria-label="Customer support and complaints"
                          >
                            <strong>
                              {language === "en"
                                ? "Customer support and complaints"
                                : language === "zh-CN"
                                  ? "客服与投诉"
                                  : "សេវាអតិថិជន និងបណ្តឹង"}
                            </strong>
                            <small>
                              {language === "en"
                                ? "For a complaint, the licensed lender is responsible for the final outcome. Do not include passwords, card numbers or one-time codes."
                                : language === "zh-CN"
                                  ? "投诉将由相关团队继续处理。请勿填写密码、银行卡完整号码或一次性验证码。"
                                  : "សម្រាប់បណ្តឹង ស្ថាប័នមានអាជ្ញាប័ណ្ណទទួលខុសត្រូវលើលទ្ធផលចុងក្រោយ។ សូមកុំបញ្ចូលពាក្យសម្ងាត់ លេខកាតពេញលេញ ឬលេខកូដម្តងទៀត។"}
                            </small>
                            <label className="field-label">
                              {language === "en"
                                ? "Request type"
                                : language === "zh-CN"
                                  ? "问题类型"
                                  : "ប្រភេទសំណើ"}
                              <select
                                value={serviceCaseType}
                                onChange={(event) =>
                                  setServiceCaseType(
                                    event.target.value as
                                      "SERVICE_QUERY" | "COMPLAINT",
                                  )
                                }
                              >
                                <option value="SERVICE_QUERY">
                                  {language === "en"
                                    ? "Service question"
                                    : language === "zh-CN"
                                      ? "客服咨询"
                                      : "សំណួរសេវាកម្ម"}
                                </option>
                                <option value="COMPLAINT">
                                  {language === "en"
                                    ? "Complaint"
                                    : language === "zh-CN"
                                      ? "投诉"
                                      : "បណ្តឹង"}
                                </option>
                              </select>
                            </label>
                            <label className="field-label">
                              {language === "en"
                                ? "Tell us what happened"
                                : language === "zh-CN"
                                  ? "请说明情况"
                                  : "សូមពិពណ៌នាអំពីបញ្ហា"}
                              <textarea
                                value={serviceCaseMessage}
                                onChange={(event) =>
                                  setServiceCaseMessage(event.target.value)
                                }
                                maxLength={2000}
                                rows={4}
                              />
                            </label>
                            <button
                              className="primary"
                              disabled={
                                loading || serviceCaseMessage.trim().length < 10
                              }
                              onClick={() => void submitServiceCase()}
                            >
                              {language === "en"
                                ? "Submit support case"
                                : language === "zh-CN"
                                  ? "提交客服工单"
                                  : "ដាក់សំណើសេវាកម្ម"}
                            </button>
                            <button
                              className="secondary"
                              disabled={loading || serviceCasesLoading}
                              onClick={() => void loadServiceCases()}
                            >
                              {serviceCasesLoading
                                ? "…"
                                : language === "en"
                                  ? "View my case history"
                                  : language === "zh-CN"
                                    ? "查看我的工单记录"
                                    : "មើលប្រវត្តិសំណើរបស់ខ្ញុំ"}
                            </button>
                            {serviceCaseNotice ? (
                              <p className="response-note">
                                {serviceCaseNotice}
                              </p>
                            ) : null}
                            {serviceCasesLoaded ? (
                              serviceCases.length === 0 ? (
                                <p className="response-note">
                                  {language === "en"
                                    ? "No support cases have been recorded for this application."
                                    : language === "zh-CN"
                                      ? "该申请暂无客服或投诉工单。"
                                      : "មិនទាន់មានសំណើសេវាកម្ម ឬបណ្តឹងសម្រាប់ពាក្យស្នើសុំនេះទេ។"}
                                </p>
                              ) : (
                                <ul className="application-history">
                                  {serviceCases.map((serviceCase) => (
                                    <li key={serviceCase.caseNo}>
                                      <strong>{serviceCase.caseNo}</strong>
                                      <span>
                                        {applicantServiceCaseLabel(
                                          serviceCase,
                                          language,
                                        )}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )
                            ) : null}
                          </section>
                          {summary.timeline?.length ? (
                            <section
                              className="timeline-card"
                              aria-label="Application timeline"
                            >
                              <div className="timeline-card__header">
                                <strong>
                                  {language === "en"
                                    ? "Application timeline"
                                    : language === "zh-CN"
                                      ? "申请时间线"
                                      : "ពេលវេលាពាក្យសុំ"}
                                </strong>
                                <small>
                                  {language === "en"
                                    ? "Status, approval, payment-proof, and reassessment updates shown in recorded order."
                                    : language === "zh-CN"
                                      ? "按记录顺序展示状态、审批、付款凭证与重新评估更新。"
                                      : "បង្ហាញស្ថានភាព ការអនុម័ត បង្កាន់ដៃបង់ប្រាក់ និងការវាយតម្លៃឡើងវិញតាមលំដាប់កំណត់ត្រា។"}
                                </small>
                              </div>
                              <ol className="timeline-list">
                                {summary.timeline.map((entry, index) => (
                                  <li
                                    key={`${entry.entryType}-${entry.occurredAt}-${entry.referenceNo ?? index}`}
                                    className="timeline-item"
                                  >
                                    <span
                                      className="timeline-item__marker"
                                      aria-hidden="true"
                                    />
                                    <div className="timeline-item__content">
                                      <strong>
                                        {applicantTimelineTitle(
                                          entry,
                                          language,
                                        )}
                                      </strong>
                                      <small>
                                        {applicantTimelineDetail(
                                          entry,
                                          language,
                                        )}
                                      </small>
                                    </div>
                                  </li>
                                ))}
                              </ol>
                            </section>
                          ) : null}
                        </section>
                      ) : null}
                    </section>
                  )}
                  {summary ? (
                    <section className="progress-card">
                      <div className="progress-title">
                        <span>{t.review}</span>
                        <small>{t.secured}</small>
                      </div>
                      <div className="progress">
                        {[t.apply, t.broker, t.lender, t.offer].map(
                          (label, index) => (
                            <div
                              className={`progress-step ${index < currentStep ? "done" : index === currentStep ? "active" : ""}`}
                              key={label}
                            >
                              <i>{index < currentStep ? "✓" : index + 1}</i>
                              <span>{label}</span>
                            </div>
                          ),
                        )}
                      </div>
                    </section>
                  ) : null}
                </OrderDetailPage>
              </HomePage>
            );
          case "repayment":
            return (
              <HomePage
                language={language}
                current={currentPage}
                onChange={setCurrentPage}
                showPreviewBadge={showPreviewBadge}
                applicantSession={applicantSession}
                loading={loading}
                onLanguageChange={changeLanguage}
                onLogout={() => void logoutApplicant()}
                borrowEntryLabel={borrowEntryUi.cta}
                borrowEntryHint={borrowEntryUi.description}
                borrowEntryDisabled={borrowEntryUi.disabled}
                onBorrowEntry={openBorrowEntry}
                onOpenNotifications={openNotificationsCenter}
                onOpenRecords={openRecordCenter}
                onOpenReassessment={openReassessmentCenter}
                unreadNotificationCount={unreadNotificationCount}
              >
                <RepaymentPage
                  language={language}
                  empty={!summary || summary.repayment.periodCount === 0}
                  onContactSupport={() => setCurrentPage("profile")}
                >
                  {summary && summary.repayment.periodCount > 0 ? (
                    <>
                      <section
                        className={`bill-status-card bill-status-card--${repaymentProofStatus.toLowerCase().replace(/_/g, "-")}`}
                        aria-label="Active bill"
                      >
                        <strong>
                          {usesControlledWalletRepayment
                            ? language === "en"
                              ? "SMILE wallet authorization required"
                              : language === "zh-CN"
                                ? "需要前往 SMILE 钱包页授权"
                                : "ត្រូវបន្តការអនុញ្ញាតតាម SMILE wallet"
                            : repaymentProofStatus === "UNDER_REVIEW"
                              ? language === "en"
                                ? "Payment proof pending manual verification"
                                : language === "zh-CN"
                                  ? "付款凭证待人工核验"
                                  : "បង្កាន់ដៃរង់ចាំការផ្ទៀងផ្ទាត់ដោយដៃ"
                              : repaymentProofStatus === "NEEDS_MORE"
                                ? language === "en"
                                  ? "Payment proof needs more information"
                                  : language === "zh-CN"
                                    ? "付款凭证需要补充"
                                    : "បង្កាន់ដៃត្រូវការព័ត៌មានបន្ថែម"
                                : repaymentProofStatus === "RECONCILED"
                                  ? language === "en"
                                    ? "Bill reconciled"
                                    : language === "zh-CN"
                                      ? "账单已核销"
                                      : "វិក្កយបត្រត្រូវបានកត់ត្រារួច"
                                  : summary.repayment.overduePeriods > 0
                                    ? language === "en"
                                      ? "Bill overdue"
                                      : language === "zh-CN"
                                        ? "账单已逾期"
                                        : "វិក្កយបត្រហួសកាលកំណត់"
                                    : language === "en"
                                      ? "Active bill"
                                      : language === "zh-CN"
                                        ? "待处理账单"
                                        : "វិក្កយបត្រកំពុងដំណើរការ"}
                        </strong>
                        <span>
                          {summary.repayment.nextInstallment
                            ? `${displayDate(summary.repayment.nextInstallment.dueDate)} · ${formatUsdMinor(summary.repayment.nextInstallment.amountDueMinor)}`
                            : language === "en"
                              ? "No upcoming installment"
                              : language === "zh-CN"
                                ? "暂无下一期"
                                : "មិនមានវគ្គបន្ទាប់"}
                        </span>
                        <small>
                          {usesControlledWalletRepayment
                            ? language === "en"
                              ? "Use PayEase to open the licensed lender's SMILE wallet page, then complete bank authorization there. The bill updates only after the signed callback returns."
                              : language === "zh-CN"
                                ? "请通过 PayEase 打开持牌机构的 SMILE 钱包页，并在其中完成银行授权；账单仅在验签回调返回后更新。"
                                : "សូមប្រើ PayEase ដើម្បីបើកទំព័រ SMILE wallet របស់ស្ថាប័នមានអាជ្ញាប័ណ្ណ ហើយបំពេញការអនុញ្ញាតធនាគារនៅទីនោះ។ វិក្កយបត្រនឹងអាប់ដេតតែនៅពេលការហៅត្រឡប់ដែលបានផ្ទៀងផ្ទាត់ត្រឡប់មកវិញ។"
                            : repaymentProofStatus === "UNDER_REVIEW"
                              ? language === "en"
                                ? "Payment proof submitted. This does not mean the bill is settled."
                                : language === "zh-CN"
                                  ? "付款凭证已提交，不代表已完成结清。"
                                  : "បង្កាន់ដៃបានដាក់ស្នើ ប៉ុន្តែមិនមានន័យថាបានបិទបញ្ចប់រួចទេ។"
                              : language === "en"
                                ? "Check the repayment steps and upload proof after you complete the offline transfer."
                                : language === "zh-CN"
                                  ? "请先查看收款说明，完成线下付款后再上传凭证。"
                                  : "សូមមើលការណែនាំសងប្រាក់សិន ហើយបន្ទាប់ពីផ្ទេរប្រាក់ក្រៅប្រព័ន្ធ សូមបញ្ចូនបង្កាន់ដៃ។"}
                        </small>
                      </section>
                      <section
                        className="repayment-steps"
                        aria-label="Repayment steps"
                      >
                        {[
                          language === "en"
                            ? "1. Review the current bill and next installment"
                            : language === "zh-CN"
                              ? "1. 查看当前账单与下一期"
                              : "1. មើលវិក្កយបត្របច្ចុប្បន្ន និងវគ្គបន្ទាប់",
                          language === "en"
                            ? "2. Open the SMILE wallet page from PayEase"
                            : language === "zh-CN"
                              ? "2. 从 PayEase 打开 SMILE 钱包页"
                              : "2. បើកទំព័រ SMILE wallet ពី PayEase",
                          language === "en"
                            ? "3. Complete bank authorization inside SMILE"
                            : language === "zh-CN"
                              ? "3. 在 SMILE 内完成银行授权"
                              : "3. បំពេញការអនុញ្ញាតធនាគារនៅក្នុង SMILE",
                          language === "en"
                            ? "4. Wait for the licensed lender's signed callback"
                            : language === "zh-CN"
                              ? "4. 等待持牌机构验签回调"
                              : "4. រង់ចាំការហៅត្រឡប់ដែលបានផ្ទៀងផ្ទាត់របស់ស្ថាប័នមានអាជ្ញាប័ណ្ណ",
                        ].map((step) => (
                          <div key={step} className="repayment-step-item">
                            {step}
                          </div>
                        ))}
                      </section>
                      <div className="repayment-summary">
                        <div>
                          <span>
                            {language === "en"
                              ? "Paid periods"
                              : language === "km"
                                ? "បង់រួច"
                                : "已还期数"}
                          </span>
                          <b>
                            {summary.repayment.paidPeriods} /{" "}
                            {summary.repayment.periodCount}
                          </b>
                        </div>
                        <div>
                          <span>
                            {language === "en"
                              ? "Unpaid periods"
                              : language === "km"
                                ? "មិនទាន់បង់"
                                : "未还期数"}
                          </span>
                          <b>{summary.repayment.unpaidPeriods}</b>
                        </div>
                        <div>
                          <span>
                            {language === "en"
                              ? "Outstanding"
                              : language === "km"
                                ? "នៅសល់ត្រូវសង"
                                : "待还金额"}
                          </span>
                          <b>
                            {formatUsdMinor(summary.repayment.outstandingMinor)}
                          </b>
                        </div>
                        <div>
                          <span>
                            {language === "en"
                              ? "Total paid"
                              : language === "km"
                                ? "សរុបបានបង់"
                                : "已还金额"}
                          </span>
                          <b>
                            {formatUsdMinor(summary.repayment.totalPaidMinor)}
                          </b>
                        </div>
                        <div>
                          <span>
                            {language === "en"
                              ? "Past due"
                              : language === "km"
                                ? "ហួសកាលកំណត់"
                                : "逾期期数 / 金额"}
                          </span>
                          <b>
                            {summary.repayment.overduePeriods} ·{" "}
                            {formatUsdMinor(
                              summary.repayment.overdueOutstandingMinor,
                            )}
                          </b>
                        </div>
                      </div>
                      {summary.repayment.nextInstallment ? (
                        <div className="next-payment">
                          <span>
                            {language === "en"
                              ? "Next payment"
                              : language === "km"
                                ? "ការបង់បន្ទាប់"
                                : "下一期还款"}
                          </span>
                          <strong>
                            {formatUsdMinor(
                              summary.repayment.nextInstallment.amountDueMinor,
                            )}
                          </strong>
                          <small>
                            #{summary.repayment.nextInstallment.installmentNo} ·{" "}
                            {displayDate(
                              summary.repayment.nextInstallment.dueDate,
                            )}
                          </small>
                        </div>
                      ) : (
                        <div className="next-payment settled">
                          <span>
                            {language === "en"
                              ? "All installments are recorded as paid"
                              : language === "km"
                                ? "បានកត់ត្រាការបង់គ្រប់កំណត់"
                                : "全部期次已记录为已还"}
                          </span>
                        </div>
                      )}
                      <section
                        className="next-payment"
                        aria-label="SMILE wallet authorization"
                      >
                        <strong>
                          {language === "en"
                            ? "Continue in SMILE wallet"
                            : language === "km"
                              ? "បន្តនៅក្នុង SMILE wallet"
                              : "前往 SMILE 钱包页"}
                        </strong>
                        <small>
                          {language === "en"
                            ? "PayEase will only create a one-time jump. Your repayment amount, bank authorization, and payment password are handled inside the licensed lender's SMILE wallet page."
                            : language === "km"
                              ? "PayEase បង្កើតតែការលោតម្តងតែមួយប៉ុណ្ណោះ។ ចំនួនទឹកប្រាក់សង ការអនុញ្ញាតធនាគារ និងពាក្យសម្ងាត់ទូទាត់របស់អ្នក នឹងត្រូវដំណើរការនៅក្នុងទំព័រ SMILE wallet របស់ស្ថាប័នមានអាជ្ញាប័ណ្ណ។"
                              : "PayEase 只负责创建一次性跳转；还款金额、银行授权和支付密码都只在持牌机构的 SMILE 钱包页内处理。"}
                        </small>
                        {summary.repayment.unpaidPeriods > 0 ? (
                          <button
                            type="button"
                            className="primary"
                            disabled={loading}
                            onClick={() =>
                              void startWalletOperationJump("REPAYMENT")
                            }
                          >
                            {language === "en"
                              ? "Open SMILE wallet"
                              : language === "km"
                                ? "បើក SMILE wallet"
                                : "打开 SMILE 钱包页"}
                          </button>
                        ) : null}
                        {walletOperationNotice ? (
                          <p className="response-note">
                            {walletOperationNotice}
                          </p>
                        ) : null}
                      </section>
                      {showLegacyRepaymentProofFlow ? (
                        <section
                          className="proof-uploader"
                          aria-label="Payment proof upload"
                        >
                          <strong>
                            {language === "en"
                              ? "Legacy payment proof"
                              : language === "zh-CN"
                                ? "历史付款凭证"
                                : "បង្កាន់ដៃបង់ប្រាក់ចាស់"}
                          </strong>
                          <small>
                            {language === "en"
                              ? "Only use this compatibility upload for historical cases that are still waiting for manual reconciliation."
                              : language === "zh-CN"
                                ? "该上传入口仅用于仍在人工核销中的历史订单兼容处理。"
                                : "ប្រើការបញ្ចូលនេះសម្រាប់តែសំណុំរឿងចាស់ដែលនៅរង់ចាំការកត់ត្រាដោយដៃប៉ុណ្ណោះ។"}
                          </small>
                          <>
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp,application/pdf"
                              onChange={(event) =>
                                setRepaymentProofFile(
                                  event.currentTarget.files?.[0] ?? null,
                                )
                              }
                            />
                            <button
                              type="button"
                              className="primary"
                              onClick={() => void uploadPaymentProof()}
                              disabled={!repaymentProofFile || loading}
                            >
                              {repaymentProofStatus === "NEEDS_MORE"
                                ? language === "en"
                                  ? "Re-upload payment proof"
                                  : language === "zh-CN"
                                    ? "重新上传付款凭证"
                                    : "បញ្ចូលបង្កាន់ដៃម្តងទៀត"
                                : language === "en"
                                  ? "Upload payment proof"
                                  : language === "zh-CN"
                                    ? "上传付款凭证"
                                    : "បញ្ចូលបង្កាន់ដៃ"}
                            </button>
                          </>
                        </section>
                      ) : null}
                      {repaymentProofReference ? (
                        <section
                          className="proof-uploader"
                          aria-label="Legacy proof status"
                        >
                          <p className="response-note">
                            {language === "en"
                              ? `Submitted reference: ${repaymentProofReference}. Payment proof submitted. This does not mean the bill is settled.`
                              : language === "zh-CN"
                                ? `已提交参考编号：${repaymentProofReference}。付款凭证已提交，不代表已完成结清。`
                                : `លេខយោងដែលបានដាក់ស្នើ៖ ${repaymentProofReference}។ បង្កាន់ដៃបានដាក់ស្នើ ប៉ុន្តែមិនមានន័យថាបានបិទបញ្ចប់រួចទេ។`}
                          </p>
                          {repaymentProof?.fileName ? (
                            <p className="response-note">
                              {language === "en"
                                ? `Latest file: ${repaymentProof.fileName} · ${displayDate(repaymentProof.submittedAt)}`
                                : language === "zh-CN"
                                  ? `最近上传：${repaymentProof.fileName} · ${displayDate(repaymentProof.submittedAt)}`
                                  : `ឯកសារចុងក្រោយ៖ ${repaymentProof.fileName} · ${displayDate(repaymentProof.submittedAt)}`}
                            </p>
                          ) : null}
                        </section>
                      ) : null}
                      <div className="installments">
                        {summary.repayment.installments.map((item) => (
                          <div key={item.installmentNo}>
                            <span>
                              #{item.installmentNo} ·{" "}
                              {displayDate(item.dueDate)}
                            </span>
                            <b>{formatUsdMinor(item.amountDueMinor)}</b>
                            <em
                              className={
                                item.status === "PAID" ? "paid" : "pending"
                              }
                            >
                              {item.status === "PAID"
                                ? language === "en"
                                  ? "Paid"
                                  : language === "km"
                                    ? "បានបង់"
                                    : "已还"
                                : language === "en"
                                  ? "Pending"
                                  : language === "km"
                                    ? "មិនទាន់បង់"
                                    : "待还"}
                            </em>
                          </div>
                        ))}
                      </div>
                      <div className="term-choices">
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => setCurrentPage("profile")}
                          aria-label={
                            USER_SKELETON_COPY[language].repayment.support
                          }
                        >
                          {USER_SKELETON_COPY[language].repayment.support}
                        </button>
                      </div>
                    </>
                  ) : summary && summary.repayment.periodCount === 0 ? (
                    <p className="response-note">
                      {USER_SKELETON_COPY[language].repayment.empty}
                    </p>
                  ) : undefined}
                </RepaymentPage>
              </HomePage>
            );
          case "notifications":
            return (
              <HomePage
                language={language}
                current={currentPage}
                onChange={setCurrentPage}
                showPreviewBadge={showPreviewBadge}
                applicantSession={applicantSession}
                loading={loading}
                onLanguageChange={changeLanguage}
                onLogout={() => void logoutApplicant()}
                borrowEntryLabel={borrowEntryUi.cta}
                borrowEntryHint={borrowEntryUi.description}
                borrowEntryDisabled={borrowEntryUi.disabled}
                onBorrowEntry={openBorrowEntry}
                onOpenNotifications={openNotificationsCenter}
                onOpenRecords={openRecordCenter}
                onOpenReassessment={openReassessmentCenter}
                unreadNotificationCount={unreadNotificationCount}
              >
                <NotificationsWorkspace
                  language={language}
                  mode="list"
                  notifications={notifications}
                  paginatedNotifications={paginatedNotifications}
                  notificationItemCount={notificationItemCount}
                  unreadNotificationCount={unreadNotificationCount}
                  notificationPage={notificationPage}
                  notificationPageCount={notificationPageCount}
                  selectedNotification={selectedNotification}
                  onBack={() => setCurrentPage("home")}
                  onOpenNotification={(notificationId) =>
                    void openNotificationDetail(notificationId)
                  }
                  onMarkAllRead={() => void markAllNotificationsRead()}
                  onNextPage={nextNotificationPage}
                  onPreviousPage={previousNotificationPage}
                  notificationLinkTarget={(notification) =>
                    notificationDeepLink(notification, language)
                  }
                  onOpenLinkedTarget={(notification) =>
                    void openNotificationLinkedTarget(notification)
                  }
                />
              </HomePage>
            );
          case "notification-detail":
            return (
              <HomePage
                language={language}
                current={currentPage}
                onChange={setCurrentPage}
                showPreviewBadge={showPreviewBadge}
                applicantSession={applicantSession}
                loading={loading}
                onLanguageChange={changeLanguage}
                onLogout={() => void logoutApplicant()}
                borrowEntryLabel={borrowEntryUi.cta}
                borrowEntryHint={borrowEntryUi.description}
                borrowEntryDisabled={borrowEntryUi.disabled}
                onBorrowEntry={openBorrowEntry}
                onOpenNotifications={openNotificationsCenter}
                onOpenRecords={openRecordCenter}
                onOpenReassessment={openReassessmentCenter}
                unreadNotificationCount={unreadNotificationCount}
              >
                <NotificationsWorkspace
                  language={language}
                  mode="detail"
                  notifications={notifications}
                  paginatedNotifications={paginatedNotifications}
                  notificationItemCount={notificationItemCount}
                  unreadNotificationCount={unreadNotificationCount}
                  notificationPage={notificationPage}
                  notificationPageCount={notificationPageCount}
                  selectedNotification={selectedNotification}
                  onBack={() => setCurrentPage("notifications")}
                  onOpenNotification={(notificationId) =>
                    void openNotificationDetail(notificationId)
                  }
                  onMarkAllRead={() => void markAllNotificationsRead()}
                  onNextPage={nextNotificationPage}
                  onPreviousPage={previousNotificationPage}
                  notificationLinkTarget={(notification) =>
                    notificationDeepLink(notification, language)
                  }
                  onOpenLinkedTarget={(notification) =>
                    void openNotificationLinkedTarget(notification)
                  }
                />
              </HomePage>
            );
          case "profile": {
            const currentFactory =
              verifiedProfile?.employerDisplayName ??
              summary?.application.employerTenantDisplayName ??
              applicationHistory[0]?.employerTenantDisplayName ??
              null;
            const phoneLabel =
              verifiedProfile?.phoneVerificationStatus === "VERIFIED" ||
              phoneVerification?.verified
                ? phoneCopy.verified
                : verifiedProfile?.phoneVerificationStatus === "PENDING" ||
                    phoneVerification?.required
                  ? phoneCopy.required
                  : phoneCopy.check;
            const telegramLabel =
              verifiedProfile?.telegramVerified || applicantSession
                ? language === "en"
                  ? "Verified through Telegram"
                  : language === "zh-CN"
                    ? "已通过 Telegram 验证"
                    : "បានផ្ទៀងផ្ទាត់តាម Telegram"
                : language === "en"
                  ? "Open PayEase from Telegram to restore this profile"
                  : language === "zh-CN"
                    ? "请从 Telegram 打开 PayEase 以恢复当前账户"
                    : "សូមបើក PayEase ពី Telegram ដើម្បីស្ដារគណនីនេះឡើងវិញ";
            const languageLabel =
              language === "en"
                ? "English"
                : language === "zh-CN"
                  ? "中文"
                  : "ភាសាខ្មែរ";
            const displayName =
              verifiedProfile?.displayName ??
              (language === "en"
                ? "Telegram user"
                : language === "zh-CN"
                  ? "Telegram 用户"
                  : "អ្នកប្រើ Telegram");
            const usernameLine = verifiedProfile?.username
              ? `@${verifiedProfile.username}`
              : null;
            const trustedPhotoUrl = trustedTelegramPhotoUrl(
              profilePhotoFailed ? null : verifiedProfile?.photoUrl,
            );
            const applicationSummary = verifiedProfile?.activeApplication
              ? language === "en"
                ? `${verifiedProfile.activeApplication.status} · ${verifiedProfile.activeApplication.referenceMasked ?? "—"}`
                : language === "zh-CN"
                  ? `${verifiedProfile.activeApplication.status} · ${verifiedProfile.activeApplication.referenceMasked ?? "—"}`
                  : `${verifiedProfile.activeApplication.status} · ${verifiedProfile.activeApplication.referenceMasked ?? "—"}`
              : language === "en"
                ? "No active application"
                : language === "zh-CN"
                  ? "暂无进行中的申请"
                  : "មិនមានពាក្យសុំកំពុងដំណើរការ";
            const billSummary = verifiedProfile?.activeBill
              ? language === "en"
                ? `${verifiedProfile.activeBill.status} · ${verifiedProfile.activeBill.referenceMasked ?? "—"}`
                : language === "zh-CN"
                  ? `${verifiedProfile.activeBill.status} · ${verifiedProfile.activeBill.referenceMasked ?? "—"}`
                  : `${verifiedProfile.activeBill.status} · ${verifiedProfile.activeBill.referenceMasked ?? "—"}`
              : language === "en"
                ? "No active bill"
                : language === "zh-CN"
                  ? "暂无待处理账单"
                  : "មិនមានវិក្កយបត្រកំពុងដំណើរការ";
            const kycLocationLabel =
              language === "en"
                ? "Location check"
                : language === "zh-CN"
                  ? "定位核验"
                  : "ការផ្ទៀងផ្ទាត់ទីតាំង";
            const kycLocationSummary = kycLocation
              ? `${kycLocationStatusSummary(kycLocation)} · ${displayDate(kycLocation.submittedAt)}`
              : kycCopy.idle;
            return (
              <HomePage
                language={language}
                current={currentPage}
                onChange={setCurrentPage}
                showPreviewBadge={showPreviewBadge}
                applicantSession={applicantSession}
                loading={loading}
                onLanguageChange={changeLanguage}
                onLogout={() => void logoutApplicant()}
                borrowEntryLabel={borrowEntryUi.cta}
                borrowEntryHint={borrowEntryUi.description}
                borrowEntryDisabled={borrowEntryUi.disabled}
                onBorrowEntry={openBorrowEntry}
                onOpenNotifications={openNotificationsCenter}
                onOpenRecords={openRecordCenter}
                onOpenReassessment={openReassessmentCenter}
                unreadNotificationCount={unreadNotificationCount}
              >
                <ProfileWorkspace
                  language={language}
                  trustedPhotoUrl={trustedPhotoUrl ?? null}
                  onProfilePhotoError={() => setProfilePhotoFailed(true)}
                  telegramLabel={telegramLabel}
                  displayName={displayName}
                  usernameLine={usernameLine}
                  phoneLabel={phoneLabel}
                  currentFactory={currentFactory}
                  applicationSummary={applicationSummary}
                  billSummary={billSummary}
                  kycLocationLabel={kycLocationLabel}
                  kycLocationSummary={kycLocationSummary}
                  languageLabel={languageLabel}
                  serviceCaseType={serviceCaseType}
                  onServiceCaseTypeChange={setServiceCaseType}
                  serviceCaseMessage={serviceCaseMessage}
                  onServiceCaseMessageChange={setServiceCaseMessage}
                  loading={loading}
                  serviceCasesLoading={serviceCasesLoading}
                  onSubmitServiceCase={() => void submitServiceCase()}
                  onLoadServiceCases={() => void loadServiceCases()}
                  serviceCaseNotice={serviceCaseNotice}
                  serviceCasesLoaded={serviceCasesLoaded}
                  serviceCases={serviceCases}
                  serviceCaseLabel={(serviceCase) =>
                    applicantServiceCaseLabel(serviceCase, language)
                  }
                />
              </HomePage>
            );
          }
          case "help-guide":
            return (
              <HomePage
                language={language}
                current={currentPage}
                onChange={setCurrentPage}
                showPreviewBadge={showPreviewBadge}
                applicantSession={applicantSession}
                loading={loading}
                onLanguageChange={changeLanguage}
                onLogout={() => void logoutApplicant()}
                borrowEntryLabel={borrowEntryUi.cta}
                borrowEntryHint={borrowEntryUi.description}
                borrowEntryDisabled={borrowEntryUi.disabled}
                onBorrowEntry={openBorrowEntry}
                onOpenNotifications={openNotificationsCenter}
                onOpenRecords={openRecordCenter}
                onOpenReassessment={openReassessmentCenter}
                unreadNotificationCount={unreadNotificationCount}
              >
                <HelpDetailPage
                  language={language}
                  topic="guide"
                  onBack={() => setCurrentPage("home")}
                />
              </HomePage>
            );
          case "help-safety":
            return (
              <HomePage
                language={language}
                current={currentPage}
                onChange={setCurrentPage}
                showPreviewBadge={showPreviewBadge}
                applicantSession={applicantSession}
                loading={loading}
                onLanguageChange={changeLanguage}
                onLogout={() => void logoutApplicant()}
                borrowEntryLabel={borrowEntryUi.cta}
                borrowEntryHint={borrowEntryUi.description}
                borrowEntryDisabled={borrowEntryUi.disabled}
                onBorrowEntry={openBorrowEntry}
                onOpenNotifications={openNotificationsCenter}
                onOpenRecords={openRecordCenter}
                onOpenReassessment={openReassessmentCenter}
                unreadNotificationCount={unreadNotificationCount}
              >
                <HelpDetailPage
                  language={language}
                  topic="safety"
                  onBack={() => setCurrentPage("home")}
                />
              </HomePage>
            );
          case "home":
          default:
            return (
              <HomePage
                language={language}
                current={currentPage}
                onChange={setCurrentPage}
                showPreviewBadge={showPreviewBadge}
                applicantSession={applicantSession}
                loading={loading}
                requiresInitialLanguageSelection={
                  requiresInitialLanguageSelection
                }
                onLanguageChange={changeLanguage}
                onLogout={() => void logoutApplicant()}
                borrowEntryLabel={borrowEntryUi.cta}
                borrowEntryHint={borrowEntryUi.description}
                borrowEntryDisabled={borrowEntryUi.disabled}
                onBorrowEntry={openBorrowEntry}
                onOpenNotifications={openNotificationsCenter}
                onOpenRecords={openRecordCenter}
                onOpenReassessment={openReassessmentCenter}
                unreadNotificationCount={unreadNotificationCount}
              />
            );
        }
      })()}
    </main>
  );
}

export default App;
