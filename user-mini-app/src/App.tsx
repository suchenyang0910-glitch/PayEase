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
  canWithdrawApplicantApplication,
} from "./application-result.ts";
import { applicantSessionRecoveryMessage } from "./applicant-session-message.ts";
import { shouldKeepApplicantSessionAlive } from "./applicant-session-keepalive.ts";
import { formatUsdMinor } from "./format-usd-minor.ts";
import "./app.css";

type Stage = "welcome" | "details" | "submitted" | "offer";

type UserSummary = {
  application: {
    applicationNo: string;
    status: string;
    requestedAmountMinor: string;
    currency: string;
    tenorDays: number;
    approvedAmountMinor: string | null;
    rejectionConditionResolved: boolean;
    rejectionNoticeCode:
      | "INFORMATION_INCOMPLETE"
      | "EMPLOYMENT_OR_INCOME_UNVERIFIED"
      | "PRODUCT_ELIGIBILITY_NOT_MET"
      | "LENDER_DECISION"
      | null;
    supplementRequested: boolean;
  };
  terms: null | {
    approvedAmountMinor: string;
    serviceFeeMinor: string;
    totalRepayableMinor: string;
    installmentCount: number;
    firstDueDate: string;
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
};

type ApplicationList = {
  preferredLanguage?: LanguageCode;
  applications: ApplicationListEntry[];
};

type ApplicationListEntry = ApplicationHistoryEntry;

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
        "当前未满足产品申请条件；请联系持牌机构了解可申请的产品。",
      LENDER_DECISION: "本次申请未获批准；如需协助，请联系持牌机构客服。",
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

function applicantPhaseLabel(
  phase: ApplicantPhase,
  language: LanguageCode,
): string {
  const labelsByLanguage: Record<
    LanguageCode,
    Record<ApplicantPhase, string>
  > = {
    "zh-CN": {
      "broker-review": "助贷资料审核中",
      "employer-verification": "企业在职与薪资核验中",
      "lender-review": "持牌机构审核中",
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

const labels: Record<LanguageCode, Record<string, string>> = {
  "zh-CN": {
    brand: "薪易贷",
    telegram: "Telegram 已连接",
    welcome: "工资到账前，资金周转更从容",
    intro: "面向合作企业员工的薪资周转服务。授信、合同与放款均由持牌机构负责。",
    amount: "申请金额",
    term: "借款期限",
    start: "开始申请",
    details: "填写个人资料",
    name: "姓名",
    phone: "手机号码",
    employer: "所在企业",
    consent: "我已阅读并同意个人信息授权与隐私说明",
    send: "提交至助贷审核",
    submitted: "申请已提交",
    submittedNote: "助贷团队将核验资料并转交持牌机构审核。",
    review: "审核进度",
    apply: "提交申请",
    broker: "助贷资料审核",
    lender: "持牌机构审核",
    offer: "额度结果",
    back: "返回修改",
    check: "查看申请状态",
    reviewing: "审核中",
    noOffer: "持牌机构将独立决定额度和费用。",
    demo: "受控预览环境",
    secured: "信息仅用于本次申请处理",
    usd: "USD",
    expected: "预计处理：工作时段 0–1.5 小时响应",
    status: "申请编号",
    installments: "还款期数",
    firstDueDate: "首期还款日",
    telegramLogin: "使用 Telegram 继续",
    formIntro:
      "请填写真实且完整的资料。提交后，助贷团队仅在你的授权范围内处理申请。",
  },
  en: {
    brand: "PayEase",
    telegram: "Telegram connected",
    welcome: "More flexibility before payday",
    intro:
      "Salary liquidity support for employees of partner companies. The licensed lender controls credit, contracts and disbursement.",
    amount: "Requested amount",
    term: "Loan term",
    start: "Start application",
    details: "Your details",
    name: "Full name",
    phone: "Mobile number",
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
    secured: "Used only for this application",
    usd: "USD",
    expected: "Expected response during business hours: 0–1.5 hours",
    status: "Application number",
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
    term: "រយៈពេល",
    start: "ចាប់ផ្តើមដាក់ពាក្យ",
    details: "ព័ត៌មានរបស់អ្នក",
    name: "ឈ្មោះពេញ",
    phone: "លេខទូរស័ព្ទ",
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
    secured: "ប្រើសម្រាប់ពាក្យនេះតែប៉ុណ្ណោះ",
    usd: "USD",
    expected: "ពេលឆ្លើយតបក្នុងម៉ោងធ្វើការ៖ 0–1.5 ម៉ោង",
    status: "លេខពាក្យ",
    installments: "ចំនួនវគ្គសង",
    firstDueDate: "កាលបរិច្ឆេទសងលើកដំបូង",
    telegramLogin: "បន្តជាមួយ Telegram",
    formIntro:
      "សូមបំពេញព័ត៌មានឱ្យពេញលេញ និងត្រឹមត្រូវ។ ក្រុមការងារប្រើព័ត៌មានតាមការអនុញ្ញាតរបស់អ្នកប៉ុណ្ណោះ។",
  },
};

const amountOptions = [10, 50, 100, 200, 500];
const terms = [7, 30, 90, 180];

function telegramUserRef(): string {
  const telegram = (
    window as Window & {
      Telegram?: { WebApp?: { initDataUnsafe?: { user?: { id?: number } } } };
    }
  ).Telegram;
  const id = telegram?.WebApp?.initDataUnsafe?.user?.id;
  return id ? `telegram-${id}` : `preview-${crypto.randomUUID()}`;
}

function telegramInitData(): string | undefined {
  const telegram = (
    window as Window & {
      Telegram?: { WebApp?: { initData?: string } };
    }
  ).Telegram;
  return telegram?.WebApp?.initData || undefined;
}

export function App(): JSX.Element {
  const [language, setLanguage] = useState<LanguageCode>("km");
  const languageChangedByApplicant = useRef(false);
  const lastApplicantKeepaliveAt = useRef(0);
  const [stage, setStage] = useState<Stage>("welcome");
  const [amount, setAmount] = useState(50);
  const [term, setTerm] = useState(30);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [employer, setEmployer] = useState("");
  const [consent, setConsent] = useState(false);
  const [applicationNo, setApplicationNo] = useState("");
  const [approvedAmountMinor, setApprovedAmountMinor] = useState<string>();
  const [summary, setSummary] = useState<UserSummary>();
  const [applicationHistory, setApplicationHistory] = useState<
    ApplicationListEntry[]
  >([]);
  const [applicantSession, setApplicantSession] = useState(false);
  const [withdrawalConfirmationRequested, setWithdrawalConfirmationRequested] =
    useState(false);
  const [serviceCaseType, setServiceCaseType] = useState<
    "SERVICE_QUERY" | "COMPLAINT"
  >("SERVICE_QUERY");
  const [serviceCaseMessage, setServiceCaseMessage] = useState("");
  const [serviceCaseNotice, setServiceCaseNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const t = labels[language];
  const result = applicantResult(summary?.application);
  const visiblePhase = summary
    ? applicantPhase(summary.application.status)
    : undefined;

  function applicantRequest(input: RequestInfo | URL, init?: RequestInit) {
    const existingHeaders = init?.headers as Record<string, string> | undefined;
    let headers = existingHeaders;
    if (
      ["POST", "PUT", "PATCH", "DELETE"].includes(
        (init?.method ?? "GET").toUpperCase(),
      )
    ) {
      const token = document.cookie
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith("__Host-payease_applicant_csrf="))
        ?.slice("__Host-payease_applicant_csrf=".length);
      if (token) headers = { ...existingHeaders, "X-CSRF-Token": token };
    }
    return fetch(input, {
      ...init,
      credentials: "include",
      ...(headers ? { headers } : {}),
    });
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
    const initData = telegramInitData();
    if (!initData) return;
    void (async () => {
      const authentication = await applicantRequest(
        "/api/v1/local/public/telegram-sessions",
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ initData }),
        },
      );
      // A repeat initData may return 409 after a prior request already created
      // the HttpOnly session. In either case, a valid session can restore the
      // applicant's latest record without relying on the original Bot.
      if (![201, 409].includes(authentication.status)) {
        setError(applicantSessionRecoveryMessage(language));
        return;
      }
      const applications = await applicantRequest(
        "/api/v1/local/public/applications",
      );
      if (!applications.ok) {
        setError(applicantSessionRecoveryMessage(language));
        return;
      }
      const payload = (await applications.json()) as ApplicationList;
      setApplicantSession(true);
      if (payload.preferredLanguage && !languageChangedByApplicant.current) {
        setLanguage(payload.preferredLanguage);
      }
      setApplicationHistory(payload.applications);
      const requestedApplicationNo = new URLSearchParams(
        window.location.search,
      ).get("application");
      // Restore the record the applicant explicitly opened when it is still
      // available; otherwise surface the newest record.  A returning Telegram
      // user should see their current decision, balance and next payment
      // directly instead of needing a second "view status" tap.
      const restored =
        payload.applications.find(
          (item) => item.applicationNo === requestedApplicationNo,
        ) ?? payload.applications[0];
      if (!restored) return;
      await checkStatus(restored.applicationNo);
    })().catch(() => setError(applicantSessionRecoveryMessage(language)));
  }, []);

  useEffect(() => {
    if (!applicantSession || !languageChangedByApplicant.current) return;
    void applicantRequest("/api/v1/local/public/profile/preferred-language", {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ preferredLanguage: language }),
    }).catch(() => {
      // Keep the selected language for this view. A later authenticated session
      // will retry the preference update without storing a credential client-side.
    });
  }, [applicantSession, language]);

  useEffect(() => {
    if (!applicantSession) {
      lastApplicantKeepaliveAt.current = 0;
      return;
    }
    if (!lastApplicantKeepaliveAt.current)
      lastApplicantKeepaliveAt.current = Date.now();
    const recordApplicantActivity = () => {
      const now = Date.now();
      if (
        !shouldKeepApplicantSessionAlive(lastApplicantKeepaliveAt.current, now)
      )
        return;
      lastApplicantKeepaliveAt.current = now;
      void applicantRequest(
        "/api/v1/local/public/telegram-sessions/keepalive",
        {
          method: "POST",
          credentials: "include",
        },
      )
        .then((response) => {
          if (!response.ok) {
            setApplicantSession(false);
            setError(applicantSessionRecoveryMessage(language));
          }
        })
        .catch(() => {
          setApplicantSession(false);
          setError(applicantSessionRecoveryMessage(language));
        });
    };
    window.addEventListener("pointerdown", recordApplicantActivity, {
      passive: true,
    });
    window.addEventListener("keydown", recordApplicantActivity);
    window.addEventListener("touchstart", recordApplicantActivity, {
      passive: true,
    });
    return () => {
      window.removeEventListener("pointerdown", recordApplicantActivity);
      window.removeEventListener("keydown", recordApplicantActivity);
      window.removeEventListener("touchstart", recordApplicantActivity);
    };
  }, [applicantSession, language]);

  async function submit() {
    if (!name.trim() || !phone.trim() || !employer.trim() || !consent) {
      setError(
        language === "en"
          ? "Complete your details and consent first."
          : language === "km"
            ? "សូមបំពេញព័ត៌មាន និងយល់ព្រមជាមុន។"
            : "请先完整填写资料并确认授权。",
      );
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
            amountMinor: String(amount * 100),
            currency: "USD",
          },
          tenorDays: term,
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
      if (!response.ok || !payload.applicationNo)
        throw new Error(payload.code ?? "SUBMISSION_FAILED");
      setApplicationNo(payload.applicationNo);
      setApplicationHistory((current) =>
        prependApplicationHistory(current, {
          applicationNo: payload.applicationNo!,
          status: "BROKER_REVIEW",
          requestedAmountMinor: String(amount * 100),
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
      setStage("submitted");
    } catch {
      setError(
        language === "en"
          ? "We could not submit this application. Please try again."
          : language === "km"
            ? "មិនអាចដាក់ពាក្យបានទេ។ សូមព្យាយាមម្ដងទៀត។"
            : "申请暂时未能提交，请稍后重试。",
      );
    } finally {
      setLoading(false);
    }
  }

  async function checkStatus(targetApplicationNo = applicationNo) {
    if (!targetApplicationNo) return;
    setLoading(true);
    setError("");
    try {
      const response = await applicantRequest(
        `/api/v1/local/public/applications/${encodeURIComponent(targetApplicationNo)}`,
        { credentials: "include" },
      );
      if (response.status === 401 || response.status === 403) {
        setError(applicantSessionRecoveryMessage(language));
        return;
      }
      const payload = (await response.json()) as UserSummary;
      if (!response.ok) throw new Error("STATUS_FAILED");
      setApprovedAmountMinor(
        payload.application.approvedAmountMinor ?? undefined,
      );
      setApplicationNo(targetApplicationNo);
      setSummary(payload);
      setWithdrawalConfirmationRequested(false);
      setStage("offer");
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
        setError(applicantSessionRecoveryMessage(language));
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
            : "暂时无法撤回该申请；如已进入合同处理，请联系持牌机构。",
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
        setError(applicantSessionRecoveryMessage(language));
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
            ? `已收到你的工单 ${payload.caseNo}。如需最终处理，助贷团队将协调持牌机构。`
            : `យើងបានទទួលសំណើ ${payload.caseNo} របស់អ្នក។ ក្រុមសេវាកម្មនឹងសម្របសម្រួលជាមួយស្ថាប័នមានអាជ្ញាប័ណ្ណនៅពេលចាំបាច់។`,
      );
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

  function changeLanguage(nextLanguage: LanguageCode) {
    languageChangedByApplicant.current = true;
    setLanguage(nextLanguage);
  }

  function startNewApplication() {
    setSummary(undefined);
    setApprovedAmountMinor(undefined);
    setApplicationNo("");
    setWithdrawalConfirmationRequested(false);
    setError("");
    window.history.replaceState(null, "", window.location.pathname);
    setStage("welcome");
  }

  async function logoutApplicant() {
    setLoading(true);
    try {
      const response = await applicantRequest(
        "/api/v1/local/public/telegram-sessions/logout",
        { method: "POST", credentials: "include" },
      );
      if (!response.ok) throw new Error("LOGOUT_FAILED");
      setApplicantSession(false);
      setApplicationHistory([]);
      setSummary(undefined);
      setApprovedAmountMinor(undefined);
      setApplicationNo("");
      window.history.replaceState(null, "", window.location.pathname);
      setStage("welcome");
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
  return (
    <main className="shell" lang={language}>
      <header className="topbar">
        <div className="brand-mark">
          <span className="brand-icon">P</span>
          <strong>{t.brand}</strong>
        </div>
        <div className="top-actions">
          <span className="preview-pill">{t.demo}</span>
          {applicantSession ? (
            <button
              className="logout-button"
              disabled={loading}
              onClick={() => void logoutApplicant()}
            >
              {language === "en"
                ? "Sign out"
                : language === "zh-CN"
                  ? "退出"
                  : "ចាកចេញ"}
            </button>
          ) : null}
          <select
            aria-label="Language"
            value={language}
            onChange={(event) =>
              changeLanguage(event.target.value as LanguageCode)
            }
          >
            <option value="km">ខ្មែរ</option>
            <option value="en">EN</option>
            <option value="zh-CN">中文</option>
          </select>
        </div>
      </header>
      <section className="hero">
        <div className="telegram-chip">
          <span>✦</span>
          {t.telegram}
        </div>
        <h1>{t.welcome}</h1>
        <p>{t.intro}</p>
      </section>

      {(stage === "welcome" || stage === "details") && (
        <section className="application-card">
          {stage === "welcome" ? (
            <>
              <div className="card-heading">
                <span>{t.amount}</span>
                <b>{t.usd}</b>
              </div>
              <div className="amount-display">
                <small>$</small>
                {amount}
                <em>.00</em>
              </div>
              <div className="choices">
                {amountOptions.map((value) => (
                  <button
                    key={value}
                    className={amount === value ? "selected" : ""}
                    onClick={() => setAmount(value)}
                  >
                    ${value}
                  </button>
                ))}
              </div>
              <label className="field-label">{t.term}</label>
              <div className="term-choices">
                {terms.map((value) => (
                  <button
                    key={value}
                    className={term === value ? "selected" : ""}
                    onClick={() => setTerm(value)}
                  >
                    {value === 7
                      ? "7d"
                      : value === 30
                        ? "1m"
                        : `${value / 30}m`}
                  </button>
                ))}
              </div>
              <p className="estimate-note">{t.noOffer}</p>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <button className="primary" onClick={() => setStage("details")}>
                {t.start}
                <span>→</span>
              </button>
            </>
          ) : (
            <>
              <button className="back-link" onClick={() => setStage("welcome")}>
                ← {t.back}
              </button>
              <h2>{t.details}</h2>
              <p className="form-intro">{t.formIntro}</p>
              <label>
                {t.name}
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t.name}
                  autoComplete="name"
                />
              </label>
              <label>
                {t.phone}
                <input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="+855 …"
                  inputMode="tel"
                  autoComplete="tel"
                />
              </label>
              <label>
                {t.employer}
                <input
                  value={employer}
                  onChange={(event) => setEmployer(event.target.value)}
                  placeholder={t.employer}
                />
              </label>
              <label className="consent">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                />
                <span>{t.consent}</span>
              </label>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <button
                className="primary"
                disabled={loading}
                onClick={() => void submit()}
              >
                {loading ? "…" : t.send}
                <span>→</span>
              </button>
            </>
          )}
        </section>
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
            <p className="error" role="alert">
              {error}
            </p>
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
            {result === "withdrawn"
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
                    : t.reviewing}
          </h2>
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          <p>
            {result === "withdrawn"
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
                    : "持牌机构已返回你的审核额度。"
                : result === "rejected-resolved"
                  ? language === "en"
                    ? "The lender has marked the reapplication condition as resolved. You may submit a new application."
                    : language === "zh-CN"
                      ? "持牌机构已确认再次申请条件已解除，你可以提交新的申请。"
                      : "ស្ថាប័នផ្តល់កម្ចីបានបញ្ជាក់ថាលក្ខខណ្ឌដាក់ពាក្យសុំឡើងវិញត្រូវបានដោះស្រាយ។"
                  : result === "rejected-pending"
                    ? language === "en"
                      ? "The lender has not approved this application. Reapplication is unavailable until the stated condition is resolved."
                      : language === "zh-CN"
                        ? "持牌机构未批准本次申请。在说明的条件解除前，暂不可再次申请。"
                        : "ស្ថាប័នផ្តល់កម្ចីមិនបានអនុម័តពាក្យសុំនេះទេ។ មិនអាចដាក់ពាក្យសុំឡើងវិញបានទេ រហូតដល់លក្ខខណ្ឌត្រូវបានដោះស្រាយ។"
                    : result === "supplement-requested"
                      ? language === "en"
                        ? "The review team needs supplementary information. Please follow the broker's instructions; your application remains open."
                        : language === "zh-CN"
                          ? "审核团队需要补充资料。请按助贷人员指引补充；你的申请仍保持有效。"
                          : "ក្រុមពិនិត្យត្រូវការព័ត៌មានបន្ថែម។ សូមអនុវត្តតាមការណែនាំរបស់ក្រុមជំនួយឥណទាន; ពាក្យសុំរបស់អ្នកនៅតែមានសុពលភាព។"
                      : t.noOffer}
          </p>
          {result.startsWith("rejected") ? (
            <p className="response-note" aria-label="Reapplication guidance">
              {applicantRejectionNotice(
                summary?.application.rejectionNoticeCode ?? null,
                language,
              ) ??
                (language === "en"
                  ? "The licensed lender can provide the next-step guidance for this application."
                  : language === "zh-CN"
                    ? "持牌机构可为本次申请提供下一步指引。"
                    : "ស្ថាប័នផ្តល់កម្ចីអាចផ្តល់ការណែនាំសម្រាប់ជំហានបន្ទាប់នៃពាក្យសុំនេះ។")}
            </p>
          ) : null}
          <div className="application-number">
            <span>{t.status}</span>
            <strong>{applicationNo}</strong>
          </div>
          {canWithdraw ? (
            <section className="next-payment" aria-label="Withdraw application">
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
              {language === "en"
                ? "Start a new application"
                : language === "zh-CN"
                  ? "发起新的申请"
                  : "ចាប់ផ្តើមពាក្យសុំថ្មី"}
            </button>
          ) : (
            <p className="response-note">{t.expected}</p>
          )}
          {result === "withdrawn" ? (
            <button className="primary" onClick={startNewApplication}>
              {t.start}
            </button>
          ) : null}
          {summary ? (
            <section className="loan-dashboard" aria-label="Loan dashboard">
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
                    {formatUsdMinor(summary.application.requestedAmountMinor)}
                  </b>
                </div>
                <div>
                  <span>{t.installments}</span>
                  <b>{summary.terms?.installmentCount ?? "—"}</b>
                </div>
                <div>
                  <span>{t.firstDueDate}</span>
                  <b>{summary.terms?.firstDueDate ?? "—"}</b>
                </div>
                <div>
                  <span>
                    {language === "en"
                      ? "Approved"
                      : language === "km"
                        ? "បានអនុម័ត"
                        : "审核额度"}
                  </span>
                  <b>
                    {summary.terms
                      ? formatUsdMinor(summary.terms.approvedAmountMinor)
                      : "—"}
                  </b>
                </div>
                <div>
                  <span>
                    {language === "en"
                      ? "Service fee"
                      : language === "km"
                        ? "ថ្លៃសេវា"
                        : "服务费"}
                  </span>
                  <b>
                    {summary.terms
                      ? formatUsdMinor(summary.terms.serviceFeeMinor)
                      : "—"}
                  </b>
                </div>
                <div>
                  <span>
                    {language === "en"
                      ? "Total repayable"
                      : language === "km"
                        ? "សរុបត្រូវសង"
                        : "应还总额"}
                  </span>
                  <b>
                    {summary.terms
                      ? formatUsdMinor(summary.terms.totalRepayableMinor)
                      : "—"}
                  </b>
                </div>
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
              ) : summary.application.status === "USER_CONTRACT_CONFIRMED" ? (
                <p className="response-note">
                  {language === "en"
                    ? "Your confirmation is recorded. The lender is completing its contract record."
                    : language === "km"
                      ? "ការបញ្ជាក់របស់អ្នកត្រូវបានកត់ត្រា។ ស្ថាប័នផ្តល់កម្ចីកំពុងបំពេញកំណត់ត្រាកិច្ចសន្យា។"
                      : "你的确认已记录，持牌机构正在完成合同记录。"}
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
                      <b>{formatUsdMinor(summary.repayment.totalPaidMinor)}</b>
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
                        {summary.repayment.nextInstallment.dueDate}
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
                    aria-label="Manual payment safety"
                  >
                    <strong>
                      {language === "en"
                        ? "Manual payment safety"
                        : language === "km"
                          ? "សុវត្ថិភាពការទូទាត់ដោយដៃ"
                          : "人工还款安全提示"}
                    </strong>
                    <small>
                      {language === "en"
                        ? "Confirm payment instructions with the licensed lender's operations team before paying. Do not transfer funds to account details sent through unverified messages."
                        : language === "km"
                          ? "សូមបញ្ជាក់ការណែនាំទូទាត់ជាមួយក្រុមប្រតិបត្តិរបស់ស្ថាប័នមានអាជ្ញាប័ណ្ណមុនពេលបង់ប្រាក់។ កុំផ្ទេរប្រាក់ទៅគណនីដែលផ្ញើតាមសារមិនបានផ្ទៀងផ្ទាត់។"
                          : "付款前请向持牌机构运营团队确认还款指引；请勿向未经核验的消息中提供的账户转账。"}
                    </small>
                  </section>
                  <div className="installments">
                    {summary.repayment.installments.map((item) => (
                      <div key={item.installmentNo}>
                        <span>
                          #{item.installmentNo} · {item.dueDate}
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
                      : "持牌机构确认放款后，系统将生成还款期次、费用及账单。"}
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
                      ? "投诉的最终处理由持牌机构负责。请勿填写密码、银行卡完整号码或一次性验证码。"
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
                        event.target.value as "SERVICE_QUERY" | "COMPLAINT",
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
                  disabled={loading || serviceCaseMessage.trim().length < 10}
                  onClick={() => void submitServiceCase()}
                >
                  {language === "en"
                    ? "Submit support case"
                    : language === "zh-CN"
                      ? "提交客服工单"
                      : "ដាក់សំណើសេវាកម្ម"}
                </button>
                {serviceCaseNotice ? (
                  <p className="response-note">{serviceCaseNotice}</p>
                ) : null}
              </section>
            </section>
          ) : null}
        </section>
      )}

      <section className="progress-card">
        <div className="progress-title">
          <span>{t.review}</span>
          <small>{t.secured}</small>
        </div>
        <div className="progress">
          {[t.apply, t.broker, t.lender, t.offer].map((label, index) => (
            <div
              className={`progress-step ${index < currentStep ? "done" : index === currentStep ? "active" : ""}`}
              key={label}
            >
              <i>{index < currentStep ? "✓" : index + 1}</i>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </section>
      {applicationHistory.length > 0 ? (
        <section className="history-card" aria-label="Application history">
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
                  onClick={() => void checkStatus(item.applicationNo)}
                  disabled={loading}
                >
                  <span>
                    <strong>{formatUsdMinor(item.requestedAmountMinor)}</strong>
                    <small>{item.applicationNo}</small>
                  </span>
                  <em>{applicantPhaseLabel(phase, language)}</em>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}
      <footer>
        <span>🔒 {t.secured}</span>
        <span>USD 10–500 · 7–180 days</span>
      </footer>
    </main>
  );
}
