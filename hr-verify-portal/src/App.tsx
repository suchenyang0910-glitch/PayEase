import { useEffect, useState, type FormEvent } from "react";

type Identity = {
  loginName: string;
  preferredLanguage: "zh-CN" | "en" | "km";
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
        <h1>Employer verification portal</h1>
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
  const [applicationNo, setApplicationNo] = useState("");
  const [reasonCode, setReasonCode] = useState(
    "EMPLOYMENT_AND_SALARY_RANGE_CONFIRMED",
  );
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
  if (checking) return <main style={layout}>Checking secure session…</main>;
  if (!identity) return <Login done={setIdentity} />;
  const route = identity.roles.includes("EMPLOYER_HR")
    ? "employer-verification"
    : identity.roles.includes("EMPLOYER_FINANCE")
      ? "employer-finance-verification"
      : undefined;
  const label =
    route === "employer-verification"
      ? "Confirm employment"
      : "Confirm authorised salary range";
  const run = async (decision: "APPROVED" | "REJECTED" | "RETURNED") => {
    if (!route) return;
    const response = await api(
      `/v1/local/applications/${encodeURIComponent(applicationNo)}/${route}`,
      { method: "POST", body: JSON.stringify({ decision, reasonCode }) },
    );
    const payload = await response.json().catch(() => ({}));
    setNotice(
      response.ok
        ? `Recorded: ${JSON.stringify(payload)}`
        : `Blocked (${response.status}): ${JSON.stringify(payload)}`,
    );
  };
  const logout = async () => {
    await api("/v1/local/auth/logout", { method: "POST" });
    setIdentity(undefined);
  };
  return (
    <main style={layout}>
      <header style={{ display: "flex", justifyContent: "space-between" }}>
        <div>
          <h1>Employer verification portal</h1>
          <p>
            {identity.loginName} · {identity.preferredLanguage}
          </p>
        </div>
        <button onClick={logout}>Sign out</button>
      </header>
      <section style={panel}>
        {route ? (
          <>
            <h2>{label}</h2>
            <p>
              Only employment status and the authorised salary range are
              recorded; no payroll document is sent to the broker.
            </p>
            <label>
              Application number
              <input
                value={applicationNo}
                onChange={(e) => setApplicationNo(e.target.value)}
                placeholder="APP-…"
              />
            </label>
            <label style={{ display: "block", marginTop: 10 }}>
              Reason code
              <input
                value={reasonCode}
                onChange={(e) => setReasonCode(e.target.value)}
              />
            </label>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button disabled={!applicationNo} onClick={() => run("APPROVED")}>
                Confirm
              </button>
              <button disabled={!applicationNo} onClick={() => run("RETURNED")}>
                Request correction
              </button>
              <button disabled={!applicationNo} onClick={() => run("REJECTED")}>
                Cannot verify
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
            <h2>Verification unavailable</h2>
            <p>Your account has no employer HR or finance verification role.</p>
          </>
        )}
      </section>
    </main>
  );
}
