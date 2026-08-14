export type LenderLanguage = "zh-CN" | "en" | "km";

export type LenderActionKey =
  | "initialReview"
  | "finalReview"
  | "resolveReapplication"
  | "confirmContract"
  | "openDisbursement"
  | "disbursementMaker"
  | "disbursementChecker"
  | "activateRepayment"
  | "repaymentMaker"
  | "repaymentChecker";

export type LenderCopy = Readonly<{
  title: string;
  signInDescription: string;
  account: string;
  password: string;
  signIn: string;
  loginFailed: string;
  sessionFailed: string;
  signedInAs: string;
  signOut: string;
  manualApproval: string;
  manualApprovalDescription: string;
  applicationNumber: string;
  reasonCode: string;
  creditDecision: string;
  approve: string;
  reject: string;
  returnForCorrection: string;
  approvedAmount: string;
  serviceFee: string;
  totalRepayable: string;
  installments: string;
  firstDueDate: string;
  evidenceReference: string;
  noRole: string;
  recorded: string;
  blocked: string;
  actionFailed: string;
  actions: Readonly<Record<LenderActionKey, string>>;
}>;

export const LENDER_COPY: Readonly<Record<LenderLanguage, LenderCopy>> = {
  en: {
    title: "PayEase lender console",
    signInDescription: "Sign in to use controlled lender operations.",
    account: "Account",
    password: "Password",
    signIn: "Sign in",
    loginFailed: "Login failed. Check your account and password.",
    sessionFailed: "Unable to establish a secure session. Please try again.",
    signedInAs: "Signed in as",
    signOut: "Sign out",
    manualApproval: "Controlled manual approval",
    manualApprovalDescription:
      "Actions are permitted only to server-side roles. Disbursement and repayment require two different accounts.",
    applicationNumber: "Application number",
    reasonCode: "Reason code",
    creditDecision: "Credit review decision",
    approve: "Approve",
    reject: "Reject",
    returnForCorrection: "Return for correction",
    approvedAmount: "Approved amount (USD cents; 1000–50000)",
    serviceFee: "Service fee (USD cents; may be 0)",
    totalRepayable: "Total repayable (USD cents; principal + approved charges)",
    installments: "Installments (1–6)",
    firstDueDate: "First repayment due date",
    evidenceReference: "Contract / funds evidence reference",
    noRole: "Your account has no lender-operation role.",
    recorded: "Recorded",
    blocked: "Blocked",
    actionFailed: "The request could not be sent. No operation was recorded.",
    actions: {
      initialReview: "Record initial review decision",
      finalReview: "Record final review decision",
      resolveReapplication: "Confirm reapplication condition resolved",
      confirmContract: "Confirm contract",
      openDisbursement: "Open disbursement",
      disbursementMaker: "Record disbursement maker approval",
      disbursementChecker: "Confirm disbursement (different account)",
      activateRepayment: "Activate repayment",
      repaymentMaker: "Record repayment maker approval",
      repaymentChecker: "Confirm repayment (different account)",
    },
  },
  "zh-CN": {
    title: "PayEase 持牌机构后台",
    signInDescription: "登录后使用受控的持牌机构操作。",
    account: "账号",
    password: "密码",
    signIn: "登录",
    loginFailed: "登录失败，请检查账号和密码。",
    sessionFailed: "无法建立安全会话，请重试。",
    signedInAs: "当前登录账号",
    signOut: "退出登录",
    manualApproval: "受控人工审批",
    manualApprovalDescription:
      "操作仅向服务端已授权角色开放；放款和还款核销必须由两个不同账号完成。",
    applicationNumber: "申请编号",
    reasonCode: "原因代码",
    creditDecision: "授信审核决定",
    approve: "同意",
    reject: "拒绝",
    returnForCorrection: "退回补充",
    approvedAmount: "批准金额（USD 分；1000–50000）",
    serviceFee: "服务费（USD 分；可为 0）",
    totalRepayable: "应还总额（USD 分；本金加已批准费用）",
    installments: "还款期数（1–6）",
    firstDueDate: "首期还款日",
    evidenceReference: "合同/资金凭证编号",
    noRole: "当前账号没有持牌机构操作权限。",
    recorded: "已记录",
    blocked: "操作被阻止",
    actionFailed: "请求未能发送，系统未记录任何操作。",
    actions: {
      initialReview: "记录初审决定",
      finalReview: "记录终审决定",
      resolveReapplication: "确认再次申请条件已满足",
      confirmContract: "确认合同",
      openDisbursement: "开启放款",
      disbursementMaker: "记录放款经办审批",
      disbursementChecker: "确认放款（不同账号）",
      activateRepayment: "启用还款",
      repaymentMaker: "记录还款核销经办审批",
      repaymentChecker: "确认还款核销（不同账号）",
    },
  },
  km: {
    title: "ផ្ទាំងគ្រប់គ្រងស្ថាប័នឥណទាន PayEase",
    signInDescription:
      "ចូលប្រើដើម្បីប្រើប្រតិបត្តិការរបស់ស្ថាប័នផ្តល់កម្ចីដែលត្រូវបានគ្រប់គ្រង។",
    account: "គណនី",
    password: "ពាក្យសម្ងាត់",
    signIn: "ចូលប្រើ",
    loginFailed: "មិនអាចចូលប្រើបានទេ។ សូមពិនិត្យគណនី និងពាក្យសម្ងាត់។",
    sessionFailed: "មិនអាចបង្កើតសម័យសុវត្ថិភាពបានទេ។ សូមព្យាយាមម្តងទៀត។",
    signedInAs: "បានចូលដោយ",
    signOut: "ចាកចេញ",
    manualApproval: "ការអនុម័តដោយដៃដែលមានការគ្រប់គ្រង",
    manualApprovalDescription:
      "សកម្មភាពអនុញ្ញាតតែសម្រាប់តួនាទីដែលបានកំណត់នៅម៉ាស៊ីនមេ។ ការបញ្ចេញប្រាក់ និងការកត់ត្រាសងប្រាក់ត្រូវការគណនីពីរផ្សេងគ្នា។",
    applicationNumber: "លេខពាក្យស្នើសុំ",
    reasonCode: "កូដមូលហេតុ",
    creditDecision: "សេចក្តីសម្រេចពិនិត្យឥណទាន",
    approve: "អនុម័ត",
    reject: "បដិសេធ",
    returnForCorrection: "បញ្ជូនត្រឡប់សម្រាប់កែសម្រួល",
    approvedAmount: "ចំនួនអនុម័ត (សេន USD; 1000–50000)",
    serviceFee: "កម្រៃសេវា (សេន USD; អាចជា 0)",
    totalRepayable: "ចំនួនត្រូវសងសរុប (សេន USD)",
    installments: "ចំនួនវគ្គសង (1–6)",
    firstDueDate: "កាលបរិច្ឆេទសងលើកដំបូង",
    evidenceReference: "លេខយោងភស្តុតាងកិច្ចសន្យា/ប្រាក់",
    noRole: "គណនីរបស់អ្នកមិនមានតួនាទីប្រតិបត្តិការស្ថាប័នឥណទានទេ។",
    recorded: "បានកត់ត្រា",
    blocked: "សកម្មភាពត្រូវបានទប់ស្កាត់",
    actionFailed: "មិនអាចផ្ញើសំណើបានទេ។ មិនមានប្រតិបត្តិការត្រូវបានកត់ត្រាទេ។",
    actions: {
      initialReview: "កត់ត្រាសេចក្តីសម្រេចពិនិត្យដំបូង",
      finalReview: "កត់ត្រាសេចក្តីសម្រេចពិនិត្យចុងក្រោយ",
      resolveReapplication: "បញ្ជាក់លក្ខខណ្ឌដាក់ពាក្យម្តងទៀត",
      confirmContract: "បញ្ជាក់កិច្ចសន្យា",
      openDisbursement: "បើកការបញ្ចេញប្រាក់",
      disbursementMaker: "កត់ត្រាការអនុម័តអ្នករៀបចំបញ្ចេញប្រាក់",
      disbursementChecker: "បញ្ជាក់ការបញ្ចេញប្រាក់ (គណនីផ្សេង)",
      activateRepayment: "ចាប់ផ្តើមការសងប្រាក់",
      repaymentMaker: "កត់ត្រាការអនុម័តអ្នករៀបចំកត់ត្រាសង",
      repaymentChecker: "បញ្ជាក់ការកត់ត្រាសង (គណនីផ្សេង)",
    },
  },
};
