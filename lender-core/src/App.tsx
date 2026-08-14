import { useEffect, useState, type FormEvent } from "react";
import {
  finalReviewPayload,
  hasValidFinalReviewTerms,
  type ReviewDecision,
} from "./review-payload.ts";
import { lenderActionNotice } from "./lender-action.ts";
import {
  LENDER_COPY,
  type LenderActionKey,
  type LenderLanguage,
} from "./lender-copy.ts";

type Identity = {
  loginName: string;
  preferredLanguage: "zh-CN" | "en" | "km";
  roles: string[];
};
type ReferredServiceCase = Readonly<{
  caseNo: string;
  applicationNo: string;
  caseType: "SERVICE_QUERY" | "COMPLAINT";
  applicantLanguage: LenderLanguage;
  referredToLenderAt: string;
}>;
type ServiceCaseDetail = Readonly<
  ReferredServiceCase & {
    status: "OPEN" | "ACKNOWLEDGED" | "REFERRED_TO_LENDER" | "RESOLVED";
    message: string;
  }
>;

function isReferredServiceCaseQueue(
  payload: unknown,
): payload is { cases: ReferredServiceCase[] } {
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
    typeof (payload as { message?: unknown }).message === "string" &&
    typeof (payload as { status?: unknown }).status === "string"
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
  padding: 20,
  marginTop: 20,
} as const;
const form = { display: "grid", gap: 10, maxWidth: 520 } as const;

async function api(path: string, init?: RequestInit): Promise<Response> {
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

function SignIn({
  complete,
  initialError = "",
}: {
  complete: (identity: Identity) => void;
  initialError?: string;
}): JSX.Element {
  const [language, setLanguage] = useState<LenderLanguage>("en");
  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError);
  const copy = LENDER_COPY[language];
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const login = await api("/v1/local/auth/login", {
        method: "POST",
        body: JSON.stringify({ loginName, password }),
      });
      if (!login.ok) return setError(copy.loginFailed);
      const me = await api("/v1/local/auth/me");
      if (!me.ok) return setError(copy.sessionFailed);
      // Do not overwrite the language a returning lender operator selected in
      // their last authenticated session. They can change it after sign-in,
      // where the explicit account preference update is still persisted.
      complete((await me.json()) as Identity);
    } catch {
      setError(copy.sessionFailed);
    }
  };
  return (
    <main style={shell}>
      <section style={card}>
        <h1>{copy.title}</h1>
        <p>{copy.signInDescription}</p>
        <form onSubmit={submit} style={form}>
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
            {language === "en"
              ? "Language"
              : language === "zh-CN"
                ? "语言"
                : "ភាសា"}
            <select
              value={language}
              onChange={(event) =>
                setLanguage(event.target.value as LenderLanguage)
              }
            >
              <option value="en">English</option>
              <option value="zh-CN">中文</option>
              <option value="km">ខ្មែរ</option>
            </select>
          </label>
          <button>{copy.signIn}</button>
          {error ? <p role="alert">{error}</p> : null}
        </form>
      </section>
    </main>
  );
}

type Action = {
  labelKey: LenderActionKey;
  route: string;
  body: () => object;
  roles: string[];
};

const actionsRequiringIdempotency = new Set([
  "disbursement-release",
  "disbursement-confirmation",
  "repayment-write-off",
  "repayment-confirmation",
]);

export function App(): JSX.Element {
  const [identity, setIdentity] = useState<Identity>();
  const [checking, setChecking] = useState(true);
  const [applicationNo, setApplicationNo] = useState("");
  const [reasonCode, setReasonCode] = useState("MANUAL_APPROVAL");
  const [reviewDecision, setReviewDecision] =
    useState<ReviewDecision>("APPROVED");
  const [approvedAmountMinor, setApprovedAmountMinor] = useState("5000");
  const [serviceFeeMinor, setServiceFeeMinor] = useState("0");
  const [totalRepayableMinor, setTotalRepayableMinor] = useState("5000");
  const [installmentCount, setInstallmentCount] = useState("1");
  const [firstDueDate, setFirstDueDate] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("MANUAL-RECEIPT-");
  const [notice, setNotice] = useState("");
  const [signInError, setSignInError] = useState("");
  const [runningAction, setRunningAction] = useState<string>();
  const [pendingIdempotencyKeys, setPendingIdempotencyKeys] = useState<
    Record<string, string>
  >({});
  const [referredServiceCases, setReferredServiceCases] = useState<
    ReferredServiceCase[]
  >([]);
  const [selectedServiceCase, setSelectedServiceCase] =
    useState<ServiceCaseDetail>();
  const [serviceCaseReasonCode, setServiceCaseReasonCode] = useState(
    "LENDER_RESPONSE_RECORDED",
  );
  const [serviceCaseBusy, setServiceCaseBusy] = useState(false);
  const [serviceCaseNotice, setServiceCaseNotice] = useState("");
  useEffect(() => {
    api("/v1/local/auth/me")
      .then(async (r) => {
        if (r.ok) setIdentity((await r.json()) as Identity);
      })
      .finally(() => setChecking(false));
  }, []);
  if (checking) return <main style={shell}>{LENDER_COPY.en.checking}</main>;
  if (!identity)
    return <SignIn complete={setIdentity} initialError={signInError} />;
  const copy = LENDER_COPY[identity.preferredLanguage];
  const finalTermsValid = hasValidFinalReviewTerms({
    approvedAmountMinor,
    serviceFeeMinor,
    totalRepayableMinor,
    installmentCount: Number(installmentCount),
    firstDueDate,
  });
  const actions: Action[] = [
    {
      labelKey: "initialReview",
      route: "lender-initial-review",
      body: () => ({ decision: reviewDecision, reasonCode }),
      roles: ["LENDER_CREDIT_OFFICER"],
    },
    {
      labelKey: "finalReview",
      route: "lender-final-review",
      body: () =>
        finalReviewPayload(reviewDecision, reasonCode, {
          approvedAmountMinor,
          serviceFeeMinor,
          totalRepayableMinor,
          installmentCount: Number(installmentCount),
          firstDueDate,
        }),
      roles: ["LENDER_CREDIT_REVIEWER"],
    },
    {
      labelKey: "resolveReapplication",
      route: "reapplication-condition-resolved",
      body: () => ({ reasonCode }),
      roles: ["LENDER_CREDIT_OFFICER"],
    },
    {
      labelKey: "confirmContract",
      route: "contract-confirmation",
      body: () => ({ evidenceReference }),
      roles: ["LENDER_CONTRACT_OFFICER"],
    },
    {
      labelKey: "openDisbursement",
      route: "open-disbursement",
      body: () => ({ reasonCode }),
      roles: ["LENDER_DISBURSEMENT_MAKER"],
    },
    {
      labelKey: "disbursementMaker",
      route: "disbursement-release",
      body: () => ({ reasonCode }),
      roles: ["LENDER_DISBURSEMENT_MAKER"],
    },
    {
      labelKey: "disbursementChecker",
      route: "disbursement-confirmation",
      body: () => ({ reasonCode, evidenceReference }),
      roles: ["LENDER_DISBURSEMENT_CHECKER"],
    },
    {
      labelKey: "activateRepayment",
      route: "activate-repayment",
      body: () => ({ reasonCode }),
      roles: ["LENDER_REPAYMENT_MAKER"],
    },
    {
      labelKey: "repaymentMaker",
      route: "repayment-write-off",
      body: () => ({ reasonCode }),
      roles: ["LENDER_REPAYMENT_MAKER"],
    },
    {
      labelKey: "repaymentChecker",
      route: "repayment-confirmation",
      body: () => ({ reasonCode, evidenceReference }),
      roles: ["LENDER_REPAYMENT_CHECKER"],
    },
  ];
  const available = actions.filter((item) =>
    item.roles.some((role) => identity.roles.includes(role)),
  );
  const run = async (action: Action) => {
    setRunningAction(action.route);
    setNotice("");
    try {
      const idempotencyKey = actionsRequiringIdempotency.has(action.route)
        ? (pendingIdempotencyKeys[action.route] ?? crypto.randomUUID())
        : undefined;
      if (idempotencyKey && !pendingIdempotencyKeys[action.route]) {
        setPendingIdempotencyKeys((current) => ({
          ...current,
          [action.route]: idempotencyKey,
        }));
      }
      const idempotencyHeaders: HeadersInit | undefined = idempotencyKey
        ? { "Idempotency-Key": idempotencyKey }
        : undefined;
      const result = await lenderActionNotice(
        () =>
          api(
            `/v1/local/applications/${encodeURIComponent(applicationNo)}/${action.route}`,
            {
              method: "POST",
              body: JSON.stringify(action.body()),
              headers: idempotencyHeaders,
            },
          ),
        copy,
      );
      if (idempotencyKey && !result.deliveryUncertain) {
        setPendingIdempotencyKeys((current) => {
          const { [action.route]: _completedKey, ...remaining } = current;
          return remaining;
        });
      }
      if (result.sessionExpired) {
        setSignInError(copy.sessionExpired);
        setIdentity(undefined);
        return;
      }
      setNotice(result.notice);
    } finally {
      // A client-side error after the request must not permanently lock the
      // manual approval console's controls.
      setRunningAction(undefined);
    }
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
  const hasLenderComplaintRole = identity.roles.includes(
    "LENDER_COMPLAINT_OFFICER",
  );
  const loadReferredServiceCases = async () => {
    setServiceCaseBusy(true);
    setServiceCaseNotice("");
    try {
      const response = await api("/v1/local/service-cases/referred-to-lender");
      if (response.status === 401) {
        setSignInError(copy.sessionExpired);
        setIdentity(undefined);
        return;
      }
      const payload: unknown = await response.json().catch(() => undefined);
      if (!response.ok || !isReferredServiceCaseQueue(payload)) {
        setServiceCaseNotice(copy.complaintLoadFailed);
        return;
      }
      setReferredServiceCases(payload.cases);
    } finally {
      setServiceCaseBusy(false);
    }
  };
  const viewServiceCase = async (caseNo: string) => {
    setServiceCaseBusy(true);
    setServiceCaseNotice("");
    try {
      const response = await api(
        `/v1/local/service-cases/${encodeURIComponent(caseNo)}`,
      );
      if (response.status === 401) {
        setSignInError(copy.sessionExpired);
        setIdentity(undefined);
        return;
      }
      const payload: unknown = await response.json().catch(() => undefined);
      if (!response.ok || !isServiceCaseDetail(payload)) {
        setServiceCaseNotice(copy.complaintLoadFailed);
        return;
      }
      setSelectedServiceCase(payload);
    } finally {
      setServiceCaseBusy(false);
    }
  };
  const resolveServiceCase = async () => {
    if (!selectedServiceCase) return;
    setServiceCaseBusy(true);
    setServiceCaseNotice("");
    try {
      const response = await api(
        `/v1/local/service-cases/${encodeURIComponent(selectedServiceCase.caseNo)}/lender-resolution`,
        {
          method: "POST",
          body: JSON.stringify({ reasonCode: serviceCaseReasonCode }),
        },
      );
      if (response.status === 401) {
        setSignInError(copy.sessionExpired);
        setIdentity(undefined);
        return;
      }
      const payload: unknown = await response.json().catch(() => undefined);
      if (
        !response.ok ||
        !payload ||
        typeof payload !== "object" ||
        (payload as { status?: unknown }).status !== "RESOLVED"
      ) {
        setServiceCaseNotice(copy.complaintResolveFailed);
        return;
      }
      setSelectedServiceCase((current) =>
        current ? { ...current, status: "RESOLVED" } : current,
      );
      setServiceCaseNotice(`${copy.recorded}: ${selectedServiceCase.caseNo}`);
      await loadReferredServiceCases();
    } finally {
      setServiceCaseBusy(false);
    }
  };
  return (
    <main style={shell}>
      <header
        style={{ display: "flex", justifyContent: "space-between", gap: 12 }}
      >
        <div>
          <h1>{copy.title}</h1>
          <p>
            {copy.signedInAs}: {identity.loginName} ·{" "}
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
        <button onClick={logout}>{copy.signOut}</button>
      </header>
      <section style={card}>
        <h2>{copy.manualApproval}</h2>
        <p>{copy.manualApprovalDescription}</p>
        <div style={form}>
          <label>
            {copy.applicationNumber}
            <input
              value={applicationNo}
              onChange={(e) => setApplicationNo(e.target.value)}
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
          {identity.roles.some((role) =>
            ["LENDER_CREDIT_OFFICER", "LENDER_CREDIT_REVIEWER"].includes(role),
          ) ? (
            <label>
              {copy.creditDecision}
              <select
                value={reviewDecision}
                onChange={(event) =>
                  setReviewDecision(event.target.value as ReviewDecision)
                }
              >
                <option value="APPROVED">{copy.approve}</option>
                <option value="REJECTED">{copy.reject}</option>
                <option value="RETURNED">{copy.returnForCorrection}</option>
              </select>
            </label>
          ) : null}
          {identity.roles.includes("LENDER_CREDIT_REVIEWER") &&
          reviewDecision === "APPROVED" ? (
            <>
              <label>
                {copy.approvedAmount}
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
                {copy.serviceFee}
                <input
                  inputMode="numeric"
                  value={serviceFeeMinor}
                  onChange={(event) => setServiceFeeMinor(event.target.value)}
                  required
                />
              </label>
              <label>
                {copy.totalRepayable}
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
                {copy.installments}
                <input
                  inputMode="numeric"
                  value={installmentCount}
                  onChange={(event) => setInstallmentCount(event.target.value)}
                  required
                />
              </label>
              <label>
                {copy.firstDueDate}
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
            {copy.evidenceReference}
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
              disabled={
                !applicationNo ||
                Boolean(runningAction) ||
                (action.route === "lender-final-review" &&
                  reviewDecision === "APPROVED" &&
                  !finalTermsValid)
              }
              onClick={() => void run(action)}
            >
              {runningAction === action.route
                ? "…"
                : copy.actions[action.labelKey]}
            </button>
          ))}
        </div>
        {available.length === 0 ? <p>{copy.noRole}</p> : null}
        {available.some((action) => action.route === "lender-final-review") &&
        reviewDecision === "APPROVED" &&
        !finalTermsValid ? (
          <p role="alert">{copy.invalidFinalReviewTerms}</p>
        ) : null}
        {notice ? (
          <pre role="status" style={{ whiteSpace: "pre-wrap" }}>
            {notice}
          </pre>
        ) : null}
      </section>
      {hasLenderComplaintRole ? (
        <section style={card} aria-label={copy.complaintResolution}>
          <h2>{copy.complaintResolution}</h2>
          <p>{copy.complaintResolutionDescription}</p>
          <button
            disabled={serviceCaseBusy}
            onClick={() => void loadReferredServiceCases()}
          >
            {serviceCaseBusy ? "…" : copy.refreshComplaintQueue}
          </button>
          {referredServiceCases.length === 0 ? (
            <p>{copy.noReferredComplaints}</p>
          ) : (
            <ul>
              {referredServiceCases.map((serviceCase) => (
                <li key={serviceCase.caseNo} style={{ marginTop: 10 }}>
                  <button
                    disabled={serviceCaseBusy}
                    onClick={() => void viewServiceCase(serviceCase.caseNo)}
                  >
                    {copy.viewComplaint}: {serviceCase.caseNo}
                  </button>{" "}
                  <small>
                    {serviceCase.caseType} · {serviceCase.applicationNo}
                  </small>
                </li>
              ))}
            </ul>
          )}
          {selectedServiceCase ? (
            <section style={{ ...card, marginTop: 16, background: "#f8fafc" }}>
              <h3>{selectedServiceCase.caseNo}</h3>
              <p>
                <strong>{copy.complaintContentAudited}</strong>
              </p>
              <p style={{ whiteSpace: "pre-wrap" }}>
                {selectedServiceCase.message}
              </p>
              {selectedServiceCase.status === "RESOLVED" ? (
                <p role="status">{copy.recorded}</p>
              ) : (
                <>
                  <label>
                    {copy.finalResolutionReasonCode}
                    <input
                      value={serviceCaseReasonCode}
                      onChange={(event) =>
                        setServiceCaseReasonCode(
                          event.target.value.toUpperCase(),
                        )
                      }
                      pattern="[A-Z0-9_]{3,64}"
                      required
                    />
                  </label>
                  <button
                    disabled={
                      serviceCaseBusy ||
                      !/^[A-Z0-9_]{3,64}$/.test(serviceCaseReasonCode)
                    }
                    onClick={() => void resolveServiceCase()}
                  >
                    {serviceCaseBusy ? "…" : copy.resolveComplaint}
                  </button>
                </>
              )}
            </section>
          ) : null}
          {serviceCaseNotice ? <p role="status">{serviceCaseNotice}</p> : null}
        </section>
      ) : null}
    </main>
  );
}
