import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const integrationDatabaseUrl = process.env.PAYEASE_TEST_DATABASE_URL;
const integration = integrationDatabaseUrl ? describe : describe.skip;

const schemaName = `lender_runtime_${randomUUID().replace(/-/g, "")}`;
const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(
  sourceDirectory,
  "..",
  "db",
  "migrations",
  "V0001__v2_lender_case_workflow.sql",
);

let pool: Pool;
let client: PoolClient;

async function expectAppendOnlyMutationRejected(
  sql: string,
  description: string,
): Promise<void> {
  await expect(client.query(sql), description).rejects.toThrow(
    /append-only event table/i,
  );
}

integration("lender-core runtime migration gate", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: integrationDatabaseUrl });
    client = await pool.connect();
    const migrationSql = await readFile(migrationPath, "utf8");
    await client.query(`CREATE SCHEMA "${schemaName}"`);
    await client.query(`SET search_path TO "${schemaName}", public`);
    await client.query(migrationSql);
  });

  afterAll(async () => {
    if (client) {
      await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      client.release();
    }
    await pool?.end();
  });

  it("rejects updates and deletes for contract and payment facts while allowing status projection updates", async () => {
    const caseInsert = await client.query<{ id: string }>(
      `INSERT INTO lender_cases
        (lender_case_ref, broker_application_ref, workflow_version, local_status)
       VALUES ('LND-CASE-CI-001', 'BRK-APP-CI-001', 'SALARY_LOAN_V2', 'FINAL_CONTRACT_READY')
       RETURNING id`,
    );
    const lenderCaseId = caseInsert.rows[0]?.id;
    expect(lenderCaseId).toBeTruthy();

    const receiptInsert = await client.query<{ id: string }>(
      `INSERT INTO lender_contract_evidence_receipts
        (lender_case_id, broker_submission_event_ref, package_ref, package_hash, received_at)
       VALUES ($1, 'broker-contract-submit-ci-001', 'CEP-CI-001', $2, now())
       RETURNING id`,
      [lenderCaseId, "a".repeat(64)],
    );
    const receiptId = receiptInsert.rows[0]?.id;
    expect(receiptId).toBeTruthy();

    const acceptanceInsert = await client.query<{ id: string }>(
      `INSERT INTO lender_contract_evidence_acceptances
        (lender_case_id, lender_contract_evidence_receipt_id, accepted_event_ref, accepted_at, actor_user_ref)
       VALUES ($1, $2, 'lender-contract-accept-ci-001', now(), 'checker-ci-1')
       RETURNING id`,
      [lenderCaseId, receiptId],
    );
    const acceptanceId = acceptanceInsert.rows[0]?.id;
    expect(acceptanceId).toBeTruthy();

    const paymentInsert = await client.query<{ id: string }>(
      `INSERT INTO lender_payment_acceptances
        (lender_case_id, payment_type, proof_ref, amount_minor, currency, accepted_from_domain, accepted_event_ref, accepted_at)
       VALUES ($1, 'BROKERAGE_REMUNERATION_PAYMENT_PROOF', 'PRF-CI-001', 525, 'USD', 'BROKER', 'broker-fee-accept-ci-001', now())
       RETURNING id`,
      [lenderCaseId],
    );
    const paymentId = paymentInsert.rows[0]?.id;
    expect(paymentId).toBeTruthy();

    await expectAppendOnlyMutationRejected(
      `UPDATE lender_contract_evidence_receipts
          SET package_ref = 'CEP-CI-UPDATED'
        WHERE id = '${receiptId}'`,
      "contract evidence receipt update must fail",
    );
    await expectAppendOnlyMutationRejected(
      `DELETE FROM lender_contract_evidence_receipts WHERE id = '${receiptId}'`,
      "contract evidence receipt delete must fail",
    );
    await expectAppendOnlyMutationRejected(
      `UPDATE lender_contract_evidence_acceptances
          SET actor_user_ref = 'checker-ci-2'
        WHERE id = '${acceptanceId}'`,
      "contract evidence acceptance update must fail",
    );
    await expectAppendOnlyMutationRejected(
      `DELETE FROM lender_contract_evidence_acceptances WHERE id = '${acceptanceId}'`,
      "contract evidence acceptance delete must fail",
    );
    await expectAppendOnlyMutationRejected(
      `UPDATE lender_payment_acceptances
          SET amount_minor = 526
        WHERE id = '${paymentId}'`,
      "payment acceptance update must fail",
    );
    await expectAppendOnlyMutationRejected(
      `DELETE FROM lender_payment_acceptances WHERE id = '${paymentId}'`,
      "payment acceptance delete must fail",
    );

    const projectionUpdate = await client.query<{ local_status: string }>(
      `UPDATE lender_cases
          SET local_status = 'CONTRACT_EVIDENCE_ACCEPTED',
              updated_at = now()
        WHERE id = $1
        RETURNING local_status`,
      [lenderCaseId],
    );

    expect(projectionUpdate.rows[0]?.local_status).toBe(
      "CONTRACT_EVIDENCE_ACCEPTED",
    );
  });
});
