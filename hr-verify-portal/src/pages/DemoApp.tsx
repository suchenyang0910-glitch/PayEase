import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";

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

export type HrDemoCopyRow = Readonly<{
  title: string;
  subtitle: string;
  signIn: string;
  list: string;
  detail: string;
  employerOnly: string;
  verify: string;
  reject: string;
  back: string;
  verificationReference: string;
  requestedAt: string;
  outcome: string;
  reviewDemo: string;
  employmentOutcome: string;
  matchPending: string;
}>;

export const HR_DEMO_COPY: Record<DemoLanguage, HrDemoCopyRow> = {
  "zh-CN": {
    title: "PayEase HR 核验演示",
    subtitle: "受控演示：仅合成数据，不连接企业系统或提交核验结果。",
    signIn: "进入演示",
    list: "本工厂就业核验待办",
    detail: "就业核验详情",
    employerOnly: "当前租户：演示工厂；仅显示匹配结论。",
    verify: "标记为已核验（仅本页）",
    reject: "标记为不匹配（仅本页）",
    back: "返回列表",
    verificationReference: "核验引用",
    requestedAt: "请求时间",
    outcome: "结果",
    reviewDemo: "查看演示",
    employmentOutcome: "就业结论",
    matchPending: "匹配待处理",
  },
  en: {
    title: "PayEase HR verification demo",
    subtitle:
      "Controlled demo: synthetic data only; no enterprise connection or submitted result.",
    signIn: "Enter demo",
    list: "Employment verification queue",
    detail: "Employment verification detail",
    employerOnly: "Current tenant: demo factory; matching outcome only.",
    verify: "Mark matched (this page only)",
    reject: "Mark not matched (this page only)",
    back: "Back to list",
    verificationReference: "Verification reference",
    requestedAt: "Requested at",
    outcome: "Outcome",
    reviewDemo: "Review demo",
    employmentOutcome: "Employment outcome",
    matchPending: "MATCH PENDING",
  },
  km: {
    title: "ការបង្ហាញការផ្ទៀងផ្ទាត់ HR របស់ PayEase",
    subtitle:
      "ការបង្ហាញដែលបានគ្រប់គ្រង៖ ទិន្នន័យសំយោគប៉ុណ្ណោះ មិនភ្ជាប់ប្រព័ន្ធសហគ្រាស។",
    signIn: "ចូលការបង្ហាញ",
    list: "បញ្ជីការផ្ទៀងផ្ទាត់ការងារ",
    detail: "ព័ត៌មានលម្អិតនៃការផ្ទៀងផ្ទាត់",
    employerOnly: "អ្នកជួលបច្ចុប្បន្ន៖ រោងចក្រសាកល្បង; បង្ហាញតែលទ្ធផលផ្គូផ្គង។",
    verify: "សម្គាល់ថាត្រូវគ្នា (តែក្នុងទំព័រនេះ)",
    reject: "សម្គាល់ថាមិនត្រូវគ្នា (តែក្នុងទំព័រនេះ)",
    back: "ត្រឡប់ទៅបញ្ជី",
    verificationReference: "យោងការផ្ទៀងផ្ទាត់",
    requestedAt: "ម៉ោងស្នើសុំ",
    outcome: "លទ្ធផល",
    reviewDemo: "ពិនិត្យការបង្ហាញ",
    employmentOutcome: "លទ្ធផលការងារ",
    matchPending: "កំពុងរង់ចាំផ្គូផ្គង",
  },
};

const LANGUAGE_STORAGE_KEY = "payease-demo-language";

type HrDemoLanguageContextValue = Readonly<{
  language: DemoLanguage;
  copy: HrDemoCopyRow;
  setLanguage: (next: DemoLanguage) => void;
}>;

const HrDemoLanguageContext = createContext<HrDemoLanguageContextValue | null>(
  null,
);

export function useHrDemoLanguage(): HrDemoLanguageContextValue {
  const ctx = useContext(HrDemoLanguageContext);
  if (!ctx) {
    throw new Error(
      "useHrDemoLanguage must be used inside HrDemoLanguageProvider",
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

function HrDemoLanguageProvider({
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
  const value = useMemo<HrDemoLanguageContextValue>(
    () => ({ language, copy: HR_DEMO_COPY[language], setLanguage }),
    [language, setLanguage],
  );
  return (
    <HrDemoLanguageContext.Provider value={value}>
      {children}
    </HrDemoLanguageContext.Provider>
  );
}

function LanguageSwitcher() {
  const { language, setLanguage } = useHrDemoLanguage();
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
        maxWidth: 900,
        margin: "32px auto",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <HrDemoLanguageProvider>
        <LanguageSwitcher />
        {children}
      </HrDemoLanguageProvider>
    </main>
  );
}

function Login(): JSX.Element {
  const navigate = useNavigate();
  const { copy } = useHrDemoLanguage();
  return (
    <>
      <h1>{copy.title}</h1>
      <p>{copy.subtitle}</p>
      <button onClick={() => void navigate("/employment/list")}>
        {copy.signIn}
      </button>
    </>
  );
}

function List(): JSX.Element {
  const navigate = useNavigate();
  const { copy } = useHrDemoLanguage();
  return (
    <>
      <h1>{copy.list}</h1>
      <p>{copy.employerOnly}</p>
      <table>
        <thead>
          <tr>
            <th>{copy.verificationReference}</th>
            <th>{copy.requestedAt}</th>
            <th>{copy.outcome}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>DEMO-EMP-001</td>
            <td>2026-08-15</td>
            <td>PENDING</td>
            <td>
              <button onClick={() => void navigate("/employment/DEMO-EMP-001")}>
                {copy.reviewDemo}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

function Detail(): JSX.Element {
  const navigate = useNavigate();
  const { id } = useParams();
  const { copy } = useHrDemoLanguage();
  return (
    <>
      <h1>{copy.detail}</h1>
      <p>{copy.employerOnly}</p>
      <dl>
        <dt>{copy.verificationReference}</dt>
        <dd>{id}</dd>
        <dt>{copy.employmentOutcome}</dt>
        <dd>{copy.matchPending}</dd>
      </dl>
      <button onClick={() => void navigate("/employment/list")}>
        {copy.verify}
      </button>{" "}
      <button onClick={() => void navigate("/employment/list")}>
        {copy.reject}
      </button>
      <p>
        <button onClick={() => void navigate("/employment/list")}>
          {copy.back}
        </button>
      </p>
    </>
  );
}

export function App(): JSX.Element {
  return (
    <Shell>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/employment/list" element={<List />} />
        <Route path="/employment/:id" element={<Detail />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Shell>
  );
}
