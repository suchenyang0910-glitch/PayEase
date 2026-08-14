export type ApplicantServiceCase = Readonly<{
  caseNo: string;
  caseType: "SERVICE_QUERY" | "COMPLAINT";
  status: "OPEN" | "ACKNOWLEDGED" | "REFERRED_TO_LENDER" | "RESOLVED";
  createdAt: string;
  updatedAt: string;
}>;

export type ApplicantCaseLanguage = "zh-CN" | "en" | "km";

const serviceCaseStatuses = new Set<ApplicantServiceCase["status"]>([
  "OPEN",
  "ACKNOWLEDGED",
  "REFERRED_TO_LENDER",
  "RESOLVED",
]);

/**
 * The applicant view contains metadata only. Original case text and internal
 * resolution notes remain encrypted and limited to authorized staff.
 */
export function parseApplicantServiceCaseList(
  payload: unknown,
): ApplicantServiceCase[] | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const cases = (payload as { cases?: unknown }).cases;
  if (!Array.isArray(cases)) return undefined;
  const parsed: ApplicantServiceCase[] = [];
  for (const entry of cases) {
    if (!entry || typeof entry !== "object") return undefined;
    const record = entry as Record<string, unknown>;
    if (
      typeof record.caseNo !== "string" ||
      (record.caseType !== "SERVICE_QUERY" &&
        record.caseType !== "COMPLAINT") ||
      typeof record.status !== "string" ||
      !serviceCaseStatuses.has(
        record.status as ApplicantServiceCase["status"],
      ) ||
      typeof record.createdAt !== "string" ||
      typeof record.updatedAt !== "string"
    ) {
      return undefined;
    }
    parsed.push({
      caseNo: record.caseNo,
      caseType: record.caseType,
      status: record.status as ApplicantServiceCase["status"],
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
  return parsed;
}

const labels: Readonly<
  Record<
    ApplicantCaseLanguage,
    Readonly<{
      type: Readonly<Record<ApplicantServiceCase["caseType"], string>>;
      status: Readonly<Record<ApplicantServiceCase["status"], string>>;
    }>
  >
> = {
  en: {
    type: { SERVICE_QUERY: "Service question", COMPLAINT: "Complaint" },
    status: {
      OPEN: "Received",
      ACKNOWLEDGED: "Being handled",
      REFERRED_TO_LENDER: "With the licensed lender",
      RESOLVED: "Final outcome recorded",
    },
  },
  "zh-CN": {
    type: { SERVICE_QUERY: "客服咨询", COMPLAINT: "投诉" },
    status: {
      OPEN: "已收到",
      ACKNOWLEDGED: "处理中",
      REFERRED_TO_LENDER: "已转交持牌机构",
      RESOLVED: "最终处理结果已记录",
    },
  },
  km: {
    type: { SERVICE_QUERY: "សំណួរសេវាកម្ម", COMPLAINT: "បណ្តឹង" },
    status: {
      OPEN: "បានទទួល",
      ACKNOWLEDGED: "កំពុងដំណើរការ",
      REFERRED_TO_LENDER: "បានបញ្ជូនទៅស្ថាប័នមានអាជ្ញាប័ណ្ណ",
      RESOLVED: "បានកត់ត្រាលទ្ធផលចុងក្រោយ",
    },
  },
};

export function applicantServiceCaseLabel(
  serviceCase: ApplicantServiceCase,
  language: ApplicantCaseLanguage,
): string {
  const copy = labels[language];
  return `${copy.type[serviceCase.caseType]} · ${copy.status[serviceCase.status]}`;
}
