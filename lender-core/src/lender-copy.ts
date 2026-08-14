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
  checking: string;
  signInDescription: string;
  account: string;
  password: string;
  signIn: string;
  loginFailed: string;
  sessionFailed: string;
  sessionExpired: string;
  signedInAs: string;
  signOut: string;
  manualApproval: string;
  manualApprovalDescription: string;
  applicationNumber: string;
  loadApplication: string;
  applicationLoadFailed: string;
  applicationSnapshot: string;
  applicationStatus: string;
  requestedAmount: string;
  tenor: string;
  approvedAmountSummary: string;
  loanTerms: string;
  repaymentProgress: string;
  noActionForCurrentStatus: string;
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
  invalidFinalReviewTerms: string;
  complaintResolution: string;
  complaintResolutionDescription: string;
  refreshComplaintQueue: string;
  noReferredComplaints: string;
  viewComplaint: string;
  finalResolutionReasonCode: string;
  resolveComplaint: string;
  complaintContentAudited: string;
  complaintLoadFailed: string;
  complaintResolveFailed: string;
  actions: Readonly<Record<LenderActionKey, string>>;
}>;

type ComplaintCopy = Pick<
  LenderCopy,
  | "complaintResolution"
  | "complaintResolutionDescription"
  | "refreshComplaintQueue"
  | "noReferredComplaints"
  | "viewComplaint"
  | "finalResolutionReasonCode"
  | "resolveComplaint"
  | "complaintContentAudited"
  | "complaintLoadFailed"
  | "complaintResolveFailed"
>;

const COMPLAINT_COPY: Readonly<Record<LenderLanguage, ComplaintCopy>> = {
  en: {
    complaintResolution: "Customer complaints referred by the broker",
    complaintResolutionDescription:
      "Read the encrypted case only when needed. The licensed lender owns the final complaint decision and its recorded reason.",
    refreshComplaintQueue: "Refresh referred cases",
    noReferredComplaints: "No complaints are currently referred to the lender.",
    viewComplaint: "View case details",
    finalResolutionReasonCode: "Final resolution reason code",
    resolveComplaint: "Record final resolution",
    complaintContentAudited: "Case content (access is audited)",
    complaintLoadFailed: "Complaint details are currently unavailable.",
    complaintResolveFailed:
      "The complaint could not be resolved. No final decision was recorded.",
  },
  "zh-CN": {
    complaintResolution: "助贷转交的客户投诉",
    complaintResolutionDescription:
      "仅在处理需要时查看加密工单。最终投诉决定及原因由持牌机构负责并留痕。",
    refreshComplaintQueue: "刷新已转交工单",
    noReferredComplaints: "当前没有转交给持牌机构的投诉。",
    viewComplaint: "查看工单详情",
    finalResolutionReasonCode: "最终处理原因代码",
    resolveComplaint: "记录最终处理结果",
    complaintContentAudited: "工单内容（访问已留痕）",
    complaintLoadFailed: "暂时无法读取投诉详情。",
    complaintResolveFailed: "暂时无法完成投诉处理，未记录最终决定。",
  },
  km: {
    complaintResolution: "បណ្តឹងអតិថិជនដែលបានបញ្ជូនដោយក្រុមសេវាកម្ម",
    complaintResolutionDescription:
      "សូមមើលខ្លឹមសារដែលបានអ៊ិនគ្រីបតែនៅពេលចាំបាច់។ ស្ថាប័នមានអាជ្ញាប័ណ្ណទទួលខុសត្រូវចំពោះសេចក្តីសម្រេចចុងក្រោយ និងហេតុផលដែលបានកត់ត្រា។",
    refreshComplaintQueue: "ផ្ទុកបណ្តឹងដែលបានបញ្ជូនឡើងវិញ",
    noReferredComplaints: "បច្ចុប្បន្នមិនមានបណ្តឹងដែលបានបញ្ជូនទៅស្ថាប័នទេ។",
    viewComplaint: "មើលព័ត៌មានលម្អិតសំណើ",
    finalResolutionReasonCode: "កូដមូលហេតុនៃការដោះស្រាយចុងក្រោយ",
    resolveComplaint: "កត់ត្រាការដោះស្រាយចុងក្រោយ",
    complaintContentAudited: "ខ្លឹមសារសំណើ (ការចូលប្រើត្រូវបានកត់ត្រា)",
    complaintLoadFailed: "មិនអាចអានព័ត៌មានលម្អិតនៃបណ្តឹងបានទេ។",
    complaintResolveFailed:
      "មិនអាចដោះស្រាយបណ្តឹងបានទេ ហើយមិនមានកំណត់ត្រាសេចក្តីសម្រេចចុងក្រោយទេ។",
  },
};

export const LENDER_COPY: Readonly<Record<LenderLanguage, LenderCopy>> = {
  en: {
    ...COMPLAINT_COPY.en,
    title: "PayEase lender console",
    checking: "Checking secure session…",
    signInDescription: "Sign in to use controlled lender operations.",
    account: "Account",
    password: "Password",
    signIn: "Sign in",
    loginFailed: "Login failed. Check your account and password.",
    sessionFailed: "Unable to establish a secure session. Please try again.",
    sessionExpired: "Your secure session has expired. Please sign in again.",
    signedInAs: "Signed in as",
    signOut: "Sign out",
    manualApproval: "Controlled manual approval",
    manualApprovalDescription:
      "Actions are permitted only to server-side roles. Disbursement and repayment require two different accounts.",
    applicationNumber: "Application number",
    loadApplication: "Load application",
    applicationLoadFailed:
      "This application is unavailable or its returned data is incomplete.",
    applicationSnapshot: "Authoritative application snapshot",
    applicationStatus: "Current status",
    requestedAmount: "Requested amount",
    tenor: "Tenor (days)",
    approvedAmountSummary: "Approved amount",
    loanTerms: "Loan terms",
    repaymentProgress: "Repayment (paid / unpaid; outstanding)",
    noActionForCurrentStatus:
      "No action assigned to your roles is available for this status.",
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
    invalidFinalReviewTerms:
      "For approval, enter a USD 10–500 amount, 1–6 installments, a due date, and a total that includes the approved fee.",
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
    ...COMPLAINT_COPY["zh-CN"],
    title: "PayEase 持牌机构后台",
    checking: "正在验证安全会话…",
    signInDescription: "登录后使用受控的持牌机构操作。",
    account: "账号",
    password: "密码",
    signIn: "登录",
    loginFailed: "登录失败，请检查账号和密码。",
    sessionFailed: "无法建立安全会话，请重试。",
    sessionExpired: "安全会话已过期，请重新登录。",
    signedInAs: "当前登录账号",
    signOut: "退出登录",
    manualApproval: "受控人工审批",
    manualApprovalDescription:
      "操作仅向服务端已授权角色开放；放款和还款核销必须由两个不同账号完成。",
    applicationNumber: "申请编号",
    loadApplication: "读取申请",
    applicationLoadFailed: "无法读取该申请，或返回的申请数据不完整。",
    applicationSnapshot: "申请权威快照",
    applicationStatus: "当前状态",
    requestedAmount: "申请金额",
    tenor: "期限（天）",
    approvedAmountSummary: "批准金额",
    loanTerms: "借款条款",
    repaymentProgress: "还款（已还 / 未还；待还）",
    noActionForCurrentStatus: "当前状态没有分配给你角色的可执行操作。",
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
    invalidFinalReviewTerms:
      "如选择同意，请填写 USD 10–500 的批准金额、1–6 期、首期还款日，以及不低于本金加已批准费用的应还总额。",
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
    checking: "កំពុងផ្ទៀងផ្ទាត់សម័យសុវត្ថិភាព…",
    signInDescription:
      "ចូលប្រើដើម្បីប្រើប្រតិបត្តិការរបស់ស្ថាប័នផ្តល់កម្ចីដែលត្រូវបានគ្រប់គ្រង។",
    account: "គណនី",
    password: "ពាក្យសម្ងាត់",
    signIn: "ចូលប្រើ",
    loginFailed: "មិនអាចចូលប្រើបានទេ។ សូមពិនិត្យគណនី និងពាក្យសម្ងាត់។",
    sessionFailed: "មិនអាចបង្កើតសម័យសុវត្ថិភាពបានទេ។ សូមព្យាយាមម្តងទៀត។",
    sessionExpired: "សម័យសុវត្ថិភាពរបស់អ្នកបានផុតកំណត់។ សូមចូលប្រើម្តងទៀត។",
    signedInAs: "បានចូលដោយ",
    signOut: "ចាកចេញ",
    manualApproval: "ការអនុម័តដោយដៃដែលមានការគ្រប់គ្រង",
    manualApprovalDescription:
      "សកម្មភាពអនុញ្ញាតតែសម្រាប់តួនាទីដែលបានកំណត់នៅម៉ាស៊ីនមេ។ ការបញ្ចេញប្រាក់ និងការកត់ត្រាសងប្រាក់ត្រូវការគណនីពីរផ្សេងគ្នា។",
    applicationNumber: "លេខពាក្យស្នើសុំ",
    loadApplication: "ផ្ទុកពាក្យស្នើសុំ",
    applicationLoadFailed:
      "មិនអាចផ្ទុកពាក្យស្នើសុំនេះ ឬទិន្នន័យដែលបានត្រឡប់មកវិញមិនពេញលេញ។",
    applicationSnapshot: "ព័ត៌មានពាក្យស្នើសុំដែលមានសិទ្ធិអំណាច",
    applicationStatus: "ស្ថានភាពបច្ចុប្បន្ន",
    requestedAmount: "ចំនួនដែលបានស្នើ",
    tenor: "រយៈពេល (ថ្ងៃ)",
    approvedAmountSummary: "ចំនួនដែលបានអនុម័ត",
    loanTerms: "លក្ខខណ្ឌឥណទាន",
    repaymentProgress: "ការសង (បានសង / មិនទាន់សង; នៅសល់)",
    noActionForCurrentStatus:
      "មិនមានសកម្មភាពសម្រាប់តួនាទីរបស់អ្នកនៅក្នុងស្ថានភាពនេះទេ។",
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
    invalidFinalReviewTerms:
      "សម្រាប់ការអនុម័ត សូមបញ្ចូលចំនួន USD 10–500 ចំនួនវគ្គ 1–6 កាលបរិច្ឆេទសង និងចំនួនសរុបដែលរួមបញ្ចូលកម្រៃដែលបានអនុម័ត។",
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
    ...COMPLAINT_COPY.km,
  },
};
