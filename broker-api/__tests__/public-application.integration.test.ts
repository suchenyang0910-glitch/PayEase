import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Never infer a destructive test target from a developer's generic
// DATABASE_URL. CI supplies this explicit, disposable PostgreSQL service.
const integrationDatabaseUrl = process.env.PAYEASE_TEST_DATABASE_URL;
const integration = integrationDatabaseUrl ? describe : describe.skip;

type BrokerApi = typeof import("../src/server.js");

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
});
