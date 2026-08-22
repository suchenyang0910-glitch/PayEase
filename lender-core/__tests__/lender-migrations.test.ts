import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = new URL(
  "../db/migrations/V0001__v2_lender_case_workflow.sql",
  import.meta.url,
);
const migrationSql = readFileSync(migrationPath, "utf8");

describe("lender v2 migration append-only evidence facts", () => {
  it("stores contract evidence receipt and acceptance as separate append-only facts", () => {
    expect(migrationSql).toContain(
      "CREATE TABLE lender_contract_evidence_receipts",
    );
    expect(migrationSql).toContain(
      "CREATE TABLE lender_contract_evidence_acceptances",
    );
    expect(migrationSql).not.toContain(
      "CREATE TABLE lender_contract_evidence_packets",
    );
    expect(migrationSql).toContain(
      "CREATE TRIGGER lender_contract_evidence_receipts_append_only",
    );
    expect(migrationSql).toContain(
      "CREATE TRIGGER lender_contract_evidence_acceptances_append_only",
    );
  });

  it("protects payment acceptance facts from update and delete mutations", () => {
    expect(migrationSql).toContain("CREATE TABLE lender_payment_acceptances");
    expect(migrationSql).toContain(
      "CREATE TRIGGER lender_payment_acceptances_append_only",
    );
    expect(migrationSql).toContain(
      "BEFORE UPDATE OR DELETE ON lender_payment_acceptances",
    );
  });
});
