import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { App } from "../src/App.tsx";

const TEST_EMPLOYER_TENANT_ID = "4c16e7c6-6a31-4d22-9f47-4b5f9f6db201";

function shellPick<T extends HTMLElement = HTMLElement>(
  arr: T[] | (() => T[] | Promise<T[]>),
  isAsync = false,
): any {
  return null;
}

function pickLabel(label: string): HTMLElement {
  let all = screen.queryAllByLabelText(label);
  if (all.length === 0) {
    // Tests that assert English form fields must not depend on the product's
    // persisted language preference left by an earlier scenario.
    const languageSelect = Array.from(
      document.querySelectorAll<HTMLSelectElement>("select"),
    ).find(
      (element) =>
        !element.closest(".kx-shell") &&
        Array.from(element.options).some((option) => option.value === "en"),
    );
    if (languageSelect) {
      fireEvent.change(languageSelect, { target: { value: "en" } });
      all = screen.queryAllByLabelText(label);
    }
  }
  if (all.length === 0) {
    throw new Error(`Unable to find form label: ${label}`);
  }
  return all.find((el) => !el.closest(".kx-shell")) ?? all[0];
}

function pickRoleLiteral(role: string, name: string): HTMLElement {
  const all = screen.getAllByRole(role as any, { name });
  return all.find((el) => !el.closest(".kx-shell")) ?? all[0];
}

function pickRoleRe(role: string, name: RegExp): HTMLElement {
  const all = screen.getAllByRole(role as any, { name });
  return all.find((el) => !el.closest(".kx-shell")) ?? all[0];
}

async function findRoleRe(role: string, name: RegExp): Promise<HTMLElement> {
  const all = await screen.findAllByRole(role as any, { name });
  return (all.find((el) => !el.closest(".kx-shell")) ?? all[0]) as HTMLElement;
}

async function findRoleLiteral(
  role: string,
  name: string,
): Promise<HTMLElement> {
  const all = await screen.findAllByRole(role as any, { name });
  return (all.find((el) => !el.closest(".kx-shell")) ?? all[0]) as HTMLElement;
}

function pickCheckbox(): HTMLElement {
  const all = screen.getAllByRole("checkbox");
  return all.find((el) => !el.closest(".kx-shell")) ?? all[0];
}

function clickConsentLabel(name: RegExp): void {
  const label = screen
    .queryAllByText(name)
    .map((element) => element.closest("label"))
    .find(Boolean);
  if (!label) return;
  const checkbox = label.querySelector<HTMLInputElement>(
    'input[type="checkbox"]',
  );
  if (checkbox && !checkbox.checked) {
    fireEvent.click(label);
    expect(checkbox.checked).toBe(true);
  }
}

function toggleConsentCheckbox(): void {
  const checkbox = screen
    .getAllByRole("checkbox")
    .find((element) =>
      element.closest(".consent--confirm"),
    ) as HTMLInputElement;
  fireEvent.click(checkbox.closest("label") ?? checkbox);
  expect(checkbox.checked).toBe(true);
  clickConsentLabel(
    /employer verification|企业仅核验在职状态|ក្រុមហ៊ុនផ្ទៀងផ្ទាត់ស្ថានភាពការងារ/i,
  );
  clickConsentLabel(
    /broker service agreement|助贷服务协议|កិច្ចព្រមព្រៀងសេវាភ្នាក់ងារ/i,
  );
  clickConsentLabel(
    /brokerage remuneration becomes due only after disbursement|放款后形成应收|កម្រៃជើងសារ KhmerX/i,
  );
}

function pickLanguage(): HTMLElement {
  const languageLabels = ["Language", "语言", "ភាសា"];
  const all = languageLabels.flatMap((name) =>
    screen.queryAllByRole("combobox", { name }),
  );
  if (all.length === 0) {
    const profileTab = ["Me", "我的", "របស់ខ្ញុំ"]
      .flatMap((name) => screen.queryAllByRole("tab", { name }))
      .find(Boolean);
    if (profileTab) fireEvent.click(profileTab);
    return languageLabels
      .flatMap((name) => screen.queryAllByRole("combobox", { name }))
      .at(0)!;
  }
  return all.find((el) => !el.closest(".kx-shell")) ?? all[0];
}

function currentTabLabel(
  label: "home" | "orders" | "repayment" | "profile",
): string {
  const text = document.body.textContent ?? "";
  if (
    text.includes("Home") ||
    text.includes("Borrow") ||
    text.includes("Profile")
  ) {
    return label === "home"
      ? "Home"
      : label === "orders"
        ? "Borrow"
        : label === "repayment"
          ? "Bill"
          : "Me";
  }
  if (text.includes("首页") || text.includes("借款") || text.includes("我的")) {
    return label === "home"
      ? "首页"
      : label === "orders"
        ? "借款"
        : label === "repayment"
          ? "账单"
          : "我的";
  }
  return label === "home"
    ? "ទំព័រដើម"
    : label === "orders"
      ? "ខ្ចីប្រាក់"
      : label === "repayment"
        ? "វិក្កយបត្រ"
        : "របស់ខ្ញុំ";
}

function openProfileLanguagePicker(): void {
  void currentTabLabel;
}

async function findAlert(): Promise<HTMLElement> {
  const all = await screen.findAllByRole("alert");
  return (all.find((el) => !el.closest(".kx-shell")) ?? all[0]) as HTMLElement;
}

function pickLink(): HTMLElement {
  const all = screen.getAllByRole("link");
  return all.find((el) => !el.closest(".kx-shell")) ?? all[0];
}

function queryHeading(role: string, name: string): HTMLElement | null {
  const all = screen.queryAllByRole(role as any, { name });
  if (all.length === 0) return null;
  return all.find((el) => !el.closest(".kx-shell")) ?? all[0];
}

function openOrdersFromHome(): void {
  const borrowTabs = screen.getAllByRole("tab", { name: /borrow|借款|ខ្ចី/i });
  fireEvent.click(borrowTabs[0]!);
}

async function findBorrowEntryButton(): Promise<HTMLElement> {
  return await screen.findByTestId("applicant-entry-submit-button");
}

async function enterBorrowDetailsStepIfNeeded(): Promise<void> {
  const entryButton = screen.queryByTestId("applicant-entry-submit-button");
  if (entryButton) {
    fireEvent.click(entryButton);
    return;
  }
  await findRoleRe("button", /save and continue|保存并继续|រក្សាទុក និងបន្ត/i);
}

async function findSubmitReviewButton(): Promise<HTMLElement> {
  const all = await screen.findAllByRole("button", {
    name: /submit for broker review|提交审核|确认提交/i,
  });
  return (all.find((element) => !element.closest(".application-stepper")) ??
    all[0]) as HTMLElement;
}

function continueApplicationStep(): void {
  const button =
    screen.queryByRole("button", { name: /save and continue/i }) ??
    screen.queryByRole("button", { name: /保存并继续/i }) ??
    screen.queryByRole("button", { name: /រក្សាទុក និងបន្ត/i });
  if (!button) throw new Error("Continue-step button not found");
  fireEvent.click(button);
}

function fillEnglishApplicationToConfirm(options?: {
  employer?: string;
  contactOneName?: string;
  contactOnePhone?: string;
  contactTwoName?: string;
  contactTwoPhone?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountHolder?: string;
}): void {
  // The Mini App intentionally remembers the applicant's language preference.
  // This helper asserts English copy, so select English explicitly rather than
  // relying on the default (which is Khmer for a fresh applicant session).
  fireEvent.change(pickLanguage(), { target: { value: "en" } });
  fireEvent.change(pickLabel("Current address"), {
    target: { value: "Phnom Penh" },
  });
  fireEvent.change(pickLabel("Full name"), {
    target: { value: "Test Applicant" },
  });
  fireEvent.change(pickLabel("Mobile number"), {
    target: { value: "+85512345678" },
  });
  fireEvent.change(pickLabel("Employer"), {
    target: { value: options?.employer ?? "Pilot Factory" },
  });
  continueApplicationStep();

  fireEvent.change(pickLabel("Emergency contact 1"), {
    target: { value: options?.contactOneName ?? "Contact One" },
  });
  fireEvent.change(pickLabel("Emergency contact 1 phone"), {
    target: { value: options?.contactOnePhone ?? "+85511111111" },
  });
  fireEvent.change(pickLabel("Emergency contact 2"), {
    target: { value: options?.contactTwoName ?? "Contact Two" },
  });
  fireEvent.change(pickLabel("Emergency contact 2 phone"), {
    target: { value: options?.contactTwoPhone ?? "+85522222222" },
  });
  continueApplicationStep();

  if (screen.queryByLabelText("Select factory")) {
    fireEvent.change(pickLabel("Select factory"), {
      target: { value: TEST_EMPLOYER_TENANT_ID },
    });
    fireEvent.change(pickLabel("National ID / passport number"), {
      target: { value: "KH-ID-10001" },
    });
  }
  fireEvent.change(pickLabel("Receiving bank"), {
    target: { value: options?.bankName ?? "ABA" },
  });
  fireEvent.change(pickLabel("Account / card number"), {
    target: { value: options?.bankAccountNumber ?? "000111222333" },
  });
  fireEvent.change(pickLabel("Account holder name"), {
    target: { value: options?.bankAccountHolder ?? "Test Applicant" },
  });
  continueApplicationStep();
  continueApplicationStep();
}

function verifiedProfileResponse(
  overrides: Partial<{
    displayName: string | null;
    username: string | null;
    photoUrl: string | null;
    telegramVerified: boolean;
    phoneVerificationStatus: "VERIFIED" | "PENDING" | "NOT_STARTED";
    employerDisplayName: string | null;
    language: "km" | "en" | "zh-CN";
    activeApplication: {
      referenceMasked?: string;
      status: string;
      nextAction: string;
    };
    activeBill: {
      referenceMasked?: string;
      status: string;
      dueDate: string | null;
    };
  }> = {},
): Response {
  return new Response(
    JSON.stringify({
      displayName: "Preview User",
      username: "preview_user",
      photoUrl: null,
      telegramVerified: true,
      phoneVerificationStatus: "NOT_STARTED",
      employerDisplayName: null,
      language: "en",
      ...overrides,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function emptyDraftResponse(): Response {
  return new Response(JSON.stringify({ draft: null }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function persistTestLanguage(language: "en" | "km" | "zh-CN"): void {
  const storage: Record<string, string> = { "payease.language": language };
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage[key] ?? null,
      setItem: (key: string, value: string) => {
        storage[key] = String(value);
      },
      removeItem: (key: string) => {
        delete storage[key];
      },
      clear: () => {
        for (const key of Object.keys(storage)) delete storage[key];
      },
    },
  });
}

describe("applicant submission", () => {
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
    openOrdersFromHome();
    openProfileLanguagePicker();
    fireEvent.change(pickLanguage(), {
      target: { value: "en" },
    });
    fireEvent.click(screen.getAllByRole("tab", { name: "Borrow" })[0]!);
    await findBorrowEntryButton();
    fireEvent.change(pickLabel("Enter requested amount (USD 10–500)"), {
      target: { value: "123.45" },
    });
    fireEvent.click(await findBorrowEntryButton());
    fillEnglishApplicationToConfirm();
    toggleConsentCheckbox();
    fireEvent.click(await findSubmitReviewButton());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({
      "content-type": "application/json",
      "X-CSRF-Token": "applicant-csrf-test-token",
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      preferredLanguage: "en",
      requestedAmount: { amountMinor: "12345", currency: "USD" },
      personalProfile: {
        fullName: "Test Applicant",
        phone: "+85512345678",
        employerName: "Pilot Factory",
      },
      personalDataAndPhoneConsent: true,
    });
  });

  it("keeps a controlled preview read-only before personal-data entry", async () => {
    vi.stubEnv("VITE_PAYEASE_DEPLOYMENT_MODE", "controlled-preview");

    render(<App />);
    openOrdersFromHome();
    openProfileLanguagePicker();
    fireEvent.change(pickLanguage(), {
      target: { value: "en" },
    });
    fireEvent.click(screen.getAllByRole("tab", { name: "Borrow" })[0]!);

    expect(
      await screen.findByText(
        "This preview is view-only. Applications and personal data entry are disabled.",
      ),
    ).toBeVisible();
    expect(await findBorrowEntryButton()).toBeDisabled();
  });

  it("requires a signed-in applicant to choose a factory and submit an identity document", async () => {
    persistTestLanguage("en");
    Object.defineProperty(window, "Telegram", {
      configurable: true,
      value: { WebApp: { initData: "signed-init-data" } },
    });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/v1/local/public/telegram-sessions") {
        return Promise.resolve(new Response(null, { status: 201 }));
      }
      if (url === "/api/v1/local/public/applications" && !init?.method) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ preferredLanguage: "en", applications: [] }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          ),
        );
      }
      if (url === "/api/v1/local/public/profile/view") {
        return Promise.resolve(verifiedProfileResponse({ language: "en" }));
      }
      if (url.startsWith("/api/v1/local/public/notifications?")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              page: 1,
              pageSize: 10,
              itemCount: 0,
              pageCount: 1,
              unreadCount: 0,
              items: [],
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          ),
        );
      }
      if (
        url === "/api/v1/local/public/application-draft" &&
        (!init?.method || init.method === "GET")
      ) {
        return Promise.resolve(emptyDraftResponse());
      }
      if (
        url === "/api/v1/local/public/application-draft" &&
        init?.method === "PUT"
      ) {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      if (url === "/api/v1/local/public/employer-tenants") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              tenants: [
                {
                  id: TEST_EMPLOYER_TENANT_ID,
                  displayName: "Lanhai Factory A",
                },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        );
      }
      if (url === "/api/v1/local/applications" && init?.method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              applicationNo: "APP-FACTORY-001",
              status: "BROKER_REVIEW",
            }),
            { status: 201, headers: { "content-type": "application/json" } },
          ),
        );
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    openOrdersFromHome();
    fireEvent.click(await findBorrowEntryButton());
    fireEvent.change(pickLabel("Current address"), {
      target: { value: "Phnom Penh" },
    });
    fireEvent.change(pickLabel("Full name"), {
      target: { value: "Factory Applicant" },
    });
    fireEvent.change(pickLabel("Mobile number"), {
      target: { value: "+85512345678" },
    });
    fireEvent.change(pickLabel("Employer"), {
      target: { value: "Lanhai Factory A" },
    });
    continueApplicationStep();
    fireEvent.change(pickLabel("Emergency contact 1"), {
      target: { value: "Contact One" },
    });
    fireEvent.change(pickLabel("Emergency contact 1 phone"), {
      target: { value: "+85511111111" },
    });
    fireEvent.change(pickLabel("Emergency contact 2"), {
      target: { value: "Contact Two" },
    });
    fireEvent.change(pickLabel("Emergency contact 2 phone"), {
      target: { value: "+85522222222" },
    });
    continueApplicationStep();
    fireEvent.change(pickLabel("Receiving bank"), {
      target: { value: "ABA" },
    });
    fireEvent.change(pickLabel("Account / card number"), {
      target: { value: "000111222333" },
    });
    fireEvent.change(pickLabel("Account holder name"), {
      target: { value: "Factory Applicant" },
    });
    await findRoleLiteral("option", "Lanhai Factory A");
    continueApplicationStep();

    expect(await findAlert()).toHaveTextContent(
      "Select your factory and enter a valid identity document number.",
    );
    const requestCountBeforeFactorySelection = fetchMock.mock.calls.length;

    fireEvent.change(pickLabel("Select factory"), {
      target: { value: TEST_EMPLOYER_TENANT_ID },
    });
    fireEvent.change(pickLabel("National ID / passport number"), {
      target: { value: "KH-ID-10001" },
    });
    continueApplicationStep();
    continueApplicationStep();
    toggleConsentCheckbox();
    fireEvent.click(await findSubmitReviewButton());

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            url === "/api/v1/local/applications" &&
            (init as RequestInit | undefined)?.method === "POST",
        ),
      ).toBe(true),
    );
    expect(fetchMock.mock.calls.length).toBeGreaterThan(
      requestCountBeforeFactorySelection,
    );
    const [, init] = fetchMock.mock.calls.findLast(
      ([url, init]) =>
        url === "/api/v1/local/applications" &&
        (init as RequestInit | undefined)?.method === "POST",
    ) as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      selectedRepaymentMethod: "SMILE_WALLET_AUTHORIZATION",
      employerTenantId: TEST_EMPLOYER_TENANT_ID,
      identityDocument: { type: "NATIONAL_ID", number: "KH-ID-10001" },
      authorizationSnapshot: {
        employerVerificationAuthorized: true,
        serviceAgreementAuthorized: true,
        postDisbursementBrokerageAuthorized: true,
      },
    });
  });

  it("does not send malformed phone data to the application API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    openOrdersFromHome();
    openProfileLanguagePicker();
    fireEvent.change(pickLanguage(), {
      target: { value: "en" },
    });
    fireEvent.click(screen.getAllByRole("tab", { name: "Borrow" })[0]!);
    fireEvent.click(await findBorrowEntryButton());
    fireEvent.change(pickLabel("Current address"), {
      target: { value: "Phnom Penh" },
    });
    fireEvent.change(pickLabel("Full name"), {
      target: { value: "Test Applicant" },
    });
    fireEvent.change(pickLabel("Mobile number"), {
      target: { value: "invalid" },
    });
    fireEvent.change(pickLabel("Employer"), {
      target: { value: "Pilot Factory" },
    });
    continueApplicationStep();

    expect(await findAlert()).toHaveTextContent("Enter a valid mobile number.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the factory guidance when the backend rejects employerTenantId validation", async () => {
    persistTestLanguage("en");
    Object.defineProperty(window, "Telegram", {
      configurable: true,
      value: { WebApp: { initData: "signed-init-data" } },
    });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/v1/local/public/telegram-sessions") {
        return Promise.resolve(new Response(null, { status: 201 }));
      }
      if (url === "/api/v1/local/public/applications" && !init?.method) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ preferredLanguage: "en", applications: [] }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          ),
        );
      }
      if (url === "/api/v1/local/public/profile/view") {
        return Promise.resolve(verifiedProfileResponse({ language: "en" }));
      }
      if (url.startsWith("/api/v1/local/public/notifications?")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              page: 1,
              pageSize: 10,
              itemCount: 0,
              pageCount: 1,
              unreadCount: 0,
              items: [],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        );
      }
      if (
        url === "/api/v1/local/public/application-draft" &&
        (!init?.method || init.method === "GET")
      ) {
        return Promise.resolve(emptyDraftResponse());
      }
      if (
        url === "/api/v1/local/public/application-draft" &&
        init?.method === "PUT"
      ) {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      if (url === "/api/v1/local/public/employer-tenants") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              tenants: [
                {
                  id: TEST_EMPLOYER_TENANT_ID,
                  displayName: "Lanhai Factory A",
                },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        );
      }
      if (url === "/api/v1/local/applications" && init?.method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              code: "VALIDATION_ERROR",
              fields: ["employerTenantId"],
            }),
            { status: 400, headers: { "content-type": "application/json" } },
          ),
        );
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    openOrdersFromHome();
    fireEvent.click(await findBorrowEntryButton());
    fireEvent.change(pickLabel("Current address"), {
      target: { value: "Phnom Penh" },
    });
    fireEvent.change(pickLabel("Full name"), {
      target: { value: "Factory Applicant" },
    });
    fireEvent.change(pickLabel("Mobile number"), {
      target: { value: "+85512345678" },
    });
    fireEvent.change(pickLabel("Employer"), {
      target: { value: "Lanhai Factory A" },
    });
    continueApplicationStep();
    fireEvent.change(pickLabel("Emergency contact 1"), {
      target: { value: "Contact One" },
    });
    fireEvent.change(pickLabel("Emergency contact 1 phone"), {
      target: { value: "+85511111111" },
    });
    fireEvent.change(pickLabel("Emergency contact 2"), {
      target: { value: "Contact Two" },
    });
    fireEvent.change(pickLabel("Emergency contact 2 phone"), {
      target: { value: "+85522222222" },
    });
    continueApplicationStep();
    fireEvent.change(pickLabel("Receiving bank"), {
      target: { value: "ABA" },
    });
    fireEvent.change(pickLabel("Account / card number"), {
      target: { value: "000111222333" },
    });
    fireEvent.change(pickLabel("Account holder name"), {
      target: { value: "Factory Applicant" },
    });
    await findRoleLiteral("option", "Lanhai Factory A");
    fireEvent.change(pickLabel("Select factory"), {
      target: { value: TEST_EMPLOYER_TENANT_ID },
    });
    fireEvent.change(pickLabel("National ID / passport number"), {
      target: { value: "KH-ID-10001" },
    });
    continueApplicationStep();
    continueApplicationStep();
    toggleConsentCheckbox();
    fireEvent.click(await findSubmitReviewButton());

    expect(await findAlert()).toHaveTextContent(
      "Select your factory and enter a valid identity document number.",
    );
  });

  it("allows revisiting previous steps from the confirm flow navigator", async () => {
    persistTestLanguage("en");
    Object.defineProperty(window, "Telegram", {
      configurable: true,
      value: { WebApp: { initData: "signed-init-data" } },
    });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/v1/local/public/telegram-sessions") {
        return Promise.resolve(new Response(null, { status: 201 }));
      }
      if (url === "/api/v1/local/public/applications" && !init?.method) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ preferredLanguage: "en", applications: [] }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          ),
        );
      }
      if (url === "/api/v1/local/public/profile/view") {
        return Promise.resolve(verifiedProfileResponse({ language: "en" }));
      }
      if (url.startsWith("/api/v1/local/public/notifications?")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              page: 1,
              pageSize: 10,
              itemCount: 0,
              pageCount: 1,
              unreadCount: 0,
              items: [],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        );
      }
      if (
        url === "/api/v1/local/public/application-draft" &&
        (!init?.method || init.method === "GET")
      ) {
        return Promise.resolve(emptyDraftResponse());
      }
      if (
        url === "/api/v1/local/public/application-draft" &&
        init?.method === "PUT"
      ) {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      if (url === "/api/v1/local/public/employer-tenants") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              tenants: [
                {
                  id: TEST_EMPLOYER_TENANT_ID,
                  displayName: "Lanhai Factory A",
                },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        );
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    openOrdersFromHome();
    fireEvent.click(await findBorrowEntryButton());
    fireEvent.change(pickLabel("Current address"), {
      target: { value: "Phnom Penh" },
    });
    fireEvent.change(pickLabel("Full name"), {
      target: { value: "Navigator Applicant" },
    });
    fireEvent.change(pickLabel("Mobile number"), {
      target: { value: "+85512345678" },
    });
    fireEvent.change(pickLabel("Employer"), {
      target: { value: "Lanhai Factory A" },
    });
    continueApplicationStep();
    fireEvent.change(pickLabel("Emergency contact 1"), {
      target: { value: "Contact One" },
    });
    fireEvent.change(pickLabel("Emergency contact 1 phone"), {
      target: { value: "+85511111111" },
    });
    fireEvent.change(pickLabel("Emergency contact 2"), {
      target: { value: "Contact Two" },
    });
    fireEvent.change(pickLabel("Emergency contact 2 phone"), {
      target: { value: "+85522222222" },
    });
    continueApplicationStep();
    await findRoleLiteral("option", "Lanhai Factory A");
    fireEvent.change(pickLabel("Select factory"), {
      target: { value: TEST_EMPLOYER_TENANT_ID },
    });
    fireEvent.change(pickLabel("National ID / passport number"), {
      target: { value: "KH-ID-10001" },
    });
    fireEvent.change(pickLabel("Receiving bank"), {
      target: { value: "ABA" },
    });
    fireEvent.change(pickLabel("Account / card number"), {
      target: { value: "000111222333" },
    });
    fireEvent.change(pickLabel("Account holder name"), {
      target: { value: "Navigator Applicant" },
    });
    continueApplicationStep();
    continueApplicationStep();

    expect(await findSubmitReviewButton()).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /basic profile/i }));
    expect(screen.getByLabelText("Current address")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Phnom Penh")).toBeInTheDocument();
  });

  it("restores only the saved draft step after re-entering the mini app without local personal data", () => {
    const draftJson = JSON.stringify({
      version: 1,
      ownerKey: "local",
      stage: "details",
      formStep: "contacts",
      amountInput: "200",
      term: 15,
      name: "Draft Applicant",
      residentialAddress: "Phnom Penh",
      phone: "+85512345678",
      employer: "Pilot Factory",
      emergencyContactOneName: "Saved Contact",
      emergencyContactOnePhone: "+85511111111",
      emergencyContactTwoName: "",
      emergencyContactTwoPhone: "",
      employerTenantId: "",
      bankName: "",
      bankAccountNumber: "",
      bankAccountHolder: "",
      identityDocumentType: "NATIONAL_ID",
      identityDocumentNumber: "",
      livenessPrepared: false,
      wealthProofAttached: false,
      consent: false,
    });
    const storage: Record<string, string> = {
      "payease.application-draft.v1": draftJson,
      "payease.language": "en",
    };
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage[key] ?? null,
        setItem: (key: string, value: string) => {
          storage[key] = String(value);
        },
        removeItem: (key: string) => {
          delete storage[key];
        },
        clear: () => {
          for (const key of Object.keys(storage)) delete storage[key];
        },
      },
    });

    render(<App />);
    openOrdersFromHome();

    expect(pickLabel("Emergency contact 1")).toBeVisible();
    expect(pickLabel("Emergency contact 1")).toHaveValue("");
    expect(pickLabel("Emergency contact 1 phone")).toHaveValue("");
    expect(screen.queryByDisplayValue("200")).toBeNull();
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
      .mockResolvedValueOnce(verifiedProfileResponse({ language: "en" }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ preferredLanguage: "en" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    openOrdersFromHome();
    openProfileLanguagePicker();
    fireEvent.change(pickLanguage(), {
      target: { value: "en" },
    });
    fireEvent.click(screen.getAllByRole("tab", { name: "Borrow" })[0]!);

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url]) => url === "/api/v1/local/public/profile/preferred-language",
        ),
      ).toBe(true),
    );
    openProfileLanguagePicker();
    expect(pickLanguage()).toHaveValue("en");
    expect(
      fetchMock.mock.calls.find(
        ([url]) => url === "/api/v1/local/public/profile/preferred-language",
      ),
    ).toEqual([
      "/api/v1/local/public/profile/preferred-language",
      {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ preferredLanguage: "en" }),
      },
    ]);
  });

  it("clears personal and support drafts after a successful applicant sign out", async () => {
    Object.defineProperty(window, "Telegram", {
      configurable: true,
      value: { WebApp: { initData: "fresh-init-data" } },
    });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/v1/local/public/telegram-sessions") {
        return Promise.resolve(new Response(null, { status: 201 }));
      }
      if (url === "/api/v1/local/public/applications" && !init?.method) {
        return Promise.resolve(
          new Response(JSON.stringify({ applications: [] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      if (url === "/api/v1/local/public/profile/view") {
        return Promise.resolve(verifiedProfileResponse({ language: "km" }));
      }
      if (url.startsWith("/api/v1/local/public/notifications?")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              page: 1,
              pageSize: 10,
              itemCount: 0,
              pageCount: 1,
              unreadCount: 0,
              items: [],
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          ),
        );
      }
      if (
        url === "/api/v1/local/public/application-draft" &&
        (!init?.method || init.method === "GET")
      ) {
        return Promise.resolve(emptyDraftResponse());
      }
      if (
        url === "/api/v1/local/public/application-draft" &&
        init?.method === "PUT"
      ) {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      if (
        url === "/api/v1/local/public/application-draft" &&
        init?.method === "DELETE"
      ) {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      if (url === "/api/v1/local/public/employer-tenants") {
        return Promise.resolve(
          new Response(JSON.stringify({ tenants: [] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      if (url === "/api/v1/local/public/telegram-sessions/logout") {
        return Promise.resolve(new Response(null, { status: 200 }));
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    openOrdersFromHome();

    await findRoleLiteral("button", "ចាកចេញ");
    await enterBorrowDetailsStepIfNeeded();
    fireEvent.change(pickLabel("អាសយដ្ឋានបច្ចុប្បន្ន"), {
      target: { value: "Phnom Penh" },
    });
    fireEvent.change(pickLabel("ឈ្មោះពេញ"), {
      target: { value: "Previous Applicant" },
    });
    fireEvent.change(pickLabel("លេខទូរស័ព្ទ"), {
      target: { value: "+85512345678" },
    });
    fireEvent.change(pickLabel("ក្រុមហ៊ុន"), {
      target: { value: "Pilot Factory" },
    });
    fireEvent.click(pickRoleLiteral("button", "ចាកចេញ"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(9));
    expect(fetchMock.mock.calls).toContainEqual([
      "/api/v1/local/public/application-draft",
      { method: "DELETE", credentials: "include" },
    ]);
    expect(fetchMock.mock.calls).toContainEqual([
      "/api/v1/local/public/telegram-sessions/logout",
      { method: "POST", credentials: "include" },
    ]);
    openOrdersFromHome();
    await enterBorrowDetailsStepIfNeeded();
    expect(pickLabel("អាសយដ្ឋានបច្ចុប្បន្ន")).toHaveValue("");
    expect(pickLabel("ឈ្មោះពេញ")).toHaveValue("");
    expect(pickLabel("លេខទូរស័ព្ទ")).toHaveValue("");
    expect(pickLabel("ក្រុមហ៊ុន")).toHaveValue("");
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
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            entrypoints: ["https://t.me/payease_recovery?startapp=apply"],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    openOrdersFromHome();

    expect(await findAlert()).toHaveTextContent("Telegram");
    expect(pickLink()).toHaveAttribute(
      "href",
      "https://t.me/payease_recovery?startapp=apply",
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("only displays validated Telegram recovery entry points", async () => {
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
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            entrypoints: [
              "https://t.me/payease_recovery?startapp=apply",
              "https://t.me.evil.example/payease_recovery",
              "https://t.me/payease_recovery#redirect",
              "javascript:alert('not-a-telegram-link')",
              "https://evil.example/payease_recovery",
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    openOrdersFromHome();

    await findAlert();
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute(
      "href",
      "https://t.me/payease_recovery?startapp=apply",
    );
  });

  it("does not show an unusable recovery link when the recovery directory is unavailable", async () => {
    Object.defineProperty(window, "Telegram", {
      configurable: true,
      value: { WebApp: { initData: "replayed-init-data" } },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: "TELEGRAM_RECOVERY_UNAVAILABLE" }),
          {
            status: 503,
            headers: { "content-type": "application/json" },
          },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    openOrdersFromHome();

    expect(await findAlert()).toHaveTextContent("Telegram");
    expect(screen.queryByRole("link")).toBeNull();
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
      .mockResolvedValueOnce(verifiedProfileResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ preferredLanguage: "zh-CN" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    openOrdersFromHome();
    await waitFor(() =>
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3),
    );

    now.mockReturnValue(startedAt + 4 * 60 * 1000 - 1);
    const callCountBeforeLanguageChange = fetchMock.mock.calls.length;
    fireEvent.change(pickLanguage(), {
      target: { value: "zh-CN" },
    });
    await waitFor(() =>
      expect(fetchMock.mock.calls.length).toBeGreaterThan(
        callCountBeforeLanguageChange,
      ),
    );

    fireEvent.keyDown(window, { key: "a" });
    expect(
      fetchMock.mock.calls.filter(
        ([url]) => url === "/api/v1/local/public/telegram-sessions/keepalive",
      ),
    ).toHaveLength(0);

    now.mockReturnValue(startedAt + 4 * 60 * 1000);
    fireEvent.keyDown(window, { key: "a" });

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url]) => url === "/api/v1/local/public/telegram-sessions/keepalive",
        ),
      ).toBe(true),
    );
    expect(fetchMock.mock.calls.at(-1)).toEqual([
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
      )
      .mockResolvedValueOnce(verifiedProfileResponse());
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    openOrdersFromHome();
    await waitFor(() =>
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3),
    );

    now.mockReturnValue(startedAt + 4 * 60 * 1000 - 1);
    const callsBeforeActivity = fetchMock.mock.calls.length;
    fireEvent.keyDown(window, { key: "a" });
    expect(fetchMock.mock.calls.length).toBe(callsBeforeActivity);
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
      .mockResolvedValueOnce(emptyDraftResponse())
      .mockResolvedValueOnce(
        verifiedProfileResponse({
          activeApplication: {
            referenceMasked: "APP-***-0001",
            status: "REPAYMENT_ACTIVE",
            nextAction: "VIEW_BILL",
          },
          activeBill: {
            referenceMasked: "APP-***-0001",
            status: "REPAYMENT_ACTIVE",
            dueDate: null,
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ unreadCount: 0, items: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
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
    openOrdersFromHome();

    expect(await screen.findByLabelText("Loan dashboard")).toBeVisible();
    await waitFor(() =>
      expect(window.location.search).toBe("?application=APP-RETURNING-001"),
    );
    expect(screen.getAllByText("APP-RETURNING-001")).toHaveLength(2);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(fetchMock.mock.calls.at(-1)).toEqual([
      "/api/v1/local/public/applications/APP-RETURNING-001",
      { credentials: "include" },
    ]);
  });

  it("updates the URL when an applicant opens an older application from history", async () => {
    Object.defineProperty(window, "Telegram", {
      configurable: true,
      value: { WebApp: { initData: "fresh-init-data" } },
    });
    const entry = (applicationNo: string, status: string) => ({
      applicationNo,
      status,
      requestedAmountMinor: "5000",
      currency: "USD",
      tenorDays: 30,
      approvedAmountMinor: null,
      rejectionConditionResolved: false,
      rejectionNoticeCode: null,
      supplementRequested: false,
    });
    const summary = (applicationNo: string, status: string) =>
      new Response(
        JSON.stringify({
          application: entry(applicationNo, status),
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
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            preferredLanguage: "en",
            applications: [
              {
                ...entry("APP-HISTORY-NEW", "BROKER_REVIEW"),
                createdAt: "2026-08-15T00:00:00.000Z",
              },
              {
                ...entry("APP-HISTORY-OLD", "CLOSED"),
                createdAt: "2026-08-14T00:00:00.000Z",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(emptyDraftResponse())
      .mockResolvedValueOnce(
        verifiedProfileResponse({
          activeApplication: {
            referenceMasked: "APP-***-NEW",
            status: "BROKER_REVIEW",
            nextAction: "VIEW_PROGRESS",
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ unreadCount: 0, items: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(summary("APP-HISTORY-NEW", "BROKER_REVIEW"))
      .mockResolvedValueOnce(summary("APP-HISTORY-OLD", "CLOSED"));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    openOrdersFromHome();

    fireEvent.click(await findRoleRe("button", /APP-HISTORY-OLD/i));

    await waitFor(() => {
      expect(screen.getAllByText("APP-HISTORY-OLD").length).toBeGreaterThan(1);
      expect(window.location.search).toBe("?application=APP-HISTORY-OLD");
    });
    expect(fetchMock.mock.calls.at(-1)).toEqual([
      "/api/v1/local/public/applications/APP-HISTORY-OLD",
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
    openProfileLanguagePicker();
    fireEvent.change(pickLanguage(), {
      target: { value: "en" },
    });
    fireEvent.click(await findRoleRe("button", /view application status/i));
    expect(await screen.findByLabelText("Loan dashboard")).toBeVisible();

    fireEvent.click(pickRoleLiteral("button", "Refresh status"));
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
    openOrdersFromHome();
    openProfileLanguagePicker();
    fireEvent.change(pickLanguage(), {
      target: { value: "en" },
    });
    fireEvent.click(screen.getAllByRole("tab", { name: "Borrow" })[0]!);
    await enterBorrowDetailsStepIfNeeded();
    fillEnglishApplicationToConfirm();
    toggleConsentCheckbox();
    fireEvent.click(await findSubmitReviewButton());
    fireEvent.click(await findRoleRe("button", /view application status/i));

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
    openOrdersFromHome();
    openProfileLanguagePicker();
    fireEvent.change(pickLanguage(), {
      target: { value: "en" },
    });
    fireEvent.click(screen.getAllByRole("tab", { name: "Borrow" })[0]!);
    await enterBorrowDetailsStepIfNeeded();
    fillEnglishApplicationToConfirm();
    toggleConsentCheckbox();
    fireEvent.click(await findSubmitReviewButton());

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

  it("shows a concrete reason when submission is blocked by Telegram phone mismatch", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/v1/local/public/applications" && !init?.method) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ preferredLanguage: "zh-CN", applications: [] }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        );
      }
      if (url === "/api/v1/local/public/profile/view") {
        return Promise.resolve(verifiedProfileResponse({ language: "zh-CN" }));
      }
      if (url.startsWith("/api/v1/local/public/notifications?")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              page: 1,
              pageSize: 10,
              itemCount: 0,
              pageCount: 1,
              unreadCount: 0,
              items: [],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        );
      }
      if (
        url === "/api/v1/local/public/application-draft" &&
        (!init?.method || init.method === "GET")
      ) {
        return Promise.resolve(emptyDraftResponse());
      }
      if (
        url === "/api/v1/local/public/application-draft" &&
        init?.method === "PUT"
      ) {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      if (url === "/api/v1/local/applications" && init?.method === "POST") {
        return Promise.resolve(
          new Response(JSON.stringify({ code: "TELEGRAM_PHONE_MISMATCH" }), {
            status: 422,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    openOrdersFromHome();
    openProfileLanguagePicker();
    fireEvent.change(pickLanguage(), {
      target: { value: "zh-CN" },
    });
    fireEvent.click(screen.getAllByRole("tab", { name: "借款" })[0]!);
    await enterBorrowDetailsStepIfNeeded();
    fireEvent.change(pickLabel("现居地址"), {
      target: { value: "金边" },
    });
    fireEvent.change(pickLabel("姓名"), {
      target: { value: "测试用户" },
    });
    fireEvent.change(pickLabel("手机号码"), {
      target: { value: "+85512345678" },
    });
    fireEvent.change(pickLabel("所在企业"), {
      target: { value: "测试工厂" },
    });
    fireEvent.click(pickRoleRe("button", /保存并继续/i));
    fireEvent.change(pickLabel("紧急联系人 1"), {
      target: { value: "联系人一" },
    });
    fireEvent.change(pickLabel("紧急联系人 1 手机号"), {
      target: { value: "+85511111111" },
    });
    fireEvent.change(pickLabel("紧急联系人 2"), {
      target: { value: "联系人二" },
    });
    fireEvent.change(pickLabel("紧急联系人 2 手机号"), {
      target: { value: "+85522222222" },
    });
    fireEvent.click(pickRoleRe("button", /保存并继续/i));
    fireEvent.change(pickLabel("收款银行"), {
      target: { value: "ABA" },
    });
    fireEvent.change(pickLabel("收款账号 / 卡号"), {
      target: { value: "000111222333" },
    });
    fireEvent.change(pickLabel("持卡人姓名"), {
      target: { value: "测试用户" },
    });
    fireEvent.click(pickRoleRe("button", /保存并继续/i));
    fireEvent.click(pickRoleRe("button", /保存并继续/i));
    toggleConsentCheckbox();
    fireEvent.click(await findSubmitReviewButton());

    expect(
      await screen.findByText(
        "你填写的手机号与 Telegram 已验证手机号不一致，请检查后重试。",
      ),
    ).toBeVisible();
    expect(screen.queryByText("申请暂时未能提交，请稍后重试。")).toBeNull();
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
    openProfileLanguagePicker();
    fireEvent.change(pickLanguage(), {
      target: { value: "en" },
    });
    fireEvent.click(await findRoleRe("button", /view application status/i));

    expect(await screen.findByLabelText("Loan dashboard")).toBeVisible();
    expect(pickRoleLiteral("heading", "Repayment in progress")).toBeVisible();
    expect(queryHeading("heading", "Offer result")).toBeNull();
    expect(screen.getByText("Principal").parentElement).toHaveTextContent(
      "$250.00",
    );
    expect(screen.getByText("Lender interest").parentElement).toHaveTextContent(
      "$5.00",
    );
    expect(screen.getByText("Total repayment").parentElement).toHaveTextContent(
      "$255.00",
    );
    expect(screen.getByText("Installments")).toBeVisible();
    expect(screen.getByText("2")).toBeVisible();
    expect(screen.getByText("First repayment date")).toBeVisible();
    expect(screen.getAllByText("2026-09-15").length).toBeGreaterThan(0);
    expect(screen.getByText("Loan term")).toBeVisible();
    expect(screen.getByText("30 days")).toBeVisible();
    expect(screen.getByText("Paid periods")).toBeVisible();
    expect(screen.getByText("Unpaid periods")).toBeVisible();
    expect(screen.getByText("Outstanding").parentElement).toHaveTextContent(
      "$127.50",
    );
    expect(screen.getByText("Total paid")).toBeVisible();
    expect(screen.getByText("Total paid").parentElement).toHaveTextContent(
      "$127.50",
    );
    expect(screen.getByText("Next payment")).toBeVisible();
    expect(screen.getAllByText(/#2.*2026-10-15/)).toHaveLength(2);
    expect(
      screen.getByLabelText("SMILE wallet authorization"),
    ).toHaveTextContent("PayEase will only create a one-time jump");
    expect(
      screen.getByRole("button", { name: "Open SMILE wallet" }),
    ).toBeVisible();
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
    openProfileLanguagePicker();
    fireEvent.change(pickLanguage(), {
      target: { value: "en" },
    });
    fireEvent.click(await findRoleRe("button", /view application status/i));

    expect(await screen.findByText("Application not approved")).toBeVisible();
    expect(pickLabel("Reapplication guidance")).toHaveTextContent(
      "Please complete employment or income verification before applying again.",
    );
    expect(screen.queryByText("SALARY_NOT_VERIFIED")).toBeNull();
  });

  it("submits a supplement response only for a returned application", async () => {
    window.history.replaceState(null, "", "/?application=APP-SUPPLEMENT-001");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            application: {
              applicationNo: "APP-SUPPLEMENT-001",
              status: "BROKER_REVIEW",
              requestedAmountMinor: "5000",
              currency: "USD",
              tenorDays: 30,
              approvedAmountMinor: null,
              rejectionConditionResolved: false,
              rejectionNoticeCode: null,
              supplementRequested: true,
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
        new Response(JSON.stringify({ responseNo: "SUP-20260815-ABCD1234" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    openProfileLanguagePicker();
    fireEvent.change(pickLanguage(), {
      target: { value: "en" },
    });
    fireEvent.click(await findRoleRe("button", /view application status/i));
    await screen.findByText("Additional information needed");
    fireEvent.change(pickLabel("Your response"), {
      target: { value: "I have corrected the requested information." },
    });
    fireEvent.click(pickRoleLiteral("button", "Send response"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]).toEqual([
      "/api/v1/local/public/applications/APP-SUPPLEMENT-001/supplement-responses",
      {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "I have corrected the requested information.",
        }),
      },
    ]);
    expect(
      await screen.findByText(
        "Your response SUP-20260815-ABCD1234 has been sent to the broker review team.",
      ),
    ).toBeVisible();
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
    openProfileLanguagePicker();
    fireEvent.change(pickLanguage(), {
      target: { value: "en" },
    });
    fireEvent.click(await findRoleRe("button", /view application status/i));
    expect(
      await findRoleLiteral("button", "Withdraw application"),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(pickRoleLiteral("button", "Withdraw application"));
    expect(pickRoleLiteral("button", "Confirm withdrawal")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(pickRoleLiteral("button", "Confirm withdrawal"));
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

    fireEvent.click(pickRoleLiteral("button", "Apply for credit"));
    expect(pickRoleRe("button", /^Start application/)).toBeVisible();
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
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            cases: [
              {
                caseNo: "CASE-20260815-ABCDEFGH",
                caseType: "COMPLAINT",
                status: "OPEN",
                createdAt: "2026-08-15T00:00:00.000Z",
                updatedAt: "2026-08-15T00:00:00.000Z",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    openProfileLanguagePicker();
    fireEvent.change(pickLanguage(), {
      target: { value: "en" },
    });
    fireEvent.click(await findRoleRe("button", /view application status/i));
    await findRoleLiteral("region", "Customer support and complaints");
    fireEvent.change(pickLabel("Request type"), {
      target: { value: "COMPLAINT" },
    });
    fireEvent.change(pickLabel("Tell us what happened"), {
      target: {
        value: "Please review the repayment information in my account.",
      },
    });
    fireEvent.click(pickRoleLiteral("button", "Submit support case"));

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
    expect(await screen.findByText(/Complaint · Received/)).toBeVisible();
    expect(fetchMock.mock.calls[2]).toEqual([
      "/api/v1/local/public/applications/APP-SUPPORT-001/service-cases",
      { credentials: "include" },
    ]);
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
    openProfileLanguagePicker();
    fireEvent.change(pickLanguage(), {
      target: { value: "en" },
    });
    fireEvent.click(await findRoleRe("button", /view application status/i));
    fireEvent.click(await findRoleLiteral("button", "Confirm terms"));

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
    openProfileLanguagePicker();
    fireEvent.change(pickLanguage(), {
      target: { value: "en" },
    });
    fireEvent.click(await findRoleRe("button", /view application status/i));
    fireEvent.click(await findRoleLiteral("button", "Confirm terms"));

    expect(
      await screen.findByText(
        "We could not record your confirmation. Please try again.",
      ),
    ).toBeVisible();
    expect(pickRoleLiteral("button", "Confirm terms")).toBeVisible();
    expect(
      screen.queryByText(
        "Your confirmation is recorded. The lender is completing its contract record.",
      ),
    ).toBeNull();
  });
});
