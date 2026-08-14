import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { App } from "../src/App.tsx";

describe("applicant submission", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, "Telegram");
    Reflect.deleteProperty(document, "cookie");
    window.history.replaceState(null, "", "/");
  });

  it("sends explicit personal-data and phone consent with the profile", async () => {
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get: () => "__Host-payease_applicant_csrf=applicant-csrf-test-token",
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          applicationNo: "APP-CONSENT-001",
          status: "BROKER_REVIEW",
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    fireEvent.change(screen.getByRole("combobox", { name: "Language" }), {
      target: { value: "en" },
    });
    fireEvent.click(screen.getByRole("button", { name: /start application/i }));
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Test Applicant" },
    });
    fireEvent.change(screen.getByLabelText("Mobile number"), {
      target: { value: "+85512345678" },
    });
    fireEvent.change(screen.getByLabelText("Employer"), {
      target: { value: "Pilot Factory" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /personal-data authorization and privacy notice/i,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /submit for broker review/i }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({
      "content-type": "application/json",
      "X-CSRF-Token": "applicant-csrf-test-token",
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      preferredLanguage: "en",
      personalProfile: {
        fullName: "Test Applicant",
        phone: "+85512345678",
        employerName: "Pilot Factory",
      },
      personalDataAndPhoneConsent: true,
    });
  });

  it("persists an applicant language selected before the Telegram session finishes", async () => {
    vi.stubGlobal("Telegram", { WebApp: { initData: "signed-init-data" } });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ preferredLanguage: "km", applications: [] }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ preferredLanguage: "en" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    fireEvent.change(screen.getByRole("combobox", { name: "Language" }), {
      target: { value: "en" },
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(screen.getByRole("combobox", { name: "Language" })).toHaveValue(
      "en",
    );
    expect(fetchMock.mock.calls[2]).toEqual([
      "/api/v1/local/public/profile/preferred-language",
      {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ preferredLanguage: "en" }),
      },
    ]);
  });

  it("tells an applicant to reopen Telegram when replayed initData cannot restore a session", async () => {
    Object.defineProperty(window, "Telegram", {
      configurable: true,
      value: { WebApp: { initData: "replayed-init-data" } },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 409 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: "UNAUTHENTICATED" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Telegram");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("renews an authenticated applicant session only after continued interaction", async () => {
    const startedAt = 1_700_000_000_000;
    const now = vi.spyOn(Date, "now").mockReturnValue(startedAt);
    Object.defineProperty(window, "Telegram", {
      configurable: true,
      value: { WebApp: { initData: "fresh-init-data" } },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ preferredLanguage: "en", applications: [] }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ preferredLanguage: "zh-CN" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    now.mockReturnValue(startedAt + 4 * 60 * 1000 - 1);
    fireEvent.change(screen.getByRole("combobox", { name: "Language" }), {
      target: { value: "zh-CN" },
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    fireEvent.keyDown(window, { key: "a" });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    now.mockReturnValue(startedAt + 4 * 60 * 1000);
    fireEvent.keyDown(window, { key: "a" });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(fetchMock.mock.calls[3]).toEqual([
      "/api/v1/local/public/telegram-sessions/keepalive",
      { method: "POST", credentials: "include" },
    ]);
  });

  it("does not send a keepalive before the activity interval", async () => {
    const startedAt = 1_700_000_000_000;
    const now = vi.spyOn(Date, "now").mockReturnValue(startedAt);
    Object.defineProperty(window, "Telegram", {
      configurable: true,
      value: { WebApp: { initData: "fresh-init-data" } },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ preferredLanguage: "en", applications: [] }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    now.mockReturnValue(startedAt + 4 * 60 * 1000 - 1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(window, { key: "a" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("opens the latest Telegram application directly into its loan dashboard", async () => {
    Object.defineProperty(window, "Telegram", {
      configurable: true,
      value: { WebApp: { initData: "fresh-init-data" } },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            preferredLanguage: "en",
            applications: [
              {
                applicationNo: "APP-RETURNING-001",
                status: "REPAYMENT_ACTIVE",
                requestedAmountMinor: "25000",
                currency: "USD",
                tenorDays: 30,
                approvedAmountMinor: "25000",
                rejectionConditionResolved: false,
                rejectionNoticeCode: null,
                supplementRequested: false,
                createdAt: "2026-08-15T00:00:00.000Z",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            application: {
              applicationNo: "APP-RETURNING-001",
              status: "REPAYMENT_ACTIVE",
              requestedAmountMinor: "25000",
              currency: "USD",
              tenorDays: 30,
              approvedAmountMinor: "25000",
              rejectionConditionResolved: false,
              rejectionNoticeCode: null,
              supplementRequested: false,
            },
            terms: {
              approvedAmountMinor: "25000",
              serviceFeeMinor: "500",
              totalRepayableMinor: "25500",
              installmentCount: 2,
              firstDueDate: "2026-09-15",
            },
            repayment: {
              periodCount: 2,
              paidPeriods: 1,
              unpaidPeriods: 1,
              overduePeriods: 0,
              totalDueMinor: "25500",
              totalPaidMinor: "12750",
              outstandingMinor: "12750",
              overdueOutstandingMinor: "0",
              nextInstallment: {
                installmentNo: 2,
                dueDate: "2026-10-15",
                amountDueMinor: "12750",
              },
              installments: [
                {
                  installmentNo: 1,
                  dueDate: "2026-09-15",
                  amountDueMinor: "12750",
                  amountPaidMinor: "12750",
                  status: "PAID",
                },
                {
                  installmentNo: 2,
                  dueDate: "2026-10-15",
                  amountDueMinor: "12750",
                  amountPaidMinor: "0",
                  status: "PENDING",
                },
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("Your loan information")).toBeVisible();
    expect(screen.getAllByText("APP-RETURNING-001")).toHaveLength(2);
    expect(screen.getByText("Next payment")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2]).toEqual([
      "/api/v1/local/public/applications/APP-RETURNING-001",
      { credentials: "include" },
    ]);
  });

  it("lets an applicant refresh the displayed decision without reopening Telegram", async () => {
    window.history.replaceState(null, "", "/?application=APP-REFRESH-001");
    const summaryResponse = () =>
      new Response(
        JSON.stringify({
          application: {
            applicationNo: "APP-REFRESH-001",
            status: "LENDER_FINAL_REVIEW",
            requestedAmountMinor: "5000",
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
    const fetchMock = vi.fn(() => Promise.resolve(summaryResponse()));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    fireEvent.change(screen.getByRole("combobox", { name: "Language" }), {
      target: { value: "en" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: /view application status/i }),
    );
    expect(await screen.findByLabelText("Loan dashboard")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Refresh status" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]).toEqual([
      "/api/v1/local/public/applications/APP-REFRESH-001",
      { credentials: "include" },
    ]);
  });

  it("shows a retryable status error after an application was submitted", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            applicationNo: "APP-STATUS-ERROR",
            status: "BROKER_REVIEW",
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: "INTERNAL_ERROR" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            application: {
              applicationNo: "APP-STATUS-ERROR",
              status: "BROKER_REVIEW",
              requestedAmountMinor: "5000",
              currency: "USD",
              tenorDays: 30,
              approvedAmountMinor: null,
              rejectionConditionResolved: false,
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
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    fireEvent.change(screen.getByRole("combobox", { name: "Language" }), {
      target: { value: "en" },
    });
    fireEvent.click(screen.getByRole("button", { name: /start application/i }));
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Test Applicant" },
    });
    fireEvent.change(screen.getByLabelText("Mobile number"), {
      target: { value: "+85512345678" },
    });
    fireEvent.change(screen.getByLabelText("Employer"), {
      target: { value: "Pilot Factory" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /personal-data authorization and privacy notice/i,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /submit for broker review/i }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /view application status/i }),
    );

    expect(
      await screen.findByText("We could not refresh the application status."),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: /view application status/i }),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: /view application status/i }),
    );
    expect(await screen.findByLabelText("Loan dashboard")).toBeVisible();
    expect(
      screen.queryByText("We could not refresh the application status."),
    ).toBeNull();
  });

  it("opens the existing application when a second submission is blocked", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: "REAPPLICATION_ACTIVE_APPLICATION_EXISTS",
            applicationNo: "APP-EXISTING-001",
            currentStatus: "BROKER_REVIEW",
          }),
          { status: 409, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            application: {
              applicationNo: "APP-EXISTING-001",
              status: "BROKER_REVIEW",
              requestedAmountMinor: "5000",
              currency: "USD",
              tenorDays: 30,
              approvedAmountMinor: null,
              rejectionConditionResolved: false,
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
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    fireEvent.change(screen.getByRole("combobox", { name: "Language" }), {
      target: { value: "en" },
    });
    fireEvent.click(screen.getByRole("button", { name: /start application/i }));
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Test Applicant" },
    });
    fireEvent.change(screen.getByLabelText("Mobile number"), {
      target: { value: "+85512345678" },
    });
    fireEvent.change(screen.getByLabelText("Employer"), {
      target: { value: "Pilot Factory" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /personal-data authorization and privacy notice/i,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /submit for broker review/i }),
    );

    expect(await screen.findByLabelText("Loan dashboard")).toBeVisible();
    expect(screen.getByText("APP-EXISTING-001")).toBeVisible();
    expect(
      screen.queryByText(
        "We could not submit this application. Please try again.",
      ),
    ).toBeNull();
    expect(window.location.search).toBe("?application=APP-EXISTING-001");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("renders the approved terms and repayment dashboard returned for the applicant", async () => {
    window.history.replaceState(null, "", "/?application=APP-LOAN-001");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          application: {
            applicationNo: "APP-LOAN-001",
            status: "REPAYMENT_ACTIVE",
            requestedAmountMinor: "25000",
            currency: "USD",
            tenorDays: 30,
            approvedAmountMinor: "25000",
            rejectionConditionResolved: false,
            supplementRequested: false,
          },
          terms: {
            approvedAmountMinor: "25000",
            serviceFeeMinor: "500",
            totalRepayableMinor: "25500",
            installmentCount: 2,
            firstDueDate: "2026-09-15",
          },
          repayment: {
            periodCount: 2,
            paidPeriods: 1,
            unpaidPeriods: 1,
            overduePeriods: 0,
            totalDueMinor: "25500",
            totalPaidMinor: "12750",
            outstandingMinor: "12750",
            overdueOutstandingMinor: "0",
            nextInstallment: {
              installmentNo: 2,
              dueDate: "2026-10-15",
              amountDueMinor: "12750",
            },
            installments: [
              {
                installmentNo: 1,
                dueDate: "2026-09-15",
                amountDueMinor: "12750",
                amountPaidMinor: "12750",
                status: "PAID",
              },
              {
                installmentNo: 2,
                dueDate: "2026-10-15",
                amountDueMinor: "12750",
                amountPaidMinor: "0",
                status: "PENDING",
              },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    fireEvent.change(screen.getByRole("combobox", { name: "Language" }), {
      target: { value: "en" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: /view application status/i }),
    );

    expect(await screen.findByText("Your loan information")).toBeVisible();
    expect(screen.getByText("Service fee")).toBeVisible();
    expect(screen.getByText("$5.00")).toBeVisible();
    expect(screen.getByText("Total repayable")).toBeVisible();
    expect(screen.getByText("$255.00")).toBeVisible();
    expect(screen.getByText("Installments")).toBeVisible();
    expect(screen.getByText("2")).toBeVisible();
    expect(screen.getByText("First repayment date")).toBeVisible();
    expect(screen.getAllByText("2026-09-15").length).toBeGreaterThan(0);
    expect(screen.getByText("Loan term")).toBeVisible();
    expect(screen.getByText("30 days")).toBeVisible();
    expect(screen.getByText("Paid periods")).toBeVisible();
    expect(screen.getByText("Unpaid periods")).toBeVisible();
    expect(screen.getByText("Total paid")).toBeVisible();
    expect(screen.getByText("Total paid").parentElement).toHaveTextContent(
      "$127.50",
    );
    expect(screen.getByText("Next payment")).toBeVisible();
    expect(screen.getAllByText(/#2.*2026-10-15/)).toHaveLength(2);
    expect(screen.getByLabelText("Manual payment safety")).toHaveTextContent(
      "Confirm payment instructions with the licensed lender's operations team",
    );
    expect(screen.getByText("Paid")).toBeVisible();
    expect(screen.getByText("Pending")).toBeVisible();
    expect(screen.queryByText("Estimated monthly payment")).toBeNull();
  });

  it("shows a controlled reapplication explanation without exposing a lender reason code", async () => {
    window.history.replaceState(null, "", "/?application=APP-REJECTED-001");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          application: {
            applicationNo: "APP-REJECTED-001",
            status: "REJECTED",
            requestedAmountMinor: "25000",
            currency: "USD",
            tenorDays: 30,
            approvedAmountMinor: null,
            rejectionConditionResolved: false,
            rejectionNoticeCode: "EMPLOYMENT_OR_INCOME_UNVERIFIED",
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
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    fireEvent.change(screen.getByRole("combobox", { name: "Language" }), {
      target: { value: "en" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: /view application status/i }),
    );

    expect(await screen.findByText("Application not approved")).toBeVisible();
    expect(screen.getByLabelText("Reapplication guidance")).toHaveTextContent(
      "Please complete employment or income verification before applying again.",
    );
    expect(screen.queryByText("SALARY_NOT_VERIFIED")).toBeNull();
  });

  it("requires a second applicant action before withdrawing a pre-contract application", async () => {
    window.history.replaceState(null, "", "/?application=APP-WITHDRAW-001");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            application: {
              applicationNo: "APP-WITHDRAW-001",
              status: "BROKER_REVIEW",
              requestedAmountMinor: "5000",
              currency: "USD",
              tenorDays: 30,
              approvedAmountMinor: null,
              rejectionConditionResolved: false,
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
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            applicationNo: "APP-WITHDRAW-001",
            status: "CLOSED",
            withdrawn: true,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    fireEvent.change(screen.getByRole("combobox", { name: "Language" }), {
      target: { value: "en" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: /view application status/i }),
    );
    expect(
      await screen.findByRole("button", { name: "Withdraw application" }),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole("button", { name: "Withdraw application" }),
    );
    expect(
      screen.getByRole("button", { name: "Confirm withdrawal" }),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Confirm withdrawal" }));
    expect(await screen.findByText("Application withdrawn")).toBeVisible();
    expect(
      screen.getByText(
        "No further action is required for this withdrawn application.",
      ),
    ).toBeVisible();
    expect(fetchMock.mock.calls[1]).toEqual([
      "/api/v1/local/public/applications/APP-WITHDRAW-001/withdraw",
      { method: "POST", credentials: "include" },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Start application" }));
    expect(
      screen.getByRole("button", { name: /^Start application/ }),
    ).toBeVisible();
    expect(window.location.search).toBe("");
  });

  it("submits a support case without exposing the response as an approval decision", async () => {
    window.history.replaceState(null, "", "/?application=APP-SUPPORT-001");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            application: {
              applicationNo: "APP-SUPPORT-001",
              status: "REPAYMENT_ACTIVE",
              requestedAmountMinor: "5000",
              currency: "USD",
              tenorDays: 30,
              approvedAmountMinor: "5000",
              rejectionConditionResolved: false,
              supplementRequested: false,
            },
            terms: {
              approvedAmountMinor: "5000",
              serviceFeeMinor: "100",
              totalRepayableMinor: "5100",
              installmentCount: 1,
              firstDueDate: "2026-09-15",
            },
            repayment: {
              periodCount: 1,
              paidPeriods: 0,
              unpaidPeriods: 1,
              overduePeriods: 0,
              totalDueMinor: "5100",
              totalPaidMinor: "0",
              outstandingMinor: "5100",
              overdueOutstandingMinor: "0",
              nextInstallment: {
                installmentNo: 1,
                dueDate: "2026-09-15",
                amountDueMinor: "5100",
              },
              installments: [
                {
                  installmentNo: 1,
                  dueDate: "2026-09-15",
                  amountDueMinor: "5100",
                  amountPaidMinor: "0",
                  status: "PENDING",
                },
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            caseNo: "CASE-20260815-ABCDEFGH",
            caseType: "COMPLAINT",
            status: "OPEN",
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    fireEvent.change(screen.getByRole("combobox", { name: "Language" }), {
      target: { value: "en" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: /view application status/i }),
    );
    await screen.findByRole("region", {
      name: "Customer support and complaints",
    });
    fireEvent.change(screen.getByLabelText("Request type"), {
      target: { value: "COMPLAINT" },
    });
    fireEvent.change(screen.getByLabelText("Tell us what happened"), {
      target: {
        value: "Please review the repayment information in my account.",
      },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Submit support case" }),
    );

    expect(
      await screen.findByText(
        /Your case CASE-20260815-ABCDEFGH has been received/,
      ),
    ).toBeVisible();
    expect(fetchMock.mock.calls[1]).toEqual([
      "/api/v1/local/public/applications/APP-SUPPORT-001/service-cases",
      {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          caseType: "COMPLAINT",
          message: "Please review the repayment information in my account.",
        }),
      },
    ]);
    expect(
      screen.getByText(/licensed lender is responsible for the final outcome/i),
    ).toBeVisible();
  });

  it("records an applicant's explicit confirmation of approved terms", async () => {
    window.history.replaceState(null, "", "/?application=APP-CONTRACT-001");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            application: {
              applicationNo: "APP-CONTRACT-001",
              status: "CONTRACT_PENDING",
              requestedAmountMinor: "25000",
              currency: "USD",
              tenorDays: 30,
              approvedAmountMinor: "25000",
              rejectionConditionResolved: false,
              supplementRequested: false,
            },
            terms: {
              approvedAmountMinor: "25000",
              serviceFeeMinor: "500",
              totalRepayableMinor: "25500",
              installmentCount: 2,
              firstDueDate: "2026-09-15",
            },
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
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "USER_CONTRACT_CONFIRMED" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    fireEvent.change(screen.getByRole("combobox", { name: "Language" }), {
      target: { value: "en" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: /view application status/i }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Confirm terms" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]).toEqual([
      "/api/v1/local/public/applications/APP-CONTRACT-001/contract-confirmation",
      { method: "POST", credentials: "include" },
    ]);
    expect(
      await screen.findByText(
        "Your confirmation is recorded. The lender is completing its contract record.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Confirm terms" })).toBeNull();
  });

  it("does not report a contract confirmation when the server rejects it", async () => {
    window.history.replaceState(null, "", "/?application=APP-CONTRACT-ERROR");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            application: {
              applicationNo: "APP-CONTRACT-ERROR",
              status: "CONTRACT_PENDING",
              requestedAmountMinor: "25000",
              currency: "USD",
              tenorDays: 30,
              approvedAmountMinor: "25000",
              rejectionConditionResolved: false,
              supplementRequested: false,
            },
            terms: {
              approvedAmountMinor: "25000",
              serviceFeeMinor: "500",
              totalRepayableMinor: "25500",
              installmentCount: 2,
              firstDueDate: "2026-09-15",
            },
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
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: "INVALID_APPLICATION_STATE" }), {
          status: 409,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    fireEvent.change(screen.getByRole("combobox", { name: "Language" }), {
      target: { value: "en" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: /view application status/i }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Confirm terms" }),
    );

    expect(
      await screen.findByText(
        "We could not record your confirmation. Please try again.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Confirm terms" })).toBeVisible();
    expect(
      screen.queryByText(
        "Your confirmation is recorded. The lender is completing its contract record.",
      ),
    ).toBeNull();
  });
});
