import type { LenderLanguage } from "./lender-copy.ts";

const SERVICE_CASE_TYPE_LABELS: Readonly<
  Record<LenderLanguage, Readonly<Record<string, string>>>
> = {
  en: {
    SERVICE_QUERY: "Service request",
    COMPLAINT: "Complaint",
  },
  "zh-CN": {
    SERVICE_QUERY: "服务咨询",
    COMPLAINT: "投诉",
  },
  km: {
    SERVICE_QUERY: "សំណើសេវាកម្ម",
    COMPLAINT: "បណ្តឹងតវ៉ា",
  },
};

export function lenderServiceCaseTypeLabel(
  caseType: string,
  language: LenderLanguage,
): string {
  return SERVICE_CASE_TYPE_LABELS[language][caseType] ?? caseType;
}
