export type HrLanguage = "zh-CN" | "en" | "km";

export type HrCopy = Readonly<{
  title: string;
  checking: string;
  signIn: string;
  account: string;
  password: string;
  loginFailed: string;
  sessionFailed: string;
  signedInAs: string;
  language: string;
  signOut: string;
  confirmEmployment: string;
  confirmSalaryRange: string;
  privacyBoundary: string;
  applicationNumber: string;
  reasonCode: string;
  confirm: string;
  requestCorrection: string;
  cannotVerify: string;
  recorded: string;
  blocked: string;
  requestFailed: string;
  unavailable: string;
  unavailableDescription: string;
}>;

export const HR_COPY: Readonly<Record<HrLanguage, HrCopy>> = {
  en: {
    title: "Employer verification portal",
    checking: "Checking secure session…",
    signIn: "Sign in",
    account: "Account",
    password: "Password",
    loginFailed: "Login failed. Check your account and password.",
    sessionFailed: "Unable to establish a secure session.",
    signedInAs: "Signed in as",
    language: "Language",
    signOut: "Sign out",
    confirmEmployment: "Confirm employment",
    confirmSalaryRange: "Confirm authorised salary range",
    privacyBoundary:
      "Only employment status and the authorised salary range are recorded; no payroll document is sent to the broker.",
    applicationNumber: "Application number",
    reasonCode: "Reason code",
    confirm: "Confirm",
    requestCorrection: "Request correction",
    cannotVerify: "Cannot verify",
    recorded: "Recorded",
    blocked: "Action blocked",
    requestFailed:
      "The verification request could not be sent. No decision was recorded.",
    unavailable: "Verification unavailable",
    unavailableDescription:
      "Your account has no employer HR or finance verification role.",
  },
  "zh-CN": {
    title: "企业核验门户",
    checking: "正在验证安全会话…",
    signIn: "登录",
    account: "账号",
    password: "密码",
    loginFailed: "登录失败，请检查账号和密码。",
    sessionFailed: "无法建立安全会话。",
    signedInAs: "当前登录账号",
    language: "语言",
    signOut: "退出登录",
    confirmEmployment: "确认在职状态",
    confirmSalaryRange: "确认已授权的薪资区间",
    privacyBoundary:
      "系统仅记录在职状态和已授权薪资区间，不向助贷方传送工资单。",
    applicationNumber: "申请编号",
    reasonCode: "原因代码",
    confirm: "确认核验",
    requestCorrection: "请求更正",
    cannotVerify: "无法核验",
    recorded: "已记录",
    blocked: "操作被阻止",
    requestFailed: "核验请求未能发送，系统未记录任何决定。",
    unavailable: "核验功能不可用",
    unavailableDescription: "当前账号没有企业 HR 或财务核验角色。",
  },
  km: {
    title: "វិបផតថលផ្ទៀងផ្ទាត់ក្រុមហ៊ុន",
    checking: "កំពុងផ្ទៀងផ្ទាត់សម័យសុវត្ថិភាព…",
    signIn: "ចូលប្រើ",
    account: "គណនី",
    password: "ពាក្យសម្ងាត់",
    loginFailed: "មិនអាចចូលប្រើបានទេ។ សូមពិនិត្យគណនី និងពាក្យសម្ងាត់។",
    sessionFailed: "មិនអាចបង្កើតសម័យសុវត្ថិភាពបានទេ។",
    signedInAs: "បានចូលប្រើជា",
    language: "ភាសា",
    signOut: "ចាកចេញ",
    confirmEmployment: "បញ្ជាក់ស្ថានភាពការងារ",
    confirmSalaryRange: "បញ្ជាក់ជួរប្រាក់ខែដែលបានអនុញ្ញាត",
    privacyBoundary:
      "កត់ត្រាតែស្ថានភាពការងារ និងជួរប្រាក់ខែដែលបានអនុញ្ញាតប៉ុណ្ណោះ។ មិនផ្ញើឯកសារប្រាក់ខែទៅអ្នកជំនួយឥណទានទេ។",
    applicationNumber: "លេខពាក្យស្នើ",
    reasonCode: "កូដមូលហេតុ",
    confirm: "បញ្ជាក់",
    requestCorrection: "ស្នើកែតម្រូវ",
    cannotVerify: "មិនអាចផ្ទៀងផ្ទាត់",
    recorded: "បានកត់ត្រា",
    blocked: "សកម្មភាពត្រូវបានរារាំង",
    requestFailed:
      "មិនអាចផ្ញើសំណើផ្ទៀងផ្ទាត់បានទេ។ មិនមានសេចក្តីសម្រេចត្រូវបានកត់ត្រាទេ។",
    unavailable: "មុខងារផ្ទៀងផ្ទាត់មិនអាចប្រើបាន",
    unavailableDescription:
      "គណនីរបស់អ្នកគ្មានតួនាទីផ្ទៀងផ្ទាត់ HR ឬហិរញ្ញវត្ថុរបស់ក្រុមហ៊ុនទេ។",
  },
};

export const HR_LANGUAGE_LABELS: Readonly<Record<HrLanguage, string>> = {
  "zh-CN": "中文",
  en: "English",
  km: "ខ្មែរ",
};
