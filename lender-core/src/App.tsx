import { useState } from "react";
import {
  createDraftApplication,
  markFundsEvent,
  recordApproval,
  recordDualControl,
  transitionApplication,
  type LoanApplication,
} from "@payease/v1-domain";
import { formatHuman } from "@payease/shared-money";

const initial = (): LoanApplication => {
  let item = createDraftApplication({
    id: "APP-20260812-0001",
    applicantUserId: "telegram-1001",
    preferredLanguage: "km",
    requestedAmount: { amountMinor: "25000", currency: "USD" },
    tenorDays: 30,
  });
  item = transitionApplication(
    item,
    "SUBMITTED",
    "telegram-1001",
    "2026-08-12T08:00:00.000Z",
  );
  item = transitionApplication(
    item,
    "BROKER_REVIEW",
    "broker-01",
    "2026-08-12T08:05:00.000Z",
  );
  item = recordApproval(item, {
    stage: "BROKER_REVIEW",
    decision: "APPROVED",
    actorUserId: "broker-01",
    actorRole: "BROKER_REVIEWER",
    reasonCode: "DOCUMENTS_COMPLETE",
    occurredAt: "2026-08-12T08:10:00.000Z",
  });
  item = recordApproval(item, {
    stage: "EMPLOYER_VERIFICATION",
    decision: "APPROVED",
    actorUserId: "hr-01",
    actorRole: "EMPLOYER_HR",
    reasonCode: "EMPLOYMENT_CONFIRMED",
    occurredAt: "2026-08-12T08:20:00.000Z",
  });
  return item;
};

const readyForDisbursement = (): LoanApplication => {
  let item = initial();
  item = recordApproval(item, {
    stage: "LENDER_INITIAL_REVIEW",
    decision: "APPROVED",
    actorUserId: "lender-reviewer-01",
    actorRole: "LENDER_INITIAL_REVIEWER",
    reasonCode: "MANUAL_REVIEW_APPROVED",
    occurredAt: "2026-08-12T08:30:00.000Z",
  });
  item = recordApproval(item, {
    stage: "LENDER_FINAL_REVIEW",
    decision: "APPROVED",
    actorUserId: "lender-reviewer-02",
    actorRole: "LENDER_FINAL_REVIEWER",
    reasonCode: "FINAL_APPROVAL",
    occurredAt: "2026-08-12T08:35:00.000Z",
  });
  item = transitionApplication(
    item,
    "CONTRACT_CONFIRMED",
    "telegram-1001",
    "2026-08-12T08:40:00.000Z",
  );
  return transitionApplication(
    item,
    "DISBURSEMENT_PENDING",
    "lender-reviewer-02",
    "2026-08-12T08:45:00.000Z",
  );
};

const messages = {
  en: {
    title: "Lender approval console",
    approve: "Approve initial review",
    reject: "Reject",
    notice:
      "Local controlled-pilot simulation — no lender API, payment API or customer data.",
  },
  "zh-CN": {
    title: "持牌机构审批后台",
    approve: "同意初审",
    reject: "拒绝",
    notice: "本地受控试点模拟，不接入机构、支付或真实客户数据。",
  },
  km: {
    title: "ផ្ទាំងអនុម័តស្ថាប័នផ្តល់កម្ចី",
    approve: "យល់ព្រមការពិនិត្យដំបូង",
    reject: "បដិសេធ",
    notice: "ការសាកល្បងក្នុងមូលដ្ឋាន មិនភ្ជាប់ API ពិត ឬទិន្នន័យអតិថិជនពិត។",
  },
} as const;

export function App(): JSX.Element {
  const [language, setLanguage] = useState<keyof typeof messages>("en");
  const [application, setApplication] = useState<LoanApplication>(initial);
  const text = messages[language];
  const decide = (decision: "APPROVED" | "REJECTED") => {
    setApplication((current) =>
      recordApproval(current, {
        stage: "LENDER_INITIAL_REVIEW",
        decision,
        actorUserId: "lender-reviewer-01",
        actorRole: "LENDER_INITIAL_REVIEWER",
        reasonCode:
          decision === "APPROVED"
            ? "MANUAL_REVIEW_APPROVED"
            : "MANUAL_REVIEW_REJECTED",
        occurredAt: new Date().toISOString(),
      }),
    );
  };
  const pending = application.status === "LENDER_INITIAL_REVIEW";
  const fundsPending = application.status === "DISBURSEMENT_PENDING";
  const fundsReleased = application.status === "DISBURSED";
  const prepareFunds = () => setApplication(readyForDisbursement());
  const dualApproveFunds = () =>
    setApplication((current) =>
      recordDualControl(
        current,
        "DISBURSEMENT_RELEASE",
        {
          stage: "DISBURSEMENT_RELEASE",
          decision: "APPROVED",
          actorUserId: "finance-maker-01",
          actorRole: "LENDER_FINANCE_MAKER",
          reasonCode: "DISBURSEMENT_INSTRUCTION_CHECKED",
          occurredAt: new Date().toISOString(),
        },
        {
          stage: "DISBURSEMENT_CONFIRMATION",
          decision: "APPROVED",
          actorUserId: "finance-checker-01",
          actorRole: "LENDER_FINANCE_CHECKER",
          reasonCode: "DISBURSEMENT_DUAL_CONTROL_APPROVED",
          occurredAt: new Date().toISOString(),
        },
      ),
    );
  const attachProof = () =>
    setApplication((current) =>
      markFundsEvent(
        current,
        "DISBURSEMENT_RECORDED",
        "finance-checker-01",
        new Date().toISOString(),
        "manual-receipt:DEMO-ONLY",
      ),
    );
  return (
    <main
      style={{
        maxWidth: 980,
        margin: "0 auto",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <header
        style={{ display: "flex", justifyContent: "space-between", gap: 16 }}
      >
        <div>
          <h1>{text.title}</h1>
          <p>{text.notice}</p>
        </div>
        <label>
          Language{" "}
          <select
            value={language}
            onChange={(e) =>
              setLanguage(e.target.value as keyof typeof messages)
            }
          >
            <option value="en">English</option>
            <option value="zh-CN">中文</option>
            <option value="km">ខ្មែរ</option>
          </select>
        </label>
      </header>
      <section
        style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 20 }}
      >
        <h2>Application {application.id}</h2>
        <dl
          style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 8 }}
        >
          <dt>Current status</dt>
          <dd data-testid="application-status">
            <strong>{application.status}</strong>
          </dd>
          <dt>Requested amount</dt>
          <dd>{formatHuman(application.requestedAmount)}</dd>
          <dt>Tenor</dt>
          <dd>{application.tenorDays} days</dd>
          <dt>Applicant channel</dt>
          <dd>Telegram (synthetic test record)</dd>
        </dl>
        <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
          <button
            data-testid="approve-initial"
            disabled={!pending}
            onClick={() => decide("APPROVED")}
          >
            {text.approve}
          </button>
          <button
            data-testid="reject-initial"
            disabled={!pending}
            onClick={() => decide("REJECTED")}
          >
            {text.reject}
          </button>
        </div>
      </section>
      <section
        style={{
          border: "1px solid #cbd5e1",
          borderRadius: 8,
          padding: 20,
          marginTop: 24,
        }}
      >
        <h2>Manual disbursement (dual control)</h2>
        <p>
          Maker and checker must be two distinct lender accounts. Receipt
          reference is mandatory before daily reconciliation.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button onClick={prepareFunds}>Load approved synthetic case</button>
          <button
            data-testid="funds-dual-approve"
            disabled={!fundsPending}
            onClick={dualApproveFunds}
          >
            Record maker + checker approval
          </button>
          <button
            data-testid="funds-proof"
            disabled={!fundsReleased}
            onClick={attachProof}
          >
            Record disbursement receipt
          </button>
        </div>
        <p data-testid="funds-status">
          {application.status === "DISBURSEMENT_PENDING"
            ? "Waiting for two approvals"
            : application.status === "DISBURSED"
              ? "Funds released — receipt pending or recorded"
              : "Load an approved synthetic case to start"}
        </p>
      </section>
      <section style={{ marginTop: 24 }}>
        <h2>Immutable local audit timeline</h2>
        <ol>
          {application.auditEvents.map((event, index) => (
            <li key={`${event.occurredAt}-${index}`}>
              {event.occurredAt} — {event.eventType} — {event.actorUserId}{" "}
              {event.reasonCode ? `(${event.reasonCode})` : ""}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
