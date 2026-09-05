import { useEffect, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import type { LanguageCode } from "@payease/v1-domain";
import { USER_SKELETON_COPY, type UserTab } from "../copy/user-copy.ts";
import khmerxLogo from "../assets/khmerx-logo.jpg";

const TAB_ORDER: readonly Exclude<
  UserTab,
  | "order-detail"
  | "notifications"
  | "notification-detail"
  | "help-guide"
  | "help-safety"
>[] = ["home", "orders", "repayment", "profile"] as const;

const TAB_LABELS: Readonly<
  Record<
    Exclude<
      UserTab,
      | "order-detail"
      | "notifications"
      | "notification-detail"
      | "help-guide"
      | "help-safety"
    >,
    Readonly<Record<LanguageCode, string>>
  >
> = {
  home: { "zh-CN": "首页", en: "Home", km: "ទំព័រដើម" },
  orders: { "zh-CN": "借款", en: "Borrow", km: "ខ្ចីប្រាក់" },
  repayment: { "zh-CN": "钱包", en: "Wallet", km: "កាបូប" },
  profile: { "zh-CN": "我的", en: "Me", km: "របស់ខ្ញុំ" },
};

function themeLabel(language: LanguageCode): string {
  switch (language) {
    case "zh-CN":
      return "切换外观";
    case "km":
      return "ប្តូរស្បែក";
    default:
      return "Toggle theme";
  }
}

function messagesLabel(
  language: LanguageCode,
  unreadNotificationCount: number,
): string {
  if (unreadNotificationCount <= 0) {
    return pick(language, {
      "zh-CN": "消息",
      en: "Messages",
      km: "សារ",
    });
  }
  return pick(language, {
    "zh-CN": `消息，${unreadNotificationCount} 条未读`,
    en: `Messages, ${unreadNotificationCount} unread`,
    km: `សារ មានមិនទាន់អាន ${unreadNotificationCount}`,
  });
}

function themeSectionTitle(language: LanguageCode): string {
  switch (language) {
    case "zh-CN":
      return "外观";
    case "km":
      return "រូបរាង";
    default:
      return "Appearance";
  }
}

function themeModeLabel(
  language: LanguageCode,
  theme: "light" | "dark",
): string {
  switch (language) {
    case "zh-CN":
      return theme === "dark" ? "当前：深色模式" : "当前：浅色模式";
    case "km":
      return theme === "dark" ? "បច្ចុប្បន្ន៖ ពណ៌ងងឹត" : "បច្ចុប្បន្ន៖ ពណ៌ភ្លឺ";
    default:
      return theme === "dark" ? "Current: Dark mode" : "Current: Light mode";
  }
}

function pick<T>(
  language: LanguageCode,
  map: Readonly<Record<LanguageCode, T>>,
): T {
  return map[language];
}

/* ---------------- SVG LINEAR ICONS ---------------- */

function IconBell(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function IconHeadset(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z" />
    </svg>
  );
}

function IconBorrow(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 1v22" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function IconPay(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="3" />
      <path d="M2 10h20" />
    </svg>
  );
}

function IconHistory(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function IconRaise(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M14 7h7v7" />
    </svg>
  );
}

function IconHome(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 9.5L12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1V9.5z" />
    </svg>
  );
}

function IconOrder(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

function IconBill(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 22V4l4-2 4 2 4-2 4 2v18l-4-2-4 2-4-2-4 2z" />
      <path d="M8 7h8M8 11h8M8 15h5" />
    </svg>
  );
}

function IconUser(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

/* ---------------- Props & Page ---------------- */

type Props = Readonly<{
  language: LanguageCode;
  current: UserTab;
  onChange: (next: UserTab) => void;
  showPreviewBadge?: boolean;
  applicantSession?: boolean;
  loading?: boolean;
  requiresInitialLanguageSelection?: boolean;
  onLanguageChange?: (next: LanguageCode) => void;
  onLogout?: () => void;
  borrowEntryLabel?: string;
  borrowEntryHint?: string;
  borrowEntryDisabled?: boolean;
  onBorrowEntry?: () => void;
  onOpenNotifications?: () => void;
  onOpenRecords?: () => void;
  onOpenReassessment?: () => void;
  onOpenHelpGuide?: () => void;
  onOpenHelpSafety?: () => void;
  unreadNotificationCount?: number;
  children?: ReactNode;
}>;

export function HomePage({
  language,
  current,
  onChange,
  showPreviewBadge = false,
  applicantSession = false,
  loading = false,
  requiresInitialLanguageSelection = false,
  onLanguageChange,
  onLogout,
  borrowEntryLabel,
  borrowEntryHint,
  borrowEntryDisabled = false,
  onBorrowEntry,
  onOpenNotifications,
  onOpenRecords,
  onOpenReassessment,
  onOpenHelpGuide,
  onOpenHelpSafety,
  unreadNotificationCount = 0,
  children,
}: Props): JSX.Element {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof document === "undefined") return "light";

    try {
      const stored = window.localStorage.getItem("payease.theme");
      if (stored === "light" || stored === "dark") return stored;
    } catch {
      /* storage access may be restricted inside Telegram WebView */
    }

    const saved = document.documentElement.getAttribute("data-theme");
    if (saved === "dark" || saved === "light") return saved;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      window.localStorage.setItem("payease.theme", theme);
    } catch {
      /* storage access may be restricted inside Telegram WebView */
    }
  }, [theme]);

  const ui = {
    brand: pick<string>(language, {
      "zh-CN": "KhmerX",
      en: "KhmerX",
      km: "KhmerX",
    }),
    product: pick<string>(language, {
      "zh-CN": "PayEase · by KhmerX",
      en: "PayEase · by KhmerX",
      km: "PayEase · ដោយ KhmerX",
    }),
    creditLabel: pick<string>(language, {
      "zh-CN": "我的可借额度",
      en: "Available credit",
      km: "ឥណទានដែលអាចខ្ចីបាន",
    }),
    creditHint: pick<string>(language, {
      "zh-CN": "完成身份与在职核验后，将根据审核结果授予额度",
      en: "Credit limit is reviewed and granted by the licensed institution after identity & employment checks.",
      km: "កម្រិតឥណទានត្រូវបានពិនិត្យ និងផ្តល់ដោយស្ថាប័នមានអាជ្ញាប័ណ្ណ បន្ទាប់ពីពិនិត្យអត្តសញ្ញាណ និងការងារ។",
    }),
    creditCta: pick<string>(language, {
      "zh-CN": "开始申请",
      en: "Start application",
      km: "ចាប់ផ្តើមដាក់ពាក្យ",
    }),
    riskNotice: pick<string>(language, {
      "zh-CN": "借款有风险，请理性借贷",
      en: "Borrow responsibly. Repay on time.",
      km: "ខ្ចីប្រាក់មានហានិភ័យ សូមខ្ចីឲ្យសមស្រប",
    }),
    grid: {
      borrow: pick<string>(language, {
        "zh-CN": "我要借款",
        en: "Borrow now",
        km: "ខ្ចីប្រាក់",
      }),
      pay: pick<string>(language, {
        "zh-CN": "还款管理",
        en: "Repayment",
        km: "សងប្រាក់",
      }),
      history: pick<string>(language, {
        "zh-CN": "借款记录",
        en: "Loan records",
        km: "ប្រវត្តិ",
      }),
      raise: pick<string>(language, {
        "zh-CN": "额度提升",
        en: "Reassessment",
        km: "វាយតម្លៃឡើងវិញ",
      }),
    },
    productTitle: pick<string>(language, {
      "zh-CN": "PayEase 薪资贷申请",
      en: "PayEase salary advance",
      km: "ពាក្យ PayEase សម្រាប់ប្រាក់ខែ",
    }),
    productSummary: pick<string>(language, {
      "zh-CN": "USD 10–500 · 15 / 30 天",
      en: "USD 10–500 · 15 / 30 days",
      km: "USD 10–500 · 15 / 30 ថ្ងៃ",
    }),
    productCta: pick<string>(language, {
      "zh-CN": "立即申请",
      en: "Apply now",
      km: "ដាក់ពាក្យ",
    }),
    productDisclaimer: pick<string>(language, {
      "zh-CN": "额度、费用与合同条款以审核结果为准。",
      en: "Amount, fees and contract terms are subject to the licensed institution's review.",
      km: "ចំនួន ថ្លៃ និងល័ក្ខខ័ណ្ឌកិច្ចសន្យា អាស្រ័យលើការពិនិត្យរបស់ស្ថាប័នមានអាជ្ញាប័ណ្ណ។",
    }),
    helpGuide: pick<string>(language, {
      "zh-CN": "借款指南",
      en: "How to borrow",
      km: "គោលការណ៍ខ្ចីប្រាក់",
    }),
    helpSafety: pick<string>(language, {
      "zh-CN": "安全防骗",
      en: "Stay safe from scams",
      km: "ការពារប្រឆាំងការបោកប្រាស់",
    }),
    compliance: pick<string>(language, {
      "zh-CN":
        "本服务由合作金融机构提供。额度、费用与合同条款将在确认前展示。请勿过度借贷，按时还款珍爱征信。",
      en: "This service is delivered by a licensed financial institution. Amount, fees and contract terms are independently reviewed and presented before confirmation. Borrow wisely and repay on time to protect your credit standing.",
      km: "សេវាកម្មនេះផ្តល់ដោយស្ថាប័នហិរញ្ញវត្ថុមានអាជ្ញាប័ណ្ណ។ ចំនួន ថ្លៃ និងល័ក្ខខ័ណ្ឌកិច្ចសន្យា ត្រូវបានពិនិត្យដោយឯករាជ្យ និងបង្ហាញមុនការបញ្ជាក់។ សូមខ្ចីឲ្យសមស្រប និងសងទាន់ពេល ដើម្បីការពារកេរដំណែលរបស់អ្នក។",
    }),
  };
  const accessibility = {
    primaryNavigation: pick<string>(language, {
      "zh-CN": "主导航",
      en: "Primary",
      km: "ការរុករកចម្បង",
    }),
    languageChooser: pick<string>(language, {
      "zh-CN": "选择语言",
      en: "Choose your language",
      km: "ជ្រើសរើសភាសារបស់អ្នក",
    }),
    selectKhmer: pick<string>(language, {
      "zh-CN": "选择高棉语",
      en: "Select Khmer language",
      km: "ជ្រើសរើសភាសាខ្មែរ",
    }),
    selectEnglish: pick<string>(language, {
      "zh-CN": "选择英语",
      en: "Select English language",
      km: "ជ្រើសរើសភាសាអង់គ្លេស",
    }),
    selectChinese: pick<string>(language, {
      "zh-CN": "选择中文",
      en: "Select Chinese language",
      km: "ជ្រើសរើសភាសាចិន",
    }),
    creditApplication: pick<string>(language, {
      "zh-CN": "从额度卡开始申请",
      en: "Start loan application from credit card",
      km: "ចាប់ផ្តើមពាក្យសុំពីកាតឥណទាន",
    }),
    coreFeatures: pick<string>(language, {
      "zh-CN": "核心功能",
      en: "Core features",
      km: "មុខងារសំខាន់ៗ",
    }),
    productApplication: pick<string>(language, {
      "zh-CN": "从产品卡开始申请",
      en: "Start loan application from product card",
      km: "ចាប់ផ្តើមពាក្យសុំពីកាតផលិតផល",
    }),
    helpCenter: pick<string>(language, {
      "zh-CN": "帮助中心",
      en: "Help center",
      km: "មជ្ឈមណ្ឌលជំនួយ",
    }),
    languagePreferences: pick<string>(language, {
      "zh-CN": "语言偏好",
      en: "Language preferences",
      km: "ចំណូលចិត្តភាសា",
    }),
    language: pick<string>(language, {
      "zh-CN": "语言",
      en: "Language",
      km: "ភាសា",
    }),
    primaryTabs: pick<string>(language, {
      "zh-CN": "主标签页",
      en: "Primary tabs",
      km: "ផ្ទាំងមេ",
    }),
  };

  const activeTab: Exclude<
    UserTab,
    | "order-detail"
    | "notifications"
    | "notification-detail"
    | "help-guide"
    | "help-safety"
  > =
    current === "order-detail" ||
    current === "notifications" ||
    current === "notification-detail" ||
    current === "help-guide" ||
    current === "help-safety"
      ? "home"
      : current;
  const isHome = current === "home";
  const borrowEntryText = borrowEntryLabel ?? ui.creditCta;
  const borrowEntryHintText = borrowEntryHint ?? ui.creditHint;
  const openBorrowEntry = onBorrowEntry ?? (() => onChange("orders"));
  const openNotifications =
    onOpenNotifications ?? (() => onChange("notifications"));
  const openRecords = onOpenRecords ?? (() => onChange("orders"));
  const openReassessment = onOpenReassessment ?? (() => onChange("orders"));
  const openHelpGuide = onOpenHelpGuide ?? (() => onChange("help-guide"));
  const openHelpSafety = onOpenHelpSafety ?? (() => onChange("help-safety"));
  const toggleTheme = () =>
    setTheme((previous) => (previous === "dark" ? "light" : "dark"));

  return (
    <div className="kx-shell" lang={language}>
      {/* Module 1: Top Nav */}
      <nav
        className="kx-topnav"
        aria-label={accessibility.primaryNavigation}
        data-telegram-padding="true"
      >
        <div className="kx-topnav__brand">
          <div className="kx-topnav__logo" aria-hidden="true" title={ui.brand}>
            <img
              src={khmerxLogo}
              alt=""
              className="kx-topnav__logo-img"
              draggable={false}
            />
          </div>
          <div className="kx-topnav__titles">
            <div className="kx-topnav__title">{ui.brand}</div>
            <div className="kx-topnav__subtitle">{ui.product}</div>
          </div>
        </div>
        <div className="kx-topnav__actions">
          {showPreviewBadge
            ? (() => {
                const demoCopy: Readonly<Record<LanguageCode, string>> = {
                  "zh-CN": "受控预览环境",
                  en: "Controlled preview",
                  km: "បរិស្ថានសាកល្បងគ្រប់គ្រង",
                };
                return (
                  <span className="preview-pill">{demoCopy[language]}</span>
                );
              })()
            : null}
          {applicantSession && typeof onLogout === "function" ? (
            <button
              className="logout-button"
              disabled={loading}
              onClick={() => onLogout()}
              type="button"
            >
              {pick<string>(language, {
                "zh-CN": "退出",
                en: "Sign out",
                km: "ចាកចេញ",
              })}
            </button>
          ) : null}
          <button
            className="kx-icon-btn"
            type="button"
            aria-label={messagesLabel(language, unreadNotificationCount)}
            onClick={openNotifications}
          >
            <IconBell />
            {unreadNotificationCount > 0 ? (
              <span className="kx-icon-btn__badge" aria-hidden="true">
                {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
              </span>
            ) : null}
          </button>
          <button
            className="kx-icon-btn"
            type="button"
            aria-label={pick<string>(language, {
              "zh-CN": "客服",
              en: "Customer support",
              km: "ជំនួយឥតគិតថ្លៃ",
            })}
            onClick={() => onChange("profile")}
          >
            <IconHeadset />
          </button>
        </div>
      </nav>

      {isHome ? (
        <>
          <section className="page page--home" aria-labelledby="home-title">
            <h2
              id="home-title"
              className="page__title"
              aria-hidden="false"
              style={{
                position: "absolute",
                left: "-9999px",
                top: "auto",
                width: "1px",
                height: "1px",
                overflow: "hidden",
              }}
            >
              {USER_SKELETON_COPY[language].home.title}
            </h2>
          </section>

          {requiresInitialLanguageSelection &&
          typeof onLanguageChange === "function" ? (
            <section
              className="kx-initial-language"
              aria-label={accessibility.languageChooser}
            >
              <div>
                <strong>សូមជ្រើសរើសភាសា</strong>
                <span>Choose your language · 选择语言</span>
              </div>
              <div className="kx-initial-language__choices">
                <button
                  type="button"
                  onClick={() => onLanguageChange("km")}
                  aria-label={accessibility.selectKhmer}
                >
                  ខ្មែរ
                </button>
                <button
                  type="button"
                  onClick={() => onLanguageChange("en")}
                  aria-label={accessibility.selectEnglish}
                >
                  English
                </button>
                <button
                  type="button"
                  onClick={() => onLanguageChange("zh-CN")}
                  aria-label={accessibility.selectChinese}
                >
                  中文
                </button>
              </div>
            </section>
          ) : null}

          {/* Module 2: Credit Card (unique primary focus) */}
          <section className="kx-credit" aria-labelledby="kx-credit-title">
            <p className="kx-credit__label" id="kx-credit-title">
              {ui.creditLabel}
            </p>
            <div className="kx-credit__amount">
              <span className="kx-credit__currency">$</span>
              <span>0.00</span>
              <span className="kx-credit__unit">USD</span>
            </div>
            <p className="kx-credit__hint">{borrowEntryHintText}</p>
            <button
              type="button"
              className="kx-credit__cta"
              onClick={openBorrowEntry}
              disabled={borrowEntryDisabled}
              aria-label={accessibility.creditApplication}
            >
              {borrowEntryText}
            </button>
            <p className="kx-credit__disclaimer">{ui.riskNotice}</p>
          </section>

          {/* Module 3: Four-grid shortcuts */}
          <section className="kx-grid" aria-label={accessibility.coreFeatures}>
            <button
              type="button"
              className="kx-grid__item"
              onClick={openBorrowEntry}
              disabled={borrowEntryDisabled}
            >
              <span className="kx-grid__icon">
                <IconBorrow />
              </span>
              <span className="kx-grid__label">{ui.grid.borrow}</span>
            </button>
            <button
              type="button"
              className="kx-grid__item"
              onClick={() => onChange("repayment")}
            >
              <span className="kx-grid__icon">
                <IconPay />
              </span>
              <span className="kx-grid__label">{ui.grid.pay}</span>
            </button>
            <button
              type="button"
              className="kx-grid__item"
              onClick={openRecords}
            >
              <span className="kx-grid__icon">
                <IconHistory />
              </span>
              <span className="kx-grid__label">{ui.grid.history}</span>
            </button>
            <button
              type="button"
              className="kx-grid__item"
              onClick={openReassessment}
            >
              <span className="kx-grid__icon">
                <IconRaise />
              </span>
              <span className="kx-grid__label">{ui.grid.raise}</span>
            </button>
          </section>

          {/* Module 4: Single product card */}
          <section className="kx-product" aria-labelledby="kx-product-title">
            <h3 className="kx-product__title" id="kx-product-title">
              {ui.productTitle}
            </h3>
            <p className="kx-product__summary">{ui.productSummary}</p>
            <button
              type="button"
              className="kx-product__cta"
              onClick={openBorrowEntry}
              disabled={borrowEntryDisabled}
              aria-label={accessibility.productApplication}
            >
              {borrowEntryText}
            </button>
            <p className="kx-product__disclaimer">{ui.productDisclaimer}</p>
          </section>

          {/* Module 5: Help links */}
          <section className="kx-help" aria-label={accessibility.helpCenter}>
            <button
              type="button"
              className="kx-help__link"
              onClick={openHelpGuide}
            >
              {ui.helpGuide}
            </button>
            <button
              type="button"
              className="kx-help__link"
              onClick={openHelpSafety}
            >
              {ui.helpSafety}
            </button>
          </section>

          <footer className="kx-compliance" role="contentinfo">
            {ui.compliance}
          </footer>
        </>
      ) : (
        <>
          <div className="kx-page-slot">{children}</div>
          {current === "profile" ? (
            <section
              className="kx-page-theme"
              aria-label={themeSectionTitle(language)}
            >
              <div className="kx-page-theme__meta">
                <strong className="kx-page-theme__title">
                  {themeSectionTitle(language)}
                </strong>
                <span className="kx-page-theme__hint">
                  {themeModeLabel(language, theme)}
                </span>
              </div>
              <button
                type="button"
                className="secondary kx-page-theme__toggle"
                aria-label={themeLabel(language)}
                title={themeLabel(language)}
                aria-pressed={theme === "dark"}
                onClick={toggleTheme}
              >
                {themeLabel(language)}
              </button>
            </section>
          ) : null}
          {typeof onLanguageChange === "function" ? (
            current === "profile" ? (
              <section
                className="kx-page-language"
                aria-label={accessibility.languagePreferences}
              >
                <label
                  className="kx-page-language__label"
                  htmlFor="page-language"
                >
                  {pick<string>(language, {
                    "zh-CN": "语言偏好",
                    en: "Language preference",
                    km: "ភាសាដែលពេញចិត្ត",
                  })}
                </label>
                <select
                  id="page-language"
                  aria-label={accessibility.language}
                  value={language}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                    onLanguageChange(event.target.value as LanguageCode)
                  }
                >
                  <option value="km">ខ្មែរ</option>
                  <option value="en">EN</option>
                  <option value="zh-CN">中文</option>
                </select>
              </section>
            ) : (
              <div className="kx-language-sync">
                <label htmlFor="page-language-sync">
                  {accessibility.language}
                </label>
                <select
                  id="page-language-sync"
                  aria-label={accessibility.language}
                  value={language}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                    onLanguageChange(event.target.value as LanguageCode)
                  }
                >
                  <option value="km">ខ្មែរ</option>
                  <option value="en">EN</option>
                  <option value="zh-CN">中文</option>
                </select>
              </div>
            )
          ) : null}
        </>
      )}

      {/* Module 7: Bottom tabs */}
      <nav
        className="kx-tabs"
        aria-label={accessibility.primaryTabs}
        role="tablist"
      >
        <div className="kx-tabs__inner">
          {TAB_ORDER.map((tab) => {
            const active = activeTab === tab;
            const label = pick<string>(language, TAB_LABELS[tab]);
            const Icon =
              tab === "home"
                ? IconHome
                : tab === "orders"
                  ? IconOrder
                  : tab === "repayment"
                    ? IconBill
                    : IconUser;
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={label}
                className={active ? "kx-tab kx-tab--active" : "kx-tab"}
                onClick={() => onChange(tab)}
              >
                <Icon />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
