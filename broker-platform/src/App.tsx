import { useEffect, useState, type FormEvent } from "react";
import { BROKER_COPY, LANGUAGE_LABELS } from "./broker-copy";
import { brokerAdminActionResult } from "./broker-admin-action";
import {
  parseDirectoryAccounts,
  type DirectoryAccount,
} from "./broker-directory";
import { brokerProfileResult } from "./broker-profile-action";
import { brokerReviewNotice } from "./broker-review-action";

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

function isPersonalProfileResponse(
  payload: unknown,
): payload is PersonalProfileResponse {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as {
    applicationNo?: unknown;
    profile?: { fullName?: unknown; phone?: unknown; employerName?: unknown };
    consent?: unknown;
  };
  return (
    typeof candidate.applicationNo === "string" &&
    typeof candidate.profile?.fullName === "string" &&
    typeof candidate.profile?.phone === "string" &&
    typeof candidate.profile?.employerName === "string" &&
    Boolean(candidate.consent)
  );
}

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
  const [adminInProgress, setAdminInProgress] = useState(false);
  const [reviewInProgress, setReviewInProgress] = useState(false);
  const [personalProfile, setPersonalProfile] =
    useState<PersonalProfileResponse>();
  const [profileLoading, setProfileLoading] = useState(false);
  const [departments, setDepartments] = useState<unknown[]>([]);
  const [roles, setRoles] = useState<unknown[]>([]);
  const [accounts, setAccounts] = useState<DirectoryAccount[]>([]);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, string>>({});
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
    const [d, r, a] = await Promise.all([
      request("/v1/local/admin/departments"),
      request("/v1/local/admin/roles"),
      request("/v1/local/admin/accounts"),
    ]);
    if (d.ok) setDepartments((await d.json()) as unknown[]);
    if (r.ok) setRoles((await r.json()) as unknown[]);
    if (a.ok) {
      setAccounts(parseDirectoryAccounts(await a.json()));
      setRoleDrafts({});
    }
  };
  const adminRequest = async (
    path: string,
    method: "POST" | "PATCH" | "PUT",
    body: object,
  ) => {
    setAdminInProgress(true);
    setNotice("");
    try {
      const result = await brokerAdminActionResult(
        () =>
          request(path, {
            method,
            body: JSON.stringify(body),
          }),
        copy,
      );
      setNotice(result.notice);
      if (result.ok) await refreshDirectory().catch(() => undefined);
    } finally {
      setAdminInProgress(false);
    }
  };
  const adminPost = async (path: string, body: object) => {
    await adminRequest(path, "POST", body);
  };
  const setAccountActivity = async (loginName: string, isActive: boolean) => {
    if (
      !window.confirm(
        isActive ? copy.enableAccountConfirm : copy.disableAccountConfirm,
      )
    )
      return;
    await adminRequest(
      `/v1/local/admin/accounts/${encodeURIComponent(loginName)}/activity`,
      "PATCH",
      { isActive },
    );
  };
  const updateAccountRoles = async (entry: DirectoryAccount) => {
    const roleCodes = (roleDrafts[entry.loginName] ?? entry.roles.join(","))
      .split(",")
      .map((code) => code.trim())
      .filter(Boolean);
    if (!window.confirm(copy.updateRolesConfirm)) return;
    await adminRequest(
      `/v1/local/admin/accounts/${encodeURIComponent(entry.loginName)}/roles`,
      "PUT",
      { roleCodes },
    );
  };
  const review = async (decision: "APPROVED" | "RETURNED") => {
    setReviewInProgress(true);
    setNotice("");
    try {
      const result = await brokerReviewNotice(
        () =>
          request(
            `/v1/local/applications/${encodeURIComponent(applicationNo)}/broker-review`,
            { method: "POST", body: JSON.stringify({ decision, reasonCode }) },
          ),
        copy,
      );
      setNotice(result);
    } finally {
      setReviewInProgress(false);
    }
  };
  const loadPersonalProfile = async () => {
    setPersonalProfile(undefined);
    setNotice("");
    setProfileLoading(true);
    try {
      const result = await brokerProfileResult(
        () =>
          request(
            `/v1/local/applications/${encodeURIComponent(applicationNo)}/personal-profile`,
          ),
        copy,
      );
      if (isPersonalProfileResponse(result.payload)) {
        setPersonalProfile(result.payload);
      } else if (result.payload) {
        setNotice(`${copy.profileUnavailable}: ${copy.profileRequestFailed}`);
        return;
      }
      setNotice(result.notice);
    } finally {
      setProfileLoading(false);
    }
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
                disabled={!applicationNo || profileLoading}
                onClick={() => void loadPersonalProfile()}
              >
                {profileLoading ? "…" : copy.viewProfile}
              </button>
              <button
                disabled={!applicationNo || reviewInProgress}
                onClick={() => void review("APPROVED")}
              >
                {reviewInProgress ? "…" : copy.documentsComplete}
              </button>
              <button
                disabled={!applicationNo || reviewInProgress}
                onClick={() => void review("RETURNED")}
              >
                {reviewInProgress ? "…" : copy.requestSupplement}
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
              <button disabled={adminInProgress}>
                {adminInProgress ? "…" : copy.createDepartment}
              </button>
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
              <button disabled={adminInProgress}>
                {adminInProgress ? "…" : copy.createRole}
              </button>
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
              <button disabled={adminInProgress}>
                {adminInProgress ? "…" : copy.createAccount}
              </button>
            </form>
          </div>
          <details style={{ marginTop: 18 }}>
            <summary>{copy.directoryData}</summary>
            <pre style={{ whiteSpace: "pre-wrap" }}>
              {JSON.stringify({ departments, roles }, null, 2)}
            </pre>
          </details>
          <section style={{ ...card, marginTop: 18 }}>
            <h3>{copy.accountDirectory}</h3>
            <p>{accounts.length === 0 ? copy.notRecorded : null}</p>
            {accounts.map((entry) => (
              <div
                key={entry.loginName}
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "minmax(160px, 1fr) minmax(180px, 1fr) auto",
                  gap: 12,
                  alignItems: "center",
                  borderTop: "1px solid #e2e8f0",
                  padding: "10px 0",
                }}
              >
                <div>
                  <strong>{entry.loginName}</strong>
                  <div>
                    {entry.departmentCode} · {entry.roles.join(", ")}
                  </div>
                </div>
                <div>
                  <span>
                    {copy.accountStatus}:{" "}
                    {entry.isActive ? copy.accountActive : copy.accountInactive}
                  </span>
                  {entry.loginName !== identity.loginName ? (
                    <label style={{ display: "grid", gap: 4, marginTop: 6 }}>
                      {copy.roleCodes}
                      <input
                        value={
                          roleDrafts[entry.loginName] ?? entry.roles.join(",")
                        }
                        onChange={(event) =>
                          setRoleDrafts((current) => ({
                            ...current,
                            [entry.loginName]: event.target.value.toUpperCase(),
                          }))
                        }
                      />
                    </label>
                  ) : null}
                </div>
                {entry.loginName !== identity.loginName ? (
                  <div style={{ display: "grid", gap: 6 }}>
                    <button
                      disabled={adminInProgress}
                      onClick={() =>
                        void setAccountActivity(
                          entry.loginName,
                          !entry.isActive,
                        )
                      }
                    >
                      {entry.isActive
                        ? copy.disableAccount
                        : copy.enableAccount}
                    </button>
                    <button
                      disabled={adminInProgress}
                      onClick={() => void updateAccountRoles(entry)}
                    >
                      {copy.updateRoles}
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </section>
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
