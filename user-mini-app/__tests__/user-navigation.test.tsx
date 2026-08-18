import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { App } from "../src/App.tsx";
import { USER_SKELETON_COPY } from "../src/copy/user-copy.ts";

function pickLanguageCombo(): HTMLElement {
  const all = screen.queryAllByRole("combobox", { name: "Language" });
  if (all.length === 0) {
    const profileTab = [
      USER_SKELETON_COPY.km.tabs.profile,
      USER_SKELETON_COPY.en.tabs.profile,
      USER_SKELETON_COPY["zh-CN"].tabs.profile,
    ]
      .flatMap((name) => screen.queryAllByRole("tab", { name }))
      .find(Boolean);
    if (profileTab) fireEvent.click(profileTab);
    return screen.getAllByRole("combobox", { name: "Language" })[0];
  }
  const shell = all.find((el) => !el.closest(".kx-shell"));
  return shell ?? all[0];
}

describe("user-mini-app P0 skeleton navigation", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    if (typeof window.localStorage?.clear === "function") {
      window.localStorage.clear();
    } else {
      window.localStorage?.removeItem?.("payease.language");
    }
    Reflect.deleteProperty(window, "Telegram");
    Reflect.deleteProperty(document, "cookie");
    window.history.replaceState(null, "", "/");
  });

  async function renderEnglishApp(expectHomeTab = true) {
    const view = render(<App />);
    if (!expectHomeTab) {
      return view;
    }
    await goto(USER_SKELETON_COPY.km.tabs.orders);
    fireEvent.change(pickLanguageCombo(), {
      target: { value: "en" },
    });
    if (expectHomeTab) {
      await goto(USER_SKELETON_COPY.en.tabs.home);
      await waitFor(() =>
        expect(
          screen.getByRole("tab", {
            name: USER_SKELETON_COPY.en.tabs.home,
            selected: true,
          }),
        ).toBeInTheDocument(),
      );
    }
    return view;
  }

  async function goto(label: string) {
    await act(async () => {
      const firstTab = screen.getAllByRole("tab", { name: label })[0];
      fireEvent.click(firstTab);
    });
  }

  it("defaults to Home page with visible HomePage heading and four bottom tabs", async () => {
    await renderEnglishApp();
    const tabs = USER_SKELETON_COPY.en.tabs;
    expect(
      screen.getByRole("heading", { name: USER_SKELETON_COPY.en.home.title }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("tab", { name: tabs.home, selected: true }).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByRole("tab", { name: tabs.orders }).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByRole("tab", { name: tabs.repayment }).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByRole("tab", { name: tabs.profile }).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("can navigate Orders → Repayment → Profile and render each page heading", async () => {
    await renderEnglishApp();
    const tabs = USER_SKELETON_COPY.en.tabs;
    await goto(tabs.orders);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: USER_SKELETON_COPY.en.orders.title,
        }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getAllByRole("tab", { name: tabs.orders, selected: true }).length,
    ).toBeGreaterThanOrEqual(1);

    await goto(tabs.repayment);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: USER_SKELETON_COPY.en.repayment.title,
        }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getAllByRole("tab", {
        name: tabs.repayment,
        selected: true,
      }).length,
    ).toBeGreaterThanOrEqual(1);

    await goto(tabs.profile);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: USER_SKELETON_COPY.en.profile.title,
        }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getAllByRole("tab", { name: tabs.profile, selected: true }).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("opens explicit order-detail query and Back button returns Orders", async () => {
    window.history.replaceState(
      null,
      "",
      "/?page=order-detail&application=DEMO-APP-0001",
    );
    await renderEnglishApp(false);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: USER_SKELETON_COPY.km.orderDetail.title,
        }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryAllByRole("tab", { name: USER_SKELETON_COPY.km.tabs.home })
        .length,
    ).toBeLessThan(2);
    const backButton = screen.getByRole("button", {
      name: USER_SKELETON_COPY.km.backToOrders,
    });
    await act(async () => {
      fireEvent.click(backButton);
    });
    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: USER_SKELETON_COPY.km.orders.title,
        }),
      ).toBeInTheDocument(),
    );
  });

  it("switches language picker to zh-CN and updates tab labels without touching API model", async () => {
    await renderEnglishApp();
    fireEvent.change(pickLanguageCombo(), {
      target: { value: "zh-CN" },
    });
    await goto(USER_SKELETON_COPY["zh-CN"].tabs.home);
    await waitFor(() =>
      expect(
        (() => {
          const matches = screen.getAllByRole("tab", {
            name: USER_SKELETON_COPY["zh-CN"].tabs.home,
            selected: true,
          });
          return matches.length;
        })(),
      ).toBeGreaterThan(0),
    );
    expect(
      screen.getAllByRole("tab", {
        name: USER_SKELETON_COPY["zh-CN"].tabs.orders,
      }).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByRole("tab", {
        name: USER_SKELETON_COPY["zh-CN"].tabs.repayment,
      }).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByRole("tab", {
        name: USER_SKELETON_COPY["zh-CN"].tabs.profile,
      }).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByRole("heading", {
        name: USER_SKELETON_COPY["zh-CN"].home.title,
      }),
    ).toBeInTheDocument();
  });

  it("keeps the top nav, preview badge, home product CTA, and clean tab switch behavior intact", async () => {
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get: () => "__Host-payease_applicant_csrf=applicant-csrf-test-token",
    });
    vi.stubEnv("VITE_PAYEASE_DEPLOYMENT_MODE", "controlled-preview");
    await renderEnglishApp();
    const brandTitles = screen.getAllByText(/KhmerX/);
    expect(brandTitles.length).toBeGreaterThanOrEqual(1);
    const payeaseOnly = screen.queryAllByText((c, el) => {
      if (!el) return false;
      const trimmed = c.trim();
      if (!/PayEase/.test(trimmed)) return false;
      return !/KhmerX/.test(trimmed);
    });
    expect(payeaseOnly.length).toBeLessThanOrEqual(1);
    expect(screen.getByText("Controlled preview")).toBeInTheDocument();
    expect(screen.getAllByAltText("").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("USD 10–500 · 15 / 30 days")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Start loan application from credit card",
      }),
    );
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "My applications",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /save and continue/i }),
    ).toBeInTheDocument();
    await goto(USER_SKELETON_COPY.en.tabs.profile);
    expect(screen.getAllByLabelText("Language").length).toBeGreaterThanOrEqual(
      1,
    );
    expect(screen.queryByText("USD 10–500 · 15 / 30 days")).toBeNull();
    expect(screen.queryByText(/7–180 days/)).not.toBeInTheDocument();
  });

  it("opens dedicated help detail pages from the home help buttons", async () => {
    await renderEnglishApp();

    fireEvent.click(screen.getByRole("button", { name: "How to borrow" }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "How to borrow" }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/Complete your information step by step/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to Home" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Stay safe from scams" }),
      ).toBeInTheDocument(),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Stay safe from scams" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Stay safe from scams" }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/Never share verification codes/i),
    ).toBeInTheDocument();
  });

  it("opens notifications list from bell button and navigates into notification detail", async () => {
    Object.defineProperty(window, "Telegram", {
      configurable: true,
      value: { WebApp: { initData: "fresh-init-data" } },
    });
    const notificationId =
      "4f7c2d2d5f5f84f6b8ec5af8d7f6e39f2f4622b3ab887bc8f7d1d0f5b59d3321";
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/v1/local/public/telegram-sessions") {
          return new Response(null, { status: 201 });
        }
        if (url === "/api/v1/local/public/applications") {
          return new Response(
            JSON.stringify({
              preferredLanguage: "en",
              applications: [
                {
                  applicationNo: "APP-NOTIFY-001",
                  status: "BROKER_REVIEW",
                  requestedAmountMinor: "10000",
                  currency: "USD",
                  tenorDays: 30,
                  approvedAmountMinor: null,
                  rejectionConditionResolved: false,
                  rejectionNoticeCode: null,
                  supplementRequested: false,
                  createdAt: "2026-08-18T10:00:00.000Z",
                },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (url === "/api/v1/local/public/profile/view") {
          return new Response(
            JSON.stringify({
              displayName: "Preview User",
              username: "preview_user",
              photoUrl: null,
              telegramVerified: true,
              phoneVerificationStatus: "VERIFIED",
              employerDisplayName: null,
              language: "en",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (url === "/api/v1/local/public/applications/APP-NOTIFY-001") {
          return new Response(
            JSON.stringify({
              application: {
                applicationNo: "APP-NOTIFY-001",
                status: "BROKER_REVIEW",
                requestedAmountMinor: "10000",
                currency: "USD",
                tenorDays: 30,
                approvedAmountMinor: null,
                rejectionConditionResolved: false,
                rejectionNoticeCode: null,
                supplementRequested: false,
              },
              terms: null,
              repayment: {
                periodCount: 0,
                paidPeriods: 0,
                unpaidPeriods: 0,
                overduePeriods: 0,
                totalDueMinor: "0",
                totalPaidMinor: "0",
                outstandingMinor: "0",
                overdueOutstandingMinor: "0",
                nextInstallment: null,
                installments: [],
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (url.startsWith("/api/v1/local/public/notifications?")) {
          return new Response(
            JSON.stringify({
              page: 1,
              pageSize: 10,
              itemCount: 1,
              pageCount: 1,
              unreadCount: 1,
              items: [
                {
                  id: notificationId,
                  applicationNo: "APP-NOTIFY-001",
                  category: "APPLICATION",
                  messageCode: "APPLICATION_STATUS_BROKER_REVIEW",
                  timelineEntryType: "STATUS",
                  occurredAt: "2026-08-18T10:00:00.000Z",
                  unread: true,
                  status: "BROKER_REVIEW",
                },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (url === `/api/v1/local/public/notifications/${notificationId}`) {
          return new Response(
            JSON.stringify({
              id: notificationId,
              applicationNo: "APP-NOTIFY-001",
              category: "APPLICATION",
              messageCode: "APPLICATION_STATUS_BROKER_REVIEW",
              timelineEntryType: "STATUS",
              occurredAt: "2026-08-18T10:00:00.000Z",
              unread: false,
              readAt: "2026-08-18T10:05:00.000Z",
              status: "BROKER_REVIEW",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (
          url === `/api/v1/local/public/notifications/${notificationId}/read` &&
          init?.method === "POST"
        ) {
          return new Response(
            JSON.stringify({
              notificationId,
              unread: false,
              readAt: "2026-08-18T10:05:00.000Z",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        return new Response(null, { status: 404 });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    await renderEnglishApp();
    const messagesButton = await screen.findByRole("button", {
      name: /Messages/,
    });
    await waitFor(() => expect(messagesButton).toHaveTextContent("1"));
    fireEvent.click(messagesButton);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: USER_SKELETON_COPY.en.notifications.title,
        }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Application sent for review/i }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: USER_SKELETON_COPY.en.notificationDetail.title,
        }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/entered document review/i)).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Messages/ }),
      ).not.toHaveTextContent("1"),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Open application/i }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /Open application/i }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: USER_SKELETON_COPY.en.orderDetail.title,
        }),
      ).toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/local/public/applications/APP-NOTIFY-001",
      { credentials: "include" },
    );
  });

  it("supports notification pagination and mark-all-read from the list view", async () => {
    Object.defineProperty(window, "Telegram", {
      configurable: true,
      value: { WebApp: { initData: "fresh-init-data" } },
    });
    const notifications = Array.from({ length: 11 }, (_, index) => ({
      id: `notification-${index + 1}`.padEnd(64, String(index + 1)),
      applicationNo: `APP-NOTIFY-${String(index + 1).padStart(3, "0")}`,
      category: index === 10 ? ("PAYMENT" as const) : ("APPLICATION" as const),
      messageCode:
        index === 10
          ? "PAYMENT_PROOF_SUBMITTED_UNDER_REVIEW"
          : "APPLICATION_STATUS_BROKER_REVIEW",
      timelineEntryType:
        index === 10
          ? ("PAYMENT_PROOF_SUBMITTED" as const)
          : ("STATUS" as const),
      occurredAt: `2026-08-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
      unread: true,
      status: "BROKER_REVIEW",
    }));
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/v1/local/public/telegram-sessions") {
          return new Response(null, { status: 201 });
        }
        if (url === "/api/v1/local/public/applications") {
          return new Response(
            JSON.stringify({ preferredLanguage: "en", applications: [] }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (url === "/api/v1/local/public/profile/view") {
          return new Response(
            JSON.stringify({
              displayName: "Preview User",
              username: "preview_user",
              photoUrl: null,
              telegramVerified: true,
              phoneVerificationStatus: "VERIFIED",
              employerDisplayName: null,
              language: "en",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (url === "/api/v1/local/public/notifications?page=1&pageSize=10") {
          return new Response(
            JSON.stringify({
              page: 1,
              pageSize: 10,
              itemCount: notifications.length,
              pageCount: 2,
              unreadCount: notifications.filter((item) => item.unread).length,
              items: notifications.slice(0, 10),
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (url === "/api/v1/local/public/notifications?page=2&pageSize=10") {
          return new Response(
            JSON.stringify({
              page: 2,
              pageSize: 10,
              itemCount: notifications.length,
              pageCount: 2,
              unreadCount: notifications.filter((item) => item.unread).length,
              items: notifications.slice(10, 20),
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (
          url === "/api/v1/local/public/notifications/read-all" &&
          init?.method === "POST"
        ) {
          notifications.forEach((item) => {
            item.unread = false;
          });
          return new Response(
            JSON.stringify({
              readCount: notifications.length,
              unreadCount: 0,
              readAt: "2026-08-18T10:05:00.000Z",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (
          url.startsWith("/api/v1/local/public/notifications/") &&
          init?.method === "POST"
        ) {
          const notificationId = url
            .replace("/api/v1/local/public/notifications/", "")
            .replace("/read", "");
          const target = notifications.find(
            (item) => item.id === notificationId,
          );
          if (target) {
            target.unread = false;
          }
          return new Response(
            JSON.stringify({
              notificationId,
              unread: false,
              readAt: "2026-08-18T10:05:00.000Z",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        return new Response(null, { status: 404 });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    await renderEnglishApp();
    const messagesButton = await screen.findByRole("button", {
      name: /Messages/,
    });
    await waitFor(() => expect(messagesButton).toHaveTextContent("11"));
    fireEvent.click(messagesButton);

    expect(
      screen.queryByRole("button", { name: /Payment proof received/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Page 1 / 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Payment proof received/i }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("Page 2 / 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Mark all read/i }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Messages/ }),
      ).not.toHaveTextContent("11"),
    );
  });

  it("shows theme toggle only in Profile and keeps theme switching working", async () => {
    await renderEnglishApp();
    expect(
      screen.queryByRole("button", { name: "Toggle theme" }),
    ).not.toBeInTheDocument();

    await goto(USER_SKELETON_COPY.en.tabs.profile);
    const themeButton = await screen.findByRole("button", {
      name: "Toggle theme",
    });
    expect(document.documentElement).toHaveAttribute("data-theme", "light");

    fireEvent.click(themeButton);
    await waitFor(() =>
      expect(document.documentElement).toHaveAttribute("data-theme", "dark"),
    );

    await goto(USER_SKELETON_COPY.en.tabs.home);
    expect(
      screen.queryByRole("button", { name: "Toggle theme" }),
    ).not.toBeInTheDocument();
  });
});
