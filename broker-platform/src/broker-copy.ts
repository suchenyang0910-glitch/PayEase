export type BrokerLanguage = "zh-CN" | "en" | "km";

export type BrokerCopy = Readonly<{
  title: string;
  checkingSession: string;
  signIn: string;
  signInDescription: string;
  account: string;
  password: string;
  loginFailed: string;
  sessionFailed: string;
  sessionExpired: string;
  signedInAs: string;
  language: string;
  signOut: string;
  reviewTitle: string;
  applicationNumber: string;
  reasonCode: string;
  viewProfile: string;
  documentsComplete: string;
  requestSupplement: string;
  applicantProfile: string;
  accessLogged: string;
  fullName: string;
  phone: string;
  employer: string;
  personalConsent: string;
  phoneConsent: string;
  notRecorded: string;
  profileUnavailable: string;
  profileRequestFailed: string;
  profileAccessRecorded: string;
  recorded: string;
  blocked: string;
  reviewRequestFailed: string;
  adminRequestFailed: string;
  directoryTitle: string;
  directoryDescription: string;
  refreshDirectory: string;
  createDepartment: string;
  createRole: string;
  createAccount: string;
  domain: string;
  code: string;
  chineseName: string;
  englishName: string;
  khmerName: string;
  loginName: string;
  temporaryPassword: string;
  departmentCode: string;
  roleCodes: string;
  defaultLanguage: string;
  directoryData: string;
  accountDirectory: string;
  accountStatus: string;
  accountActive: string;
  accountInactive: string;
  enableAccount: string;
  enableAccountConfirm: string;
  disableAccount: string;
  disableAccountConfirm: string;
  updateRoles: string;
  updateRolesConfirm: string;
  unavailableTitle: string;
  unavailableDescription: string;
}>;

export const BROKER_COPY: Readonly<Record<BrokerLanguage, BrokerCopy>> = {
  en: {
    title: "PayEase broker console",
    checkingSession: "Checking secure session…",
    signIn: "Sign in",
    signInDescription: "Sign in to access controlled operations.",
    account: "Account",
    password: "Password",
    loginFailed: "Login failed. Check your account and password.",
    sessionFailed: "Session could not be established.",
    sessionExpired: "Your secure session has expired. Please sign in again.",
    signedInAs: "Signed in as",
    language: "Language",
    signOut: "Sign out",
    reviewTitle: "Document review and employer-verification handoff",
    applicationNumber: "Application number",
    reasonCode: "Reason code",
    viewProfile: "View authorised profile",
    documentsComplete: "Documents complete",
    requestSupplement: "Request supplement",
    applicantProfile: "Applicant profile",
    accessLogged: "access logged",
    fullName: "Full name",
    phone: "Phone",
    employer: "Employer",
    personalConsent: "Personal-data consent",
    phoneConsent: "Phone consent",
    notRecorded: "Not recorded",
    profileUnavailable: "Profile unavailable",
    profileRequestFailed:
      "The profile could not be retrieved. No profile data is displayed.",
    profileAccessRecorded: "Profile access recorded in the audit log.",
    recorded: "Recorded",
    blocked: "Action blocked",
    reviewRequestFailed:
      "The review request could not be sent. No review decision was recorded.",
    adminRequestFailed:
      "The directory request could not be sent. No directory change was recorded.",
    directoryTitle: "Platform directory administration",
    directoryDescription:
      "Create departments, roles and accounts. New accounts carry their own default language preference and role set.",
    refreshDirectory: "Refresh directory",
    createDepartment: "Create department",
    createRole: "Create role",
    createAccount: "Create account",
    domain: "Domain",
    code: "Code",
    chineseName: "Chinese name",
    englishName: "English name",
    khmerName: "Khmer name",
    loginName: "Login name",
    temporaryPassword: "Temporary password",
    departmentCode: "Department code",
    roleCodes: "Role codes (comma separated)",
    defaultLanguage: "Default language",
    directoryData: "Directory data",
    accountDirectory: "Account directory",
    accountStatus: "Status",
    accountActive: "Active",
    accountInactive: "Disabled",
    enableAccount: "Enable account",
    enableAccountConfirm:
      "Enable this account? It will be able to sign in again.",
    disableAccount: "Disable account",
    disableAccountConfirm:
      "Disable this account and revoke all of its active sessions?",
    updateRoles: "Update roles",
    updateRolesConfirm:
      "Update this account's roles and revoke all of its active sessions?",
    unavailableTitle: "Operations unavailable",
    unavailableDescription:
      "Your account has no broker or platform-administration role.",
  },
  "zh-CN": {
    title: "PayEase 助贷运营后台",
    checkingSession: "正在验证安全会话…",
    signIn: "登录",
    signInDescription: "登录后使用受控运营功能。",
    account: "账号",
    password: "密码",
    loginFailed: "登录失败，请检查账号和密码。",
    sessionFailed: "无法建立安全会话。",
    sessionExpired: "安全会话已过期，请重新登录。",
    signedInAs: "当前登录账号",
    language: "语言",
    signOut: "退出登录",
    reviewTitle: "资料审核与企业核验流转",
    applicationNumber: "申请编号",
    reasonCode: "原因代码",
    viewProfile: "查看已授权资料",
    documentsComplete: "资料齐全",
    requestSupplement: "请求补件",
    applicantProfile: "申请人资料",
    accessLogged: "访问已记录",
    fullName: "姓名",
    phone: "手机号",
    employer: "雇主",
    personalConsent: "个人数据授权",
    phoneConsent: "手机号授权",
    notRecorded: "未记录",
    profileUnavailable: "资料不可用",
    profileRequestFailed: "暂时无法读取资料，当前未展示任何资料数据。",
    profileAccessRecorded: "资料访问已写入审计日志。",
    recorded: "已记录",
    blocked: "操作被阻止",
    reviewRequestFailed: "审核请求未能发送，系统未记录任何审核决定。",
    adminRequestFailed: "目录管理请求未能发送，系统未记录任何目录变更。",
    directoryTitle: "平台组织目录管理",
    directoryDescription:
      "创建部门、角色和账号。新账号拥有独立的默认语言和角色集合。",
    refreshDirectory: "刷新目录",
    createDepartment: "创建部门",
    createRole: "创建角色",
    createAccount: "创建账号",
    domain: "业务域",
    code: "编码",
    chineseName: "中文名称",
    englishName: "英文名称",
    khmerName: "高棉名称",
    loginName: "登录名",
    temporaryPassword: "临时密码",
    departmentCode: "部门编码",
    roleCodes: "角色编码（逗号分隔）",
    defaultLanguage: "默认语言",
    directoryData: "目录数据",
    accountDirectory: "账号目录",
    accountStatus: "状态",
    accountActive: "启用",
    accountInactive: "已禁用",
    enableAccount: "启用账号",
    enableAccountConfirm: "确认启用该账号吗？该账号将可以重新登录。",
    disableAccount: "禁用账号",
    disableAccountConfirm: "确认禁用该账号并撤销其所有有效会话吗？",
    updateRoles: "更新角色",
    updateRolesConfirm: "确认更新该账号的角色并撤销其所有有效会话吗？",
    unavailableTitle: "运营功能不可用",
    unavailableDescription: "当前账号没有助贷运营或平台目录管理权限。",
  },
  km: {
    title: "ផ្ទាំងប្រតិបត្តិការ PayEase",
    checkingSession: "កំពុងផ្ទៀងផ្ទាត់សម័យសុវត្ថិភាព…",
    signIn: "ចូលប្រើ",
    signInDescription: "ចូលប្រើដើម្បីប្រើមុខងារប្រតិបត្តិការដែលបានគ្រប់គ្រង។",
    account: "គណនី",
    password: "ពាក្យសម្ងាត់",
    loginFailed: "មិនអាចចូលប្រើបានទេ។ សូមពិនិត្យគណនី និងពាក្យសម្ងាត់។",
    sessionFailed: "មិនអាចបង្កើតសម័យសុវត្ថិភាពបានទេ។",
    sessionExpired: "សម័យសុវត្ថិភាពរបស់អ្នកបានផុតកំណត់។ សូមចូលប្រើម្តងទៀត។",
    signedInAs: "បានចូលប្រើជា",
    language: "ភាសា",
    signOut: "ចាកចេញ",
    reviewTitle: "ពិនិត្យឯកសារ និងបញ្ជូនសម្រាប់ការផ្ទៀងផ្ទាត់ក្រុមហ៊ុន",
    applicationNumber: "លេខពាក្យស្នើ",
    reasonCode: "កូដមូលហេតុ",
    viewProfile: "មើលព័ត៌មានដែលបានអនុញ្ញាត",
    documentsComplete: "ឯកសារគ្រប់គ្រាន់",
    requestSupplement: "ស្នើឯកសារបន្ថែម",
    applicantProfile: "ព័ត៌មានអ្នកដាក់ពាក្យ",
    accessLogged: "ការចូលមើលត្រូវបានកត់ត្រា",
    fullName: "ឈ្មោះពេញ",
    phone: "លេខទូរស័ព្ទ",
    employer: "និយោជក",
    personalConsent: "ការយល់ព្រមទិន្នន័យផ្ទាល់ខ្លួន",
    phoneConsent: "ការយល់ព្រមលេខទូរស័ព្ទ",
    notRecorded: "មិនបានកត់ត្រា",
    profileUnavailable: "មិនអាចប្រើព័ត៌មានបាន",
    profileRequestFailed:
      "មិនអាចទាញយកព័ត៌មានបានទេ។ មិនមានព័ត៌មានត្រូវបានបង្ហាញទេ។",
    profileAccessRecorded:
      "ការចូលមើលព័ត៌មានត្រូវបានកត់ត្រាក្នុងកំណត់ហេតុសវនកម្ម។",
    recorded: "បានកត់ត្រា",
    blocked: "សកម្មភាពត្រូវបានរារាំង",
    reviewRequestFailed:
      "មិនអាចផ្ញើសំណើពិនិត្យបានទេ។ មិនមានសេចក្តីសម្រេចពិនិត្យត្រូវបានកត់ត្រាទេ។",
    adminRequestFailed:
      "មិនអាចផ្ញើសំណើគ្រប់គ្រងបញ្ជីបានទេ។ មិនមានការផ្លាស់ប្តូរបញ្ជីត្រូវបានកត់ត្រាទេ។",
    directoryTitle: "ការគ្រប់គ្រងបញ្ជីអង្គភាពវេទិកា",
    directoryDescription:
      "បង្កើតនាយកដ្ឋាន តួនាទី និងគណនី។ គណនីថ្មីមានភាសាលំនាំដើម និងតួនាទីផ្ទាល់ខ្លួន។",
    refreshDirectory: "ធ្វើឱ្យបញ្ជីថ្មី",
    createDepartment: "បង្កើតនាយកដ្ឋាន",
    createRole: "បង្កើតតួនាទី",
    createAccount: "បង្កើតគណនី",
    domain: "ដែន",
    code: "កូដ",
    chineseName: "ឈ្មោះចិន",
    englishName: "ឈ្មោះអង់គ្លេស",
    khmerName: "ឈ្មោះខ្មែរ",
    loginName: "ឈ្មោះចូលប្រើ",
    temporaryPassword: "ពាក្យសម្ងាត់បណ្តោះអាសន្ន",
    departmentCode: "កូដនាយកដ្ឋាន",
    roleCodes: "កូដតួនាទី (បំបែកដោយសញ្ញាក្បៀស)",
    defaultLanguage: "ភាសាលំនាំដើម",
    directoryData: "ទិន្នន័យបញ្ជី",
    accountDirectory: "បញ្ជីគណនី",
    accountStatus: "ស្ថានភាព",
    accountActive: "កំពុងប្រើ",
    accountInactive: "បានបិទ",
    enableAccount: "បើកគណនីឡើងវិញ",
    enableAccountConfirm: "បើកគណនីនេះឬ? គណនីនេះអាចចូលប្រើឡើងវិញបាន។",
    disableAccount: "បិទគណនី",
    disableAccountConfirm: "បិទគណនីនេះ និងដកហូតសម័យដែលកំពុងប្រើទាំងអស់ឬ?",
    updateRoles: "កែប្រែតួនាទី",
    updateRolesConfirm: "កែប្រែតួនាទីគណនីនេះ និងដកហូតសម័យដែលកំពុងប្រើទាំងអស់ឬ?",
    unavailableTitle: "មុខងារប្រតិបត្តិការមិនអាចប្រើបាន",
    unavailableDescription:
      "គណនីរបស់អ្នកគ្មានតួនាទីប្រតិបត្តិការជំនួយឥណទាន ឬគ្រប់គ្រងបញ្ជីវេទិកា។",
  },
};

export const LANGUAGE_LABELS: Readonly<Record<BrokerLanguage, string>> = {
  "zh-CN": "中文",
  en: "English",
  km: "ខ្មែរ",
};
