import type { LanguageCode } from "@payease/v1-domain";

export type ApplicantNotificationCategory =
  "APPLICATION" | "PAYMENT" | "REASSESSMENT" | "REPAYMENT" | "CONTRACT";

export type ApplicantNotificationTimelineEntryType =
  | "STATUS"
  | "APPROVAL"
  | "PAYMENT_PROOF_SUBMITTED"
  | "PAYMENT_PROOF_REVIEWED"
  | "REASSESSMENT_SUBMITTED"
  | "REASSESSMENT_APPROVAL";

export type ApplicantNotification = Readonly<{
  id: string;
  applicationNo: string;
  category: ApplicantNotificationCategory;
  messageCode: string;
  timelineEntryType: ApplicantNotificationTimelineEntryType;
  occurredAt: string;
  unread: boolean;
  readAt?: string;
  status?: string;
  stage?: string;
  decision?: string;
  reasonCode?: string;
  referenceNo?: string;
}>;

export type ApplicantNotificationList = Readonly<{
  page: number;
  pageSize: number;
  itemCount: number;
  pageCount: number;
  unreadCount: number;
  items: ApplicantNotification[];
}>;

export type ApplicantNotificationDeepLink = Readonly<{
  destination: "order-detail" | "repayment" | "reassessment";
  applicationNo: string;
  label: string;
}>;

function whenLabel(language: LanguageCode): string {
  if (language === "zh-CN") return "时间";
  if (language === "km") return "ពេលវេលា";
  return "Time";
}

function eventLabel(language: LanguageCode): string {
  if (language === "zh-CN") return "事件";
  if (language === "km") return "ព្រឹត្តិការណ៍";
  return "Event";
}

function applicationLabel(language: LanguageCode): string {
  if (language === "zh-CN") return "申请编号";
  if (language === "km") return "លេខពាក្យ";
  return "Application";
}

function referenceLabel(language: LanguageCode): string {
  if (language === "zh-CN") return "关联编号";
  if (language === "km") return "លេខយោង";
  return "Reference";
}

function reasonLabel(language: LanguageCode): string {
  if (language === "zh-CN") return "原因";
  if (language === "km") return "មូលហេតុ";
  return "Reason";
}

function stageLabel(language: LanguageCode): string {
  if (language === "zh-CN") return "阶段";
  if (language === "km") return "ដំណាក់កាល";
  return "Stage";
}

function decisionLabel(language: LanguageCode): string {
  if (language === "zh-CN") return "结果";
  if (language === "km") return "លទ្ធផល";
  return "Decision";
}

export function notificationCategoryLabel(
  category: ApplicantNotificationCategory,
  language: LanguageCode,
): string {
  const copy: Record<
    ApplicantNotificationCategory,
    Record<LanguageCode, string>
  > = {
    APPLICATION: {
      en: "Application",
      "zh-CN": "申请进度",
      km: "ដំណើរការពាក្យ",
    },
    PAYMENT: {
      en: "Payment proof",
      "zh-CN": "还款凭证",
      km: "បង្កាន់ដៃទូទាត់",
    },
    REASSESSMENT: {
      en: "Reassessment",
      "zh-CN": "重新评估",
      km: "ការវាយតម្លៃឡើងវិញ",
    },
    REPAYMENT: {
      en: "Repayment",
      "zh-CN": "还款状态",
      km: "ស្ថានភាពសងប្រាក់",
    },
    CONTRACT: {
      en: "Contract",
      "zh-CN": "合同确认",
      km: "ការបញ្ជាក់កិច្ចសន្យា",
    },
  };
  return copy[category][language];
}

export function notificationEventTypeLabel(
  type: ApplicantNotificationTimelineEntryType,
  language: LanguageCode,
): string {
  const copy: Record<
    ApplicantNotificationTimelineEntryType,
    Record<LanguageCode, string>
  > = {
    STATUS: {
      en: "Status update",
      "zh-CN": "状态变更",
      km: "បច្ចុប្បន្នភាពស្ថានភាព",
    },
    APPROVAL: {
      en: "Approval review",
      "zh-CN": "审核处理",
      km: "ការពិនិត្យអនុម័ត",
    },
    PAYMENT_PROOF_SUBMITTED: {
      en: "Payment proof submitted",
      "zh-CN": "已提交还款凭证",
      km: "បានដាក់បង្កាន់ដៃទូទាត់",
    },
    PAYMENT_PROOF_REVIEWED: {
      en: "Payment proof reviewed",
      "zh-CN": "还款凭证已处理",
      km: "បានពិនិត្យបង្កាន់ដៃទូទាត់",
    },
    REASSESSMENT_SUBMITTED: {
      en: "Reassessment submitted",
      "zh-CN": "已提交重新评估",
      km: "បានដាក់ស្នើវាយតម្លៃឡើងវិញ",
    },
    REASSESSMENT_APPROVAL: {
      en: "Reassessment review",
      "zh-CN": "重新评估审核",
      km: "ការពិនិត្យវាយតម្លៃឡើងវិញ",
    },
  };
  return copy[type][language];
}

function fallbackCopy(
  notification: ApplicantNotification,
  language: LanguageCode,
): Readonly<{ title: string; summary: string; content: string }> {
  const category = notificationCategoryLabel(notification.category, language);
  const event = notificationEventTypeLabel(
    notification.timelineEntryType,
    language,
  );
  if (language === "zh-CN") {
    return {
      title: `${category}更新`,
      summary: `${event}已记录，请查看详情。`,
      content: `该通知来自你的${category}事件，当前事件类型为“${event}”。请结合申请详情查看最新进度。`,
    };
  }
  if (language === "km") {
    return {
      title: `បច្ចុប្បន្នភាព${category}`,
      summary: `ព្រឹត្តិការណ៍ "${event}" ត្រូវបានកត់ត្រា។`,
      content: `សារ​ជូនដំណឹងនេះមកពី${category}របស់អ្នក។ សូមមើលលម្អិត ដើម្បីពិនិត្យវឌ្ឍនភាពចុងក្រោយ។`,
    };
  }
  return {
    title: `${category} update`,
    summary: `${event} was recorded for your application.`,
    content: `This notification comes from your ${category.toLowerCase()} flow. Open the related application detail for the latest status and next action.`,
  };
}

export function notificationCopy(
  notification: ApplicantNotification,
  language: LanguageCode,
): Readonly<{ title: string; summary: string; content: string }> {
  const copy: Record<
    string,
    Readonly<
      Record<
        LanguageCode,
        Readonly<{ title: string; summary: string; content: string }>
      >
    >
  > = {
    APPLICATION_STATUS_BROKER_REVIEW: {
      en: {
        title: "Application sent for review",
        summary: "Your application is now in document review.",
        content:
          "Your application has entered document review. Please keep your phone reachable and watch for any requests for additional information.",
      },
      "zh-CN": {
        title: "申请已进入资料审核",
        summary: "你的申请已进入资料审核阶段。",
        content:
          "你的申请已进入资料审核阶段。请保持电话畅通，并留意是否需要补充资料。",
      },
      km: {
        title: "ពាក្យសុំបានចូលដំណាក់កាលពិនិត្យព័ត៌មាន",
        summary: "ពាក្យសុំរបស់អ្នកកំពុងស្ថិតក្នុងការពិនិត្យព័ត៌មាន។",
        content:
          "ពាក្យសុំរបស់អ្នកបានចូលដំណាក់កាលពិនិត្យព័ត៌មាន។ សូមរក្សាទូរស័ព្ទឱ្យអាចទាក់ទងបាន និងរង់ចាំប្រសិនបើត្រូវការបំពេញព័ត៌មានបន្ថែម។",
      },
    },
    PAYMENT_PROOF_SUBMITTED_UNDER_REVIEW: {
      en: {
        title: "Payment proof received",
        summary: "Your payment proof is waiting for manual review.",
        content:
          "We received your payment proof and placed it in the manual review queue. Please do not submit the same proof again unless support asks you to do so.",
      },
      "zh-CN": {
        title: "已收到还款凭证",
        summary: "你的还款凭证正在等待人工核验。",
        content:
          "我们已收到你的还款凭证，并已进入人工核验队列。除非客服通知，否则请不要重复提交同一份凭证。",
      },
      km: {
        title: "បានទទួលបង្កាន់ដៃទូទាត់",
        summary: "បង្កាន់ដៃទូទាត់របស់អ្នកកំពុងរង់ចាំការពិនិត្យដោយមនុស្ស។",
        content:
          "យើងបានទទួលបង្កាន់ដៃទូទាត់របស់អ្នក ហើយបានដាក់ចូលជួរពិនិត្យដោយមនុស្ស។ សូមកុំដាក់ឯកសារដដែលម្តងទៀត លុះត្រាតែសេវាកម្មជូនដំណឹង។",
      },
    },
    PAYMENT_PROOF_REVIEWED_RECONCILED: {
      en: {
        title: "Payment proof confirmed",
        summary: "Your payment proof has been reconciled.",
        content:
          "The repayment team confirmed your payment proof. The repayment record has been updated accordingly.",
      },
      "zh-CN": {
        title: "还款凭证已核销",
        summary: "你的还款凭证已完成核验。",
        content: "还款团队已确认你的还款凭证，并已按结果更新还款记录。",
      },
      km: {
        title: "បង្កាន់ដៃទូទាត់បានផ្ទៀងផ្ទាត់",
        summary: "បង្កាន់ដៃទូទាត់របស់អ្នកត្រូវបានសម្របសម្រួលរួចហើយ។",
        content:
          "ក្រុមការងារសងប្រាក់បានបញ្ជាក់បង្កាន់ដៃទូទាត់របស់អ្នក ហើយបានធ្វើបច្ចុប្បន្នភាពកំណត់ត្រាសងប្រាក់។",
      },
    },
    PAYMENT_PROOF_REVIEWED_NEEDS_MORE: {
      en: {
        title: "More payment proof is needed",
        summary: "Please provide additional repayment proof details.",
        content:
          "The repayment team could not complete verification with the current proof. Please review the reason and prepare the requested additional material.",
      },
      "zh-CN": {
        title: "还款凭证需要补充",
        summary: "请补充更多还款凭证信息。",
        content: "当前凭证不足以完成核验。请查看原因说明，并按要求补充材料。",
      },
      km: {
        title: "ត្រូវការបង្កាន់ដៃទូទាត់បន្ថែម",
        summary: "សូមបំពេញព័ត៌មានបង្កាន់ដៃទូទាត់បន្ថែម។",
        content:
          "ក្រុមការងារមិនអាចបញ្ចប់ការផ្ទៀងផ្ទាត់ជាមួយឯកសារបច្ចុប្បន្នបានទេ។ សូមពិនិត្យមូលហេតុ ហើយរៀបចំឯកសារបន្ថែមដែលបានស្នើ។",
      },
    },
    REASSESSMENT_SUBMITTED_SUBMITTED: {
      en: {
        title: "Reassessment request submitted",
        summary: "Your reassessment request entered the review queue.",
        content:
          "We received your reassessment request. The review team will process it in order and notify you when there is progress.",
      },
      "zh-CN": {
        title: "重新评估申请已提交",
        summary: "你的重新评估申请已进入审核队列。",
        content:
          "我们已收到你的重新评估申请，审核团队会按顺序处理，并在有进展时通过通知告知你。",
      },
      km: {
        title: "សំណើវាយតម្លៃឡើងវិញបានដាក់ស្នើ",
        summary: "សំណើវាយតម្លៃឡើងវិញរបស់អ្នកបានចូលជួរពិនិត្យ។",
        content:
          "យើងបានទទួលសំណើវាយតម្លៃឡើងវិញរបស់អ្នក ហើយក្រុមពិនិត្យនឹងដំណើរការតាមលំដាប់។ នៅពេលមានវឌ្ឍនភាព យើងនឹងជូនដំណឹងអ្នក។",
      },
    },
  };
  return (
    copy[notification.messageCode]?.[language] ??
    fallbackCopy(notification, language)
  );
}

export function notificationMetaItems(
  notification: ApplicantNotification,
  language: LanguageCode,
): Array<Readonly<{ label: string; value: string }>> {
  return [
    { label: whenLabel(language), value: notification.occurredAt },
    {
      label: eventLabel(language),
      value: notificationEventTypeLabel(
        notification.timelineEntryType,
        language,
      ),
    },
    { label: applicationLabel(language), value: notification.applicationNo },
    ...(notification.referenceNo
      ? [{ label: referenceLabel(language), value: notification.referenceNo }]
      : []),
    ...(notification.stage
      ? [{ label: stageLabel(language), value: notification.stage }]
      : []),
    ...(notification.decision
      ? [{ label: decisionLabel(language), value: notification.decision }]
      : []),
    ...(notification.reasonCode
      ? [{ label: reasonLabel(language), value: notification.reasonCode }]
      : []),
  ];
}

export function notificationDeepLink(
  notification: ApplicantNotification,
  language: LanguageCode,
): ApplicantNotificationDeepLink {
  if (
    notification.category === "PAYMENT" ||
    notification.category === "REPAYMENT"
  ) {
    return {
      destination: "repayment",
      applicationNo: notification.applicationNo,
      label:
        language === "en"
          ? "Open wallet"
          : language === "zh-CN"
            ? "查看钱包"
            : "បើកកាបូប",
    };
  }
  if (notification.category === "REASSESSMENT") {
    return {
      destination: "reassessment",
      applicationNo: notification.applicationNo,
      label:
        language === "en"
          ? "Open reassessment"
          : language === "zh-CN"
            ? "查看重新评估"
            : "បើកការវាយតម្លៃឡើងវិញ",
    };
  }
  return {
    destination: "order-detail",
    applicationNo: notification.applicationNo,
    label:
      language === "en"
        ? "Open application"
        : language === "zh-CN"
          ? "查看申请"
          : "បើកពាក្យសុំ",
  };
}
