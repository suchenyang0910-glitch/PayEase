import { useEffect, useState, type FormEvent } from "react";

type Identity = {
  loginName: string;
  preferredLanguage: "zh-CN" | "en" | "km";
  roles: string[];
};
const shell = {
  maxWidth: 960,
  margin: "0 auto",
  padding: 24,
  fontFamily: "system-ui, sans-serif",
} as const;
const card = {
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  padding: 20,
  marginTop: 20,
} as const;
const form = { display: "grid", gap: 10, maxWidth: 520 } as const;

async function api(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
}

function SignIn({
  complete,
}: {
  complete: (identity: Identity) => void;
}): JSX.Element {
  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const login = await api("/v1/local/auth/login", {
      method: "POST",
      body: JSON.stringify({ loginName, password }),
    });
    if (!login.ok) return setError("Login failed.");
    const me = await api("/v1/local/auth/me");
    if (!me.ok) return setError("Unable to establish session.");
    complete((await me.json()) as Identity);
  };
  return (
    <main style={shell}>
      <section style={card}>
        <h1>PayEase lender console</h1>
        <form onSubmit={submit} style={form}>
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

type Action = {
  label: string;
  route: string;
  body: () => object;
  roles: string[];
};

export function App(): JSX.Element {
  const [identity, setIdentity] = useState<Identity>();
  const [checking, setChecking] = useState(true);
  const [applicationNo, setApplicationNo] = useState("");
  const [reasonCode, setReasonCode] = useState("MANUAL_APPROVAL");
  const [approvedAmountMinor, setApprovedAmountMinor] = useState("5000");
  const [serviceFeeMinor, setServiceFeeMinor] = useState("0");
  const [totalRepayableMinor, setTotalRepayableMinor] = useState("5000");
  const [installmentCount, setInstallmentCount] = useState("1");
  const [firstDueDate, setFirstDueDate] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("MANUAL-RECEIPT-");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    api("/v1/local/auth/me")
      .then(async (r) => {
        if (r.ok) setIdentity((await r.json()) as Identity);
      })
      .finally(() => setChecking(false));
  }, []);
  if (checking) return <main style={shell}>Checking secure session…</main>;
  if (!identity) return <SignIn complete={setIdentity} />;
  const actions: Action[] = [
    {
      label: "Approve / return initial review",
      route: "lender-initial-review",
      body: () => ({ decision: "APPROVED", reasonCode }),
      roles: ["LENDER_CREDIT_OFFICER"],
    },
    {
      label: "Approve / return final review",
      route: "lender-final-review",
      body: () => ({
        decision: "APPROVED",
        reasonCode,
        approvedAmountMinor,
        serviceFeeMinor,
        totalRepayableMinor,
        installmentCount: Number(installmentCount),
        firstDueDate,
      }),
      roles: ["LENDER_CREDIT_REVIEWER"],
    },
    {
      label: "Confirm contract",
      route: "contract-confirmation",
      body: () => ({ evidenceReference }),
      roles: ["LENDER_CONTRACT_OFFICER"],
    },
    {
      label: "Open disbursement",
      route: "open-disbursement",
      body: () => ({ reasonCode }),
      roles: ["LENDER_DISBURSEMENT_MAKER"],
    },
    {
      label: "Record disbursement maker approval",
      route: "disbursement-release",
      body: () => ({ reasonCode }),
      roles: ["LENDER_DISBURSEMENT_MAKER"],
    },
    {
      label: "Confirm disbursement (different account)",
      route: "disbursement-confirmation",
      body: () => ({ reasonCode, evidenceReference }),
      roles: ["LENDER_DISBURSEMENT_CHECKER"],
    },
    {
      label: "Activate repayment",
      route: "activate-repayment",
      body: () => ({ reasonCode }),
      roles: ["LENDER_REPAYMENT_MAKER"],
    },
    {
      label: "Record repayment maker approval",
      route: "repayment-write-off",
      body: () => ({ reasonCode }),
      roles: ["LENDER_REPAYMENT_MAKER"],
    },
    {
      label: "Confirm repayment (different account)",
      route: "repayment-confirmation",
      body: () => ({ reasonCode, evidenceReference }),
      roles: ["LENDER_REPAYMENT_CHECKER"],
    },
  ];
  const available = actions.filter((item) =>
    item.roles.some((role) => identity.roles.includes(role)),
  );
  const run = async (action: Action) => {
    const response = await api(
      `/v1/local/applications/${encodeURIComponent(applicationNo)}/${action.route}`,
      { method: "POST", body: JSON.stringify(action.body()) },
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
    <main style={shell}>
      <header
        style={{ display: "flex", justifyContent: "space-between", gap: 12 }}
      >
        <div>
          <h1>PayEase lender console</h1>
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
      <section style={card}>
        <h2>Controlled manual approval</h2>
        <p>
          Each action is permitted only to the server-side roles assigned to
          this account. Disbursement and repayment require two different
          accounts.
        </p>
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
          {identity.roles.includes("LENDER_CREDIT_REVIEWER") ? (
            <>
              <label>
                Approved amount (USD cents; 1000–50000)
                <input
                  inputMode="numeric"
                  value={approvedAmountMinor}
                  onChange={(event) =>
                    setApprovedAmountMinor(event.target.value)
                  }
                  required
                />
              </label>
              <label>
                Service fee (USD cents; may be 0)
                <input
                  inputMode="numeric"
                  value={serviceFeeMinor}
                  onChange={(event) => setServiceFeeMinor(event.target.value)}
                  required
                />
              </label>
              <label>
                Total repayable (USD cents; principal + all approved charges)
                <input
                  inputMode="numeric"
                  value={totalRepayableMinor}
                  onChange={(event) =>
                    setTotalRepayableMinor(event.target.value)
                  }
                  required
                />
              </label>
              <label>
                Installments (1–6)
                <input
                  inputMode="numeric"
                  value={installmentCount}
                  onChange={(event) => setInstallmentCount(event.target.value)}
                  required
                />
              </label>
              <label>
                First repayment due date
                <input
                  type="date"
                  value={firstDueDate}
                  onChange={(event) => setFirstDueDate(event.target.value)}
                  required
                />
              </label>
            </>
          ) : null}
          <label>
            Contract / funds evidence reference
            <input
              value={evidenceReference}
              onChange={(e) => setEvidenceReference(e.target.value)}
              required
            />
          </label>
        </div>
        <div
          style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}
        >
          {available.map((action) => (
            <button
              key={action.route}
              disabled={!applicationNo}
              onClick={() => run(action)}
            >
              {action.label}
            </button>
          ))}
        </div>
        {available.length === 0 ? (
          <p>Your account has no lender-operation role.</p>
        ) : null}
        {notice ? (
          <pre role="status" style={{ whiteSpace: "pre-wrap" }}>
            {notice}
          </pre>
        ) : null}
      </section>
    </main>
  );
}
