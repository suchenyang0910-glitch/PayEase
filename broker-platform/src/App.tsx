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
import { ServiceAreaMapEditor } from "./ServiceAreaMapEditor.tsx";

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
type PolygonGeoJson = Readonly<{
  type: "Polygon";
  coordinates: number[][][];
}>;
type ZoneScopeType = "PLATFORM" | "EMPLOYER_TENANT";
type ZoneStatus = "DRAFT" | "PENDING_REVIEW" | "ACTIVE" | "RETIRED";
type ServiceAreaZone = Readonly<{
  zoneRef: string;
  version: number;
  displayName: string;
  scopeType: ZoneScopeType;
  employerTenantId: string | null;
  polygonGeoJson: PolygonGeoJson;
  polygonBbox?: {
    minLongitude: number;
    maxLongitude: number;
    minLatitude: number;
    maxLatitude: number;
  } | null;
  status: ZoneStatus;
  effectiveFrom: string;
  effectiveUntil: string | null;
  changeReason: string;
  createdBy: string;
  submittedBy?: string | null;
  submittedAt?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  activatedBy?: string | null;
  activatedAt?: string | null;
  retiredBy?: string | null;
  retiredAt?: string | null;
  createdAt: string;
  updatedAt: string;
}>;
type ServiceAreaFormState = Readonly<{
  zoneRef: string;
  displayName: string;
  scopeType: ZoneScopeType;
  employerTenantId: string;
  polygonGeoJson: PolygonGeoJson | null;
  effectiveFrom: string;
  effectiveUntil: string;
  changeReason: string;
}>;
type KycEvidenceListItem = Readonly<{
  evidenceRef: string;
  source: string;
  consentVersion: string;
  submittedAt: string;
  applicationNo: string | null;
  assessmentResult:
    | "MATCH"
    | "OUT_OF_ZONE"
    | "OUT_OF_COUNTRY"
    | "LOW_ACCURACY"
    | "UNAVAILABLE"
    | null;
  assessedScopeType: ZoneScopeType | null;
  employerTenantId: string | null;
  matchedZoneRef: string | null;
  matchedZoneVersion: number | null;
  assessedAt: string | null;
}>;
type KycEvidenceDetail = Readonly<{
  evidence: KycEvidenceListItem & { ruleVersion: string | null };
  audit: Array<{
    eventType: string;
    actorUserRef: string;
    occurredAt: string;
    payload: Record<string, unknown>;
  }>;
}>;

function createEmptyServiceAreaForm(): ServiceAreaFormState {
  return {
    zoneRef: "",
    displayName: "",
    scopeType: "PLATFORM",
    employerTenantId: "",
    polygonGeoJson: null,
    effectiveFrom: "",
    effectiveUntil: "",
    changeReason: "",
  };
}

function serviceAreaZoneKey(
  zone: Pick<ServiceAreaZone, "zoneRef" | "version">,
): string {
  return `${zone.zoneRef}@${zone.version}`;
}

function factoryTenantCopy(language: Language): Readonly<{
  title: string;
  status: string;
  active: string;
  inactive: string;
  enable: string;
  disable: string;
  enableConfirm: string;
  disableConfirm: string;
}> {
  if (language === "zh-CN") {
    return {
      title: "工厂租户管理",
      status: "状态",
      active: "已启用",
      inactive: "已停用",
      enable: "恢复工厂",
      disable: "停用工厂",
      enableConfirm: "确认恢复该工厂？其企业端账号可再次执行核验。",
      disableConfirm: "确认停用该工厂？将立即冻结该工厂所有企业端核验操作。",
    };
  }
  if (language === "km") {
    return {
      title: "ការគ្រប់គ្រងអ្នកជួលរោងចក្រ",
      status: "ស្ថានភាព",
      active: "សកម្ម",
      inactive: "បានបិទ",
      enable: "បើករោងចក្រវិញ",
      disable: "បិទរោងចក្រ",
      enableConfirm:
        "បើករោងចក្រនេះវិញ? គណនី HR និងហិរញ្ញវត្ថុអាចបន្តការផ្ទៀងផ្ទាត់។",
      disableConfirm:
        "បិទរោងចក្រនេះ? ការផ្ទៀងផ្ទាត់របស់រោងចក្រនេះនឹងត្រូវផ្អាកភ្លាមៗ។",
    };
  }
  return {
    title: "Factory tenant management",
    status: "Status",
    active: "Active",
    inactive: "Disabled",
    enable: "Enable factory",
    disable: "Disable factory",
    enableConfirm:
      "Enable this factory? Its HR and finance accounts can verify again.",
    disableConfirm:
      "Disable this factory? All employer-side verification for it will be frozen immediately.",
  };
}

function serviceAreaCopy(language: Language): Readonly<{
  title: string;
  description: string;
  refresh: string;
  create: string;
  updateDraft: string;
  resetForm: string;
  zoneRef: string;
  version: string;
  displayName: string;
  scopeType: string;
  employerTenant: string;
  platformScope: string;
  employerScope: string;
  polygon: string;
  effectiveFrom: string;
  effectiveUntil: string;
  changeReason: string;
  selectedVersion: string;
  zoneVersions: string;
  submitReview: string;
  review: string;
  activate: string;
  retire: string;
  reviewNote: string;
  retireReason: string;
  noZones: string;
  draftOnly: string;
}> {
  if (language === "zh-CN") {
    return {
      title: "允许借款区域版本流转",
      description:
        "运营后台维护 Polygon 区域版本。仅 DRAFT 可编辑，复核与启用必须双人分离。",
      refresh: "刷新区域版本",
      create: "创建草稿版本",
      updateDraft: "保存草稿修改",
      resetForm: "清空表单",
      zoneRef: "区域引用",
      version: "版本",
      displayName: "区域名称",
      scopeType: "生效范围",
      employerTenant: "工厂租户",
      platformScope: "全平台",
      employerScope: "指定工厂",
      polygon: "地图圈选区域",
      effectiveFrom: "生效开始",
      effectiveUntil: "生效结束",
      changeReason: "变更原因",
      selectedVersion: "当前选中版本",
      zoneVersions: "区域版本列表",
      submitReview: "提交复核",
      review: "登记复核",
      activate: "启用版本",
      retire: "退役版本",
      reviewNote: "复核说明",
      retireReason: "退役原因",
      noZones: "暂无区域版本。",
      draftOnly: "仅草稿版本允许修改。",
    };
  }
  if (language === "km") {
    return {
      title: "វដ្តកំណែតំបន់អនុញ្ញាត",
      description:
        "គ្រប់គ្រងកំណែ Polygon តាមប្រព័ន្ធខាងក្រោយ។ អាចកែបានតែ DRAFT ហើយអ្នកពិនិត្យ និងអ្នកបើកប្រើត្រូវបំបែកពីអ្នកបង្កើត។",
      refresh: "ផ្ទុកកំណែតំបន់ឡើងវិញ",
      create: "បង្កើតកំណែព្រាង",
      updateDraft: "រក្សាទុកការកែព្រាង",
      resetForm: "សម្អាតទម្រង់",
      zoneRef: "លេខយោងតំបន់",
      version: "កំណែ",
      displayName: "ឈ្មោះតំបន់",
      scopeType: "វិសាលភាព",
      employerTenant: "អ្នកជួលរោងចក្រ",
      platformScope: "ទូទាំងប្រព័ន្ធ",
      employerScope: "រោងចក្រជាក់លាក់",
      polygon: "ផែនទីតំបន់ដែលគូស",
      effectiveFrom: "ចាប់ផ្តើមមានប្រសិទ្ធភាព",
      effectiveUntil: "បញ្ចប់មានប្រសិទ្ធភាព",
      changeReason: "មូលហេតុកែប្រែ",
      selectedVersion: "កំណែដែលបានជ្រើស",
      zoneVersions: "បញ្ជីកំណែតំបន់",
      submitReview: "ផ្ញើសម្រាប់ពិនិត្យ",
      review: "កត់ត្រាការពិនិត្យ",
      activate: "បើកប្រើកំណែ",
      retire: "បិទប្រើកំណែ",
      reviewNote: "កំណត់សម្គាល់ពិនិត្យ",
      retireReason: "ហេតុផលបិទប្រើ",
      noZones: "មិនទាន់មានកំណែតំបន់ទេ។",
      draftOnly: "អាចកែបានតែកំណែ DRAFT ប៉ុណ្ណោះ។",
    };
  }
  return {
    title: "Service area version workflow",
    description:
      "Manage versioned Polygon service areas. Only DRAFT versions are editable, and review and activation stay dual-controlled.",
    refresh: "Refresh service areas",
    create: "Create draft version",
    updateDraft: "Save draft changes",
    resetForm: "Reset form",
    zoneRef: "Zone reference",
    version: "Version",
    displayName: "Zone name",
    scopeType: "Scope",
    employerTenant: "Factory tenant",
    platformScope: "Platform-wide",
    employerScope: "Factory-specific",
    polygon: "Map-drawn service area",
    effectiveFrom: "Effective from",
    effectiveUntil: "Effective until",
    changeReason: "Change reason",
    selectedVersion: "Selected version",
    zoneVersions: "Zone versions",
    submitReview: "Submit for review",
    review: "Record review",
    activate: "Activate version",
    retire: "Retire version",
    reviewNote: "Review note",
    retireReason: "Retire reason",
    noZones: "No service area versions found.",
    draftOnly: "Only DRAFT versions can be edited.",
  };
}

function kycReviewCopy(language: Language): Readonly<{
  title: string;
  description: string;
  refresh: string;
  listTitle: string;
  detailTitle: string;
  noItems: string;
  evidenceRef: string;
  applicationNo: string;
  assessmentResult: string;
  scopeType: string;
  matchedZone: string;
  submittedAt: string;
  assessedAt: string;
  source: string;
  consentVersion: string;
  ruleVersion: string;
  auditTrail: string;
  coordinatesHidden: string;
}> {
  if (language === "zh-CN") {
    return {
      title: "KYC 定位受控复核",
      description:
        "仅展示受控定位证据与审计信息；不展示原始坐标、精度明文或任何可反推位置的字段。",
      refresh: "刷新定位证据",
      listTitle: "证据列表",
      detailTitle: "证据详情与审计",
      noItems: "暂无定位证据。",
      evidenceRef: "证据引用",
      applicationNo: "申请编号",
      assessmentResult: "判定结果",
      scopeType: "判定范围",
      matchedZone: "命中区域",
      submittedAt: "提交时间",
      assessedAt: "判定时间",
      source: "采集来源",
      consentVersion: "授权版本",
      ruleVersion: "规则版本",
      auditTrail: "审计轨迹",
      coordinatesHidden: "精确坐标已隔离，不在前台展示。",
    };
  }
  if (language === "km") {
    return {
      title: "ការពិនិត្យ KYC ទីតាំងដែលបានគ្រប់គ្រង",
      description:
        "បង្ហាញតែភស្តុតាងទីតាំង និងកំណត់ហេតុសវនកម្មដែលបានគ្រប់គ្រងប៉ុណ្ណោះ មិនបង្ហាញកូអរដោនេដើម ឬវាលដែលអាចបញ្ច្រាសទីតាំងបានទេ។",
      refresh: "ផ្ទុកភស្តុតាងទីតាំងឡើងវិញ",
      listTitle: "បញ្ជីភស្តុតាង",
      detailTitle: "ព័ត៌មានលម្អិត និងសវនកម្ម",
      noItems: "មិនទាន់មានភស្តុតាងទីតាំងទេ។",
      evidenceRef: "លេខយោងភស្តុតាង",
      applicationNo: "លេខពាក្យស្នើ",
      assessmentResult: "លទ្ធផលវាយតម្លៃ",
      scopeType: "វិសាលភាពវាយតម្លៃ",
      matchedZone: "តំបន់ដែលត្រូវគ្នា",
      submittedAt: "ពេលដាក់ស្នើ",
      assessedAt: "ពេលវាយតម្លៃ",
      source: "ប្រភព",
      consentVersion: "កំណែការយល់ព្រម",
      ruleVersion: "កំណែក្បួន",
      auditTrail: "សវនកម្ម",
      coordinatesHidden:
        "កូអរដោនេច្បាស់លាស់ត្រូវបានបំបែក និងមិនបង្ហាញនៅផ្នែកមុខឡើយ។",
    };
  }
  return {
    title: "Controlled KYC location review",
    description:
      "This view exposes only controlled location evidence and audit history. Raw coordinates, accuracy plaintext and reverse-location fields stay hidden.",
    refresh: "Refresh location evidence",
    listTitle: "Evidence list",
    detailTitle: "Evidence detail and audit",
    noItems: "No location evidence found.",
    evidenceRef: "Evidence reference",
    applicationNo: "Application number",
    assessmentResult: "Assessment result",
    scopeType: "Assessment scope",
    matchedZone: "Matched zone",
    submittedAt: "Submitted at",
    assessedAt: "Assessed at",
    source: "Source",
    consentVersion: "Consent version",
    ruleVersion: "Rule version",
    auditTrail: "Audit trail",
    coordinatesHidden:
      "Precise coordinates are isolated and never shown in the console.",
  };
}

function isServiceAreaZonesResponse(
  payload: unknown,
): payload is { zones: ServiceAreaZone[] } {
  return (
    Boolean(payload) &&
    typeof payload === "object" &&
    Array.isArray((payload as { zones?: unknown }).zones)
  );
}

function isKycEvidenceListResponse(
  payload: unknown,
): payload is { items: KycEvidenceListItem[] } {
  return (
    Boolean(payload) &&
    typeof payload === "object" &&
    Array.isArray((payload as { items?: unknown }).items)
  );
}

function isKycEvidenceDetailResponse(
  payload: unknown,
): payload is KycEvidenceDetail {
  return (
    Boolean(payload) &&
    typeof payload === "object" &&
    Boolean((payload as { evidence?: unknown }).evidence) &&
    Array.isArray((payload as { audit?: unknown }).audit)
  );
}

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
  const displayedError =
    error === "loginFailed"
      ? BROKER_COPY[language].loginFailed
      : error === "sessionFailed"
        ? BROKER_COPY[language].sessionFailed
        : error;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const response = await request("/v1/local/auth/login", {
        method: "POST",
        body: JSON.stringify({ loginName, password }),
      });
      if (!response.ok) return setError("loginFailed");
      const me = await request("/v1/local/auth/me");
      if (!me.ok) return setError("sessionFailed");
      // The account's saved language wins at sign-in. The login screen's
      // selector remains useful for a first-time operator and error copy, but
      // must never overwrite a returning operator's stored preference.
      onLogin((await me.json()) as Identity);
    } catch {
      setError("sessionFailed");
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
              onChange={(event) => {
                setLanguage(event.target.value as Language);
                // Server failures are rendered from a copy key. Clear legacy
                // session text so a manual language switch never leaves a
                // mixed-language login page behind.
                setError("");
              }}
            >
              {Object.entries(LANGUAGE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button>{BROKER_COPY[language].signIn}</button>
          {displayedError ? <p role="alert">{displayedError}</p> : null}
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
  const [serviceAreaZones, setServiceAreaZones] = useState<ServiceAreaZone[]>(
    [],
  );
  const [serviceAreaLoading, setServiceAreaLoading] = useState(false);
  const [selectedServiceAreaKey, setSelectedServiceAreaKey] = useState("");
  const [serviceAreaForm, setServiceAreaForm] = useState<ServiceAreaFormState>(
    createEmptyServiceAreaForm(),
  );
  const [serviceAreaReviewNote, setServiceAreaReviewNote] = useState("");
  const [serviceAreaRetireReason, setServiceAreaRetireReason] = useState("");
  const [kycEvidenceItems, setKycEvidenceItems] = useState<
    KycEvidenceListItem[]
  >([]);
  const [kycEvidenceLoading, setKycEvidenceLoading] = useState(false);
  const [selectedKycEvidenceRef, setSelectedKycEvidenceRef] = useState("");
  const [selectedKycEvidence, setSelectedKycEvidence] =
    useState<KycEvidenceDetail>();
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
  const refreshServiceAreaZones = async () => {
    setServiceAreaLoading(true);
    try {
      const response = await request("/v1/local/admin/service-area-zones");
      if (response.status === 401) {
        expireSession();
        return;
      }
      const payload = await response.json().catch(() => undefined);
      if (!response.ok || !isServiceAreaZonesResponse(payload)) {
        setNotice(
          `${copy.blocked} (${response.status}): ${JSON.stringify(payload ?? {})}`,
        );
        return;
      }
      setServiceAreaZones(payload.zones);
    } finally {
      setServiceAreaLoading(false);
    }
  };
  const refreshKycEvidence = async () => {
    setKycEvidenceLoading(true);
    try {
      const response = await request("/v1/local/admin/kyc-location-evidence");
      if (response.status === 401) {
        expireSession();
        return;
      }
      const payload = await response.json().catch(() => undefined);
      if (!response.ok || !isKycEvidenceListResponse(payload)) {
        setNotice(
          `${copy.blocked} (${response.status}): ${JSON.stringify(payload ?? {})}`,
        );
        return;
      }
      setKycEvidenceItems(payload.items);
    } finally {
      setKycEvidenceLoading(false);
    }
  };
  const loadKycEvidenceDetail = async (evidenceRef: string) => {
    setKycEvidenceLoading(true);
    setSelectedKycEvidence(undefined);
    setSelectedKycEvidenceRef(evidenceRef);
    try {
      const response = await request(
        `/v1/local/admin/kyc-location-evidence/${encodeURIComponent(evidenceRef)}`,
      );
      if (response.status === 401) {
        expireSession();
        return;
      }
      const payload = await response.json().catch(() => undefined);
      if (!response.ok || !isKycEvidenceDetailResponse(payload)) {
        setNotice(
          `${copy.blocked} (${response.status}): ${JSON.stringify(payload ?? {})}`,
        );
        return;
      }
      setSelectedKycEvidence(payload);
    } finally {
      setKycEvidenceLoading(false);
    }
  };
  const resetServiceAreaForm = () => {
    setSelectedServiceAreaKey("");
    setServiceAreaForm(createEmptyServiceAreaForm());
    setServiceAreaReviewNote("");
    setServiceAreaRetireReason("");
  };
  const selectServiceAreaZone = (zone: ServiceAreaZone) => {
    setSelectedServiceAreaKey(serviceAreaZoneKey(zone));
    setServiceAreaForm({
      zoneRef: zone.zoneRef,
      displayName: zone.displayName,
      scopeType: zone.scopeType,
      employerTenantId: zone.employerTenantId ?? "",
      polygonGeoJson: zone.polygonGeoJson,
      effectiveFrom: zone.effectiveFrom.slice(0, 16),
      effectiveUntil: zone.effectiveUntil?.slice(0, 16) ?? "",
      changeReason: zone.changeReason,
    });
    setServiceAreaReviewNote("");
    setServiceAreaRetireReason("");
  };
  const idempotentAdminWrite = async (
    path: string,
    method: "POST" | "PATCH",
    body: object,
    afterSuccess?: () => Promise<void>,
  ) => {
    setAdminInProgress(true);
    setNotice("");
    try {
      const response = await request(path, {
        method,
        body: JSON.stringify(body),
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        expireSession();
        return;
      }
      if (!response.ok) {
        setNotice(
          `${copy.blocked} (${response.status}): ${JSON.stringify(payload)}`,
        );
        return;
      }
      setNotice(`${copy.recorded}: ${JSON.stringify(payload)}`);
      await afterSuccess?.();
    } catch {
      setNotice(`${copy.blocked}: ${copy.adminRequestFailed}`);
    } finally {
      setAdminInProgress(false);
    }
  };
  const selectedServiceAreaZone =
    serviceAreaZones.find(
      (zone) => serviceAreaZoneKey(zone) === selectedServiceAreaKey,
    ) ?? undefined;
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
  const setTenantActivity = async (
    tenant: (typeof employerTenants)[number],
    isActive: boolean,
  ) => {
    const tenantCopy = factoryTenantCopy(identity!.preferredLanguage);
    if (
      !window.confirm(
        isActive ? tenantCopy.enableConfirm : tenantCopy.disableConfirm,
      )
    )
      return;
    await adminRequest(
      `/v1/local/admin/employer-tenants/${encodeURIComponent(tenant.id)}/activity`,
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
  const canReadKycEvidence = isBroker || isAdmin;
  const serviceCopy = serviceAreaCopy(identity.preferredLanguage);
  const kycCopy = kycReviewCopy(identity.preferredLanguage);
  const zoneStatusLabel = (status: ZoneStatus) => {
    if (identity.preferredLanguage === "zh-CN") {
      const labels: Record<ZoneStatus, string> = {
        DRAFT: "草稿",
        PENDING_REVIEW: "待复核",
        ACTIVE: "已启用",
        RETIRED: "已退役",
      };
      return labels[status];
    }
    if (identity.preferredLanguage === "km") {
      const labels: Record<ZoneStatus, string> = {
        DRAFT: "ព្រាង",
        PENDING_REVIEW: "រង់ចាំពិនិត្យ",
        ACTIVE: "កំពុងប្រើ",
        RETIRED: "បានបិទប្រើ",
      };
      return labels[status];
    }
    const labels: Record<ZoneStatus, string> = {
      DRAFT: "Draft",
      PENDING_REVIEW: "Pending review",
      ACTIVE: "Active",
      RETIRED: "Retired",
    };
    return labels[status];
  };
  const kycAssessmentLabel = (
    result: KycEvidenceListItem["assessmentResult"],
  ) => {
    if (!result) return "—";
    if (identity.preferredLanguage === "zh-CN") {
      const labels: Record<
        NonNullable<KycEvidenceListItem["assessmentResult"]>,
        string
      > = {
        MATCH: "命中区域",
        OUT_OF_ZONE: "区域外",
        OUT_OF_COUNTRY: "国家外",
        LOW_ACCURACY: "精度不足",
        UNAVAILABLE: "不可用",
      };
      return labels[result];
    }
    if (identity.preferredLanguage === "km") {
      const labels: Record<
        NonNullable<KycEvidenceListItem["assessmentResult"]>,
        string
      > = {
        MATCH: "ត្រូវនឹងតំបន់",
        OUT_OF_ZONE: "នៅក្រៅតំបន់",
        OUT_OF_COUNTRY: "នៅក្រៅប្រទេស",
        LOW_ACCURACY: "ភាពត្រឹមត្រូវមិនគ្រប់គ្រាន់",
        UNAVAILABLE: "មិនអាចប្រើបាន",
      };
      return labels[result];
    }
    const labels: Record<
      NonNullable<KycEvidenceListItem["assessmentResult"]>,
      string
    > = {
      MATCH: "Matched",
      OUT_OF_ZONE: "Out of zone",
      OUT_OF_COUNTRY: "Out of country",
      LOW_ACCURACY: "Low accuracy",
      UNAVAILABLE: "Unavailable",
    };
    return labels[result];
  };
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
            <section style={{ ...card, marginTop: 0 }}>
              <h3>{factoryTenantCopy(identity.preferredLanguage).title}</h3>
              {employerTenants.length === 0 ? (
                <p>{copy.notRecorded}</p>
              ) : (
                employerTenants.map((tenant) => {
                  const tenantCopy = factoryTenantCopy(
                    identity.preferredLanguage,
                  );
                  return (
                    <div
                      key={tenant.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(180px, 1fr) auto auto",
                        gap: 12,
                        alignItems: "center",
                        borderTop: "1px solid #e2e8f0",
                        padding: "10px 0",
                      }}
                    >
                      <span>
                        <strong>{tenant.displayName}</strong> (
                        {tenant.externalRef})
                      </span>
                      <span>
                        {tenantCopy.status}:{" "}
                        {tenant.isActive
                          ? tenantCopy.active
                          : tenantCopy.inactive}
                      </span>
                      <button
                        type="button"
                        disabled={adminInProgress}
                        onClick={() =>
                          void setTenantActivity(tenant, !tenant.isActive)
                        }
                      >
                        {tenant.isActive
                          ? tenantCopy.disable
                          : tenantCopy.enable}
                      </button>
                    </div>
                  );
                })
              )}
            </section>
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
      {isAdmin ? (
        <section style={card}>
          <h2>{serviceCopy.title}</h2>
          <p>{serviceCopy.description}</p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button
              disabled={serviceAreaLoading}
              onClick={() => void refreshServiceAreaZones()}
            >
              {serviceAreaLoading ? "…" : serviceCopy.refresh}
            </button>
            <button type="button" onClick={resetServiceAreaForm}>
              {serviceCopy.resetForm}
            </button>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(320px, 420px) minmax(0, 1fr)",
              gap: 20,
              marginTop: 18,
            }}
          >
            <form
              style={form}
              onSubmit={(event) => {
                event.preventDefault();
                if (!serviceAreaForm.polygonGeoJson) {
                  setNotice(
                    identity.preferredLanguage === "zh-CN"
                      ? "请先在地图上圈选允许借款区域。"
                      : identity.preferredLanguage === "km"
                        ? "សូមគូសតំបន់អនុញ្ញាតនៅលើផែនទីជាមុនសិន។"
                        : "Draw the service area on the map before saving.",
                  );
                  return;
                }
                const payload = {
                  zoneRef: serviceAreaForm.zoneRef.trim().toUpperCase(),
                  displayName: serviceAreaForm.displayName.trim(),
                  scopeType: serviceAreaForm.scopeType,
                  ...(serviceAreaForm.scopeType === "EMPLOYER_TENANT" &&
                  serviceAreaForm.employerTenantId
                    ? { employerTenantId: serviceAreaForm.employerTenantId }
                    : {}),
                  polygonGeoJson: serviceAreaForm.polygonGeoJson,
                  effectiveFrom: new Date(
                    serviceAreaForm.effectiveFrom,
                  ).toISOString(),
                  ...(serviceAreaForm.effectiveUntil
                    ? {
                        effectiveUntil: new Date(
                          serviceAreaForm.effectiveUntil,
                        ).toISOString(),
                      }
                    : {}),
                  changeReason: serviceAreaForm.changeReason.trim(),
                };
                if (selectedServiceAreaZone) {
                  void idempotentAdminWrite(
                    `/v1/local/admin/service-area-zones/${encodeURIComponent(selectedServiceAreaZone.zoneRef)}/drafts/${selectedServiceAreaZone.version}`,
                    "PATCH",
                    payload,
                    refreshServiceAreaZones,
                  );
                  return;
                }
                void idempotentAdminWrite(
                  "/v1/local/admin/service-area-zones",
                  "POST",
                  payload,
                  async () => {
                    await refreshServiceAreaZones();
                    resetServiceAreaForm();
                  },
                );
              }}
            >
              <h3>
                {selectedServiceAreaZone
                  ? `${serviceCopy.selectedVersion}: ${selectedServiceAreaZone.zoneRef} v${selectedServiceAreaZone.version}`
                  : serviceCopy.create}
              </h3>
              <label>
                {serviceCopy.zoneRef}
                <input
                  value={serviceAreaForm.zoneRef}
                  disabled={Boolean(selectedServiceAreaZone)}
                  onChange={(event) =>
                    setServiceAreaForm((current) => ({
                      ...current,
                      zoneRef: event.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="ZONE-PPH-001"
                  required
                />
              </label>
              <label>
                {serviceCopy.displayName}
                <input
                  value={serviceAreaForm.displayName}
                  onChange={(event) =>
                    setServiceAreaForm((current) => ({
                      ...current,
                      displayName: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label>
                {serviceCopy.scopeType}
                <select
                  value={serviceAreaForm.scopeType}
                  onChange={(event) =>
                    setServiceAreaForm((current) => ({
                      ...current,
                      scopeType: event.target.value as ZoneScopeType,
                      employerTenantId:
                        event.target.value === "EMPLOYER_TENANT"
                          ? current.employerTenantId
                          : "",
                    }))
                  }
                >
                  <option value="PLATFORM">{serviceCopy.platformScope}</option>
                  <option value="EMPLOYER_TENANT">
                    {serviceCopy.employerScope}
                  </option>
                </select>
              </label>
              {serviceAreaForm.scopeType === "EMPLOYER_TENANT" ? (
                <label>
                  {serviceCopy.employerTenant}
                  <select
                    value={serviceAreaForm.employerTenantId}
                    onChange={(event) =>
                      setServiceAreaForm((current) => ({
                        ...current,
                        employerTenantId: event.target.value,
                      }))
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
              ) : null}
              <ServiceAreaMapEditor
                label={serviceCopy.polygon}
                value={serviceAreaForm.polygonGeoJson}
                editable={
                  !selectedServiceAreaZone ||
                  selectedServiceAreaZone.status === "DRAFT"
                }
                zones={serviceAreaZones.map((zone) => ({
                  key: serviceAreaZoneKey(zone),
                  zoneRef: zone.zoneRef,
                  version: zone.version,
                  displayName: zone.displayName,
                  status: zone.status,
                  polygonGeoJson: zone.polygonGeoJson,
                }))}
                onChange={(polygonGeoJson) =>
                  setServiceAreaForm((current) => ({
                    ...current,
                    polygonGeoJson,
                  }))
                }
              />
              <label>
                {serviceCopy.effectiveFrom}
                <input
                  type="datetime-local"
                  value={serviceAreaForm.effectiveFrom}
                  onChange={(event) =>
                    setServiceAreaForm((current) => ({
                      ...current,
                      effectiveFrom: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label>
                {serviceCopy.effectiveUntil}
                <input
                  type="datetime-local"
                  value={serviceAreaForm.effectiveUntil}
                  onChange={(event) =>
                    setServiceAreaForm((current) => ({
                      ...current,
                      effectiveUntil: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                {serviceCopy.changeReason}
                <textarea
                  value={serviceAreaForm.changeReason}
                  onChange={(event) =>
                    setServiceAreaForm((current) => ({
                      ...current,
                      changeReason: event.target.value,
                    }))
                  }
                  rows={3}
                  required
                />
              </label>
              <button
                disabled={
                  adminInProgress ||
                  selectedServiceAreaZone?.status === "PENDING_REVIEW" ||
                  selectedServiceAreaZone?.status === "ACTIVE" ||
                  selectedServiceAreaZone?.status === "RETIRED"
                }
              >
                {adminInProgress
                  ? "…"
                  : selectedServiceAreaZone
                    ? serviceCopy.updateDraft
                    : serviceCopy.create}
              </button>
            </form>
            <section style={{ ...card, marginTop: 0 }}>
              <h3>{serviceCopy.zoneVersions}</h3>
              {serviceAreaZones.length === 0 ? (
                <p>{serviceCopy.noZones}</p>
              ) : (
                serviceAreaZones.map((zone) => (
                  <div
                    key={serviceAreaZoneKey(zone)}
                    style={{
                      borderTop: "1px solid #e2e8f0",
                      padding: "12px 0",
                      background:
                        selectedServiceAreaKey === serviceAreaZoneKey(zone)
                          ? "#f8fafc"
                          : "transparent",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <strong>
                          {zone.zoneRef} v{zone.version}
                        </strong>
                        <div>
                          {zone.displayName} · {zoneStatusLabel(zone.status)} ·{" "}
                          {zone.scopeType === "PLATFORM"
                            ? serviceCopy.platformScope
                            : serviceCopy.employerScope}
                        </div>
                        <div style={{ fontSize: 13, color: "#475569" }}>
                          {zone.effectiveFrom}
                          {zone.effectiveUntil
                            ? ` → ${zone.effectiveUntil}`
                            : ""}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => selectServiceAreaZone(zone)}
                      >
                        {serviceCopy.version}
                      </button>
                    </div>
                    {selectedServiceAreaKey === serviceAreaZoneKey(zone) ? (
                      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                        <p>
                          {serviceCopy.changeReason}: {zone.changeReason}
                        </p>
                        <label style={{ display: "grid", gap: 6 }}>
                          {serviceCopy.reviewNote}
                          <textarea
                            value={serviceAreaReviewNote}
                            onChange={(event) =>
                              setServiceAreaReviewNote(event.target.value)
                            }
                            rows={2}
                          />
                        </label>
                        <label style={{ display: "grid", gap: 6 }}>
                          {serviceCopy.retireReason}
                          <textarea
                            value={serviceAreaRetireReason}
                            onChange={(event) =>
                              setServiceAreaRetireReason(event.target.value)
                            }
                            rows={2}
                          />
                        </label>
                        <div
                          style={{ display: "flex", gap: 10, flexWrap: "wrap" }}
                        >
                          <button
                            type="button"
                            disabled={
                              adminInProgress || zone.status !== "DRAFT"
                            }
                            onClick={() =>
                              void idempotentAdminWrite(
                                `/v1/local/admin/service-area-zones/${encodeURIComponent(zone.zoneRef)}/drafts/${zone.version}/submit-review`,
                                "POST",
                                {},
                                refreshServiceAreaZones,
                              )
                            }
                          >
                            {serviceCopy.submitReview}
                          </button>
                          <button
                            type="button"
                            disabled={
                              adminInProgress ||
                              zone.status !== "PENDING_REVIEW"
                            }
                            onClick={() =>
                              void idempotentAdminWrite(
                                `/v1/local/admin/service-area-zones/${encodeURIComponent(zone.zoneRef)}/versions/${zone.version}/review`,
                                "POST",
                                serviceAreaReviewNote.trim()
                                  ? { reviewNote: serviceAreaReviewNote.trim() }
                                  : {},
                                refreshServiceAreaZones,
                              )
                            }
                          >
                            {serviceCopy.review}
                          </button>
                          <button
                            type="button"
                            disabled={
                              adminInProgress ||
                              zone.status !== "PENDING_REVIEW"
                            }
                            onClick={() =>
                              void idempotentAdminWrite(
                                `/v1/local/admin/service-area-zones/${encodeURIComponent(zone.zoneRef)}/versions/${zone.version}/activate`,
                                "POST",
                                {},
                                refreshServiceAreaZones,
                              )
                            }
                          >
                            {serviceCopy.activate}
                          </button>
                          <button
                            type="button"
                            disabled={
                              adminInProgress ||
                              zone.status !== "ACTIVE" ||
                              !serviceAreaRetireReason.trim()
                            }
                            onClick={() =>
                              void idempotentAdminWrite(
                                `/v1/local/admin/service-area-zones/${encodeURIComponent(zone.zoneRef)}/versions/${zone.version}/retire`,
                                "POST",
                                {
                                  retireReason: serviceAreaRetireReason.trim(),
                                },
                                refreshServiceAreaZones,
                              )
                            }
                          >
                            {serviceCopy.retire}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </section>
          </div>
        </section>
      ) : null}
      {canReadKycEvidence ? (
        <section style={card}>
          <h2>{kycCopy.title}</h2>
          <p>{kycCopy.description}</p>
          <button
            disabled={kycEvidenceLoading}
            onClick={() => void refreshKycEvidence()}
          >
            {kycEvidenceLoading ? "…" : kycCopy.refresh}
          </button>
          <p style={{ color: "#475569" }}>{kycCopy.coordinatesHidden}</p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(320px, 420px) minmax(0, 1fr)",
              gap: 20,
              marginTop: 18,
            }}
          >
            <section style={{ ...card, marginTop: 0 }}>
              <h3>{kycCopy.listTitle}</h3>
              {kycEvidenceItems.length === 0 ? (
                <p>{kycCopy.noItems}</p>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {kycEvidenceItems.map((item) => (
                    <button
                      key={item.evidenceRef}
                      type="button"
                      style={{
                        textAlign: "left",
                        padding: 12,
                        borderRadius: 8,
                        border:
                          selectedKycEvidenceRef === item.evidenceRef
                            ? "2px solid #0f172a"
                            : "1px solid #cbd5e1",
                        background: "#fff",
                      }}
                      onClick={() =>
                        void loadKycEvidenceDetail(item.evidenceRef)
                      }
                    >
                      <strong>{item.evidenceRef}</strong>
                      <div>
                        {kycCopy.applicationNo}: {item.applicationNo ?? "—"}
                      </div>
                      <div>
                        {kycCopy.assessmentResult}:{" "}
                        {kycAssessmentLabel(item.assessmentResult)}
                      </div>
                      <div>
                        {kycCopy.submittedAt}: {item.submittedAt}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
            <section style={{ ...card, marginTop: 0 }}>
              <h3>{kycCopy.detailTitle}</h3>
              {selectedKycEvidence ? (
                <>
                  <dl
                    style={{
                      display: "grid",
                      gridTemplateColumns: "max-content 1fr",
                      gap: 8,
                    }}
                  >
                    <dt>{kycCopy.evidenceRef}</dt>
                    <dd>{selectedKycEvidence.evidence.evidenceRef}</dd>
                    <dt>{kycCopy.applicationNo}</dt>
                    <dd>{selectedKycEvidence.evidence.applicationNo ?? "—"}</dd>
                    <dt>{kycCopy.assessmentResult}</dt>
                    <dd>
                      {kycAssessmentLabel(
                        selectedKycEvidence.evidence.assessmentResult,
                      )}
                    </dd>
                    <dt>{kycCopy.scopeType}</dt>
                    <dd>
                      {selectedKycEvidence.evidence.assessedScopeType ?? "—"}
                    </dd>
                    <dt>{kycCopy.matchedZone}</dt>
                    <dd>
                      {selectedKycEvidence.evidence.matchedZoneRef
                        ? `${selectedKycEvidence.evidence.matchedZoneRef} v${selectedKycEvidence.evidence.matchedZoneVersion ?? "?"}`
                        : "—"}
                    </dd>
                    <dt>{kycCopy.source}</dt>
                    <dd>{selectedKycEvidence.evidence.source}</dd>
                    <dt>{kycCopy.consentVersion}</dt>
                    <dd>{selectedKycEvidence.evidence.consentVersion}</dd>
                    <dt>{kycCopy.ruleVersion}</dt>
                    <dd>{selectedKycEvidence.evidence.ruleVersion ?? "—"}</dd>
                    <dt>{kycCopy.submittedAt}</dt>
                    <dd>{selectedKycEvidence.evidence.submittedAt}</dd>
                    <dt>{kycCopy.assessedAt}</dt>
                    <dd>{selectedKycEvidence.evidence.assessedAt ?? "—"}</dd>
                  </dl>
                  <h4 style={{ marginTop: 16 }}>{kycCopy.auditTrail}</h4>
                  {selectedKycEvidence.audit.length === 0 ? (
                    <p>{copy.notRecorded}</p>
                  ) : (
                    selectedKycEvidence.audit.map((entry, index) => (
                      <div
                        key={`${entry.eventType}-${entry.occurredAt}-${index}`}
                        style={{
                          borderTop: "1px solid #e2e8f0",
                          padding: "10px 0",
                        }}
                      >
                        <strong>{entry.eventType}</strong>
                        <div>
                          {entry.actorUserRef} · {entry.occurredAt}
                        </div>
                        <pre
                          style={{ whiteSpace: "pre-wrap", margin: "8px 0 0" }}
                        >
                          {JSON.stringify(entry.payload, null, 2)}
                        </pre>
                      </div>
                    ))
                  )}
                </>
              ) : (
                <p>{kycCopy.coordinatesHidden}</p>
              )}
            </section>
          </div>
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
