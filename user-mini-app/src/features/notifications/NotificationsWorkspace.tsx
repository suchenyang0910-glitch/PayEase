import type { LanguageCode } from "@payease/v1-domain";
import type {
  ApplicantNotification,
  ApplicantNotificationDeepLink,
} from "../../applicant-notification.ts";
import {
  notificationCategoryLabel,
  notificationCopy,
  notificationMetaItems,
} from "../../applicant-notification.ts";
import { NotificationsPage } from "../../pages/NotificationsPage.tsx";
import { NotificationDetailPage } from "../../pages/NotificationDetailPage.tsx";
import { USER_SKELETON_COPY } from "../../copy/user-copy.ts";

type NotificationsWorkspaceProps = Readonly<{
  language: LanguageCode;
  mode: "list" | "detail";
  notifications: readonly ApplicantNotification[];
  paginatedNotifications: readonly ApplicantNotification[];
  notificationItemCount: number;
  unreadNotificationCount: number;
  notificationPage: number;
  notificationPageCount: number;
  selectedNotification: ApplicantNotification | null;
  onBack: () => void;
  onOpenNotification: (notificationId: string) => void;
  onMarkAllRead: () => void;
  onNextPage: () => void;
  onPreviousPage: () => void;
  notificationLinkTarget: (
    notification: ApplicantNotification,
  ) => ApplicantNotificationDeepLink;
  onOpenLinkedTarget: (notification: ApplicantNotification) => void;
}>;

function unreadSummary(
  language: LanguageCode,
  unreadCount: number,
  itemCount: number,
): string {
  if (language === "zh-CN") {
    return `共 ${itemCount} 条，未读 ${unreadCount} 条`;
  }
  if (language === "km") {
    return `សរុប ${itemCount} សារ មិនទាន់អាន ${unreadCount} សារ`;
  }
  return `${itemCount} total, ${unreadCount} unread`;
}

function markAllReadLabel(language: LanguageCode): string {
  if (language === "zh-CN") return "全部标记已读";
  if (language === "km") return "សម្គាល់ថាបានអានទាំងអស់";
  return "Mark all read";
}

function pageSummary(
  language: LanguageCode,
  page: number,
  pageCount: number,
): string {
  if (language === "zh-CN") return `第 ${page} / ${pageCount} 页`;
  if (language === "km") return `ទំព័រ ${page} / ${pageCount}`;
  return `Page ${page} / ${pageCount}`;
}

function previousPageLabel(language: LanguageCode): string {
  if (language === "zh-CN") return "上一页";
  if (language === "km") return "ទំព័រមុន";
  return "Previous";
}

function nextPageLabel(language: LanguageCode): string {
  if (language === "zh-CN") return "下一页";
  if (language === "km") return "ទំព័របន្ទាប់";
  return "Next";
}

export function NotificationsWorkspace({
  language,
  mode,
  notifications,
  paginatedNotifications,
  notificationItemCount,
  unreadNotificationCount,
  notificationPage,
  notificationPageCount,
  selectedNotification,
  onBack,
  onOpenNotification,
  onMarkAllRead,
  onNextPage,
  onPreviousPage,
  notificationLinkTarget,
  onOpenLinkedTarget,
}: NotificationsWorkspaceProps): JSX.Element {
  if (mode === "detail") {
    return (
      <NotificationDetailPage language={language} onBack={onBack}>
        {selectedNotification ? (
          <article className="notification-detail-card">
            <div className="notification-detail-card__meta">
              <strong>
                {notificationCopy(selectedNotification, language).title}
              </strong>
              <span>{selectedNotification.occurredAt}</span>
            </div>
            <div className="notification-card__meta-row">
              <span className="notification-chip">
                {notificationCategoryLabel(
                  selectedNotification.category,
                  language,
                )}
              </span>
            </div>
            <p>{notificationCopy(selectedNotification, language).content}</p>
            <dl className="notification-detail-meta-list">
              {notificationMetaItems(selectedNotification, language).map(
                (item) => (
                  <div key={`${item.label}-${item.value}`}>
                    <dt>{item.label}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ),
              )}
            </dl>
            <div className="notification-detail-card__actions">
              <button
                type="button"
                className="primary"
                onClick={() => onOpenLinkedTarget(selectedNotification)}
              >
                {notificationLinkTarget(selectedNotification).label}
              </button>
            </div>
          </article>
        ) : (
          <div className="empty-state" role="status" aria-live="polite">
            {USER_SKELETON_COPY[language].notificationDetail.empty}
          </div>
        )}
      </NotificationDetailPage>
    );
  }

  return (
    <NotificationsPage language={language} onBack={onBack}>
      {notifications.length === 0 ? (
        <div className="empty-state" role="status" aria-live="polite">
          {USER_SKELETON_COPY[language].notifications.empty}
        </div>
      ) : (
        <section
          className="notifications-board"
          aria-label="Notifications list"
        >
          <div className="notifications-board__toolbar">
            <p className="response-note">
              {unreadSummary(
                language,
                unreadNotificationCount,
                notificationItemCount,
              )}
            </p>
            <button
              type="button"
              className="secondary"
              disabled={unreadNotificationCount === 0}
              onClick={onMarkAllRead}
            >
              {markAllReadLabel(language)}
            </button>
          </div>
          {paginatedNotifications.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`notification-card${item.unread ? " notification-card--unread" : ""}`}
              onClick={() => onOpenNotification(item.id)}
            >
              <div className="notification-card__head">
                <strong>{notificationCopy(item, language).title}</strong>
                <span>{item.occurredAt}</span>
              </div>
              <div className="notification-card__meta-row">
                <span className="notification-chip">
                  {notificationCategoryLabel(item.category, language)}
                </span>
                {item.unread ? (
                  <span className="notification-unread-pill">
                    {language === "en"
                      ? "Unread"
                      : language === "zh-CN"
                        ? "未读"
                        : "មិនទាន់អាន"}
                  </span>
                ) : null}
              </div>
              <p>{notificationCopy(item, language).summary}</p>
            </button>
          ))}
          {notificationPageCount > 1 ? (
            <div className="notifications-board__pagination">
              <button
                type="button"
                className="secondary"
                onClick={onPreviousPage}
                disabled={notificationPage <= 1}
              >
                {previousPageLabel(language)}
              </button>
              <span className="response-note">
                {pageSummary(language, notificationPage, notificationPageCount)}
              </span>
              <button
                type="button"
                className="secondary"
                onClick={onNextPage}
                disabled={notificationPage >= notificationPageCount}
              >
                {nextPageLabel(language)}
              </button>
            </div>
          ) : null}
        </section>
      )}
    </NotificationsPage>
  );
}
