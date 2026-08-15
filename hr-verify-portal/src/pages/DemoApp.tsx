import {
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";

type Copy = {
  title: string;
  subtitle: string;
  signIn: string;
  list: string;
  detail: string;
  employerOnly: string;
  verify: string;
  reject: string;
  back: string;
};

const COPY: Record<"zh-CN" | "en" | "km", Copy> = {
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
  },
};

function Shell({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <main
      style={{
        maxWidth: 900,
        margin: "32px auto",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {children}
    </main>
  );
}

function Login(): JSX.Element {
  const navigate = useNavigate();
  const copy = COPY.en;
  return (
    <Shell>
      <h1>{copy.title}</h1>
      <p>{copy.subtitle}</p>
      <p>中文 · English · ភាសាខ្មែរ</p>
      <button onClick={() => void navigate("/employment/list")}>
        {copy.signIn}
      </button>
    </Shell>
  );
}

function List(): JSX.Element {
  const navigate = useNavigate();
  const copy = COPY.en;
  return (
    <Shell>
      <h1>{copy.list}</h1>
      <p>{copy.employerOnly}</p>
      <table>
        <thead>
          <tr>
            <th>Verification reference</th>
            <th>Requested at</th>
            <th>Outcome</th>
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
                Review demo
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </Shell>
  );
}

function Detail(): JSX.Element {
  const navigate = useNavigate();
  const { id } = useParams();
  const copy = COPY.en;
  return (
    <Shell>
      <h1>{copy.detail}</h1>
      <p>{copy.employerOnly}</p>
      <dl>
        <dt>Verification reference</dt>
        <dd>{id}</dd>
        <dt>Employment outcome</dt>
        <dd>MATCH PENDING</dd>
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
    </Shell>
  );
}

export function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/employment/list" element={<List />} />
      <Route path="/employment/:id" element={<Detail />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
