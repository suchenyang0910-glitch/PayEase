import { useEffect, useRef, useState, type FormEvent } from "react";
import { BROKER_COPY, LANGUAGE_LABELS } from "./broker-copy";
import { brokerAdminActionResult } from "./broker-admin-action";
import {
  parseDirectoryAccounts,
  type DirectoryAccount,
} from "./broker-directory";
import { brokerProfileResult } from "./broker-profile-action";
import { brokerReviewNotice } from "./broker-review-action";
import {
  brokerServiceCaseStatusLabel,
  brokerServiceCaseTypeLabel,
} from "./broker-service-case-label";
import {
  parseBrokerSupplementResponseDetail,
  parseBrokerSupplementResponseList,
  type BrokerSupplementResponseDetail,
  type BrokerSupplementResponseEntry,
} from "./broker-supplement-response";

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
type ServiceCaseQueueEntry = Readonly<{
  caseNo: string;
  applicationNo: string;
  caseType: "SERVICE_QUERY" | "COMPLAINT";
  status: "OPEN" | "ACKNOWLEDGED" | "REFERRED_TO_LENDER";
  applicantLanguage: Language;
  createdAt: string;
}>;
type ServiceCaseDetail = Readonly<
  ServiceCaseQueueEntry & {
    message: string;
  }
>;
type EmployerTenantMember = Readonly<{
  loginName: string;
  roleCodes: string[];
}>;

function isServiceCaseQueueResponse(
  payload: unknown,
): payload is { cases: ServiceCaseQueueEntry[] } {
  if (!payload || typeof payload !== "object") return false;
  const cases = (payload as { cases?: unknown }).cases;
  return (
    Array.isArray(cases) &&
    cases.every(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        typeof (entry as { caseNo?: unknown }).caseNo === "string" &&
        typeof (entry as { applicationNo?: unknown }).applicationNo ===
          "string",
    )
  );
}

function isServiceCaseDetail(payload: unknown): payload is ServiceCaseDetail {
  return (
    Boolean(payload) &&
    typeof payload === "object" &&
    typeof (payload as { caseNo?: unknown }).caseNo === "string" &&
    typeof (payload as { applicationNo?: unknown }).applicationNo ===
      "string" &&
    typeof (payload as { message?: unknown }).message === "string"
  );
}

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
  onLogin,
  initialError = "",
}: {
  onLogin: (identity: Identity) => void;
  initialError?: string;
}): JSX.Element {
  const [language, setLanguage] = useState<Language>("en");
  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError);
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
      // The account's saved language wins at sign-in. The login screen's
      // selector remains useful for a first-time operator and error copy, but
      // must never overwrite a returning operator's stored preference.
      onLogin((await me.json()) as Identity);
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
  const [signInError, setSignInError] = useState("");
  const [adminInProgress, setAdminInProgress] = useState(false);
  const [reviewInProgress, setReviewInProgress] = useState(false);
  const reviewIdempotencyKey = useRef<string>();
  const [personalProfile, setPersonalProfile] =
    useState<PersonalProfileResponse>();
  const [profileLoading, setProfileLoading] = useState(false);
  const [serviceCases, setServiceCases] = useState<ServiceCaseQueueEntry[]>([]);
  const [selectedServiceCase, setSelectedServiceCase] =
    useState<ServiceCaseDetail>();
  const [serviceCaseLoading, setServiceCaseLoading] = useState(false);
  const [supplementResponses, setSupplementResponses] = useState<
    BrokerSupplementResponseEntry[]
  >([]);
  const [supplementResponsesLoaded, setSupplementResponsesLoaded] =
    useState(false);
  const [selectedSupplementResponse, setSelectedSupplementResponse] =
    useState<BrokerSupplementResponseDetail>();
  const [supplementResponseLoading, setSupplementResponseLoading] =
    useState(false);
  const [departments, setDepartments] = useState<unknown[]>([]);
  const [roles, setRoles] = useState<unknown[]>([]);
  const [accounts, setAccounts] = useState<DirectoryAccount[]>([]);
  const [employerTenants, setEmployerTenants] = useState<
    Array<{
      id: string;
      externalRef: string;
      displayName: string;
      isActive: boolean;
    }>
  >([]);
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
  const [employerTenant, setEmployerTenant] = useState({
    externalRef: "",
    displayName: "",
  });
  const [tenantMember, setTenantMember] = useState({
    tenantId: "",
    loginName: "",
  });
  const [tenantMembers, setTenantMembers] = useState<EmployerTenantMember[]>(
    [],
  );
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
  const expireSession = () => {
    setPersonalProfile(undefined);
    setIdentity(undefined);
    setSignInError(copy.sessionExpired);
  };
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
    else if (response.status === 401) expireSession();
  };
  const refreshTenantMembers = async (tenantId = tenantMember.tenantId) => {
    if (!tenantId) {
      setTenantMembers([]);
      return;
    }
    const response = await request(
      `/v1/local/admin/employer-tenants/${encodeURIComponent(tenantId)}/members`,
    );
    if (response.status === 401) {
      expireSession();
      return;
    }
    if (!response.ok) return;
    const payload = (await response.json()) as {
      members?: EmployerTenantMember[];
    };
    setTenantMembers(Array.isArray(payload.members) ? payload.members : []);
  };
  const refreshDirectory = async () => {
    const [d, r, a, tenants] = await Promise.all([
      request("/v1/local/admin/departments"),
      request("/v1/local/admin/roles"),
      request("/v1/local/admin/accounts"),
      request("/v1/local/admin/employer-tenants"),
    ]);
    if (d.ok) setDepartments((await d.json()) as unknown[]);
    if (r.ok) setRoles((await r.json()) as unknown[]);
    if (a.ok) {
      setAccounts(parseDirectoryAccounts(await a.json()));
      setRoleDrafts({});
    }
    if (tenants.ok) {
      const payload = (await tenants.json()) as {
        tenants?: Array<{
          id: string;
          externalRef: string;
          displayName: string;
          isActive: boolean;
        }>;
      };
      if (Array.isArray(payload.tenants)) setEmployerTenants(payload.tenants);
    }
  };
  const adminRequest = async (
    path: string,
    method: "POST" | "PATCH" | "PUT" | "DELETE",
    body: object = {},
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
      if (result.sessionExpired) {
        expireSession();
        return;
      }
      setNotice(result.notice);
      if (result.ok) {
        await refreshDirectory().catch(() => undefined);
        await refreshTenantMembers().catch(() => undefined);
      }
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
    const idempotencyKey = reviewIdempotencyKey.current ?? crypto.randomUUID();
    reviewIdempotencyKey.current = idempotencyKey;
    try {
      const result = await brokerReviewNotice(
        () =>
          request(
            `/v1/local/applications/${encodeURIComponent(applicationNo)}/broker-review`,
            {
              method: "POST",
              body: JSON.stringify({ decision, reasonCode }),
              headers: { "Idempotency-Key": idempotencyKey },
            },
          ),
        copy,
      );
      if (result.sessionExpired) {
        expireSession();
        return;
      }
      if (!result.deliveryUncertain) reviewIdempotencyKey.current = undefined;
      setNotice(result.notice);
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
      if (result.sessionExpired) {
        expireSession();
        return;
      }
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
  const loadSupplementResponses = async () => {
    if (!applicationNo) return;
    setSupplementResponseLoading(true);
    setSelectedSupplementResponse(undefined);
    setNotice("");
    try {
      const response = await request(
        `/v1/local/applications/${encodeURIComponent(applicationNo)}/supplement-responses`,
      );
      if (response.status === 401) {
        expireSession();
        return;
      }
      const entries = parseBrokerSupplementResponseList(
        await response.json().catch(() => undefined),
      );
      if (!response.ok || !entries) {
        setNotice(copy.supplementResponseUnavailable);
        return;
      }
      setSupplementResponses(entries);
      setSupplementResponsesLoaded(true);
    } finally {
      setSupplementResponseLoading(false);
    }
  };
  const viewSupplementResponse = async (responseNo: string) => {
    setSupplementResponseLoading(true);
    setNotice("");
    try {
      const response = await request(
        `/v1/local/supplement-responses/${encodeURIComponent(responseNo)}`,
      );
      if (response.status === 401) {
        expireSession();
        return;
      }
      const detail = parseBrokerSupplementResponseDetail(
        await response.json().catch(() => undefined),
      );
      if (!response.ok || !detail) {
        setNotice(copy.supplementResponseDetailUnavailable);
        return;
      }
      setSelectedSupplementResponse(detail);
    } finally {
      setSupplementResponseLoading(false);
    }
  };
  const loadServiceCases = async () => {
    setServiceCaseLoading(true);
    setNotice("");
    try {
      const response = await request("/v1/local/service-cases/open");
      if (response.status === 401) {
        expireSession();
        return;
      }
      const payload: unknown = await response.json().catch(() => undefined);
      if (!response.ok || !isServiceCaseQueueResponse(payload)) {
        setNotice(
          identity?.preferredLanguage === "zh-CN"
            ? "暂时无法加载客服工单。"
            : identity?.preferredLanguage === "km"
              ? "មិនអាចផ្ទុកសំណើសេវាកម្មបានទេ។"
              : "Support cases are currently unavailable.",
        );
        return;
      }
      setServiceCases(payload.cases);
    } finally {
      setServiceCaseLoading(false);
    }
  };
  const viewServiceCase = async (caseNo: string) => {
    setServiceCaseLoading(true);
    setNotice("");
    try {
      const response = await request(
        `/v1/local/service-cases/${encodeURIComponent(caseNo)}`,
      );
      if (response.status === 401) {
        expireSession();
        return;
      }
      const payload: unknown = await response.json().catch(() => undefined);
      if (!response.ok || !isServiceCaseDetail(payload)) {
        setNotice(
          identity?.preferredLanguage === "zh-CN"
            ? "暂时无法读取工单详情。"
            : identity?.preferredLanguage === "km"
              ? "មិនអាចអានព័ត៌មានលម្អិតនៃសំណើបានទេ។"
              : "Support case details are currently unavailable.",
        );
        return;
      }
      setSelectedServiceCase(payload);
    } finally {
      setServiceCaseLoading(false);
    }
  };
  const referServiceCaseToLender = async (caseNo: string) => {
    setServiceCaseLoading(true);
    setNotice("");
    try {
      const response = await request(
        `/v1/local/service-cases/${encodeURIComponent(caseNo)}/refer-to-lender`,
        { method: "POST" },
      );
      if (response.status === 401) {
        expireSession();
        return;
      }
      if (!response.ok) {
        setNotice(
          identity?.preferredLanguage === "zh-CN"
            ? "工单暂时无法转交持牌机构。"
            : identity?.preferredLanguage === "km"
              ? "មិនអាចបញ្ជូនសំណើទៅស្ថាប័នមានអាជ្ញាប័ណ្ណបានទេ។"
              : "The case could not be referred to the licensed lender.",
        );
        return;
      }
      setSelectedServiceCase((current) =>
        current?.caseNo === caseNo
          ? { ...current, status: "REFERRED_TO_LENDER" }
          : current,
      );
      await loadServiceCases();
    } finally {
      setServiceCaseLoading(false);
    }
  };
  const acknowledgeServiceCase = async (caseNo: string) => {
    setServiceCaseLoading(true);
    setNotice("");
    try {
      const response = await request(
        `/v1/local/service-cases/${encodeURIComponent(caseNo)}/acknowledge`,
        { method: "POST" },
      );
      if (response.status === 401) {
        expireSession();
        return;
      }
      if (!response.ok) {
        setNotice(
          identity?.preferredLanguage === "zh-CN"
            ? "工单暂时无法受理。"
            : identity?.preferredLanguage === "km"
              ? "មិនអាចទទួលយកករណីនេះបានទេ។"
              : "The case could not be acknowledged.",
        );
        return;
      }
      setSelectedServiceCase((current) =>
        current?.caseNo === caseNo
          ? { ...current, status: "ACKNOWLEDGED" }
          : current,
      );
      await loadServiceCases();
    } finally {
      setServiceCaseLoading(false);
    }
  };
  if (checking) return <main style={shell}>{copy.checkingSession}</main>;
  if (!identity)
    return <Login onLogin={setIdentity} initialError={signInError} />;
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
                  setSupplementResponses([]);
                  setSupplementResponsesLoaded(false);
                  setSelectedSupplementResponse(undefined);
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
                disabled={!applicationNo || supplementResponseLoading}
                onClick={() => void loadSupplementResponses()}
              >
                {supplementResponseLoading ? "…" : copy.loadSupplementResponses}
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
            {supplementResponses.length > 0 ? (
              <section
                aria-live="polite"
                style={{ ...card, marginTop: 0, background: "#f8fafc" }}
              >
                <h3>{copy.supplementResponses}</h3>
                <ul>
                  {supplementResponses.map((response) => (
                    <li key={response.responseNo}>
                      <strong>{response.responseNo}</strong> ·{" "}
                      {copy.applicantLanguage}: {response.applicantLanguage} ·{" "}
                      {copy.submittedAt}: {response.submittedAt}{" "}
                      <button
                        disabled={supplementResponseLoading}
                        onClick={() =>
                          void viewSupplementResponse(response.responseNo)
                        }
                      >
                        {copy.viewSupplementResponse}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : applicationNo &&
              supplementResponsesLoaded &&
              !supplementResponseLoading ? (
              <p>{copy.noSupplementResponses}</p>
            ) : null}
            {selectedSupplementResponse ? (
              <section
                aria-live="polite"
                style={{ ...card, marginTop: 0, background: "#f8fafc" }}
              >
                <h3>{copy.supplementResponseContent}</h3>
                <p>
                  <strong>{selectedSupplementResponse.responseNo}</strong> ·{" "}
                  {selectedSupplementResponse.submittedAt}
                </p>
                <p style={{ whiteSpace: "pre-wrap" }}>
                  {selectedSupplementResponse.message}
                </p>
              </section>
            ) : null}
          </div>
        </section>
      ) : null}
      {isBroker ? (
        <section style={card} aria-label="Customer support case queue">
          <h2>
            {identity.preferredLanguage === "zh-CN"
              ? "客服与投诉工单"
              : identity.preferredLanguage === "km"
                ? "សំណើសេវាអតិថិជន និងបណ្តឹង"
                : "Customer support and complaints"}
          </h2>
          <p>
            {identity.preferredLanguage === "zh-CN"
              ? "仅可受理、说明状态并转交；投诉最终处理权属于持牌机构。"
              : identity.preferredLanguage === "km"
                ? "អាចទទួល សម្របសម្រួល និងបញ្ជូនប៉ុណ្ណោះ។ ស្ថាប័នមានអាជ្ញាប័ណ្ណទទួលខុសត្រូវលើលទ្ធផលចុងក្រោយ។"
                : "Broker staff may receive and refer cases only. The licensed lender owns the final complaint outcome."}
          </p>
          <button
            disabled={serviceCaseLoading}
            onClick={() => void loadServiceCases()}
          >
            {serviceCaseLoading
              ? "…"
              : identity.preferredLanguage === "zh-CN"
                ? "刷新待办"
                : identity.preferredLanguage === "km"
                  ? "ផ្ទុកឡើងវិញ"
                  : "Refresh queue"}
          </button>
          {serviceCases.length > 0 ? (
            <ul>
              {serviceCases.map((serviceCase) => (
                <li key={serviceCase.caseNo} style={{ marginTop: 10 }}>
                  <button
                    disabled={serviceCaseLoading}
                    onClick={() => void viewServiceCase(serviceCase.caseNo)}
                  >
                    {serviceCase.caseNo} ·{" "}
                    {brokerServiceCaseTypeLabel(
                      serviceCase.caseType,
                      identity.preferredLanguage,
                    )}{" "}
                    ·{" "}
                    {brokerServiceCaseStatusLabel(
                      serviceCase.status,
                      identity.preferredLanguage,
                    )}
                  </button>{" "}
                  <small>{serviceCase.applicationNo}</small>
                </li>
              ))}
            </ul>
          ) : null}
          {selectedServiceCase ? (
            <section style={{ ...card, marginTop: 16, background: "#f8fafc" }}>
              <h3>{selectedServiceCase.caseNo}</h3>
              <p>
                <strong>
                  {identity.preferredLanguage === "zh-CN"
                    ? "受理内容（访问已留痕）"
                    : identity.preferredLanguage === "km"
                      ? "ខ្លឹមសារសំណើ (ការចូលប្រើត្រូវបានកត់ត្រា)"
                      : "Case content (access is audited)"}
                </strong>
              </p>
              <p style={{ whiteSpace: "pre-wrap" }}>
                {selectedServiceCase.message}
              </p>
              {selectedServiceCase.status === "OPEN" ? (
                <button
                  disabled={serviceCaseLoading}
                  onClick={() =>
                    void acknowledgeServiceCase(selectedServiceCase.caseNo)
                  }
                >
                  {identity.preferredLanguage === "zh-CN"
                    ? "受理工单"
                    : identity.preferredLanguage === "km"
                      ? "ទទួលយកករណី"
                      : "Acknowledge case"}
                </button>
              ) : null}
              {selectedServiceCase.status === "OPEN" ||
              selectedServiceCase.status === "ACKNOWLEDGED" ? (
                <button
                  disabled={serviceCaseLoading}
                  onClick={() =>
                    void referServiceCaseToLender(selectedServiceCase.caseNo)
                  }
                >
                  {identity.preferredLanguage === "zh-CN"
                    ? "转交持牌机构"
                    : identity.preferredLanguage === "km"
                      ? "បញ្ជូនទៅស្ថាប័នមានអាជ្ញាប័ណ្ណ"
                      : "Refer to licensed lender"}
                </button>
              ) : selectedServiceCase.status === "REFERRED_TO_LENDER" ? (
                <p>
                  {identity.preferredLanguage === "zh-CN"
                    ? "已转交持牌机构处理。"
                    : identity.preferredLanguage === "km"
                      ? "បានបញ្ជូនទៅស្ថាប័នមានអាជ្ញាប័ណ្ណរួចហើយ។"
                      : "Referred to the licensed lender."}
                </p>
              ) : null}
            </section>
          ) : null}
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
            <form
              style={form}
              onSubmit={(event) => {
                event.preventDefault();
                void adminPost("/v1/local/admin/employer-tenants", {
                  externalRef: employerTenant.externalRef,
                  displayName: employerTenant.displayName,
                });
              }}
            >
              <h3>
                {identity.preferredLanguage === "zh-CN"
                  ? "创建工厂租户"
                  : identity.preferredLanguage === "km"
                    ? "បង្កើតអ្នកជួលរោងចក្រ"
                    : "Create factory tenant"}
              </h3>
              <label>
                {identity.preferredLanguage === "zh-CN"
                  ? "工厂代码"
                  : identity.preferredLanguage === "km"
                    ? "លេខកូដរោងចក្រ"
                    : "Factory code"}
                <input
                  value={employerTenant.externalRef}
                  onChange={(event) =>
                    setEmployerTenant({
                      ...employerTenant,
                      externalRef: event.target.value.toUpperCase(),
                    })
                  }
                  placeholder="LANHAI_FACTORY_A"
                  required
                />
              </label>
              <label>
                {identity.preferredLanguage === "zh-CN"
                  ? "工厂名称"
                  : identity.preferredLanguage === "km"
                    ? "ឈ្មោះរោងចក្រ"
                    : "Factory name"}
                <input
                  value={employerTenant.displayName}
                  onChange={(event) =>
                    setEmployerTenant({
                      ...employerTenant,
                      displayName: event.target.value,
                    })
                  }
                  required
                />
              </label>
              <button disabled={adminInProgress}>
                {identity.preferredLanguage === "zh-CN"
                  ? "创建工厂"
                  : identity.preferredLanguage === "km"
                    ? "បង្កើតរោងចក្រ"
                    : "Create factory"}
              </button>
            </form>
            <form
              style={form}
              onSubmit={(event) => {
                event.preventDefault();
                if (!tenantMember.tenantId || !tenantMember.loginName) return;
                void adminRequest(
                  `/v1/local/admin/employer-tenants/${encodeURIComponent(tenantMember.tenantId)}/members/${encodeURIComponent(tenantMember.loginName)}`,
                  "PUT",
                  {},
                );
              }}
            >
              <h3>
                {identity.preferredLanguage === "zh-CN"
                  ? "授权工厂 HR/财务账号"
                  : identity.preferredLanguage === "km"
                    ? "ផ្តល់សិទ្ធិគណនី HR/ហិរញ្ញវត្ថុ"
                    : "Authorize factory HR/finance account"}
              </h3>
              <label>
                {identity.preferredLanguage === "zh-CN"
                  ? "工厂"
                  : identity.preferredLanguage === "km"
                    ? "រោងចក្រ"
                    : "Factory"}
                <select
                  value={tenantMember.tenantId}
                  onChange={(event) =>
                    (() => {
                      const tenantId = event.target.value;
                      setTenantMember({
                        ...tenantMember,
                        tenantId,
                      });
                      void refreshTenantMembers(tenantId);
                    })()
                  }
                  required
                >
                  <option value="">—</option>
                  {employerTenants
                    .filter((tenant) => tenant.isActive)
                    .map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.displayName} ({tenant.externalRef})
                      </option>
                    ))}
                </select>
              </label>
              <label>
                {identity.preferredLanguage === "zh-CN"
                  ? "企业账号"
                  : identity.preferredLanguage === "km"
                    ? "គណនីក្រុមហ៊ុន"
                    : "Employer account"}
                <input
                  value={tenantMember.loginName}
                  onChange={(event) =>
                    setTenantMember({
                      ...tenantMember,
                      loginName: event.target.value,
                    })
                  }
                  required
                />
              </label>
              <button disabled={adminInProgress}>
                {identity.preferredLanguage === "zh-CN"
                  ? "授予访问"
                  : identity.preferredLanguage === "km"
                    ? "ផ្តល់សិទ្ធិ"
                    : "Grant access"}
              </button>
            </form>
            {tenantMember.tenantId ? (
              <section style={{ ...card, marginTop: 0 }}>
                <h3>
                  {identity.preferredLanguage === "zh-CN"
                    ? "已授权工厂账号"
                    : identity.preferredLanguage === "km"
                      ? "គណនីដែលបានអនុញ្ញាតសម្រាប់រោងចក្រ"
                      : "Authorized factory accounts"}
                </h3>
                <p>
                  {identity.preferredLanguage === "zh-CN"
                    ? "仅显示后台账号和角色；不显示员工申请或证件资料。"
                    : identity.preferredLanguage === "km"
                      ? "បង្ហាញតែគណនីផ្ទៃក្នុង និងតួនាទី មិនបង្ហាញព័ត៌មានស្នើសុំ ឬឯកសារអត្តសញ្ញាណទេ។"
                      : "Only back-office accounts and roles are shown; applicant and identity data are never displayed."}
                </p>
                {tenantMembers.length === 0 ? (
                  <p>
                    {identity.preferredLanguage === "zh-CN"
                      ? "暂无授权账号"
                      : identity.preferredLanguage === "km"
                        ? "មិនទាន់មានគណនីដែលបានអនុញ្ញាត"
                        : "No authorized accounts."}
                  </p>
                ) : (
                  tenantMembers.map((member) => (
                    <div
                      key={member.loginName}
                      style={{
                        display: "flex",
                        gap: 12,
                        alignItems: "center",
                        marginTop: 8,
                      }}
                    >
                      <span>
                        {member.loginName} ({member.roleCodes.join(", ")})
                      </span>
                      <button
                        type="button"
                        disabled={adminInProgress}
                        onClick={() => {
                          if (
                            !window.confirm(
                              identity.preferredLanguage === "zh-CN"
                                ? `撤销 ${member.loginName} 的工厂访问权限？`
                                : identity.preferredLanguage === "km"
                                  ? `ដកសិទ្ធិចូលរោងចក្ររបស់ ${member.loginName}?`
                                  : `Revoke factory access for ${member.loginName}?`,
                            )
                          )
                            return;
                          void adminRequest(
                            `/v1/local/admin/employer-tenants/${encodeURIComponent(tenantMember.tenantId)}/members/${encodeURIComponent(member.loginName)}`,
                            "DELETE",
                          );
                        }}
                      >
                        {identity.preferredLanguage === "zh-CN"
                          ? "撤销访问"
                          : identity.preferredLanguage === "km"
                            ? "ដកសិទ្ធិចូល"
                            : "Revoke access"}
                      </button>
                    </div>
                  ))
                )}
              </section>
            ) : null}
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
