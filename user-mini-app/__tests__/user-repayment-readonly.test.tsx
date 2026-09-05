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
import type { ApplicationHistoryEntry, LanguageCode } from "@payease/v1-domain";
import { formatUsdMinor } from "../src/format-usd-minor.ts";

function pickLanguageCombo(): HTMLElement {
  const languageLabels = ["Language", "语言", "ភាសា"];
  const all = languageLabels.flatMap((name) =>
    screen.queryAllByRole("combobox", { name }),
  );
  if (all.length === 0) {
    const profileTab = [
      USER_SKELETON_COPY.km.tabs.profile,
      USER_SKELETON_COPY.en.tabs.profile,
      USER_SKELETON_COPY["zh-CN"].tabs.profile,
    ]
      .flatMap((name) => screen.queryAllByRole("tab", { name }))
      .find(Boolean);
    if (profileTab) fireEvent.click(profileTab);
    return languageLabels
      .flatMap((name) => screen.queryAllByRole("combobox", { name }))
      .at(0)!;
  }
  const shell = all.find((el) => !el.closest(".kx-shell"));
  return shell ?? all[0];
}

describe("user-mini-app P0 step 2: Repayment readonly boundary", () => {
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

  function seed(
    language: LanguageCode,
    scenario: "has-repayment" | "empty-no-summary",
  ) {
    Object.defineProperty(window, "Telegram", {
      configurable: true,
      value: { WebApp: { initData: `repayment-${scenario}-init` } },
    });
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get: () => "__Host-payease_applicant_csrf=applicant-csrf-test-token",
    });
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
          if (scenario === "has-repayment") {
            return new Response(
              JSON.stringify({
                preferredLanguage: language,
                applications: [
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
                ],
              }),
              { headers: { "Content-Type": "application/json" } },
            );
          }
          return new Response(
            JSON.stringify({ preferredLanguage: language, applications: [] }),
            { headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.match(/\/applications\/AP-[A-Z0-9-]+/)) {
          if (scenario === "empty-no-summary") {
            return new Response(
              JSON.stringify({
                application: {
                  applicationNo: "AP-2026-0000",
                  status: "SUBMITTED",
                  requestedAmountMinor: "5000",
                  currency: "USD",
                  tenorDays: 30,
                  approvedAmountMinor: null,
                  rejectionConditionResolved: false,
                  rejectionNoticeCode: null,
                  supplementRequested: false,
                  employerTenantDisplayName: null,
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
                serviceCases: [],
              }),
              { headers: { "Content-Type": "application/json" } },
            );
          }
          const installments = (
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
                amountPaidMinor: "3500",
                status: "PAID",
              },
            ] as const
          ).map((row) => ({
            periodNo: row.periodNo,
            dueDate: new Date(Date.now() + 86400_000 * row.days).toISOString(),
            amountDueMinor: row.amountDueMinor,
            amountPaidMinor: row.amountPaidMinor,
            status: row.status as "PENDING" | "PAID",
          }));
          const repayment = {
            periodCount: 3,
            paidPeriods: 1,
            unpaidPeriods: 2,
            overduePeriods: 0,
            totalDueMinor: "10300",
            totalPaidMinor: "3500",
            outstandingMinor: "7000",
            overdueOutstandingMinor: "0",
            nextInstallment: {
              installmentNo: 1,
              dueDate: installments[0].dueDate,
              amountDueMinor: installments[0].amountDueMinor,
            },
            installments: installments.map((it) => ({
              installmentNo: it.periodNo,
              dueDate: it.dueDate,
              amountDueMinor: it.amountDueMinor,
              amountPaidMinor: it.amountPaidMinor,
              status: it.status as "PENDING" | "PAID",
            })),
          };
          return new Response(
            JSON.stringify({
              application: {
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
              },
              terms: {
                approvedAmountMinor: "10000",
                serviceFeeMinor: "300",
                totalRepayableMinor: "10300",
                installmentCount: 3,
                firstDueDate: repayment.nextInstallment?.dueDate,
              },
              repayment,
              serviceCases: [],
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

  async function renderToRepayment(
    language: LanguageCode,
    scenario: "has-repayment" | "empty-no-summary",
  ) {
    const applicationNo =
      scenario === "has-repayment" ? "AP-2026-0001" : "AP-2026-0000";
    seed(language, scenario);
    window.history.replaceState(null, "", `/?application=${applicationNo}`);
    render(<App />);
    const languageCombo = pickLanguageCombo();
    fireEvent.change(languageCombo, {
      target: { value: language },
    });
    const dashboardMaybe = screen.queryByLabelText("Loan dashboard");
    if (!dashboardMaybe) {
      await act(async () => {
        const statusBtn = screen.queryAllByRole("button").find((btn) => {
          const raw = (btn.textContent ?? "").trim();
          return (
            raw.includes("application status") ||
            raw.includes("Check status") ||
            raw.includes("申请状态") ||
            raw.includes("检查") ||
            raw.includes("ស្ថានភាព") ||
            raw.includes("ពិនិត្យ")
          );
        });
        if (statusBtn) fireEvent.click(statusBtn);
      });
    }
    expect(await screen.findByLabelText("Loan dashboard")).toBeVisible();
    const backBtn = screen.queryByRole("link", {
      name: USER_SKELETON_COPY[language].backToOrders,
    });
    if (backBtn) {
      await act(async () => {
        fireEvent.click(backBtn);
      });
    }
    await waitFor(() =>
      expect(
        screen.queryAllByRole("tab", {
          name: USER_SKELETON_COPY[language].tabs.repayment,
        }).length,
      ).toBeGreaterThan(0),
    );
    await act(async () => {
      fireEvent.click(
        screen.getAllByRole("tab", {
          name: USER_SKELETON_COPY[language].tabs.repayment,
        })[0],
      );
    });
    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: USER_SKELETON_COPY[language].repayment.title,
        }),
      ).toBeInTheDocument(),
    );
    if (scenario === "has-repayment") {
      await waitFor(() =>
        expect(screen.queryAllByText(/\$35\.00/).length).toBeGreaterThan(0),
      );
    } else {
      await waitFor(() =>
        expect(
          screen.queryByText(USER_SKELETON_COPY[language].repayment.empty),
        ).toBeInTheDocument(),
      );
    }
  }

  const PAY_BUTTON_PATTERNS = [
    /pay now/i,
    /立即还款/,
    /pay with aba/i,
    /បង់ប្រាក់/,
    /stripe/i,
    /wing/i,
    /acleda/i,
    /payway/i,
    /visa/i,
    /mastercard/i,
    /unionpay/i,
    /confirm payment/i,
    /确认还款/,
  ] as const;

  it("Repayment tab only exposes the controlled SMILE wallet jump, never a direct pay-with-channel button", async () => {
    await renderToRepayment("en", "has-repayment");
    expect(
      screen.getByRole("button", { name: "Open SMILE wallet" }),
    ).toBeVisible();
    const buttons = screen.getAllByRole("button");
    for (const btn of buttons) {
      const label = (btn.textContent ?? "").trim();
      if (/open smile wallet/i.test(label)) continue;
      for (const re of PAY_BUTTON_PATTERNS) {
        expect(label).not.toMatch(re);
      }
    }
  });

  it("Repayment next-installment and summary amounts are rendered through formatUsdMinor (USD strings from amountMinor: string)", async () => {
    await renderToRepayment("en", "has-repayment");
    const nextPayment = screen
      .getAllByText(/\$35\.00/)
      .map((node) => node.textContent?.trim() ?? "")
      .filter(Boolean);
    expect(nextPayment.length).toBeGreaterThan(0);
    const expected = formatUsdMinor("3500");
    expect(nextPayment).toContain(expected);
    for (const node of screen.getAllByText(/\$[0-9]+\.[0-9]{2}/)) {
      const raw = node.textContent ?? "";
      const matches = raw.match(/\.\d{3,}/);
      expect(matches).toBeNull();
    }
  });

  it("Repayment empty state shows post-disbursement copy for km / zh-CN / en and never fabricates paid status", async () => {
    for (const language of ["en", "zh-CN", "km"] as const) {
      cleanup();
      await renderToRepayment(language, "empty-no-summary");
      const emptyCopy = USER_SKELETON_COPY[language].repayment.empty;
      expect(screen.getByText(emptyCopy)).toBeInTheDocument();
      const body =
        (
          screen
            .getByRole("heading", {
              name: USER_SKELETON_COPY[language].repayment.title,
            })
            .closest("section") as HTMLElement
        )?.textContent ?? "";
      for (const re of [/paid in full/i, /全部还清/, /បានសងរួច/i]) {
        expect(body).not.toMatch(re);
      }
    }
  });

  it("Repayment guidance uses the controlled wallet authorization path, not manual repayment", async () => {
    for (const language of ["en", "zh-CN", "km"] as const) {
      cleanup();
      await renderToRepayment(language, "empty-no-summary");
      expect(
        screen.getByText(
          USER_SKELETON_COPY[language].repayment.authorizationNotice,
        ),
      ).toBeInTheDocument();
      const body = document.body.textContent ?? "";
      for (const re of [
        /manual repayment guidance/i,
        /人工还款指引/,
        /ការណែនាំសម្រាប់ការសងដោយដៃ/,
      ]) {
        expect(body).not.toMatch(re);
      }
    }
  });

  it("Repayment Contact support button navigates to Profile tab", async () => {
    await renderToRepayment("en", "has-repayment");
    const supportLabel = USER_SKELETON_COPY.en.repayment.support;
    const supportButton = screen.getByRole("button", { name: supportLabel });
    await act(async () => {
      fireEvent.click(supportButton);
    });
    await waitFor(() =>
      expect(
        (() => {
          const matches = screen.queryAllByRole("tab", {
            name: USER_SKELETON_COPY.en.tabs.profile,
            selected: true,
          });
          return matches.length;
        })(),
      ).toBeGreaterThan(0),
    );
    expect(
      screen.getAllByRole("heading", {
        name: USER_SKELETON_COPY.en.profile.title,
      }).length,
    ).toBeGreaterThanOrEqual(1);
  });
});
