import { useEffect, useRef, useState, type FormEvent } from "react";
import { HR_COPY, HR_LANGUAGE_LABELS, type HrLanguage } from "./hr-copy";
import { requiresIdentityMatchBeforeApproval } from "./hr-identity-match-gate";
import { hrVerificationNotice } from "./hr-verification-action";
import { IDENTITY_RECORD_COPY } from "./identity-record-copy";

type Identity = {
  loginName: string;
  preferredLanguage: HrLanguage;
  roles: string[];
};
type VerificationQueueItem = {
  applicationNo: string;
  requestedAmountMinor: string;
  currency: string;
  tenorDays: number;
  stage: string;
  identityDocumentType: "NATIONAL_ID" | "PASSPORT" | null;
  identityMatchStatus: "PENDING" | "MATCHED" | "NOT_MATCHED";
};
const layout = {
  maxWidth: 900,
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
  const [language, setLanguage] = useState<HrLanguage>("en");
  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError);
  const copy = HR_COPY[language];
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
          // A preference retry must not discard an already authenticated
          // session. It is persisted on a later language update or login.
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
              onChange={(e) => setLanguage(e.target.value as HrLanguage)}
            >
              {Object.entries(HR_LANGUAGE_LABELS).map(([value, label]) => (
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
  const [checking, setChecking] = useState(true);
  const [applicationNo, setApplicationNo] = useState("");
  const [queue, setQueue] = useState<VerificationQueueItem[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [reasonCode, setReasonCode] = useState(
    "EMPLOYMENT_AND_SALARY_RANGE_CONFIRMED",
  );
  const [factoryRecordIdentityNumber, setFactoryRecordIdentityNumber] =
    useState("");
  const [notice, setNotice] = useState("");
  const [signInError, setSignInError] = useState("");
  const [running, setRunning] = useState(false);
  const verificationIdempotencyKey = useRef<string>();
  const identityMatchIdempotencyKey = useRef<string>();
  const route = identity?.roles.includes("EMPLOYER_HR")
    ? "employer-verification"
    : identity?.roles.includes("EMPLOYER_FINANCE")
      ? "employer-finance-verification"
      : undefined;
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
  const loadQueue = async () => {
    if (!route) return;
    setQueueLoading(true);
    try {
      const response = await api("/v1/local/employer/verifications/open");
      if (response.status === 401) {
        setSignInError(
          HR_COPY[identity?.preferredLanguage ?? "en"].sessionExpired,
        );
        setIdentity(undefined);
        return;
      }
      const payload = (await response.json().catch(() => undefined)) as
        { items?: VerificationQueueItem[] } | undefined;
      if (response.ok && Array.isArray(payload?.items)) setQueue(payload.items);
    } finally {
      setQueueLoading(false);
    }
  };
  useEffect(() => {
    void loadQueue();
  }, [route]);
  const language = identity?.preferredLanguage ?? "en";
  const copy = HR_COPY[language];
  const identityRecordCopy = IDENTITY_RECORD_COPY[language];
  const selectedVerification = queue.find(
    (item) => item.applicationNo === applicationNo,
  );
  const identityMatchRequired =
    requiresIdentityMatchBeforeApproval(selectedVerification);
  const run = async (decision: "APPROVED" | "REJECTED" | "RETURNED") => {
    if (!route) return;
    setRunning(true);
    setNotice("");
    const idempotencyKey =
      verificationIdempotencyKey.current ?? crypto.randomUUID();
    verificationIdempotencyKey.current = idempotencyKey;
    try {
      const result = await hrVerificationNotice(
        () =>
          api(
            `/v1/local/applications/${encodeURIComponent(applicationNo)}/${route}`,
            {
              method: "POST",
              body: JSON.stringify({ decision, reasonCode }),
              headers: { "Idempotency-Key": idempotencyKey },
            },
          ),
        copy,
      );
      if (result.sessionExpired) {
        setSignInError(copy.sessionExpired);
        setIdentity(undefined);
        return;
      }
      if (!result.deliveryUncertain)
        verificationIdempotencyKey.current = undefined;
      setNotice(result.notice);
      if (!result.deliveryUncertain) await loadQueue();
    } finally {
      setRunning(false);
    }
  };
  const recordIdentityMatch = async () => {
    if (!applicationNo) return;
    if (!factoryRecordIdentityNumber.trim()) {
      setNotice(identityRecordCopy.required);
      return;
    }
    setRunning(true);
    setNotice("");
    const idempotencyKey =
      identityMatchIdempotencyKey.current ?? crypto.randomUUID();
    identityMatchIdempotencyKey.current = idempotencyKey;
    try {
      const response = await api(
        `/v1/local/applications/${encodeURIComponent(applicationNo)}/employer-identity-match`,
        {
          method: "POST",
          body: JSON.stringify({
            identityDocumentNumber: factoryRecordIdentityNumber.trim(),
            reasonCode: "FACTORY_PERSONNEL_RECORD_COMPARISON",
          }),
          headers: { "Idempotency-Key": idempotencyKey },
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        setSignInError(copy.sessionExpired);
        setIdentity(undefined);
        return;
      }
      if (response.ok) {
        identityMatchIdempotencyKey.current = undefined;
        setNotice(JSON.stringify(payload));
        await loadQueue();
      } else {
        setNotice(JSON.stringify(payload));
      }
    } finally {
      setRunning(false);
    }
  };
  const logout = async () => {
    await api("/v1/local/auth/logout", { method: "POST" });
    setIdentity(undefined);
  };
  const updateLanguage = async (preferredLanguage: HrLanguage) => {
    const response = await api("/v1/local/auth/me/preferred-language", {
      method: "PATCH",
      body: JSON.stringify({ preferredLanguage }),
    });
    if (response.ok)
      setIdentity((current) =>
        current ? { ...current, preferredLanguage } : current,
      );
    else if (response.status === 401) {
      setSignInError(copy.sessionExpired);
      setIdentity(undefined);
    }
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
                void updateLanguage(e.target.value as HrLanguage)
              }
            >
              {Object.entries(HR_LANGUAGE_LABELS).map(([value, label]) => (
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
        {route ? (
          <>
            <h2>
              {route === "employer-verification"
                ? copy.confirmEmployment
                : copy.confirmSalaryRange}
            </h2>
            <p>{copy.privacyBoundary}</p>
            <div style={{ marginBottom: 14 }}>
              <strong>
                {language === "zh-CN"
                  ? "本工厂待办"
                  : language === "km"
                    ? "កិច្ចការរោងចក្រនេះ"
                    : "Factory verification queue"}
              </strong>
              <button
                style={{ marginLeft: 10 }}
                disabled={queueLoading}
                onClick={() => void loadQueue()}
              >
                {queueLoading
                  ? "…"
                  : language === "zh-CN"
                    ? "刷新"
                    : language === "km"
                      ? "ផ្ទុកឡើងវិញ"
                      : "Refresh"}
              </button>
              {queue.length ? (
                <ul>
                  {queue.map((item) => (
                    <li key={item.applicationNo}>
                      <button
                        onClick={() => setApplicationNo(item.applicationNo)}
                      >
                        {item.applicationNo} · {item.currency}{" "}
                        {item.requestedAmountMinor} · {item.tenorDays}d ·{" "}
                        {item.identityDocumentType ?? "—"} ·{" "}
                        {item.identityMatchStatus}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  {language === "zh-CN"
                    ? "暂无待办"
                    : language === "km"
                      ? "មិនមានកិច្ចការរង់ចាំ"
                      : "No open verification items."}
                </p>
              )}
            </div>
            <label>
              {copy.applicationNumber}
              <input
                value={applicationNo}
                onChange={(e) => setApplicationNo(e.target.value)}
                placeholder="APP-…"
              />
            </label>
            <label style={{ display: "block", marginTop: 10 }}>
              {copy.reasonCode}
              <input
                value={reasonCode}
                onChange={(e) => setReasonCode(e.target.value)}
              />
            </label>
            {identity.roles.includes("EMPLOYER_HR") ? (
              <label style={{ display: "block", marginTop: 10 }}>
                {identityRecordCopy.label}
                <input
                  value={factoryRecordIdentityNumber}
                  onChange={(event) =>
                    setFactoryRecordIdentityNumber(event.target.value)
                  }
                  autoComplete="off"
                  inputMode="text"
                />
              </label>
            ) : null}
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button
                hidden={!identity.roles.includes("EMPLOYER_HR")}
                aria-label={identityRecordCopy.action}
                style={{ fontSize: 0 }}
                disabled={!applicationNo || running}
                onClick={() => void recordIdentityMatch()}
              >
                <span style={{ fontSize: 14 }}>
                  {identityRecordCopy.action}
                </span>
                {language === "zh-CN"
                  ? "确认员工证件匹配"
                  : language === "km"
                    ? "បញ្ជាក់ការផ្គូផ្គងអត្តសញ្ញាណបុគ្គលិក"
                    : "Confirm employee identity match"}
              </button>
              <button
                hidden
                disabled={!applicationNo || running}
                onClick={() => void recordIdentityMatch()}
              >
                {language === "zh-CN"
                  ? "确认不匹配"
                  : language === "km"
                    ? "បញ្ជាក់ថាមិនផ្គូផ្គង"
                    : "Confirm not matched"}
              </button>
              <button
                disabled={!applicationNo || running || identityMatchRequired}
                onClick={() => void run("APPROVED")}
              >
                {copy.confirm}
              </button>
              <button
                disabled={!applicationNo || running}
                onClick={() => void run("RETURNED")}
              >
                {copy.requestCorrection}
              </button>
              <button
                disabled={!applicationNo || running}
                onClick={() => void run("REJECTED")}
              >
                {copy.cannotVerify}
              </button>
            </div>
            {identityMatchRequired ? (
              <p role="status">
                {language === "zh-CN"
                  ? "请先确认员工证件匹配，才可以通过核验。"
                  : language === "km"
                    ? "សូមបញ្ជាក់ការផ្គូផ្គងអត្តសញ្ញាណបុគ្គលិកជាមុនសិន មុនអនុម័តការផ្ទៀងផ្ទាត់។"
                    : "Confirm the employee identity match before approving this verification."}
              </p>
            ) : null}
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
