import { useState } from "react";
import { formatHuman } from "@payease/shared-money";
import { translate, type LanguageCode } from "@payease/v1-domain";

const copy: Record<LanguageCode, Record<string, string>> = {
  "zh-CN": {
    title: "薪易贷",
    identity: "Telegram 身份",
    phone: "手机号授权",
    amount: "申请金额",
    term: "期限",
    agreement: "我已阅读费用和还款计划",
    apply: "提交申请",
    contract: "合同确认",
    bill: "账单将在放款后显示",
    demo: "本地演示，不发送真实申请。",
  },
  en: {
    title: "PayEase",
    identity: "Telegram identity",
    phone: "Phone sharing consent",
    amount: "Requested amount",
    term: "Term",
    agreement: "I have read the fees and repayment schedule",
    apply: "Submit application",
    contract: "Contract confirmation",
    bill: "Your bill will appear after disbursement",
    demo: "Local demo; no real application is sent.",
  },
  km: {
    title: "PayEase",
    identity: "អត្តសញ្ញាណ Telegram",
    phone: "ការយល់ព្រមចែករំលែកលេខទូរស័ព្ទ",
    amount: "ចំនួនទឹកប្រាក់ស្នើសុំ",
    term: "រយៈពេល",
    agreement: "ខ្ញុំបានអានថ្លៃសេវា និងកាលវិភាគសង",
    apply: "ដាក់ពាក្យស្នើសុំ",
    contract: "បញ្ជាក់កិច្ចសន្យា",
    bill: "វិក្កយបត្រនឹងបង្ហាញបន្ទាប់ពីការបើកប្រាក់",
    demo: "ការបង្ហាញក្នុងមូលដ្ឋាន មិនផ្ញើពាក្យពិតទេ។",
  },
};
export function App(): JSX.Element {
  const [language, setLanguage] = useState<LanguageCode>("km");
  const [phoneConsent, setPhoneConsent] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const text = copy[language];
  const amount = { amountMinor: "25000", currency: "USD" as const };
  return (
    <main
      style={{
        maxWidth: 520,
        margin: "0 auto",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h1>{text.title}</h1>
        <select
          aria-label="Language"
          value={language}
          onChange={(e) => setLanguage(e.target.value as LanguageCode)}
        >
          <option value="km">ខ្មែរ</option>
          <option value="en">English</option>
          <option value="zh-CN">中文</option>
        </select>
      </header>
      <p>{text.demo}</p>
      {!submitted ? (
        <section>
          <p>
            <strong>{text.identity}:</strong> Telegram initData verification
            required at server side before production session creation.
          </p>
          <label style={{ display: "block", margin: "16px 0" }}>
            <input
              type="checkbox"
              checked={phoneConsent}
              onChange={(e) => setPhoneConsent(e.target.checked)}
            />{" "}
            {text.phone}
          </label>
          <dl>
            <dt>{text.amount}</dt>
            <dd>{formatHuman(amount)}</dd>
            <dt>{text.term}</dt>
            <dd>30 days</dd>
          </dl>
          <label style={{ display: "block", margin: "16px 0" }}>
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />{" "}
            {text.agreement}
          </label>
          <button
            data-testid="submit-application"
            disabled={!phoneConsent || !accepted}
            onClick={() => setSubmitted(true)}
          >
            {translate(language, "submit")}
          </button>
        </section>
      ) : (
        <section data-testid="application-submitted">
          <h2>{text.contract}</h2>
          <p>APP-DEMO-0001 · SUBMITTED</p>
          <p>{text.bill}</p>
        </section>
      )}
    </main>
  );
}
