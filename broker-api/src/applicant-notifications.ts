import { createHash } from "node:crypto";

export type ApplicantNotificationCategory =
  "APPLICATION" | "PAYMENT" | "REASSESSMENT" | "REPAYMENT" | "CONTRACT";

export type ApplicantNotificationTimelineEntryType =
  | "STATUS"
  | "APPROVAL"
  | "PAYMENT_PROOF_SUBMITTED"
  | "PAYMENT_PROOF_REVIEWED"
  | "REASSESSMENT_SUBMITTED"
  | "REASSESSMENT_APPROVAL";

export type ApplicantNotificationTimelineRow = Readonly<{
  applicationNo: string;
  occurredAt: string;
  entryType: ApplicantNotificationTimelineEntryType;
  status?: string;
  stage?: string;
  decision?: string;
  reasonCode?: string;
  referenceNo?: string;
}>;

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

function notificationCategoryForRow(
  row: ApplicantNotificationTimelineRow,
): ApplicantNotificationCategory {
  if (
    row.entryType === "PAYMENT_PROOF_SUBMITTED" ||
    row.entryType === "PAYMENT_PROOF_REVIEWED"
  ) {
    return "PAYMENT";
  }
  if (
    row.entryType === "REASSESSMENT_SUBMITTED" ||
    row.entryType === "REASSESSMENT_APPROVAL"
  ) {
    return "REASSESSMENT";
  }
  if (
    row.entryType === "STATUS" &&
    [
      "DISBURSEMENT_PENDING",
      "DISBURSED",
      "REPAYMENT_ACTIVE",
      "SETTLED",
    ].includes(row.status ?? "")
  ) {
    return "REPAYMENT";
  }
  if (
    row.entryType === "STATUS" &&
    ["USER_CONTRACT_PENDING", "USER_CONTRACT_CONFIRMED"].includes(
      row.status ?? "",
    )
  ) {
    return "CONTRACT";
  }
  return "APPLICATION";
}

function notificationMessageCode(
  row: ApplicantNotificationTimelineRow,
): string {
  switch (row.entryType) {
    case "STATUS":
      return `APPLICATION_STATUS_${row.status ?? "UNKNOWN"}`;
    case "APPROVAL":
      return `APPROVAL_${row.stage ?? "UNKNOWN"}_${row.decision ?? "UNKNOWN"}`;
    case "PAYMENT_PROOF_SUBMITTED":
      return `PAYMENT_PROOF_SUBMITTED_${row.status ?? "UNKNOWN"}`;
    case "PAYMENT_PROOF_REVIEWED":
      return `PAYMENT_PROOF_REVIEWED_${row.status ?? "UNKNOWN"}`;
    case "REASSESSMENT_SUBMITTED":
      return `REASSESSMENT_SUBMITTED_${row.status ?? "UNKNOWN"}`;
    case "REASSESSMENT_APPROVAL":
      return `REASSESSMENT_APPROVAL_${row.stage ?? "UNKNOWN"}_${row.decision ?? "UNKNOWN"}`;
  }
}

export function buildApplicantNotificationId(
  row: ApplicantNotificationTimelineRow,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        applicationNo: row.applicationNo,
        occurredAt: row.occurredAt,
        entryType: row.entryType,
        status: row.status ?? null,
        stage: row.stage ?? null,
        decision: row.decision ?? null,
        reasonCode: row.reasonCode ?? null,
        referenceNo: row.referenceNo ?? null,
      }),
    )
    .digest("hex");
}

export function buildApplicantNotification(
  row: ApplicantNotificationTimelineRow,
  readAt?: string,
): ApplicantNotification {
  return {
    id: buildApplicantNotificationId(row),
    applicationNo: row.applicationNo,
    category: notificationCategoryForRow(row),
    messageCode: notificationMessageCode(row),
    timelineEntryType: row.entryType,
    occurredAt: row.occurredAt,
    unread: !readAt,
    ...(readAt ? { readAt } : {}),
    ...(row.status ? { status: row.status } : {}),
    ...(row.stage ? { stage: row.stage } : {}),
    ...(row.decision ? { decision: row.decision } : {}),
    ...(row.reasonCode ? { reasonCode: row.reasonCode } : {}),
    ...(row.referenceNo ? { referenceNo: row.referenceNo } : {}),
  };
}
