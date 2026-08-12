import { useEffect, useState, type FormEvent } from "react";

type Identity = Readonly<{
  loginName: string;
  preferredLanguage: "zh-CN" | "en" | "km";
  roles: string[];
}>;

async function request(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
}

function Login({
  onLogin,
}: {
  onLogin: (identity: Identity) => void;
}): JSX.Element {
  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const response = await request("/v1/local/auth/login", {
      method: "POST",
      body: JSON.stringify({ loginName, password }),
    });
    if (!response.ok)
      return setError("Login failed. Check your account and password.");
    const identityResponse = await request("/v1/local/auth/me");
    if (!identityResponse.ok)
      return setError("Session could not be established.");
    onLogin((await identityResponse.json()) as Identity);
  };
  return (
    <main style={shell}>
      <section style={card}>
        <h1>PayEase broker console</h1>
        <p>Sign in to access controlled operations.</p>
        <form onSubmit={submit} style={form}>
          <label>
            Account
            <input
              value={loginName}
              onChange={(e) => setLoginName(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
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

const shell = {
  maxWidth: 960,
  margin: "0 auto",
  padding: 24,
  fontFamily: "system-ui, sans-serif",
} as const;
const card = {
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  padding: 24,
  marginTop: 24,
} as const;
const form = { display: "grid", gap: 12, maxWidth: 420 } as const;

export function App(): JSX.Element {
  const [identity, setIdentity] = useState<Identity>();
  const [checking, setChecking] = useState(true);
  const [applicationNo, setApplicationNo] = useState("");
  const [reasonCode, setReasonCode] = useState("DOCUMENTS_COMPLETE");
  const [notice, setNotice] = useState("");
  const [departments, setDepartments] = useState<unknown[]>([]);
  const [roles, setRoles] = useState<unknown[]>([]);

  useEffect(() => {
    request("/v1/local/auth/me")
      .then(async (response) => {
        if (response.ok) setIdentity((await response.json()) as Identity);
      })
      .finally(() => setChecking(false));
  }, []);

  const logout = async () => {
    await request("/v1/local/auth/logout", { method: "POST" });
    setIdentity(undefined);
  };
  const review = async (decision: "APPROVED" | "RETURNED") => {
    const response = await request(
      `/v1/local/applications/${encodeURIComponent(applicationNo)}/broker-review`,
      {
        method: "POST",
        body: JSON.stringify({ decision, reasonCode }),
      },
    );
    setNotice(
      response.ok
        ? `Recorded: ${((await response.json()) as { status: string }).status}`
        : `Action blocked: ${response.status}`,
    );
  };
  const loadDirectory = async () => {
    const [departmentResponse, roleResponse] = await Promise.all([
      request("/v1/local/admin/departments"),
      request("/v1/local/admin/roles"),
    ]);
    if (departmentResponse.ok)
      setDepartments((await departmentResponse.json()) as unknown[]);
    if (roleResponse.ok) setRoles((await roleResponse.json()) as unknown[]);
  };

  if (checking) return <main style={shell}>Checking secure session…</main>;
  if (!identity) return <Login onLogin={setIdentity} />;
  const isBroker = identity.roles.includes("BROKER_OFFICER");
  const isAdmin = identity.roles.includes("OPS_ADMIN");
  return (
    <main style={shell}>
      <header
        style={{ display: "flex", justifyContent: "space-between", gap: 16 }}
      >
        <div>
          <h1>PayEase broker console</h1>
          <p>
            Signed in as {identity.loginName} · language:{" "}
            {identity.preferredLanguage}
          </p>
        </div>
        <button onClick={logout}>Sign out</button>
      </header>
      {isBroker ? (
        <section style={card}>
          <h2>Document review and employer-verification handoff</h2>
          <div style={form}>
            <label>
              Application number
              <input
                value={applicationNo}
                onChange={(e) => setApplicationNo(e.target.value)}
                placeholder="APP-…"
                required
              />
            </label>
            <label>
              Reason code
              <input
                value={reasonCode}
                onChange={(e) => setReasonCode(e.target.value)}
                required
              />
            </label>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                disabled={!applicationNo}
                onClick={() => review("APPROVED")}
              >
                Documents complete
              </button>
              <button
                disabled={!applicationNo}
                onClick={() => review("RETURNED")}
              >
                Request supplement
              </button>
            </div>
          </div>
          {notice ? <p role="status">{notice}</p> : null}
        </section>
      ) : (
        <section style={card}>
          <h2>Broker operations unavailable</h2>
          <p>Your account does not hold the BROKER_OFFICER role.</p>
        </section>
      )}
      {isAdmin ? (
        <section style={card}>
          <h2>Platform directory</h2>
          <p>
            Departments, roles and accounts are restricted to platform
            administrators.
          </p>
          <button onClick={loadDirectory}>Load departments and roles</button>
          <pre style={{ whiteSpace: "pre-wrap" }}>
            {JSON.stringify({ departments, roles }, null, 2)}
          </pre>
        </section>
      ) : null}
    </main>
  );
}
