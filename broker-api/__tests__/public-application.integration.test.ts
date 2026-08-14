import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHmac } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
    ]) {
      await database.query(
        await readFile(join(migrationDir, filename), "utf8"),
      );
    }
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = integrationDatabaseUrl;
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
        outstandingMinor: "12750",
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
    process.env.TELEGRAM_BOTS_JSON = JSON.stringify([botA, botB]);
    process.env.REQUIRE_TELEGRAM_AUTH = "true";
    try {
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

      const created = await brokerApi.app.inject({
        method: "POST",
        url: "/v1/local/applications",
        headers: { cookie: firstCookie },
        payload: {
          telegramUserRef: "spoofed-user-ref-is-ignored",
          preferredLanguage: "en",
          requestedAmount: { amountMinor: "10000", currency: "USD" },
          tenorDays: 30,
        },
      });
      expect(created.statusCode).toBe(201);
      const applicationNo = (created.json() as { applicationNo: string })
        .applicationNo;
      const createdUser = await database.query<{ telegram_user_ref: string }>(
        `SELECT users.telegram_user_ref
           FROM applications JOIN users ON users.id = applications.user_id
          WHERE applications.application_no = $1`,
        [applicationNo],
      );
      expect(createdUser.rows[0]?.telegram_user_ref).toBe("telegram-42424242");

      const secondLogin = await brokerApi.app.inject({
        method: "POST",
        url: "/v1/local/public/telegram-sessions",
        payload: {
          initData: signedInitData(botB.botToken, 42424242, "bot-b-session"),
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

      const detail = await brokerApi.app.inject({
        method: "GET",
        url: `/v1/local/public/applications/${applicationNo}`,
        headers: { cookie: secondCookie },
      });
      expect(detail.statusCode).toBe(200);
      expect(detail.json()).toMatchObject({
        application: { applicationNo, requestedAmountMinor: "10000" },
      });

      const activeApplicationRetry = await brokerApi.app.inject({
        method: "POST",
        url: "/v1/local/applications",
        headers: { cookie: secondCookie },
        payload: {
          preferredLanguage: "zh-CN",
          requestedAmount: { amountMinor: "10000", currency: "USD" },
          tenorDays: 30,
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
        },
      });
      expect(unresolvedRejectionRetry.statusCode).toBe(409);
      expect(unresolvedRejectionRetry.json()).toMatchObject({
        code: "REAPPLICATION_REJECTION_CONDITION_UNRESOLVED",
        applicationNo,
        currentStatus: "REJECTED",
      });

      await database.query(
        `UPDATE applications
            SET rejection_condition_resolved = true
          WHERE application_no = $1`,
        [applicationNo],
      );
      const eligibleRetry = await brokerApi.app.inject({
        method: "POST",
        url: "/v1/local/applications",
        headers: { cookie: secondCookie },
        payload: {
          preferredLanguage: "zh-CN",
          requestedAmount: { amountMinor: "10000", currency: "USD" },
          tenorDays: 30,
        },
      });
      expect(eligibleRetry.statusCode).toBe(201);
    } finally {
      if (originalBotConfig === undefined)
        delete process.env.TELEGRAM_BOTS_JSON;
      else process.env.TELEGRAM_BOTS_JSON = originalBotConfig;
      if (originalRequireTelegramAuth === undefined)
        delete process.env.REQUIRE_TELEGRAM_AUTH;
      else process.env.REQUIRE_TELEGRAM_AUTH = originalRequireTelegramAuth;
    }
  });
});
