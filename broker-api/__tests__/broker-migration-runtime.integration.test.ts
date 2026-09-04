import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const integrationDatabaseUrl = process.env.PAYEASE_TEST_DATABASE_URL;
const integration = integrationDatabaseUrl ? describe : describe.skip;

const schemaName = `broker_runtime_${randomUUID().replace(/-/g, "")}`;
const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = join(
  sourceDirectory,
  "..",
  "..",
  "broker-platform",
  "db",
  "migrations",
);

let pool: Pool;
let client: PoolClient;

async function applyBrokerMigrations(): Promise<void> {
  const filenames = (await readdir(migrationsDirectory))
    .filter((filename) => /^V\d{4}__[a-z0-9_]+\.sql$/.test(filename))
    .sort();
  for (const filename of filenames) {
    const sql = (await readFile(join(migrationsDirectory, filename), "utf8"))
      // PostgreSQL 16 ships gen_random_uuid() in core, and runtime gate tests
      // apply migrations in an isolated schema where extension DDL is not
      // database-local. Skip the legacy extension bootstrap in this harness.
      .replace(/^CREATE EXTENSION IF NOT EXISTS pgcrypto;\s*/m, "");
    await client.query(sql);
  }
}

async function expectAppendOnlyMutationRejected(
  sql: string,
  description: string,
): Promise<void> {
  await expect(client.query(sql), description).rejects.toThrow(
    /append-only event table/i,
  );
}

integration("broker runtime migration gate", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: integrationDatabaseUrl });
    client = await pool.connect();
    await client.query(`CREATE SCHEMA "${schemaName}"`);
    await client.query(`SET search_path TO "${schemaName}", public`);
    await applyBrokerMigrations();
  });

  afterAll(async () => {
    if (client) {
      await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      client.release();
    }
    await pool?.end();
  });

  it("uses principal-and-interest scope and employer payroll projections without writing payroll pending into applications.status", async () => {
    const employerTenant = await client.query<{ id: string }>(
      `INSERT INTO employer_tenants (external_ref, display_name)
       VALUES ('BROKER-RUNTIME-FACTORY', 'Broker runtime factory')
       RETURNING id`,
    );
    const user = await client.query<{ id: string }>(
      `INSERT INTO users (telegram_user_ref, preferred_language)
       VALUES ('broker-runtime-user', 'en')
       RETURNING id`,
    );
    const application = await client.query<{ id: string }>(
      `INSERT INTO applications
        (application_no, user_id, employer_tenant_id, requested_amount_minor,
         currency, tenor_days, status, workflow_version)
       VALUES (
         'APP-BROKER-RUNTIME-001', $1, $2, 25000, 'USD', 30,
         'DISBURSED', 'SALARY_LOAN_V2'
       )
       RETURNING id`,
      [user.rows[0]!.id, employerTenant.rows[0]!.id],
    );
    const applicationId = application.rows[0]!.id;

    await expect(
      client.query(
        `INSERT INTO application_repayment_preferences
          (application_id, workflow_version, selected_repayment_method,
           available_repayment_methods, employer_payroll_rule_version,
           collection_mode, collection_payee_ref)
         VALUES (
           $1, 'SALARY_LOAN_V2', 'EMPLOYER_PAYROLL_DEDUCTION',
           ARRAY['EMPLOYER_PAYROLL_DEDUCTION']::text[],
           'EMPLOYER-RULE-RUNTIME-001', 'PRINCIPAL_ONLY',
           'EMPLOYER_PAYROLL_RUN'
         )`,
        [applicationId],
      ),
    ).rejects.toThrow(
      /application_repayment_preferences_collection_mode_check/i,
    );

    await client.query(
      `INSERT INTO application_repayment_preferences
        (application_id, workflow_version, selected_repayment_method,
         available_repayment_methods, employer_payroll_rule_version,
         collection_mode, collection_payee_ref)
       VALUES (
         $1, 'SALARY_LOAN_V2', 'EMPLOYER_PAYROLL_DEDUCTION',
         ARRAY['EMPLOYER_PAYROLL_DEDUCTION']::text[],
         'EMPLOYER-RULE-RUNTIME-001', 'PRINCIPAL_AND_INTEREST',
         'EMPLOYER_PAYROLL_RUN'
       )`,
      [applicationId],
    );
    await client.query(
      `INSERT INTO application_authorization_snapshots
        (application_id, workflow_version, employer_verification_authorized,
         service_agreement_authorized,
         post_disbursement_brokerage_authorized, payroll_deduction_authorized,
         direct_debit_authorized, employer_verification_authorization_ref,
         service_agreement_authorization_ref,
         post_disbursement_brokerage_authorization_ref,
         payroll_deduction_authorization_ref)
       VALUES (
         $1, 'SALARY_LOAN_V2', true, true, true, true, false,
         'AUTH-EMPLOYER-RUNTIME-001', 'AUTH-SERVICE-RUNTIME-001',
         'AUTH-BROKERAGE-RUNTIME-001', 'AUTH-PAYROLL-RUNTIME-001'
       )`,
      [applicationId],
    );

    await expect(
      client.query(
        `UPDATE applications
            SET status = 'PAYROLL_COLLECTION_PENDING'
          WHERE id = $1`,
        [applicationId],
      ),
    ).rejects.toThrow(
      /PAYROLL_COLLECTION_PENDING|check constraint|invalid application status transition/i,
    );

    await expect(
      client.query(
        `INSERT INTO employer_payroll_rules
          (employer_tenant_id, rule_code, workflow_version, collection_currency,
           collection_day_of_month, collection_type, partial_collection_allowed,
           allowed_repayment_methods, default_repayment_method,
           published_by_user_ref)
         VALUES (
           $1, 'EMPLOYER-RUNTIME-LEGACY', 'SALARY_LOAN_V2', 'USD',
           15, 'PRINCIPAL_ONLY', true,
           ARRAY['EMPLOYER_PAYROLL_DEDUCTION']::text[],
           'EMPLOYER_PAYROLL_DEDUCTION', 'runtime-ci'
         )`,
        [employerTenant.rows[0]!.id],
      ),
    ).rejects.toThrow(/employer_payroll_rules_collection_type_check/i);

    await client.query(
      `INSERT INTO employer_payroll_rules
        (employer_tenant_id, rule_code, workflow_version, collection_currency,
         collection_day_of_month, payroll_nodes, collection_type, partial_collection_allowed,
         allowed_repayment_methods, default_repayment_method,
         published_by_user_ref)
       VALUES (
         $1, 'EMPLOYER-RUNTIME-V2', 'SALARY_LOAN_V2', 'USD',
         15,
         $2::jsonb,
         'PRINCIPAL_AND_INTEREST', true,
         ARRAY['EMPLOYER_PAYROLL_DEDUCTION']::text[],
         'EMPLOYER_PAYROLL_DEDUCTION', 'runtime-ci'
       )`,
      [
        employerTenant.rows[0]!.id,
        JSON.stringify([
          { nodeRef: "PAYDAY-1", scheduleType: "FIXED_DAY", dayOfMonth: 15 },
          { nodeRef: "PAYDAY-2", scheduleType: "LAST_DAY_OF_MONTH" },
        ]),
      ],
    );

    await client.query(
      `INSERT INTO repayment_installments
        (application_id, installment_no, due_date, amount_due_minor,
         principal_due_minor, lender_interest_due_minor, payroll_node_ref)
       VALUES
        ($1, 1, '2026-09-15', 12750, 12500, 250, 'PAYDAY-1'),
        ($1, 2, '2026-09-30', 12750, 12500, 250, 'PAYDAY-2')`,
      [applicationId],
    );

    const firstInstruction = await client.query<{ id: string }>(
      `INSERT INTO employer_payroll_collection_instructions
        (application_id, workflow_version, employer_tenant_id,
         repayment_installment_no, selected_repayment_method, collection_scope,
         projection_status, scheduled_due_date, scheduled_amount_minor,
         currency, lender_event_ref, payroll_schedule_snapshot)
       VALUES (
         $1, 'SALARY_LOAN_V2', $2, 1, 'EMPLOYER_PAYROLL_DEDUCTION',
         'PRINCIPAL_AND_INTEREST', 'PAYROLL_COLLECTION_PENDING',
         '2026-09-15', 12750, 'USD', 'LENDER-EVENT-RUNTIME-001',
         $3::jsonb
       )
       RETURNING id`,
      [
        applicationId,
        employerTenant.rows[0]!.id,
        JSON.stringify({
          employerTenantId: employerTenant.rows[0]!.id,
          collectionSequence: 1,
          scheduledDueDate: "2026-09-15",
          collectionScope: "PRINCIPAL_AND_INTEREST",
        }),
      ],
    );
    const secondInstruction = await client.query<{ id: string }>(
      `INSERT INTO employer_payroll_collection_instructions
        (application_id, workflow_version, employer_tenant_id,
         repayment_installment_no, selected_repayment_method, collection_scope,
         projection_status, scheduled_due_date, scheduled_amount_minor,
         currency, lender_event_ref, payroll_schedule_snapshot)
       VALUES (
         $1, 'SALARY_LOAN_V2', $2, 2, 'EMPLOYER_PAYROLL_DEDUCTION',
         'PRINCIPAL_AND_INTEREST', 'SCHEDULED',
         '2026-09-30', 12750, 'USD', 'LENDER-EVENT-RUNTIME-002',
         $3::jsonb
       )
       RETURNING id`,
      [
        applicationId,
        employerTenant.rows[0]!.id,
        JSON.stringify({
          employerTenantId: employerTenant.rows[0]!.id,
          collectionSequence: 2,
          scheduledDueDate: "2026-09-30",
          collectionScope: "PRINCIPAL_AND_INTEREST",
        }),
      ],
    );
    expect(firstInstruction.rows[0]?.id).toBeTruthy();
    expect(secondInstruction.rows[0]?.id).toBeTruthy();

    const scheduledEvent = await client.query<{ id: string }>(
      `INSERT INTO payroll_collection_events
        (application_id, workflow_version, event_type, source_domain,
         actor_user_ref, payroll_run_date, amount_minor, currency,
         evidence_reference, reason_code, occurred_at)
       VALUES (
         $1, 'SALARY_LOAN_V2', 'PAYROLL_COLLECTION_SCHEDULED', 'LENDER',
         'lender-runtime-checker', '2026-09-15', 12750, 'USD',
         'LENDER-EVENT-RUNTIME-001', 'INSTALLMENT_SCHEDULED', now()
       )
       RETURNING id`,
      [applicationId],
    );
    const reportedEvent = await client.query<{ id: string }>(
      `INSERT INTO payroll_collection_events
        (application_id, workflow_version, event_type, source_domain,
         actor_user_ref, payroll_run_date, amount_minor, currency,
         evidence_reference, reason_code, occurred_at)
       VALUES (
         $1, 'SALARY_LOAN_V2', 'PAYROLL_COLLECTION_REPORTED', 'EMPLOYER',
         'employer-runtime-finance', '2026-09-15', 12750, 'USD',
         'EMPLOYER-EVENT-RUNTIME-001',
         'PAYROLL_INSTALLMENT_COLLECTION_REPORTED', now()
       )
       RETURNING id`,
      [applicationId],
    );
    expect(scheduledEvent.rows[0]?.id).toBeTruthy();
    expect(reportedEvent.rows[0]?.id).toBeTruthy();

    await client.query(
      `UPDATE employer_payroll_collection_instructions
          SET projection_status = 'COLLECTION_RECONCILIATION_PENDING',
              reported_event_ref = 'EMPLOYER-EVENT-RUNTIME-001',
              reported_by_user_ref = 'employer-runtime-finance',
              reported_reason_code = 'PAYROLL_INSTALLMENT_COLLECTION_REPORTED',
              reported_collection_result = 'COLLECTED',
              reported_actual_amount_minor = 12750,
              reported_evidence_reference = 'EMPLOYER-EVENT-RUNTIME-001',
              reported_at = now(),
              updated_at = now()
        WHERE application_id = $1
          AND repayment_installment_no = 1`,
      [applicationId],
    );
    await client.query(
      `UPDATE employer_payroll_collection_instructions
          SET projection_status = 'RECONCILED',
              updated_at = now()
        WHERE application_id = $1
          AND repayment_installment_no = 1`,
      [applicationId],
    );
    await client.query(
      `UPDATE employer_payroll_collection_instructions
          SET projection_status = 'PAYROLL_COLLECTION_PENDING',
              updated_at = now()
        WHERE application_id = $1
          AND repayment_installment_no = 2`,
      [applicationId],
    );

    const projections = await client.query<{
      repayment_installment_no: number;
      projection_status: string;
      collection_scope: string;
      reported_actual_amount_minor: string | null;
    }>(
      `SELECT repayment_installment_no, projection_status, collection_scope,
              reported_actual_amount_minor::text
         FROM employer_payroll_collection_instructions
        WHERE application_id = $1
        ORDER BY repayment_installment_no ASC`,
      [applicationId],
    );
    expect(projections.rows).toEqual([
      {
        repayment_installment_no: 1,
        projection_status: "RECONCILED",
        collection_scope: "PRINCIPAL_AND_INTEREST",
        reported_actual_amount_minor: "12750",
      },
      {
        repayment_installment_no: 2,
        projection_status: "PAYROLL_COLLECTION_PENDING",
        collection_scope: "PRINCIPAL_AND_INTEREST",
        reported_actual_amount_minor: null,
      },
    ]);

    await expectAppendOnlyMutationRejected(
      `UPDATE payroll_collection_events
          SET reason_code = 'MUTATED'
        WHERE id = '${reportedEvent.rows[0]!.id}'`,
      "payroll collection event update must fail",
    );
    await expectAppendOnlyMutationRejected(
      `DELETE FROM payroll_collection_events
        WHERE id = '${scheduledEvent.rows[0]!.id}'`,
      "payroll collection event delete must fail",
    );
  });

  it("stores append-only KYC evidence and assessments plus draft-only service area mutations", async () => {
    const user = await client.query<{ id: string }>(
      `INSERT INTO users (telegram_user_ref, preferred_language)
       VALUES ('broker-runtime-kyc-zone-user', 'en')
       RETURNING id`,
    );
    await client.query(
      `INSERT INTO service_area_zone_versions
        (zone_ref, version, display_name, scope_type, employer_tenant_id,
         polygon_geojson, polygon_bbox, status, effective_from, effective_until,
         change_reason, created_by_user_ref, submitted_by_user_ref, submitted_at,
         reviewed_by_user_ref, reviewed_at, activated_by_user_ref, activated_at)
       VALUES (
         'ZONE-RUNTIME-001', 1, 'Runtime active zone', 'PLATFORM', NULL,
         $1::jsonb, $2::jsonb, 'ACTIVE', '2026-09-01T00:00:00.000Z', NULL,
         'Runtime rollout', 'ops-maker', 'ops-maker', now(),
         'ops-checker', now(), 'ops-checker', now()
       )`,
      [
        JSON.stringify({
          type: "Polygon",
          coordinates: [
            [
              [104.9, 11.56],
              [104.94, 11.56],
              [104.94, 11.6],
              [104.9, 11.6],
              [104.9, 11.56],
            ],
          ],
        }),
        JSON.stringify({
          minLongitude: 104.9,
          maxLongitude: 104.94,
          minLatitude: 11.56,
          maxLatitude: 11.6,
        }),
      ],
    );
    const evidence = await client.query<{ id: string }>(
      `INSERT INTO kyc_location_evidence
        (evidence_ref, user_id, application_id, latitude_encrypted, longitude_encrypted,
         horizontal_accuracy_encrypted, captured_at_encrypted, consent_version,
         source, pii_key_version)
       VALUES (
         'KYCLOC-RUNTIME001', $1, NULL, '\\x01'::bytea, '\\x02'::bytea,
         '\\x03'::bytea, '\\x04'::bytea, 'KYC_LOCATION_V1',
         'TELEGRAM_LOCATION_MANAGER', 'test-key-v1'
       )
       RETURNING id`,
      [user.rows[0]!.id],
    );
    const assessment = await client.query<{ id: string }>(
      `INSERT INTO kyc_location_assessments
        (evidence_id, user_id, application_id, assessment_result,
         assessed_scope_type, employer_tenant_id, matched_zone_ref,
         matched_zone_version, rule_version, actor_user_ref)
       VALUES (
         $1, $2, NULL, 'MATCH', 'PLATFORM', NULL,
         'ZONE-RUNTIME-001', 1, 'KYC_LOCATION_RULE_V1', 'SYSTEM'
       )
       RETURNING id`,
      [evidence.rows[0]!.id, user.rows[0]!.id],
    );

    await expectAppendOnlyMutationRejected(
      `UPDATE kyc_location_evidence
          SET consent_version = 'KYC_LOCATION_V2'
        WHERE id = '${evidence.rows[0]!.id}'`,
      "kyc location evidence update must fail",
    );
    await expectAppendOnlyMutationRejected(
      `DELETE FROM kyc_location_evidence
        WHERE id = '${evidence.rows[0]!.id}'`,
      "kyc location evidence delete must fail",
    );
    await expectAppendOnlyMutationRejected(
      `UPDATE kyc_location_assessments
          SET assessment_result = 'OUT_OF_ZONE'
        WHERE id = '${assessment.rows[0]!.id}'`,
      "kyc location assessment update must fail",
    );
    await expectAppendOnlyMutationRejected(
      `DELETE FROM kyc_location_assessments
        WHERE id = '${assessment.rows[0]!.id}'`,
      "kyc location assessment delete must fail",
    );
    await expect(
      client.query(
        `UPDATE service_area_zone_versions
            SET display_name = 'Mutated active zone'
          WHERE zone_ref = 'ZONE-RUNTIME-001' AND version = 1`,
      ),
    ).rejects.toThrow(/only DRAFT service area zone versions may change/i);

    await client.query(
      `INSERT INTO service_area_zone_versions
        (zone_ref, version, display_name, scope_type, employer_tenant_id,
         polygon_geojson, polygon_bbox, status, effective_from, effective_until,
         change_reason, created_by_user_ref)
       VALUES (
         'ZONE-RUNTIME-001', 2, 'Runtime draft zone', 'PLATFORM', NULL,
         $1::jsonb, $2::jsonb, 'DRAFT', '2026-10-01T00:00:00.000Z', NULL,
         'Draft follow-up', 'ops-maker'
       )`,
      [
        JSON.stringify({
          type: "Polygon",
          coordinates: [
            [
              [105.0, 11.7],
              [105.04, 11.7],
              [105.04, 11.74],
              [105.0, 11.74],
              [105.0, 11.7],
            ],
          ],
        }),
        JSON.stringify({
          minLongitude: 105.0,
          maxLongitude: 105.04,
          minLatitude: 11.7,
          maxLatitude: 11.74,
        }),
      ],
    );
    await client.query(
      `UPDATE service_area_zone_versions
          SET display_name = 'Runtime draft zone updated',
              updated_at = now()
        WHERE zone_ref = 'ZONE-RUNTIME-001' AND version = 2`,
    );
  });

  it("stores cross-domain outbox and inbox envelopes with nonce replay protection", async () => {
    await client.query(
      `INSERT INTO domain_event_outbox
        (event_id, event_type, source_domain, target_domain, external_application_ref,
         idempotency_key, occurred_at, payload, payload_sha256,
         signature_algorithm, signature_key_id)
       VALUES (
         'evt_runtime_outbox_001', 'APPLICATION_PACKAGE_SUBMITTED', 'BROKER', 'LENDER',
         'APP-EXT-RUNTIME-001', 'idem-runtime-outbox-001',
         '2026-08-22T00:00:00Z',
         '{"applicationPackageRef":"pkg-runtime-001"}'::jsonb,
         'db63e9b4270cb5e2a4b1f1f37bd3f6413323af850c546312e4c8c48b7cfb43c4',
         'HMAC-SHA256', 'broker-hmac-v1'
       )`,
    );
    await client.query(
      `INSERT INTO domain_event_nonce_guards
        (source_domain, nonce, event_id, expires_at)
       VALUES (
         'LENDER', 'nonce-runtime-domain-event-001',
         'evt_runtime_inbox_001', now() + interval '5 minutes'
       )`,
    );
    await expect(
      client.query(
        `INSERT INTO domain_event_nonce_guards
          (source_domain, nonce, event_id, expires_at)
         VALUES (
           'LENDER', 'nonce-runtime-domain-event-001',
           'evt_runtime_inbox_002', now() + interval '5 minutes'
         )`,
      ),
    ).rejects.toThrow(/duplicate key|domain_event_nonce_guards_pkey/i);
    await client.query(
      `INSERT INTO domain_event_inbox
        (event_id, event_type, source_domain, target_domain,
         external_application_ref, idempotency_key, occurred_at, payload,
         payload_sha256, signature_algorithm, signature_key_id,
         transport_timestamp_millis, transport_nonce, processing_status)
       VALUES (
         'evt_runtime_inbox_001', 'DISBURSEMENT_CONFIRMED', 'LENDER', 'BROKER',
         'APP-EXT-RUNTIME-001', 'idem-runtime-inbox-001',
         '2026-08-22T00:00:00Z',
         '{"disbursedAt":"2026-08-22T09:00:00Z"}'::jsonb,
         'd87cd4fba9e1de3ee78753b6535e263fb9e98f1b093e6e7c884f317bb4f6e04a',
         'HMAC-SHA256', 'lender-hmac-v1',
         1787356800000, 'nonce-runtime-domain-event-001', 'RECEIVED'
       )`,
    );
    const outbox = await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM domain_event_outbox",
    );
    const inbox = await client.query<{ processing_status: string }>(
      `SELECT processing_status
         FROM domain_event_inbox
        WHERE event_id = 'evt_runtime_inbox_001'`,
    );
    expect(outbox.rows[0]?.count).toBe("1");
    expect(inbox.rows[0]?.processing_status).toBe("RECEIVED");
  });

  it("stores one-time wallet jumps and wallet availability projections for wallet operations", async () => {
    const user = await client.query<{ id: string }>(
      `INSERT INTO users (telegram_user_ref, preferred_language)
       VALUES ('broker-runtime-wallet-user', 'en')
       RETURNING id`,
    );
    const application = await client.query<{ id: string }>(
      `INSERT INTO applications
        (application_no, user_id, requested_amount_minor, currency, tenor_days,
         status, workflow_version)
       VALUES (
         'APP-BROKER-RUNTIME-WALLET-001', $1, 25000, 'USD', 30,
         'DISBURSED', 'SALARY_LOAN_V2'
       )
       RETURNING id`,
      [user.rows[0]!.id],
    );
    const applicationId = application.rows[0]!.id;

    await client.query(
      `INSERT INTO application_repayment_preferences
        (application_id, workflow_version, selected_repayment_method,
         available_repayment_methods, collection_mode, collection_payee_ref)
       VALUES (
         $1, 'SALARY_LOAN_V2', 'SMILE_WALLET_AUTHORIZATION',
         ARRAY['SMILE_WALLET_AUTHORIZATION']::text[],
         'PRINCIPAL_AND_INTEREST', 'runtime-smile-wallet-payee'
       )`,
      [applicationId],
    );
    await client.query(
      `INSERT INTO lender_wallet_projection_snapshots
         (application_id, external_wallet_ref, wallet_status,
          available_balance_minor, currency)
       VALUES (
         $1, 'wallet-runtime-001', 'WALLET_AVAILABLE', 25000, 'USD'
       )`,
      [applicationId],
    );
    await client.query(
      `INSERT INTO wallet_operation_jumps
         (application_id, jump_ref, operation_type, jump_token_hash,
          target_host, expires_at, created_by_user_ref)
       VALUES (
           $1, 'woj_runtimewalletjump000000000001', 'WITHDRAWAL',
         'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
         'wallet.smile.test', now() + interval '10 minutes', 'runtime-wallet-user'
       )`,
      [applicationId],
    );
    await expect(
      client.query(
        `INSERT INTO wallet_operation_jumps
           (application_id, jump_ref, operation_type, jump_token_hash,
            target_host, expires_at, created_by_user_ref)
         VALUES (
           $1, 'woj_runtimewalletjump000000000002', 'WITHDRAWAL',
           'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
           'wallet.smile.test', now() + interval '10 minutes', 'runtime-wallet-user'
         )`,
        [applicationId],
      ),
    ).rejects.toThrow(
      /duplicate key|wallet_operation_jumps_jump_token_hash_key/i,
    );
    const projection = await client.query<{
      wallet_status: string;
      available_balance_minor: string;
    }>(
      `SELECT wallet_status, available_balance_minor::text
         FROM lender_wallet_projection_snapshots
        WHERE application_id = $1`,
      [applicationId],
    );
    expect(projection.rows[0]).toEqual({
      wallet_status: "WALLET_AVAILABLE",
      available_balance_minor: "25000",
    });
  });

  it("stores lender collection work items and exception queues for Day 3 repayment UAT", async () => {
    const user = await client.query<{ id: string }>(
      `INSERT INTO users (telegram_user_ref, preferred_language)
       VALUES ('broker-runtime-lender-collection', 'en')
       RETURNING id`,
    );
    const application = await client.query<{ id: string }>(
      `INSERT INTO applications
        (application_no, user_id, requested_amount_minor, currency, tenor_days,
         status, workflow_version)
       VALUES (
         'APP-BROKER-RUNTIME-COLLECTION-001', $1, 25000, 'USD', 30,
         'REPAYMENT_ACTIVE', 'SALARY_LOAN_V2'
       )
       RETURNING id`,
      [user.rows[0]!.id],
    );
    const applicationId = application.rows[0]!.id;
    await client.query(
      `INSERT INTO application_repayment_preferences
        (application_id, workflow_version, selected_repayment_method,
         available_repayment_methods, collection_mode, collection_payee_ref)
       VALUES (
         $1, 'SALARY_LOAN_V2', 'USER_DIRECT_DEBIT',
         ARRAY['USER_DIRECT_DEBIT']::text[],
         'PRINCIPAL_AND_INTEREST', 'runtime-collection-payee'
       )`,
      [applicationId],
    );
    await client.query(
      `INSERT INTO repayment_installments
        (application_id, installment_no, due_date, amount_due_minor,
         principal_due_minor, lender_interest_due_minor, payroll_node_ref)
       VALUES
        ($1, 1, '2026-09-15', 12750, 12500, 250, 'PAYDAY-1'),
        ($1, 2, '2026-09-30', 12750, 12500, 250, 'PAYDAY-2')`,
      [applicationId],
    );

    const workItem = await client.query<{ id: string }>(
      `INSERT INTO lender_collection_work_items
        (application_id, workflow_version, repayment_installment_no,
         selected_repayment_method, source_type, source_reference,
         source_domain, collection_result, reported_amount_minor, currency,
         work_item_status, exception_code, evidence_reference)
       VALUES (
         $1, 'SALARY_LOAN_V2', 1, 'USER_DIRECT_DEBIT',
         'USER_DIRECT_DEBIT_REPORT', 'DD-RUNTIME-EXPIRED-001', 'BROKER',
         'AUTHORIZATION_EXPIRED', 0, 'USD', 'EXCEPTION',
         'AUTHORIZATION_EXPIRED', 'DD-RUNTIME-EXPIRED-001'
       )
       RETURNING id`,
      [applicationId],
    );
    await expect(
      client.query(
        `INSERT INTO lender_collection_work_items
          (application_id, workflow_version, repayment_installment_no,
           selected_repayment_method, source_type, source_reference,
           source_domain, collection_result, reported_amount_minor, currency,
           work_item_status, exception_code, evidence_reference)
         VALUES (
           $1, 'SALARY_LOAN_V2', 1, 'USER_DIRECT_DEBIT',
           'USER_DIRECT_DEBIT_REPORT', 'DD-RUNTIME-EXPIRED-001', 'BROKER',
           'AUTHORIZATION_EXPIRED', 0, 'USD', 'EXCEPTION',
           'AUTHORIZATION_EXPIRED', 'DD-RUNTIME-EXPIRED-001'
         )`,
        [applicationId],
      ),
    ).rejects.toThrow(
      /duplicate key|重复键|lender_collection_work_items_application_id_source_type_sou_key/i,
    );

    const exception = await client.query<{ id: string }>(
      `INSERT INTO lender_collection_exceptions
        (work_item_id, application_id, workflow_version,
         repayment_installment_no, selected_repayment_method, exception_type,
         reason_code, evidence_reference, reported_amount_minor, currency)
       VALUES (
         $1, $2, 'SALARY_LOAN_V2', 1, 'USER_DIRECT_DEBIT',
         'AUTHORIZATION_EXPIRED', 'DIRECT_DEBIT_AUTHORIZATION_EXPIRED',
         'DD-RUNTIME-EXPIRED-001', 0, 'USD'
       )
       RETURNING id`,
      [workItem.rows[0]!.id, applicationId],
    );
    expect(exception.rows[0]?.id).toBeTruthy();
    await client.query(
      `UPDATE lender_collection_exceptions
          SET status = 'RESOLVED',
              resolved_by_user_ref = 'lender-runtime-checker',
              resolution_reason_code = 'ALTERNATE_COLLECTION_RECORDED',
              resolution_evidence_reference = 'EX-RUNTIME-RESOLVED-001',
              resolved_at = now(),
              updated_at = now()
        WHERE id = $1`,
      [exception.rows[0]!.id],
    );
    const resolved = await client.query<{ status: string }>(
      `SELECT status
         FROM lender_collection_exceptions
        WHERE id = $1`,
      [exception.rows[0]!.id],
    );
    expect(resolved.rows[0]?.status).toBe("RESOLVED");
  });
});
