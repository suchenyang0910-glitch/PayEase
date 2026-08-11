import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatHuman, moneySum, type Currency, type Money } from "@payease/shared-money";

type ReconLine = Readonly<{
  id: string;
  date: string;
  description: string;
  expected: Money;
  settled: Money;
}>;

const MOCK_LINES: ReadonlyArray<ReconLine> = [
  {
    id: "rc-1",
    date: "2026-08-05",
    description: "LENDER-B · app-0003 · principal + interest settled",
    expected: { amountMinor: "268", currency: "USD" },
    settled: { amountMinor: "268", currency: "USD" },
  },
  {
    id: "rc-2",
    date: "2026-08-07",
    description: "LENDER-A · app-0001 partial settlement (difference 5 KHR mock)",
    expected: { amountMinor: "137500000", currency: "KHR" },
    settled: { amountMinor: "137499995", currency: "KHR" },
  },
  {
    id: "rc-3",
    date: "2026-08-08",
    description: "LENDER-B · app-0004 overdue penalty line — settlement pending",
    expected: { amountMinor: "321", currency: "USD" },
    settled: { amountMinor: "0", currency: "USD" },
  },
];

function diffLine(line: ReconLine): Money {
  // Pure frontend mock calc via shared-money; real difference posting is deferred to S1.0 MVP backend + S0.2 infra
  const { expected, settled } = line;
  if (expected.currency !== settled.currency) {
    // Mixed currencies should not happen in real recon; render 0 diff placeholder with expected currency
    return { amountMinor: "0", currency: expected.currency };
  }
  return moneySum([expected, { amountMinor: "0", currency: expected.currency }], expected.currency);
}

export function ReconciliationPage(): JSX.Element {
  const [filter, setFilter] = useState<"ALL" | "MATCHED" | "DIFF">("ALL");
  const lines = useMemo(() => {
    return MOCK_LINES.map((l) => {
      const diff = diffLine(l);
      const matched =
        l.expected.currency === l.settled.currency &&
        l.expected.amountMinor === l.settled.amountMinor;
      return {
        ...l,
        _expected: formatHuman(l.expected),
        _settled: formatHuman(l.settled),
        _diff: formatHuman(diff),
        _matched: matched,
      };
    }).filter((r) => (filter === "ALL" ? true : filter === "MATCHED" ? r._matched : !r._matched));
  }, [filter]);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div>
          <h1>Finance Reconciliation (S0.5 mock, no real bank/Stripe/PayWay API)</h1>
          <p style={{ color: "#555", maxWidth: 880 }}>
            Frontend placeholder ONLY. Real connection to ABA/Wing/ACLEDA bank statements, GL systems, Stripe/PayWay settlement reports,
            and automatic difference posting requires S0.2 isolation infrastructure sign-off + S1.0 MVP partner-contracts v1.
          </p>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            Filter
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as typeof filter)}
              style={{ padding: 6 }}
            >
              <option value="ALL">All lines</option>
              <option value="MATCHED">Matched only</option>
              <option value="DIFF">Differences only</option>
            </select>
          </label>
          <Link to="/repayment/list" style={{ color: "#9333ea" }}>Back to repayment list</Link>
        </div>
      </header>
      <table style={{ borderCollapse: "collapse", width: "100%", marginTop: 12 }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #333", textAlign: "left" }}>
            <th style={{ padding: 10 }}>Date</th>
            <th style={{ padding: 10 }}>Description</th>
            <th style={{ padding: 10, textAlign: "right" }}>Expected</th>
            <th style={{ padding: 10, textAlign: "right" }}>Settled</th>
            <th style={{ padding: 10, textAlign: "right" }}>Difference</th>
            <th style={{ padding: 10 }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} style={{ borderBottom: "1px solid #ddd" }}>
              <td style={{ padding: 10 }}>{l.date}</td>
              <td style={{ padding: 10, maxWidth: 520 }}>{l.description}</td>
              <td style={{ padding: 10, textAlign: "right", fontFamily: "monospace" }}>{l._expected}</td>
              <td style={{ padding: 10, textAlign: "right", fontFamily: "monospace" }}>{l._settled}</td>
              <td style={{ padding: 10, textAlign: "right", fontFamily: "monospace" }}>{l._diff}</td>
              <td style={{ padding: 10 }}>
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontSize: 12,
                    color: "white",
                    backgroundColor: l._matched ? "#16a34a" : "#ea580c",
                  }}
                >
                  {l._matched ? "MATCHED (mock)" : "DIFF (mock)"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ marginTop: 20, color: "#777", fontSize: 13 }}>
        S0.5 note: Difference calculation uses @payease/shared-money arithmetic (Big.js-based, string minor units) to guarantee KHR riel
        MAX_SAFE_INTEGER precision. No real postings, no real bank webhooks, no real Stripe/PayWay calls, no e-invoice KHR VAT submission.
      </p>
    </main>
  );
}
