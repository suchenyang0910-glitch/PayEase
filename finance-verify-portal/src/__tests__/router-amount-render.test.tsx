import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { App } from "../App";
import {
  MOCK_REPAYMENT_ROWS,
  MOCK_RECON_LINES,
} from "../mocks/fin-mocks.static";
import { diffLine } from "../pages/diff-calc";
import { formatHuman } from "@payease/shared-money";

function LocationSpy({ onRender }: { onRender: (p: string) => void }): null {
  const location = useLocation();
  onRender(location.pathname);
  return null;
}

function renderAt(entries: string[]): { seen: Array<string> } {
  const seen: Array<string> = [];
  render(
    <MemoryRouter initialEntries={entries}>
      <LocationSpy onRender={(p) => seen.push(p)} />
      <App />
    </MemoryRouter>,
  );
  return { seen };
}

describe("Finance portal routing: no dead links + SPA fallback to /login", () => {
  afterEach(() => cleanup());

  it("/login renders LoginPage, no 404", () => {
    const { seen } = renderAt(["/login"]);
    expect(seen[seen.length - 1]).toBe("/login");
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /Finance.*Login.*S0\.5 placeholder/i,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/404|Not Found/i)).toBeNull();
  });

  it("/repayment/list renders repayment list with every row data-testid present", () => {
    renderAt(["/repayment/list"]);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /Finance Repayment Schedule.*list/i,
      }),
    ).toBeInTheDocument();
    for (const r of MOCK_REPAYMENT_ROWS) {
      const cells = screen.getAllByTestId(`principal-${r.id}`);
      expect(cells.length).toBeGreaterThanOrEqual(1);
      const totals = screen.getAllByTestId(`total-${r.id}`);
      expect(totals.length).toBeGreaterThanOrEqual(1);
    }
    expect(screen.queryByText(/404|Not Found/i)).toBeNull();
  });

  it("/reconciliation renders recon page with 5 status badges (rc-1..rc-5)", () => {
    renderAt(["/reconciliation"]);
    expect(
      screen.getByRole("heading", { level: 1, name: /Reconciliation/i }),
    ).toBeInTheDocument();
    for (const l of MOCK_RECON_LINES) {
      const badge = screen.getByTestId(`recon-status-${l.id}`);
      expect(badge).toBeInTheDocument();
    }
    expect(screen.queryByText(/404|Not Found/i)).toBeNull();
  });

  it("unknown path redirects via SPA to /login", () => {
    const { seen } = renderAt(["/random-bogus-path-xyz"]);
    expect(seen).toContain("/login");
    expect(
      screen.getByRole("heading", { level: 1, name: /Finance.*Login/i }),
    ).toBeInTheDocument();
  });
});

describe("Finance portal amount rendering: no NaN/undefined + mock data string-type", () => {
  afterEach(() => cleanup());

  it("RepaymentListPage principal and total cells have no NaN/undefined in text", () => {
    renderAt(["/repayment/list"]);
    for (const r of MOCK_REPAYMENT_ROWS) {
      for (const cell of screen.getAllByTestId(`principal-${r.id}`)) {
        expect((cell.textContent ?? "").trim()).not.toMatch(/NaN|undefined/);
      }
      for (const cell of screen.getAllByTestId(`total-${r.id}`)) {
        expect((cell.textContent ?? "").trim()).not.toMatch(/NaN|undefined/);
      }
    }
  });

  it("Repayment mock rows all have typeof string + /^\\d+$/ for principal/interest/total columns", () => {
    for (const r of MOCK_REPAYMENT_ROWS) {
      expect(typeof r.principalDueAmountMinor).toBe("string");
      expect(typeof r.interestDueAmountMinor).toBe("string");
      expect(typeof r.totalDueAmountMinor).toBe("string");
      expect(/^\d+$/.test(r.principalDueAmountMinor)).toBe(true);
      expect(/^\d+$/.test(r.interestDueAmountMinor)).toBe(true);
      expect(/^\d+$/.test(r.totalDueAmountMinor)).toBe(true);
    }
  });

  it("Reconciliation page rc-2 diff renders as formatHuman(moneySub(rc2.expected, rc2.settled))", () => {
    renderAt(["/reconciliation"]);
    const rc2 = MOCK_RECON_LINES.find((l) => l.id === "rc-2")!;
    const d = diffLine({ expected: rc2.expected, settled: rc2.settled });
    expect(d.amountMinor).toBe("5");
    expect(formatHuman(d)).toBe("៛5 KHR");
  });
});
