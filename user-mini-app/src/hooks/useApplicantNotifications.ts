import { useEffect, useState } from "react";
import type {
  ApplicantNotification,
  ApplicantNotificationList,
} from "../applicant-notification.ts";

type ApplicantRequest = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type UseApplicantNotificationsArgs = Readonly<{
  applicantSession: boolean;
  applicantRequest: ApplicantRequest;
  recoverApplicantSession: () => Promise<void>;
}>;

const NOTIFICATION_PAGE_SIZE = 10;

export function useApplicantNotifications({
  applicantSession,
  applicantRequest,
  recoverApplicantSession,
}: UseApplicantNotificationsArgs) {
  const [notifications, setNotifications] = useState<ApplicantNotification[]>(
    [],
  );
  const [selectedNotificationId, setSelectedNotificationId] = useState<
    string | null
  >(null);
  const [notificationDetail, setNotificationDetail] =
    useState<ApplicantNotification | null>(null);
  const [notificationPage, setNotificationPage] = useState(1);
  const [notificationItemCount, setNotificationItemCount] = useState(0);
  const [serverUnreadNotificationCount, setServerUnreadNotificationCount] =
    useState(0);
  const [notificationPageCount, setNotificationPageCount] = useState(1);

  const unreadNotificationCount = serverUnreadNotificationCount;
  const paginatedNotifications = notifications;
  const selectedNotification =
    notificationDetail ??
    notifications.find((item) => item.id === selectedNotificationId) ??
    null;

  function resetNotifications() {
    setNotifications([]);
    setSelectedNotificationId(null);
    setNotificationDetail(null);
    setNotificationPage(1);
    setNotificationItemCount(0);
    setServerUnreadNotificationCount(0);
    setNotificationPageCount(1);
  }

  function setNotificationPageSafe(nextPage: number) {
    setNotificationPage((current) => {
      const page = Number.isFinite(nextPage) ? nextPage : current;
      return Math.min(Math.max(1, page), notificationPageCount);
    });
  }

  async function loadNotifications(): Promise<void> {
    if (!applicantSession) {
      setNotifications([]);
      return;
    }
    const response = await applicantRequest(
      `/api/v1/local/public/notifications?page=${notificationPage}&pageSize=${NOTIFICATION_PAGE_SIZE}`,
    );
    if (!response || typeof response !== "object" || !("ok" in response)) {
      return;
    }
    if (response.status === 401) {
      await recoverApplicantSession();
      return;
    }
    const payload = (await response.json().catch(() => undefined)) as
      ApplicantNotificationList | undefined;
    if (!response.ok || !payload || !Array.isArray(payload.items)) {
      return;
    }
    setNotificationPage(payload.page);
    setNotificationItemCount(payload.itemCount);
    setNotificationPageCount(payload.pageCount);
    setServerUnreadNotificationCount(payload.unreadCount);
    setNotifications(payload.items);
    setNotificationDetail((current) =>
      current
        ? (payload.items.find((item) => item.id === current.id) ?? current)
        : null,
    );
  }

  async function loadNotificationDetail(
    notificationId: string,
  ): Promise<ApplicantNotification | undefined> {
    const response = await applicantRequest(
      `/api/v1/local/public/notifications/${encodeURIComponent(notificationId)}`,
    );
    if (response.status === 401) {
      await recoverApplicantSession();
      return undefined;
    }
    const payload = (await response.json().catch(() => undefined)) as
      ApplicantNotification | undefined;
    if (!response.ok || !payload || payload.id !== notificationId) {
      return undefined;
    }
    setNotificationDetail(payload);
    setNotifications((current) =>
      current.map((item) =>
        item.id === notificationId
          ? { ...payload, unread: false, readAt: payload.readAt ?? item.readAt }
          : item,
      ),
    );
    return payload;
  }

  async function markNotificationRead(notificationId: string): Promise<void> {
    const localWasUnread =
      notifications.some((item) => item.id === notificationId && item.unread) ||
      Boolean(
        notificationDetail?.id === notificationId && notificationDetail.unread,
      );
    const response = await applicantRequest(
      `/api/v1/local/public/notifications/${encodeURIComponent(notificationId)}/read`,
      { method: "POST" },
    );
    if (response.status === 401) {
      await recoverApplicantSession();
      return;
    }
    const payload = (await response.json().catch(() => undefined)) as
      | { notificationId?: string; unread?: boolean; readAt?: string }
      | undefined;
    if (
      !response.ok ||
      !payload ||
      payload.notificationId !== notificationId ||
      payload.unread !== false
    ) {
      return;
    }
    setNotifications((current) =>
      current.map((item) =>
        item.id === notificationId
          ? { ...item, unread: false, readAt: payload.readAt ?? item.readAt }
          : item,
      ),
    );
    if (localWasUnread) {
      setServerUnreadNotificationCount((current) => Math.max(0, current - 1));
    }
    setNotificationDetail((current) =>
      current?.id === notificationId
        ? {
            ...current,
            unread: false,
            readAt: payload.readAt ?? current.readAt,
          }
        : current,
    );
  }

  async function markAllNotificationsRead(): Promise<void> {
    if (unreadNotificationCount === 0 || !applicantSession) return;
    setNotifications((current) =>
      current.map((item) =>
        item.unread
          ? {
              ...item,
              unread: false,
              readAt: item.readAt ?? new Date().toISOString(),
            }
          : item,
      ),
    );
    setNotificationDetail((current) =>
      current && current.unread
        ? {
            ...current,
            unread: false,
            readAt: current.readAt ?? new Date().toISOString(),
          }
        : current,
    );
    setServerUnreadNotificationCount(0);
    const response = await applicantRequest(
      "/api/v1/local/public/notifications/read-all",
      { method: "POST" },
    );
    if (response.status === 401) {
      await recoverApplicantSession();
      return;
    }
    if (!response.ok) {
      void loadNotifications();
    }
  }

  function clearNotificationSelection() {
    setSelectedNotificationId(null);
    setNotificationDetail(null);
  }

  async function openNotificationDetail(notificationId: string): Promise<void> {
    setSelectedNotificationId(notificationId);
    const cached = notifications.find((item) => item.id === notificationId);
    if (cached) {
      setNotificationDetail({
        ...cached,
        unread: false,
        readAt: cached.readAt ?? new Date().toISOString(),
      });
      setNotifications((current) =>
        current.map((item) =>
          item.id === notificationId ? { ...item, unread: false } : item,
        ),
      );
    } else {
      setNotificationDetail(null);
    }
    if (!applicantSession) return;
    await Promise.all([
      markNotificationRead(notificationId),
      loadNotificationDetail(notificationId),
    ]);
  }

  useEffect(() => {
    if (applicantSession) return;
    resetNotifications();
  }, [applicantSession]);

  useEffect(() => {
    if (!applicantSession) return;
    void loadNotifications();
  }, [applicantSession, notificationPage]);

  return {
    clearNotificationSelection,
    loadNotifications,
    markAllNotificationsRead,
    nextNotificationPage: () => setNotificationPageSafe(notificationPage + 1),
    notifications,
    openNotificationDetail,
    paginatedNotifications,
    previousNotificationPage: () =>
      setNotificationPageSafe(notificationPage - 1),
    resetNotifications,
    selectedNotification,
    selectedNotificationId,
    setNotificationPage: setNotificationPageSafe,
    notificationItemCount,
    notificationPageCount,
    unreadNotificationCount,
    notificationPage,
  };
}
