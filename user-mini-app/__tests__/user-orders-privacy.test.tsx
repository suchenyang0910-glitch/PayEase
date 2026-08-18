import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { App } from "../src/App.tsx";
import { USER_SKELETON_COPY } from "../src/copy/user-copy.ts";
import type {
  ApplicationHistoryEntry,
  LanguageCode,
  ServiceCaseDto,
} from "@payease/v1-domain";
import { LANGUAGE_CODES } from "@payease/v1-domain";

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

describe("user-mini-app P0 step 2: Orders / OrderDetail privacy boundary", () => {
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

  const SENSITIVE_HAYSTACK = [
    "national id",
    "passport no",
    "id number",
    "phone",
    "mobile",
    "+855",
    "+86",
    "salary",
    "wage",
    "income",
    "aba bank",
    "wing",
    "acleda",
    "stripe",
    "payway",
    "visa",
    "mastercard",
    "unionpay",
    "swift",
    "iban",
    "bank account",
  ] as const;

  function seedHistoryAndSummary(language: LanguageCode) {
    Object.defineProperty(window, "Telegram", {
      configurable: true,
      value: { WebApp: { initData: "orders-privacy-init" } },
    });
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get: () => "__Host-payease_applicant_csrf=applicant-csrf-test-token",
    });
    const applications: readonly ApplicationHistoryEntry[] = [
      {
        applicationNo: "AP-2026-0001",
        status: "APPROVED_PENDING_CONTRACT",
        requestedAmountMinor: "10000",
        currency: "USD",
        tenorDays: 30,
        approvedAmountMinor: "10000",
        rejectionConditionResolved: false,
        rejectionNoticeCode: null,
        supplementRequested: false,
        employerTenantDisplayName: "Factory A (Demo)",
        createdAt: new Date(Date.now() - 86400_000).toISOString(),
      },
      {
        applicationNo: "AP-2026-0002",
        status: "SUBMITTED",
        requestedAmountMinor: "25000",
        currency: "USD",
        tenorDays: 60,
        approvedAmountMinor: null,
        rejectionConditionResolved: false,
        rejectionNoticeCode: null,
        supplementRequested: false,
        employerTenantDisplayName: "Factory B (Demo)",
        createdAt: new Date(Date.now() - 3600_000).toISOString(),
      },
    ];
    const repayment = {
      periodCount: 3,
      paidPeriods: 0,
      unpaidPeriods: 3,
      overduePeriods: 0,
      totalDueMinor: "10300",
      totalPaidMinor: "0",
      outstandingMinor: "10000",
      overdueOutstandingMinor: "0",
      nextInstallment: {
        installmentNo: 1,
        dueDate: new Date(Date.now() + 86400_000 * 10).toISOString(),
        amountDueMinor: "3500",
      },
      installments: (
        [
          {
            periodNo: 1,
            days: 10,
            amountDueMinor: "3500",
            amountPaidMinor: "0",
            status: "PENDING",
          },
          {
            periodNo: 2,
            days: 40,
            amountDueMinor: "3500",
            amountPaidMinor: "0",
            status: "PENDING",
          },
          {
            periodNo: 3,
            days: 70,
            amountDueMinor: "3500",
            amountPaidMinor: "0",
            status: "PENDING",
          },
        ] as const
      ).map((row) => ({
        installmentNo: row.periodNo,
        dueDate: new Date(Date.now() + 86400_000 * row.days).toISOString(),
        amountDueMinor: row.amountDueMinor,
        amountPaidMinor: row.amountPaidMinor,
        status: row.status as "PENDING" | "PAID",
      })),
    };
    const cases: readonly ServiceCaseDto[] = [
      {
        caseNo: "CASE-1",
        caseType: "SERVICE_QUERY",
        status: "OPEN",
        createdAt: new Date(Date.now() - 3600_000).toISOString(),
        applicationNo: "AP-2026-0001",
        lastMessage: null,
      },
    ];
    const timeline = [
      {
        occurredAt: new Date(Date.now() - 7200_000).toISOString(),
        entryType: "STATUS",
        status: "BROKER_REVIEW",
      },
      {
        occurredAt: new Date(Date.now() - 3600_000).toISOString(),
        entryType: "REASSESSMENT_APPROVAL",
        stage: "CREDIT_CHECKER_REVIEW",
        decision: "APPROVED",
        actorUserRef: "internal-reviewer-001",
        reasonCode: "REASSESSMENT_ELIGIBLE",
        referenceNo: "REA-DEMO-ABCD1234",
      },
    ] as const;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        if (url.includes("/telegram-sessions")) {
          return new Response(null, { status: 201 });
        }
        if (url.includes("/profile/preferred-language")) {
          return new Response(JSON.stringify({ ok: true, language }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.includes("/applications") && !url.match(/\/AP-[A-Z0-9-]+/)) {
          return new Response(
            JSON.stringify({ preferredLanguage: language, applications }),
            { headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.match(/\/applications\/AP-[A-Z0-9-]+/)) {
          return new Response(
            JSON.stringify({
              application: {
                applicationNo: applications[0].applicationNo,
                status: applications[0].status,
                requestedAmountMinor: applications[0].requestedAmountMinor,
                currency: "USD",
                tenorDays: applications[0].tenorDays,
                approvedAmountMinor: applications[0].approvedAmountMinor,
                rejectionConditionResolved: false,
                rejectionNoticeCode: null,
                supplementRequested: false,
                employerTenantDisplayName:
                  applications[0].employerTenantDisplayName ?? null,
              },
              terms: {
                approvedAmountMinor:
                  applications[0].approvedAmountMinor ??
                  applications[0].requestedAmountMinor,
                serviceFeeMinor: "300",
                totalRepayableMinor: "10300",
                installmentCount: 3,
                firstDueDate: repayment.nextInstallment?.dueDate,
              },
              repayment,
              recordDetail: {
                createdAt: applications[0].createdAt,
                updatedAt: new Date().toISOString(),
                canUploadPaymentProof: false,
                canRequestReassessment: false,
              },
              timeline,
              serviceCases: cases,
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("/service-cases")) {
          return new Response(
            JSON.stringify({
              ok: true,
              cases: [
                {
                  caseNo: "CASE-1",
                  caseType: "SERVICE_QUERY",
                  status: "OPEN",
                  createdAt: new Date(Date.now() - 3600_000).toISOString(),
                  applicationNo: "AP-2026-0001",
                  lastMessage: null,
                },
              ],
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        }
        if (body?.action === "keepAlive" || url.includes("keepAlive")) {
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.includes("/employers/tenants")) {
          return new Response(JSON.stringify({ ok: true, tenants: [] }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
  }

  async function renderEnglishAppToOrders() {
    seedHistoryAndSummary("en");
    window.history.replaceState(null, "", "/");
    render(<App />);
    await act(async () => {
      fireEvent.click(
        screen.getAllByRole("tab", {
          name: USER_SKELETON_COPY.km.tabs.orders,
        })[0],
      );
    });
    fireEvent.change(pickLanguageCombo(), {
      target: { value: "en" },
    });
    const allOrdersTabs = screen.getAllByRole("tab", {
      name: USER_SKELETON_COPY.en.tabs.orders,
    });
    expect(allOrdersTabs.length).toBeGreaterThan(0);
    await act(async () => {
      fireEvent.click(allOrdersTabs[0]);
    });
    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: USER_SKELETON_COPY.en.orders.title,
        }),
      ).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(
        screen.queryByLabelText("Application history"),
      ).toBeInTheDocument(),
    );
  }

  it("Orders list never exposes 6+ digit id fields, phone, salary, or bank identifiers in rendered text", async () => {
    await renderEnglishAppToOrders();
    const ordersSection = screen
      .getByLabelText("Application history")
      .closest("section") as HTMLElement;
    const rendered = ordersSection.textContent ?? "";
    const lowered = rendered.toLowerCase();
    for (const needle of SENSITIVE_HAYSTACK) {
      expect(lowered).not.toContain(needle.toLowerCase());
    }
    const matches = rendered.match(/\d{6,}/g);
    expect(matches).toBeNull();
  });

  it("OrderDetail (approved summary) never exposes salary, identity document, or bank identifiers", async () => {
    await renderEnglishAppToOrders();
    const historyList = screen
      .getByLabelText("Application history")
      .closest("section") as HTMLElement;
    const firstRow = within(historyList)
      .getAllByRole("button")
      .find(
        (btn) =>
          (btn.textContent ?? "").includes("AP-2026-0001") ||
          (btn.textContent ?? "").includes("AP-2026"),
      ) as HTMLButtonElement;
    expect(firstRow).toBeDefined();
    await act(async () => {
      fireEvent.click(firstRow);
    });
    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: USER_SKELETON_COPY.en.orderDetail.title,
        }),
      ).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.queryByLabelText("Loan dashboard")).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Application timeline")).toBeInTheDocument();
    expect(
      screen.getByText("Reassessment approval updated"),
    ).toBeInTheDocument();
    const detailSection =
      screen.getByLabelText("Loan dashboard").closest("section") ??
      document.body;
    const rendered = (detailSection.textContent ?? "").toLowerCase();
    for (const needle of SENSITIVE_HAYSTACK) {
      expect(rendered).not.toContain(needle);
    }
    expect(rendered).not.toContain("internal-reviewer-001");
    const matches = (detailSection.textContent ?? "").match(/\d{6,}/g);
    expect(matches).toBeNull();
  });

  it("Language copy uses USER_SKELETON_COPY as single source across km / zh-CN / en orders tab", async () => {
    for (const language of LANGUAGE_CODES) {
      cleanup();
      seedHistoryAndSummary(language);
      window.history.replaceState(null, "", "/");
      const view = render(<App />);
      const initialOrdersTab = [
        USER_SKELETON_COPY.km.tabs.orders,
        USER_SKELETON_COPY.en.tabs.orders,
        USER_SKELETON_COPY["zh-CN"].tabs.orders,
      ]
        .flatMap((name) => screen.queryAllByRole("tab", { name }))
        .find(Boolean);
      if (!initialOrdersTab) {
        throw new Error("Orders tab is unavailable for the current language");
      }
      await act(async () => {
        fireEvent.click(initialOrdersTab);
      });
      fireEvent.change(pickLanguageCombo(), {
        target: { value: language },
      });
      const backLink = screen.queryByRole("link", {
        name: USER_SKELETON_COPY[language].backToOrders,
      });
      if (backLink) {
        await act(async () => {
          fireEvent.click(backLink);
        });
      }
      await waitFor(() =>
        expect(
          screen.queryAllByRole("tab", {
            name: USER_SKELETON_COPY[language].tabs.orders,
          }).length,
        ).toBeGreaterThan(0),
      );
      await act(async () => {
        fireEvent.click(
          screen.getAllByRole("tab", {
            name: USER_SKELETON_COPY[language].tabs.orders,
          })[0],
        );
      });
      await waitFor(() =>
        expect(
          screen.getByRole("heading", {
            name: USER_SKELETON_COPY[language].orders.title,
          }),
        ).toBeInTheDocument(),
      );
      const heading = screen.getByRole("heading", {
        name: USER_SKELETON_COPY[language].orders.title,
      });
      expect(heading).toBeInTheDocument();
      cleanup();
      view.unmount();
    }
  });
});
