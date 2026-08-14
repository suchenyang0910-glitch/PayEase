export type ApplicantServiceCase = Readonly<{
  caseNo: string;
  caseType: "SERVICE_QUERY" | "COMPLAINT";
  status: "OPEN" | "ACKNOWLEDGED" | "REFERRED_TO_LENDER" | "RESOLVED";
  createdAt: string;
  updatedAt: string;
}>;

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
