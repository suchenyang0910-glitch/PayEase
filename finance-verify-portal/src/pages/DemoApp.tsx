import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";

export type DemoLanguage = "zh-CN" | "en" | "km";

export const DEMO_LANGUAGES: readonly DemoLanguage[] = [
  "zh-CN",
  "en",
  "km",
] as const;

export const DEMO_LANGUAGE_LABELS: Record<DemoLanguage, string> = {
  "zh-CN": "中文",
  en: "English",
  km: "ភាសាខ្មែរ",
};

export type FinanceDemoCopyRow = Readonly<{
  title: string;
  subtitle: string;
  trilingualLabel: string;
  enterButton: string;
  syntheticOnly: string;
  repaymentHeading: string;
  repaymentIntro: string;
  ledgerReference: string;
  dueDate: string;
  currency: string;
  totalDue: string;
  status: string;
  openReconciliation: string;
  reconHeading: string;
  reconIntro: string;
  reconReference: string;
  reconExpected: string;
  reconObserved: string;
  reconResult: string;
  backToSchedule: string;
}>;

export const FINANCE_DEMO_COPY: Record<DemoLanguage, FinanceDemoCopyRow> = {
  "zh-CN": {
    title: "PayEase 财务演示",
    subtitle: "受控演示：仅合成数据，不连接企业系统或提交核验结果。",
    trilingualLabel: "中文 · English · ភាសាខ្មែរ",
    enterButton: "进入演示",
    syntheticOnly: "仅合成对账数据。不提交任何付款、结算或会计操作凭证。",
    repaymentHeading: "还款计划 — 演示",
    repaymentIntro: "仅显示合成台账引用。客户身份与支付渠道细节已排除。",
    ledgerReference: "台账引用",
    dueDate: "到期日",
    currency: "币种",
    totalDue: "应还总额",
    status: "状态",
    openReconciliation: "打开对账演示",
    reconHeading: "对账 — 演示",
    reconIntro: "对比仅用于训练。指派不会创建工单或写入台账记录。",
    reconReference: "引用",
    reconExpected: "预期",
    reconObserved: "实际",
    reconResult: "结果",
    backToSchedule: "返回计划",
  },
  en: {
    title: "PayEase Finance demo",
    subtitle:
      "Controlled demo: synthetic data only; no enterprise connection or submitted result.",
    trilingualLabel: "中文 · English · ភាសាខ្មែរ",
    enterButton: "Enter demo",
    syntheticOnly:
      "Synthetic reconciliation data only. No payment, settlement, or accounting action is submitted.",
    repaymentHeading: "Repayment schedule — demo",
    repaymentIntro:
      "Only synthetic ledger references are shown. Customer identity and payment-channel details are excluded.",
    ledgerReference: "Ledger reference",
    dueDate: "Due date",
    currency: "Currency",
    totalDue: "Total due",
    status: "Status",
    openReconciliation: "Open reconciliation demo",
    reconHeading: "Reconciliation — demo",
    reconIntro:
      "Comparison is shown for training only. Assigning an item does not create a work order or write any ledger entry.",
    reconReference: "Reference",
    reconExpected: "Expected",
    reconObserved: "Observed",
    reconResult: "Result",
    backToSchedule: "Back to schedule",
  },
  km: {
    title: "ការបង្ហាញហិរញ្ញវត្ថុ PayEase",
    subtitle:
      "ការបង្ហាញដែលបានគ្រប់គ្រង៖ ទិន្នន័យសំយោគប៉ុណ្ណោះ មិនភ្ជាប់ប្រព័ន្ធ",
    trilingualLabel: "中文 · English · ភាសាខ្មែរ",
    enterButton: "ចូលការបង្ហាញ",
    syntheticOnly: "ទិន្នន័យសំយោគប៉ុណ្ណោះ។ មិនមានការដាក់ស្នើប្រាក់បង់ប្រាក់ទេ។",
    repaymentHeading: "កាលវិភាគសងប្រាក់ — ការបង្ហាញ",
    repaymentIntro:
      "បង្ហាញតែសំគាល់សៀវភៅសំយោគ។ ព័ត៌មានអតិថិជននិងបណ្តាញបង់ប្រាក់ត្រូវបានដកចេញ។",
    ledgerReference: "សំគាល់សៀវភៅ",
    dueDate: "ថ្ងៃផុតកំណត់",
    currency: "រូបិយប័ណ្ណ",
    totalDue: "ប្រាក់ត្រូវសរុប",
    status: "ស្ថានភាព",
    openReconciliation: "បើកការផ្ទៀងផ្ទាត់ប្រាក់",
    reconHeading: "ការផ្ទៀងផ្ទាត់ប្រាក់ — ការបង្ហាញ",
    reconIntro: "ការប្រៀបធៀបសម្រាប់ការបណ្តុះបណ្តាលប៉ុណ្ណោះ។",
    reconReference: "សំគាល់",
    reconExpected: "រំពឹងទុក",
    reconObserved: "ពិតប្រាកដ",
    reconResult: "លទ្ធផល",
    backToSchedule: "ត្រឡប់ទៅកាលវិភាគ",
  },
};

const LANGUAGE_STORAGE_KEY = "payease-demo-language";

type FinanceDemoLanguageContextValue = Readonly<{
  language: DemoLanguage;
  copy: FinanceDemoCopyRow;
  setLanguage: (next: DemoLanguage) => void;
}>;

const FinanceDemoLanguageContext =
  createContext<FinanceDemoLanguageContextValue | null>(null);

export function useFinanceDemoLanguage(): FinanceDemoLanguageContextValue {
  const ctx = useContext(FinanceDemoLanguageContext);
  if (!ctx) {
    throw new Error(
      "useFinanceDemoLanguage must be used inside FinanceDemoLanguageProvider",
    );
  }
  return ctx;
}

function readInitialLanguage(): DemoLanguage {
  if (typeof window === "undefined") return "en";
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored && (DEMO_LANGUAGES as readonly string[]).includes(stored)) {
      return stored as DemoLanguage;
    }
  } catch {
    // ignore storage errors in controlled demo
  }
  const nav = typeof navigator !== "undefined" ? navigator.language : "en";
  if (nav.toLowerCase().startsWith("zh")) return "zh-CN";
  if (nav.toLowerCase().startsWith("km")) return "km";
  return "en";
}

function FinanceDemoLanguageProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [language, setLanguageState] = useState<DemoLanguage>(() =>
    readInitialLanguage(),
  );
  const setLanguage = useCallback((next: DemoLanguage) => {
    setLanguageState(next);
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      // ignore storage errors in controlled demo
    }
  }, []);
  const value = useMemo<FinanceDemoLanguageContextValue>(
    () => ({
      language,
      copy: FINANCE_DEMO_COPY[language],
      setLanguage,
    }),
    [language, setLanguage],
  );
  return (
    <FinanceDemoLanguageContext.Provider value={value}>
      {children}
    </FinanceDemoLanguageContext.Provider>
  );
}

function LanguageSwitcher() {
  const { language, setLanguage } = useFinanceDemoLanguage();
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        justifyContent: "flex-end",
        marginBottom: 8,
      }}
    >
      {DEMO_LANGUAGES.map((lang) => {
        const active = lang === language;
        return (
          <button
            key={lang}
            type="button"
            onClick={() => setLanguage(lang)}
            style={{
              cursor: "pointer",
              fontWeight: active ? 700 : 400,
              background: active ? "#eef2ff" : "transparent",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              padding: "4px 10px",
            }}
          >
            {DEMO_LANGUAGE_LABELS[lang]}
          </button>
        );
      })}
    </div>
  );
}

function Shell({ children }: { readonly children: ReactNode }): JSX.Element {
  return (
    <main
      style={{
        maxWidth: 960,
        margin: "32px auto",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <FinanceDemoLanguageProvider>
        <LanguageSwitcher />
        {children}
      </FinanceDemoLanguageProvider>
    </main>
  );
}

function Login(): JSX.Element {
  const navigate = useNavigate();
  const { copy } = useFinanceDemoLanguage();
  return (
    <>
      <h1>{copy.title}</h1>
      <p>{copy.trilingualLabel}</p>
      <p>{copy.syntheticOnly}</p>
      <button onClick={() => void navigate("/repayment/list")}>
        {copy.enterButton}
      </button>
    </>
  );
}

function RepaymentList(): JSX.Element {
  const navigate = useNavigate();
  const { copy } = useFinanceDemoLanguage();
  return (
    <>
      <h1>{copy.repaymentHeading}</h1>
      <p>{copy.repaymentIntro}</p>
      <table>
        <thead>
          <tr>
            <th>{copy.ledgerReference}</th>
            <th>{copy.dueDate}</th>
            <th>{copy.currency}</th>
            <th>{copy.totalDue}</th>
            <th>{copy.status}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>DEMO-LEDGER-001</td>
            <td>2026-08-30</td>
            <td>USD</td>
            <td>125.00</td>
            <td>SCHEDULED</td>
          </tr>
          <tr>
            <td>DEMO-LEDGER-002</td>
            <td>2026-09-06</td>
            <td>KHR</td>
            <td>500,000</td>
            <td>RECONCILIATION REQUIRED</td>
          </tr>
        </tbody>
      </table>
      <p>
        <button onClick={() => void navigate("/reconciliation")}>
          {copy.openReconciliation}
        </button>
      </p>
    </>
  );
}

function Reconciliation(): JSX.Element {
  const navigate = useNavigate();
  const { copy } = useFinanceDemoLanguage();
  return (
    <>
      <h1>{copy.reconHeading}</h1>
      <p>{copy.reconIntro}</p>
      <table>
        <thead>
          <tr>
            <th>{copy.reconReference}</th>
            <th>{copy.reconExpected}</th>
            <th>{copy.reconObserved}</th>
            <th>{copy.reconResult}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>DEMO-RECON-001</td>
            <td>USD 125.00</td>
            <td>USD 125.00</td>
            <td>MATCHED</td>
          </tr>
          <tr>
            <td>DEMO-RECON-002</td>
            <td>KHR 500,000</td>
            <td>KHR 0</td>
            <td>DIFFERENCE</td>
          </tr>
        </tbody>
      </table>
      <button onClick={() => void navigate("/repayment/list")}>
        {copy.backToSchedule}
      </button>
    </>
  );
}

export function App(): JSX.Element {
  return (
    <Shell>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/repayment/list" element={<RepaymentList />} />
        <Route path="/reconciliation" element={<Reconciliation />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Shell>
  );
}
