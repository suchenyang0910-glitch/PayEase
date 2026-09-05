import type { LanguageCode } from "@payease/v1-domain";

export type UserTab =
  | "home"
  | "orders"
  | "order-detail"
  | "repayment"
  | "profile"
  | "notifications"
  | "notification-detail"
  | "help-guide"
  | "help-safety";

export const USER_TABS: readonly Exclude<
  UserTab,
  | "order-detail"
  | "notifications"
  | "notification-detail"
  | "help-guide"
  | "help-safety"
>[] = ["home", "orders", "repayment", "profile"] as const;

export type UserSkeletonCopy = Readonly<{
  tabs: Readonly<
    Record<
      Exclude<
        UserTab,
        | "order-detail"
        | "notifications"
        | "notification-detail"
        | "help-guide"
        | "help-safety"
      >,
      string
    >
  >;
  backToOrders: string;
  home: Readonly<{
    title: string;
    subtitle: string;
    card: string;
    quickChoices: string;
    termChoices: string;
  }>;
  orders: Readonly<{
    title: string;
    empty: string;
    listHint: string;
    openDetail: string;
  }>;
  orderDetail: Readonly<{
    title: string;
    backHint: string;
    empty: string;
    summary: string;
    actions: string;
  }>;
  notifications: Readonly<{
    title: string;
    empty: string;
    backHint: string;
  }>;
  notificationDetail: Readonly<{
    title: string;
    backHint: string;
    empty: string;
  }>;
  repayment: Readonly<{
    title: string;
    empty: string;
    summary: string;
    installmentList: string;
    authorizationNotice: string;
    support: string;
  }>;
  profile: Readonly<{
    title: string;
    telegram: string;
    phone: string;
    factory: string;
    language: string;
    support: string;
    logout: string;
  }>;
  languagePicker: Readonly<{
    label: string;
    zhCN: string;
    en: string;
    km: string;
  }>;
}>;

export type UserSkeletonCopyTable = Readonly<
  Record<LanguageCode, UserSkeletonCopy>
>;

export const USER_SKELETON_COPY: UserSkeletonCopyTable = {
  "zh-CN": {
    tabs: {
      home: "首页",
      orders: "借款",
      repayment: "账单",
      profile: "我的",
    },
    backToOrders: "返回订单",
    home: {
      title: "开始申请",
      subtitle: "工资到账前，资金周转更从容",
      card: "快速申请卡（视觉占位）",
      quickChoices: "金额快捷选择",
      termChoices: "期限选择",
    },
    orders: {
      title: "我的订单",
      empty: "暂无订单；新申请请返回首页。",
      listHint: "仅展示申请编号、状态与日期，不保存证件或薪资详情。",
      openDetail: "查看详情",
    },
    orderDetail: {
      title: "订单详情",
      backHint: "返回订单列表",
      empty: "订单不存在或尚未加载。",
      summary: "申请与进度概要",
      actions: "可执行操作",
    },
    notifications: {
      title: "通知",
      empty: "暂无通知。",
      backHint: "返回通知列表",
    },
    notificationDetail: {
      title: "通知详情",
      backHint: "返回通知列表",
      empty: "通知不存在或尚未加载。",
    },
    repayment: {
      title: "账单",
      empty: "尚未生成账单；放款成功后将在此显示还款计划。",
      summary: "已还、未还与下一期概要",
      installmentList: "每期详情",
      authorizationNotice:
        "请通过持牌机构的受控钱包页面完成还款授权；账单仅在验签回调后更新。如需协助请联系客服。",
      support: "联系客服",
    },
    profile: {
      title: "个人中心",
      telegram: "Telegram 登录状态",
      phone: "手机号验证",
      factory: "当前工厂",
      language: "显示语言",
      support: "客服与投诉",
      logout: "退出登录",
    },
    languagePicker: {
      label: "语言",
      zhCN: "中文",
      en: "English",
      km: "ភាសាខ្មែរ",
    },
  },
  en: {
    tabs: {
      home: "Home",
      orders: "Borrow",
      repayment: "Bill",
      profile: "Me",
    },
    backToOrders: "Back to orders",
    home: {
      title: "Start application",
      subtitle: "More flexibility before payday",
      card: "Quick application",
      quickChoices: "Amount shortcuts",
      termChoices: "Term shortcuts",
    },
    orders: {
      title: "My applications",
      empty: "No applications yet. Return to Home to start a new one.",
      listHint:
        "Only application number, status and dates are shown. Identity or salary details are never stored client-side.",
      openDetail: "View detail",
    },
    orderDetail: {
      title: "Application detail",
      backHint: "Back to list",
      empty: "Application not found or not loaded yet.",
      summary: "Application and progress summary",
      actions: "Available actions",
    },
    notifications: {
      title: "Notifications",
      empty: "No notifications yet.",
      backHint: "Back to notifications",
    },
    notificationDetail: {
      title: "Notification detail",
      backHint: "Back to notifications",
      empty: "Notification not found or not loaded yet.",
    },
    repayment: {
      title: "Repayment",
      empty:
        "No repayment schedule yet. It will appear after the licensed lender records disbursement.",
      summary: "Paid, unpaid and next-installment overview",
      installmentList: "Installment details",
      authorizationNotice:
        "Complete repayment authorization in the licensed lender's controlled wallet page. Your bill updates only after the signed callback returns. Contact support if you need assistance.",
      support: "Contact support",
    },
    profile: {
      title: "Profile",
      telegram: "Telegram sign-in status",
      phone: "Phone verification",
      factory: "Current factory",
      language: "Display language",
      support: "Support and complaints",
      logout: "Sign out",
    },
    languagePicker: {
      label: "Language",
      zhCN: "中文",
      en: "English",
      km: "ភាសាខ្មែរ",
    },
  },
  km: {
    tabs: {
      home: "ទំព័រដើម",
      orders: "ខ្ចីប្រាក់",
      repayment: "វិក្កយបត្រ",
      profile: "របស់ខ្ញុំ",
    },
    backToOrders: "ត្រឡប់ទៅបញ្ជីពាក្យ",
    home: {
      title: "ចាប់ផ្តើមដាក់ពាក្យ",
      subtitle: "សាច់ប្រាក់ងាយស្រួល មុនថ្ងៃបើកប្រាក់ខែ",
      card: "កាតដាក់ពាក្យរហ័ស (ការដាក់ទីតាំងបែបស្វិល)",
      quickChoices: "ជម្រើសចំនួនទឹកប្រាក់",
      termChoices: "ជម្រើសរយៈពេល",
    },
    orders: {
      title: "បញ្ជីពាក្យរបស់ខ្ញុំ",
      empty: "មិនទាន់មានពាក្យ។ សូមត្រឡប់ទៅទំព័រដើម ដើម្បីចាប់ផ្តើមថ្មី។",
      listHint:
        "បង្ហាញតែលេខពាក្យ ស្ថានភាព និងកាលបរិច្ឆេទប៉ុណ្ណោះ។ លេខអត្តសញ្ញាណ ឬលម្អិតប្រាក់ខែ មិនត្រូវបានរក្សាទុកនៅខាងក្រៅទេ។",
      openDetail: "មើលលម្អិត",
    },
    orderDetail: {
      title: "លម្អិតពាក្យ",
      backHint: "ត្រឡប់ទៅបញ្ជី",
      empty: "ពាក្យមិនមាន ឬមិនទាន់បានផ្ទុកឡើង។",
      summary: "សេចក្តីសង្ខេបនៃពាក្យ និងដំណើរការ",
      actions: "សកម្មភាពដែលអាចធ្វើបាន",
    },
    notifications: {
      title: "សារ​ជូនដំណឹង",
      empty: "មិនទាន់មានសារ​ជូនដំណឹង។",
      backHint: "ត្រឡប់ទៅបញ្ជីសារ​ជូនដំណឹង",
    },
    notificationDetail: {
      title: "លម្អិតសារ​ជូនដំណឹង",
      backHint: "ត្រឡប់ទៅបញ្ជីសារ​ជូនដំណឹង",
      empty: "រកមិនឃើញសារ​ជូនដំណឹង ឬមិនទាន់បានផ្ទុកឡើង។",
    },
    repayment: {
      title: "ការសងប្រាក់",
      empty:
        "មិនទាន់មានតារាងសងប្រាក់។ វានឹងបង្ហាញនៅទីនេះ បន្ទាប់ពីស្ថាប័នមានអាជ្ញាប័ណ្ណបានកត់ត្រាការបើកប្រាក់។",
      summary: "សេចក្តីសង្ខេបនៃចំនួនដែលបានសង មិនទាន់សង និងការសងបន្ទាប់",
      installmentList: "លម្អិតនីមួយវគ្គ",
      authorizationNotice:
        "សូមបំពេញការអនុញ្ញាតសងប្រាក់នៅក្នុងទំព័រ wallet ដែលគ្រប់គ្រងដោយស្ថាប័នមានអាជ្ញាប័ណ្ណ។ វិក្កយបត្រនឹងអាប់ដេតតែបន្ទាប់ពីការហៅត្រឡប់ដែលបានផ្ទៀងផ្ទាត់។ សូមទាក់ទងសេវាកម្ម ប្រសិនបើត្រូវការជំនួយ។",
      support: "ទាក់ទងសេវាកម្ម",
    },
    profile: {
      title: "គណនី",
      telegram: "ស្ថានភាពការចូលតាម Telegram",
      phone: "ការផ្ទៀងផ្ទាត់លេខទូរស័ព្ទ",
      factory: "រោងចក្របច្ចុប្បន្ន",
      language: "ភាសាបង្ហាញ",
      support: "សេវាកម្ម និងពាក្យបណ្តឹង",
      logout: "ចាកចេញ",
    },
    languagePicker: {
      label: "ភាសា",
      zhCN: "中文",
      en: "English",
      km: "ភាសាខ្មែរ",
    },
  },
};
