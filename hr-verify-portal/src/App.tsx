import { useEffect, useState, type FormEvent } from "react";
import { HR_COPY, HR_LANGUAGE_LABELS, type HrLanguage } from "./hr-copy";
import { hrVerificationNotice } from "./hr-verification-action";

type Identity = {
  loginName: string;
  preferredLanguage: HrLanguage;
  roles: string[];
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
  return fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
}

function Login({ done }: { done: (identity: Identity) => void }): JSX.Element {
  const [language, setLanguage] = useState<HrLanguage>("en");
  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
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
  const [reasonCode, setReasonCode] = useState(
    "EMPLOYMENT_AND_SALARY_RANGE_CONFIRMED",
  );
  const [notice, setNotice] = useState("");
  const [running, setRunning] = useState(false);
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
  const copy = HR_COPY[language];
  const route = identity?.roles.includes("EMPLOYER_HR")
    ? "employer-verification"
    : identity?.roles.includes("EMPLOYER_FINANCE")
      ? "employer-finance-verification"
      : undefined;
  const run = async (decision: "APPROVED" | "REJECTED" | "RETURNED") => {
    if (!route) return;
    setRunning(true);
    setNotice("");
    try {
      setNotice(
        await hrVerificationNotice(
          () =>
            api(
              `/v1/local/applications/${encodeURIComponent(applicationNo)}/${route}`,
              {
                method: "POST",
                body: JSON.stringify({ decision, reasonCode }),
              },
            ),
          copy,
        ),
      );
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
  };
  if (checking) return <main style={layout}>{copy.checking}</main>;
  if (!identity) return <Login done={setIdentity} />;
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
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button
                disabled={!applicationNo || running}
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
