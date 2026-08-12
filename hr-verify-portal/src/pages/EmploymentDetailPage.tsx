import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { formatHuman } from "@payease/shared-money";
import { MOCK_EMPLOYMENT_DETAILS } from "../mocks/hr-mocks.static";
import type {
  EmploymentDetailMock,
  HrVerificationStatus,
} from "../mocks/hr-mocks.static";

export function EmploymentDetailPage(): JSX.Element {
  const { id = "" } = useParams();
  const detail = useMemo<EmploymentDetailMock | undefined>(
    () => MOCK_EMPLOYMENT_DETAILS.find((d) => d.id === id),
    [id],
  );
  const [localStatus, setLocalStatus] = useState<HrVerificationStatus | null>(
    null,
  );

  if (!detail) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
        <h1>Employment verification not found (S0.5 mock)</h1>
        <Link to="/employment/list" style={{ color: "#2563eb" }}>
          Back to list
        </Link>
      </main>
    );
  }

  const status = (localStatus ??
    detail.verificationStatus) as HrVerificationStatus;

  const approve = () => {
    setLocalStatus("APPROVED_HR");
  };
  const reject = () => {
    setLocalStatus("REJECTED_HR");
  };

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
        }}
      >
        <h1>
          HR Employment Verification Detail — (S0.5 mock, no real POST API)
        </h1>
        <Link to="/employment/list" style={{ color: "#2563eb" }}>
          Back to list
        </Link>
      </header>
      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "220px 1fr",
          rowGap: 6,
          maxWidth: 880,
        }}
      >
        <dt>Verification ID</dt>
        <dd style={{ fontFamily: "monospace" }}>{detail.id}</dd>
        <dt>Employee ID</dt>
        <dd>{detail.employeeId}</dd>
        <dt>Employee name</dt>
        <dd data-testid="employee-name">{detail.employeeName}</dd>
        <dt>National ID (last 4)</dt>
        <dd style={{ fontFamily: "monospace" }}>{detail.nationalIdLast4}</dd>
        <dt>Department</dt>
        <dd>{detail.department}</dd>
        <dt>Hired at</dt>
        <dd>{detail.hiredAt}</dd>
        <dt>Employer tax ID</dt>
        <dd style={{ fontFamily: "monospace" }}>{detail.employerTaxId}</dd>
        <dt>Monthly base salary</dt>
        <dd
          data-testid="monthly-salary-formatted"
          style={{ textAlign: "right", fontFamily: "monospace" }}
        >
          {formatHuman({
            amountMinor: detail.monthlyBaseSalaryAmountMinor,
            currency: detail.monthlyBaseSalaryCurrency,
          })}
        </dd>
        <dt>Requested loan amount</dt>
        <dd
          data-testid="loan-amount-formatted"
          style={{ textAlign: "right", fontFamily: "monospace" }}
        >
          {formatHuman({
            amountMinor: detail.requestedLoanAmountMinor,
            currency: detail.requestedLoanCurrency,
          })}
        </dd>
        <dt>Tenor</dt>
        <dd>{detail.tenorDays} calendar days</dd>
        <dt>Requested at</dt>
        <dd>{detail.requestedAt}</dd>
        <dt>HR verification status</dt>
        <dd data-testid="verification-status">
          <strong>{status}</strong>
        </dd>
        <dt>Notes</dt>
        <dd style={{ color: "#555" }}>{detail.notes}</dd>
      </dl>
      <section style={{ marginTop: 24, display: "flex", gap: 12 }}>
        <button
          data-testid="approve-btn"
          onClick={approve}
          disabled={status !== "PENDING_HR" && status !== "UNDER_REVIEW"}
          style={{
            padding: "10px 18px",
            backgroundColor:
              status === "PENDING_HR" || status === "UNDER_REVIEW"
                ? "#16a34a"
                : "#ccc",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor:
              status === "PENDING_HR" || status === "UNDER_REVIEW"
                ? "pointer"
                : "not-allowed",
          }}
        >
          Mark as HR Verified (frontend mock only)
        </button>
        <button
          data-testid="reject-btn"
          onClick={reject}
          disabled={status !== "PENDING_HR" && status !== "UNDER_REVIEW"}
          style={{
            padding: "10px 18px",
            backgroundColor:
              status === "PENDING_HR" || status === "UNDER_REVIEW"
                ? "#dc2626"
                : "#ccc",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor:
              status === "PENDING_HR" || status === "UNDER_REVIEW"
                ? "pointer"
                : "not-allowed",
          }}
        >
          Reject (frontend mock only)
        </button>
      </section>
      <p style={{ marginTop: 20, color: "#777", fontSize: 13 }}>
        S0.5 note: Approve/Reject actions stored ONLY in React component state.
        No API calls. No persistence. No cross-domain events.
      </p>
    </main>
  );
}
