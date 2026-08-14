import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash, createHmac } from "node:crypto";
import { Pool } from "pg";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decryptPersonalProfile } from "../src/personal-profile.js";

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
  domain: "BROKER" | "LENDER" | "EMPLOYER",
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

integration("public applicant access", () => {
  let database: Pool;
  let brokerApi: BrokerApi;

  beforeAll(async () => {
    database = new Pool({ connectionString: integrationDatabaseUrl, max: 1 });
    await database.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
    const migrationDir = join(
      process.cwd(),
      "..",
      "broker-platform",
      "db",
      "migrations",
    );
    for (const filename of [
      "V0001__controlled_pilot.sql",
      "V0002__reconciliation_work_items.sql",
      "V0003__admin_rbac_and_sessions.sql",
      "V0004__employer_finance_verification.sql",
      "V0005__user_offer_access.sql",
      "V0006__loan_terms_and_repayment_schedule.sql",
      "V0007__repayment_installment_dual_control.sql",
      "V0008__telegram_multi_bot_auth_sessions.sql",
      "V0009__protect_paid_repayment_installments.sql",
      "V0010__encrypted_personal_profiles.sql",
      "V0011__user_contract_confirmation.sql",
      "V0012__supplement_review_rounds.sql",
      "V0013__repayment_amount_integrity.sql",
      "V0014__application_status_transition_integrity.sql",
    ]) {
      await database.query(
        await readFile(join(migrationDir, filename), "utf8"),
      );
    }
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = integrationDatabaseUrl;
    process.env.PAYEASE_PII_ENCRYPTION_KEY = Buffer.alloc(32, 4).toString(
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

    const created = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/applications",
      payload: {
        telegramUserRef: "integration-user-private-profile",
        preferredLanguage: "en",
        requestedAmount: { amountMinor: "10000", currency: "USD" },
        tenorDays: 30,
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
    }>(
      `SELECT u.full_name_encrypted, u.phone_encrypted, u.employer_name_encrypted,
              u.personal_data_consent_version, u.personal_data_key_version
              , u.phone_consent_version, u.phone_consented_at
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
    const applicantCookie = String(created.headers["set-cookie"]).split(
      ";",
    )[0]!;
    const brokerCookie = await adminCookieForRole(
      database,
      "BROKER_OFFICER",
      "BROKER",
    );
    const returned = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/applications/${applicationNo}/broker-review`,
      headers: { cookie: brokerCookie },
      payload: { decision: "RETURNED", reasonCode: "SUPPLEMENT_REQUIRED" },
    });
    expect(returned.statusCode).toBe(200);
    expect(returned.json()).toMatchObject({
      applicationNo,
      status: "BROKER_REVIEW",
      decision: "RETURNED",
    });
    const applicantView = await brokerApi.app.inject({
      method: "GET",
      url: `/v1/local/public/applications/${applicationNo}`,
      headers: { cookie: applicantCookie },
    });
    expect(applicantView.statusCode).toBe(200);
    expect(applicantView.json()).toMatchObject({
      application: { supplementRequested: true },
    });
    const approved = await brokerApi.app.inject({
      method: "POST",
      url: `/v1/local/applications/${applicationNo}/broker-review`,
      headers: { cookie: brokerCookie },
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
    const botA = {
      botId: "123456789",
      botToken: "123456789:integration-bot-token-alpha-123456",
    };
    const botB = {
      botId: "987654321",
      botToken: "987654321:integration-bot-token-bravo-123456",
    };
    process.env.REQUIRE_TELEGRAM_AUTH = "true";
    try {
      // A deployment configuration error may be logged for operators, but its
      // parser detail must never reach a public client response.
      process.env.TELEGRAM_BOTS_JSON = "{not-valid-json";
      const malformedConfig = await brokerApi.app.inject({
        method: "POST",
        url: "/v1/local/public/telegram-sessions",
        payload: { initData: "x".repeat(32) },
      });
      expect(malformedConfig.statusCode).toBe(500);
      expect(malformedConfig.json()).toEqual({ code: "INTERNAL_ERROR" });

      process.env.TELEGRAM_BOTS_JSON = JSON.stringify([botA, botB]);
      const personalProfile = {
        fullName: "Authenticated Applicant",
        phone: "+85512345678",
        employerName: "Pilot Factory",
      };
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
      const firstCookie = String(firstLogin.headers["set-cookie"]).split(
        ";",
      )[0]!;
      const replayGuard = await database.query<{ retained: boolean }>(
        `SELECT expires_at > now() + interval '119 minutes' AS retained
           FROM telegram_initdata_replay_guards
          WHERE authenticated_bot_id = $1`,
        [botA.botId],
      );
      expect(replayGuard.rows[0]?.retained).toBe(true);

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

      const created = await brokerApi.app.inject({
        method: "POST",
        url: "/v1/local/applications",
        headers: { cookie: firstCookie },
        payload: {
          telegramUserRef: "spoofed-user-ref-is-ignored",
          preferredLanguage: "en",
          requestedAmount: { amountMinor: "10000", currency: "USD" },
          tenorDays: 30,
          personalProfile,
          personalDataAndPhoneConsent: true,
        },
      });
      expect(created.statusCode).toBe(201);
      const applicationNo = (created.json() as { applicationNo: string })
        .applicationNo;
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
      // fallback Bot remains able to access the same Telegram-ID-owned record.
      process.env.TELEGRAM_BOTS_JSON = JSON.stringify([
        { ...botA, enabled: false },
        { ...botB, enabled: true },
      ]);
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
      const unresolvedRejectionRetry = await brokerApi.app.inject({
        method: "POST",
        url: "/v1/local/applications",
        headers: { cookie: secondCookie },
        payload: {
          preferredLanguage: "zh-CN",
          requestedAmount: { amountMinor: "10000", currency: "USD" },
          tenorDays: 30,
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
          personalProfile,
          personalDataAndPhoneConsent: true,
        },
      });
      expect(eligibleRetry.statusCode).toBe(201);

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
    }
  });

  it("records the full manual pilot lifecycle with distinct approval accounts", async () => {
    const created = await brokerApi.app.inject({
      method: "POST",
      url: "/v1/local/applications",
      payload: {
        telegramUserRef: "integration-lifecycle-user",
        preferredLanguage: "en",
        requestedAmount: { amountMinor: "25000", currency: "USD" },
        tenorDays: 30,
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
    ) => {
      const response = await brokerApi.app.inject({
        method: "POST",
        url: `/v1/local/applications/${applicationNo}/${route}`,
        headers: { cookie },
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
    await call(
      "employer-verification",
      await adminCookieForRole(database, "EMPLOYER_HR", "EMPLOYER"),
      { decision: "APPROVED", reasonCode: "EMPLOYMENT_CONFIRMED" },
      "EMPLOYER_FINANCE_VERIFICATION",
    );
    await call(
      "employer-finance-verification",
      await adminCookieForRole(database, "EMPLOYER_FINANCE", "EMPLOYER"),
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
        installmentCount: 1,
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
    await call(
      "disbursement-release",
      disbursementMaker,
      { reasonCode: "MANUAL_DISBURSEMENT_RECORDED" },
      "DISBURSEMENT_PENDING",
    );
    await call(
      "disbursement-confirmation",
      await adminCookieForRole(
        database,
        "LENDER_DISBURSEMENT_CHECKER",
        "LENDER",
      ),
      {
        reasonCode: "MANUAL_DISBURSEMENT_CONFIRMED",
        evidenceReference: "DISBURSEMENT-INTEGRATION-001",
      },
      "DISBURSED",
    );
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
    await call(
      "repayment-write-off",
      repaymentMaker,
      { reasonCode: "MANUAL_PAYMENT_RECEIVED" },
      "REPAYMENT_ACTIVE",
    );
    await call(
      "repayment-confirmation",
      await adminCookieForRole(database, "LENDER_REPAYMENT_CHECKER", "LENDER"),
      {
        reasonCode: "MANUAL_PAYMENT_CONFIRMED",
        evidenceReference: "REPAYMENT-INTEGRATION-001",
      },
      "SETTLED",
    );

    const applicantView = await brokerApi.app.inject({
      method: "GET",
      url: `/v1/local/public/applications/${applicationNo}`,
      headers: { cookie: applicantCookie },
    });
    expect(applicantView.statusCode).toBe(200);
    expect(applicantView.json()).toMatchObject({
      application: { status: "SETTLED", approvedAmountMinor: "25000" },
      repayment: {
        periodCount: 1,
        paidPeriods: 1,
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
});
