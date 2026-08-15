import { createHash, createHmac } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runDatabaseMigrations } from "../src/database-migrations.js";
import {
  decryptPersonalProfile,
  decryptPersonalValue,
} from "../src/personal-profile.js";
import { hashPassword } from "../src/passwords.js";

// Never infer a destructive test target from a developer's generic
// DATABASE_URL. CI supplies this explicit, disposable PostgreSQL service.
const integrationDatabaseUrl = process.env.PAYEASE_TEST_DATABASE_URL;
const integration = integrationDatabaseUrl ? describe : describe.skip;

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

integration("public applicant access", () => {
  let database: Pool;
  let brokerApi: BrokerApi;

  beforeAll(async () => {
    database = new Pool({ connectionString: integrationDatabaseUrl, max: 1 });
    await database.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
    await runDatabaseMigrations(database);
    // A production restart must not rerun or mutate an applied migration.
    await runDatabaseMigrations(database);
    const appliedMigrations = await database.query<{ filename: string }>(
      "SELECT filename FROM schema_migrations ORDER BY filename",
    );
    expect(appliedMigrations.rows.at(-1)).toEqual({
      filename: "V0027__employment_identity_match_gate.sql",
    });
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = integrationDatabaseUrl;
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
      },
    ]);
    brokerApi = await import("../src/server.js");
  });

  afterAll(async () => {
    await brokerApi?.close();
    await database?.end();
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

  it("lists only active factory tenants for an unauthenticated applicant selector", async () => {
    const active = await database.query<{ id: string }>(
      `INSERT INTO employer_tenants (external_ref, display_name, is_active)
       VALUES ('LANHAI_FACTORY_A', 'Lanhai Factory A', true)
       RETURNING id`,
    );
    await database.query(
      `INSERT INTO employer_tenants (external_ref, display_name, is_active)
       VALUES ('LANHAI_FACTORY_ARCHIVE', 'Archived factory', false)`,
    );

    const response = await brokerApi.app.inject({
      method: "GET",
      url: "/v1/local/public/employer-tenants",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      tenants: [
        {
          id: active.rows[0]!.id,
          displayName: "Lanhai Factory A",
        },
      ],
    });
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
      payload: {
        telegramUserRef: "deactivated-factory-review-user",
        preferredLanguage: "en",
        requestedAmount: { amountMinor: "10000", currency: "USD" },
        tenorDays: 30,
      },
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
      payload: {
        telegramUserRef: "identity-mismatch-user",
        preferredLanguage: "en",
        requestedAmount: { amountMinor: "10000", currency: "USD" },
        tenorDays: 30,
        employerTenantId: tenant.rows[0]!.id,
        identityDocument: { type: "PASSPORT", number: "P-100 001" },
      },
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
      payload: {
        telegramUserRef: "integration-user-001",
        preferredLanguage: "en",
        requestedAmount: { amountMinor: "25000", currency: "USD" },
        tenorDays: 30,
      },
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
      "UPDATE applications SET approved_amount_minor = 25000 WHERE id = $1",
      [applicationId],
    );
    await database.query(
      `INSERT INTO repayment_installments
        (application_id, installment_no, due_date, amount_due_minor)
       VALUES ($1, 1, '2026-09-15', 12750),
              ($1, 2, '2026-10-15', 12750)`,
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
      terms: {
        approvedAmountMinor: "25000",
        serviceFeeMinor: "500",
        totalRepayableMinor: "25500",
        installmentCount: 2,
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
      payload: {
        telegramUserRef: "integration-user-002",
        preferredLanguage: "en",
        requestedAmount: { amountMinor: "1000", currency: "USD" },
        tenorDays: 7,
      },
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
      payload: {
        telegramUserRef: "integration-user-missing-consent",
        preferredLanguage: "en",
        requestedAmount: { amountMinor: "10000", currency: "USD" },
        tenorDays: 30,
        personalProfile: profile,
      },
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
      payload: {
        telegramUserRef: "integration-user-private-profile",
        preferredLanguage: "en",
        requestedAmount: { amountMinor: "10000", currency: "USD" },
        tenorDays: 30,
        employerTenantId: tenant.rows[0]!.id,
        identityDocument,
        personalProfile: profile,
        personalDataAndPhoneConsent: true,
      },
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
      identityDocumentProvided: true,
      personalDataAndPhoneConsent: true,
      personalDataConsentVersion: "PAYEASE-PERSONAL-DATA-v1",
      personalDataConsentLanguage: "en",
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
      payload: {
        telegramUserRef: "identity-collision-first-account",
        preferredLanguage: "en",
        requestedAmount: { amountMinor: "10000", currency: "USD" },
        tenorDays: 30,
        employerTenantId: tenant.rows[0]!.id,
        identityDocument: { type: "PASSPORT", number: "P-77 001" },
      },
    });
    expect(first.statusCode).toBe(201);
    const firstApplicationNo = (first.json() as { applicationNo: string })
      .applicationNo;

    const second = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/applications",
      payload: {
        telegramUserRef: "identity-collision-second-account",
        preferredLanguage: "en",
        requestedAmount: { amountMinor: "10000", currency: "USD" },
        tenorDays: 30,
        employerTenantId: tenant.rows[0]!.id,
        // Normalization must make spacing and case irrelevant to matching.
        identityDocument: { type: "PASSPORT", number: "p-77001" },
      },
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
      payload: {
        telegramUserRef: "integration-user-supplement",
        preferredLanguage: "en",
        requestedAmount: { amountMinor: "10000", currency: "USD" },
        tenorDays: 30,
      },
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
        payload: {
          preferredLanguage: "en",
          requestedAmount: { amountMinor: "10000", currency: "USD" },
          tenorDays: 30,
        },
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
        payload: {
          preferredLanguage: "en",
          requestedAmount: { amountMinor: "10000", currency: "USD" },
          tenorDays: 30,
          identityDocument: { type: "NATIONAL_ID", number: "ID-2026-0001" },
          personalProfile,
          personalDataAndPhoneConsent: true,
        },
      });
      expect(missingFactory.statusCode).toBe(422);
      expect(missingFactory.json()).toEqual({
        code: "EMPLOYER_TENANT_REQUIRED",
      });

      const created = await brokerApi.app.inject({
        method: "POST",
        url: "/v1/local/applications",
        headers: { cookie: firstCookie },
        payload: {
          telegramUserRef: "spoofed-user-ref-is-ignored",
          preferredLanguage: "en",
          requestedAmount: { amountMinor: "10000", currency: "USD" },
          tenorDays: 30,
          employerTenantId: authenticatedTenant.rows[0]!.id,
          identityDocument: { type: "NATIONAL_ID", number: "ID-2026-0001" },
          personalProfile,
          personalDataAndPhoneConsent: true,
        },
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
        payload: {
          preferredLanguage: "zh-CN",
          requestedAmount: { amountMinor: "10000", currency: "USD" },
          tenorDays: 30,
          employerTenantId: authenticatedTenant.rows[0]!.id,
          identityDocument: { type: "NATIONAL_ID", number: "ID-2026-0001" },
          personalProfile,
          personalDataAndPhoneConsent: true,
        },
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
      expect(JSON.stringify(rejectedDetail.json())).not.toContain(
        "SALARY_NOT_VERIFIED",
      );
      const unresolvedRejectionRetry = await brokerApi.app.inject({
        method: "POST",
        url: "/v1/local/applications",
        headers: { cookie: secondCookie },
        payload: {
          preferredLanguage: "zh-CN",
          requestedAmount: { amountMinor: "10000", currency: "USD" },
          tenorDays: 30,
          employerTenantId: authenticatedTenant.rows[0]!.id,
          identityDocument: { type: "NATIONAL_ID", number: "ID-2026-0001" },
          personalProfile,
          personalDataAndPhoneConsent: true,
        },
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
        payload: {
          preferredLanguage: "zh-CN",
          requestedAmount: { amountMinor: "10000", currency: "USD" },
          tenorDays: 30,
          employerTenantId: authenticatedTenant.rows[0]!.id,
          identityDocument: { type: "NATIONAL_ID", number: "ID-2026-0001" },
          personalProfile,
          personalDataAndPhoneConsent: true,
        },
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
          payload: { preferredLanguage: "en" },
        });
        expect(acceptedApplicantCsrf.statusCode).toBe(200);
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
      payload: {
        telegramUserRef: "integration-withdrawal-user",
        preferredLanguage: "en",
        requestedAmount: { amountMinor: "25000", currency: "USD" },
        tenorDays: 30,
      },
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

  it("records the full manual pilot lifecycle with distinct approval accounts", async () => {
    const tenant = await database.query<{ id: string }>(
      `INSERT INTO employer_tenants (external_ref, display_name)
       VALUES ('LIFECYCLE_FACTORY', 'Lifecycle factory') RETURNING id`,
    );
    const created = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/applications",
      payload: {
        telegramUserRef: "integration-lifecycle-user",
        preferredLanguage: "en",
        requestedAmount: { amountMinor: "25000", currency: "USD" },
        tenorDays: 30,
        employerTenantId: tenant.rows[0]!.id,
        identityDocument: { type: "NATIONAL_ID", number: "KH-ID-10001" },
      },
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
          requestedAmountMinor: "25000",
          stage: "EMPLOYER_VERIFICATION",
          employerTenantId: tenant.rows[0]!.id,
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
      "EMPLOYER_FINANCE_VERIFICATION",
    );
    const financeQueue = await brokerApi.app.inject({
      method: "GET",
      url: "/v1/local/employer/verifications/open",
      headers: { cookie: employerFinanceCookie },
    });
    expect(financeQueue.statusCode).toBe(200);
    expect(financeQueue.json()).toMatchObject({
      items: [{ applicationNo, stage: "EMPLOYER_FINANCE_VERIFICATION" }],
    });
    expect(JSON.stringify(financeQueue.json())).not.toContain("NATIONAL_ID");
    expect(JSON.stringify(financeQueue.json())).not.toContain("MATCHED");
    await call(
      "employer-finance-verification",
      employerFinanceCookie,
      { decision: "APPROVED", reasonCode: "SALARY_RANGE_CONFIRMED" },
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
        serviceFeeMinor: "500",
        totalRepayableMinor: "25500",
        installmentCount: 2,
        firstDueDate: "2026-09-15",
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
    expect(repeatedFirstRepaymentWriteOff.json()).toEqual({
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
    expect(repeatedFirstRepaymentConfirmation.json()).toEqual({
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
      terms: { serviceFeeMinor: "500", totalRepayableMinor: "25500" },
    });
    const auditEvents = await database.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM audit_events WHERE entity_id = (SELECT id FROM applications WHERE application_no = $1)",
      [applicationNo],
    );
    expect(Number(auditEvents.rows[0]?.count)).toBeGreaterThanOrEqual(11);
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
});
