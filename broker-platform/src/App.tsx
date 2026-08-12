import { useState } from "react";
import {
  createDraftApplication,
  recordApproval,
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
  return transitionApplication(
    item,
    "BROKER_REVIEW",
    "broker-01",
    "2026-08-12T08:01:00.000Z",
  );
};
const text = {
  en: {
    title: "Broker operations",
    approve: "Documents complete",
    return: "Return for documents",
    note: "Local controlled-pilot simulation only.",
  },
  "zh-CN": {
    title: "助贷运营后台",
    approve: "资料齐全，转企业核验",
    return: "退回补件",
    note: "仅本地受控试点模拟。",
  },
  km: {
    title: "ផ្ទាំងប្រតិបត្តិការឈ្មួញកណ្ដាល",
    approve: "ឯកសារគ្រប់គ្រាន់",
    return: "ត្រឡប់សម្រាប់ឯកសារ",
    note: "ការសាកល្បងក្នុងមូលដ្ឋានតែប៉ុណ្ណោះ។",
  },
} as const;

export function App(): JSX.Element {
  const [language, setLanguage] = useState<keyof typeof text>("zh-CN");
  const [application, setApplication] = useState<LoanApplication>(initial);
  const [notice, setNotice] = useState("");
  const copy = text[language];
  const approve = () => {
    setApplication((current) =>
      recordApproval(current, {
        stage: "BROKER_REVIEW",
        decision: "APPROVED",
        actorUserId: "broker-01",
        actorRole: "BROKER_REVIEWER",
        reasonCode: "DOCUMENTS_COMPLETE",
        occurredAt: new Date().toISOString(),
      }),
    );
    setNotice("Application sent to employer verification.");
  };
  const returnForDocuments = () => {
    setApplication((current) =>
      recordApproval(current, {
        stage: "BROKER_REVIEW",
        decision: "RETURNED",
        actorUserId: "broker-01",
        actorRole: "BROKER_REVIEWER",
        reasonCode: "MISSING_DOCUMENT",
        occurredAt: new Date().toISOString(),
      }),
    );
    setNotice(
      "Supplement request recorded; status remains with broker review.",
    );
  };
  const pending = application.status === "BROKER_REVIEW";
  return (
    <main
      style={{
        maxWidth: 1000,
        margin: "0 auto",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <header
        style={{ display: "flex", justifyContent: "space-between", gap: 16 }}
      >
        <div>
          <h1>{copy.title}</h1>
          <p>{copy.note}</p>
        </div>
        <label>
          Language{" "}
          <select
            value={language}
            onChange={(event) =>
              setLanguage(event.target.value as keyof typeof text)
            }
          >
            <option value="zh-CN">中文</option>
            <option value="en">English</option>
            <option value="km">ខ្មែរ</option>
          </select>
        </label>
      </header>
      <section
        style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 20 }}
      >
        <h2>Application queue · 1 synthetic record</h2>
        <dl
          style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 8 }}
        >
          <dt>ID</dt>
          <dd>{application.id}</dd>
          <dt>Status</dt>
          <dd data-testid="broker-status">
            <strong>{application.status}</strong>
          </dd>
          <dt>Requested amount</dt>
          <dd>{formatHuman(application.requestedAmount)}</dd>
          <dt>Required checks</dt>
          <dd>
            Telegram identity, contact authorization, application documents
          </dd>
        </dl>
        <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
          <button
            data-testid="broker-approve"
            disabled={!pending}
            onClick={approve}
          >
            {copy.approve}
          </button>
          <button
            data-testid="broker-return"
            disabled={!pending}
            onClick={returnForDocuments}
          >
            {copy.return}
          </button>
        </div>
        {notice ? <p role="status">{notice}</p> : null}
      </section>
      <section style={{ marginTop: 24 }}>
        <h2>Audit trail</h2>
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
