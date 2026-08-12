import { useEffect, useMemo, useState } from "react";
import type { LanguageCode } from "@payease/v1-domain";
import "./app.css";

type Stage = "welcome" | "details" | "submitted" | "offer";

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

export function App(): JSX.Element {
  const [language, setLanguage] = useState<LanguageCode>("km");
  const [stage, setStage] = useState<Stage>("welcome");
  const [amount, setAmount] = useState(50);
  const [term, setTerm] = useState(30);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [employer, setEmployer] = useState("");
  const [consent, setConsent] = useState(false);
  const [applicationNo, setApplicationNo] = useState("");
  const [approvedAmountMinor, setApprovedAmountMinor] = useState<string>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const t = labels[language];
  const repaymentHint = useMemo(
    () => Math.ceil((amount * 1.03) / Math.max(1, term / 30)),
    [amount, term],
  );

  useEffect(() => {
    const existingApplication = new URLSearchParams(window.location.search).get(
      "application",
    );
    if (existingApplication) {
      setApplicationNo(existingApplication);
      setStage("submitted");
    }
  }, []);

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
      const response = await fetch("/api/v1/local/applications", {
        method: "POST",
        credentials: "omit",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          telegramUserRef: telegramUserRef(),
          preferredLanguage: language,
          requestedAmount: {
            amountMinor: String(amount * 100),
            currency: "USD",
          },
          tenorDays: term,
        }),
      });
      const payload = (await response.json()) as {
        applicationNo?: string;
        code?: string;
      };
      if (!response.ok || !payload.applicationNo)
        throw new Error(payload.code ?? "SUBMISSION_FAILED");
      setApplicationNo(payload.applicationNo);
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

  async function checkStatus() {
    if (!applicationNo) return;
    setLoading(true);
    try {
      const response = await fetch(
        `/api/v1/local/public/applications/${encodeURIComponent(applicationNo)}`,
        { credentials: "include" },
      );
      const payload = (await response.json()) as {
        approved_amount_minor?: string;
      };
      if (!response.ok) throw new Error("STATUS_FAILED");
      setApprovedAmountMinor(payload.approved_amount_minor);
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

  const currentStep =
    stage === "welcome" || stage === "details"
      ? 0
      : stage === "submitted"
        ? 1
        : 3;
  return (
    <main className="shell" lang={language}>
      <header className="topbar">
        <div className="brand-mark">
          <span className="brand-icon">P</span>
          <strong>{t.brand}</strong>
        </div>
        <div className="top-actions">
          <span className="preview-pill">{t.demo}</span>
          <select
            aria-label="Language"
            value={language}
            onChange={(event) =>
              setLanguage(event.target.value as LanguageCode)
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
              <div className="estimate">
                <div>
                  <span>
                    {language === "en"
                      ? "Estimated monthly payment"
                      : language === "km"
                        ? "ការបង់ប្រចាំខែប៉ាន់ស្មាន"
                        : "预估月还款"}
                  </span>
                  <strong>${repaymentHint.toLocaleString("en-US")}</strong>
                </div>
                <span className="estimate-note">{t.noOffer}</span>
              </div>
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
          <h2>{approvedAmountMinor ? t.offer : t.reviewing}</h2>
          <p>
            {approvedAmountMinor
              ? language === "en"
                ? "The licensed lender has returned your approved limit."
                : language === "km"
                  ? "ស្ថាប័នមានអាជ្ញាប័ណ្ណបានផ្តល់ទំហំដែលបានអនុម័ត។"
                  : "持牌机构已返回你的审核额度。"
              : t.noOffer}
          </p>
          <div className="application-number">
            <span>{t.status}</span>
            <strong>{applicationNo}</strong>
          </div>
          {approvedAmountMinor ? (
            <p className="response-note">
              {language === "en"
                ? "Approved limit: "
                : language === "km"
                  ? "ទំហំបានអនុម័ត៖ "
                  : "审核额度："}
              <strong>
                ${(Number(approvedAmountMinor) / 100).toLocaleString("en-US")}
              </strong>
            </p>
          ) : (
            <p className="response-note">{t.expected}</p>
          )}
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
      <footer>
        <span>🔒 {t.secured}</span>
        <span>USD 10–500 · 7–180 days</span>
      </footer>
    </main>
  );
}
