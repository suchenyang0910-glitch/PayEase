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
  HR_DEMO_COPY,
} from "../pages/DemoApp";

const SYNTHETIC_PROHIBITED_PATTERNS: readonly RegExp[] = [
  /employee.?name/i,
  /national.?id/i,
  /passport.?no?\.?/i,
  /phone.?number/i,
  /monthly.?base.?salary/i,
  /employer.?tax.?id/i,
  /mopf.?tax.?id/i,
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

describe("HR DemoApp routing gate (S0.5 demo-only; no real IdP)", () => {
  afterEach(() => cleanup());

  it("routes root to /login and renders HR_DEMO_COPY title + enter button for every language", async () => {
    for (const lang of LANGS) {
      cleanup();
      renderDemo("/");
      await selectLanguage(lang);
      const copy = HR_DEMO_COPY[lang];
      await waitFor(() =>
        expect(
          screen.getByRole("heading", { name: copy.title }),
        ).toBeInTheDocument(),
      );
      expect(
        screen.getByRole("button", { name: copy.signIn }),
      ).toBeInTheDocument();
    }
  });

  it("/login renders HR_DEMO_COPY subtitle for every language", async () => {
    for (const lang of LANGS) {
      cleanup();
      renderDemo("/login");
      await selectLanguage(lang);
      const copy = HR_DEMO_COPY[lang];
      await waitFor(() =>
        expect(screen.getByText(copy.subtitle)).toBeInTheDocument(),
      );
    }
  });
});

describe("HR DemoApp list privacy: only verification reference + requested at + outcome", () => {
  afterEach(() => cleanup());

  it("renders HR_DEMO_COPY table headers only — no PII column names", async () => {
    renderDemo("/employment/list");
    await selectLanguage("en");
    const copy = HR_DEMO_COPY.en;
    const headers = screen.getAllByRole("columnheader");
    const names = headers.map((h) => h.textContent!.trim());
    expect(names).toEqual(
      expect.arrayContaining([
        copy.verificationReference,
        copy.requestedAt,
        copy.outcome,
      ]),
    );
    expect(names).not.toEqual(
      expect.arrayContaining([
        "Employee",
        "National ID",
        "Phone",
        "Salary",
        "Tax ID",
      ]),
    );
  });

  it("never contains prohibited synthetic PII token patterns (no real PII samples used)", () => {
    renderDemo("/employment/list");
    const fullText = document.body.textContent ?? "";
    for (const re of SYNTHETIC_PROHIBITED_PATTERNS) {
      expect(fullText).not.toMatch(re);
    }
    expect(fullText).toContain("DEMO-EMP-001");
  });
});

describe("HR DemoApp detail privacy: only reference + outcome", () => {
  afterEach(() => cleanup());

  it("renders HR_DEMO_COPY detail strings for every language; no PII labels appear", async () => {
    for (const lang of LANGS) {
      cleanup();
      renderDemo("/employment/DEMO-EMP-001");
      await selectLanguage(lang);
      const copy = HR_DEMO_COPY[lang];
      await waitFor(() =>
        expect(
          screen.getByRole("heading", { name: copy.detail }),
        ).toBeInTheDocument(),
      );
      expect(screen.getByText(copy.employerOnly)).toBeInTheDocument();
      expect(screen.getByText("DEMO-EMP-001")).toBeInTheDocument();
      expect(screen.getByText(copy.matchPending)).toBeInTheDocument();
      const text = document.body.textContent ?? "";
      for (const re of SYNTHETIC_PROHIBITED_PATTERNS) {
        expect(text).not.toMatch(re);
      }
    }
  });
});

describe("HR DemoApp controlled in-session outcome", () => {
  afterEach(() => cleanup());

  it("shows the local matched result after an operator action without a network request", async () => {
    renderDemo("/employment/DEMO-EMP-001");
    await selectLanguage("en");
    fireEvent.click(
      screen.getByRole("button", { name: HR_DEMO_COPY.en.verify }),
    );
    await waitFor(() =>
      expect(
        screen.getByText(HR_DEMO_COPY.en.matchConfirmed),
      ).toBeInTheDocument(),
    );
  });
});

describe("HR DemoApp source + bundle forbidden tokens (scope aligned to build-demo-portals.cmd Step 4)", () => {
  it("DemoApp entry only: no network/bank/HRIS tokens and no bundle markers in source", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const rel = "hr-verify-portal/src/pages/DemoApp.tsx";
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

describe("HR DemoApp WEB-08 storage guard: never persists credential keys", () => {
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
