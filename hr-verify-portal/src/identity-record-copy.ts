import type { HrLanguage } from "./hr-copy";

export type IdentityRecordCopy = Readonly<{
  label: string;
  required: string;
  action: string;
}>;

export const IDENTITY_RECORD_COPY: Readonly<
  Record<HrLanguage, IdentityRecordCopy>
> = {
  en: {
    label: "Identity document number in factory personnel record",
    required:
      "Enter the identity document number from the factory personnel record.",
    action: "Verify factory personnel record",
  },
  "zh-CN": {
    label: "工厂人事记录中的证件号码",
    required: "请输入工厂人事记录中的证件号码。",
    action: "核验工厂人事记录",
  },
  km: {
    label: "លេខឯកសារពីកំណត់ត្រាបុគ្គលិករបស់រោងចក្រ",
    required: "សូមបញ្ចូលលេខឯកសារពីកំណត់ត្រាបុគ្គលិករបស់រោងចក្រ។",
    action: "ផ្ទៀងផ្ទាត់កំណត់ត្រាបុគ្គលិករោងចក្រ",
  },
};
