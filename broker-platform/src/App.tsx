import { useEffect, useState, type FormEvent } from "react";
import { BROKER_COPY, LANGUAGE_LABELS } from "./broker-copy";

type Language = "zh-CN" | "en" | "km";
type Domain = "OPS" | "BROKER" | "LENDER" | "EMPLOYER";
type Identity = Readonly<{
  loginName: string;
  preferredLanguage: Language;
  roles: string[];
}>;
type PersonalProfileResponse = Readonly<{
  applicationNo: string;
  profile: { fullName: string; phone: string; employerName: string };
  consent: {
    personalDataVersion: string | null;
    personalDataConsentedAt: string | null;
    phoneVersion: string | null;
    phoneConsentedAt: string | null;
  };
}>;

const domains: Domain[] = ["OPS", "BROKER", "LENDER", "EMPLOYER"];
const shell = {
  maxWidth: 1080,
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
  const [language, setLanguage] = useState<Language>("en");
  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const response = await request("/v1/local/auth/login", {
        method: "POST",
        body: JSON.stringify({ loginName, password }),
      });
      if (!response.ok) return setError(BROKER_COPY[language].loginFailed);
      const me = await request("/v1/local/auth/me");
      if (!me.ok) return setError(BROKER_COPY[language].sessionFailed);
      let identity = (await me.json()) as Identity;
      if (identity.preferredLanguage !== language) {
        try {
          const preference = await request(
            "/v1/local/auth/me/preferred-language",
            {
              method: "PATCH",
              body: JSON.stringify({ preferredLanguage: language }),
            },
          );
          if (preference.ok) {
            identity = { ...identity, preferredLanguage: language };
          }
        } catch {
          // Language persistence is a user preference, not an authentication
          // prerequisite. Keep the authenticated session usable on a retry.
        }
      }
      onLogin(identity);
    } catch {
      setError(BROKER_COPY[language].sessionFailed);
    }
  };
  return (
    <main style={shell}>
      <section style={card}>
        <h1>{BROKER_COPY[language].title}</h1>
        <p>{BROKER_COPY[language].signInDescription}</p>
        <form onSubmit={submit} style={form}>
          <label>
            {BROKER_COPY[language].account}
            <input
              value={loginName}
              onChange={(e) => setLoginName(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            {BROKER_COPY[language].password}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <label>
            {BROKER_COPY[language].language}
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value as Language)}
            >
              {Object.entries(LANGUAGE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button>{BROKER_COPY[language].signIn}</button>
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
  const [reasonCode, setReasonCode] = useState("DOCUMENTS_COMPLETE");
  const [notice, setNotice] = useState("");
  const [personalProfile, setPersonalProfile] =
    useState<PersonalProfileResponse>();
  const [departments, setDepartments] = useState<unknown[]>([]);
  const [roles, setRoles] = useState<unknown[]>([]);
  const [department, setDepartment] = useState({
    domain: "BROKER" as Domain,
    code: "",
    zh: "",
    en: "",
    km: "",
  });
  const [role, setRole] = useState({
    domain: "BROKER" as Domain,
    code: "",
    zh: "",
    en: "",
    km: "",
  });
  const [account, setAccount] = useState({
    loginName: "",
    password: "",
    departmentCode: "",
    roleCodes: "",
    preferredLanguage: "zh-CN" as Language,
  });
  useEffect(() => {
    request("/v1/local/auth/me")
      .then(async (response) => {
        const payload = response.ok
          ? await response.json().catch(() => undefined)
          : undefined;
        if (payload) setIdentity(payload as Identity);
      })
      .finally(() => setChecking(false));
  }, []);
  const copy = BROKER_COPY[identity?.preferredLanguage ?? "en"];
  const logout = async () => {
    await request("/v1/local/auth/logout", { method: "POST" });
    setIdentity(undefined);
    setPersonalProfile(undefined);
  };
  const updateLanguage = async (preferredLanguage: Language) => {
    const response = await request("/v1/local/auth/me/preferred-language", {
      method: "PATCH",
      body: JSON.stringify({ preferredLanguage }),
    });
    if (response.ok)
      setIdentity((current) =>
        current ? { ...current, preferredLanguage } : current,
      );
  };
  const refreshDirectory = async () => {
    const [d, r] = await Promise.all([
      request("/v1/local/admin/departments"),
      request("/v1/local/admin/roles"),
    ]);
    if (d.ok) setDepartments((await d.json()) as unknown[]);
    if (r.ok) setRoles((await r.json()) as unknown[]);
  };
  const adminPost = async (path: string, body: object) => {
    const response = await request(path, {
      method: "POST",
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    setNotice(
      response.ok
        ? `${copy.recorded}: ${JSON.stringify(payload)}`
        : `${copy.blocked} (${response.status}): ${JSON.stringify(payload)}`,
    );
    if (response.ok) await refreshDirectory();
  };
  const review = async (decision: "APPROVED" | "RETURNED") => {
    const response = await request(
      `/v1/local/applications/${encodeURIComponent(applicationNo)}/broker-review`,
      { method: "POST", body: JSON.stringify({ decision, reasonCode }) },
    );
    const payload = await response.json().catch(() => ({}));
    setNotice(
      response.ok
        ? `${copy.recorded}: ${JSON.stringify(payload)}`
        : `${copy.blocked} (${response.status}): ${JSON.stringify(payload)}`,
    );
  };
  const loadPersonalProfile = async () => {
    setPersonalProfile(undefined);
    const response = await request(
      `/v1/local/applications/${encodeURIComponent(applicationNo)}/personal-profile`,
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setNotice(
        `${copy.profileUnavailable} (${response.status}): ${JSON.stringify(payload)}`,
      );
      return;
    }
    setPersonalProfile((await response.json()) as PersonalProfileResponse);
    setNotice(copy.profileAccessRecorded);
  };
  if (checking) return <main style={shell}>{copy.checkingSession}</main>;
  if (!identity) return <Login onLogin={setIdentity} />;
  const isBroker = identity.roles.includes("BROKER_OFFICER");
  const isAdmin = identity.roles.includes("OPS_ADMIN");
  return (
    <main style={shell}>
      <header
        style={{ display: "flex", justifyContent: "space-between", gap: 16 }}
      >
        <div>
          <h1>{copy.title}</h1>
          <p>
            {copy.signedInAs} {identity.loginName} · {copy.language}:{" "}
            <select
              value={identity.preferredLanguage}
              onChange={(e) => void updateLanguage(e.target.value as Language)}
            >
              {Object.entries(LANGUAGE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </p>
        </div>
        <button onClick={logout}>{copy.signOut}</button>
      </header>
      {isBroker ? (
        <section style={card}>
          <h2>{copy.reviewTitle}</h2>
          <div style={form}>
            <label>
              {copy.applicationNumber}
              <input
                value={applicationNo}
                onChange={(e) => {
                  setApplicationNo(e.target.value);
                  setPersonalProfile(undefined);
                }}
                placeholder="APP-…"
                required
              />
            </label>
            <label>
              {copy.reasonCode}
              <input
                value={reasonCode}
                onChange={(e) => setReasonCode(e.target.value)}
                required
              />
            </label>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                disabled={!applicationNo}
                onClick={() => void loadPersonalProfile()}
              >
                {copy.viewProfile}
              </button>
              <button
                disabled={!applicationNo}
                onClick={() => review("APPROVED")}
              >
                {copy.documentsComplete}
              </button>
              <button
                disabled={!applicationNo}
                onClick={() => review("RETURNED")}
              >
                {copy.requestSupplement}
              </button>
            </div>
            {personalProfile ? (
              <section
                aria-live="polite"
                style={{ ...card, marginTop: 0, background: "#f8fafc" }}
              >
                <h3>
                  {copy.applicantProfile} — {copy.accessLogged}
                </h3>
                <dl
                  style={{
                    display: "grid",
                    gridTemplateColumns: "max-content 1fr",
                    gap: 8,
                  }}
                >
                  <dt>{copy.fullName}</dt>
                  <dd>{personalProfile.profile.fullName}</dd>
                  <dt>{copy.phone}</dt>
                  <dd>{personalProfile.profile.phone}</dd>
                  <dt>{copy.employer}</dt>
                  <dd>{personalProfile.profile.employerName}</dd>
                  <dt>{copy.personalConsent}</dt>
                  <dd>
                    {personalProfile.consent.personalDataVersion ??
                      copy.notRecorded}
                  </dd>
                  <dt>{copy.phoneConsent}</dt>
                  <dd>
                    {personalProfile.consent.phoneVersion ?? copy.notRecorded}
                  </dd>
                </dl>
              </section>
            ) : null}
          </div>
        </section>
      ) : null}
      {isAdmin ? (
        <section style={card}>
          <h2>{copy.directoryTitle}</h2>
          <p>{copy.directoryDescription}</p>
          <button onClick={refreshDirectory}>{copy.refreshDirectory}</button>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 20,
              marginTop: 18,
            }}
          >
            <form
              style={form}
              onSubmit={(e) => {
                e.preventDefault();
                void adminPost("/v1/local/admin/departments", {
                  domain: department.domain,
                  code: department.code,
                  displayNameZh: department.zh,
                  displayNameEn: department.en,
                  displayNameKm: department.km,
                });
              }}
            >
              <h3>{copy.createDepartment}</h3>
              <label>
                {copy.domain}
                <select
                  value={department.domain}
                  onChange={(e) =>
                    setDepartment({
                      ...department,
                      domain: e.target.value as Domain,
                    })
                  }
                >
                  {domains.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label>
                {copy.code}
                <input
                  value={department.code}
                  onChange={(e) =>
                    setDepartment({
                      ...department,
                      code: e.target.value.toUpperCase(),
                    })
                  }
                  required
                />
              </label>
              <label>
                {copy.chineseName}
                <input
                  value={department.zh}
                  onChange={(e) =>
                    setDepartment({ ...department, zh: e.target.value })
                  }
                  required
                />
              </label>
              <label>
                {copy.englishName}
                <input
                  value={department.en}
                  onChange={(e) =>
                    setDepartment({ ...department, en: e.target.value })
                  }
                  required
                />
              </label>
              <label>
                {copy.khmerName}
                <input
                  value={department.km}
                  onChange={(e) =>
                    setDepartment({ ...department, km: e.target.value })
                  }
                  required
                />
              </label>
              <button>{copy.createDepartment}</button>
            </form>
            <form
              style={form}
              onSubmit={(e) => {
                e.preventDefault();
                void adminPost("/v1/local/admin/roles", {
                  domain: role.domain,
                  code: role.code,
                  displayNameZh: role.zh,
                  displayNameEn: role.en,
                  displayNameKm: role.km,
                });
              }}
            >
              <h3>{copy.createRole}</h3>
              <label>
                {copy.domain}
                <select
                  value={role.domain}
                  onChange={(e) =>
                    setRole({ ...role, domain: e.target.value as Domain })
                  }
                >
                  {domains.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label>
                {copy.code}
                <input
                  value={role.code}
                  onChange={(e) =>
                    setRole({ ...role, code: e.target.value.toUpperCase() })
                  }
                  required
                />
              </label>
              <label>
                {copy.chineseName}
                <input
                  value={role.zh}
                  onChange={(e) => setRole({ ...role, zh: e.target.value })}
                  required
                />
              </label>
              <label>
                {copy.englishName}
                <input
                  value={role.en}
                  onChange={(e) => setRole({ ...role, en: e.target.value })}
                  required
                />
              </label>
              <label>
                {copy.khmerName}
                <input
                  value={role.km}
                  onChange={(e) => setRole({ ...role, km: e.target.value })}
                  required
                />
              </label>
              <button>{copy.createRole}</button>
            </form>
            <form
              style={form}
              onSubmit={(e) => {
                e.preventDefault();
                void adminPost("/v1/local/admin/accounts", {
                  loginName: account.loginName,
                  password: account.password,
                  departmentCode: account.departmentCode,
                  roleCodes: account.roleCodes
                    .split(",")
                    .map((value) => value.trim())
                    .filter(Boolean),
                  preferredLanguage: account.preferredLanguage,
                });
              }}
            >
              <h3>{copy.createAccount}</h3>
              <label>
                {copy.loginName}
                <input
                  value={account.loginName}
                  onChange={(e) =>
                    setAccount({ ...account, loginName: e.target.value })
                  }
                  autoComplete="off"
                  required
                />
              </label>
              <label>
                {copy.temporaryPassword}
                <input
                  type="password"
                  value={account.password}
                  onChange={(e) =>
                    setAccount({ ...account, password: e.target.value })
                  }
                  minLength={16}
                  autoComplete="new-password"
                  required
                />
              </label>
              <label>
                {copy.departmentCode}
                <input
                  value={account.departmentCode}
                  onChange={(e) =>
                    setAccount({
                      ...account,
                      departmentCode: e.target.value.toUpperCase(),
                    })
                  }
                  required
                />
              </label>
              <label>
                {copy.roleCodes}
                <input
                  value={account.roleCodes}
                  onChange={(e) =>
                    setAccount({
                      ...account,
                      roleCodes: e.target.value.toUpperCase(),
                    })
                  }
                  required
                />
              </label>
              <label>
                {copy.defaultLanguage}
                <select
                  value={account.preferredLanguage}
                  onChange={(e) =>
                    setAccount({
                      ...account,
                      preferredLanguage: e.target.value as Language,
                    })
                  }
                >
                  {Object.entries(LANGUAGE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <button>{copy.createAccount}</button>
            </form>
          </div>
          <details style={{ marginTop: 18 }}>
            <summary>{copy.directoryData}</summary>
            <pre style={{ whiteSpace: "pre-wrap" }}>
              {JSON.stringify({ departments, roles }, null, 2)}
            </pre>
          </details>
        </section>
      ) : null}
      {!isBroker && !isAdmin ? (
        <section style={card}>
          <h2>{copy.unavailableTitle}</h2>
          <p>{copy.unavailableDescription}</p>
        </section>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
    </main>
  );
}
