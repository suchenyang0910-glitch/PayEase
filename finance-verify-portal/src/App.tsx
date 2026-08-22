import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  FINANCE_COPY,
  FINANCE_LANGUAGE_LABELS,
  type FinanceLanguage,
} from "./finance-copy";
import { financeReconciliationNotice } from "./finance-reconciliation-action";

type Identity = {
  loginName: string;
  preferredLanguage: FinanceLanguage;
  roles: string[];
};
type WorkItem = {
  id: string;
  application_no: string;
  evidence_type: string;
  evidence_reference: string;
  status: string;
  assigned_to_user_ref: string | null;
};
type VerificationQueueItem = {
  applicationNo: string;
  stage: string;
  createdAt: string;
  employerTenantId: string;
  collectionSequence?: number;
  dueDate?: string;
  scheduledAmountMinor?: string;
  selectedRepaymentMethod:
    | "EMPLOYER_PAYROLL_DEDUCTION"
    | "USER_DIRECT_DEBIT"
    | "USER_MANUAL_PAYMENT"
    | null;
  payrollDeductionAuthorized: boolean;
  collectionScope: "PRINCIPAL_AND_INTEREST" | null;
};
const layout = {
  maxWidth: 1000,
  margin: "0 auto",
  padding: 24,
  fontFamily: "system-ui, sans-serif",
} as const;
const panel = {
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  padding: 20,
  marginTop: 20,
} as const;
async function api(path: string, init?: RequestInit) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (
    ["POST", "PUT", "PATCH", "DELETE"].includes(
      (init?.method ?? "GET").toUpperCase(),
    )
  ) {
    const token = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("__Host-payease_admin_csrf="))
      ?.slice("__Host-payease_admin_csrf=".length);
    if (token) headers["X-CSRF-Token"] = token;
  }
  return fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers,
  });
}

function Login({
  done,
  initialError = "",
}: {
  done: (identity: Identity) => void;
  initialError?: string;
}): JSX.Element {
  const [language, setLanguage] = useState<FinanceLanguage>("en");
  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError);
  const copy = FINANCE_COPY[language];
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const response = await api("/v1/local/auth/login", {
        method: "POST",
        body: JSON.stringify({ loginName, password }),
      });
      if (!response.ok) return setError(copy.loginFailed);
      const me = await api("/v1/local/auth/me");
      if (!me.ok) return setError(copy.sessionFailed);
      let identity = (await me.json()) as Identity;
      if (identity.preferredLanguage !== language) {
        try {
          const persisted = await api("/v1/local/auth/me/preferred-language", {
            method: "PATCH",
            body: JSON.stringify({ preferredLanguage: language }),
          });
          if (persisted.ok)
            identity = { ...identity, preferredLanguage: language };
        } catch {
          // A preference failure must not discard an authenticated session.
        }
      }
      done(identity);
    } catch {
      setError(copy.sessionFailed);
    }
  };
  return (
    <main style={layout}>
      <section style={panel}>
        <h1>{copy.title}</h1>
        <form
          onSubmit={submit}
          style={{ display: "grid", gap: 10, maxWidth: 400 }}
        >
          <label>
            {copy.account}
            <input
              autoComplete="username"
              value={loginName}
              onChange={(e) => setLoginName(e.target.value)}
              required
            />
          </label>
          <label>
            {copy.password}
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <label>
            {copy.language}
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as FinanceLanguage)}
            >
              {Object.entries(FINANCE_LANGUAGE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button>{copy.signIn}</button>
          {error ? <p role="alert">{error}</p> : null}
        </form>
      </section>
    </main>
  );
}

export function App(): JSX.Element {
  const [identity, setIdentity] = useState<Identity>();
  const [signInError, setSignInError] = useState("");
  const [checking, setChecking] = useState(true);
  const [items, setItems] = useState<WorkItem[]>([]);
  const [verificationItems, setVerificationItems] = useState<
    VerificationQueueItem[]
  >([]);
  const [verificationApplicationNo, setVerificationApplicationNo] =
    useState("");
  const [verificationCollectionSequence, setVerificationCollectionSequence] =
    useState<number | "">("");
  const [
    verificationScheduledAmountMinor,
    setVerificationScheduledAmountMinor,
  ] = useState("");
  const [actualCollectedAmountMinor, setActualCollectedAmountMinor] =
    useState("");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [assignee, setAssignee] = useState("");
  const [reasonCode, setReasonCode] = useState("MANUAL_EVIDENCE_MATCHED");
  const [notice, setNotice] = useState("");
  const [runningAction, setRunningAction] = useState(false);
  const verificationIdempotencyKey = useRef<string>();
  useEffect(() => {
    api("/v1/local/auth/me")
      .then(async (response) => {
        const payload = response.ok
          ? await response.json().catch(() => undefined)
          : undefined;
        if (payload) setIdentity(payload as Identity);
      })
      .finally(() => setChecking(false));
  }, []);
  const language = identity?.preferredLanguage ?? "en";
  const copy = FINANCE_COPY[language];
  const permitted = identity?.roles.includes("EMPLOYER_FINANCE") ?? false;
  const repaymentMethodLabel = (
    value: VerificationQueueItem["selectedRepaymentMethod"],
  ) => {
    if (value === "EMPLOYER_PAYROLL_DEDUCTION") {
      return language === "zh-CN"
        ? "工资代扣"
        : language === "km"
          ? "កាត់ពីប្រាក់ខែ"
          : "Employer payroll";
    }
    return language === "zh-CN"
      ? "不在企业财务范围"
      : language === "km"
        ? "មិនស្ថិតក្នុងសិទ្ធិហិរញ្ញវត្ថុក្រុមហ៊ុន"
        : "Out of employer finance scope";
  };
  const expireSession = () => {
    setSignInError(copy.sessionExpired);
    setIdentity(undefined);
  };
  const selectVerificationItem = (item: VerificationQueueItem) => {
    if (
      item.selectedRepaymentMethod !== "EMPLOYER_PAYROLL_DEDUCTION" ||
      !item.payrollDeductionAuthorized
    ) {
      setNotice(
        language === "zh-CN"
          ? "企业财务仅处理已授权工资代扣任务。"
          : language === "km"
            ? "ផ្នែកហិរញ្ញវត្ថុអាចដំណើរការបានតែការកាត់ពីប្រាក់ខែដែលបានអនុញ្ញាត។"
            : "Employer finance can process only authorized payroll collection tasks.",
      );
      return;
    }
    setVerificationApplicationNo(item.applicationNo);
    setVerificationCollectionSequence(item.collectionSequence ?? "");
    setVerificationScheduledAmountMinor(item.scheduledAmountMinor ?? "");
    setActualCollectedAmountMinor(item.scheduledAmountMinor ?? "");
    setEvidenceReference("");
    setNotice("");
    setReasonCode("PAYROLL_INSTALLMENT_COLLECTION_REPORTED");
  };
  const load = async () => {
    setRunningAction(true);
    setNotice("");
    try {
      const response = await api("/v1/local/reconciliation/open");
      if (response.status === 401) return expireSession();
      if (!response.ok)
        return setNotice(
          `${copy.blocked} (${response.status}): ${copy.loadFailed}`,
        );
      setItems((await response.json()) as WorkItem[]);
    } catch {
      setNotice(`${copy.blocked}: ${copy.loadFailed}`);
    } finally {
      setRunningAction(false);
    }
  };
  const loadVerificationQueue = async () => {
    if (!permitted) return;
    const response = await api("/v1/local/employer/verifications/open");
    if (response.status === 401) return expireSession();
    const payload = (await response.json().catch(() => undefined)) as
      { items?: VerificationQueueItem[] } | undefined;
    if (response.ok && Array.isArray(payload?.items)) {
      setVerificationItems(payload.items);
      if (
        verificationApplicationNo &&
        !payload.items.some(
          (item) =>
            item.applicationNo === verificationApplicationNo &&
            (verificationCollectionSequence === "" ||
              item.collectionSequence === verificationCollectionSequence),
        )
      ) {
        setVerificationApplicationNo("");
        setVerificationCollectionSequence("");
        setVerificationScheduledAmountMinor("");
        setActualCollectedAmountMinor("");
        setEvidenceReference("");
      }
    }
  };
  const decideVerification = async (
    collectionResult: "COLLECTED" | "PARTIALLY_COLLECTED" | "NOT_COLLECTED",
  ) => {
    if (!verificationApplicationNo) return;
    setRunningAction(true);
    setNotice("");
    const idempotencyKey =
      verificationIdempotencyKey.current ?? crypto.randomUUID();
    verificationIdempotencyKey.current = idempotencyKey;
    try {
      const response = await api(
        `/v1/local/applications/${encodeURIComponent(verificationApplicationNo)}/employer-finance-verification`,
        {
          method: "POST",
          headers: { "Idempotency-Key": idempotencyKey },
          body: JSON.stringify({
            collectionResult,
            reasonCode,
            collectionSequence:
              verificationCollectionSequence === ""
                ? undefined
                : verificationCollectionSequence,
            actualCollectedAmountMinor,
            evidenceReference,
          }),
        },
      );
      if (response.status === 401) return expireSession();
      const payload = (await response.json().catch(() => ({}))) as {
        code?: string;
        status?: string;
      };
      if (!response.ok) {
        setNotice(
          `${copy.blocked} (${response.status}): ${payload.code ?? copy.loadFailed}`,
        );
        return;
      }
      verificationIdempotencyKey.current = undefined;
      setNotice(`Recorded: ${payload.status ?? collectionResult}`);
      await loadVerificationQueue();
    } finally {
      setRunningAction(false);
    }
  };
  useEffect(() => {
    void loadVerificationQueue();
  }, [permitted]);
  const action = async (
    id: string,
    operation: "assign" | "match" | "difference" | "close",
  ) => {
    setRunningAction(true);
    setNotice("");
    try {
      const body =
        operation === "assign"
          ? { assigneeLoginName: assignee }
          : { reasonCode };
      const result = await financeReconciliationNotice(
        () =>
          api(`/v1/local/reconciliation/${id}/${operation}`, {
            method: "POST",
            body: JSON.stringify(body),
          }),
        copy,
      );
      if (result.sessionExpired) return expireSession();
      setNotice(result.notice);
      if (result.succeeded) {
        const response = await api("/v1/local/reconciliation/open");
        if (response.ok) setItems((await response.json()) as WorkItem[]);
      }
    } finally {
      setRunningAction(false);
    }
  };
  const logout = async () => {
    await api("/v1/local/auth/logout", { method: "POST" });
    setIdentity(undefined);
  };
  const updateLanguage = async (preferredLanguage: FinanceLanguage) => {
    const response = await api("/v1/local/auth/me/preferred-language", {
      method: "PATCH",
      body: JSON.stringify({ preferredLanguage }),
    });
    if (response.ok)
      setIdentity((current) =>
        current ? { ...current, preferredLanguage } : current,
      );
    else if (response.status === 401) expireSession();
  };
  if (checking) return <main style={layout}>{copy.checking}</main>;
  if (!identity) return <Login done={setIdentity} initialError={signInError} />;
  return (
    <main style={layout}>
      <header style={{ display: "flex", justifyContent: "space-between" }}>
        <div>
          <h1>{copy.title}</h1>
          <p>
            {copy.signedInAs}: {identity.loginName} ·{" "}
            <select
              value={identity.preferredLanguage}
              onChange={(e) =>
                void updateLanguage(e.target.value as FinanceLanguage)
              }
            >
              {Object.entries(FINANCE_LANGUAGE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </p>
        </div>
        <button onClick={logout}>{copy.signOut}</button>
      </header>
      <section style={panel}>
        {permitted ? (
          <>
            <section style={{ ...panel, marginTop: 0 }}>
              <h2>
                {language === "zh-CN"
                  ? "本工厂薪资核验"
                  : language === "km"
                    ? "ការផ្ទៀងផ្ទាត់ប្រាក់ខែរោងចក្រនេះ"
                    : "Factory salary verification"}
              </h2>
              <p>
                {language === "zh-CN"
                  ? "仅显示本工厂待办；不显示姓名、手机号或证件号码。"
                  : language === "km"
                    ? "បង្ហាញតែកិច្ចការរង់ចាំរបស់រោងចក្រនេះប៉ុណ្ណោះ។"
                    : "Only this factory's queued applications are shown; no name, phone number or document number is displayed."}
              </p>
              <button
                disabled={runningAction}
                onClick={() => void loadVerificationQueue()}
              >
                {language === "zh-CN"
                  ? "刷新待办"
                  : language === "km"
                    ? "ផ្ទុកកិច្ចការឡើងវិញ"
                    : "Refresh queue"}
              </button>
              <ul>
                {verificationItems.map((item) => (
                  <li key={item.applicationNo}>
                    <button onClick={() => selectVerificationItem(item)}>
                      {item.applicationNo} ·{" "}
                      {item.collectionSequence
                        ? `#${item.collectionSequence} · `
                        : ""}
                      {repaymentMethodLabel(item.selectedRepaymentMethod)} ·{" "}
                      {item.collectionScope ?? "—"} ·{" "}
                      {item.payrollDeductionAuthorized
                        ? language === "zh-CN"
                          ? "已授权代扣"
                          : language === "km"
                            ? "បានអនុញ្ញាតកាត់ប្រាក់"
                            : "Payroll authorized"
                        : language === "zh-CN"
                          ? "无需代扣授权"
                          : language === "km"
                            ? "មិនត្រូវការអនុញ្ញាតកាត់ប្រាក់"
                            : "No payroll authorization"}{" "}
                      {item.scheduledAmountMinor
                        ? `· USD ${item.scheduledAmountMinor} `
                        : ""}
                      · {new Date(item.createdAt).toLocaleDateString()}
                    </button>
                  </li>
                ))}
              </ul>
              {verificationApplicationNo ? (
                <section
                  style={{
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 8,
                    background: "#f8fafc",
                  }}
                >
                  <strong>
                    {language === "zh-CN"
                      ? "当前扣款待办"
                      : language === "km"
                        ? "កិច្ចការកាត់ប្រាក់បច្ចុប្បន្ន"
                        : "Selected collection case"}
                  </strong>
                  <div style={{ marginTop: 6 }}>
                    {verificationApplicationNo}
                    {verificationCollectionSequence !== ""
                      ? ` · #${verificationCollectionSequence}`
                      : ""}
                    {verificationScheduledAmountMinor
                      ? ` · USD ${verificationScheduledAmountMinor}`
                      : ""}
                  </div>
                </section>
              ) : null}
              <p style={{ marginTop: 10, color: "#555" }}>
                {language === "zh-CN"
                  ? "企业财务端只执行已授权的本息回收回填，不显示申请金额、期限、持牌机构编号或完整账单。"
                  : language === "km"
                    ? "ផ្នែកហិរញ្ញវត្ថុអនុវត្តតែការរាយការណ៍ប្រមូលប្រាក់ដើមនិងការប្រាក់ដែលបានអនុញ្ញាតប៉ុណ្ណោះ។"
                    : "Finance reports authorized principal-and-interest collection only. Loan amount, tenor, lender IDs and full bills stay hidden."}
              </p>
              <label>
                {language === "zh-CN"
                  ? "申请编号"
                  : language === "km"
                    ? "លេខពាក្យស្នើ"
                    : "Application number"}
                <input
                  value={verificationApplicationNo}
                  onChange={(event) => {
                    setVerificationApplicationNo(event.target.value);
                    setVerificationCollectionSequence("");
                    setVerificationScheduledAmountMinor("");
                  }}
                />
              </label>
              <label>
                {language === "zh-CN"
                  ? "实际扣款金额（minor）"
                  : language === "km"
                    ? "ចំនួនទឹកប្រាក់កាត់ពិតប្រាកដ (minor)"
                    : "Actual collected amount (minor)"}
                <input
                  value={actualCollectedAmountMinor}
                  onChange={(event) =>
                    setActualCollectedAmountMinor(event.target.value)
                  }
                />
              </label>
              <label>
                {language === "zh-CN"
                  ? "回填凭证引用"
                  : language === "km"
                    ? "ឯកសារយោងភស្តុតាង"
                    : "Evidence reference"}
                <input
                  value={evidenceReference}
                  onChange={(event) => setEvidenceReference(event.target.value)}
                />
              </label>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button
                  disabled={
                    !verificationApplicationNo ||
                    !actualCollectedAmountMinor ||
                    !evidenceReference ||
                    runningAction
                  }
                  onClick={() => void decideVerification("COLLECTED")}
                >
                  {language === "zh-CN"
                    ? "已扣"
                    : language === "km"
                      ? "បានកាត់"
                      : "Collected"}
                </button>
                <button
                  disabled={
                    !verificationApplicationNo ||
                    !actualCollectedAmountMinor ||
                    !evidenceReference ||
                    runningAction
                  }
                  onClick={() => void decideVerification("PARTIALLY_COLLECTED")}
                >
                  {language === "zh-CN"
                    ? "部分扣"
                    : language === "km"
                      ? "កាត់មួយផ្នែក"
                      : "Partially collected"}
                </button>
                <button
                  disabled={
                    !verificationApplicationNo ||
                    !actualCollectedAmountMinor ||
                    !evidenceReference ||
                    runningAction
                  }
                  onClick={() => void decideVerification("NOT_COLLECTED")}
                >
                  {language === "zh-CN"
                    ? "未扣"
                    : language === "km"
                      ? "មិនបានកាត់"
                      : "Not collected"}
                </button>
              </div>
            </section>
            <h2>{copy.queueTitle}</h2>
            <p>{copy.queueDescription}</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <label>
                {copy.assignee}
                <input
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  placeholder={copy.assigneePlaceholder}
                />
              </label>
              <label>
                {copy.reasonCode}
                <input
                  value={reasonCode}
                  onChange={(e) => setReasonCode(e.target.value)}
                />
              </label>
              <button disabled={runningAction} onClick={() => void load()}>
                {copy.loadQueue}
              </button>
            </div>
            <div style={{ overflowX: "auto", marginTop: 18 }}>
              <table>
                <thead>
                  <tr>
                    <th>{copy.application}</th>
                    <th>{copy.evidence}</th>
                    <th>{copy.status}</th>
                    <th>{copy.assigned}</th>
                    <th>{copy.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.application_no}</td>
                      <td>
                        {item.evidence_type}: {item.evidence_reference}
                      </td>
                      <td>{item.status}</td>
                      <td>{item.assigned_to_user_ref ?? "—"}</td>
                      <td style={{ display: "flex", gap: 6 }}>
                        <button
                          disabled={!assignee || runningAction}
                          onClick={() => void action(item.id, "assign")}
                        >
                          {copy.assign}
                        </button>
                        <button
                          disabled={runningAction}
                          onClick={() => void action(item.id, "match")}
                        >
                          {copy.match}
                        </button>
                        <button
                          disabled={runningAction}
                          onClick={() => void action(item.id, "difference")}
                        >
                          {copy.difference}
                        </button>
                        <button
                          disabled={runningAction}
                          onClick={() => void action(item.id, "close")}
                        >
                          {copy.close}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {notice ? (
              <pre role="status" style={{ whiteSpace: "pre-wrap" }}>
                {notice}
              </pre>
            ) : null}
          </>
        ) : (
          <>
            <h2>{copy.unavailable}</h2>
            <p>{copy.unavailableDescription}</p>
          </>
        )}
      </section>
    </main>
  );
}
