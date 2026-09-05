import { createHash, createHmac, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runDatabaseMigrations } from "../src/database-migrations.js";
import {
  createOutgoingDomainEvent,
  sha256Hex,
  signDomainEventRequest,
  stableJson,
} from "../src/domain-events.js";
import {
  decryptPersonalProfile,
  decryptPersonalValue,
} from "../src/personal-profile.js";
import { hashPassword } from "../src/passwords.js";

// Never infer a destructive test target from a developer's generic
// DATABASE_URL. CI supplies this explicit, disposable PostgreSQL service.
const integrationDatabaseUrl = process.env.PAYEASE_TEST_DATABASE_URL;
const integration = integrationDatabaseUrl ? describe : describe.skip;
const integrationSchema = `broker_app_${randomUUID().replace(/-/g, "")}`;

type BrokerApi = typeof import("../src/server.js");

function signedInitData(
  botToken: string,
  telegramUserId: number,
  queryId: string,
): string {
  const parameters = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: queryId,
    user: JSON.stringify({ id: telegramUserId, first_name: "Integration" }),
  });
  const dataCheckString = [...parameters.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  parameters.set(
    "hash",
    createHmac("sha256", secret).update(dataCheckString).digest("hex"),
  );
  return parameters.toString();
}

function scopedIntegrationDatabaseUrl(): string {
  if (!integrationDatabaseUrl)
    throw new Error("PAYEASE_TEST_DATABASE_URL is required");
  const url = new URL(integrationDatabaseUrl);
  url.searchParams.set("options", `-c search_path=${integrationSchema},public`);
  return url.toString();
}

function signedLenderEventHeaders(
  event: ReturnType<typeof createOutgoingDomainEvent>,
) {
  const timestampMillis = String(Date.now());
  const nonce = `nonce-${randomUUID()}`;
  const secret =
    process.env.PAYEASE_LENDER_EVENT_SHARED_SECRET ??
    `lender_test_only_${"*".repeat(40)}`;
  return {
    "x-payease-algo": "HMAC-SHA256",
    "x-payease-key-id": "lender-hmac-v1",
    "x-payease-timestamp-millis": timestampMillis,
    "x-payease-nonce": nonce,
    "x-payease-signature": signDomainEventRequest({
      method: "POST",
      path: "/v1/local/domain-events/inbox/receive",
      timestampMillis,
      nonce,
      keyId: "lender-hmac-v1",
      bodySha256: sha256Hex(stableJson(event)),
      secret,
    }),
  };
}

function signedWalletJumpExchangeHeaders(payload: Record<string, unknown>) {
  const timestampMillis = String(Date.now());
  const nonce = `wallet-jump-${randomUUID()}`;
  const secret =
    process.env.PAYEASE_LENDER_WALLET_SHARED_SECRET ??
    `lender_wallet_test_only_${"*".repeat(40)}`;
  return {
    "x-payease-wallet-algo": "HMAC-SHA256",
    "x-payease-wallet-key-id": "lender-wallet-hmac-v1",
    "x-payease-wallet-timestamp-millis": timestampMillis,
    "x-payease-wallet-nonce": nonce,
    "x-payease-wallet-signature": signDomainEventRequest({
      method: "POST",
      path: "/v1/local/wallet-operation-jumps/exchange",
      timestampMillis,
      nonce,
      keyId: "lender-wallet-hmac-v1",
      bodySha256: sha256Hex(stableJson(payload)),
      secret,
    }),
  };
}

function multipartPayload(args: {
  fileFieldName: string;
  fileName: string;
  contentType: string;
  content: Buffer;
  fields?: Record<string, string>;
}): Readonly<{ contentType: string; payload: Buffer }> {
  const boundary = `----payease-test-${randomUUID()}`;
  const chunks: Buffer[] = [];
  for (const [name, value] of Object.entries(args.fields ?? {})) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
        "utf8",
      ),
    );
  }
  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${args.fileFieldName}"; filename="${args.fileName}"\r\nContent-Type: ${args.contentType}\r\n\r\n`,
      "utf8",
    ),
  );
  chunks.push(args.content);
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"));
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    payload: Buffer.concat(chunks),
  };
}

let adminFixtureSequence = 0;

async function adminCookieForRole(
  database: Pool,
  roleCode: string,
  domain: "OPS" | "BROKER" | "LENDER" | "EMPLOYER",
): Promise<string> {
  const department = await database.query<{ id: string }>(
    `INSERT INTO departments (domain, code, display_name_zh, display_name_en, display_name_km)
     VALUES ($1, $2, '测试机构', 'Test lender', 'Test lender')
     ON CONFLICT (code) DO UPDATE SET display_name_en = EXCLUDED.display_name_en
     RETURNING id`,
    [domain, `TEST_${domain}`],
  );
  const role = await database.query<{ id: string }>(
    `INSERT INTO roles (domain, code, display_name_zh, display_name_en, display_name_km)
     VALUES ($1, $2, '测试角色', $2, $2)
     ON CONFLICT (code) DO UPDATE SET display_name_en = EXCLUDED.display_name_en
     RETURNING id`,
    [domain, roleCode],
  );
  const fixtureId = ++adminFixtureSequence;
  const loginName = `integration-${roleCode.toLowerCase()}-${fixtureId}`;
  const account = await database.query<{ id: string }>(
    `INSERT INTO admin_accounts (login_name, password_hash, department_id, preferred_language)
     VALUES ($1, 'not-used-in-this-test', $2, 'en')
     RETURNING id`,
    [loginName, department.rows[0]!.id],
  );
  await database.query(
    "INSERT INTO admin_account_roles (account_id, role_id) VALUES ($1, $2)",
    [account.rows[0]!.id, role.rows[0]!.id],
  );
  const token = `integration-session-${roleCode}-${fixtureId}`;
  await database.query(
    `INSERT INTO admin_sessions (token_hash, account_id, expires_at)
     VALUES ($1, $2, now() + interval '1 hour')`,
    [createHash("sha256").update(token).digest("hex"), account.rows[0]!.id],
  );
  return `payease_session=${token}`;
}

async function lenderCreditOfficerCookie(database: Pool): Promise<string> {
  return adminCookieForRole(database, "LENDER_CREDIT_OFFICER", "LENDER");
}

async function lenderComplaintOfficerCookie(database: Pool): Promise<string> {
  return adminCookieForRole(database, "LENDER_COMPLAINT_OFFICER", "LENDER");
}

async function grantEmployerTenantMember(
  database: Pool,
  tenantId: string,
  cookie: string,
): Promise<void> {
  const token = cookie.slice("payease_session=".length);
  const account = await database.query<{ account_id: string }>(
    "SELECT account_id FROM admin_sessions WHERE token_hash = $1",
    [createHash("sha256").update(token).digest("hex")],
  );
  await database.query(
    `INSERT INTO employer_tenant_members (employer_tenant_id, account_id)
     VALUES ($1, $2)`,
    [tenantId, account.rows[0]!.account_id],
  );
}

function day2ApplicationPayload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    preferredLanguage: "en",
    requestedAmount: { amountMinor: "10000", currency: "USD" },
    tenorDays: 30,
    selectedRepaymentMethod: "SMILE_WALLET_AUTHORIZATION",
    authorizationSnapshot: {
      employerVerificationAuthorized: true,
      serviceAgreementAuthorized: true,
      postDisbursementBrokerageAuthorized: true,
    },
    ...overrides,
  };
}

integration("public applicant access", () => {
  let database: Pool;
  let cleanupDatabase: Pool;
  let brokerApi: BrokerApi;

  beforeAll(async () => {
    cleanupDatabase = new Pool({
      connectionString: integrationDatabaseUrl,
      max: 1,
    });
    await cleanupDatabase.query(`CREATE SCHEMA "${integrationSchema}"`);
    database = new Pool({
      connectionString: scopedIntegrationDatabaseUrl(),
      max: 1,
    });
    await runDatabaseMigrations(database);
    // A production restart must not rerun or mutate an applied migration.
    await runDatabaseMigrations(database);
    const appliedMigrations = await database.query<{ filename: string }>(
      "SELECT filename FROM schema_migrations ORDER BY filename",
    );
    expect(appliedMigrations.rows.at(-1)).toEqual({
      filename: "V0047__lender_wallet_operation_result_projection.sql",
    });
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = scopedIntegrationDatabaseUrl();
    process.env.PAYEASE_PII_ENCRYPTION_KEY = Buffer.alloc(32, 4).toString(
      "base64",
    );
    process.env.PAYEASE_IDENTITY_LOOKUP_KEY = Buffer.alloc(32, 6).toString(
      "base64",
    );
    // Lifecycle fixtures mint a server-side test session.  Keep its Bot in the
    // same allowlist that production requests enforce, rather than relying on
    // an untrusted session row that could never exist in production.
    process.env.TELEGRAM_BOTS_JSON = JSON.stringify([
      {
        botId: "444444444",
        botToken: "integration-test-token-not-real-0001",
        enabled: true,
        // This mirrors production deployment: the Bot webhook secret is
        // configured before the API process starts. Do not mutate a process
        // security configuration mid-request test, because that obscures the
        // actual per-Bot webhook contract we need to verify here.
        webhookSecret: "integration_telegram_webhook_secret_001",
      },
    ]);
    brokerApi = await import("../src/server.js");
  });

  afterAll(async () => {
    await brokerApi?.close();
    await database?.end();
    if (cleanupDatabase) {
      await cleanupDatabase.query(
        `DROP SCHEMA IF EXISTS "${integrationSchema}" CASCADE`,
      );
      await cleanupDatabase.end();
    }
  });

  it("exposes separate liveness and PostgreSQL readiness probes with trace IDs", async () => {
    const traceId = "18ec8ed8-0dcd-4f24-b1bc-5e9d31d0467f";
    const live = await brokerApi.app.inject({
      method: "GET",
      url: "/health/live",
      headers: { "x-trace-id": traceId },
    });
    expect(live.statusCode).toBe(200);
    expect(live.headers["x-trace-id"]).toBe(traceId);
    expect(live.headers["x-content-type-options"]).toBe("nosniff");
    expect(live.headers["referrer-policy"]).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(live.headers["permissions-policy"]).toBe(
      "camera=(), microphone=(), geolocation=(), payment=()",
    );
    expect(live.headers["cache-control"]).toBe("no-store");
    expect(live.json()).toEqual({ status: "live", service: "broker-api" });

    const ready = await brokerApi.app.inject({
      method: "GET",
      url: "/health/ready",
    });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({
      status: "ready",
      service: "broker-api",
      storage: "postgresql",
    });
  });

  it("records only a secret-authenticated self-shared Telegram contact", async () => {
    const originalRequireTelegramAuth = process.env.REQUIRE_TELEGRAM_AUTH;
    const originalPhoneVerification =
      process.env.REQUIRE_TELEGRAM_PHONE_VERIFICATION;
    const user = await database.query<{ id: string }>(
      `INSERT INTO users (telegram_user_ref, preferred_language)
       VALUES ('telegram-99112233', 'en') RETURNING id`,
    );
    try {
      const unauthorized = await brokerApi.app.inject({
        method: "POST",
        url: "/v1/local/internal/telegram-bot-updates/444444444",
        payload: {},
      });
      expect(unauthorized.statusCode).toBe(401);

      const accepted = await brokerApi.app.inject({
        method: "POST",
        url: "/v1/local/internal/telegram-bot-updates/444444444",
        headers: {
          "x-telegram-bot-api-secret-token":
            "integration_telegram_webhook_secret_001",
        },
        payload: {
          message: {
            chat: { type: "private" },
            from: { id: 99112233 },
            contact: { user_id: 99112233, phone_number: "+855 12 345 678" },
          },
        },
      });
      expect(accepted.statusCode).toBe(204);
      const stored = await database.query<{
        telegram_phone_encrypted: Buffer;
        telegram_phone_verified_bot_id: string;
      }>(
        `SELECT telegram_phone_encrypted, telegram_phone_verified_bot_id
           FROM users WHERE id = $1`,
        [user.rows[0]!.id],
      );
      expect(
        decryptPersonalValue(stored.rows[0]!.telegram_phone_encrypted),
      ).toBe("+855 12 345 678");
      expect(stored.rows[0]!.telegram_phone_verified_bot_id).toBe("444444444");
      const applicantSessionToken = "telegram-phone-status-session";
      await database.query(
        `INSERT INTO telegram_auth_sessions
          (token_hash, telegram_user_ref, authenticated_bot_id, expires_at, last_seen_at)
         VALUES ($1, 'telegram-99112233', '444444444', now() + interval '15 minutes', now())`,
        [createHash("sha256").update(applicantSessionToken).digest("hex")],
      );
      const status = await brokerApi.app.inject({
        method: "GET",
        url: "/v1/local/public/profile/telegram-phone-verification",
        headers: {
          cookie: `__Host-payease_applicant_session=${applicantSessionToken}`,
        },
      });
      expect(status.statusCode).toBe(200);
      expect(status.json()).toMatchObject({ verified: true, required: false });

      process.env.REQUIRE_TELEGRAM_AUTH = "true";
      process.env.REQUIRE_TELEGRAM_PHONE_VERIFICATION = "true";
      const requiredStatus = await brokerApi.app.inject({
        method: "GET",
        url: "/v1/local/public/profile/telegram-phone-verification",
        headers: {
          cookie: `__Host-payease_applicant_session=${applicantSessionToken}`,
        },
      });
      expect(requiredStatus.json()).toMatchObject({
        verified: true,
        required: true,
      });
      const unverifiedUser = await database.query<{ id: string }>(
        `INSERT INTO users (telegram_user_ref, preferred_language)
         VALUES ('telegram-88776655', 'en') RETURNING id`,
      );
      const unverifiedSessionToken = "telegram-phone-gate-unverified";
      await database.query(
        `INSERT INTO telegram_auth_sessions
          (token_hash, telegram_user_ref, authenticated_bot_id, expires_at, last_seen_at)
         VALUES ($1, 'telegram-88776655', '444444444', now() + interval '15 minutes', now())`,
        [createHash("sha256").update(unverifiedSessionToken).digest("hex")],
      );
      const tenant = await database.query<{ id: string }>(
        `INSERT INTO employer_tenants (external_ref, display_name)
         VALUES ('PHONE_GATE_FACTORY', 'Phone gate factory') RETURNING id`,
      );
      const blockedSubmission = await brokerApi.app.inject({
        method: "POST",
        url: "/v1/local/applications",
        headers: {
          cookie: `__Host-payease_applicant_session=${unverifiedSessionToken}`,
        },
        payload: day2ApplicationPayload({
          employerTenantId: tenant.rows[0]!.id,
          identityDocument: { type: "NATIONAL_ID", number: "ID-88776-655" },
          personalProfile: {
            fullName: "Unverified Phone Applicant",
            phone: "+855 12 345 678",
            employerName: "Phone gate factory",
          },
          personalDataAndPhoneConsent: true,
        }),
      });
      expect(unverifiedUser.rows[0]?.id).toBeTruthy();
      expect(blockedSubmission.statusCode).toBe(422);
      expect(blockedSubmission.json()).toEqual({
        code: "TELEGRAM_PHONE_VERIFICATION_REQUIRED",
      });
      // Keep each scenario independent: this tenant exists only to exercise
      // the required-phone gate and must not appear in the later public
      // active-factory directory assertion.
      await database.query(
        "UPDATE employer_tenants SET is_active = false WHERE id = $1",
        [tenant.rows[0]!.id],
      );

      const forwardedContact = await brokerApi.app.inject({
        method: "POST",
        url: "/v1/local/internal/telegram-bot-updates/444444444",
        headers: {
          "x-telegram-bot-api-secret-token":
            "integration_telegram_webhook_secret_001",
        },
        payload: {
          message: {
            chat: { type: "private" },
            from: { id: 99112233 },
            contact: { user_id: 55555555, phone_number: "+855 99 999 999" },
          },
        },
      });
      expect(forwardedContact.statusCode).toBe(204);
      const afterForwardedContact = await database.query<{
        telegram_phone_encrypted: Buffer;
      }>("SELECT telegram_phone_encrypted FROM users WHERE id = $1", [
        user.rows[0]!.id,
      ]);
      expect(
        decryptPersonalValue(
          afterForwardedContact.rows[0]!.telegram_phone_encrypted,
        ),
      ).toBe("+855 12 345 678");
    } finally {
      if (originalRequireTelegramAuth === undefined)
        delete process.env.REQUIRE_TELEGRAM_AUTH;
      else process.env.REQUIRE_TELEGRAM_AUTH = originalRequireTelegramAuth;
      if (originalPhoneVerification === undefined)
        delete process.env.REQUIRE_TELEGRAM_PHONE_VERIFICATION;
      else
        process.env.REQUIRE_TELEGRAM_PHONE_VERIFICATION =
          originalPhoneVerification;
    }
  });

  it("lists only active factory tenants for an unauthenticated applicant selector", async () => {
    const active = await database.query<{ id: string }>(
      `INSERT INTO employer_tenants (external_ref, display_name, is_active)
       VALUES ('LANHAI_FACTORY_A', 'Lanhai Factory A', true)
       RETURNING id`,
    );
    const archived = await database.query<{ id: string }>(
      `INSERT INTO employer_tenants (external_ref, display_name, is_active)
       VALUES ('LANHAI_FACTORY_ARCHIVE', 'Archived factory', false)
       RETURNING id`,
    );

    const response = await brokerApi.app.inject({
      method: "GET",
      url: "/v1/local/public/employer-tenants",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().tenants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: active.rows[0]!.id,
          displayName: "Lanhai Factory A",
        }),
      ]),
    );
    expect(
      response
        .json()
        .tenants.some(
          (tenant: { id: string }) => tenant.id === archived.rows[0]!.id,
        ),
    ).toBe(false);
  });

  it("does not collect an application from an unauthenticated controlled preview", async () => {
    const originalDeploymentMode = process.env.PAYEASE_DEPLOYMENT_MODE;
    const originalPreviewOptOut =
      process.env.PAYEASE_ALLOW_UNAUTHENTICATED_PREVIEW;
    const originalRequireTelegramAuth = process.env.REQUIRE_TELEGRAM_AUTH;
    const originalNodeEnvironment = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    process.env.PAYEASE_DEPLOYMENT_MODE = "controlled-preview";
    process.env.PAYEASE_ALLOW_UNAUTHENTICATED_PREVIEW = "true";
    process.env.REQUIRE_TELEGRAM_AUTH = "false";
    try {
      const blocked = await brokerApi.app.inject({
        method: "POST",
        url: "/v1/local/applications",
        headers: {
          cookie: "__Host-payease_applicant_csrf=controlled-preview-csrf-token",
          "x-csrf-token": "controlled-preview-csrf-token",
        },
        payload: {},
      });

      expect(blocked.statusCode).toBe(403);
      expect(blocked.json()).toEqual({
        code: "CONTROLLED_PREVIEW_APPLICATIONS_DISABLED",
      });
    } finally {
      if (originalDeploymentMode === undefined)
        delete process.env.PAYEASE_DEPLOYMENT_MODE;
      else process.env.PAYEASE_DEPLOYMENT_MODE = originalDeploymentMode;
      if (originalPreviewOptOut === undefined)
        delete process.env.PAYEASE_ALLOW_UNAUTHENTICATED_PREVIEW;
      else
        process.env.PAYEASE_ALLOW_UNAUTHENTICATED_PREVIEW =
          originalPreviewOptOut;
      if (originalRequireTelegramAuth === undefined)
        delete process.env.REQUIRE_TELEGRAM_AUTH;
      else process.env.REQUIRE_TELEGRAM_AUTH = originalRequireTelegramAuth;
      process.env.NODE_ENV = originalNodeEnvironment;
    }
  });

  it("bootstraps an administrator when the complaint role was pre-seeded by migrations", async () => {
    process.env.ADMIN_BOOTSTRAP_PASSWORD = "bootstrap-secret-not-real";
    const bootstrap = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/auth/bootstrap",
      headers: { "x-bootstrap-password": "bootstrap-secret-not-real" },
      payload: {
        loginName: "initial-ops-admin",
        password: "initial-ops-admin-password",
        preferredLanguage: "en",
      },
    });

    expect(bootstrap.statusCode).toBe(201);
    expect(bootstrap.json()).toEqual({
      loginName: "initial-ops-admin",
      role: "OPS_ADMIN",
    });
    const complaintRole = await database.query<{
      code: string;
      domain: string;
    }>(
      "SELECT code, domain FROM roles WHERE code = 'LENDER_COMPLAINT_OFFICER'",
    );
    expect(complaintRole.rows).toEqual([
      { code: "LENDER_COMPLAINT_OFFICER", domain: "LENDER" },
    ]);
    const defaultKhmerNames = await database.query<{
      code: string;
      display_name_km: string;
    }>(
      `SELECT code, display_name_km FROM roles
        WHERE code IN ('OPS_ADMIN', 'BROKER_OFFICER', 'LENDER_COMPLAINT_OFFICER')
        ORDER BY code`,
    );
    expect(defaultKhmerNames.rows).toEqual([
      { code: "BROKER_OFFICER", display_name_km: "មន្ត្រីត្រួតពិនិត្យឯកសារ" },
      {
        code: "LENDER_COMPLAINT_OFFICER",
        display_name_km: "មន្ត្រីដោះស្រាយបណ្តឹង",
      },
      { code: "OPS_ADMIN", display_name_km: "អ្នកគ្រប់គ្រងវេទិកា" },
    ]);
  });

  it("does not hand a broker-reviewed application to a deactivated factory", async () => {
    const tenant = await database.query<{ id: string }>(
      `INSERT INTO employer_tenants (external_ref, display_name, is_active)
       VALUES ('FROZEN_REVIEW_FACTORY', 'Frozen review factory', false)
       RETURNING id`,
    );
    const created = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/applications",
      payload: day2ApplicationPayload({
        telegramUserRef: "deactivated-factory-review-user",
      }),
    });
    expect(created.statusCode).toBe(201);
    const applicationNo = (created.json() as { applicationNo: string })
      .applicationNo;
    await database.query(
      `UPDATE applications SET employer_tenant_id = $1
        WHERE application_no = $2`,
      [tenant.rows[0]!.id, applicationNo],
    );
    const brokerCookie = await adminCookieForRole(
      database,
      "BROKER_OFFICER",
      "BROKER",
    );

    const review = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/applications/${applicationNo}/broker-review`,
      headers: {
        cookie: brokerCookie,
        "idempotency-key": "deactivated-factory-broker-review-001",
      },
      payload: { decision: "APPROVED", reasonCode: "DOCUMENTS_COMPLETE" },
    });

    expect(review.statusCode).toBe(409);
    expect(review.json()).toEqual({ code: "EMPLOYER_TENANT_UNAVAILABLE" });
    const persisted = await database.query<{ status: string }>(
      "SELECT status FROM applications WHERE application_no = $1",
      [applicationNo],
    );
    expect(persisted.rows[0]?.status).toBe("BROKER_REVIEW");
  });

  it("records NOT_MATCHED from an incorrect factory personnel record", async () => {
    const tenant = await database.query<{ id: string }>(
      `INSERT INTO employer_tenants (external_ref, display_name)
       VALUES ('IDENTITY_MISMATCH_FACTORY', 'Identity mismatch factory')
       RETURNING id`,
    );
    const created = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/applications",
      payload: day2ApplicationPayload({
        telegramUserRef: "identity-mismatch-user",
        employerTenantId: tenant.rows[0]!.id,
        identityDocument: { type: "PASSPORT", number: "P-100 001" },
      }),
    });
    expect(created.statusCode).toBe(201);
    const applicationNo = (created.json() as { applicationNo: string })
      .applicationNo;
    const brokerCookie = await adminCookieForRole(
      database,
      "BROKER_OFFICER",
      "BROKER",
    );
    const brokerApproved = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/applications/${applicationNo}/broker-review`,
      headers: {
        cookie: brokerCookie,
        "idempotency-key": "identity-mismatch-broker-review-001",
      },
      payload: { decision: "APPROVED", reasonCode: "DOCUMENTS_COMPLETE" },
    });
    expect(brokerApproved.statusCode).toBe(200);
    expect(brokerApproved.json()).toMatchObject({
      status: "EMPLOYER_VERIFICATION",
    });

    const hrCookie = await adminCookieForRole(
      database,
      "EMPLOYER_HR",
      "EMPLOYER",
    );
    await grantEmployerTenantMember(database, tenant.rows[0]!.id, hrCookie);
    const mismatched = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/applications/${applicationNo}/employer-identity-match`,
      headers: {
        cookie: hrCookie,
        "idempotency-key": "identity-mismatch-record-001",
      },
      payload: {
        identityDocumentNumber: "P-999 999",
        reasonCode: "FACTORY_PERSONNEL_RECORD_COMPARISON",
      },
    });
    expect(mismatched.statusCode).toBe(200);
    expect(mismatched.json()).toEqual({
      applicationNo,
      identityMatchStatus: "NOT_MATCHED",
    });

    const blockedApproval = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/applications/${applicationNo}/employer-verification`,
      headers: {
        cookie: hrCookie,
        "idempotency-key": "identity-mismatch-employment-approval-001",
      },
      payload: { decision: "APPROVED", reasonCode: "EMPLOYMENT_CONFIRMED" },
    });
    expect(blockedApproval.statusCode).toBe(409);
    expect(blockedApproval.json()).toEqual({
      code: "EMPLOYMENT_IDENTITY_MATCH_REQUIRED",
    });
  });

  it("returns the same generic response for unknown and incorrect admin credentials", async () => {
    const department = await database.query<{ id: string }>(
      `INSERT INTO departments (domain, code, display_name_zh, display_name_en, display_name_km)
       VALUES ('OPS', 'LOGIN_TEST', '登录测试', 'Login test', 'Login test')
       RETURNING id`,
    );
    await database.query(
      `INSERT INTO admin_accounts (login_name, password_hash, department_id, preferred_language)
       VALUES ($1, $2, $3, 'en')`,
      [
        "login-boundary-test",
        await hashPassword("correct-login-password"),
        department.rows[0]!.id,
      ],
    );

    const unknown = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/auth/login",
      payload: {
        loginName: "missing-login-account",
        password: "incorrect-login-password",
      },
    });
    const wrongPassword = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/auth/login",
      payload: {
        loginName: "login-boundary-test",
        password: "incorrect-login-password",
      },
    });

    expect(unknown.statusCode).toBe(401);
    expect(wrongPassword.statusCode).toBe(401);
    expect(unknown.json()).toEqual({ code: "INVALID_CREDENTIALS" });
    expect(wrongPassword.json()).toEqual({ code: "INVALID_CREDENTIALS" });
    expect(unknown.headers["set-cookie"]).toBeUndefined();
    expect(wrongPassword.headers["set-cookie"]).toBeUndefined();

    const loginTraceId = "9a19c1ef-5479-4a7d-9289-e73256624129";
    const valid = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/auth/login",
      headers: { "x-trace-id": loginTraceId },
      payload: {
        loginName: "login-boundary-test",
        password: "correct-login-password",
      },
    });
    expect(valid.statusCode).toBe(200);
    expect(valid.headers["x-trace-id"]).toBe(loginTraceId);
    expect(String(valid.headers["set-cookie"])).toContain("HttpOnly");
    expect(String(valid.headers["set-cookie"])).toContain("Max-Age=1800");
    expect(String(valid.headers["set-cookie"])).toContain(
      "__Host-payease_admin_csrf=",
    );
    const sessionCookie = String(valid.headers["set-cookie"]).split(";")[0]!;
    const storedSession = await database.query<{ expires_soon: boolean }>(
      `SELECT expires_at <= now() + interval '30 minutes 5 seconds' AS expires_soon
         FROM admin_sessions
        WHERE token_hash = $1`,
      [
        createHash("sha256")
          .update(sessionCookie.slice("payease_session=".length))
          .digest("hex"),
      ],
    );
    expect(storedSession.rows).toEqual([{ expires_soon: true }]);

    const languagePreference = await brokerApi.app.inject({
      method: "PATCH",
      url: "/v1/local/auth/me/preferred-language",
      headers: { cookie: sessionCookie },
      payload: { preferredLanguage: "zh-CN" },
    });
    expect(languagePreference.statusCode).toBe(200);
    expect(languagePreference.json()).toEqual({
      loginName: "login-boundary-test",
      preferredLanguage: "zh-CN",
    });
    const persistedIdentity = await brokerApi.app.inject({
      method: "GET",
      url: "/v1/local/auth/me",
      headers: { cookie: sessionCookie },
    });
    expect(persistedIdentity.json()).toMatchObject({
      loginName: "login-boundary-test",
      preferredLanguage: "zh-CN",
    });

    const logout = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/auth/logout",
      headers: { cookie: sessionCookie },
    });
    expect(logout.statusCode).toBe(204);
    expect(String(logout.headers["set-cookie"])).toContain("Max-Age=0");

    const loginAudit = await database.query<{
      event_type: string;
      actor_user_ref: string;
    }>(
      `SELECT event_type, actor_user_ref FROM audit_events
        WHERE entity_type = 'ADMIN_AUTH'
        ORDER BY occurred_at ASC, id ASC`,
    );
    expect(loginAudit.rows).toEqual([
      {
        event_type: "AUTH_LOGIN_FAILURE",
        actor_user_ref: createHash("sha256")
          .update("missing-login-account")
          .digest("hex"),
      },
      {
        event_type: "AUTH_LOGIN_FAILURE",
        actor_user_ref: createHash("sha256")
          .update("login-boundary-test")
          .digest("hex"),
      },
      {
        event_type: "AUTH_LOGIN_SUCCESS",
        actor_user_ref: createHash("sha256")
          .update("login-boundary-test")
          .digest("hex"),
      },
      {
        event_type: "AUTH_LOGOUT",
        actor_user_ref: createHash("sha256")
          .update("login-boundary-test")
          .digest("hex"),
      },
    ]);
    const persistedTrace = await database.query<{ trace_id: string }>(
      `SELECT trace_id FROM audit_events
        WHERE entity_type = 'ADMIN_AUTH' AND event_type = 'AUTH_LOGIN_SUCCESS'
        ORDER BY occurred_at DESC, id DESC LIMIT 1`,
    );
    expect(persistedTrace.rows).toEqual([{ trace_id: loginTraceId }]);
  });

  it("throttles a run of failed administrator logins before another password check", async () => {
    const department = await database.query<{ id: string }>(
      `INSERT INTO departments (domain, code, display_name_zh, display_name_en, display_name_km)
       VALUES ('OPS', 'THROTTLE_TEST', '节流测试', 'Throttle test', 'Throttle test')
       RETURNING id`,
    );
    await database.query(
      `INSERT INTO admin_accounts (login_name, password_hash, department_id, preferred_language)
       VALUES ($1, $2, $3, 'en')`,
      [
        "login-throttle-test",
        await hashPassword("correct-throttle-password"),
        department.rows[0]!.id,
      ],
    );

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failed = await brokerApi.app.inject({
        method: "POST",
        url: "/v1/local/auth/login",
        payload: {
          loginName: "login-throttle-test",
          password: "wrong-throttle-password",
        },
      });
      expect(failed.statusCode).toBe(401);
      expect(failed.json()).toEqual({ code: "INVALID_CREDENTIALS" });
    }

    const limited = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/auth/login",
      payload: {
        loginName: "login-throttle-test",
        password: "correct-throttle-password",
      },
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers["retry-after"]).toBe("900");
    expect(limited.json()).toEqual({ code: "LOGIN_RATE_LIMITED" });
    expect(limited.headers["set-cookie"]).toBeUndefined();
  });

  it("rejects a protected back-office mutation without the double-submit CSRF token", async () => {
    const cookie = await adminCookieForRole(database, "OPS_ADMIN", "OPS");
    const previousNodeEnvironment = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const missingToken = await brokerApi.app.inject({
        method: "POST",
        url: "/v1/local/admin/departments",
        headers: { cookie },
        payload: {
          domain: "OPS",
          code: "CSRF_MISSING",
          displayNameZh: "CSRF 测试",
          displayNameEn: "CSRF test",
          displayNameKm: "CSRF test",
        },
      });
      expect(missingToken.statusCode).toBe(403);
      expect(missingToken.json()).toEqual({ code: "CSRF_TOKEN_INVALID" });

      const csrfToken = "integration-csrf-token";
      const accepted = await brokerApi.app.inject({
        method: "POST",
        url: "/v1/local/admin/departments",
        headers: {
          cookie: `${cookie}; __Host-payease_admin_csrf=${csrfToken}`,
          "x-csrf-token": csrfToken,
        },
        payload: {
          domain: "OPS",
          code: "CSRF_ACCEPTED",
          displayNameZh: "CSRF 测试通过",
          displayNameEn: "CSRF test accepted",
          displayNameKm: "CSRF test accepted",
        },
      });
      expect(accepted.statusCode).toBe(201);
    } finally {
      process.env.NODE_ENV = previousNodeEnvironment;
    }
  });

  it("lets an operations administrator review and revoke a factory account assignment", async () => {
    const opsCookie = await adminCookieForRole(database, "OPS_ADMIN", "OPS");
    const employerCookie = await adminCookieForRole(
      database,
      "EMPLOYER_HR",
      "EMPLOYER",
    );
    const employerMe = await brokerApi.app.inject({
      method: "GET",
      url: "/v1/local/auth/me",
      headers: { cookie: employerCookie },
    });
    const loginName = (employerMe.json() as { loginName: string }).loginName;
    const created = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/admin/employer-tenants",
      headers: { cookie: opsCookie },
      payload: {
        externalRef: "MEMBER_DIRECTORY_FACTORY",
        displayName: "Member directory factory",
      },
    });
    expect(created.statusCode).toBe(201);
    const tenantId = (created.json() as { id: string }).id;
    const granted = await brokerApi.app.inject({
      method: "PUT",
      url: `/v1/local/admin/employer-tenants/${tenantId}/members/${loginName}`,
      headers: { cookie: opsCookie },
    });
    expect(granted.statusCode).toBe(204);

    const members = await brokerApi.app.inject({
      method: "GET",
      url: `/v1/local/admin/employer-tenants/${tenantId}/members`,
      headers: { cookie: opsCookie },
    });
    expect(members.statusCode).toBe(200);
    expect(members.json()).toEqual({
      members: [
        expect.objectContaining({
          loginName,
          roleCodes: ["EMPLOYER_HR"],
        }),
      ],
    });
    const denied = await brokerApi.app.inject({
      method: "GET",
      url: `/v1/local/admin/employer-tenants/${tenantId}/members`,
      headers: { cookie: employerCookie },
    });
    expect(denied.statusCode).toBe(403);

    const deactivated = await brokerApi.app.inject({
      method: "PATCH",
      url: `/v1/local/admin/employer-tenants/${tenantId}/activity`,
      headers: { cookie: opsCookie },
      payload: { isActive: false },
    });
    expect(deactivated.statusCode).toBe(200);
    expect(deactivated.json()).toEqual({ id: tenantId, isActive: false });
    const tenantDirectory = await brokerApi.app.inject({
      method: "GET",
      url: "/v1/local/admin/employer-tenants",
      headers: { cookie: opsCookie },
    });
    expect(tenantDirectory.json()).toEqual(
      expect.objectContaining({
        tenants: expect.arrayContaining([
          expect.objectContaining({ id: tenantId, isActive: false }),
        ]),
      }),
    );

    const revoked = await brokerApi.app.inject({
      method: "DELETE",
      url: `/v1/local/admin/employer-tenants/${tenantId}/members/${loginName}`,
      headers: { cookie: opsCookie },
    });
    expect(revoked.statusCode).toBe(204);
    const afterRevocation = await brokerApi.app.inject({
      method: "GET",
      url: `/v1/local/admin/employer-tenants/${tenantId}/members`,
      headers: { cookie: opsCookie },
    });
    expect(afterRevocation.json()).toEqual({ members: [] });
  });

  it("lets a different platform administrator disable an account and revoke its sessions", async () => {
    const opsCookie = await adminCookieForRole(database, "OPS_ADMIN", "OPS");
    const opsMe = await brokerApi.app.inject({
      method: "GET",
      url: "/v1/local/auth/me",
      headers: { cookie: opsCookie },
    });
    expect(opsMe.statusCode).toBe(200);
    const opsLoginName = (opsMe.json() as { loginName: string }).loginName;
    const targetCookie = await adminCookieForRole(
      database,
      "BROKER_OFFICER",
      "BROKER",
    );
    const targetMe = await brokerApi.app.inject({
      method: "GET",
      url: "/v1/local/auth/me",
      headers: { cookie: targetCookie },
    });
    expect(targetMe.statusCode).toBe(200);
    const targetLoginName = (targetMe.json() as { loginName: string })
      .loginName;

    const disabled = await brokerApi.app.inject({
      method: "PATCH",
      url: `/v1/local/admin/accounts/${targetLoginName}/activity`,
      headers: { cookie: opsCookie },
      payload: { isActive: false },
    });
    expect(disabled.statusCode).toBe(200);
    expect(disabled.json()).toMatchObject({
      loginName: targetLoginName,
      isActive: false,
      revokedSessions: 1,
    });
    const disabledSession = await brokerApi.app.inject({
      method: "GET",
      url: "/v1/local/auth/me",
      headers: { cookie: targetCookie },
    });
    expect(disabledSession.statusCode).toBe(401);

    const selfDisable = await brokerApi.app.inject({
      method: "PATCH",
      url: `/v1/local/admin/accounts/${opsLoginName}/activity`,
      headers: { cookie: opsCookie },
      payload: { isActive: false },
    });
    expect(selfDisable.statusCode).toBe(409);
    expect(selfDisable.json()).toEqual({
      code: "ADMIN_SELF_DEACTIVATION_BLOCKED",
    });
    const audit = await database.query<{
      event_type: string;
      entity_type: string;
    }>(
      `SELECT event_type, entity_type FROM audit_events
        WHERE entity_type = 'ADMIN_ACCOUNT' ORDER BY occurred_at DESC, id DESC LIMIT 1`,
    );
    expect(audit.rows[0]).toEqual({
      event_type: "ADMIN_ACCOUNT_DEACTIVATED",
      entity_type: "ADMIN_ACCOUNT",
    });
  });

  it("rejects cross-domain role assignments while creating a back-office account", async () => {
    const opsCookie = await adminCookieForRole(database, "OPS_ADMIN", "OPS");
    // The fixtures create a real LENDER role and a separate BROKER department.
    // An operations administrator must never combine them in one account.
    await adminCookieForRole(database, "LENDER_CREDIT_OFFICER", "LENDER");
    await adminCookieForRole(database, "BROKER_OFFICER", "BROKER");
    const created = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/admin/accounts",
      headers: { cookie: opsCookie },
      payload: {
        loginName: "cross-domain-role-test",
        password: "cross-domain-password-123",
        departmentCode: "TEST_BROKER",
        roleCodes: ["LENDER_CREDIT_OFFICER"],
        preferredLanguage: "en",
      },
    });
    expect(created.statusCode).toBe(422);
    expect(created.json()).toEqual({ code: "ROLE_DOMAIN_MISMATCH" });
    const account = await database.query(
      "SELECT 1 FROM admin_accounts WHERE login_name = 'cross-domain-role-test'",
    );
    expect(account.rowCount).toBe(0);
  });

  it("replaces a different account's same-domain roles and revokes its sessions", async () => {
    const opsCookie = await adminCookieForRole(database, "OPS_ADMIN", "OPS");
    const opsMe = await brokerApi.app.inject({
      method: "GET",
      url: "/v1/local/auth/me",
      headers: { cookie: opsCookie },
    });
    const opsLoginName = (opsMe.json() as { loginName: string }).loginName;
    const targetCookie = await adminCookieForRole(
      database,
      "BROKER_OFFICER",
      "BROKER",
    );
    const targetMe = await brokerApi.app.inject({
      method: "GET",
      url: "/v1/local/auth/me",
      headers: { cookie: targetCookie },
    });
    const targetLoginName = (targetMe.json() as { loginName: string })
      .loginName;
    await adminCookieForRole(database, "BROKER_REVIEWER", "BROKER");

    const changed = await brokerApi.app.inject({
      method: "PUT",
      url: `/v1/local/admin/accounts/${targetLoginName}/roles`,
      headers: { cookie: opsCookie },
      payload: { roleCodes: ["BROKER_REVIEWER"] },
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.json()).toMatchObject({
      loginName: targetLoginName,
      roleCodes: ["BROKER_REVIEWER"],
      revokedSessions: 1,
    });
    const oldSession = await brokerApi.app.inject({
      method: "GET",
      url: "/v1/local/auth/me",
      headers: { cookie: targetCookie },
    });
    expect(oldSession.statusCode).toBe(401);
    const assignedRoles = await database.query<{ code: string }>(
      `SELECT r.code FROM admin_account_roles ar JOIN roles r ON r.id = ar.role_id
        JOIN admin_accounts a ON a.id = ar.account_id
       WHERE a.login_name = $1`,
      [targetLoginName],
    );
    expect(assignedRoles.rows).toEqual([{ code: "BROKER_REVIEWER" }]);
    const selfChange = await brokerApi.app.inject({
      method: "PUT",
      url: `/v1/local/admin/accounts/${opsLoginName}/roles`,
      headers: { cookie: opsCookie },
      payload: { roleCodes: ["OPS_ADMIN"] },
    });
    expect(selfChange.statusCode).toBe(409);
    expect(selfChange.json()).toEqual({
      code: "ADMIN_SELF_ROLE_CHANGE_BLOCKED",
    });
  });

  it("returns full loan and repayment details only to the application's opaque cookie", async () => {
    const created = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/applications",
      payload: day2ApplicationPayload({
        telegramUserRef: "integration-user-001",
        requestedAmount: { amountMinor: "25000", currency: "USD" },
        tenorDays: 30,
      }),
    });
    expect(created.statusCode).toBe(201);
    const applicationNo = (created.json() as { applicationNo: string })
      .applicationNo;
    const cookie = String(created.headers["set-cookie"]).split(";")[0]!;
    const application = await database.query<{ id: string }>(
      "SELECT id FROM applications WHERE application_no = $1",
      [applicationNo],
    );
    const applicationId = application.rows[0]!.id;
    await expect(
      database.query(
        "UPDATE applications SET status = 'SETTLED' WHERE id = $1",
        [applicationId],
      ),
    ).rejects.toThrow("invalid application status transition");
    await database.query(
      `INSERT INTO loan_terms
        (application_id, approved_amount_minor, service_fee_minor, total_repayable_minor, installment_count, first_due_date, created_by_user_ref)
       VALUES ($1, 25000, 500, 25500, 2, '2026-09-15', 'integration-lender')`,
      [applicationId],
    );
    await database.query(
      `INSERT INTO application_v2_quote_snapshots
        (application_id, workflow_version, principal_amount_minor,
         actual_disbursement_amount_minor, lender_interest_minor,
         total_repayment_amount_minor,
         brokerage_remuneration_receivable_minor, product_rule_version,
         brokerage_remuneration_rule_version, lender_interest_rule_version,
         installment_count, first_due_date, created_by_user_ref)
       VALUES (
         $1, 'SALARY_LOAN_V2', 25000, 25000, 500, 25500, 3500,
         'PRODUCT-RULE-V2-20260821', 'BROKERAGE-RULE-V2-20260821',
         'LENDER-INTEREST-V2-20260821', 2, '2026-09-15', 'integration-lender'
       )`,
      [applicationId],
    );
    await database.query(
      "UPDATE applications SET approved_amount_minor = 25000 WHERE id = $1",
      [applicationId],
    );
    await database.query(
      `INSERT INTO repayment_installments
        (application_id, installment_no, due_date, amount_due_minor,
         principal_due_minor, lender_interest_due_minor, payroll_node_ref)
       VALUES ($1, 1, '2026-09-15', 12750, 12500, 250, 'PAYDAY-1'),
              ($1, 2, '2026-10-15', 12750, 12500, 250, 'PAYDAY-2')`,
      [applicationId],
    );
    await database.query(
      `UPDATE repayment_installments
       SET status = 'PAID', amount_paid_minor = amount_due_minor, paid_at = now()
       WHERE application_id = $1 AND installment_no = 1`,
      [applicationId],
    );

    const denied = await brokerApi.app.inject({
      method: "GET",
      url: `/v1/local/public/applications/${applicationNo}`,
    });
    expect(denied.statusCode).toBe(401);

    const publicView = await brokerApi.app.inject({
      method: "GET",
      url: `/v1/local/public/applications/${applicationNo}`,
      headers: { cookie },
    });
    expect(publicView.statusCode).toBe(200);
    expect(publicView.json()).toMatchObject({
      application: {
        applicationNo,
        requestedAmountMinor: "25000",
        approvedAmountMinor: "25000",
      },
      workflow: {
        workflowVersion: "SALARY_LOAN_V2",
        selectedRepaymentMethod: "SMILE_WALLET_AUTHORIZATION",
        availableRepaymentMethods: ["SMILE_WALLET_AUTHORIZATION"],
        collectionScope: "PRINCIPAL_AND_INTEREST",
        employerVerificationAuthorized: true,
        serviceAgreementAuthorized: true,
        postDisbursementBrokerageAuthorized: true,
      },
      terms: null,
      quote: {
        principalAmountMinor: "25000",
        actualDisbursementAmountMinor: "25000",
        lenderInterestMinor: "500",
        totalRepaymentAmountMinor: "25500",
        brokerageRemunerationReceivableMinor: "3500",
        installmentCount: 2,
        firstDueDate: "2026-09-15",
        productRuleVersion: "PRODUCT-RULE-V2-20260821",
        brokerageRemunerationRuleVersion: "BROKERAGE-RULE-V2-20260821",
        lenderInterestRuleVersion: "LENDER-INTEREST-V2-20260821",
        repaymentGraceDays: 3,
      },
      repayment: {
        periodCount: 2,
        paidPeriods: 1,
        unpaidPeriods: 1,
        overduePeriods: 0,
        outstandingMinor: "12750",
        overdueOutstandingMinor: "0",
        nextInstallment: { installmentNo: 2, amountDueMinor: "12750" },
      },
    });

    await expect(
      database.query(
        `UPDATE repayment_installments SET amount_paid_minor = 1
         WHERE application_id = $1 AND installment_no = 1`,
        [applicationId],
      ),
    ).rejects.toThrow("immutable");

    await expect(
      database.query(
        `UPDATE repayment_installments
            SET amount_paid_minor = amount_due_minor + 1
          WHERE application_id = $1 AND installment_no = 2`,
        [applicationId],
      ),
    ).rejects.toThrow("repayment_installments_paid_amount_integrity");

    const otherUser = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/applications",
      payload: day2ApplicationPayload({
        telegramUserRef: "integration-user-002",
        requestedAmount: { amountMinor: "1000", currency: "USD" },
        tenorDays: 15,
      }),
    });
    const otherCookie = String(otherUser.headers["set-cookie"]).split(";")[0]!;
    const otherUserView = await brokerApi.app.inject({
      method: "GET",
      url: `/v1/local/public/applications/${applicationNo}`,
      headers: { cookie: otherCookie },
    });
    expect(otherUserView.statusCode).toBe(404);
  });

  it("stores submitted personal profile values as separate ciphertext", async () => {
    const profile = {
      fullName: "Integration Applicant",
      phone: "+85512345678",
      employerName: "Pilot Factory",
    };
    const missingConsent = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/applications",
      payload: day2ApplicationPayload({
        telegramUserRef: "integration-user-missing-consent",
        personalProfile: profile,
      }),
    });
    expect(missingConsent.statusCode).toBe(400);
    expect(missingConsent.json()).toMatchObject({
      code: "VALIDATION_ERROR",
      fields: ["personalDataAndPhoneConsent"],
    });

    const tenant = await database.query<{ id: string }>(
      `INSERT INTO employer_tenants (external_ref, display_name)
       VALUES ('PROFILE_FACTORY', 'Profile factory') RETURNING id`,
    );
    const identityDocument = { type: "PASSPORT" as const, number: "P-123 456" };
    const created = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/applications",
      payload: day2ApplicationPayload({
        telegramUserRef: "integration-user-private-profile",
        employerTenantId: tenant.rows[0]!.id,
        identityDocument,
        personalProfile: profile,
        personalDataAndPhoneConsent: true,
      }),
    });
    expect(created.statusCode).toBe(201);
    const applicationNo = (created.json() as { applicationNo: string })
      .applicationNo;
    const stored = await database.query<{
      full_name_encrypted: Buffer;
      phone_encrypted: Buffer;
      employer_name_encrypted: Buffer;
      personal_data_consent_version: string;
      personal_data_key_version: string;
      phone_consent_version: string;
      phone_consented_at: Date;
      identity_document_type: string;
      identity_document_number_encrypted: Buffer;
      identity_document_lookup_hash: string;
      employer_tenant_id: string;
    }>(
      `SELECT u.full_name_encrypted, u.phone_encrypted, u.employer_name_encrypted,
              u.personal_data_consent_version, u.personal_data_key_version
              , u.phone_consent_version, u.phone_consented_at,
              u.identity_document_type, u.identity_document_number_encrypted,
              u.identity_document_lookup_hash, p.employer_tenant_id
         FROM users u
         JOIN applications p ON p.user_id = u.id
        WHERE p.application_no = $1`,
      [applicationNo],
    );
    const row = stored.rows[0]!;
    expect(row.full_name_encrypted.toString("utf8")).not.toContain(
      profile.fullName,
    );
    expect(row.phone_encrypted.toString("utf8")).not.toContain(profile.phone);
    expect(row.employer_name_encrypted.toString("utf8")).not.toContain(
      profile.employerName,
    );
    expect(
      row.identity_document_number_encrypted.toString("utf8"),
    ).not.toContain(identityDocument.number);
    expect(row.identity_document_type).toBe("PASSPORT");
    expect(row.identity_document_lookup_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.employer_tenant_id).toBe(tenant.rows[0]!.id);
    expect(
      decryptPersonalProfile({
        fullName: row.full_name_encrypted,
        phone: row.phone_encrypted,
        employerName: row.employer_name_encrypted,
      }),
    ).toEqual(profile);
    expect(row.personal_data_consent_version).toBe("PAYEASE-PERSONAL-DATA-v1");
    expect(row.personal_data_key_version).toBe("v1");
    expect(row.phone_consent_version).toBe("PAYEASE-PERSONAL-DATA-v1");
    expect(row.phone_consented_at).toBeInstanceOf(Date);

    const submittedAudit = await database.query<{ payload_hash: string }>(
      `SELECT payload_hash FROM audit_events
        WHERE entity_id = (SELECT id FROM applications WHERE application_no = $1)
          AND event_type = 'APPLICATION_SUBMITTED'`,
      [applicationNo],
    );
    const expectedAuditPayload = {
      applicationNo,
      amountMinor: "10000",
      currency: "USD",
      tenorDays: 30,
      employerTenantSelected: true,
      workflowVersion: "SALARY_LOAN_V2",
      selectedRepaymentMethod: "SMILE_WALLET_AUTHORIZATION",
      availableRepaymentMethods: ["SMILE_WALLET_AUTHORIZATION"],
      collectionScope: "PRINCIPAL_AND_INTEREST",
      identityDocumentProvided: true,
      personalDataAndPhoneConsent: true,
      personalDataConsentVersion: "PAYEASE-PERSONAL-DATA-v1",
      personalDataConsentLanguage: "en",
      authorizationSnapshot: {
        employerVerificationAuthorized: true,
        serviceAgreementAuthorized: true,
        postDisbursementBrokerageAuthorized: true,
      },
    };
    expect(submittedAudit.rows[0]!.payload_hash).toBe(
      createHash("sha256")
        .update(JSON.stringify(expectedAuditPayload), "utf8")
        .digest("hex"),
    );

    const brokerProfile = await brokerApi.app.inject({
      method: "GET",
      url: `/v1/local/applications/${applicationNo}/personal-profile`,
      headers: {
        cookie: await adminCookieForRole(database, "BROKER_OFFICER", "BROKER"),
      },
    });
    expect(brokerProfile.statusCode).toBe(200);
    expect(brokerProfile.json()).toMatchObject({ applicationNo, profile });

    const lenderProfile = await brokerApi.app.inject({
      method: "GET",
      url: `/v1/local/applications/${applicationNo}/personal-profile`,
      headers: { cookie: await lenderCreditOfficerCookie(database) },
    });
    expect(lenderProfile.statusCode).toBe(403);
    const audit = await database.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM audit_events
        WHERE entity_id = (
          SELECT id FROM applications WHERE application_no = $1
        ) AND event_type = 'PERSONAL_PROFILE_VIEWED'`,
      [applicationNo],
    );
    expect(audit.rows[0]!.count).toBe("1");
  });

  it("blocks a second Telegram account from opening an active application with the same identity document", async () => {
    const tenant = await database.query<{ id: string }>(
      `INSERT INTO employer_tenants (external_ref, display_name)
       VALUES ('IDENTITY_COLLISION_FACTORY', 'Identity collision factory')
       RETURNING id`,
    );
    const first = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/applications",
      payload: day2ApplicationPayload({
        telegramUserRef: "identity-collision-first-account",
        employerTenantId: tenant.rows[0]!.id,
        identityDocument: { type: "PASSPORT", number: "P-77 001" },
      }),
    });
    expect(first.statusCode).toBe(201);
    const firstApplicationNo = (first.json() as { applicationNo: string })
      .applicationNo;

    const second = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/applications",
      payload: day2ApplicationPayload({
        telegramUserRef: "identity-collision-second-account",
        employerTenantId: tenant.rows[0]!.id,
        // Normalization must make spacing and case irrelevant to matching.
        identityDocument: { type: "PASSPORT", number: "p-77001" },
      }),
    });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({
      code: "IDENTITY_DOCUMENT_ACTIVE_APPLICATION_EXISTS",
    });
    expect(JSON.stringify(second.json())).not.toContain(firstApplicationNo);
    expect(JSON.stringify(second.json())).not.toContain("BROKER_REVIEW");
    const rolledBackUser = await database.query(
      `SELECT 1 FROM users
        WHERE telegram_user_ref = 'identity-collision-second-account'`,
    );
    expect(rolledBackUser.rowCount).toBe(0);
  });

  it("allows the same broker account to decide again after a returned supplement request", async () => {
    const created = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/applications",
      payload: day2ApplicationPayload({
        telegramUserRef: "integration-user-supplement",
      }),
    });
    expect(created.statusCode).toBe(201);
    const applicationNo = (created.json() as { applicationNo: string })
      .applicationNo;
    const telegramApplicantToken = "integration-supplement-telegram-session";
    await database.query(
      `INSERT INTO telegram_auth_sessions
        (token_hash, telegram_user_ref, authenticated_bot_id, expires_at, last_seen_at)
       VALUES ($1, 'integration-user-supplement', '444444444', now() + interval '15 minutes', now())`,
      [createHash("sha256").update(telegramApplicantToken).digest("hex")],
    );
    const telegramApplicantCookie = `__Host-payease_applicant_session=${telegramApplicantToken}`;
    const brokerCookie = await adminCookieForRole(
      database,
      "BROKER_OFFICER",
      "BROKER",
    );
    const missingApprovalIdempotencyKey = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/applications/${applicationNo}/broker-review`,
      headers: { cookie: brokerCookie },
      payload: { decision: "RETURNED", reasonCode: "SUPPLEMENT_REQUIRED" },
    });
    expect(missingApprovalIdempotencyKey.statusCode).toBe(400);
    expect(missingApprovalIdempotencyKey.json()).toEqual({
      code: "IDEMPOTENCY_KEY_REQUIRED",
    });
    const returned = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/applications/${applicationNo}/broker-review`,
      headers: {
        cookie: brokerCookie,
        "idempotency-key": "broker-return-supplement-001",
      },
      payload: { decision: "RETURNED", reasonCode: "SUPPLEMENT_REQUIRED" },
    });
    expect(returned.statusCode).toBe(200);
    expect(returned.json()).toMatchObject({
      applicationNo,
      status: "BROKER_REVIEW",
      decision: "RETURNED",
    });
    const repeatedReturn = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/applications/${applicationNo}/broker-review`,
      headers: {
        cookie: brokerCookie,
        "idempotency-key": "broker-return-supplement-001",
      },
      payload: { decision: "RETURNED", reasonCode: "SUPPLEMENT_REQUIRED" },
    });
    expect(repeatedReturn.statusCode).toBe(200);
    expect(repeatedReturn.json()).toEqual(returned.json());
    const reusedReturnKey = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/applications/${applicationNo}/broker-review`,
      headers: {
        cookie: brokerCookie,
        "idempotency-key": "broker-return-supplement-001",
      },
      payload: { decision: "APPROVED", reasonCode: "SUPPLEMENT_REQUIRED" },
    });
    expect(reusedReturnKey.statusCode).toBe(409);
    expect(reusedReturnKey.json()).toEqual({ code: "IDEMPOTENCY_KEY_REUSED" });
    const applicantView = await brokerApi.app.inject({
      method: "GET",
      url: `/v1/local/public/applications/${applicationNo}`,
      headers: { cookie: telegramApplicantCookie },
    });
    expect(applicantView.statusCode).toBe(200);
    expect(applicantView.json()).toMatchObject({
      application: { supplementRequested: true },
    });
    const submittedSupplement = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/public/applications/${applicationNo}/supplement-responses`,
      headers: { cookie: telegramApplicantCookie },
      payload: {
        message:
          "I have corrected the information requested by the broker review team.",
      },
    });
    expect(submittedSupplement.statusCode).toBe(201);
    const responseNo = (submittedSupplement.json() as { responseNo: string })
      .responseNo;
    const encryptedSupplement = await database.query<{
      message_encrypted: Buffer;
      message_key_version: string;
    }>(
      "SELECT message_encrypted, message_key_version FROM applicant_supplement_responses WHERE response_no = $1",
      [responseNo],
    );
    expect(
      encryptedSupplement.rows[0]!.message_encrypted.toString("utf8"),
    ).not.toContain("corrected the information");
    expect(
      decryptPersonalValue(encryptedSupplement.rows[0]!.message_encrypted),
    ).toBe(
      "I have corrected the information requested by the broker review team.",
    );
    expect(encryptedSupplement.rows[0]!.message_key_version).toBe("v1");
    const applicantSupplements = await brokerApi.app.inject({
      method: "GET",
      url: `/v1/local/public/applications/${applicationNo}/supplement-responses`,
      headers: { cookie: telegramApplicantCookie },
    });
    expect(applicantSupplements.statusCode).toBe(200);
    expect(applicantSupplements.json()).toMatchObject({
      responses: [{ responseNo }],
    });
    expect(JSON.stringify(applicantSupplements.json())).not.toContain(
      "corrected the information",
    );
    const brokerSupplements = await brokerApi.app.inject({
      method: "GET",
      url: `/v1/local/applications/${applicationNo}/supplement-responses`,
      headers: { cookie: brokerCookie },
    });
    expect(brokerSupplements.statusCode).toBe(200);
    expect(brokerSupplements.json()).toMatchObject({
      responses: [{ responseNo, applicantLanguage: "en" }],
    });
    const brokerSupplementDetail = await brokerApi.app.inject({
      method: "GET",
      url: `/v1/local/supplement-responses/${responseNo}`,
      headers: { cookie: brokerCookie },
    });
    expect(brokerSupplementDetail.statusCode).toBe(200);
    expect(brokerSupplementDetail.json()).toMatchObject({
      responseNo,
      applicationNo,
      message:
        "I have corrected the information requested by the broker review team.",
    });
    const approved = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/applications/${applicationNo}/broker-review`,
      headers: {
        cookie: brokerCookie,
        "idempotency-key": "broker-approve-supplement-001",
      },
      payload: { decision: "APPROVED", reasonCode: "SUPPLEMENT_RECEIVED" },
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json()).toMatchObject({
      applicationNo,
      status: "EMPLOYER_VERIFICATION",
      decision: "APPROVED",
    });
    const reviewRounds = await database.query<{
      decision: string;
      review_round: number;
    }>(
      `SELECT decision, review_round FROM approval_events
        WHERE application_id = (SELECT id FROM applications WHERE application_no = $1)
          AND stage = 'BROKER_REVIEW'
        ORDER BY review_round`,
      [applicationNo],
    );
    expect(reviewRounds.rows).toEqual([
      { decision: "RETURNED", review_round: 1 },
      { decision: "APPROVED", review_round: 2 },
    ]);
  });

  it("restores the same user's applications after authenticating through a second trusted bot", async () => {
    const originalBotConfig = process.env.TELEGRAM_BOTS_JSON;
    const originalRequireTelegramAuth = process.env.REQUIRE_TELEGRAM_AUTH;
    const originalNodeEnvironment = process.env.NODE_ENV;
    const originalApplicantOrigins =
      process.env.PAYEASE_APPLICANT_ALLOWED_ORIGINS;
    const botA = {
      botId: "123456789",
      botToken: "123456789:integration-bot-token-alpha-123456",
      entryUrl: "https://t.me/payease_primary?startapp=apply",
    };
    const botB = {
      botId: "987654321",
      botToken: "987654321:integration-bot-token-bravo-123456",
      entryUrl: "https://t.me/payease_recovery?startapp=apply",
    };
    const botC = {
      botId: "564738291",
      botToken: "564738291:integration-bot-token-charlie-123456",
      entryUrl: "https://t.me/payease_contingency?startapp=apply",
    };
    process.env.REQUIRE_TELEGRAM_AUTH = "true";
    try {
      process.env.TELEGRAM_BOTS_JSON = "[]";
      const missingBotConfig = await brokerApi.app.inject({
        method: "POST",
        url: "/v1/local/public/telegram-sessions",
        payload: { initData: "x".repeat(32) },
      });
      expect(missingBotConfig.statusCode).toBe(503);
      expect(missingBotConfig.json()).toEqual({
        code: "TELEGRAM_AUTH_NOT_CONFIGURED",
      });
      const unavailableRecoveryEntryPoints = await brokerApi.app.inject({
        method: "GET",
        url: "/v1/local/public/telegram-entrypoints",
      });
      expect(unavailableRecoveryEntryPoints.statusCode).toBe(503);
      expect(unavailableRecoveryEntryPoints.json()).toEqual({
        code: "TELEGRAM_RECOVERY_UNAVAILABLE",
      });

      // A deployment configuration error may be logged for operators, but its
      // parser detail must never reach a public client response.
      process.env.TELEGRAM_BOTS_JSON = "{not-valid-json";
      const malformedConfig = await brokerApi.app.inject({
        method: "POST",
        url: "/v1/local/public/telegram-sessions",
        payload: { initData: "x".repeat(32) },
      });
      expect(malformedConfig.statusCode).toBe(500);
      expect(malformedConfig.json()).toMatchObject({
        code: "INTERNAL_ERROR",
        request_id: expect.stringMatching(
          /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i,
        ),
      });

      process.env.TELEGRAM_BOTS_JSON = JSON.stringify([botA, botB]);
      const publicRecoveryEntryPoints = await brokerApi.app.inject({
        method: "GET",
        url: "/v1/local/public/telegram-entrypoints",
      });
      expect(publicRecoveryEntryPoints.statusCode).toBe(200);
      expect(publicRecoveryEntryPoints.json()).toEqual({
        entrypoints: [botA.entryUrl, botB.entryUrl],
      });
      const personalProfile = {
        fullName: "Authenticated Applicant",
        phone: "+85512345678",
        employerName: "Pilot Factory",
      };
      const authenticatedTenant = await database.query<{ id: string }>(
        `INSERT INTO employer_tenants (external_ref, display_name)
         VALUES ('AUTHENTICATED_FACTORY', 'Authenticated factory')
         RETURNING id`,
      );
      const unauthenticatedList = await brokerApi.app.inject({
        method: "GET",
        url: "/v1/local/public/applications",
      });
      expect(unauthenticatedList.statusCode).toBe(401);
      const unauthenticatedLanguageUpdate = await brokerApi.app.inject({
        method: "PUT",
        url: "/v1/local/public/profile/preferred-language",
        payload: { preferredLanguage: "en" },
      });
      expect(unauthenticatedLanguageUpdate.statusCode).toBe(401);

      const firstLogin = await brokerApi.app.inject({
        method: "POST",
        url: "/v1/local/public/telegram-sessions",
        payload: {
          initData: signedInitData(botA.botToken, 42424242, "bot-a-session"),
        },
      });
      expect(firstLogin.statusCode).toBe(201);
      expect(String(firstLogin.headers["set-cookie"])).toContain(
        "__Host-payease_applicant_session=",
      );
      expect(String(firstLogin.headers["set-cookie"])).toContain(
        "payease_applicant_session=",
      );
      expect(String(firstLogin.headers["set-cookie"])).toContain(
        "Path=/api/v1/local/",
      );
      expect(String(firstLogin.headers["set-cookie"])).toContain("Max-Age=900");
      expect(String(firstLogin.headers["set-cookie"])).toContain(
        "SameSite=None",
      );
      expect(String(firstLogin.headers["set-cookie"])).toContain("Partitioned");
      const firstCookie = String(firstLogin.headers["set-cookie"]).split(
        ";",
      )[0]!;
      const applicantSessionTtl = await database.query<{
        expires_soon: boolean;
        user_agent_bound: boolean;
      }>(
        `SELECT expires_at <= now() + interval '15 minutes 5 seconds' AS expires_soon,
                client_user_agent_hash IS NOT NULL AS user_agent_bound
           FROM telegram_auth_sessions
          WHERE token_hash = $1`,
        [createHash("sha256").update(firstCookie.split("=")[1]!).digest("hex")],
      );
      expect(applicantSessionTtl.rows[0]?.expires_soon).toBe(true);
      expect(applicantSessionTtl.rows[0]?.user_agent_bound).toBe(true);
      const browserContextMismatch = await brokerApi.app.inject({
        method: "GET",
        url: "/v1/local/public/applications",
        headers: {
          cookie: firstCookie,
          "user-agent": "payease-integration-untrusted-browser",
        },
      });
      expect(browserContextMismatch.statusCode).toBe(401);
      const replayGuard = await database.query<{ retained: boolean }>(
        `SELECT expires_at > now() + interval '119 minutes' AS retained
           FROM telegram_initdata_replay_guards
          WHERE authenticated_bot_id = $1`,
        [botA.botId],
      );
      expect(replayGuard.rows[0]?.retained).toBe(true);

      await database.query(
        `UPDATE telegram_auth_sessions
            SET last_seen_at = now() - interval '4 minutes'
          WHERE token_hash = $1`,
        [createHash("sha256").update(firstCookie.split("=")[1]!).digest("hex")],
      );
      const activeApplicantKeepalive = await brokerApi.app.inject({
        method: "POST",
        url: "/v1/local/public/telegram-sessions/keepalive",
        headers: { cookie: firstCookie },
      });
      expect(activeApplicantKeepalive.statusCode).toBe(204);
      const refreshedApplicantSession = await database.query<{
        refreshed: boolean;
      }>(
        `SELECT last_seen_at > now() - interval '5 seconds' AS refreshed
           FROM telegram_auth_sessions
          WHERE token_hash = $1`,
        [createHash("sha256").update(firstCookie.split("=")[1]!).digest("hex")],
      );
      expect(refreshedApplicantSession.rows[0]?.refreshed).toBe(true);

      const missingProfile = await brokerApi.app.inject({
        method: "POST",
        url: "/v1/local/applications",
        headers: { cookie: firstCookie },
        payload: day2ApplicationPayload(),
      });
      expect(missingProfile.statusCode).toBe(422);
      expect(missingProfile.json()).toEqual({
        code: "PERSONAL_PROFILE_REQUIRED",
      });

      // A factory is the employer tenant boundary.  An authenticated
      // applicant cannot create an unassigned application by bypassing the
      // Mini App's factory selector.
      const missingFactory = await brokerApi.app.inject({
        method: "POST",
        url: "/v1/local/applications",
        headers: { cookie: firstCookie },
        payload: day2ApplicationPayload({
          identityDocument: { type: "NATIONAL_ID", number: "ID-2026-0001" },
          personalProfile,
          personalDataAndPhoneConsent: true,
        }),
      });
      expect(missingFactory.statusCode).toBe(422);
      expect(missingFactory.json()).toEqual({
        code: "EMPLOYER_TENANT_REQUIRED",
      });

      const created = await brokerApi.app.inject({
        method: "POST",
        url: "/v1/local/applications",
        headers: { cookie: firstCookie },
        payload: day2ApplicationPayload({
          telegramUserRef: "spoofed-user-ref-is-ignored",
          employerTenantId: authenticatedTenant.rows[0]!.id,
          identityDocument: { type: "NATIONAL_ID", number: "ID-2026-0001" },
          personalProfile,
          personalDataAndPhoneConsent: true,
        }),
      });
      expect(created.statusCode).toBe(201);
      const applicationNo = (created.json() as { applicationNo: string })
        .applicationNo;
      const applicationRecord = await database.query<{ id: string }>(
        "SELECT id FROM applications WHERE application_no = $1",
        [applicationNo],
      );
      const applicationId = applicationRecord.rows[0]!.id;
      // Production authentication must not leave a long-lived opaque
      // application cookie that could outlive a disabled Bot session.
      expect(created.headers["set-cookie"]).toBeUndefined();
      const legacyOpaqueToken = "legacy-preview-token-must-not-authorize";
      await database.query(
        `UPDATE applications SET applicant_access_token_hash = $1
          WHERE application_no = $2`,
        [
          createHash("sha256").update(legacyOpaqueToken).digest("hex"),
          applicationNo,
        ],
      );
      const legacyOpaqueAccess = await brokerApi.app.inject({
        method: "GET",
        url: `/v1/local/public/applications/${applicationNo}`,
        headers: { cookie: `payease_application=${legacyOpaqueToken}` },
      });
      expect(legacyOpaqueAccess.statusCode).toBe(401);
      const createdUser = await database.query<{ telegram_user_ref: string }>(
        `SELECT users.telegram_user_ref
           FROM applications JOIN users ON users.id = applications.user_id
          WHERE applications.application_no = $1`,
        [applicationNo],
      );
      expect(createdUser.rows[0]?.telegram_user_ref).toBe("telegram-42424242");
      await database.query(
        `UPDATE telegram_auth_sessions
            SET last_seen_at = now() - interval '5 minutes 1 second'
          WHERE token_hash = $1`,
        [createHash("sha256").update(firstCookie.split("=")[1]!).digest("hex")],
      );
      const idleSession = await brokerApi.app.inject({
        method: "GET",
        url: "/v1/local/public/applications",
        headers: { cookie: firstCookie },
      });
      expect(idleSession.statusCode).toBe(401);

      const secondInitData = signedInitData(
        botB.botToken,
        42424242,
        "bot-b-session",
      );
      const secondLogin = await brokerApi.app.inject({
        method: "POST",
        url: "/v1/local/public/telegram-sessions",
        payload: {
          initData: secondInitData,
        },
      });
      expect(secondLogin.statusCode).toBe(201);
      const secondCookie = String(secondLogin.headers["set-cookie"]).split(
        ";",
      )[0]!;

      const languagePreference = await brokerApi.app.inject({
        method: "PUT",
        url: "/v1/local/public/profile/preferred-language",
        headers: { cookie: secondCookie },
        payload: { preferredLanguage: "zh-CN" },
      });
      expect(languagePreference.statusCode).toBe(200);
      expect(languagePreference.json()).toEqual({ preferredLanguage: "zh-CN" });

      const list = await brokerApi.app.inject({
        method: "GET",
        url: "/v1/local/public/applications",
        headers: { cookie: secondCookie },
      });
      expect(list.statusCode).toBe(200);
      expect(list.json()).toMatchObject({
        preferredLanguage: "zh-CN",
        applications: [
          {
            applicationNo,
            requestedAmountMinor: "10000",
            status: "BROKER_REVIEW",
          },
        ],
      });

      const authenticatedProfile = await brokerApi.app.inject({
        method: "GET",
        url: "/v1/local/public/profile/view",
        headers: { cookie: secondCookie },
      });
      expect(authenticatedProfile.statusCode).toBe(200);
      expect(authenticatedProfile.json()).toMatchObject({
        telegramVerified: true,
      });

      // Disabling a compromised Bot invalidates sessions that it issued.  The
      // two remaining Bots keep the production recovery topology intact and
      // can access the same Telegram-ID-owned record.
      process.env.TELEGRAM_BOTS_JSON = JSON.stringify([
        { ...botA, enabled: false },
        { ...botB, enabled: true },
        { ...botC, enabled: true },
      ]);
      const incidentRecoveryEntryPoints = await brokerApi.app.inject({
        method: "GET",
        url: "/v1/local/public/telegram-entrypoints",
      });
      expect(incidentRecoveryEntryPoints.statusCode).toBe(200);
      expect(incidentRecoveryEntryPoints.json()).toEqual({
        entrypoints: [botB.entryUrl, botC.entryUrl],
      });
      const disabledBotSession = await brokerApi.app.inject({
        method: "GET",
        url: "/v1/local/public/applications",
        headers: { cookie: firstCookie },
      });
      expect(disabledBotSession.statusCode).toBe(401);

      const fallbackBotSession = await brokerApi.app.inject({
        method: "GET",
        url: "/v1/local/public/applications",
        headers: { cookie: secondCookie },
      });
      expect(fallbackBotSession.statusCode).toBe(200);

      const detail = await brokerApi.app.inject({
        method: "GET",
        url: `/v1/local/public/applications/${applicationNo}`,
        headers: { cookie: secondCookie },
      });
      expect(detail.statusCode).toBe(200);
      expect(detail.json()).toMatchObject({
        application: {
          applicationNo,
          requestedAmountMinor: "10000",
          rejectionConditionResolved: false,
        },
      });

      const activeApplicationRetry = await brokerApi.app.inject({
        method: "POST",
        url: "/v1/local/applications",
        headers: { cookie: secondCookie },
        payload: day2ApplicationPayload({
          preferredLanguage: "zh-CN",
          employerTenantId: authenticatedTenant.rows[0]!.id,
          identityDocument: { type: "NATIONAL_ID", number: "ID-2026-0001" },
          personalProfile,
          personalDataAndPhoneConsent: true,
        }),
      });
      expect(activeApplicationRetry.statusCode).toBe(409);
      expect(activeApplicationRetry.json()).toMatchObject({
        code: "REAPPLICATION_ACTIVE_APPLICATION_EXISTS",
        applicationNo,
        currentStatus: "BROKER_REVIEW",
      });

      await database.query(
        `UPDATE applications
            SET status = 'REJECTED', rejection_condition_resolved = false
          WHERE application_no = $1`,
        [applicationNo],
      );
      await database.query(
        `INSERT INTO approval_events
          (application_id, stage, decision, actor_user_ref, actor_role, reason_code, review_round, occurred_at)
         VALUES ($1, 'LENDER_FINAL_REVIEW', 'REJECTED', 'integration-lender', 'LENDER_CREDIT_OFFICER', 'SALARY_NOT_VERIFIED', 1, now())`,
        [applicationId],
      );
      const rejectedDetail = await brokerApi.app.inject({
        method: "GET",
        url: `/v1/local/public/applications/${applicationNo}`,
        headers: { cookie: secondCookie },
      });
      expect(rejectedDetail.statusCode).toBe(200);
      expect(rejectedDetail.headers["cache-control"]).toBe("no-store");
      expect(rejectedDetail.json()).toMatchObject({
        application: {
          rejectionNoticeCode: "EMPLOYMENT_OR_INCOME_UNVERIFIED",
        },
      });
      const unresolvedRejectionRetry = await brokerApi.app.inject({
        method: "POST",
        url: "/v1/local/applications",
        headers: { cookie: secondCookie },
        payload: day2ApplicationPayload({
          preferredLanguage: "zh-CN",
          employerTenantId: authenticatedTenant.rows[0]!.id,
          identityDocument: { type: "NATIONAL_ID", number: "ID-2026-0001" },
          personalProfile,
          personalDataAndPhoneConsent: true,
        }),
      });
      expect(unresolvedRejectionRetry.statusCode).toBe(409);
      expect(unresolvedRejectionRetry.json()).toMatchObject({
        code: "REAPPLICATION_REJECTION_CONDITION_UNRESOLVED",
        applicationNo,
        currentStatus: "REJECTED",
      });

      const lenderCookie = await lenderCreditOfficerCookie(database);
      const resolveReapplication = await brokerApi.app.inject({
        method: "POST",
        url: `/v1/local/applications/${applicationNo}/reapplication-condition-resolved`,
        headers: { cookie: lenderCookie },
        payload: { reasonCode: "INTEGRATION_REJECTION_CONDITION_RESOLVED" },
      });
      expect(resolveReapplication.statusCode).toBe(200);
      expect(resolveReapplication.json()).toMatchObject({
        applicationNo,
        status: "REJECTED",
        rejectionConditionResolved: true,
      });
      const resolvedDetail = await brokerApi.app.inject({
        method: "GET",
        url: `/v1/local/public/applications/${applicationNo}`,
        headers: { cookie: secondCookie },
      });
      expect(resolvedDetail.json()).toMatchObject({
        application: { rejectionConditionResolved: true },
      });
      const eligibleRetry = await brokerApi.app.inject({
        method: "POST",
        url: "/v1/local/applications",
        headers: { cookie: secondCookie },
        payload: day2ApplicationPayload({
          preferredLanguage: "zh-CN",
          employerTenantId: authenticatedTenant.rows[0]!.id,
          identityDocument: { type: "NATIONAL_ID", number: "ID-2026-0001" },
          personalProfile,
          personalDataAndPhoneConsent: true,
        }),
      });
      expect(eligibleRetry.statusCode).toBe(201);

      const applicantCsrfToken = String(
        secondLogin.headers["set-cookie"],
      ).match(/__Host-payease_applicant_csrf=([^;,]+)/)?.[1];
      expect(applicantCsrfToken).toBeTruthy();
      process.env.NODE_ENV = "production";
      process.env.PAYEASE_APPLICANT_ALLOWED_ORIGINS =
        "https://payease-user.example.test";
      try {
        const missingApplicantCsrf = await brokerApi.app.inject({
          method: "PUT",
          url: "/v1/local/public/profile/preferred-language",
          headers: {
            cookie: `${secondCookie}; __Host-payease_applicant_csrf=${applicantCsrfToken}`,
            origin: "https://payease-user.example.test",
          },
          payload: { preferredLanguage: "en" },
        });
        expect(missingApplicantCsrf.statusCode).toBe(403);
        expect(missingApplicantCsrf.json()).toEqual({
          code: "CSRF_TOKEN_INVALID",
        });
        const acceptedApplicantCsrf = await brokerApi.app.inject({
          method: "PUT",
          url: "/v1/local/public/profile/preferred-language",
          headers: {
            cookie: `${secondCookie}; __Host-payease_applicant_csrf=${applicantCsrfToken}`,
            origin: "https://payease-user.example.test",
            "x-csrf-token": applicantCsrfToken!,
          },
          payload: { preferredLanguage: "km" },
        });
        expect(acceptedApplicantCsrf.statusCode).toBe(200);
        expect(acceptedApplicantCsrf.json()).toEqual({
          preferredLanguage: "km",
        });
        const languageAfterRefresh = await brokerApi.app.inject({
          method: "GET",
          url: "/v1/local/public/applications",
          headers: { cookie: secondCookie },
        });
        expect(languageAfterRefresh.statusCode).toBe(200);
        expect(languageAfterRefresh.json()).toMatchObject({
          preferredLanguage: "km",
        });
      } finally {
        process.env.NODE_ENV = originalNodeEnvironment;
        if (originalApplicantOrigins === undefined)
          delete process.env.PAYEASE_APPLICANT_ALLOWED_ORIGINS;
        else
          process.env.PAYEASE_APPLICANT_ALLOWED_ORIGINS =
            originalApplicantOrigins;
      }

      const logout = await brokerApi.app.inject({
        method: "POST",
        url: "/v1/local/public/telegram-sessions/logout",
        headers: { cookie: secondCookie },
      });
      expect(logout.statusCode).toBe(200);
      expect(logout.json()).toEqual({ loggedOut: true });
      const listAfterLogout = await brokerApi.app.inject({
        method: "GET",
        url: "/v1/local/public/applications",
        headers: { cookie: secondCookie },
      });
      expect(listAfterLogout.statusCode).toBe(401);
      const replayAfterLogout = await brokerApi.app.inject({
        method: "POST",
        url: "/v1/local/public/telegram-sessions",
        payload: { initData: secondInitData },
      });
      expect(replayAfterLogout.statusCode).toBe(409);
    } finally {
      if (originalBotConfig === undefined)
        delete process.env.TELEGRAM_BOTS_JSON;
      else process.env.TELEGRAM_BOTS_JSON = originalBotConfig;
      if (originalRequireTelegramAuth === undefined)
        delete process.env.REQUIRE_TELEGRAM_AUTH;
      else process.env.REQUIRE_TELEGRAM_AUTH = originalRequireTelegramAuth;
      if (originalApplicantOrigins === undefined)
        delete process.env.PAYEASE_APPLICANT_ALLOWED_ORIGINS;
      else
        process.env.PAYEASE_APPLICANT_ALLOWED_ORIGINS =
          originalApplicantOrigins;
      process.env.NODE_ENV = originalNodeEnvironment;
    }
  });

  it("lets the owning applicant withdraw exactly once before contract confirmation", async () => {
    const created = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/applications",
      payload: day2ApplicationPayload({
        telegramUserRef: "integration-withdrawal-user",
        requestedAmount: { amountMinor: "25000", currency: "USD" },
        tenorDays: 30,
      }),
    });
    expect(created.statusCode).toBe(201);
    const applicationNo = (created.json() as { applicationNo: string })
      .applicationNo;
    const sessionToken = "integration-withdrawal-session";
    await database.query(
      `INSERT INTO telegram_auth_sessions
        (token_hash, telegram_user_ref, authenticated_bot_id, expires_at)
       VALUES ($1, $2, '444444444', now() + interval '15 minutes')`,
      [
        createHash("sha256").update(sessionToken).digest("hex"),
        "integration-withdrawal-user",
      ],
    );
    const applicantCookie = `payease_applicant_session=${sessionToken}`;

    const missingSession = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/public/applications/${applicationNo}/withdraw`,
    });
    expect(missingSession.statusCode).toBe(401);

    const withdrawn = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/public/applications/${applicationNo}/withdraw`,
      headers: { cookie: applicantCookie },
    });
    expect(withdrawn.statusCode).toBe(200);
    expect(withdrawn.json()).toEqual({
      applicationNo,
      status: "CLOSED",
      withdrawn: true,
    });

    const repeatedWithdrawal = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/public/applications/${applicationNo}/withdraw`,
      headers: { cookie: applicantCookie },
    });
    expect(repeatedWithdrawal.statusCode).toBe(200);
    const withdrawalAuditCount = await database.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM audit_events
        WHERE entity_id = (SELECT id FROM applications WHERE application_no = $1)
          AND event_type = 'USER_APPLICATION_WITHDRAWN'`,
      [applicationNo],
    );
    expect(Number(withdrawalAuditCount.rows[0]?.count)).toBe(1);
  });

  it("projects wallet credit only from a signed lender domain event and issues a fragment token jump", async () => {
    const user = await database.query<{ id: string }>(
      `INSERT INTO users (telegram_user_ref, preferred_language)
       VALUES ('integration-wallet-user', 'en')
       RETURNING id`,
    );
    const application = await database.query<{ application_no: string }>(
      `INSERT INTO applications
        (application_no, user_id, requested_amount_minor, currency, tenor_days,
         status, workflow_version)
       VALUES (
         'APP-20260830-WALLET-001', $1, 25000, 'USD', 30,
         'DISBURSED', 'SALARY_LOAN_V2'
       )
       RETURNING application_no`,
      [user.rows[0]!.id],
    );
    const applicationNo = application.rows[0]!.application_no;
    const sessionToken = "integration-wallet-session";
    await database.query(
      `INSERT INTO telegram_auth_sessions
        (token_hash, telegram_user_ref, authenticated_bot_id, expires_at)
       VALUES ($1, $2, '444444444', now() + interval '15 minutes')`,
      [
        createHash("sha256").update(sessionToken).digest("hex"),
        "integration-wallet-user",
      ],
    );
    const applicantCookie = `payease_applicant_session=${sessionToken}`;
    const unavailableBeforeWallet = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/public/applications/${applicationNo}/wallet-operation-jumps`,
      headers: { cookie: applicantCookie },
      payload: { operationType: "WITHDRAWAL" },
    });
    expect(unavailableBeforeWallet.statusCode).toBe(409);

    const walletCreditEvent = createOutgoingDomainEvent({
      eventId: "evt_wallet_credit_integration_001",
      eventType: "WALLET_CREDIT_CONFIRMED",
      sourceDomain: "LENDER",
      occurredAt: "2026-08-30T10:00:00.000Z",
      idempotencyKey: "idem_wallet_credit_integration_001",
      externalApplicationRef: applicationNo,
      payload: {
        externalWalletRef: "wallet-ext-integration-001",
        walletStatus: "WALLET_AVAILABLE",
        availableBalanceMinor: "25000",
        currency: "USD",
      },
    });
    process.env.PAYEASE_LENDER_EVENT_SHARED_SECRET =
      "integration-lender-event-secret";
    const walletCredit = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/domain-events/inbox/receive",
      headers: signedLenderEventHeaders(walletCreditEvent),
      payload: walletCreditEvent,
    });
    expect(walletCredit.statusCode).toBe(202);
    expect(walletCredit.json()).toMatchObject({
      accepted: true,
      processingStatus: "PROCESSED",
    });

    process.env.PAYEASE_SMILE_WALLET_BASE_URL =
      "https://wallet.smile.test/entry";
    process.env.PAYEASE_SMILE_WALLET_ALLOWED_HOSTS = "wallet.smile.test";

    const jumpResponse = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/public/applications/${applicationNo}/wallet-operation-jumps`,
      headers: { cookie: applicantCookie },
      payload: {
        operationType: "WITHDRAWAL",
        requestedAmountMinor: "20000",
      },
    });
    expect(jumpResponse.statusCode).toBe(400);

    const createdJump = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/public/applications/${applicationNo}/wallet-operation-jumps`,
      headers: { cookie: applicantCookie },
      payload: { operationType: "WITHDRAWAL" },
    });
    expect(createdJump.statusCode).toBe(200);
    const jumpPayload = createdJump.json() as {
      walletOperationJumpRef: string;
      walletOperationUrl: string;
    };
    const jumpUrl = new URL(jumpPayload.walletOperationUrl);
    const jumpToken = new URLSearchParams(jumpUrl.hash.replace(/^#/, "")).get(
      "jump_token",
    );
    expect(jumpUrl.searchParams.get("jump_token")).toBeNull();
    expect(jumpToken).toBeTruthy();
    expect(jumpToken).not.toContain("integration-wallet-user");
    expect(jumpToken).not.toContain(applicationNo);
    const exchangePayload = {
      jumpRef: jumpPayload.walletOperationJumpRef,
      jumpToken: jumpToken!,
      operationType: "WITHDRAWAL",
    };
    const exchanged = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/wallet-operation-jumps/exchange",
      headers: signedWalletJumpExchangeHeaders(exchangePayload),
      payload: exchangePayload,
    });
    expect(exchanged.statusCode).toBe(200);
    expect(exchanged.json()).toMatchObject({
      applicationNo,
      walletOperationJumpRef: jumpPayload.walletOperationJumpRef,
      operationType: "WITHDRAWAL",
      walletStatus: "WALLET_AVAILABLE",
      availableBalanceMinor: "25000",
      currency: "USD",
    });
    expect((exchanged.json() as { expiresAt: string }).expiresAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T.*Z$/,
    );
    const replay = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/wallet-operation-jumps/exchange",
      headers: signedWalletJumpExchangeHeaders(exchangePayload),
      payload: exchangePayload,
    });
    expect(replay.statusCode).toBe(404);
    expect(replay.json()).toEqual({ code: "WALLET_OPERATION_JUMP_NOT_FOUND" });
    const projectedWallet = await database.query<{
      wallet_status: string;
      available_balance_minor: string;
      last_callback_event_id: string | null;
    }>(
      `SELECT wallet_status,
              available_balance_minor::text,
              last_callback_event_id
         FROM lender_wallet_projection_snapshots snapshot
         JOIN applications application_row
           ON application_row.id = snapshot.application_id
        WHERE application_row.application_no = $1`,
      [applicationNo],
    );
    expect(projectedWallet.rows[0]).toEqual({
      wallet_status: "WALLET_AVAILABLE",
      available_balance_minor: "25000",
      last_callback_event_id: "evt_wallet_credit_integration_001",
    });
  });

  it("records the full manual pilot lifecycle with distinct approval accounts", async () => {
    const tenant = await database.query<{ id: string }>(
      `INSERT INTO employer_tenants (external_ref, display_name)
       VALUES ('LIFECYCLE_FACTORY', 'Lifecycle factory') RETURNING id`,
    );
    const created = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/applications",
      payload: day2ApplicationPayload({
        telegramUserRef: "integration-lifecycle-user",
        requestedAmount: { amountMinor: "25000", currency: "USD" },
        tenorDays: 30,
        employerTenantId: tenant.rows[0]!.id,
        identityDocument: { type: "NATIONAL_ID", number: "KH-ID-10001" },
      }),
    });
    expect(created.statusCode).toBe(201);
    const applicationNo = (created.json() as { applicationNo: string })
      .applicationNo;
    const applicantCookie = String(created.headers["set-cookie"]).split(
      ";",
    )[0]!;
    const applicantSessionToken = "integration-lifecycle-telegram-session";
    await database.query(
      `INSERT INTO telegram_auth_sessions
        (token_hash, telegram_user_ref, authenticated_bot_id, expires_at)
       VALUES ($1, $2, '444444444', now() + interval '30 minutes')`,
      [
        createHash("sha256").update(applicantSessionToken).digest("hex"),
        "integration-lifecycle-user",
      ],
    );
    const telegramApplicantCookie = `payease_applicant_session=${applicantSessionToken}`;
    const call = async (
      route: string,
      cookie: string,
      payload: Record<string, unknown>,
      expectedStatus: string,
      idempotencyKey?: string,
    ) => {
      const response = await brokerApi.app.inject({
        method: "POST",
        url: `/v1/local/applications/${applicationNo}/${route}`,
        headers: {
          cookie,
          "idempotency-key":
            idempotencyKey ?? `approval-${route}-integration-001`,
        },
        payload,
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        applicationNo,
        status: expectedStatus,
      });
    };

    await call(
      "broker-review",
      await adminCookieForRole(database, "BROKER_OFFICER", "BROKER"),
      { decision: "APPROVED", reasonCode: "DOCUMENTS_COMPLETE" },
      "EMPLOYER_VERIFICATION",
    );
    const employerHrCookie = await adminCookieForRole(
      database,
      "EMPLOYER_HR",
      "EMPLOYER",
    );
    await grantEmployerTenantMember(
      database,
      tenant.rows[0]!.id,
      employerHrCookie,
    );
    const employerFinanceCookie = await adminCookieForRole(
      database,
      "EMPLOYER_FINANCE",
      "EMPLOYER",
    );
    await grantEmployerTenantMember(
      database,
      tenant.rows[0]!.id,
      employerFinanceCookie,
    );
    const hrQueue = await brokerApi.app.inject({
      method: "GET",
      url: "/v1/local/employer/verifications/open",
      headers: { cookie: employerHrCookie },
    });
    expect(hrQueue.statusCode).toBe(200);
    expect(hrQueue.json()).toMatchObject({
      items: [
        {
          applicationNo,
          stage: "EMPLOYER_VERIFICATION",
          employerTenantId: tenant.rows[0]!.id,
          identityDocumentType: "NATIONAL_ID",
          identityMatchStatus: "PENDING",
        },
      ],
    });
    expect(JSON.stringify(hrQueue.json())).not.toContain(
      "integration-lifecycle-user",
    );
    expect(JSON.stringify(hrQueue.json())).not.toContain("KH-ID-10001");
    const otherTenant = await database.query<{ id: string }>(
      `INSERT INTO employer_tenants (external_ref, display_name)
       VALUES ('OTHER_LIFECYCLE_FACTORY', 'Other lifecycle factory') RETURNING id`,
    );
    const otherHrCookie = await adminCookieForRole(
      database,
      "EMPLOYER_HR",
      "EMPLOYER",
    );
    await grantEmployerTenantMember(
      database,
      otherTenant.rows[0]!.id,
      otherHrCookie,
    );
    const otherHrQueue = await brokerApi.app.inject({
      method: "GET",
      url: "/v1/local/employer/verifications/open",
      headers: { cookie: otherHrCookie },
    });
    expect(otherHrQueue.statusCode).toBe(200);
    expect(otherHrQueue.json()).toEqual({ items: [] });
    const crossTenantApproval = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/applications/${applicationNo}/employer-verification`,
      headers: {
        cookie: otherHrCookie,
        "idempotency-key": "cross-tenant-approval-001",
      },
      payload: { decision: "APPROVED", reasonCode: "EMPLOYMENT_CONFIRMED" },
    });
    expect(crossTenantApproval.statusCode).toBe(403);
    expect(crossTenantApproval.json()).toEqual({
      code: "EMPLOYER_TENANT_ACCESS_DENIED",
    });
    const crossTenantIdentityMatch = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/applications/${applicationNo}/employer-identity-match`,
      headers: {
        cookie: otherHrCookie,
        "idempotency-key": "cross-tenant-identity-match-001",
      },
      payload: {
        identityDocumentNumber: "KH-ID-10001",
        reasonCode: "UNAUTHORIZED_FACTORY_ATTEMPT",
      },
    });
    expect(crossTenantIdentityMatch.statusCode).toBe(403);
    expect(crossTenantIdentityMatch.json()).toEqual({
      code: "EMPLOYER_TENANT_ACCESS_DENIED",
    });
    const identityMatchRequired = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/applications/${applicationNo}/employer-verification`,
      headers: {
        cookie: employerHrCookie,
        "idempotency-key": "identity-match-required-001",
      },
      payload: { decision: "APPROVED", reasonCode: "EMPLOYMENT_CONFIRMED" },
    });
    expect(identityMatchRequired.statusCode).toBe(409);
    expect(identityMatchRequired.json()).toEqual({
      code: "EMPLOYMENT_IDENTITY_MATCH_REQUIRED",
    });
    const identityMatched = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/applications/${applicationNo}/employer-identity-match`,
      headers: {
        cookie: employerHrCookie,
        "idempotency-key": "identity-match-recorded-001",
      },
      payload: {
        identityDocumentNumber: "khid10001",
        reasonCode: "FACTORY_EMPLOYEE_IDENTITY_MATCHED",
      },
    });
    expect(identityMatched.statusCode).toBe(200);
    expect(identityMatched.json()).toEqual({
      applicationNo,
      identityMatchStatus: "MATCHED",
    });
    const identityMatchOverwrite = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/applications/${applicationNo}/employer-identity-match`,
      headers: {
        cookie: employerHrCookie,
        "idempotency-key": "identity-match-overwrite-001",
      },
      payload: {
        identityDocumentNumber: "KH-ID-99999",
        reasonCode: "SHOULD_NOT_OVERWRITE",
      },
    });
    expect(identityMatchOverwrite.statusCode).toBe(409);
    expect(identityMatchOverwrite.json()).toEqual({
      code: "EMPLOYMENT_IDENTITY_MATCH_ALREADY_RECORDED",
    });
    await call(
      "employer-verification",
      employerHrCookie,
      { decision: "APPROVED", reasonCode: "EMPLOYMENT_CONFIRMED" },
      "LENDER_INITIAL_REVIEW",
    );
    const financeQueue = await brokerApi.app.inject({
      method: "GET",
      url: "/v1/local/employer/verifications/open",
      headers: { cookie: employerFinanceCookie },
    });
    expect(financeQueue.statusCode).toBe(200);
    expect(financeQueue.json()).toEqual({ items: [] });
    expect(JSON.stringify(financeQueue.json())).not.toContain("NATIONAL_ID");
    expect(JSON.stringify(financeQueue.json())).not.toContain("MATCHED");
    await call(
      "lender-initial-review",
      await adminCookieForRole(database, "LENDER_CREDIT_OFFICER", "LENDER"),
      { decision: "APPROVED", reasonCode: "INITIAL_CREDIT_APPROVED" },
      "LENDER_FINAL_REVIEW",
    );
    await call(
      "lender-final-review",
      await adminCookieForRole(database, "LENDER_CREDIT_REVIEWER", "LENDER"),
      {
        decision: "APPROVED",
        reasonCode: "FINAL_CREDIT_APPROVED",
        approvedAmountMinor: "25000",
        actualDisbursementAmountMinor: "25000",
        lenderInterestMinor: "500",
        totalRepaymentAmountMinor: "25500",
        brokerageRemunerationReceivableMinor: "3500",
        installmentCount: 2,
        firstDueDate: "2026-09-15",
        productRuleVersion: "PRODUCT-RULE-V2-20260821",
        brokerageRemunerationRuleVersion: "BROKERAGE-RULE-V2-20260821",
        lenderInterestRuleVersion: "LENDER-INTEREST-V2-20260821",
      },
      "CONTRACT_PENDING",
    );
    const unauthenticatedConfirmation = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/public/applications/${applicationNo}/contract-confirmation`,
    });
    expect(unauthenticatedConfirmation.statusCode).toBe(401);
    expect(unauthenticatedConfirmation.json()).toEqual({
      code: "TELEGRAM_AUTH_REQUIRED",
    });
    const otherApplicantSessionToken = "integration-lifecycle-other-session";
    await database.query(
      `INSERT INTO telegram_auth_sessions
        (token_hash, telegram_user_ref, authenticated_bot_id, expires_at)
       VALUES ($1, $2, '444444444', now() + interval '30 minutes')`,
      [
        createHash("sha256").update(otherApplicantSessionToken).digest("hex"),
        "integration-lifecycle-other-user",
      ],
    );
    const otherApplicantConfirmation = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/public/applications/${applicationNo}/contract-confirmation`,
      headers: {
        cookie: `payease_applicant_session=${otherApplicantSessionToken}`,
      },
    });
    expect(otherApplicantConfirmation.statusCode).toBe(404);
    expect(otherApplicantConfirmation.json()).toEqual({
      code: "APPLICATION_NOT_FOUND",
    });
    const userContractConfirmation = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/public/applications/${applicationNo}/contract-confirmation`,
      headers: { cookie: telegramApplicantCookie },
    });
    expect(userContractConfirmation.statusCode).toBe(200);
    expect(userContractConfirmation.json()).toEqual({
      applicationNo,
      status: "USER_CONTRACT_CONFIRMED",
    });
    const repeatedUserContractConfirmation = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/public/applications/${applicationNo}/contract-confirmation`,
      headers: { cookie: telegramApplicantCookie },
    });
    expect(repeatedUserContractConfirmation.statusCode).toBe(200);
    expect(repeatedUserContractConfirmation.json()).toEqual({
      applicationNo,
      status: "USER_CONTRACT_CONFIRMED",
    });
    const signedApplicationWithdrawal = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/public/applications/${applicationNo}/withdraw`,
      headers: { cookie: telegramApplicantCookie },
    });
    expect(signedApplicationWithdrawal.statusCode).toBe(409);
    expect(signedApplicationWithdrawal.json()).toEqual({
      code: "WITHDRAWAL_REQUIRES_LENDER_CASE",
      currentStatus: "USER_CONTRACT_CONFIRMED",
    });
    const userConfirmationAuditCount = await database.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM audit_events
        WHERE entity_id = (SELECT id FROM applications WHERE application_no = $1)
          AND event_type = 'USER_CONTRACT_CONFIRMED'`,
      [applicationNo],
    );
    expect(Number(userConfirmationAuditCount.rows[0]?.count)).toBe(1);
    await call(
      "contract-confirmation",
      await adminCookieForRole(database, "LENDER_CONTRACT_OFFICER", "LENDER"),
      { evidenceReference: "CONTRACT-INTEGRATION-001" },
      "CONTRACT_CONFIRMED",
    );
    const disbursementMaker = await adminCookieForRole(
      database,
      "LENDER_DISBURSEMENT_MAKER",
      "LENDER",
    );
    await call(
      "open-disbursement",
      disbursementMaker,
      { reasonCode: "MANUAL_DISBURSEMENT_OPENED" },
      "DISBURSEMENT_PENDING",
    );
    const disbursementReleaseKey = "disbursement-release-0001";
    await call(
      "disbursement-release",
      disbursementMaker,
      { reasonCode: "MANUAL_DISBURSEMENT_RECORDED" },
      "DISBURSEMENT_PENDING",
      disbursementReleaseKey,
    );
    const repeatedDisbursementRelease = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/applications/${applicationNo}/disbursement-release`,
      headers: {
        cookie: disbursementMaker,
        "idempotency-key": disbursementReleaseKey,
      },
      payload: { reasonCode: "MANUAL_DISBURSEMENT_RECORDED" },
    });
    expect(repeatedDisbursementRelease.statusCode).toBe(200);
    expect(repeatedDisbursementRelease.json()).toEqual({
      applicationNo,
      status: "DISBURSEMENT_PENDING",
      approval: "MAKER_RECORDED",
    });
    // Seed the checker role through the normal fixture helper before adding
    // it to the maker. Otherwise this test would stop at role authorization
    // (403) instead of exercising the intended maker/checker conflict (409).
    const disbursementChecker = await adminCookieForRole(
      database,
      "LENDER_DISBURSEMENT_CHECKER",
      "LENDER",
    );
    // A misconfigured account can accidentally receive both operational
    // roles. The checker route must still reject that account: role-based
    // authorization alone is not sufficient for maker/checker separation.
    await database.query(
      `INSERT INTO admin_account_roles (account_id, role_id)
       SELECT session.account_id, role.id
         FROM admin_sessions AS session
         CROSS JOIN roles AS role
        WHERE session.token_hash = $1
          AND role.code = 'LENDER_DISBURSEMENT_CHECKER'
       ON CONFLICT DO NOTHING`,
      [
        createHash("sha256")
          .update(disbursementMaker.split("=")[1]!)
          .digest("hex"),
      ],
    );
    const sameAccountConfirmation = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/applications/${applicationNo}/disbursement-confirmation`,
      headers: {
        cookie: disbursementMaker,
        "idempotency-key": "disbursement-confirmation-same-account",
      },
      payload: {
        reasonCode: "MANUAL_DISBURSEMENT_CONFIRMED",
        evidenceReference: "DISBURSEMENT-SAME-ACCOUNT-REJECTED",
      },
    });
    expect(sameAccountConfirmation.statusCode).toBe(409);
    expect(sameAccountConfirmation.json()).toEqual({
      code: "DUAL_CONTROL_CONFLICT",
    });
    const confirmationWithoutKey = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/applications/${applicationNo}/disbursement-confirmation`,
      headers: { cookie: disbursementChecker },
      payload: {
        reasonCode: "MANUAL_DISBURSEMENT_CONFIRMED",
        evidenceReference: "DISBURSEMENT-INTEGRATION-001",
      },
    });
    expect(confirmationWithoutKey.statusCode).toBe(400);
    expect(confirmationWithoutKey.json()).toEqual({
      code: "IDEMPOTENCY_KEY_REQUIRED",
    });
    const disbursementConfirmationKey = "disbursement-confirmation-0001";
    await call(
      "disbursement-confirmation",
      disbursementChecker,
      {
        reasonCode: "MANUAL_DISBURSEMENT_CONFIRMED",
        evidenceReference: "DISBURSEMENT-INTEGRATION-001",
      },
      "DISBURSED",
      disbursementConfirmationKey,
    );
    const repeatedDisbursementConfirmation = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/applications/${applicationNo}/disbursement-confirmation`,
      headers: {
        cookie: disbursementChecker,
        "idempotency-key": disbursementConfirmationKey,
      },
      payload: {
        reasonCode: "MANUAL_DISBURSEMENT_CONFIRMED",
        evidenceReference: "DISBURSEMENT-INTEGRATION-001",
      },
    });
    expect(repeatedDisbursementConfirmation.statusCode).toBe(200);
    expect(repeatedDisbursementConfirmation.json()).toEqual({
      applicationNo,
      status: "DISBURSED",
    });
    const changedDisbursementRetry = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/applications/${applicationNo}/disbursement-confirmation`,
      headers: {
        cookie: disbursementChecker,
        "idempotency-key": disbursementConfirmationKey,
      },
      payload: {
        reasonCode: "MANUAL_DISBURSEMENT_CONFIRMED",
        evidenceReference: "DISBURSEMENT-INTEGRATION-CHANGED",
      },
    });
    expect(changedDisbursementRetry.statusCode).toBe(409);
    expect(changedDisbursementRetry.json()).toEqual({
      code: "IDEMPOTENCY_KEY_REUSED",
    });
    const repaymentMaker = await adminCookieForRole(
      database,
      "LENDER_REPAYMENT_MAKER",
      "LENDER",
    );
    await call(
      "activate-repayment",
      repaymentMaker,
      { reasonCode: "REPAYMENT_OPENED" },
      "REPAYMENT_ACTIVE",
    );
    const firstRepaymentWriteOffKey = "repayment-write-off-period-0001";
    await call(
      "repayment-write-off",
      repaymentMaker,
      { reasonCode: "MANUAL_PAYMENT_RECEIVED" },
      "REPAYMENT_ACTIVE",
      firstRepaymentWriteOffKey,
    );
    const repeatedFirstRepaymentWriteOff = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/applications/${applicationNo}/repayment-write-off`,
      headers: {
        cookie: repaymentMaker,
        "idempotency-key": firstRepaymentWriteOffKey,
      },
      payload: { reasonCode: "MANUAL_PAYMENT_RECEIVED" },
    });
    expect(repeatedFirstRepaymentWriteOff.statusCode).toBe(200);
    expect(repeatedFirstRepaymentWriteOff.json()).toMatchObject({
      applicationNo,
      status: "REPAYMENT_ACTIVE",
      approval: "MAKER_RECORDED",
    });
    // Payment write-off and payment confirmation have the same separation
    // requirement as disbursement. An accidental second role assignment must
    // not let the maker settle their own recorded payment.
    await database.query(
      `INSERT INTO admin_account_roles (account_id, role_id)
       SELECT session.account_id, role.id
         FROM admin_sessions AS session
         CROSS JOIN roles AS role
        WHERE session.token_hash = $1
          AND role.code = 'LENDER_REPAYMENT_CHECKER'
       ON CONFLICT DO NOTHING`,
      [
        createHash("sha256")
          .update(repaymentMaker.split("=")[1]!)
          .digest("hex"),
      ],
    );
    const sameAccountRepaymentConfirmation = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/applications/${applicationNo}/repayment-confirmation`,
      headers: {
        cookie: repaymentMaker,
        "idempotency-key": "repayment-confirmation-same-account",
      },
      payload: {
        reasonCode: "MANUAL_PAYMENT_CONFIRMED",
        evidenceReference: "REPAYMENT-SAME-ACCOUNT-REJECTED",
      },
    });
    expect(sameAccountRepaymentConfirmation.statusCode).toBe(409);
    expect(sameAccountRepaymentConfirmation.json()).toEqual({
      code: "DUAL_CONTROL_CONFLICT",
    });
    const repaymentChecker = await adminCookieForRole(
      database,
      "LENDER_REPAYMENT_CHECKER",
      "LENDER",
    );
    const firstRepaymentConfirmationKey = "repayment-confirmation-period-0001";
    await call(
      "repayment-confirmation",
      repaymentChecker,
      {
        reasonCode: "MANUAL_PAYMENT_CONFIRMED",
        evidenceReference: "REPAYMENT-INTEGRATION-001",
      },
      "REPAYMENT_ACTIVE",
      firstRepaymentConfirmationKey,
    );
    const repeatedFirstRepaymentConfirmation = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/applications/${applicationNo}/repayment-confirmation`,
      headers: {
        cookie: repaymentChecker,
        "idempotency-key": firstRepaymentConfirmationKey,
      },
      payload: {
        reasonCode: "MANUAL_PAYMENT_CONFIRMED",
        evidenceReference: "REPAYMENT-INTEGRATION-001",
      },
    });
    expect(repeatedFirstRepaymentConfirmation.statusCode).toBe(200);
    expect(repeatedFirstRepaymentConfirmation.json()).toMatchObject({
      applicationNo,
      status: "REPAYMENT_ACTIVE",
    });
    const paidAfterRetry = await database.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM repayment_installments
        WHERE application_id = (SELECT id FROM applications WHERE application_no = $1)
          AND status = 'PAID'`,
      [applicationNo],
    );
    expect(paidAfterRetry.rows[0]?.count).toBe("1");
    await call(
      "repayment-write-off",
      repaymentMaker,
      { reasonCode: "MANUAL_PAYMENT_RECEIVED" },
      "REPAYMENT_ACTIVE",
      "repayment-write-off-period-0002",
    );
    await call(
      "repayment-confirmation",
      repaymentChecker,
      {
        reasonCode: "MANUAL_PAYMENT_CONFIRMED",
        evidenceReference: "REPAYMENT-INTEGRATION-0002",
      },
      "SETTLED",
      "repayment-confirmation-period-0002",
    );

    const applicantView = await brokerApi.app.inject({
      method: "GET",
      url: `/v1/local/public/applications/${applicationNo}`,
      headers: { cookie: applicantCookie },
    });
    expect(applicantView.statusCode).toBe(200);
    expect(applicantView.json()).toMatchObject({
      application: {
        status: "SETTLED",
        approvedAmountMinor: "25000",
        employerTenantDisplayName: "Lifecycle factory",
      },
      repayment: {
        periodCount: 2,
        paidPeriods: 2,
        unpaidPeriods: 0,
        outstandingMinor: "0",
      },
    });
    const employerFullDetail = await brokerApi.app.inject({
      method: "GET",
      url: `/v1/local/applications/${applicationNo}`,
      headers: {
        cookie: await adminCookieForRole(database, "EMPLOYER_HR", "EMPLOYER"),
      },
    });
    expect(employerFullDetail.statusCode).toBe(403);
    const lenderFullDetail = await brokerApi.app.inject({
      method: "GET",
      url: `/v1/local/applications/${applicationNo}`,
      headers: {
        cookie: await adminCookieForRole(
          database,
          "LENDER_CREDIT_REVIEWER",
          "LENDER",
        ),
      },
    });
    expect(lenderFullDetail.statusCode).toBe(200);
    expect(lenderFullDetail.json()).toMatchObject({
      terms: null,
      quote: {
        principalAmountMinor: "25000",
        actualDisbursementAmountMinor: "25000",
        lenderInterestMinor: "500",
        totalRepaymentAmountMinor: "25500",
        brokerageRemunerationReceivableMinor: "3500",
      },
      workflow: { workflowVersion: "SALARY_LOAN_V2" },
    });
    const auditEvents = await database.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM audit_events WHERE entity_id = (SELECT id FROM applications WHERE application_no = $1)",
      [applicationNo],
    );
    expect(Number(auditEvents.rows[0]?.count)).toBeGreaterThanOrEqual(11);
  });

  it("projects employer payroll collection instructions from disbursement and advances them after lender reconciliation", async () => {
    const tenant = await database.query<{ id: string }>(
      `INSERT INTO employer_tenants (external_ref, display_name)
       VALUES ('PAYROLL_PROJECTION_FACTORY', 'Payroll projection factory') RETURNING id`,
    );
    await database.query(
      `INSERT INTO employer_payroll_rules
        (employer_tenant_id, rule_code, workflow_version, collection_currency,
         collection_day_of_month, collection_type, partial_collection_allowed,
         allowed_repayment_methods, default_repayment_method,
         published_by_user_ref)
       VALUES (
         $1, 'EMPLOYER-PAYROLL-V2-PROJECTION', 'SALARY_LOAN_V2', 'USD',
         15, 'PRINCIPAL_AND_INTEREST', true,
         ARRAY['EMPLOYER_PAYROLL_DEDUCTION']::text[],
         'EMPLOYER_PAYROLL_DEDUCTION', 'integration-seed'
       )`,
      [tenant.rows[0]!.id],
    );
    const created = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/applications",
      payload: day2ApplicationPayload({
        telegramUserRef: "integration-payroll-projection-user",
        requestedAmount: { amountMinor: "25000", currency: "USD" },
        tenorDays: 30,
        employerTenantId: tenant.rows[0]!.id,
        authorizationSnapshot: {
          employerVerificationAuthorized: true,
          serviceAgreementAuthorized: true,
          postDisbursementBrokerageAuthorized: true,
        },
        identityDocument: { type: "NATIONAL_ID", number: "KH-ID-20001" },
      }),
    });
    expect(created.statusCode).toBe(201);
    const applicationNo = (created.json() as { applicationNo: string })
      .applicationNo;
    await database.query(
      `UPDATE application_repayment_preferences
          SET selected_repayment_method = 'EMPLOYER_PAYROLL_DEDUCTION',
              available_repayment_methods = ARRAY['EMPLOYER_PAYROLL_DEDUCTION']::text[],
              employer_payroll_rule_version = 'EMPLOYER-PAYROLL-V2-PROJECTION',
              collection_payee_ref = 'EMPLOYER_PAYROLL_RUN',
              updated_at = now()
        WHERE application_id = (
          SELECT id FROM applications WHERE application_no = $1
        )`,
      [applicationNo],
    );
    await database.query(
      `UPDATE application_authorization_snapshots
          SET payroll_deduction_authorized = true,
              payroll_deduction_authorization_ref = 'AUTH-PAYROLL-PROJECTION-001',
              updated_at = now()
        WHERE application_id = (
          SELECT id FROM applications WHERE application_no = $1
        )`,
      [applicationNo],
    );
    const applicantSessionToken = "integration-payroll-projection-session";
    await database.query(
      `INSERT INTO telegram_auth_sessions
        (token_hash, telegram_user_ref, authenticated_bot_id, expires_at)
       VALUES ($1, $2, '444444444', now() + interval '30 minutes')`,
      [
        createHash("sha256").update(applicantSessionToken).digest("hex"),
        "integration-payroll-projection-user",
      ],
    );
    const telegramApplicantCookie = `payease_applicant_session=${applicantSessionToken}`;
    const employerHrCookie = await adminCookieForRole(
      database,
      "EMPLOYER_HR",
      "EMPLOYER",
    );
    const employerFinanceCookie = await adminCookieForRole(
      database,
      "EMPLOYER_FINANCE",
      "EMPLOYER",
    );
    await grantEmployerTenantMember(
      database,
      tenant.rows[0]!.id,
      employerHrCookie,
    );
    await grantEmployerTenantMember(
      database,
      tenant.rows[0]!.id,
      employerFinanceCookie,
    );
    const call = async (
      route: string,
      cookie: string,
      payload: Record<string, unknown>,
      expectedStatus: string,
    ) => {
      const response = await brokerApi.app.inject({
        method: "POST",
        url: `/v1/local/applications/${applicationNo}/${route}`,
        headers: {
          cookie,
          "idempotency-key": `integration-${route}-${Math.random().toString(16).slice(2)}`,
        },
        payload,
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        applicationNo,
        status: expectedStatus,
      });
      return response;
    };

    await call(
      "broker-review",
      await adminCookieForRole(database, "BROKER_OFFICER", "BROKER"),
      { decision: "APPROVED", reasonCode: "DOCUMENTS_COMPLETE" },
      "EMPLOYER_VERIFICATION",
    );
    await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/applications/${applicationNo}/employer-identity-match`,
      headers: {
        cookie: employerHrCookie,
        "idempotency-key": "integration-payroll-identity-match",
      },
      payload: {
        identityDocumentNumber: "KHID20001",
        reasonCode: "FACTORY_EMPLOYEE_IDENTITY_MATCHED",
      },
    });
    await call(
      "employer-verification",
      employerHrCookie,
      { decision: "APPROVED", reasonCode: "EMPLOYMENT_CONFIRMED" },
      "LENDER_INITIAL_REVIEW",
    );
    await call(
      "lender-initial-review",
      await adminCookieForRole(database, "LENDER_CREDIT_OFFICER", "LENDER"),
      { decision: "APPROVED", reasonCode: "INITIAL_CREDIT_APPROVED" },
      "LENDER_FINAL_REVIEW",
    );
    await call(
      "lender-final-review",
      await adminCookieForRole(database, "LENDER_CREDIT_REVIEWER", "LENDER"),
      {
        decision: "APPROVED",
        reasonCode: "FINAL_CREDIT_APPROVED",
        approvedAmountMinor: "25000",
        actualDisbursementAmountMinor: "25000",
        lenderInterestMinor: "500",
        totalRepaymentAmountMinor: "25500",
        brokerageRemunerationReceivableMinor: "3500",
        installmentCount: 2,
        firstDueDate: "2026-09-15",
        productRuleVersion: "PRODUCT-RULE-V2-20260821",
        brokerageRemunerationRuleVersion: "BROKERAGE-RULE-V2-20260821",
        lenderInterestRuleVersion: "LENDER-INTEREST-V2-20260821",
      },
      "CONTRACT_PENDING",
    );
    const publicConfirmation = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/public/applications/${applicationNo}/contract-confirmation`,
      headers: { cookie: telegramApplicantCookie },
    });
    expect(publicConfirmation.statusCode).toBe(200);
    await call(
      "contract-confirmation",
      await adminCookieForRole(database, "LENDER_CONTRACT_OFFICER", "LENDER"),
      { evidenceReference: "PAYROLL-CONTRACT-001" },
      "CONTRACT_CONFIRMED",
    );
    const disbursementMaker = await adminCookieForRole(
      database,
      "LENDER_DISBURSEMENT_MAKER",
      "LENDER",
    );
    const disbursementChecker = await adminCookieForRole(
      database,
      "LENDER_DISBURSEMENT_CHECKER",
      "LENDER",
    );
    await call(
      "open-disbursement",
      disbursementMaker,
      { reasonCode: "MANUAL_DISBURSEMENT_OPENED" },
      "DISBURSEMENT_PENDING",
    );
    await call(
      "disbursement-release",
      disbursementMaker,
      { reasonCode: "MANUAL_DISBURSEMENT_RECORDED" },
      "DISBURSEMENT_PENDING",
    );
    await call(
      "disbursement-confirmation",
      disbursementChecker,
      {
        reasonCode: "MANUAL_DISBURSEMENT_CONFIRMED",
        evidenceReference: "PAYROLL-DISBURSEMENT-001",
      },
      "DISBURSED",
    );

    const financeQueue = await brokerApi.app.inject({
      method: "GET",
      url: "/v1/local/employer/verifications/open",
      headers: { cookie: employerFinanceCookie },
    });
    expect(financeQueue.statusCode).toBe(200);
    expect(financeQueue.json()).toEqual({
      items: [
        expect.objectContaining({
          applicationNo,
          stage: "PAYROLL_COLLECTION_PENDING",
          collectionSequence: 1,
          scheduledAmountMinor: "12750",
          selectedRepaymentMethod: "EMPLOYER_PAYROLL_DEDUCTION",
          payrollDeductionAuthorized: true,
          collectionScope: "PRINCIPAL_AND_INTEREST",
        }),
      ],
    });

    const employerCollection = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/applications/${applicationNo}/employer-finance-verification`,
      headers: {
        cookie: employerFinanceCookie,
        "idempotency-key": "integration-payroll-finance-report",
      },
      payload: {
        collectionResult: "COLLECTED",
        reasonCode: "PAYROLL_INSTALLMENT_COLLECTION_REPORTED",
        collectionSequence: 1,
        actualCollectedAmountMinor: "12750",
        evidenceReference: "PAYROLL-EVIDENCE-001",
      },
    });
    expect(employerCollection.statusCode).toBe(200);
    expect(employerCollection.json()).toEqual({
      applicationNo,
      status: "COLLECTION_RECONCILIATION_PENDING",
      collectionSequence: 1,
      actualCollectedAmountMinor: "12750",
      lenderCollectionWorkItemId: expect.any(String),
      lenderCollectionExceptionId: null,
    });
    const employerCollectionResponse = employerCollection.json() as {
      lenderCollectionWorkItemId: string;
    };

    const scheduledAndReported = await database.query<{
      event_type: string;
      count: string;
    }>(
      `SELECT event_type, count(*)::text AS count
         FROM payroll_collection_events
        WHERE application_id = (
          SELECT id FROM applications WHERE application_no = $1
        )
        GROUP BY event_type
        ORDER BY event_type`,
      [applicationNo],
    );
    expect(scheduledAndReported.rows).toEqual(
      expect.arrayContaining([
        { event_type: "PAYROLL_COLLECTION_REPORTED", count: "1" },
        { event_type: "PAYROLL_COLLECTION_SCHEDULED", count: "2" },
      ]),
    );
    const lenderQueue = await brokerApi.app.inject({
      method: "GET",
      url: "/v1/local/lender-repayment-work-items/open",
      headers: {
        cookie: await adminCookieForRole(
          database,
          "LENDER_REPAYMENT_MAKER",
          "LENDER",
        ),
      },
    });
    expect(lenderQueue.statusCode).toBe(200);
    expect(lenderQueue.json()).toEqual({
      items: [
        expect.objectContaining({
          workItemId: employerCollectionResponse.lenderCollectionWorkItemId,
          applicationNo,
          collectionSequence: 1,
          selectedRepaymentMethod: "EMPLOYER_PAYROLL_DEDUCTION",
          sourceType: "EMPLOYER_PAYROLL_REPORT",
          collectionResult: "COLLECTED",
          workItemStatus: "OPEN",
        }),
      ],
    });
    const outboxEvent = await database.query<{
      event_type: string;
      external_application_ref: string;
    }>(
      `SELECT event_type, external_application_ref
         FROM domain_event_outbox
        WHERE external_application_ref = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [applicationNo],
    );
    expect(outboxEvent.rows[0]).toEqual({
      event_type: "COLLECTION_ACCEPTED",
      external_application_ref: applicationNo,
    });

    await call(
      "activate-repayment",
      await adminCookieForRole(database, "LENDER_REPAYMENT_MAKER", "LENDER"),
      { reasonCode: "REPAYMENT_OPENED" },
      "REPAYMENT_ACTIVE",
    );
    await call(
      "repayment-write-off",
      await adminCookieForRole(database, "LENDER_REPAYMENT_MAKER", "LENDER"),
      { reasonCode: "MANUAL_PAYMENT_RECEIVED" },
      "REPAYMENT_ACTIVE",
    );
    await call(
      "repayment-confirmation",
      await adminCookieForRole(database, "LENDER_REPAYMENT_CHECKER", "LENDER"),
      {
        reasonCode: "MANUAL_PAYMENT_CONFIRMED",
        evidenceReference: "PAYROLL-REPAYMENT-001",
      },
      "REPAYMENT_ACTIVE",
    );
    const lenderWorkItemAfterConfirmation = await database.query<{
      work_item_status: string;
      confirmed_by_user_ref: string | null;
    }>(
      `SELECT work_item_status, confirmed_by_user_ref
         FROM lender_collection_work_items
        WHERE id = $1`,
      [employerCollectionResponse.lenderCollectionWorkItemId],
    );
    expect(lenderWorkItemAfterConfirmation.rows[0]?.work_item_status).toBe(
      "CONFIRMED",
    );
    expect(
      lenderWorkItemAfterConfirmation.rows[0]?.confirmed_by_user_ref,
    ).toContain("integration-lender_repayment_checker-");

    const instructionStatuses = await database.query<{
      repayment_installment_no: number;
      projection_status: string;
    }>(
      `SELECT repayment_installment_no, projection_status
         FROM employer_payroll_collection_instructions
        WHERE application_id = (
          SELECT id FROM applications WHERE application_no = $1
        )
        ORDER BY repayment_installment_no ASC`,
      [applicationNo],
    );
    expect(instructionStatuses.rows).toEqual([
      {
        repayment_installment_no: 1,
        projection_status: "RECONCILED",
      },
      {
        repayment_installment_no: 2,
        projection_status: "PAYROLL_COLLECTION_PENDING",
      },
    ]);
  });

  it("persists applicant payment proof uploads and reassessment requests in the public detail DTO", async () => {
    const user = await database.query<{ id: string }>(
      `INSERT INTO users (telegram_user_ref, preferred_language)
       VALUES ('telegram-applicant-dto-proof', 'en') RETURNING id`,
    );
    const repaymentApplication = await database.query<{ id: string }>(
      `INSERT INTO applications
        (application_no, user_id, requested_amount_minor, currency, tenor_days, status)
       VALUES ('APP-20260818-PROOF', $1, 25000, 'USD', 30, 'REPAYMENT_ACTIVE')
       RETURNING id`,
      [user.rows[0]!.id],
    );
    const reassessmentApplication = await database.query<{ id: string }>(
      `INSERT INTO applications
        (application_no, user_id, requested_amount_minor, currency, tenor_days, status)
       VALUES ('APP-20260818-REASS', $1, 15000, 'USD', 15, 'SETTLED')
       RETURNING id`,
      [user.rows[0]!.id],
    );
    const applicantToken = "integration-applicant-dto-session";
    await database.query(
      `INSERT INTO telegram_auth_sessions
        (token_hash, telegram_user_ref, authenticated_bot_id, expires_at, last_seen_at)
       VALUES ($1, 'telegram-applicant-dto-proof', '444444444', now() + interval '30 minutes', now())`,
      [createHash("sha256").update(applicantToken).digest("hex")],
    );
    const applicantCookie = `__Host-payease_applicant_session=${applicantToken}`;

    const proofUpload = multipartPayload({
      fileFieldName: "file",
      fileName: "receipt.pdf",
      contentType: "application/pdf",
      content: Buffer.from("integration payment proof", "utf8"),
    });
    const uploaded = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/public/applications/APP-20260818-PROOF/payment-proofs",
      headers: {
        cookie: applicantCookie,
        "idempotency-key": "integration-payment-proof-0001",
        "content-type": proofUpload.contentType,
      },
      payload: proofUpload.payload,
    });
    expect(uploaded.statusCode).toBe(201);
    expect(uploaded.json()).toMatchObject({ status: "UNDER_REVIEW" });

    const repaymentDetail = await brokerApi.app.inject({
      method: "GET",
      url: "/v1/local/public/applications/APP-20260818-PROOF",
      headers: { cookie: applicantCookie },
    });
    expect(repaymentDetail.statusCode).toBe(200);
    expect(repaymentDetail.json()).toMatchObject({
      application: { applicationNo: "APP-20260818-PROOF" },
      recordDetail: {
        canUploadPaymentProof: true,
        canRequestReassessment: false,
      },
      repaymentProof: {
        fileName: "receipt.pdf",
        status: "UNDER_REVIEW",
      },
    });

    const reassessment = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/public/applications/APP-20260818-REASS/reassessment-requests",
      headers: {
        cookie: applicantCookie,
        "idempotency-key": "integration-reassessment-0001",
      },
      payload: {
        addressChanged: true,
        employerUpdated: false,
        wealthProofDeclared: true,
        note: "Updated income evidence is available for reassessment.",
      },
    });
    expect(reassessment.statusCode).toBe(201);
    expect(reassessment.json()).toMatchObject({ status: "SUBMITTED" });

    const reassessmentDetail = await brokerApi.app.inject({
      method: "GET",
      url: "/v1/local/public/applications/APP-20260818-REASS",
      headers: { cookie: applicantCookie },
    });
    expect(reassessmentDetail.statusCode).toBe(200);
    expect(reassessmentDetail.json()).toMatchObject({
      application: { applicationNo: "APP-20260818-REASS", status: "SETTLED" },
      recordDetail: {
        canUploadPaymentProof: false,
        canRequestReassessment: true,
      },
      reassessmentRequest: {
        addressChanged: true,
        employerUpdated: false,
        wealthProofDeclared: true,
        status: "SUBMITTED",
      },
    });

    const encryptedProof = await database.query<{
      file_content_encrypted: Buffer;
    }>(
      "SELECT file_content_encrypted FROM applicant_payment_proofs WHERE application_id = $1",
      [repaymentApplication.rows[0]!.id],
    );
    expect(
      decryptPersonalValue(encryptedProof.rows[0]!.file_content_encrypted),
    ).toBe(Buffer.from("integration payment proof", "utf8").toString("base64"));
    const encryptedReassessment = await database.query<{
      note_encrypted: Buffer;
    }>(
      "SELECT note_encrypted FROM applicant_reassessment_requests WHERE application_id = $1",
      [reassessmentApplication.rows[0]!.id],
    );
    expect(
      decryptPersonalValue(encryptedReassessment.rows[0]!.note_encrypted),
    ).toBe("Updated income evidence is available for reassessment.");
  });

  it("routes payment proof review and reassessment approval through back-office queues and applicant timeline", async () => {
    const user = await database.query<{ id: string }>(
      `INSERT INTO users (telegram_user_ref, preferred_language)
       VALUES ('telegram-backoffice-review-flow', 'en') RETURNING id`,
    );
    await database.query(
      `INSERT INTO applications
        (application_no, user_id, requested_amount_minor, currency, tenor_days, status)
       VALUES ('APP-20260818-PROOF-REVIEW', $1, 30000, 'USD', 30, 'REPAYMENT_ACTIVE')`,
      [user.rows[0]!.id],
    );
    await database.query(
      `INSERT INTO applications
        (application_no, user_id, requested_amount_minor, currency, tenor_days, status)
       VALUES ('APP-20260818-REASS-QUEUE', $1, 18000, 'USD', 15, 'SETTLED')`,
      [user.rows[0]!.id],
    );
    const applicantToken = "integration-backoffice-review-flow-session";
    await database.query(
      `INSERT INTO telegram_auth_sessions
        (token_hash, telegram_user_ref, authenticated_bot_id, expires_at, last_seen_at)
       VALUES ($1, 'telegram-backoffice-review-flow', '444444444', now() + interval '30 minutes', now())`,
      [createHash("sha256").update(applicantToken).digest("hex")],
    );
    const applicantCookie = `__Host-payease_applicant_session=${applicantToken}`;
    const brokerCookie = await adminCookieForRole(
      database,
      "BROKER_OFFICER",
      "BROKER",
    );
    const repaymentCheckerCookie = await adminCookieForRole(
      database,
      "LENDER_REPAYMENT_CHECKER",
      "LENDER",
    );
    const creditOfficerCookie = await adminCookieForRole(
      database,
      "LENDER_CREDIT_OFFICER",
      "LENDER",
    );
    const creditReviewerCookie = await adminCookieForRole(
      database,
      "LENDER_CREDIT_REVIEWER",
      "LENDER",
    );

    const reviewProofUpload = multipartPayload({
      fileFieldName: "file",
      fileName: "proof-review.pdf",
      contentType: "application/pdf",
      content: Buffer.from("reviewable payment proof", "utf8"),
    });
    const uploaded = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/public/applications/APP-20260818-PROOF-REVIEW/payment-proofs",
      headers: {
        cookie: applicantCookie,
        "idempotency-key": "integration-proof-review-0001",
        "content-type": reviewProofUpload.contentType,
      },
      payload: reviewProofUpload.payload,
    });
    expect(uploaded.statusCode).toBe(201);
    const uploadedBody = uploaded.json() as {
      proofNo: string;
      status: string;
    };
    expect(uploadedBody.status).toBe("UNDER_REVIEW");

    const proofQueue = await brokerApi.app.inject({
      method: "GET",
      url: "/v1/local/payment-proofs/open",
      headers: { cookie: brokerCookie },
    });
    expect(proofQueue.statusCode).toBe(200);
    expect(proofQueue.json()).toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({
          proofNo: uploadedBody.proofNo,
          applicationNo: "APP-20260818-PROOF-REVIEW",
          status: "UNDER_REVIEW",
        }),
      ]),
    });

    const proofDetail = await brokerApi.app.inject({
      method: "GET",
      url: `/v1/local/payment-proofs/${uploadedBody.proofNo}`,
      headers: { cookie: repaymentCheckerCookie },
    });
    expect(proofDetail.statusCode).toBe(200);
    expect(proofDetail.json()).toMatchObject({
      proofNo: uploadedBody.proofNo,
      contentBase64: Buffer.from("reviewable payment proof", "utf8").toString(
        "base64",
      ),
    });

    const proofReview = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/payment-proofs/${uploadedBody.proofNo}/review`,
      headers: {
        cookie: repaymentCheckerCookie,
        "idempotency-key": "integration-proof-review-0002",
      },
      payload: {
        status: "RECONCILED",
        reasonCode: "PROOF_MATCHED",
      },
    });
    expect(proofReview.statusCode).toBe(200);
    expect(proofReview.json()).toMatchObject({
      proofNo: uploadedBody.proofNo,
      status: "RECONCILED",
    });

    const reassessment = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/public/applications/APP-20260818-REASS-QUEUE/reassessment-requests",
      headers: {
        cookie: applicantCookie,
        "idempotency-key": "integration-reassessment-review-0001",
      },
      payload: {
        addressChanged: true,
        employerUpdated: true,
        wealthProofDeclared: true,
        note: "Applicant provided updated employer and wealth materials.",
      },
    });
    expect(reassessment.statusCode).toBe(201);
    const reassessmentBody = reassessment.json() as {
      requestNo: string;
      status: string;
    };
    expect(reassessmentBody.status).toBe("SUBMITTED");

    const brokerQueue = await brokerApi.app.inject({
      method: "GET",
      url: "/v1/local/reassessment-requests/open",
      headers: { cookie: brokerCookie },
    });
    expect(brokerQueue.statusCode).toBe(200);
    expect(brokerQueue.json()).toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({
          requestNo: reassessmentBody.requestNo,
          applicationNo: "APP-20260818-REASS-QUEUE",
          currentStep: "BROKER_REVIEW",
          assignedRoleCode: "BROKER_OFFICER",
        }),
      ]),
    });

    const brokerDetail = await brokerApi.app.inject({
      method: "GET",
      url: `/v1/local/reassessment-requests/${reassessmentBody.requestNo}`,
      headers: { cookie: brokerCookie },
    });
    expect(brokerDetail.statusCode).toBe(200);
    expect(brokerDetail.json()).toMatchObject({
      requestNo: reassessmentBody.requestNo,
      note: "Applicant provided updated employer and wealth materials.",
      approvalCase: {
        currentStep: "BROKER_REVIEW",
        status: "PENDING",
        assignedRoleCode: "BROKER_OFFICER",
      },
    });

    const brokerReview = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/reassessment-requests/${reassessmentBody.requestNo}/broker-review`,
      headers: {
        cookie: brokerCookie,
        "idempotency-key": "integration-reassessment-review-0002",
      },
      payload: {
        decision: "APPROVED",
        reasonCode: "REASSESSMENT_ELIGIBLE",
      },
    });
    expect(brokerReview.statusCode).toBe(200);
    expect(brokerReview.json()).toMatchObject({
      requestNo: reassessmentBody.requestNo,
      decision: "APPROVED",
    });

    const makerQueue = await brokerApi.app.inject({
      method: "GET",
      url: "/v1/local/reassessment-requests/open",
      headers: { cookie: creditOfficerCookie },
    });
    expect(makerQueue.statusCode).toBe(200);
    expect(makerQueue.json()).toMatchObject({
      items: [
        expect.objectContaining({
          requestNo: reassessmentBody.requestNo,
          currentStep: "CREDIT_MAKER_REVIEW",
          assignedRoleCode: "LENDER_CREDIT_OFFICER",
        }),
      ],
    });

    const makerReview = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/reassessment-requests/${reassessmentBody.requestNo}/lender-review`,
      headers: {
        cookie: creditOfficerCookie,
        "idempotency-key": "integration-reassessment-review-0003",
      },
      payload: {
        decision: "APPROVED",
        reasonCode: "CREDIT_MAKER_APPROVED",
      },
    });
    expect(makerReview.statusCode).toBe(200);
    expect(makerReview.json()).toMatchObject({
      requestNo: reassessmentBody.requestNo,
      decision: "APPROVED",
      step: "CREDIT_MAKER_REVIEW",
    });

    const checkerQueue = await brokerApi.app.inject({
      method: "GET",
      url: "/v1/local/reassessment-requests/open",
      headers: { cookie: creditReviewerCookie },
    });
    expect(checkerQueue.statusCode).toBe(200);
    expect(checkerQueue.json()).toMatchObject({
      items: [
        expect.objectContaining({
          requestNo: reassessmentBody.requestNo,
          currentStep: "CREDIT_CHECKER_REVIEW",
          assignedRoleCode: "LENDER_CREDIT_REVIEWER",
        }),
      ],
    });

    const checkerReview = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/reassessment-requests/${reassessmentBody.requestNo}/lender-review`,
      headers: {
        cookie: creditReviewerCookie,
        "idempotency-key": "integration-reassessment-review-0004",
      },
      payload: {
        decision: "APPROVED",
        reasonCode: "CREDIT_CHECKER_APPROVED",
      },
    });
    expect(checkerReview.statusCode).toBe(200);
    expect(checkerReview.json()).toMatchObject({
      requestNo: reassessmentBody.requestNo,
      decision: "APPROVED",
      step: "CREDIT_CHECKER_REVIEW",
    });

    const proofApplicantDetail = await brokerApi.app.inject({
      method: "GET",
      url: "/v1/local/public/applications/APP-20260818-PROOF-REVIEW",
      headers: { cookie: applicantCookie },
    });
    expect(proofApplicantDetail.statusCode).toBe(200);
    expect(proofApplicantDetail.json()).toMatchObject({
      repaymentProof: {
        proofNo: uploadedBody.proofNo,
        status: "RECONCILED",
      },
      timeline: expect.arrayContaining([
        expect.objectContaining({
          entryType: "PAYMENT_PROOF_SUBMITTED",
          referenceNo: uploadedBody.proofNo,
        }),
        expect.objectContaining({
          entryType: "PAYMENT_PROOF_REVIEWED",
          referenceNo: uploadedBody.proofNo,
          status: "RECONCILED",
          reasonCode: "PROOF_MATCHED",
        }),
      ]),
    });

    const reassessmentApplicantDetail = await brokerApi.app.inject({
      method: "GET",
      url: "/v1/local/public/applications/APP-20260818-REASS-QUEUE",
      headers: { cookie: applicantCookie },
    });
    expect(reassessmentApplicantDetail.statusCode).toBe(200);
    expect(reassessmentApplicantDetail.json()).toMatchObject({
      reassessmentRequest: {
        requestNo: reassessmentBody.requestNo,
        status: "APPROVED",
      },
      timeline: expect.arrayContaining([
        expect.objectContaining({
          entryType: "REASSESSMENT_SUBMITTED",
          referenceNo: reassessmentBody.requestNo,
        }),
        expect.objectContaining({
          entryType: "REASSESSMENT_APPROVAL",
          referenceNo: reassessmentBody.requestNo,
          stage: "BROKER_REVIEW",
          decision: "APPROVE",
        }),
        expect.objectContaining({
          entryType: "REASSESSMENT_APPROVAL",
          referenceNo: reassessmentBody.requestNo,
          stage: "CREDIT_MAKER_REVIEW",
          decision: "APPROVE",
        }),
        expect.objectContaining({
          entryType: "REASSESSMENT_APPROVAL",
          referenceNo: reassessmentBody.requestNo,
          stage: "CREDIT_CHECKER_REVIEW",
          decision: "APPROVE",
        }),
      ]),
    });

    const approvalCase = await database.query<{
      current_step: string;
      status: string;
      assigned_role_code: string | null;
    }>(
      `SELECT c.current_step, c.status, c.assigned_role_code
         FROM approval_cases c
         JOIN applicant_reassessment_requests r ON r.approval_case_id = c.id
        WHERE r.request_no = $1`,
      [reassessmentBody.requestNo],
    );
    expect(approvalCase.rows[0]).toEqual({
      current_step: "OFFER_READY",
      status: "COMPLETED",
      assigned_role_code: "LENDER_CREDIT_REVIEWER",
    });
  });

  it("builds applicant notifications from timeline events and persists read state", async () => {
    const user = await database.query<{ id: string }>(
      `INSERT INTO users (telegram_user_ref, preferred_language)
       VALUES ('telegram-notification-reader', 'en') RETURNING id`,
    );
    const application = await database.query<{ id: string }>(
      `INSERT INTO applications
        (application_no, user_id, requested_amount_minor, currency, tenor_days, status)
       VALUES ('APP-20260818-NOTICE-001', $1, 22000, 'USD', 30, 'BROKER_REVIEW')
       RETURNING id`,
      [user.rows[0]!.id],
    );
    await database.query(
      `INSERT INTO application_status_events
        (application_id, from_status, to_status, actor_user_ref, reason_code, occurred_at)
       VALUES ($1, 'DRAFT', 'BROKER_REVIEW', 'integration-broker', 'APPLICATION_SUBMITTED', '2026-08-18T10:00:00.000Z')`,
      [application.rows[0]!.id],
    );
    await database.query(
      `INSERT INTO approval_events
        (application_id, stage, decision, actor_user_ref, actor_role, reason_code, review_round, occurred_at)
       VALUES ($1, 'BROKER_REVIEW', 'APPROVED', 'integration-broker', 'BROKER_OFFICER', 'DOCUMENTS_COMPLETE', 1, '2026-08-18T11:30:00.000Z')`,
      [application.rows[0]!.id],
    );
    const applicantToken = "integration-notification-reader-session";
    await database.query(
      `INSERT INTO telegram_auth_sessions
        (token_hash, telegram_user_ref, authenticated_bot_id, expires_at, last_seen_at)
       VALUES ($1, 'telegram-notification-reader', '444444444', now() + interval '30 minutes', now())`,
      [createHash("sha256").update(applicantToken).digest("hex")],
    );
    const applicantCookie = `__Host-payease_applicant_session=${applicantToken}`;

    const list = await brokerApi.app.inject({
      method: "GET",
      url: "/v1/local/public/notifications?page=1&pageSize=1",
      headers: { cookie: applicantCookie },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({
      page: 1,
      pageSize: 1,
      itemCount: 2,
      pageCount: 2,
      unreadCount: 2,
    });
    const firstList = list.json() as {
      items: Array<{ id: string; unread: boolean }>;
    };
    expect(firstList.items).toHaveLength(1);
    expect(firstList.items[0]).toMatchObject({
      applicationNo: "APP-20260818-NOTICE-001",
      category: "APPLICATION",
      timelineEntryType: "APPROVAL",
      messageCode: "APPROVAL_BROKER_REVIEW_APPROVED",
      unread: true,
    });
    const firstNotification = firstList.items[0]!;

    const detail = await brokerApi.app.inject({
      method: "GET",
      url: `/v1/local/public/notifications/${firstNotification.id}`,
      headers: { cookie: applicantCookie },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({
      id: firstNotification.id,
      applicationNo: "APP-20260818-NOTICE-001",
      unread: true,
    });

    const read = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/public/notifications/${firstNotification.id}/read`,
      headers: { cookie: applicantCookie },
    });
    expect(read.statusCode).toBe(200);
    expect(read.json()).toMatchObject({
      notificationId: firstNotification.id,
      unread: false,
    });

    const refreshedList = await brokerApi.app.inject({
      method: "GET",
      url: "/v1/local/public/notifications?page=1&pageSize=10",
      headers: { cookie: applicantCookie },
    });
    expect(refreshedList.statusCode).toBe(200);
    expect(refreshedList.json()).toMatchObject({
      page: 1,
      pageSize: 10,
      itemCount: 2,
      pageCount: 1,
      unreadCount: 1,
      items: expect.arrayContaining([
        expect.objectContaining({
          id: firstNotification.id,
          unread: false,
        }),
      ]),
    });

    const readAll = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/public/notifications/read-all",
      headers: { cookie: applicantCookie },
    });
    expect(readAll.statusCode).toBe(200);
    expect(readAll.json()).toMatchObject({
      readCount: 1,
      unreadCount: 0,
    });

    const finalList = await brokerApi.app.inject({
      method: "GET",
      url: "/v1/local/public/notifications?page=1&pageSize=10",
      headers: { cookie: applicantCookie },
    });
    expect(finalList.statusCode).toBe(200);
    expect(finalList.json()).toMatchObject({
      unreadCount: 0,
      items: [
        expect.objectContaining({ unread: false }),
        expect.objectContaining({ unread: false }),
      ],
    });
  });

  it("stores applicant application drafts encrypted and serves them back to the applicant", async () => {
    const user = await database.query<{ id: string }>(
      `INSERT INTO users (telegram_user_ref, preferred_language)
       VALUES ('telegram-draft-owner', 'en') RETURNING id`,
    );
    const applicantToken = "integration-application-draft-session";
    await database.query(
      `INSERT INTO telegram_auth_sessions
        (token_hash, telegram_user_ref, authenticated_bot_id, expires_at, last_seen_at)
       VALUES ($1, 'telegram-draft-owner', '444444444', now() + interval '30 minutes', now())`,
      [createHash("sha256").update(applicantToken).digest("hex")],
    );
    const applicantCookie = `__Host-payease_applicant_session=${applicantToken}`;
    const draftBody = {
      version: 1,
      stage: "details",
      formStep: "contacts",
      amountInput: "125",
      term: 30,
      selectedRepaymentMethod: "SMILE_WALLET_AUTHORIZATION",
      name: "Draft Owner",
      residentialAddress: "Phnom Penh",
      phone: "012345678",
      employer: "KhmerX Factory",
      emergencyContactOneName: "Sokha",
      emergencyContactOnePhone: "098111111",
      emergencyContactTwoName: "Dara",
      emergencyContactTwoPhone: "098222222",
      employerTenantId: "",
      bankName: "ACLEDA",
      bankAccountNumber: "000123456789",
      bankAccountHolder: "Draft Owner",
      identityDocumentType: "NATIONAL_ID",
      identityDocumentNumber: "ID-998877",
      livenessPrepared: true,
      wealthProofAttached: false,
      consent: true,
      employerVerificationAuthorized: true,
      serviceAgreementAuthorized: true,
      postDisbursementBrokerageAuthorized: true,
    } as const;

    const putDraft = await brokerApi.app.inject({
      method: "PUT",
      url: "/v1/local/public/application-draft",
      headers: {
        cookie: applicantCookie,
        "content-type": "application/json",
      },
      payload: draftBody,
    });
    expect(putDraft.statusCode).toBe(204);

    const storedDraft = await database.query<{
      draft_version: number;
      stage: string;
      form_step: string;
      draft_payload_encrypted: Buffer;
    }>(
      `SELECT draft_version, stage, form_step, draft_payload_encrypted
         FROM applicant_application_drafts
        WHERE user_id = $1`,
      [user.rows[0]!.id],
    );
    expect(storedDraft.rowCount).toBe(1);
    expect(storedDraft.rows[0]).toMatchObject({
      draft_version: 1,
      stage: "details",
      form_step: "contacts",
    });
    expect(
      JSON.parse(
        decryptPersonalValue(storedDraft.rows[0]!.draft_payload_encrypted),
      ),
    ).toEqual(draftBody);

    const getDraft = await brokerApi.app.inject({
      method: "GET",
      url: "/v1/local/public/application-draft",
      headers: { cookie: applicantCookie },
    });
    expect(getDraft.statusCode).toBe(200);
    expect(getDraft.json()).toEqual({ draft: draftBody });

    const deleteDraft = await brokerApi.app.inject({
      method: "DELETE",
      url: "/v1/local/public/application-draft",
      headers: { cookie: applicantCookie },
    });
    expect(deleteDraft.statusCode).toBe(204);

    const remainingDrafts = await database.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM applicant_application_drafts WHERE user_id = $1",
      [user.rows[0]!.id],
    );
    expect(remainingDrafts.rows[0]).toEqual({ count: "0" });

    const afterDelete = await brokerApi.app.inject({
      method: "GET",
      url: "/v1/local/public/application-draft",
      headers: { cookie: applicantCookie },
    });
    expect(afterDelete.statusCode).toBe(200);
    expect(afterDelete.json()).toEqual({ draft: null });
  });

  it("isolates reconciliation queues, assignments, and resolutions by factory tenant", async () => {
    const firstTenant = await database.query<{ id: string }>(
      `INSERT INTO employer_tenants (external_ref, display_name)
       VALUES ('RECON_FACTORY_A', 'Reconciliation factory A') RETURNING id`,
    );
    const secondTenant = await database.query<{ id: string }>(
      `INSERT INTO employer_tenants (external_ref, display_name)
       VALUES ('RECON_FACTORY_B', 'Reconciliation factory B') RETURNING id`,
    );
    const user = await database.query<{ id: string }>(
      `INSERT INTO users (telegram_user_ref, preferred_language)
       VALUES ('telegram-reconciliation-tenant', 'en') RETURNING id`,
    );
    const application = await database.query<{ id: string }>(
      `INSERT INTO applications
        (application_no, user_id, employer_tenant_id, requested_amount_minor, currency, tenor_days, status)
       VALUES ('APP-20260815-RECON', $1, $2, 10000, 'USD', 30, 'DISBURSED')
       RETURNING id`,
      [user.rows[0]!.id, firstTenant.rows[0]!.id],
    );
    const workItem = await database.query<{ id: string }>(
      `INSERT INTO reconciliation_work_items
        (application_id, evidence_type, evidence_reference)
       VALUES ($1, 'DISBURSEMENT_RECEIPT', 'RECON-TENANT-001') RETURNING id`,
      [application.rows[0]!.id],
    );
    const firstFinanceCookie = await adminCookieForRole(
      database,
      "EMPLOYER_FINANCE",
      "EMPLOYER",
    );
    const secondFinanceCookie = await adminCookieForRole(
      database,
      "EMPLOYER_FINANCE",
      "EMPLOYER",
    );
    await grantEmployerTenantMember(
      database,
      firstTenant.rows[0]!.id,
      firstFinanceCookie,
    );
    await grantEmployerTenantMember(
      database,
      secondTenant.rows[0]!.id,
      secondFinanceCookie,
    );

    const secondFactoryQueue = await brokerApi.app.inject({
      method: "GET",
      url: "/v1/local/reconciliation/open",
      headers: { cookie: secondFinanceCookie },
    });
    expect(secondFactoryQueue.statusCode).toBe(200);
    expect(secondFactoryQueue.json()).toEqual([]);

    const crossTenantAssignment = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/reconciliation/${workItem.rows[0]!.id}/assign`,
      headers: { cookie: secondFinanceCookie },
      payload: { assigneeLoginName: "integration-employer_finance-999" },
    });
    expect(crossTenantAssignment.statusCode).toBe(403);
    expect(crossTenantAssignment.json()).toEqual({
      code: "EMPLOYER_TENANT_ACCESS_DENIED",
    });

    const secondFinanceToken = secondFinanceCookie.slice(
      "payease_session=".length,
    );
    const secondFinanceLogin = await database.query<{ login_name: string }>(
      `SELECT account.login_name
         FROM admin_sessions session
         JOIN admin_accounts account ON account.id = session.account_id
        WHERE session.token_hash = $1`,
      [createHash("sha256").update(secondFinanceToken).digest("hex")],
    );
    const crossTenantAssignee = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/reconciliation/${workItem.rows[0]!.id}/assign`,
      headers: { cookie: firstFinanceCookie },
      payload: { assigneeLoginName: secondFinanceLogin.rows[0]!.login_name },
    });
    expect(crossTenantAssignee.statusCode).toBe(422);
    expect(crossTenantAssignee.json()).toEqual({
      code: "INVALID_FINANCE_ASSIGNEE",
    });

    const firstFinanceToken = firstFinanceCookie.slice(
      "payease_session=".length,
    );
    const firstFinanceLogin = await database.query<{ login_name: string }>(
      `SELECT account.login_name
         FROM admin_sessions session
         JOIN admin_accounts account ON account.id = session.account_id
        WHERE session.token_hash = $1`,
      [createHash("sha256").update(firstFinanceToken).digest("hex")],
    );
    const assigned = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/reconciliation/${workItem.rows[0]!.id}/assign`,
      headers: { cookie: firstFinanceCookie },
      payload: { assigneeLoginName: firstFinanceLogin.rows[0]!.login_name },
    });
    expect(assigned.statusCode).toBe(200);

    const crossTenantResolution = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/reconciliation/${workItem.rows[0]!.id}/match`,
      headers: { cookie: secondFinanceCookie },
      payload: { reasonCode: "OUT_OF_SCOPE" },
    });
    expect(crossTenantResolution.statusCode).toBe(403);
    expect(crossTenantResolution.json()).toEqual({
      code: "EMPLOYER_TENANT_ACCESS_DENIED",
    });

    const matched = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/reconciliation/${workItem.rows[0]!.id}/match`,
      headers: { cookie: firstFinanceCookie },
      payload: { reasonCode: "RECEIPT_MATCHED" },
    });
    expect(matched.statusCode).toBe(200);
    expect(matched.json()).toEqual({
      workItemId: workItem.rows[0]!.id,
      status: "MATCHED",
    });
    const closed = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/reconciliation/${workItem.rows[0]!.id}/close`,
      headers: { cookie: firstFinanceCookie },
      payload: { reasonCode: "RECEIPT_ARCHIVED" },
    });
    expect(closed.statusCode).toBe(200);
    expect(closed.json()).toEqual({
      workItemId: workItem.rows[0]!.id,
      status: "CLOSED",
    });
  });

  it("builds Day 3 lender collection UAT fixtures across payroll, direct debit, and manual payment flows", async () => {
    async function seedRepaymentApplication(args: {
      applicationNo: string;
      telegramUserRef: string;
      selectedRepaymentMethod:
        | "EMPLOYER_PAYROLL_DEDUCTION"
        | "USER_DIRECT_DEBIT"
        | "USER_MANUAL_PAYMENT";
      employerTenantId?: string;
      scheduledAmountMinor: string;
    }): Promise<void> {
      const user = await database.query<{ id: string }>(
        `INSERT INTO users (telegram_user_ref, preferred_language)
         VALUES ($1, 'en') RETURNING id`,
        [args.telegramUserRef],
      );
      const application = await database.query<{ id: string }>(
        `INSERT INTO applications
          (application_no, user_id, employer_tenant_id, requested_amount_minor,
           currency, tenor_days, status, workflow_version)
         VALUES (
           $1, $2, $3, 25000, 'USD', 30, 'REPAYMENT_ACTIVE', 'SALARY_LOAN_V2'
         )
         RETURNING id`,
        [args.applicationNo, user.rows[0]!.id, args.employerTenantId ?? null],
      );
      await database.query(
        `INSERT INTO application_repayment_preferences
          (application_id, workflow_version, selected_repayment_method,
           available_repayment_methods, employer_payroll_rule_version,
           collection_mode, collection_payee_ref)
         VALUES (
           $1, 'SALARY_LOAN_V2', $2, ARRAY[$2]::text[], $3,
           'PRINCIPAL_AND_INTEREST', 'UAT-COLLECTION-PAYEE'
         )`,
        [
          application.rows[0]!.id,
          args.selectedRepaymentMethod,
          args.selectedRepaymentMethod === "EMPLOYER_PAYROLL_DEDUCTION"
            ? "EMPLOYER-UAT-RULE"
            : null,
        ],
      );
      await database.query(
        `INSERT INTO repayment_installments
          (application_id, installment_no, due_date, amount_due_minor,
           principal_due_minor, lender_interest_due_minor, payroll_node_ref)
         VALUES
          ($1, 1, '2026-09-15', $2, 12500, 250, 'PAYDAY-1'),
          ($1, 2, '2026-09-30', 12750, 12500, 250, 'PAYDAY-2')`,
        [application.rows[0]!.id, args.scheduledAmountMinor],
      );
      if (args.selectedRepaymentMethod === "EMPLOYER_PAYROLL_DEDUCTION") {
        await database.query(
          `INSERT INTO employer_payroll_collection_instructions
            (application_id, workflow_version, employer_tenant_id,
             repayment_installment_no, selected_repayment_method,
             collection_scope, projection_status, scheduled_due_date,
             scheduled_amount_minor, currency, lender_event_ref,
             payroll_schedule_snapshot)
           VALUES (
             $1, 'SALARY_LOAN_V2', $2, 1, 'EMPLOYER_PAYROLL_DEDUCTION',
             'PRINCIPAL_AND_INTEREST', 'PAYROLL_COLLECTION_PENDING',
             '2026-09-15', $3, 'USD', 'UAT-PAYROLL-SCHEDULED-001',
             '{"fixture":"DAY3"}'::jsonb
           )`,
          [
            application.rows[0]!.id,
            args.employerTenantId,
            args.scheduledAmountMinor,
          ],
        );
      }
    }

    const employerTenant = await database.query<{ id: string }>(
      `INSERT INTO employer_tenants (external_ref, display_name)
       VALUES ('UAT_DAY3_PAYROLL', 'Day 3 payroll UAT') RETURNING id`,
    );
    const employerFinanceCookie = await adminCookieForRole(
      database,
      "EMPLOYER_FINANCE",
      "EMPLOYER",
    );
    await grantEmployerTenantMember(
      database,
      employerTenant.rows[0]!.id,
      employerFinanceCookie,
    );
    await seedRepaymentApplication({
      applicationNo: "APP-20260822-UAT-PAYROLL",
      telegramUserRef: "telegram-uat-payroll",
      selectedRepaymentMethod: "EMPLOYER_PAYROLL_DEDUCTION",
      employerTenantId: employerTenant.rows[0]!.id,
      scheduledAmountMinor: "12750",
    });
    await seedRepaymentApplication({
      applicationNo: "APP-20260822-UAT-DD",
      telegramUserRef: "telegram-uat-direct-debit",
      selectedRepaymentMethod: "USER_DIRECT_DEBIT",
      scheduledAmountMinor: "12750",
    });
    await seedRepaymentApplication({
      applicationNo: "APP-20260822-UAT-MANUAL",
      telegramUserRef: "telegram-uat-manual",
      selectedRepaymentMethod: "USER_MANUAL_PAYMENT",
      scheduledAmountMinor: "12750",
    });

    const payrollPartial = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/applications/APP-20260822-UAT-PAYROLL/employer-finance-verification",
      headers: {
        cookie: employerFinanceCookie,
        "idempotency-key": "uat-payroll-partial-0001",
      },
      payload: {
        collectionResult: "PARTIALLY_COLLECTED",
        reasonCode: "PAYROLL_PARTIAL_DEDUCTION",
        collectionSequence: 1,
        actualCollectedAmountMinor: "10000",
        evidenceReference: "PAYROLL-PARTIAL-UAT-001",
      },
    });
    expect(payrollPartial.statusCode).toBe(200);
    expect(payrollPartial.json()).toEqual({
      applicationNo: "APP-20260822-UAT-PAYROLL",
      status: "COLLECTION_EXCEPTION",
      collectionSequence: 1,
      actualCollectedAmountMinor: "10000",
      lenderCollectionWorkItemId: expect.any(String),
      lenderCollectionExceptionId: expect.any(String),
    });

    const directDebitExpired = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/applications/APP-20260822-UAT-DD/lender-collection-work-items",
      headers: {
        cookie: await adminCookieForRole(database, "BROKER_OFFICER", "BROKER"),
      },
      payload: {
        sourceType: "USER_DIRECT_DEBIT_REPORT",
        collectionResult: "AUTHORIZATION_EXPIRED",
        reasonCode: "DIRECT_DEBIT_AUTHORIZATION_EXPIRED",
        collectionSequence: 1,
        actualCollectedAmountMinor: "0",
        evidenceReference: "DD-AUTH-EXPIRED-UAT-001",
        sourceReference: "DD-AUTH-EXPIRED-UAT-001",
      },
    });
    expect(directDebitExpired.statusCode).toBe(201);
    expect(directDebitExpired.json()).toEqual({
      applicationNo: "APP-20260822-UAT-DD",
      collectionSequence: 1,
      selectedRepaymentMethod: "USER_DIRECT_DEBIT",
      workItemId: expect.any(String),
      workItemStatus: "EXCEPTION",
      exceptionId: expect.any(String),
    });

    const manualCollected = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/applications/APP-20260822-UAT-MANUAL/lender-collection-work-items",
      headers: {
        cookie: await adminCookieForRole(database, "BROKER_OFFICER", "BROKER"),
      },
      payload: {
        sourceType: "USER_MANUAL_PAYMENT_PROOF",
        collectionResult: "COLLECTED",
        reasonCode: "MANUAL_PAYMENT_RECONCILED",
        collectionSequence: 1,
        actualCollectedAmountMinor: "12750",
        evidenceReference: "MANUAL-UAT-001",
        sourceReference: "MANUAL-UAT-001",
      },
    });
    expect(manualCollected.statusCode).toBe(201);
    expect(manualCollected.json()).toEqual({
      applicationNo: "APP-20260822-UAT-MANUAL",
      collectionSequence: 1,
      selectedRepaymentMethod: "USER_MANUAL_PAYMENT",
      workItemId: expect.any(String),
      workItemStatus: "OPEN",
      exceptionId: null,
    });

    const duplicateManualCollected = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/applications/APP-20260822-UAT-MANUAL/lender-collection-work-items",
      headers: {
        cookie: await adminCookieForRole(database, "BROKER_OFFICER", "BROKER"),
      },
      payload: {
        sourceType: "USER_MANUAL_PAYMENT_PROOF",
        collectionResult: "COLLECTED",
        reasonCode: "MANUAL_PAYMENT_RECONCILED",
        collectionSequence: 1,
        actualCollectedAmountMinor: "12750",
        evidenceReference: "MANUAL-UAT-001",
        sourceReference: "MANUAL-UAT-001",
      },
    });
    expect(duplicateManualCollected.statusCode).toBe(409);
    expect(duplicateManualCollected.json()).toEqual({
      code: "DUPLICATE_COLLECTION_SOURCE_REFERENCE",
    });

    const methodMismatch = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/applications/APP-20260822-UAT-MANUAL/lender-collection-work-items",
      headers: {
        cookie: await adminCookieForRole(database, "BROKER_OFFICER", "BROKER"),
      },
      payload: {
        sourceType: "USER_DIRECT_DEBIT_REPORT",
        collectionResult: "DIRECT_DEBIT_FAILED",
        reasonCode: "WRONG_METHOD",
        collectionSequence: 1,
        actualCollectedAmountMinor: "0",
        evidenceReference: "WRONG-METHOD-UAT-001",
        sourceReference: "WRONG-METHOD-UAT-001",
      },
    });
    expect(methodMismatch.statusCode).toBe(409);
    expect(methodMismatch.json()).toEqual({
      code: "COLLECTION_SOURCE_REPAYMENT_METHOD_MISMATCH",
    });

    const repaymentQueue = await brokerApi.app.inject({
      method: "GET",
      url: "/v1/local/lender-repayment-work-items/open",
      headers: {
        cookie: await adminCookieForRole(
          database,
          "LENDER_REPAYMENT_MAKER",
          "LENDER",
        ),
      },
    });
    expect(repaymentQueue.statusCode).toBe(200);
    expect((repaymentQueue.json() as { items: unknown[] }).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          applicationNo: "APP-20260822-UAT-PAYROLL",
          selectedRepaymentMethod: "EMPLOYER_PAYROLL_DEDUCTION",
          workItemStatus: "EXCEPTION",
          collectionResult: "PARTIALLY_COLLECTED",
        }),
        expect.objectContaining({
          applicationNo: "APP-20260822-UAT-DD",
          selectedRepaymentMethod: "USER_DIRECT_DEBIT",
          workItemStatus: "EXCEPTION",
          collectionResult: "AUTHORIZATION_EXPIRED",
        }),
        expect.objectContaining({
          applicationNo: "APP-20260822-UAT-MANUAL",
          selectedRepaymentMethod: "USER_MANUAL_PAYMENT",
          workItemStatus: "OPEN",
          collectionResult: "COLLECTED",
        }),
      ]),
    );

    const openExceptions = await brokerApi.app.inject({
      method: "GET",
      url: "/v1/local/lender-collection-exceptions/open",
      headers: {
        cookie: await adminCookieForRole(
          database,
          "LENDER_REPAYMENT_CHECKER",
          "LENDER",
        ),
      },
    });
    expect(openExceptions.statusCode).toBe(200);
    const exceptions = openExceptions.json() as {
      items: Array<{ exceptionId: string; applicationNo: string }>;
    };
    expect(exceptions.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          applicationNo: "APP-20260822-UAT-PAYROLL",
        }),
        expect.objectContaining({
          applicationNo: "APP-20260822-UAT-DD",
        }),
      ]),
    );

    const resolved = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/lender-collection-exceptions/${exceptions.items[0]!.exceptionId}/resolve`,
      headers: {
        cookie: await adminCookieForRole(
          database,
          "LENDER_REPAYMENT_CHECKER",
          "LENDER",
        ),
      },
      payload: {
        reasonCode: "ALTERNATE_COLLECTION_RECORDED",
        evidenceReference: "EXCEPTION-RESOLVED-UAT-001",
      },
    });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json()).toEqual({
      exceptionId: exceptions.items[0]!.exceptionId,
      status: "RESOLVED",
    });
  });

  it("keeps complaint text encrypted while routing the final outcome to the licensed lender", async () => {
    const applicantRef = "telegram-service-case-applicant";
    const user = await database.query<{ id: string }>(
      `INSERT INTO users (telegram_user_ref, preferred_language)
       VALUES ($1, 'km') RETURNING id`,
      [applicantRef],
    );
    const applicationNo = "APP-20260815-SERVICE";
    const application = await database.query<{ id: string }>(
      `INSERT INTO applications
        (application_no, user_id, requested_amount_minor, currency, tenor_days, status)
       VALUES ($1, $2, 10000, 'USD', 30, 'REPAYMENT_ACTIVE') RETURNING id`,
      [applicationNo, user.rows[0]!.id],
    );
    const applicantToken = "service-case-applicant-token";
    await database.query(
      `INSERT INTO telegram_auth_sessions
        (token_hash, telegram_user_ref, authenticated_bot_id, expires_at, last_seen_at)
       VALUES ($1, $2, '444444444', now() + interval '15 minutes', now())`,
      [createHash("sha256").update(applicantToken).digest("hex"), applicantRef],
    );
    const applicantCookie = `__Host-payease_applicant_session=${applicantToken}`;

    const unauthenticatedCreate = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/public/applications/${applicationNo}/service-cases`,
      payload: {
        caseType: "COMPLAINT",
        message: "This should require Telegram authentication.",
      },
    });
    expect(unauthenticatedCreate.statusCode).toBe(401);

    const created = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/public/applications/${applicationNo}/service-cases`,
      headers: { cookie: applicantCookie },
      payload: {
        caseType: "COMPLAINT",
        message:
          "Please review the payment information shown for my application.",
      },
    });
    expect(created.statusCode).toBe(201);
    const caseNo = (created.json() as { caseNo: string }).caseNo;
    expect(created.json()).toMatchObject({
      caseNo,
      caseType: "COMPLAINT",
      status: "OPEN",
    });

    const stored = await database.query<{
      message_encrypted: Buffer;
      message_key_version: string;
    }>(
      "SELECT message_encrypted, message_key_version FROM applicant_service_cases WHERE case_no = $1",
      [caseNo],
    );
    expect(stored.rows[0]?.message_encrypted.toString("utf8")).not.toContain(
      "payment information",
    );
    expect(decryptPersonalValue(stored.rows[0]!.message_encrypted)).toBe(
      "Please review the payment information shown for my application.",
    );
    expect(stored.rows[0]?.message_key_version).toBe("v1");

    const applicantList = await brokerApi.app.inject({
      method: "GET",
      url: `/v1/local/public/applications/${applicationNo}/service-cases`,
      headers: { cookie: applicantCookie },
    });
    expect(applicantList.statusCode).toBe(200);
    expect(applicantList.json()).toMatchObject({
      cases: [{ caseNo, caseType: "COMPLAINT", status: "OPEN" }],
    });
    expect(JSON.stringify(applicantList.json())).not.toContain(
      "payment information",
    );
    expect(JSON.stringify(applicantList.json())).not.toContain(
      "lender_resolution_reason_code",
    );
    expect(JSON.stringify(applicantList.json())).not.toContain(
      "message_encrypted",
    );

    const employerDetail = await brokerApi.app.inject({
      method: "GET",
      url: `/v1/local/service-cases/${caseNo}`,
      headers: {
        cookie: await adminCookieForRole(database, "EMPLOYER_HR", "EMPLOYER"),
      },
    });
    expect(employerDetail.statusCode).toBe(403);

    const brokerCookie = await adminCookieForRole(
      database,
      "BROKER_OFFICER",
      "BROKER",
    );
    const queue = await brokerApi.app.inject({
      method: "GET",
      url: "/v1/local/service-cases/open",
      headers: { cookie: brokerCookie },
    });
    expect(queue.statusCode).toBe(200);
    expect(queue.json()).toMatchObject({
      cases: [
        { caseNo, applicationNo, applicantLanguage: "km", status: "OPEN" },
      ],
    });
    const detail = await brokerApi.app.inject({
      method: "GET",
      url: `/v1/local/service-cases/${caseNo}`,
      headers: { cookie: brokerCookie },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({
      caseNo,
      applicationNo,
      message:
        "Please review the payment information shown for my application.",
    });
    const creditOfficerCookie = await lenderCreditOfficerCookie(database);
    const unauthorizedAcknowledgement = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/service-cases/${caseNo}/acknowledge`,
      headers: { cookie: creditOfficerCookie },
    });
    expect(unauthorizedAcknowledgement.statusCode).toBe(403);
    const acknowledged = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/service-cases/${caseNo}/acknowledge`,
      headers: { cookie: brokerCookie },
    });
    expect(acknowledged.statusCode).toBe(200);
    expect(acknowledged.json()).toEqual({ caseNo, status: "ACKNOWLEDGED" });
    const repeatedAcknowledgement = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/service-cases/${caseNo}/acknowledge`,
      headers: { cookie: brokerCookie },
    });
    expect(repeatedAcknowledgement.statusCode).toBe(200);
    const acknowledgedApplicantList = await brokerApi.app.inject({
      method: "GET",
      url: `/v1/local/public/applications/${applicationNo}/service-cases`,
      headers: { cookie: applicantCookie },
    });
    expect(acknowledgedApplicantList.json()).toMatchObject({
      cases: [{ caseNo, status: "ACKNOWLEDGED" }],
    });
    const referred = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/service-cases/${caseNo}/refer-to-lender`,
      headers: { cookie: brokerCookie },
    });
    expect(referred.statusCode).toBe(200);
    expect(referred.json()).toEqual({ caseNo, status: "REFERRED_TO_LENDER" });
    const acknowledgementAfterReferral = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/service-cases/${caseNo}/acknowledge`,
      headers: { cookie: brokerCookie },
    });
    expect(acknowledgementAfterReferral.statusCode).toBe(409);
    expect(acknowledgementAfterReferral.json()).toMatchObject({
      code: "INVALID_SERVICE_CASE_STATE",
      currentStatus: "REFERRED_TO_LENDER",
    });
    const unauthorizedLenderQueue = await brokerApi.app.inject({
      method: "GET",
      url: "/v1/local/service-cases/referred-to-lender",
      headers: { cookie: creditOfficerCookie },
    });
    expect(unauthorizedLenderQueue.statusCode).toBe(403);
    const unauthorizedLenderDetail = await brokerApi.app.inject({
      method: "GET",
      url: `/v1/local/service-cases/${caseNo}`,
      headers: { cookie: creditOfficerCookie },
    });
    expect(unauthorizedLenderDetail.statusCode).toBe(403);
    const lenderCookie = await lenderComplaintOfficerCookie(database);
    const lenderQueue = await brokerApi.app.inject({
      method: "GET",
      url: "/v1/local/service-cases/referred-to-lender",
      headers: { cookie: lenderCookie },
    });
    expect(lenderQueue.statusCode).toBe(200);
    expect(lenderQueue.json()).toMatchObject({
      cases: [{ caseNo, applicationNo, caseType: "COMPLAINT" }],
    });
    const lenderDetail = await brokerApi.app.inject({
      method: "GET",
      url: `/v1/local/service-cases/${caseNo}`,
      headers: { cookie: lenderCookie },
    });
    expect(lenderDetail.statusCode).toBe(200);
    expect(lenderDetail.json()).toMatchObject({
      caseNo,
      message:
        "Please review the payment information shown for my application.",
    });
    const unauthorizedLenderResolution = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/service-cases/${caseNo}/lender-resolution`,
      headers: { cookie: creditOfficerCookie },
      payload: { reasonCode: "NOT_AUTHORIZED" },
    });
    expect(unauthorizedLenderResolution.statusCode).toBe(403);
    const resolved = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/service-cases/${caseNo}/lender-resolution`,
      headers: { cookie: lenderCookie },
      payload: { reasonCode: "LENDER_RESPONSE_RECORDED" },
    });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json()).toEqual({ caseNo, status: "RESOLVED" });
    const repeatedResolution = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/service-cases/${caseNo}/lender-resolution`,
      headers: { cookie: lenderCookie },
      payload: { reasonCode: "LENDER_RESPONSE_RECORDED" },
    });
    expect(repeatedResolution.statusCode).toBe(200);
    const customerCaseAudits = await database.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_events
        WHERE entity_type = 'SERVICE_CASE'
          AND entity_id = (SELECT id FROM applicant_service_cases WHERE case_no = $1)`,
      [caseNo],
    );
    expect(Number(customerCaseAudits.rows[0]?.count)).toBe(6);
    const finalApplicantList = await brokerApi.app.inject({
      method: "GET",
      url: `/v1/local/public/applications/${applicationNo}/service-cases`,
      headers: { cookie: applicantCookie },
    });
    expect(finalApplicantList.json()).toMatchObject({
      cases: [{ caseNo, status: "RESOLVED" }],
    });
    const finalApplicantPayload = JSON.stringify(finalApplicantList.json());
    expect(finalApplicantPayload).not.toContain("payment information");
    expect(finalApplicantPayload).not.toContain("LENDER_RESPONSE_RECORDED");
    expect(finalApplicantPayload).not.toContain(
      "lender_resolution_reason_code",
    );
    expect(finalApplicantPayload).not.toContain("message_encrypted");
    expect(application.rows[0]?.id).toBeDefined();
  });

  it("stores encrypted KYC location evidence and returns only sanitized status projections", async () => {
    const user = await database.query<{ id: string }>(
      `INSERT INTO users (telegram_user_ref, preferred_language)
       VALUES ('kyc-location-user', 'en')
       RETURNING id`,
    );
    await database.query(
      `INSERT INTO telegram_auth_sessions
        (token_hash, telegram_user_ref, authenticated_bot_id, expires_at, last_seen_at)
       VALUES ($1, 'kyc-location-user', '444444444', now() + interval '15 minutes', now())`,
      [createHash("sha256").update("kyc-location-session").digest("hex")],
    );
    await database.query(
      `INSERT INTO service_area_zone_versions
        (zone_ref, version, display_name, scope_type, employer_tenant_id,
         polygon_geojson, polygon_bbox, status, effective_from, effective_until,
         change_reason, created_by_user_ref, submitted_by_user_ref, submitted_at,
         reviewed_by_user_ref, reviewed_at, activated_by_user_ref, activated_at)
       VALUES (
         'ZONE-PPH-KYC', 1, 'Phnom Penh service area', 'PLATFORM', NULL,
         $1::jsonb, $2::jsonb, 'ACTIVE', '2026-09-01T00:00:00.000Z', NULL,
         'Initial rollout', 'ops-maker', 'ops-maker', now(),
         'ops-checker', now(), 'ops-checker', now()
       )`,
      [
        JSON.stringify({
          type: "Polygon",
          coordinates: [
            [
              [104.9, 11.54],
              [104.96, 11.54],
              [104.96, 11.6],
              [104.9, 11.6],
              [104.9, 11.54],
            ],
          ],
        }),
        JSON.stringify({
          minLongitude: 104.9,
          maxLongitude: 104.96,
          minLatitude: 11.54,
          maxLatitude: 11.6,
        }),
      ],
    );

    const submitted = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/public/kyc-location-evidence",
      headers: {
        cookie: "__Host-payease_applicant_session=kyc-location-session",
      },
      payload: {
        latitude: 11.5564,
        longitude: 104.9282,
        horizontalAccuracyMeters: 80,
        capturedAt: new Date().toISOString(),
        consentVersion: "KYC_LOCATION_V1",
      },
    });

    expect(submitted.statusCode).toBe(201);
    expect(submitted.json()).toMatchObject({
      kycLocation: { assessmentResult: "MATCH" },
    });
    expect(JSON.stringify(submitted.json())).not.toContain("11.5564");
    expect(JSON.stringify(submitted.json())).not.toContain("104.9282");

    const stored = await database.query<{
      latitude_encrypted: Buffer;
      longitude_encrypted: Buffer;
    }>(
      `SELECT latitude_encrypted, longitude_encrypted
         FROM kyc_location_evidence
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [user.rows[0]!.id],
    );
    expect(decryptPersonalValue(stored.rows[0]!.latitude_encrypted)).toBe(
      "11.5564",
    );
    expect(decryptPersonalValue(stored.rows[0]!.longitude_encrypted)).toBe(
      "104.9282",
    );

    const status = await brokerApi.app.inject({
      method: "GET",
      url: "/v1/local/public/kyc-location-evidence/status",
      headers: {
        cookie: "__Host-payease_applicant_session=kyc-location-session",
      },
    });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({
      kycLocation: {
        assessmentResult: "MATCH",
        submittedAt: expect.any(String),
      },
    });
    expect(JSON.stringify(status.json())).not.toContain("ZONE-PPH-KYC");

    const auditPayloads = await database.query<{ payload_hash: string }>(
      `SELECT payload_hash
         FROM audit_events
        WHERE entity_type = 'KYC_LOCATION_EVIDENCE'
        ORDER BY occurred_at DESC`,
    );
    expect(auditPayloads.rows).not.toHaveLength(0);
    expect(auditPayloads.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          payload_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      ]),
    );
    expect(
      auditPayloads.rows.some((row) => row.payload_hash.includes("104.9282")),
    ).toBe(false);
    expect(
      auditPayloads.rows.some((row) => row.payload_hash.includes("11.5564")),
    ).toBe(false);
  });

  it("enforces dual-control and overlap checks for service area zone lifecycle APIs", async () => {
    const creatorCookie = await adminCookieForRole(
      database,
      "OPS_ADMIN",
      "OPS",
    );
    const reviewerCookie = await adminCookieForRole(
      database,
      "OPS_ADMIN",
      "OPS",
    );
    const createPayload = {
      zoneRef: "ZONE-OPS-001",
      displayName: "Ops zone one",
      scopeType: "PLATFORM",
      polygonGeoJson: {
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
      },
      effectiveFrom: "2026-09-01T00:00:00.000Z",
      effectiveUntil: null,
      changeReason: "Initial rollout",
    };

    const created = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/admin/service-area-zones",
      headers: {
        cookie: creatorCookie,
        "idempotency-key": "service-area-create-001",
      },
      payload: createPayload,
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      zone: { zoneRef: "ZONE-OPS-001", version: 1, status: "DRAFT" },
    });

    const submitted = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/admin/service-area-zones/ZONE-OPS-001/drafts/1/submit-review",
      headers: {
        cookie: creatorCookie,
        "idempotency-key": "service-area-submit-001",
      },
      payload: {},
    });
    expect(submitted.statusCode).toBe(200);
    expect(submitted.json()).toMatchObject({
      zone: { status: "PENDING_REVIEW" },
    });

    const selfReview = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/admin/service-area-zones/ZONE-OPS-001/versions/1/review",
      headers: {
        cookie: creatorCookie,
        "idempotency-key": "service-area-self-review-001",
      },
      payload: { reviewNote: "self review should fail" },
    });
    expect(selfReview.statusCode).toBe(409);
    expect(selfReview.json()).toEqual({
      code: "SERVICE_AREA_ZONE_DUAL_CONTROL_REQUIRED",
    });

    const reviewed = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/admin/service-area-zones/ZONE-OPS-001/versions/1/review",
      headers: {
        cookie: reviewerCookie,
        "idempotency-key": "service-area-review-001",
      },
      payload: { reviewNote: "looks good" },
    });
    expect(reviewed.statusCode).toBe(200);

    const activated = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/admin/service-area-zones/ZONE-OPS-001/versions/1/activate",
      headers: {
        cookie: reviewerCookie,
        "idempotency-key": "service-area-activate-001",
      },
      payload: {},
    });
    expect(activated.statusCode).toBe(200);
    expect(activated.json()).toMatchObject({
      zone: { status: "ACTIVE" },
    });

    const conflicting = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/admin/service-area-zones",
      headers: {
        cookie: creatorCookie,
        "idempotency-key": "service-area-create-002",
      },
      payload: {
        ...createPayload,
        zoneRef: "ZONE-OPS-002",
        displayName: "Ops zone two",
        polygonGeoJson: {
          type: "Polygon",
          coordinates: [
            [
              [105.02, 11.72],
              [105.06, 11.72],
              [105.06, 11.76],
              [105.02, 11.76],
              [105.02, 11.72],
            ],
          ],
        },
      },
    });
    expect(conflicting.statusCode).toBe(201);

    await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/admin/service-area-zones/ZONE-OPS-002/drafts/1/submit-review",
      headers: {
        cookie: creatorCookie,
        "idempotency-key": "service-area-submit-002",
      },
      payload: {},
    });
    await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/admin/service-area-zones/ZONE-OPS-002/versions/1/review",
      headers: {
        cookie: reviewerCookie,
        "idempotency-key": "service-area-review-002",
      },
      payload: { reviewNote: "overlap candidate" },
    });
    const blockedActivation = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/admin/service-area-zones/ZONE-OPS-002/versions/1/activate",
      headers: {
        cookie: reviewerCookie,
        "idempotency-key": "service-area-activate-002",
      },
      payload: {},
    });
    expect(blockedActivation.statusCode).toBe(409);
    expect(blockedActivation.json()).toMatchObject({
      code: "SERVICE_AREA_ZONE_OVERLAPS_ACTIVE_ZONE",
      conflictingZoneRef: "ZONE-OPS-001",
      conflictingZoneVersion: 1,
    });
  });
});
