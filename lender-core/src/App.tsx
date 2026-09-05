import { useEffect, useState, type FormEvent } from "react";

type Language = "zh-CN" | "en" | "km";
type Identity = Readonly<{
  accountId: string;
  loginName: string;
  preferredLanguage: Language;
  roles: string[];
}>;
type Status =
  | "REQUESTED"
  | "MAKER_VERIFIED"
  | "CHECKER_APPROVED"
  | "BANK_TRANSFER_RECORDED";
type Operation = Readonly<{
  operationRef: string;
  status: Status;
  applicationNo: string;
  orderRef: string;
  operationType: "WITHDRAWAL" | "REPAYMENT";
  fundsOrderStatus: string;
  requestedAmountMinor: string;
  currency: "USD";
}>;
type AuditEvent = Readonly<{
  eventRef: string;
  eventType: string;
  actorRole: string;
  evidenceReference: string | null;
  reasonCode: string | null;
  occurredAt: string;
}>;
type OperatorAccount = Readonly<{
  accountId: string;
  loginName: string;
  preferredLanguage: Language;
  isActive: boolean;
  roles: string[];
  createdAt: string;
}>;
type LenderCase = Readonly<{
  caseId: string;
  caseRef: string;
  externalApplicationRef: string;
  caseType: "LOAN" | "COMPLAINT";
  stage: string;
  status: string;
  applicantEvidenceRef: string;
  createdAt: string;
}>;
type CaseAuditEvent = Readonly<{
  eventRef: string;
  eventType: string;
  actorRole: string;
  evidenceReference: string;
  reasonCode: string | null;
  occurredAt: string;
}>;
type FieldVisibilityRule = Readonly<{
  roleCode: string;
  resourceCode: string;
  fieldCode: string;
  isVisible: boolean;
}>;
type WorkflowAssignment = Readonly<{
  stage: string;
  primaryAccountId: string | null;
  backupAccountId: string | null;
}>;
type LenderOrganization = Readonly<{
  organizationId: string;
  organizationRef: string;
  displayName: string;
  isActive: boolean;
  units: Array<
    Readonly<{ unitId: string; unitRef: string; displayName: string }>
  >;
}>;

const LENDER_ROLE_OPTIONS = [
  "LENDER_KYC_AML_REVIEWER",
  "LENDER_CREDIT_REVIEWER",
  "LENDER_CREDIT_APPROVER",
  "LENDER_CONTRACT_MAKER",
  "LENDER_CONTRACT_CHECKER",
  "LENDER_DISBURSEMENT_MAKER",
  "LENDER_DISBURSEMENT_CHECKER",
  "LENDER_SERVICING_ACCOUNTING",
  "LENDER_COMPLAINT_OFFICER",
  "LENDER_AUDITOR",
  "LENDER_WALLET_MAKER",
  "LENDER_WALLET_CHECKER",
  "LENDER_WALLET_ADMIN",
] as const;

const CASE_ACTIONS_BY_STAGE: Record<
  string,
  Readonly<{ action: string; role: string; label: string }[]>
> = {
  KYC_AML_REVIEW: [
    {
      action: "KYC_AML_PASSED",
      role: "LENDER_KYC_AML_REVIEWER",
      label: "KYC/AML 通过",
    },
    {
      action: "KYC_AML_MORE_INFO_REQUIRED",
      role: "LENDER_KYC_AML_REVIEWER",
      label: "要求补件",
    },
    {
      action: "KYC_AML_REJECTED",
      role: "LENDER_KYC_AML_REVIEWER",
      label: "拒绝",
    },
  ],
  CREDIT_REVIEW: [
    {
      action: "CREDIT_REVIEW_PASSED",
      role: "LENDER_CREDIT_REVIEWER",
      label: "初审通过",
    },
    {
      action: "CREDIT_MORE_INFO_REQUIRED",
      role: "LENDER_CREDIT_REVIEWER",
      label: "要求补件",
    },
  ],
  CREDIT_APPROVAL: [
    {
      action: "CREDIT_APPROVED",
      role: "LENDER_CREDIT_APPROVER",
      label: "最终批准",
    },
    {
      action: "CREDIT_REJECTED",
      role: "LENDER_CREDIT_APPROVER",
      label: "最终拒绝",
    },
  ],
  CONTRACT_MAKER: [
    {
      action: "CONTRACT_DRAFTED",
      role: "LENDER_CONTRACT_MAKER",
      label: "提交合同证据包",
    },
  ],
  CONTRACT_CHECKER: [
    {
      action: "CONTRACT_APPROVED",
      role: "LENDER_CONTRACT_CHECKER",
      label: "验收合同证据",
    },
    {
      action: "CONTRACT_REJECTED",
      role: "LENDER_CONTRACT_CHECKER",
      label: "退回合同",
    },
  ],
  DISBURSEMENT_MAKER: [
    {
      action: "DISBURSEMENT_PREPARED",
      role: "LENDER_DISBURSEMENT_MAKER",
      label: "核验收款账户",
    },
  ],
  DISBURSEMENT_CHECKER: [
    {
      action: "DISBURSEMENT_APPROVED",
      role: "LENDER_DISBURSEMENT_CHECKER",
      label: "复核放款准备",
    },
    {
      action: "DISBURSEMENT_FAILED",
      role: "LENDER_DISBURSEMENT_CHECKER",
      label: "放款异常",
    },
  ],
  SERVICING: [
    {
      action: "REPAYMENT_RECORDED",
      role: "LENDER_SERVICING_ACCOUNTING",
      label: "记录还款",
    },
    {
      action: "LOAN_SETTLED",
      role: "LENDER_SERVICING_ACCOUNTING",
      label: "确认结清",
    },
    {
      action: "SERVICING_EXCEPTION",
      role: "LENDER_SERVICING_ACCOUNTING",
      label: "账务异常",
    },
  ],
  COMPLAINT: [
    {
      action: "COMPLAINT_ACKNOWLEDGED",
      role: "LENDER_COMPLAINT_OFFICER",
      label: "受理投诉",
    },
    {
      action: "COMPLAINT_RESOLVED",
      role: "LENDER_COMPLAINT_OFFICER",
      label: "给出处理结论",
    },
    {
      action: "COMPLAINT_CLOSED",
      role: "LENDER_COMPLAINT_OFFICER",
      label: "关闭投诉",
    },
  ],
};
const WORKFLOW_STAGES = [
  ["KYC_AML_REVIEW", "LENDER_KYC_AML_REVIEWER"],
  ["CREDIT_REVIEW", "LENDER_CREDIT_REVIEWER"],
  ["CREDIT_APPROVAL", "LENDER_CREDIT_APPROVER"],
  ["CONTRACT_MAKER", "LENDER_CONTRACT_MAKER"],
  ["CONTRACT_CHECKER", "LENDER_CONTRACT_CHECKER"],
  ["DISBURSEMENT_MAKER", "LENDER_DISBURSEMENT_MAKER"],
  ["DISBURSEMENT_CHECKER", "LENDER_DISBURSEMENT_CHECKER"],
  ["SERVICING", "LENDER_SERVICING_ACCOUNTING"],
  ["COMPLAINT", "LENDER_COMPLAINT_OFFICER"],
] as const;

const apiBase = (import.meta.env.VITE_LENDER_WALLET_API_BASE ?? "/api").replace(
  /\/$/,
  "",
);
const COPY: Record<Language, Record<string, string>> = {
  "zh-CN": {
    title: "持牌机构资金操作台",
    subtitle: "受控人工操作 · 经办与复核分离",
    account: "账号",
    password: "密码",
    signIn: "登录",
    signOut: "退出登录",
    queue: "待处理操作",
    audit: "审计记录",
    refresh: "刷新",
    empty: "当前没有待处理的资金操作。",
    evidence: "持牌证据库引用",
    reason: "失败原因代码",
    maker: "经办核验",
    checker: "复核批准",
    record: "记录银行操作",
    settle: "确认结算",
    fail: "标记失败",
    viewAudit: "查看审计",
    loginFailed: "登录失败，请检查账号、密码或权限。",
    loginUnavailable:
      "暂时无法完成登录。请确认已通过浏览器预览访问验证后重试。",
    actionFailed: "操作未完成。请检查权限、当前状态和证据引用。",
    expired: "会话已失效，请重新登录。",
    noAccess: "没有执行此操作的权限。",
    evidenceRequired: "此操作必须填写持牌证据库引用。",
  },
  en: {
    title: "Lender Funds Operations",
    subtitle: "Controlled manual operations · maker/checker separation",
    account: "Account",
    password: "Password",
    signIn: "Sign in",
    signOut: "Sign out",
    queue: "Open operations",
    audit: "Audit trail",
    refresh: "Refresh",
    empty: "There are no open funds operations.",
    evidence: "Lender evidence-vault reference",
    reason: "Failure reason code",
    maker: "Maker verify",
    checker: "Checker approve",
    record: "Record bank action",
    settle: "Confirm settlement",
    fail: "Mark failed",
    viewAudit: "View audit",
    loginFailed: "Sign-in failed. Check account, password, or role.",
    loginUnavailable:
      "Sign-in is temporarily unavailable. Complete the browser preview access check, then retry.",
    actionFailed:
      "The action was not completed. Check role, state, and evidence reference.",
    expired: "Your session has expired. Please sign in again.",
    noAccess: "You do not have permission for this action.",
    evidenceRequired: "This action requires a lender evidence-vault reference.",
  },
  km: {
    title: "ប្រតិបត្តិការហិរញ្ញវត្ថុស្ថាប័ន",
    subtitle:
      "ប្រតិបត្តិការដោយដៃដែលគ្រប់គ្រង · បំបែកអ្នកធ្វើ និងអ្នកត្រួតពិនិត្យ",
    account: "គណនី",
    password: "ពាក្យសម្ងាត់",
    signIn: "ចូលប្រើ",
    signOut: "ចាកចេញ",
    queue: "ប្រតិបត្តិការកំពុងរង់ចាំ",
    audit: "កំណត់ត្រាសវនកម្ម",
    refresh: "ធ្វើឱ្យថ្មី",
    empty: "មិនមានប្រតិបត្តិការកំពុងរង់ចាំទេ។",
    evidence: "លេខយោងឃ្លាំងភស្តុតាងរបស់ស្ថាប័ន",
    reason: "លេខកូដមូលហេតុបរាជ័យ",
    maker: "ផ្ទៀងផ្ទាត់ដោយអ្នកធ្វើ",
    checker: "អនុម័តដោយអ្នកត្រួតពិនិត្យ",
    record: "កត់ត្រាប្រតិបត្តិការធនាគារ",
    settle: "បញ្ជាក់ការទូទាត់",
    fail: "សម្គាល់ថាបរាជ័យ",
    viewAudit: "មើលសវនកម្ម",
    loginFailed: "មិនអាចចូលប្រើបានទេ។ សូមពិនិត្យគណនី ពាក្យសម្ងាត់ ឬសិទ្ធិ។",
    loginUnavailable:
      "មិនអាចចូលប្រើបានជាបណ្តោះអាសន្នទេ។ សូមបំពេញការផ្ទៀងផ្ទាត់ចូលប្រើតាមកម្មវិធីរុករក ហើយព្យាយាមម្ដងទៀត។",
    actionFailed: "មិនអាចបញ្ចប់ប្រតិបត្តិការបានទេ។",
    expired: "សម័យរបស់អ្នកបានផុតកំណត់។ សូមចូលប្រើម្តងទៀត។",
    noAccess: "អ្នកមិនមានសិទ្ធិសម្រាប់ប្រតិបត្តិការនេះទេ។",
    evidenceRequired:
      "ប្រតិបត្តិការនេះត្រូវការលេខយោងឃ្លាំងភស្តុតាងរបស់ស្ថាប័ន។",
  },
};
const ADMIN_COPY: Record<Language, Record<string, string>> = {
  "zh-CN": {
    title: "账号与角色管理",
    create: "创建账号",
    active: "启用",
    disabled: "已停用",
    disable: "停用账号",
    roles: "角色",
    language: "语言",
  },
  en: {
    title: "Account and role management",
    create: "Create account",
    active: "Active",
    disabled: "Disabled",
    disable: "Disable account",
    roles: "Roles",
    language: "Language",
  },
  km: {
    title: "ការគ្រប់គ្រងគណនី និងតួនាទី",
    create: "បង្កើតគណនី",
    active: "សកម្ម",
    disabled: "បានបិទ",
    disable: "បិទគណនី",
    roles: "តួនាទី",
    language: "ភាសា",
  },
};

function csrf(): string | undefined {
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("__Host-payease_lender_operator_csrf="))
    ?.slice("__Host-payease_lender_operator_csrf=".length);
}
async function api(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");
  if ((init?.method ?? "GET").toUpperCase() !== "GET") {
    const token = csrf();
    if (token) headers.set("x-csrf-token", token);
  }
  return fetch(`${apiBase}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });
}
function money(amountMinor: string, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(Number(BigInt(amountMinor)) / 100);
}
function nextAction(
  operation: Operation,
  roles: string[],
): { eventType: string; copyKey: string; evidence: boolean } | undefined {
  if (operation.status === "REQUESTED" && roles.includes("LENDER_WALLET_MAKER"))
    return { eventType: "MAKER_VERIFIED", copyKey: "maker", evidence: false };
  if (
    operation.status === "MAKER_VERIFIED" &&
    roles.includes("LENDER_WALLET_CHECKER")
  )
    return {
      eventType: "CHECKER_APPROVED",
      copyKey: "checker",
      evidence: false,
    };
  if (
    operation.status === "CHECKER_APPROVED" &&
    roles.includes("LENDER_WALLET_MAKER")
  )
    return {
      eventType: "BANK_TRANSFER_RECORDED",
      copyKey: "record",
      evidence: true,
    };
  if (
    operation.status === "BANK_TRANSFER_RECORDED" &&
    roles.includes("LENDER_WALLET_CHECKER")
  )
    return { eventType: "SETTLED", copyKey: "settle", evidence: true };
  return undefined;
}

export function App(): JSX.Element {
  const [identity, setIdentity] = useState<Identity>();
  const [language, setLanguage] = useState<Language>("en");
  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [cases, setCases] = useState<LenderCase[]>([]);
  const [caseAudit, setCaseAudit] = useState<CaseAuditEvent[]>([]);
  const [selectedCase, setSelectedCase] = useState("");
  const [fieldRules, setFieldRules] = useState<FieldVisibilityRule[]>([]);
  const [workflowAssignments, setWorkflowAssignments] = useState<
    WorkflowAssignment[]
  >([]);
  const [organizations, setOrganizations] = useState<LenderOrganization[]>([]);
  const [accounts, setAccounts] = useState<OperatorAccount[]>([]);
  const [newAccountLogin, setNewAccountLogin] = useState("");
  const [newAccountPassword, setNewAccountPassword] = useState("");
  const [newAccountRoles, setNewAccountRoles] = useState<string[]>([
    "LENDER_WALLET_MAKER",
  ]);
  const [selected, setSelected] = useState("");
  const [newOrganizationRef, setNewOrganizationRef] = useState("");
  const [newOrganizationName, setNewOrganizationName] = useState("");
  const [visibilityRole, setVisibilityRole] = useState<string>(
    "LENDER_KYC_AML_REVIEWER",
  );
  const [visibilityResource, setVisibilityResource] = useState("CASE_SUMMARY");
  const [visibilityField, setVisibilityField] = useState("CASE_REFERENCE");
  const [visibilityEnabled, setVisibilityEnabled] = useState(true);
  const [evidence, setEvidence] = useState("");
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const c = COPY[identity?.preferredLanguage ?? language];
  const adminCopy = ADMIN_COPY[identity?.preferredLanguage ?? language];
  const text = (key: string) => c[key] ?? key;
  const loadQueue = async () => {
    const response = await api("/v1/lender-operator/manual-operations/open");
    if (response.status === 401) throw new Error("unauthenticated");
    if (!response.ok) throw new Error("queue");
    setOperations(
      ((await response.json()) as { operations: Operation[] }).operations,
    );
  };
  const loadAudit = async (operationRef: string) => {
    const response = await api(
      `/v1/lender-operator/manual-operations/${encodeURIComponent(operationRef)}/audit`,
    );
    if (!response.ok) throw new Error("audit");
    setSelected(operationRef);
    setAudit(((await response.json()) as { events: AuditEvent[] }).events);
  };
  const loadAccounts = async () => {
    const response = await api("/v1/lender-operator/admin/accounts");
    if (!response.ok) throw new Error("accounts");
    setAccounts(
      ((await response.json()) as { accounts: OperatorAccount[] }).accounts,
    );
  };
  const loadAdminConfiguration = async () => {
    const [fieldResponse, workflowResponse, organizationResponse] =
      await Promise.all([
        api("/v1/lender-operator/admin/field-visibility"),
        api("/v1/lender-operator/admin/workflow-assignments"),
        api("/v1/lender-operator/admin/organization"),
      ]);
    if (!fieldResponse.ok || !workflowResponse.ok || !organizationResponse.ok)
      throw new Error("admin-configuration");
    setFieldRules(
      ((await fieldResponse.json()) as { rules: FieldVisibilityRule[] }).rules,
    );
    setWorkflowAssignments(
      (
        (await workflowResponse.json()) as {
          assignments: WorkflowAssignment[];
        }
      ).assignments,
    );
    setOrganizations(
      (
        (await organizationResponse.json()) as {
          organizations: LenderOrganization[];
        }
      ).organizations,
    );
  };
  const loadCases = async () => {
    const response = await api("/v1/lender-operator/cases/open");
    if (response.status === 401) throw new Error("unauthenticated");
    if (!response.ok) throw new Error("cases");
    setCases(((await response.json()) as { cases: LenderCase[] }).cases);
  };
  const loadCaseAudit = async (caseId: string) => {
    const response = await api(
      `/v1/lender-operator/cases/${encodeURIComponent(caseId)}/audit`,
    );
    if (!response.ok) throw new Error("case-audit");
    setSelectedCase(caseId);
    setCaseAudit(
      ((await response.json()) as { events: CaseAuditEvent[] }).events,
    );
  };
  useEffect(() => {
    api("/v1/lender-operator/auth/me")
      .then(async (response) => {
        if (!response.ok) return;
        const next = (await response.json()) as Identity;
        setIdentity(next);
        setLanguage(next.preferredLanguage);
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (identity) void loadQueue().catch(() => setNotice(text("actionFailed")));
  }, [identity?.loginName]);
  useEffect(() => {
    if (identity) void loadCases().catch(() => undefined);
  }, [identity?.loginName]);
  useEffect(() => {
    if (identity?.roles.includes("LENDER_WALLET_ADMIN")) {
      void loadAccounts().catch(() => setNotice(text("actionFailed")));
      void loadAdminConfiguration().catch(() =>
        setNotice(text("actionFailed")),
      );
    }
  }, [identity?.loginName]);
  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    setNotice("");
    setSigningIn(true);
    try {
      const response = await api("/v1/lender-operator/auth/login", {
        method: "POST",
        body: JSON.stringify({ loginName, password }),
      });
      if (!response.ok) return setNotice(text("loginFailed"));
      const me = await api("/v1/lender-operator/auth/me");
      if (!me.ok) return setNotice(text("loginFailed"));
      const next = (await me.json()) as Identity;
      setIdentity(next);
      setLanguage(next.preferredLanguage);
    } catch {
      setNotice(text("loginUnavailable"));
    } finally {
      setSigningIn(false);
    }
  };
  const action = async (
    operation: Operation,
    eventType: string,
    failed = false,
  ) => {
    if (
      ["BANK_TRANSFER_RECORDED", "SETTLED", "FAILED"].includes(eventType) &&
      !evidence.trim()
    )
      return setNotice(text("evidenceRequired"));
    if (failed && !reason.trim()) return setNotice(text("reason"));
    const response = await api(
      `/v1/lender-operator/manual-operations/${encodeURIComponent(operation.operationRef)}/actions`,
      {
        method: "POST",
        body: JSON.stringify({
          eventType,
          ...(evidence.trim() ? { evidenceReference: evidence.trim() } : {}),
          ...(failed ? { reasonCode: reason.trim() } : {}),
        }),
      },
    );
    if (response.status === 401) return setIdentity(undefined);
    if (response.status === 403) return setNotice(text("noAccess"));
    if (!response.ok) return setNotice(text("actionFailed"));
    setEvidence("");
    setReason("");
    await loadQueue();
    await loadAudit(operation.operationRef);
  };
  const signOut = async () => {
    await api("/v1/lender-operator/auth/logout", { method: "POST" });
    setIdentity(undefined);
    setOperations([]);
    setAudit([]);
    setAccounts([]);
    setFieldRules([]);
    setWorkflowAssignments([]);
    setOrganizations([]);
    setCases([]);
    setCaseAudit([]);
  };
  const caseAction = async (caseItem: LenderCase, actionName: string) => {
    if (!evidence.trim()) return setNotice(text("evidenceRequired"));
    const body: Record<string, unknown> = {
      action: actionName,
      evidenceReference: evidence.trim(),
    };
    if (actionName === "CREDIT_APPROVED") {
      body.decision = {
        approvedAmountMinor: "5000",
        termDays: 15,
        pricingRuleRef: "controlled-preview-rule",
      };
    }
    const response = await api(
      `/v1/lender-operator/cases/${encodeURIComponent(caseItem.caseId)}/actions`,
      { method: "POST", body: JSON.stringify(body) },
    );
    if (response.status === 401) return setIdentity(undefined);
    if (response.status === 403) return setNotice(text("noAccess"));
    if (!response.ok) return setNotice(text("actionFailed"));
    setEvidence("");
    await loadCases();
    await loadCaseAudit(caseItem.caseId);
  };
  const createAccount = async (event: FormEvent) => {
    event.preventDefault();
    const response = await api("/v1/lender-operator/admin/accounts", {
      method: "POST",
      body: JSON.stringify({
        loginName: newAccountLogin,
        password: newAccountPassword,
        preferredLanguage: identity?.preferredLanguage ?? language,
        roles: newAccountRoles,
      }),
    });
    if (!response.ok) return setNotice(text("actionFailed"));
    setNewAccountLogin("");
    setNewAccountPassword("");
    await loadAccounts();
  };
  const disableAccount = async (accountId: string) => {
    const response = await api(
      `/v1/lender-operator/admin/accounts/${encodeURIComponent(accountId)}`,
      { method: "PATCH", body: JSON.stringify({ isActive: false }) },
    );
    if (!response.ok) return setNotice(text("actionFailed"));
    await loadAccounts();
  };
  const updateAccount = async (
    accountId: string,
    patch: Readonly<{ isActive?: boolean; roles?: string[] }>,
  ) => {
    const response = await api(
      `/v1/lender-operator/admin/accounts/${encodeURIComponent(accountId)}`,
      { method: "PATCH", body: JSON.stringify(patch) },
    );
    if (!response.ok) return setNotice(text("actionFailed"));
    await loadAccounts();
  };
  const createOrganization = async (event: FormEvent) => {
    event.preventDefault();
    const response = await api("/v1/lender-operator/admin/organization", {
      method: "POST",
      body: JSON.stringify({
        organizationRef: newOrganizationRef,
        displayName: newOrganizationName,
      }),
    });
    if (!response.ok) return setNotice(text("actionFailed"));
    setNewOrganizationRef("");
    setNewOrganizationName("");
    await loadAdminConfiguration();
  };
  const updateVisibility = async (event: FormEvent) => {
    event.preventDefault();
    const response = await api("/v1/lender-operator/admin/field-visibility", {
      method: "PUT",
      body: JSON.stringify({
        roleCode: visibilityRole,
        resourceCode: visibilityResource,
        fieldCode: visibilityField,
        isVisible: visibilityEnabled,
      }),
    });
    if (!response.ok) return setNotice(text("actionFailed"));
    await loadAdminConfiguration();
  };
  const assignWorkflowOperator = async (
    stage: string,
    slot: "primaryAccountId" | "backupAccountId",
    accountId: string | null,
  ) => {
    const current = workflowAssignments.find(
      (assignment) => assignment.stage === stage,
    );
    const response = await api(
      `/v1/lender-operator/admin/workflow-assignments/${encodeURIComponent(stage)}`,
      {
        method: "PUT",
        body: JSON.stringify({
          primaryAccountId:
            slot === "primaryAccountId"
              ? accountId
              : (current?.primaryAccountId ?? null),
          backupAccountId:
            slot === "backupAccountId"
              ? accountId
              : (current?.backupAccountId ?? null),
        }),
      },
    );
    if (!response.ok) return setNotice(text("actionFailed"));
    await loadAdminConfiguration();
  };
  if (!identity)
    return (
      <main className="lender-shell">
        <section className="lender-card login-card">
          <h1>{c.title}</h1>
          <p>{c.subtitle}</p>
          <p>
            This form uses the lender operator account. Browser preview access
            is a separate protection step.
          </p>
          <form onSubmit={(event) => void signIn(event)}>
            <label>
              {c.account}
              <input
                autoComplete="username"
                value={loginName}
                onChange={(event) => setLoginName(event.target.value)}
                required
              />
            </label>
            <label>
              {c.password}
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            <label>
              Language
              <select
                value={language}
                onChange={(event) =>
                  setLanguage(event.target.value as Language)
                }
              >
                <option value="en">English</option>
                <option value="zh-CN">中文</option>
                <option value="km">ខ្មែរ</option>
              </select>
            </label>
            <button type="submit" disabled={signingIn}>
              {signingIn ? "…" : c.signIn}
            </button>
          </form>
          {notice ? <p role="alert">{notice}</p> : null}
        </section>
      </main>
    );
  return (
    <main className="lender-shell">
      <header>
        <div>
          <h1>{c.title}</h1>
          <p>
            {identity.loginName} · {identity.roles.join(", ")}
          </p>
        </div>
        <button onClick={() => void signOut()}>{c.signOut}</button>
      </header>
      {notice ? (
        <p role="alert" className="notice">
          {notice}
        </p>
      ) : null}
      <section className="lender-card">
        <div className="section-heading">
          <h2>持牌案件审批队列</h2>
          <button onClick={() => void loadCases()}>刷新</button>
        </div>
        <p>
          仅展示持牌域案件引用与证据库引用；此受控预览不连接真实征信、身份或资金渠道。
        </p>
        {cases.length === 0 ? (
          <p>当前没有持牌审批案件。</p>
        ) : (
          cases.map((caseItem) => {
            const available = (
              CASE_ACTIONS_BY_STAGE[caseItem.stage] ?? []
            ).filter((candidate) => identity.roles.includes(candidate.role));
            return (
              <article className="operation" key={caseItem.caseId}>
                <div>
                  <strong>
                    {caseItem.caseRef} · {caseItem.stage} · {caseItem.status}
                  </strong>
                  <p>申请引用：{caseItem.externalApplicationRef}</p>
                  <p>证据引用：{caseItem.applicantEvidenceRef}</p>
                </div>
                <div className="operation-actions">
                  <button onClick={() => void loadCaseAudit(caseItem.caseId)}>
                    查看案件审计
                  </button>
                  {available.map((candidate) => (
                    <button
                      key={candidate.action}
                      onClick={() =>
                        void caseAction(caseItem, candidate.action)
                      }
                    >
                      {candidate.label}
                    </button>
                  ))}
                </div>
              </article>
            );
          })
        )}
      </section>
      <section className="lender-card">
        <div className="section-heading">
          <h2>{c.queue}</h2>
          <button onClick={() => void loadQueue()}>{c.refresh}</button>
        </div>
        {operations.length === 0 ? (
          <p>{c.empty}</p>
        ) : (
          operations.map((operation) => {
            const next = nextAction(operation, identity.roles);
            return (
              <article className="operation" key={operation.operationRef}>
                <div>
                  <strong>
                    {operation.operationType} · {operation.status}
                  </strong>
                  <p>
                    {operation.applicationNo} · {operation.orderRef}
                  </p>
                  <p>
                    {money(operation.requestedAmountMinor, operation.currency)}{" "}
                    · {operation.fundsOrderStatus}
                  </p>
                </div>
                <div className="operation-actions">
                  <button
                    onClick={() => void loadAudit(operation.operationRef)}
                  >
                    {c.viewAudit}
                  </button>
                  {next ? (
                    <button
                      onClick={() => void action(operation, next.eventType)}
                    >
                      {c[next.copyKey]}
                    </button>
                  ) : null}
                  {operation.status === "BANK_TRANSFER_RECORDED" &&
                  identity.roles.includes("LENDER_WALLET_CHECKER") ? (
                    <button
                      className="danger"
                      onClick={() => void action(operation, "FAILED", true)}
                    >
                      {c.fail}
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })
        )}
        <label>
          {c.evidence}
          <input
            value={evidence}
            onChange={(event) => setEvidence(event.target.value)}
            placeholder="vault://lender/..."
          />
        </label>
        <label>
          {c.reason}
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
      </section>
      {identity.roles.includes("LENDER_WALLET_ADMIN") ? (
        <section className="lender-card">
          <div className="section-heading">
            <h2>{adminCopy.title}</h2>
            <button onClick={() => void loadAccounts()}>{c.refresh}</button>
          </div>
          <form
            className="admin-form"
            onSubmit={(event) => void createAccount(event)}
          >
            <label>
              {c.account}
              <input
                value={newAccountLogin}
                onChange={(event) => setNewAccountLogin(event.target.value)}
                pattern="[a-z0-9._-]{3,64}"
                required
              />
            </label>
            <label>
              {c.password}
              <input
                type="password"
                value={newAccountPassword}
                onChange={(event) => setNewAccountPassword(event.target.value)}
                minLength={12}
                required
              />
            </label>
            <label>
              {adminCopy.roles}
              <select
                multiple
                value={newAccountRoles}
                onChange={(event) =>
                  setNewAccountRoles(
                    Array.from(event.currentTarget.selectedOptions).map(
                      (option) => option.value,
                    ),
                  )
                }
              >
                {LENDER_ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">{adminCopy.create}</button>
          </form>
          {accounts.map((account) => (
            <article className="operation" key={account.accountId}>
              <div>
                <strong>{account.loginName}</strong>
                <p>
                  {account.roles.join(", ")} · {account.preferredLanguage}
                </p>
              </div>
              <div className="operation-actions">
                <span>
                  {account.isActive ? adminCopy.active : adminCopy.disabled}
                </span>
                <select
                  multiple
                  aria-label={`${account.loginName} ${adminCopy.roles}`}
                  value={account.roles}
                  onChange={(event) =>
                    void updateAccount(account.accountId, {
                      roles: Array.from(
                        event.currentTarget.selectedOptions,
                      ).map((option) => option.value),
                    })
                  }
                  disabled={account.accountId === identity.accountId}
                >
                  {LENDER_ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                {account.isActive &&
                account.accountId !== identity.accountId ? (
                  <button
                    className="danger"
                    onClick={() => void disableAccount(account.accountId)}
                  >
                    {adminCopy.disable}
                  </button>
                ) : !account.isActive ? (
                  <button
                    onClick={() =>
                      void updateAccount(account.accountId, { isActive: true })
                    }
                  >
                    {adminCopy.active}
                  </button>
                ) : null}
              </div>
            </article>
          ))}
          <hr />
          <h3>组织与部门</h3>
          <form
            className="admin-form"
            onSubmit={(event) => void createOrganization(event)}
          >
            <label>
              组织引用
              <input
                value={newOrganizationRef}
                onChange={(event) => setNewOrganizationRef(event.target.value)}
                placeholder="lorg_lender001"
                pattern="lorg_[A-Za-z0-9_-]{8,96}"
                required
              />
            </label>
            <label>
              组织名称
              <input
                value={newOrganizationName}
                onChange={(event) => setNewOrganizationName(event.target.value)}
                required
              />
            </label>
            <button type="submit">创建组织</button>
          </form>
          {organizations.map((organization) => (
            <p key={organization.organizationId}>
              <strong>{organization.displayName}</strong> ·{" "}
              {organization.organizationRef}
              {organization.units.length
                ? ` · ${organization.units.map((unit) => unit.displayName).join(", ")}`
                : " · 暂无部门"}
            </p>
          ))}
          <hr />
          <h3>审批阶段主办与备办</h3>
          <p>分配不会覆盖角色权限；账号仍必须拥有该阶段对应角色。</p>
          {WORKFLOW_STAGES.map(([stage, role]) => {
            const assignment = workflowAssignments.find(
              (item) => item.stage === stage,
            );
            const eligible = accounts.filter(
              (account) => account.isActive && account.roles.includes(role),
            );
            return (
              <div className="operation" key={stage}>
                <strong>{stage}</strong>
                <div className="operation-actions">
                  <select
                    aria-label={`${stage} primary`}
                    value={assignment?.primaryAccountId ?? ""}
                    onChange={(event) =>
                      void assignWorkflowOperator(
                        stage,
                        "primaryAccountId",
                        event.target.value || null,
                      )
                    }
                  >
                    <option value="">未分配主办</option>
                    {eligible.map((account) => (
                      <option key={account.accountId} value={account.accountId}>
                        {account.loginName}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={`${stage} backup`}
                    value={assignment?.backupAccountId ?? ""}
                    onChange={(event) =>
                      void assignWorkflowOperator(
                        stage,
                        "backupAccountId",
                        event.target.value || null,
                      )
                    }
                  >
                    <option value="">未分配备办</option>
                    {eligible.map((account) => (
                      <option key={account.accountId} value={account.accountId}>
                        {account.loginName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
          <hr />
          <h3>字段可见范围</h3>
          <form
            className="admin-form"
            onSubmit={(event) => void updateVisibility(event)}
          >
            <select
              value={visibilityRole}
              onChange={(event) => setVisibilityRole(event.target.value)}
            >
              {LENDER_ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <select
              value={visibilityResource}
              onChange={(event) => setVisibilityResource(event.target.value)}
            >
              {[
                "CASE_SUMMARY",
                "KYC_EVIDENCE",
                "CREDIT_DECISION",
                "CONTRACT_EVIDENCE",
                "DISBURSEMENT",
                "SERVICING",
                "COMPLAINT",
                "AUDIT",
              ].map((resource) => (
                <option key={resource} value={resource}>
                  {resource}
                </option>
              ))}
            </select>
            <input
              value={visibilityField}
              onChange={(event) => setVisibilityField(event.target.value)}
              pattern="[A-Z0-9_]{2,80}"
              required
            />
            <label>
              <input
                type="checkbox"
                checked={visibilityEnabled}
                onChange={(event) => setVisibilityEnabled(event.target.checked)}
              />
              可见
            </label>
            <button type="submit">保存字段规则</button>
          </form>
          <ol>
            {fieldRules.map((rule) => (
              <li
                key={`${rule.roleCode}:${rule.resourceCode}:${rule.fieldCode}`}
              >
                {rule.roleCode} · {rule.resourceCode} · {rule.fieldCode} ·{" "}
                {rule.isVisible ? "可见" : "隐藏"}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      <section className="lender-card">
        <h2>{c.audit}</h2>
        {selected ? <p>{selected}</p> : null}
        <ol>
          {audit.map((event) => (
            <li key={event.eventRef}>
              <strong>{event.eventType}</strong> · {event.actorRole} ·{" "}
              {event.occurredAt}
              {event.evidenceReference ? ` · ${event.evidenceReference}` : ""}
              {event.reasonCode ? ` · ${event.reasonCode}` : ""}
            </li>
          ))}
        </ol>
      </section>
      <section className="lender-card">
        <h2>案件审计记录（只读）</h2>
        {selectedCase ? <p>{selectedCase}</p> : null}
        <ol>
          {caseAudit.map((event) => (
            <li key={event.eventRef}>
              <strong>{event.eventType}</strong> · {event.actorRole} ·{" "}
              {event.occurredAt}
              {` · ${event.evidenceReference}`}
              {event.reasonCode ? ` · ${event.reasonCode}` : ""}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
