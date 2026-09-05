import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  new URL(
    "../db/migrations/V0004__lender_case_workflow_rbac.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("lender case workflow migration", () => {
  it("keeps cases as projections and decisions as append-only lender facts", () => {
    expect(migrationSql).toContain("CREATE TABLE lender_cases");
    expect(migrationSql).toContain("CREATE TABLE lender_case_events");
    expect(migrationSql).toContain(
      "CREATE TRIGGER lender_case_events_append_only",
    );
    expect(migrationSql).toContain(
      "CREATE TRIGGER lender_cases_projection_guard",
    );
    expect(migrationSql).toContain(
      "source_domain text NOT NULL CHECK (source_domain = 'LENDER')",
    );
  });

  it("provisions all lender workflow roles without restoring Broker identity", () => {
    expect(migrationSql).toContain("LENDER_KYC_AML_REVIEWER");
    expect(migrationSql).toContain("LENDER_CREDIT_APPROVER");
    expect(migrationSql).toContain("LENDER_CONTRACT_CHECKER");
    expect(migrationSql).toContain("LENDER_DISBURSEMENT_CHECKER");
    expect(migrationSql).toContain("LENDER_COMPLAINT_OFFICER");
    expect(migrationSql).toContain("LENDER_AUDITOR");
    expect(migrationSql).not.toContain("broker_operator_accounts");
  });
});
