import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { walletChannelCallbackHeaders } from "../src/protocol.js";
import { hashLenderOperatorPassword } from "../src/operator-passwords.js";

const integrationDatabaseUrl = process.env.PAYEASE_TEST_DATABASE_URL;
const integration = integrationDatabaseUrl ? describe : describe.skip;

const schemaName = `wallet_http_${randomUUID().replace(/-/g, "")}`;
const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = join(sourceDirectory, "..", "db", "migrations");
const walletOrigin = "https://wallet.test";
const lenderOperatorOrigin = "https://lender.test";

type WalletServerModule = typeof import("../src/server.js");

let adminPool: Pool;
let adminClient: PoolClient;
let serverModule: WalletServerModule;

function schemaDatabaseUrl(baseUrl: string, schema: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("options", `-c search_path=${schema},public`);
  return url.toString();
}

function setCookieHeaders(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function cookieFromSetCookie(
  value: string | string[] | undefined,
  name: string,
): string {
  const match = setCookieHeaders(value).find((header) =>
    header.startsWith(`${name}=`),
  );
  expect(match).toBeTruthy();
  return match!.split(";")[0]!;
}

async function loginOperator(args: {
  loginName: string;
  password: string;
  roleCode:
    "LENDER_WALLET_MAKER" | "LENDER_WALLET_CHECKER" | "LENDER_WALLET_ADMIN";
}): Promise<Readonly<{ cookieHeader: string; csrfToken: string }>> {
  const passwordHash = await hashLenderOperatorPassword(args.password);
  const created = await adminClient.query<{ id: string }>(
    `INSERT INTO lender_operator_accounts (login_name, password_hash)
     VALUES ($1, $2)
     RETURNING id`,
    [args.loginName, passwordHash],
  );
  await adminClient.query(
    `INSERT INTO lender_operator_account_roles (account_id, role_code)
     VALUES ($1, $2)`,
    [created.rows[0]!.id, args.roleCode],
  );
  const login = await serverModule.app.inject({
    method: "POST",
    url: "/v1/lender-operator/auth/login",
    headers: { origin: lenderOperatorOrigin },
    payload: { loginName: args.loginName, password: args.password },
  });
  expect(login.statusCode).toBe(200);
  const sessionCookie = cookieFromSetCookie(
    login.headers["set-cookie"],
    "__Host-payease_lender_operator_session",
  );
  const csrfCookie = cookieFromSetCookie(
    login.headers["set-cookie"],
    "__Host-payease_lender_operator_csrf",
  );
  return {
    cookieHeader: `${sessionCookie}; ${csrfCookie}`,
    csrfToken: csrfCookie.split("=")[1]!,
  };
}

integration("lender-wallet-service HTTP integration", () => {
  beforeAll(async () => {
    adminPool = new Pool({ connectionString: integrationDatabaseUrl });
    adminClient = await adminPool.connect();
    await adminClient.query(`CREATE SCHEMA "${schemaName}"`);
    await adminClient.query(`SET search_path TO "${schemaName}", public`);

    const migrationFiles = (await readdir(migrationsDirectory))
      .filter((filename) => /^V\d+__.*\.sql$/.test(filename))
      .sort((left, right) => left.localeCompare(right));
    for (const filename of migrationFiles) {
      const migrationSql = await readFile(
        join(migrationsDirectory, filename),
        "utf8",
      );
      await adminClient.query(
        migrationSql.replace(
          /^CREATE EXTENSION IF NOT EXISTS pgcrypto;\s*/m,
          "",
        ),
      );
    }

    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = schemaDatabaseUrl(
      integrationDatabaseUrl!,
      schemaName,
    );
    process.env.PAYEASE_LENDER_CHANNEL_CALLBACK_SECRET = "channel-test-secret";
    process.env.PAYEASE_LENDER_WALLET_PUBLIC_ORIGIN = walletOrigin;
    process.env.PAYEASE_LENDER_OPERATOR_PUBLIC_ORIGIN = lenderOperatorOrigin;
    process.env.PAYEASE_LENDER_WALLET_INTERNAL_TOKEN =
      "internal-wallet-test-token-123456";

    vi.resetModules();
    serverModule = await import("../src/server.js");
  });

  afterAll(async () => {
    await serverModule?.close();
    if (adminClient) {
      await adminClient.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      adminClient.release();
    }
    await adminPool?.end();
  });

  it("rejects authorization confirmation without a lender session cookie", async () => {
    const response = await serverModule.app.inject({
      method: "POST",
      url: "/v1/wallet/authorizations/confirm",
      headers: {
        origin: walletOrigin,
        cookie: "__Host-payease_lender_wallet_csrf=fake-csrf",
        "x-csrf-token": "fake-csrf",
      },
      payload: { requestedAmountMinor: "8800" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ code: "LENDER_WALLET_SESSION_REQUIRED" });
  });

  it("uses independent lender-only login, role lookup, origin and CSRF checks", async () => {
    const password = "local-lender-operator-password";
    const passwordHash = await hashLenderOperatorPassword(password);
    const created = await adminClient.query<{ id: string }>(
      `INSERT INTO lender_operator_accounts
        (login_name, password_hash, preferred_language)
       VALUES ('lender.maker', $1, 'km')
       RETURNING id`,
      [passwordHash],
    );
    await adminClient.query(
      `INSERT INTO lender_operator_account_roles (account_id, role_code)
       VALUES ($1, 'LENDER_WALLET_MAKER')`,
      [created.rows[0]!.id],
    );
    const wrongOrigin = await serverModule.app.inject({
      method: "POST",
      url: "/v1/lender-operator/auth/login",
      headers: { origin: "https://evil.example" },
      payload: { loginName: "lender.maker", password },
    });
    expect(wrongOrigin.statusCode).toBe(403);

    const login = await serverModule.app.inject({
      method: "POST",
      url: "/v1/lender-operator/auth/login",
      headers: { origin: lenderOperatorOrigin },
      payload: { loginName: "lender.maker", password },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json()).toEqual({ preferredLanguage: "km" });
    const sessionCookie = cookieFromSetCookie(
      login.headers["set-cookie"],
      "__Host-payease_lender_operator_session",
    );
    const csrfCookie = cookieFromSetCookie(
      login.headers["set-cookie"],
      "__Host-payease_lender_operator_csrf",
    );
    const cookieHeader = `${sessionCookie}; ${csrfCookie}`;
    const me = await serverModule.app.inject({
      method: "GET",
      url: "/v1/lender-operator/auth/me",
      headers: { cookie: cookieHeader },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toEqual({
      accountId: created.rows[0]!.id,
      loginName: "lender.maker",
      preferredLanguage: "km",
      roles: ["LENDER_WALLET_MAKER"],
    });

    const missingCsrf = await serverModule.app.inject({
      method: "POST",
      url: "/v1/lender-operator/auth/logout",
      headers: { origin: lenderOperatorOrigin, cookie: cookieHeader },
    });
    expect(missingCsrf.statusCode).toBe(403);
    const logout = await serverModule.app.inject({
      method: "POST",
      url: "/v1/lender-operator/auth/logout",
      headers: {
        origin: lenderOperatorOrigin,
        cookie: cookieHeader,
        "x-csrf-token": csrfCookie.split("=")[1]!,
      },
    });
    expect(logout.statusCode).toBe(204);
    const expired = await serverModule.app.inject({
      method: "GET",
      url: "/v1/lender-operator/auth/me",
      headers: { cookie: cookieHeader },
    });
    expect(expired.statusCode).toBe(401);
  });

  it("rejects cross-origin authorization confirmation before reading the wallet session", async () => {
    const response = await serverModule.app.inject({
      method: "POST",
      url: "/v1/wallet/authorizations/confirm",
      headers: {
        origin: "https://evil.example",
        cookie: "__Host-payease_lender_wallet_csrf=fake-csrf",
        "x-csrf-token": "fake-csrf",
      },
      payload: {},
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ code: "WALLET_ORIGIN_FORBIDDEN" });
  });

  it("records only AUTHORIZATION_REQUESTED from the wallet page and then advances via signed callbacks", async () => {
    serverModule.setExchangeJumpHandlerForTests(async () => ({
      applicationNo: "APP-HTTP-001",
      walletOperationJumpRef: "woj_1234567890abcdef1234567890abcd",
      operationType: "WITHDRAWAL",
      externalWalletRef: "wallet-ext-http-001",
      walletStatus: "WALLET_AVAILABLE",
      availableBalanceMinor: "12500",
      currency: "USD",
      brokerSessionNonce: "nonce-http-123456",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    }));

    const entry = await serverModule.app.inject({
      method: "POST",
      url: "/v1/wallet/entry",
      headers: { origin: walletOrigin },
      payload: {
        jumpRef: "woj_1234567890abcdef1234567890abcd",
        jumpToken: "token-12345678901234567890",
        operationType: "WITHDRAWAL",
      },
    });
    expect(entry.statusCode).toBe(200);

    const sessionCookie = cookieFromSetCookie(
      entry.headers["set-cookie"],
      "__Host-payease_lender_wallet_session",
    );
    const csrfCookie = cookieFromSetCookie(
      entry.headers["set-cookie"],
      "__Host-payease_lender_wallet_csrf",
    );
    const csrfToken = csrfCookie.split("=")[1]!;
    const cookieHeader = `${sessionCookie}; ${csrfCookie}`;

    const requested = await serverModule.app.inject({
      method: "POST",
      url: "/v1/wallet/authorizations/confirm",
      headers: {
        origin: walletOrigin,
        cookie: cookieHeader,
        "x-csrf-token": csrfToken,
      },
      payload: { requestedAmountMinor: "8800" },
    });
    expect(requested.statusCode).toBe(200);
    expect(requested.json()).toMatchObject({
      duplicate: false,
      status: "PENDING_AUTH",
      requestedAmountMinor: "8800",
      settledAmountMinor: null,
      currency: "USD",
    });

    const orderRef = requested.json<{ orderRef: string }>().orderRef;

    const authorizedPayload = {
      provider: "bank-sim",
      orderRef,
      callbackRef: "callback-authorized-001",
      eventType: "AUTHORIZED",
      amountMinor: "8800",
      occurredAt: new Date().toISOString(),
      metadata: { provider: "bank-sim", bankRef: "BANK-AUTH-001" },
    } as const;
    const authorized = await serverModule.app.inject({
      method: "POST",
      url: "/v1/wallet/channel-callbacks/funds-orders",
      headers: walletChannelCallbackHeaders({
        method: "POST",
        path: "/v1/wallet/channel-callbacks/funds-orders",
        payload: authorizedPayload,
        keyId: "lender-channel-hmac-v1",
        secret: "channel-test-secret",
      }),
      payload: authorizedPayload,
    });
    expect(authorized.statusCode).toBe(200);
    expect(authorized.json()).toMatchObject({
      duplicate: false,
      orderRef,
      status: "AUTHORIZED",
      requestedAmountMinor: "8800",
      settledAmountMinor: null,
    });

    const processingPayload = {
      provider: "bank-sim",
      orderRef,
      callbackRef: "callback-processing-001",
      eventType: "PROCESSING",
      amountMinor: "8800",
      occurredAt: new Date().toISOString(),
      metadata: { provider: "bank-sim", batchRef: "BATCH-001" },
    } as const;
    const processing = await serverModule.app.inject({
      method: "POST",
      url: "/v1/wallet/channel-callbacks/funds-orders",
      headers: walletChannelCallbackHeaders({
        method: "POST",
        path: "/v1/wallet/channel-callbacks/funds-orders",
        payload: processingPayload,
        keyId: "lender-channel-hmac-v1",
        secret: "channel-test-secret",
      }),
      payload: processingPayload,
    });
    expect(processing.statusCode).toBe(200);
    expect(processing.json()).toMatchObject({
      duplicate: false,
      orderRef,
      status: "PROCESSING",
      settledAmountMinor: null,
    });

    const settledPayload = {
      provider: "bank-sim",
      orderRef,
      callbackRef: "callback-settled-001",
      eventType: "SETTLED",
      amountMinor: "8800",
      settledAmountMinor: "8800",
      occurredAt: new Date().toISOString(),
      metadata: { provider: "bank-sim", settlementRef: "SETTLEMENT-001" },
    } as const;
    const settled = await serverModule.app.inject({
      method: "POST",
      url: "/v1/wallet/channel-callbacks/funds-orders",
      headers: walletChannelCallbackHeaders({
        method: "POST",
        path: "/v1/wallet/channel-callbacks/funds-orders",
        payload: settledPayload,
        keyId: "lender-channel-hmac-v1",
        secret: "channel-test-secret",
      }),
      payload: settledPayload,
    });
    expect(settled.statusCode).toBe(200);
    expect(settled.json()).toMatchObject({
      duplicate: false,
      orderRef,
      status: "SETTLED",
      settledAmountMinor: "8800",
    });

    const projected = await adminClient.query<{ event_type: string }>(
      `SELECT event_type
         FROM wallet_operation_result_outbox
        WHERE order_ref = $1
        ORDER BY created_at ASC`,
      [orderRef],
    );
    expect(projected.rows).toEqual([
      { event_type: "AUTHORIZED" },
      { event_type: "PROCESSING" },
      { event_type: "SETTLED" },
    ]);

    const tamperedReplay = {
      ...settledPayload,
      amountMinor: "8700",
      settledAmountMinor: "8700",
    } as const;
    const tampered = await serverModule.app.inject({
      method: "POST",
      url: "/v1/wallet/channel-callbacks/funds-orders",
      headers: walletChannelCallbackHeaders({
        method: "POST",
        path: "/v1/wallet/channel-callbacks/funds-orders",
        payload: tamperedReplay,
        keyId: "lender-channel-hmac-v1",
        secret: "channel-test-secret",
      }),
      payload: tamperedReplay,
    });
    expect(tampered.statusCode).toBe(409);
    expect(tampered.json()).toEqual({
      code: "WALLET_CHANNEL_CALLBACK_REF_CONFLICT",
    });

    const replayed = await serverModule.app.inject({
      method: "POST",
      url: "/v1/wallet/channel-callbacks/funds-orders",
      headers: walletChannelCallbackHeaders({
        method: "POST",
        path: "/v1/wallet/channel-callbacks/funds-orders",
        payload: settledPayload,
        keyId: "lender-channel-hmac-v1",
        secret: "channel-test-secret",
      }),
      payload: settledPayload,
    });
    expect(replayed.statusCode).toBe(200);
    expect(replayed.json()).toMatchObject({
      duplicate: true,
      orderRef,
      status: "SETTLED",
      settledAmountMinor: "8800",
    });
  });

  it("rejects out-of-order signed callbacks that skip authorization and processing", async () => {
    serverModule.setExchangeJumpHandlerForTests(async () => ({
      applicationNo: "APP-HTTP-002",
      walletOperationJumpRef: "woj_abcdef1234567890abcdef1234567890",
      operationType: "REPAYMENT",
      externalWalletRef: "wallet-ext-http-002",
      walletStatus: "WALLET_AVAILABLE",
      availableBalanceMinor: "5000",
      currency: "USD",
      brokerSessionNonce: "nonce-http-654321",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    }));

    const entry = await serverModule.app.inject({
      method: "POST",
      url: "/v1/wallet/entry",
      headers: { origin: walletOrigin },
      payload: {
        jumpRef: "woj_abcdef1234567890abcdef1234567890",
        jumpToken: "token-abcdefghijklmnopqrstuv123456",
        operationType: "REPAYMENT",
      },
    });
    expect(entry.statusCode).toBe(200);

    const sessionCookie = cookieFromSetCookie(
      entry.headers["set-cookie"],
      "__Host-payease_lender_wallet_session",
    );
    const csrfCookie = cookieFromSetCookie(
      entry.headers["set-cookie"],
      "__Host-payease_lender_wallet_csrf",
    );
    const csrfToken = csrfCookie.split("=")[1]!;

    const snapshot = await serverModule.app.inject({
      method: "POST",
      url: "/v1/internal/repayment-snapshots",
      headers: {
        "x-lender-wallet-internal-token": "internal-wallet-test-token-123456",
      },
      payload: {
        applicationNo: "APP-HTTP-002",
        externalWalletRef: "wallet-ext-http-002",
        payableAmountMinor: "2200",
        accountingSnapshotRef: "repayment-snapshot-http-002",
        effectiveAt: new Date().toISOString(),
      },
    });
    expect(snapshot.statusCode).toBe(200);
    expect(snapshot.json()).toEqual({ accepted: true, duplicate: false });

    const requested = await serverModule.app.inject({
      method: "POST",
      url: "/v1/wallet/authorizations/confirm",
      headers: {
        origin: walletOrigin,
        cookie: `${sessionCookie}; ${csrfCookie}`,
        "x-csrf-token": csrfToken,
      },
      payload: {},
    });
    expect(requested.statusCode).toBe(200);

    const orderRef = requested.json<{ orderRef: string }>().orderRef;
    const settledPayload = {
      provider: "bank-sim",
      orderRef,
      callbackRef: "callback-settled-out-of-order-001",
      eventType: "SETTLED",
      amountMinor: "2200",
      settledAmountMinor: "2200",
      occurredAt: new Date().toISOString(),
      metadata: { provider: "bank-sim" },
    } as const;

    const response = await serverModule.app.inject({
      method: "POST",
      url: "/v1/wallet/channel-callbacks/funds-orders",
      headers: walletChannelCallbackHeaders({
        method: "POST",
        path: "/v1/wallet/channel-callbacks/funds-orders",
        payload: settledPayload,
        keyId: "lender-channel-hmac-v1",
        secret: "channel-test-secret",
      }),
      payload: settledPayload,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      code: "WALLET_CHANNEL_CALLBACK_OUT_OF_ORDER",
    });
  });

  it("requires independent maker/checker sessions to advance a controlled manual operation", async () => {
    const order = await adminClient.query<{ id: string }>(
      `SELECT id
         FROM create_lender_wallet_funds_order(
           'APP-MANUAL-001', 'wallet-manual-001', 'WALLET-MANUAL-001',
           'WITHDRAWAL', 5300, 'USD', 'manual-order-idempotency-001',
           'applicant:APP-MANUAL-001', 'manual-order-created-001', '{}'::jsonb
         )`,
    );
    const operation = await adminClient.query<{ id: string }>(
      `SELECT id
         FROM create_lender_wallet_manual_operation(
           $1, 'applicant:APP-MANUAL-001', 'manual-operation-requested-001', '{}'::jsonb
         )`,
      [order.rows[0]!.id],
    );
    const maker = await loginOperator({
      loginName: "lender.manual.maker",
      password: "controlled-maker-password",
      roleCode: "LENDER_WALLET_MAKER",
    });
    const checker = await loginOperator({
      loginName: "lender.manual.checker",
      password: "controlled-checker-password",
      roleCode: "LENDER_WALLET_CHECKER",
    });
    const queue = await serverModule.app.inject({
      method: "GET",
      url: "/v1/lender-operator/manual-operations/open",
      headers: { cookie: maker.cookieHeader },
    });
    expect(queue.statusCode).toBe(200);
    expect(
      queue
        .json<{ operations: Array<{ operationRef: string }> }>()
        .operations.some((item) => item.operationRef === operation.rows[0]!.id),
    ).toBe(true);
    const initialAudit = await serverModule.app.inject({
      method: "GET",
      url: `/v1/lender-operator/manual-operations/${operation.rows[0]!.id}/audit`,
      headers: { cookie: maker.cookieHeader },
    });
    expect(initialAudit.statusCode).toBe(200);
    expect(initialAudit.json()).toMatchObject({
      operationRef: operation.rows[0]!.id,
      events: [expect.objectContaining({ eventType: "REQUESTED" })],
    });

    const action = async (
      session: Readonly<{ cookieHeader: string; csrfToken: string }>,
      eventType: string,
      extra: Record<string, string> = {},
    ) =>
      serverModule.app.inject({
        method: "POST",
        url: `/v1/lender-operator/manual-operations/${operation.rows[0]!.id}/actions`,
        headers: {
          origin: lenderOperatorOrigin,
          cookie: session.cookieHeader,
          "x-csrf-token": session.csrfToken,
        },
        payload: { eventType, ...extra },
      });

    expect((await action(maker, "MAKER_VERIFIED")).statusCode).toBe(200);
    expect((await action(maker, "CHECKER_APPROVED")).statusCode).toBe(403);
    expect((await action(checker, "CHECKER_APPROVED")).statusCode).toBe(200);
    expect(
      (
        await action(maker, "BANK_TRANSFER_RECORDED", {
          evidenceReference: "vault://lender/manual/transfer-001",
        })
      ).statusCode,
    ).toBe(200);
    const settled = await action(checker, "SETTLED", {
      evidenceReference: "vault://lender/manual/settlement-001",
    });
    expect(settled.statusCode).toBe(200);
    expect(settled.json()).toMatchObject({
      status: "SETTLED",
      orderRef: "WALLET-MANUAL-001",
      fundsOrderStatus: "SETTLED",
    });
    const outbox = await adminClient.query<{ event_type: string }>(
      `SELECT event_type
         FROM wallet_operation_result_outbox
        WHERE order_ref = 'WALLET-MANUAL-001'
        ORDER BY created_at ASC`,
    );
    expect(outbox.rows.map((row) => row.event_type)).toEqual([
      "AUTHORIZED",
      "PROCESSING",
      "SETTLED",
    ]);
    const finalAudit = await serverModule.app.inject({
      method: "GET",
      url: `/v1/lender-operator/manual-operations/${operation.rows[0]!.id}/audit`,
      headers: { cookie: checker.cookieHeader },
    });
    expect(finalAudit.statusCode).toBe(200);
    expect(
      finalAudit
        .json<{ events: Array<{ eventType: string }> }>()
        .events.map((event) => event.eventType),
    ).toEqual([
      "REQUESTED",
      "MAKER_VERIFIED",
      "CHECKER_APPROVED",
      "BANK_TRANSFER_RECORDED",
      "SETTLED",
    ]);
  });

  it("allows only a lender-domain administrator to provision and disable operator accounts", async () => {
    const admin = await loginOperator({
      loginName: "lender.wallet.admin",
      password: "controlled-admin-password",
      roleCode: "LENDER_WALLET_ADMIN",
    });
    const maker = await loginOperator({
      loginName: "lender.wallet.nonadmin",
      password: "controlled-nonadmin-password",
      roleCode: "LENDER_WALLET_MAKER",
    });
    const blocked = await serverModule.app.inject({
      method: "GET",
      url: "/v1/lender-operator/admin/accounts",
      headers: { cookie: maker.cookieHeader },
    });
    expect(blocked.statusCode).toBe(403);
    const created = await serverModule.app.inject({
      method: "POST",
      url: "/v1/lender-operator/admin/accounts",
      headers: {
        origin: lenderOperatorOrigin,
        cookie: admin.cookieHeader,
        "x-csrf-token": admin.csrfToken,
      },
      payload: {
        loginName: "lender.wallet.newchecker",
        password: "controlled-newchecker-password",
        preferredLanguage: "zh-CN",
        roles: ["LENDER_WALLET_CHECKER"],
      },
    });
    expect(created.statusCode).toBe(201);
    const accountId = created.json<{ accountId: string }>().accountId;
    const accounts = await serverModule.app.inject({
      method: "GET",
      url: "/v1/lender-operator/admin/accounts",
      headers: { cookie: admin.cookieHeader },
    });
    expect(accounts.statusCode).toBe(200);
    const adminAccountId = accounts
      .json<{ accounts: Array<{ accountId: string; loginName: string }> }>()
      .accounts.find(
        (account) => account.loginName === "lender.wallet.admin",
      )?.accountId;
    expect(adminAccountId).toBeTruthy();
    const selfDisable = await serverModule.app.inject({
      method: "PATCH",
      url: `/v1/lender-operator/admin/accounts/${adminAccountId}`,
      headers: {
        origin: lenderOperatorOrigin,
        cookie: admin.cookieHeader,
        "x-csrf-token": admin.csrfToken,
      },
      payload: { isActive: false },
    });
    expect(selfDisable.statusCode).toBe(409);
    const disableNewChecker = await serverModule.app.inject({
      method: "PATCH",
      url: `/v1/lender-operator/admin/accounts/${accountId}`,
      headers: {
        origin: lenderOperatorOrigin,
        cookie: admin.cookieHeader,
        "x-csrf-token": admin.csrfToken,
      },
      payload: { isActive: false },
    });
    expect(disableNewChecker.statusCode).toBe(204);
    const newCheckerLogin = await serverModule.app.inject({
      method: "POST",
      url: "/v1/lender-operator/auth/login",
      headers: { origin: lenderOperatorOrigin },
      payload: {
        loginName: "lender.wallet.newchecker",
        password: "controlled-newchecker-password",
      },
    });
    expect(newCheckerLogin.statusCode).toBe(401);
  });
});
