import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { walletChannelCallbackHeaders } from "../src/protocol.js";

const integrationDatabaseUrl = process.env.PAYEASE_TEST_DATABASE_URL;
const integration = integrationDatabaseUrl ? describe : describe.skip;

const schemaName = `wallet_http_${randomUUID().replace(/-/g, "")}`;
const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = join(sourceDirectory, "..", "db", "migrations");
const walletOrigin = "https://wallet.test";

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
});
