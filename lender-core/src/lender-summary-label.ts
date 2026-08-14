import type { LenderLanguage } from "./lender-copy.ts";

const SERVICE_FEE_SUMMARY_LABEL: Readonly<Record<LenderLanguage, string>> = {
  en: "Approved service fee",
  "zh-CN": "已批准服务费",
  km: "កម្រៃសេវាដែលបានអនុម័ត",
};

export function lenderServiceFeeSummaryLabel(language: LenderLanguage): string {
  return SERVICE_FEE_SUMMARY_LABEL[language];
}
