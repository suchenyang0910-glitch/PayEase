import type { BrokerLanguage } from "./broker-copy";

const CASE_TYPE_LABELS: Readonly<
  Record<BrokerLanguage, Readonly<Record<string, string>>>
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

const CASE_STATUS_LABELS: Readonly<
  Record<BrokerLanguage, Readonly<Record<string, string>>>
> = {
  en: {
    OPEN: "New",
    ACKNOWLEDGED: "Acknowledged",
    REFERRED_TO_LENDER: "Referred to licensed lender",
    RESOLVED: "Resolved",
  },
  "zh-CN": {
    OPEN: "待受理",
    ACKNOWLEDGED: "处理中",
    REFERRED_TO_LENDER: "已转交持牌机构",
    RESOLVED: "已处理",
  },
  km: {
    OPEN: "ករណីថ្មី",
    ACKNOWLEDGED: "បានទទួលយក",
    REFERRED_TO_LENDER: "បានបញ្ជូនទៅស្ថាប័នមានអាជ្ញាប័ណ្ណ",
    RESOLVED: "បានដោះស្រាយ",
  },
};

export function brokerServiceCaseTypeLabel(
  caseType: string,
  language: BrokerLanguage,
): string {
  return CASE_TYPE_LABELS[language][caseType] ?? caseType;
}

export function brokerServiceCaseStatusLabel(
  status: string,
  language: BrokerLanguage,
): string {
  return CASE_STATUS_LABELS[language][status] ?? status;
}
