import { useEffect, useState, type FormEvent } from "react";

type Identity = {
  loginName: string;
  preferredLanguage: "zh-CN" | "en" | "km";
  roles: string[];
};
type WorkItem = {
  id: string;
  application_no: string;
  evidence_type: string;
  evidence_reference: string;
  status: string;
  assigned_to_user_ref: string | null;
  resolution_reason: string | null;
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
  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const response = await api("/v1/local/auth/login", {
      method: "POST",
      body: JSON.stringify({ loginName, password }),
    });
    if (!response.ok) return setError("Login failed.");
    const me = await api("/v1/local/auth/me");
    if (!me.ok) return setError("Unable to establish session.");
    done((await me.json()) as Identity);
  };
  return (
    <main style={layout}>
      <section style={panel}>
        <h1>Employer finance reconciliation</h1>
        <form
          onSubmit={submit}
          style={{ display: "grid", gap: 10, maxWidth: 400 }}
        >
          <label>
            Account
            <input
              autoComplete="username"
              value={loginName}
              onChange={(e) => setLoginName(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button>Sign in</button>
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
  const load = async () => {
    const response = await api("/v1/local/reconciliation/open");
    if (!response.ok) return setNotice(`Load blocked: ${response.status}`);
    setItems((await response.json()) as WorkItem[]);
  };
  const action = async (
    id: string,
    operation: "assign" | "match" | "difference" | "close",
  ) => {
    const body =
      operation === "assign" ? { assigneeLoginName: assignee } : { reasonCode };
    const response = await api(`/v1/local/reconciliation/${id}/${operation}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    setNotice(
      response.ok
        ? `Recorded: ${JSON.stringify(payload)}`
        : `Blocked (${response.status}): ${JSON.stringify(payload)}`,
    );
    if (response.ok) await load();
  };
  if (checking) return <main style={layout}>Checking secure session…</main>;
  if (!identity) return <Login done={setIdentity} />;
  const permitted = identity.roles.includes("EMPLOYER_FINANCE");
  const logout = async () => {
    await api("/v1/local/auth/logout", { method: "POST" });
    setIdentity(undefined);
  };
  const updateLanguage = async (
    preferredLanguage: Identity["preferredLanguage"],
  ) => {
    const response = await api("/v1/local/auth/me/preferred-language", {
      method: "PATCH",
      body: JSON.stringify({ preferredLanguage }),
    });
    if (response.ok)
      setIdentity((current) =>
        current ? { ...current, preferredLanguage } : current,
      );
  };
  return (
    <main style={layout}>
      <header style={{ display: "flex", justifyContent: "space-between" }}>
        <div>
          <h1>Employer finance reconciliation</h1>
          <p>
            {identity.loginName} ·{" "}
            <select
              value={identity.preferredLanguage}
              onChange={(e) =>
                void updateLanguage(
                  e.target.value as Identity["preferredLanguage"],
                )
              }
            >
              <option value="zh-CN">中文</option>
              <option value="en">English</option>
              <option value="km">ខ្មែរ</option>
            </select>
          </p>
        </div>
        <button onClick={logout}>Sign out</button>
      </header>
      <section style={panel}>
        {permitted ? (
          <>
            <h2>Manual reconciliation work queue</h2>
            <p>
              Only assigned finance accounts can match, flag a difference, or
              close a work item.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <label>
                Assign to account
                <input
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  placeholder="finance.account"
                />
              </label>
              <label>
                Resolution reason
                <input
                  value={reasonCode}
                  onChange={(e) => setReasonCode(e.target.value)}
                />
              </label>
              <button onClick={load}>Load open queue</button>
            </div>
            <div style={{ overflowX: "auto", marginTop: 18 }}>
              <table>
                <thead>
                  <tr>
                    <th>Application</th>
                    <th>Evidence</th>
                    <th>Status</th>
                    <th>Assigned</th>
                    <th>Actions</th>
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
                          disabled={!assignee}
                          onClick={() => action(item.id, "assign")}
                        >
                          Assign
                        </button>
                        <button onClick={() => action(item.id, "match")}>
                          Match
                        </button>
                        <button onClick={() => action(item.id, "difference")}>
                          Difference
                        </button>
                        <button onClick={() => action(item.id, "close")}>
                          Close
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
            <h2>Reconciliation unavailable</h2>
            <p>Your account does not hold the EMPLOYER_FINANCE role.</p>
          </>
        )}
      </section>
    </main>
  );
}
