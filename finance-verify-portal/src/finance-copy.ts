export type FinanceLanguage = "zh-CN" | "en" | "km";

export type FinanceCopy = Readonly<{
  title: string;
  checking: string;
  signIn: string;
  account: string;
  password: string;
  loginFailed: string;
  sessionFailed: string;
  sessionExpired: string;
  signedInAs: string;
  language: string;
  signOut: string;
  queueTitle: string;
  queueDescription: string;
  assignee: string;
  assigneePlaceholder: string;
  reasonCode: string;
  loadQueue: string;
  application: string;
  evidence: string;
  status: string;
  assigned: string;
  actions: string;
  assign: string;
  match: string;
  difference: string;
  close: string;
  recorded: string;
  blocked: string;
  requestFailed: string;
  loadFailed: string;
  unavailable: string;
  unavailableDescription: string;
}>;

export const FINANCE_COPY: Readonly<Record<FinanceLanguage, FinanceCopy>> = {
  en: {
    title: "Employer finance reconciliation",
    checking: "Checking secure session…",
    signIn: "Sign in",
    account: "Account",
    password: "Password",
    loginFailed: "Login failed. Check your account and password.",
    sessionFailed: "Unable to establish a secure session.",
    sessionExpired: "Your secure session has expired. Please sign in again.",
    signedInAs: "Signed in as",
    language: "Language",
    signOut: "Sign out",
    queueTitle: "Manual reconciliation work queue",
    queueDescription:
      "Only assigned finance accounts can match, flag a difference, or close a work item.",
    assignee: "Assign to account",
    assigneePlaceholder: "finance.account",
    reasonCode: "Resolution reason",
    loadQueue: "Load open queue",
    application: "Application",
    evidence: "Evidence",
    status: "Status",
    assigned: "Assigned",
    actions: "Actions",
    assign: "Assign",
    match: "Match",
    difference: "Difference",
    close: "Close",
    recorded: "Recorded",
    blocked: "Action blocked",
    requestFailed:
      "The reconciliation request could not be sent. No change was recorded.",
    loadFailed: "The open reconciliation queue could not be loaded.",
    unavailable: "Reconciliation unavailable",
    unavailableDescription:
      "Your account does not hold the EMPLOYER_FINANCE role.",
  },
  "zh-CN": {
    title: "企业财务对账门户",
    checking: "正在验证安全会话…",
    signIn: "登录",
    account: "账号",
    password: "密码",
    loginFailed: "登录失败，请检查账号和密码。",
    sessionFailed: "无法建立安全会话。",
    sessionExpired: "安全会话已过期，请重新登录。",
    signedInAs: "当前登录账号",
    language: "语言",
    signOut: "退出登录",
    queueTitle: "人工对账工作队列",
    queueDescription: "仅被分配的财务账号可匹配、标记差异或关闭对账事项。",
    assignee: "分配给账号",
    assigneePlaceholder: "finance.account",
    reasonCode: "处理原因",
    loadQueue: "加载待处理队列",
    application: "申请编号",
    evidence: "凭证",
    status: "状态",
    assigned: "已分配",
    actions: "操作",
    assign: "分配",
    match: "匹配",
    difference: "标记差异",
    close: "关闭",
    recorded: "已记录",
    blocked: "操作被阻止",
    requestFailed: "对账请求未能发送，系统未记录任何变更。",
    loadFailed: "无法加载待处理对账队列。",
    unavailable: "对账功能不可用",
    unavailableDescription: "当前账号没有 EMPLOYER_FINANCE 角色。",
  },
  km: {
    title: "វិបផតថលផ្ទៀងផ្ទាត់ហិរញ្ញវត្ថុក្រុមហ៊ុន",
    checking: "កំពុងផ្ទៀងផ្ទាត់សម័យសុវត្ថិភាព…",
    signIn: "ចូលប្រើ",
    account: "គណនី",
    password: "ពាក្យសម្ងាត់",
    loginFailed: "មិនអាចចូលប្រើបានទេ។ សូមពិនិត្យគណនី និងពាក្យសម្ងាត់។",
    sessionFailed: "មិនអាចបង្កើតសម័យសុវត្ថិភាពបានទេ។",
    sessionExpired: "សម័យសុវត្ថិភាពរបស់អ្នកបានផុតកំណត់។ សូមចូលប្រើម្តងទៀត។",
    signedInAs: "បានចូលប្រើជា",
    language: "ភាសា",
    signOut: "ចាកចេញ",
    queueTitle: "បញ្ជីការងារផ្ទៀងផ្ទាត់ដោយដៃ",
    queueDescription:
      "មានតែគណនីហិរញ្ញវត្ថុដែលបានចាត់តាំងប៉ុណ្ណោះ អាចផ្គូផ្គង សម្គាល់ភាពខុសគ្នា ឬបិទកិច្ចការ។",
    assignee: "ចាត់តាំងទៅគណនី",
    assigneePlaceholder: "finance.account",
    reasonCode: "មូលហេតុដោះស្រាយ",
    loadQueue: "ផ្ទុកបញ្ជីកំពុងបើក",
    application: "លេខពាក្យស្នើ",
    evidence: "ភស្តុតាង",
    status: "ស្ថានភាព",
    assigned: "បានចាត់តាំង",
    actions: "សកម្មភាព",
    assign: "ចាត់តាំង",
    match: "ផ្គូផ្គង",
    difference: "សម្គាល់ភាពខុសគ្នា",
    close: "បិទ",
    recorded: "បានកត់ត្រា",
    blocked: "សកម្មភាពត្រូវបានរារាំង",
    requestFailed:
      "មិនអាចផ្ញើសំណើផ្ទៀងផ្ទាត់បានទេ។ មិនមានការផ្លាស់ប្តូរត្រូវបានកត់ត្រាទេ។",
    loadFailed: "មិនអាចផ្ទុកបញ្ជីការងារផ្ទៀងផ្ទាត់បានទេ។",
    unavailable: "មុខងារផ្ទៀងផ្ទាត់មិនអាចប្រើបាន",
    unavailableDescription: "គណនីរបស់អ្នកគ្មានតួនាទី EMPLOYER_FINANCE ទេ។",
  },
};

export const FINANCE_LANGUAGE_LABELS: Readonly<
  Record<FinanceLanguage, string>
> = {
  "zh-CN": "中文",
  en: "English",
  km: "ខ្មែរ",
};
