import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  App,
  type DemoLanguage,
  DEMO_LANGUAGE_LABELS,
  FINANCE_DEMO_COPY,
} from "../pages/DemoApp";

const SYNTHETIC_PROHIBITED_PATTERNS: readonly RegExp[] = [
  /(borrower.?name|customer.?identity|payment.?channel|bank.?account|bank.?name)\s*[:==>"']/i,
  /(swift|iban)\s*[:=]\s*[A-Z0-9]{4,}/i,
  /bank\s*(account|no\.?|number)\s*[:=]\s*\d{6,}/i,
  /(visa|mastercard|amex|unionpay|aba|wing|acleda|payway|stripe)\s*(channel|gateway|processor)/i,
] as const;

const FORBIDDEN_NETWORK_TOKENS: readonly string[] = [
  "fetch(",
  "axios",
  "WebSocket(",
  "XMLHttpRequest",
  "navigator.sendBeacon",
  ".ababank.com",
  "wingmoney.com",
  "acledabank.com.kh",
  "stripe.com",
  "payway.com.kh",
  "sap.",
  "oracle.com",
  "quickbooks",
  "xero",
] as const;

const FORBIDDEN_BUNDLE_MARKERS: readonly string[] = [
  "/api",
  "nationalIdLast4",
  "monthlyBaseSalary",
  "borrowerName",
] as const;

const FORBIDDEN_STORAGE_KEYS: readonly string[] = [
  "token",
  "credential",
  "password",
  "secret",
  "id_token",
  "access_token",
  "refresh_token",
  "jwt",
  "nonce",
  "initData",
] as const;

const LANGS: readonly DemoLanguage[] = ["zh-CN", "en", "km"] as const;

function renderDemo(initial = "/") {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <App />
    </MemoryRouter>,
  );
}

function enterDemoFromLogin() {
  fireEvent.click(
    screen.getByRole("button", {
      name: /Enter demo|进入演示|ចូលការបង្ហាញ/i,
    }),
  );
}

async function selectLanguage(next: DemoLanguage) {
  const label = DEMO_LANGUAGE_LABELS[next];
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: label }));
  });
}

describe("Finance DemoApp routing gate (S0.5 demo-only; no real bank/stripe/payway)", () => {
  afterEach(() => cleanup());

  it("routes root to /login and renders FINANCE_DEMO_COPY title/enter button for every language", async () => {
    for (const lang of LANGS) {
      cleanup();
      renderDemo("/");
      await selectLanguage(lang);
      const copy = FINANCE_DEMO_COPY[lang];
      await waitFor(() =>
        expect(
          screen.getByRole("heading", { name: copy.title }),
        ).toBeInTheDocument(),
      );
      expect(
        screen.getByRole("button", { name: copy.enterButton }),
      ).toBeInTheDocument();
    }
  });

  it("/login renders FINANCE_DEMO_COPY trilingualLabel + syntheticOnly for every language", async () => {
    for (const lang of LANGS) {
      cleanup();
      renderDemo("/login");
      await selectLanguage(lang);
      const copy = FINANCE_DEMO_COPY[lang];
      await waitFor(() => {
        expect(screen.getByText(copy.trilingualLabel)).toBeInTheDocument();
        expect(screen.getByText(copy.syntheticOnly)).toBeInTheDocument();
      });
    }
  });
});

describe("Finance DemoApp repayment list: no borrower/channel/bank info", () => {
  afterEach(() => cleanup());

  it("uses FINANCE_DEMO_COPY headers only; no borrower/channel/bank columns; renders DEMO-LEDGER references", async () => {
    renderDemo("/repayment/list");
    await selectLanguage("en");
    const copy = FINANCE_DEMO_COPY.en;
    const headers = screen.getAllByRole("columnheader");
    const names = headers.map((h) => h.textContent!.trim());
    expect(names).toEqual(
      expect.arrayContaining([
        copy.ledgerReference,
        copy.dueDate,
        copy.currency,
        copy.totalDue,
        copy.status,
      ]),
    );
    expect(names).not.toEqual(
      expect.arrayContaining([
        "Borrower",
        "Channel",
        "Bank",
        "Payment channel",
        "Bank account",
      ]),
    );
    expect(screen.getByText("DEMO-LEDGER-001")).toBeInTheDocument();
  });

  it("never contains synthetic prohibited patterns (no real PII/channel/bank samples used)", () => {
    renderDemo("/repayment/list");
    const text = document.body.textContent ?? "";
    for (const re of SYNTHETIC_PROHIBITED_PATTERNS) {
      expect(text).not.toMatch(re);
    }
    expect(text).toContain("SCHEDULED");
  });
});

describe("Finance DemoApp reconciliation: only reference/expected/observed/result", () => {
  afterEach(() => cleanup());

  it("uses FINANCE_DEMO_COPY headers only; renders DEMO-RECON references; no borrower/channel/bank columns", async () => {
    for (const lang of LANGS) {
      cleanup();
      renderDemo("/reconciliation");
      await selectLanguage(lang);
      const copy = FINANCE_DEMO_COPY[lang];
      await waitFor(() =>
        expect(
          screen.getByRole("heading", { name: copy.reconHeading }),
        ).toBeInTheDocument(),
      );
      const headers = screen.getAllByRole("columnheader");
      const names = headers.map((h) => h.textContent!.trim());
      expect(names).toEqual(
        expect.arrayContaining([
          copy.reconReference,
          copy.reconExpected,
          copy.reconObserved,
          copy.reconResult,
        ]),
      );
      expect(screen.getByText("DEMO-RECON-001")).toBeInTheDocument();
      expect(screen.getByText("MATCHED")).toBeInTheDocument();
      expect(screen.getByText("DIFFERENCE")).toBeInTheDocument();
    }
  });
});

describe("Finance DemoApp source + bundle forbidden tokens (scope aligned to build-demo-portals.cmd Step 4)", () => {
  it("DemoApp entry only: no network/bank/HRIS tokens and no bundle markers in source", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const rel = "finance-verify-portal/src/pages/DemoApp.tsx";
    const full = path.resolve(__dirname, "../../..", rel);
    const txt = fs.readFileSync(full, "utf8");
    for (const token of FORBIDDEN_NETWORK_TOKENS) {
      expect(txt).not.toContain(token);
    }
    for (const marker of FORBIDDEN_BUNDLE_MARKERS) {
      expect(txt).not.toContain(marker);
    }
  });
});

describe("Finance DemoApp WEB-08 storage guard: never persists credential keys", () => {
  afterEach(() => cleanup());

  it("clicking enter demo + switching languages only writes payease-demo-language; no forbidden token key", async () => {
    const setLocal = vi.spyOn(localStorage, "setItem");
    const setSession = vi.spyOn(sessionStorage, "setItem");
    renderDemo("/login");
    enterDemoFromLogin();
    await selectLanguage("zh-CN");
    await selectLanguage("km");
    const all = [...setLocal.mock.calls, ...setSession.mock.calls];
    for (const call of all) {
      const key = String(call[0]).toLowerCase();
      for (const forbid of FORBIDDEN_STORAGE_KEYS) {
        expect(key).not.toContain(forbid.toLowerCase());
      }
      expect(key).toContain("payease-demo-language");
    }
    setLocal.mockRestore();
    setSession.mockRestore();
  });
});
