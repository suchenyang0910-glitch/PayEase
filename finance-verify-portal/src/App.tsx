import { useEffect, useState, type FormEvent } from "react";
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
  return fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
}

function Login({ done }: { done: (identity: Identity) => void }): JSX.Element {
  const [language, setLanguage] = useState<FinanceLanguage>("en");
  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
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
  const [checking, setChecking] = useState(true);
  const [items, setItems] = useState<WorkItem[]>([]);
  const [assignee, setAssignee] = useState("");
  const [reasonCode, setReasonCode] = useState("MANUAL_EVIDENCE_MATCHED");
  const [notice, setNotice] = useState("");
  const [runningAction, setRunningAction] = useState(false);
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
  const load = async () => {
    setRunningAction(true);
    setNotice("");
    try {
      const response = await api("/v1/local/reconciliation/open");
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
