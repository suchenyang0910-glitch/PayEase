import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { App } from "../App";
import {
  MOCK_EMPLOYMENT_ROWS,
  MOCK_EMPLOYMENT_DETAILS,
} from "../mocks/hr-mocks.static";
import { formatHuman } from "@payease/shared-money";

function LocationSpy({
  onRender,
}: {
  onRender: (pathname: string) => void;
}): null {
  const location = useLocation();
  onRender(location.pathname);
  return null;
}

function renderAt(initialEntries: string[]): { seen: Array<string> } {
  const seen: Array<string> = [];
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <LocationSpy onRender={(p) => seen.push(p)} />
      <App />
    </MemoryRouter>,
  );
  return { seen };
}

describe("HR portal routing: no dead links + SPA fallback to /login for unknown paths", () => {
  afterEach(() => cleanup());

  it("/login renders LoginPage without errors", () => {
    const { seen } = renderAt(["/login"]);
    expect(seen[seen.length - 1]).toBe("/login");
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /HR Verification Portal.*Login/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Sign in \(mock only\)/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/404|Not Found|Page not found/i)).toBeNull();
  });

  it("/employment/list renders list page with expected rows (no 404 text, no crash)", () => {
    renderAt(["/employment/list"]);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /Employment Verification.*List/i,
      }),
    ).toBeInTheDocument();
    for (const row of MOCK_EMPLOYMENT_ROWS) {
      const tds = screen.getAllByTestId(`amount-${row.id}`);
      expect(tds.length).toBeGreaterThanOrEqual(1);
    }
    expect(screen.queryByText(/404|Not Found|Page not found/i)).toBeNull();
  });

  it("/employment/:id renders detail page for first 2 mock IDs", () => {
    for (const detail of MOCK_EMPLOYMENT_DETAILS.slice(0, 2)) {
      cleanup();
      renderAt([`/employment/${detail.id}`]);
      expect(screen.getByTestId("employee-name")).toBeInTheDocument();
      expect(
        screen.getByTestId("monthly-salary-formatted"),
      ).toBeInTheDocument();
      expect(screen.getByTestId("loan-amount-formatted")).toBeInTheDocument();
      expect(screen.getByTestId("verification-status")).toBeInTheDocument();
      expect(screen.queryByText(/404|Not Found/i)).toBeNull();
    }
  });

  it("unknown path /* navigates via SPA redirect to /login (no 404 page)", () => {
    const { seen } = renderAt(["/does-not-exist-xyz"]);
    expect(seen).toContain("/login");
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /HR Verification Portal.*Login/,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/404|Not Found/i)).toBeNull();
  });
});

describe("HR portal amount rendering: amountMinor strings never become NaN/undefined on screen", () => {
  afterEach(() => cleanup());

  it("EmploymentListPage renders every amount cell with formatHuman output (no NaN / no undefined)", () => {
    renderAt(["/employment/list"]);
    for (const row of MOCK_EMPLOYMENT_ROWS) {
      const cells = screen.getAllByTestId(`amount-${row.id}`);
      for (const cell of cells) {
        const txt = cell.textContent ?? "";
        expect(txt).not.toMatch(/NaN|undefined|null/i);
        expect(txt.length).toBeGreaterThan(0);
      }
    }
  });

  it("EmploymentListPage amount cell underlying data is typeof string + regex /^\\d+$/", () => {
    for (const row of MOCK_EMPLOYMENT_ROWS) {
      expect(typeof row.requestedAmountMinor).toBe("string");
      expect(/^\d+$/.test(row.requestedAmountMinor)).toBe(true);
    }
  });

  it("EmploymentDetailPage monthly-salary-formatted and loan-amount-formatted match formatHuman(mockData)", () => {
    const detail = MOCK_EMPLOYMENT_DETAILS[0];
    expect(detail).toBeDefined();
    if (!detail)
      throw new Error("S0.5 HR mocks must provide an employment detail");
    renderAt([`/employment/${detail.id}`]);
    const salaryNode = screen.getByTestId("monthly-salary-formatted");
    const loanNode = screen.getByTestId("loan-amount-formatted");
    const expectedSalary = formatHuman({
      amountMinor: detail.monthlyBaseSalaryAmountMinor,
      currency: detail.monthlyBaseSalaryCurrency,
    });
    const expectedLoan = formatHuman({
      amountMinor: detail.requestedLoanAmountMinor,
      currency: detail.requestedLoanCurrency,
    });
    expect((salaryNode.textContent ?? "").trim()).toBe(expectedSalary);
    expect((loanNode.textContent ?? "").trim()).toBe(expectedLoan);
  });

  it("detail page never shows NaN/undefined in formatted amounts", () => {
    for (const detail of MOCK_EMPLOYMENT_DETAILS.slice(0, 3)) {
      cleanup();
      renderAt([`/employment/${detail.id}`]);
      const main = screen.getByRole("main") ?? document.body;
      const allText = main.textContent ?? "";
      expect(allText).not.toMatch(/NaN|undefined/);
    }
  });
});
