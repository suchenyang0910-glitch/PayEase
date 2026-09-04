import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const integrationDatabaseUrl = process.env.PAYEASE_TEST_DATABASE_URL;
const integration = integrationDatabaseUrl ? describe : describe.skip;

const schemaName = `wallet_runtime_${randomUUID().replace(/-/g, "")}`;
const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = join(sourceDirectory, "..", "db", "migrations");

let pool: Pool;
let client: PoolClient;

integration("lender-wallet-service runtime migration gate", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: integrationDatabaseUrl });
    client = await pool.connect();
    await client.query(`CREATE SCHEMA "${schemaName}"`);
    await client.query(`SET search_path TO "${schemaName}", public`);
    const migrationFiles = (await readdir(migrationsDirectory))
      .filter((filename) => /^V\d+__.*\.sql$/.test(filename))
      .sort((left, right) => left.localeCompare(right));
    for (const filename of migrationFiles) {
      const migrationSql = await readFile(
        join(migrationsDirectory, filename),
        "utf8",
      );
      await client.query(
        migrationSql.replace(
          /^CREATE EXTENSION IF NOT EXISTS pgcrypto;\s*/m,
          "",
        ),
      );
    }
  });

  afterAll(async () => {
    if (client) {
      await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      client.release();
    }
    await pool?.end();
  });

  it("enforces unique wallet session hashes, ledger source references, and outbox idempotency keys", async () => {
    await client.query(
      `INSERT INTO lender_wallet_sessions
        (session_token_hash, application_no, jump_ref, operation_type,
         external_wallet_ref, wallet_status, available_balance_minor, currency, expires_at)
       VALUES
        ('${"a".repeat(64)}', 'APP-001', 'woj_1234567890abcdef1234567890abcd', 'WITHDRAWAL',
         'wallet-ext-001', 'WALLET_AVAILABLE', 1000, 'USD', now() + interval '10 minutes')`,
    );
    await expect(
      client.query(
        `INSERT INTO lender_wallet_sessions
          (session_token_hash, application_no, jump_ref, operation_type,
           external_wallet_ref, wallet_status, available_balance_minor, currency, expires_at)
         VALUES
          ('${"a".repeat(64)}', 'APP-002', 'woj_abcdef1234567890abcdef1234567890', 'REPAYMENT',
           'wallet-ext-002', 'WALLET_PENDING', 0, 'USD', now() + interval '10 minutes')`,
      ),
    ).rejects.toThrow(/duplicate key|重复键/i);

    await client.query(
      `INSERT INTO lender_wallet_ledger_entries
        (application_no, external_wallet_ref, entry_type, amount_minor,
         balance_after_minor, currency, source_reference)
       VALUES
        ('APP-001', 'wallet-ext-001', 'CREDIT', 1000, 1000, 'USD', 'ledger-src-001')`,
    );
    await expect(
      client.query(
        `INSERT INTO lender_wallet_ledger_entries
          (application_no, external_wallet_ref, entry_type, amount_minor,
           balance_after_minor, currency, source_reference)
         VALUES
          ('APP-001', 'wallet-ext-001', 'CREDIT', 1000, 1000, 'USD', 'ledger-src-001')`,
      ),
    ).rejects.toThrow(/duplicate key|重复键/i);

    await client.query(
      `INSERT INTO lender_wallet_event_outbox
        (event_id, event_type, external_application_ref, idempotency_key,
         occurred_at, payload, payload_sha256, signature_key_id)
       VALUES
        ('evt_wallet_credit_test_001', 'WALLET_CREDIT_CONFIRMED', 'APP-001', 'idem-wallet-001',
         now(), '{"externalWalletRef":"wallet-ext-001","walletStatus":"WALLET_AVAILABLE","availableBalanceMinor":"1000","currency":"USD"}'::jsonb,
         '${"b".repeat(64)}', 'lender-hmac-v1')`,
    );
    await expect(
      client.query(
        `INSERT INTO lender_wallet_event_outbox
          (event_id, event_type, external_application_ref, idempotency_key,
           occurred_at, payload, payload_sha256, signature_key_id)
         VALUES
          ('evt_wallet_credit_test_002', 'WALLET_CREDIT_CONFIRMED', 'APP-001', 'idem-wallet-001',
           now(), '{"externalWalletRef":"wallet-ext-001","walletStatus":"WALLET_AVAILABLE","availableBalanceMinor":"1000","currency":"USD"}'::jsonb,
           '${"c".repeat(64)}', 'lender-hmac-v1')`,
      ),
    ).rejects.toThrow(/duplicate key|重复键/i);
  });

  it("rejects updates and deletes for append-only ledger, outbox, dispatch-attempt, and audit facts", async () => {
    const orderInsert = await client.query<{ id: string }>(
      `INSERT INTO lender_wallet_funds_orders
        (application_no, external_wallet_ref, order_ref, order_type, status,
         requested_amount_minor, settled_amount_minor, currency, idempotency_key)
       VALUES
        ('APP-001', 'wallet-ext-001', 'ORD-001', 'WITHDRAWAL', 'PENDING_AUTH',
         1000, NULL, 'USD', 'order-idem-001')
       RETURNING id`,
    );
    const orderId = orderInsert.rows[0]!.id;
    await client.query(
      `INSERT INTO lender_wallet_funds_order_events
        (order_id, event_ref, event_type, actor_ref, amount_minor, metadata)
       VALUES
        ($1, 'order-event-001', 'ORDER_CREATED', 'worker-1', 1000, '{}'::jsonb)`,
      [orderId],
    );
    await client.query(
      `INSERT INTO lender_wallet_event_dispatch_attempts
        (event_id, delivery_status, http_status_code)
       VALUES ('evt_wallet_credit_test_001', 'DISPATCHED', 202)`,
    );
    await client.query(
      `INSERT INTO lender_wallet_audit_events
        (actor_ref, event_name, application_no, subject_ref, details)
       VALUES ('worker-1', 'WALLET_CREDIT_ENQUEUED', 'APP-001', 'ledger-src-001', '{}'::jsonb)`,
    );
    await client.query(
      `INSERT INTO channel_callback_receipts
        (provider, callback_ref, nonce, payload_sha256, order_ref)
       VALUES ('bank-sim', 'callback-runtime-001', 'nonce-runtime-0001',
               '${"d".repeat(64)}', 'ORD-001')`,
    );
    await client.query(
      `INSERT INTO wallet_operation_result_outbox
        (event_id, event_type, external_application_ref, order_ref, idempotency_key,
         occurred_at, payload, payload_sha256, signature_key_id)
       VALUES ('evt_wallet_operation_runtime_001', 'AUTHORIZED', 'APP-001', 'ORD-001',
               'wallet-operation-result:ORD-001:AUTHORIZED', now(),
               '{"externalWalletRef":"wallet-ext-001","orderRef":"ORD-001","operationType":"WITHDRAWAL","operationStatus":"AUTHORIZED","requestedAmountMinor":"1000","settledAmountMinor":null,"currency":"USD"}'::jsonb,
               '${"e".repeat(64)}', 'lender-hmac-v1')`,
    );

    await expect(
      client.query(
        `UPDATE lender_wallet_ledger_entries
            SET amount_minor = 999
          WHERE source_reference = 'ledger-src-001'`,
      ),
    ).rejects.toThrow(/append-only wallet fact table/i);
    await expect(
      client.query(
        `DELETE FROM lender_wallet_ledger_entries
          WHERE source_reference = 'ledger-src-001'`,
      ),
    ).rejects.toThrow(/append-only wallet fact table/i);

    await expect(
      client.query(
        `UPDATE lender_wallet_event_outbox
            SET signature_key_id = 'tampered'
          WHERE event_id = 'evt_wallet_credit_test_001'`,
      ),
    ).rejects.toThrow(/append-only wallet fact table/i);
    await expect(
      client.query(
        `DELETE FROM lender_wallet_event_outbox
          WHERE event_id = 'evt_wallet_credit_test_001'`,
      ),
    ).rejects.toThrow(/append-only wallet fact table/i);

    await expect(
      client.query(
        `UPDATE lender_wallet_event_dispatch_attempts
            SET http_status_code = 500
          WHERE event_id = 'evt_wallet_credit_test_001'`,
      ),
    ).rejects.toThrow(/append-only wallet fact table/i);
    await expect(
      client.query(
        `DELETE FROM lender_wallet_event_dispatch_attempts
          WHERE event_id = 'evt_wallet_credit_test_001'`,
      ),
    ).rejects.toThrow(/append-only wallet fact table/i);

    await expect(
      client.query(
        `UPDATE lender_wallet_funds_order_events
            SET actor_ref = 'worker-2'
          WHERE event_ref = 'order-event-001'`,
      ),
    ).rejects.toThrow(/append-only wallet fact table/i);
    await expect(
      client.query(
        `DELETE FROM lender_wallet_funds_order_events
          WHERE event_ref = 'order-event-001'`,
      ),
    ).rejects.toThrow(/append-only wallet fact table/i);

    await expect(
      client.query(
        `UPDATE lender_wallet_audit_events
            SET actor_ref = 'worker-2'
          WHERE application_no = 'APP-001'`,
      ),
    ).rejects.toThrow(/append-only wallet fact table/i);
    await expect(
      client.query(
        `DELETE FROM lender_wallet_audit_events
          WHERE application_no = 'APP-001'`,
      ),
    ).rejects.toThrow(/append-only wallet fact table/i);

    await expect(
      client.query(
        `UPDATE channel_callback_receipts
            SET payload_sha256 = '${"f".repeat(64)}'
          WHERE callback_ref = 'callback-runtime-001'`,
      ),
    ).rejects.toThrow(/append-only wallet fact table/i);
    await expect(
      client.query(
        `DELETE FROM wallet_operation_result_outbox
          WHERE event_id = 'evt_wallet_operation_runtime_001'`,
      ),
    ).rejects.toThrow(/append-only wallet fact table/i);
  });

  it("requires funds order projection changes to go through the transition functions", async () => {
    const createdOrder = await client.query<{
      order_ref: string;
      status: string;
      requested_amount_minor: string;
    }>(
      `SELECT order_ref,
              status,
              requested_amount_minor::text
         FROM create_lender_wallet_funds_order(
                'APP-002',
                'wallet-ext-002',
                'ORD-TRANSITION-001',
                'REPAYMENT',
                2200,
                'USD',
                'order-idem-002',
                'worker-1',
                'order-event-created-002',
                '{"channel":"bank_auth"}'::jsonb
              )`,
    );
    expect(createdOrder.rows[0]).toEqual({
      order_ref: "ORD-TRANSITION-001",
      status: "PENDING_AUTH",
      requested_amount_minor: "2200",
    });

    await expect(
      client.query(
        `UPDATE lender_wallet_funds_orders
            SET status = 'AUTHORIZED',
                updated_at = now()
          WHERE order_ref = 'ORD-TRANSITION-001'`,
      ),
    ).rejects.toThrow(
      /funds order projection updates must go through transition_lender_wallet_funds_order/i,
    );

    const authorized = await client.query<{
      status: string;
      settled_amount_minor: string | null;
    }>(
      `SELECT status, settled_amount_minor::text
         FROM transition_lender_wallet_funds_order(
                'ORD-TRANSITION-001',
                'order-event-authorized-002',
                'AUTHORIZED',
                'worker-2',
                'AUTHORIZED',
                NULL,
                2200,
                NULL,
                '{"authRef":"AUTH-002"}'::jsonb
              )`,
    );
    expect(authorized.rows[0]).toEqual({
      status: "AUTHORIZED",
      settled_amount_minor: null,
    });

    const settled = await client.query<{
      status: string;
      settled_amount_minor: string | null;
    }>(
      `SELECT status, settled_amount_minor::text
         FROM transition_lender_wallet_funds_order(
                'ORD-TRANSITION-001',
                'order-event-processing-002',
                'PROCESSING',
                'worker-2',
                'PROCESSING',
                NULL,
                2200,
                NULL,
                '{}'::jsonb
              )`,
    );
    expect(settled.rows[0]).toEqual({
      status: "PROCESSING",
      settled_amount_minor: null,
    });

    const final = await client.query<{
      status: string;
      settled_amount_minor: string | null;
    }>(
      `SELECT status, settled_amount_minor::text
         FROM transition_lender_wallet_funds_order(
                'ORD-TRANSITION-001',
                'order-event-settled-002',
                'SETTLED',
                'worker-3',
                'SETTLED',
                'callback-002',
                2200,
                2200,
                '{"settlementBatch":"BATCH-1"}'::jsonb
              )`,
    );
    expect(final.rows[0]).toEqual({
      status: "SETTLED",
      settled_amount_minor: "2200",
    });

    const events = await client.query<{
      event_type: string;
      actor_ref: string;
    }>(
      `SELECT event_type, actor_ref
         FROM lender_wallet_funds_order_events event_row
         JOIN lender_wallet_funds_orders order_row
           ON order_row.id = event_row.order_id
        WHERE order_row.order_ref = 'ORD-TRANSITION-001'
        ORDER BY event_row.created_at ASC`,
    );
    expect(events.rows).toEqual([
      { event_type: "ORDER_CREATED", actor_ref: "worker-1" },
      { event_type: "AUTHORIZED", actor_ref: "worker-2" },
      { event_type: "PROCESSING", actor_ref: "worker-2" },
      { event_type: "SETTLED", actor_ref: "worker-3" },
    ]);
  });

  it("enforces a lender-only maker/checker manual-bank-operation evidence chain", async () => {
    const order = await client.query<{ id: string }>(
      `SELECT id
         FROM create_lender_wallet_funds_order(
                'APP-MANUAL-001',
                'wallet-ext-manual-001',
                'ORD-MANUAL-001',
                'WITHDRAWAL',
                1500,
                'USD',
                'order-idem-manual-001',
                'applicant-001',
                'order-event-created-manual-001',
                '{}'::jsonb
              )`,
    );
    const created = await client.query<{ id: string; status: string }>(
      `SELECT id, status
         FROM create_lender_wallet_manual_operation(
                $1,
                'applicant-001',
                'manual-event-requested-001',
                '{}'::jsonb
              )`,
      [order.rows[0]!.id],
    );
    expect(created.rows[0]!.status).toBe("REQUESTED");

    await expect(
      client.query(
        `UPDATE lender_wallet_manual_operation_cases
            SET status = 'SETTLED'
          WHERE id = $1`,
        [created.rows[0]!.id],
      ),
    ).rejects.toThrow(/manual operation updates must go through/i);

    await client.query(
      `SELECT status
         FROM transition_lender_wallet_manual_operation(
                $1, 'manual-event-maker-001', 'MAKER_VERIFIED',
                'maker-001', 'MAKER', NULL, NULL, '{}'::jsonb
              )`,
      [created.rows[0]!.id],
    );
    await expect(
      client.query(
        `SELECT status
           FROM transition_lender_wallet_manual_operation(
                  $1, 'manual-event-checker-same-001', 'CHECKER_APPROVED',
                  'maker-001', 'CHECKER', NULL, NULL, '{}'::jsonb
                )`,
        [created.rows[0]!.id],
      ),
    ).rejects.toThrow(/checker must differ from maker/i);
    await client.query(
      `SELECT status
         FROM transition_lender_wallet_manual_operation(
                $1, 'manual-event-checker-001', 'CHECKER_APPROVED',
                'checker-001', 'CHECKER', NULL, NULL, '{}'::jsonb
              )`,
      [created.rows[0]!.id],
    );
    await expect(
      client.query(
        `SELECT status
           FROM transition_lender_wallet_manual_operation(
                  $1, 'manual-event-bank-no-proof-001', 'BANK_TRANSFER_RECORDED',
                  'maker-001', 'MAKER', NULL, NULL, '{}'::jsonb
                )`,
        [created.rows[0]!.id],
      ),
    ).rejects.toThrow(/requires evidence reference/i);
    const settled = await client.query<{ status: string }>(
      `SELECT status
         FROM transition_lender_wallet_manual_operation(
                $1, 'manual-event-bank-001', 'BANK_TRANSFER_RECORDED',
                'maker-001', 'MAKER', 'vault://lender/manual/transfer-001', NULL, '{}'::jsonb
              )`,
      [created.rows[0]!.id],
    );
    expect(settled.rows[0]!.status).toBe("BANK_TRANSFER_RECORDED");
    const final = await client.query<{ status: string }>(
      `SELECT status
         FROM transition_lender_wallet_manual_operation(
                $1, 'manual-event-settled-001', 'SETTLED',
                'checker-001', 'CHECKER', 'vault://lender/manual/settlement-001', NULL, '{}'::jsonb
              )`,
      [created.rows[0]!.id],
    );
    expect(final.rows[0]!.status).toBe("SETTLED");
    await expect(
      client.query(
        `DELETE FROM lender_wallet_manual_operation_events
          WHERE event_ref = 'manual-event-settled-001'`,
      ),
    ).rejects.toThrow(/append-only wallet fact table/i);
  });
});
