import { afterAll, describe, expect, it } from "vitest";
import { walletChannelCallbackHeaders } from "../src/protocol.js";

process.env.NODE_ENV = "test";
delete process.env.DATABASE_URL;
process.env.PAYEASE_LENDER_CHANNEL_CALLBACK_SECRET = "channel-test-secret";
process.env.PAYEASE_LENDER_WALLET_PUBLIC_ORIGIN = "https://wallet.test";

const { app, close, sessions, setExchangeJumpHandlerForTests } =
  await import("../src/server.js");

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

describe("wallet web entry", () => {
  afterAll(async () => {
    await close();
  });

  it("serves an HTML entry page that exchanges fragment tickets", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/wallet/entry?jump_ref=woj_1234567890abcdef1234567890abcd&operation=WITHDRAWAL",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("Opening SMILE Wallet");
    expect(response.body).toContain("jump_token");
    expect(response.body).toContain('fetch("/v1/wallet/entry"');
  });

  it("serves an authorization page that reads the lender wallet session", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/wallet/authorize",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("Authorize Wallet Operation");
    expect(response.body).toContain('fetch("/v1/wallet/session"');
    expect(response.body).toContain("Confirm authorization request");
  });

  it("exchanges a wallet ticket, sets an HttpOnly cookie, and exposes the session", async () => {
    setExchangeJumpHandlerForTests(async () => ({
      applicationNo: "APP-WEB-ENTRY-001",
      walletOperationJumpRef: "woj_1234567890abcdef1234567890abcd",
      operationType: "WITHDRAWAL",
      externalWalletRef: "wallet-ext-web-001",
      walletStatus: "WALLET_AVAILABLE",
      availableBalanceMinor: "12500",
      currency: "USD",
      brokerSessionNonce: "nonce-123456789012",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    }));

    const entry = await app.inject({
      method: "POST",
      url: "/v1/wallet/entry",
      headers: {
        origin: "https://wallet.test",
      },
      payload: {
        jumpRef: "woj_1234567890abcdef1234567890abcd",
        jumpToken: "token-12345678901234567890",
        operationType: "WITHDRAWAL",
      },
    });

    expect(entry.statusCode).toBe(200);
    expect(entry.json()).toMatchObject({
      applicationNo: "APP-WEB-ENTRY-001",
      operationType: "WITHDRAWAL",
    });
    const setCookie = setCookieHeaders(entry.headers["set-cookie"]);
    expect(
      setCookie.some((header) =>
        header.startsWith("__Host-payease_lender_wallet_session="),
      ),
    ).toBe(true);
    expect(setCookie.some((header) => header.includes("HttpOnly"))).toBe(true);
    expect(
      setCookie.some((header) =>
        header.startsWith("__Host-payease_lender_wallet_csrf="),
      ),
    ).toBe(true);

    const session = await app.inject({
      method: "GET",
      url: "/v1/wallet/session",
      headers: {
        cookie: cookieFromSetCookie(
          entry.headers["set-cookie"],
          "__Host-payease_lender_wallet_session",
        ),
      },
    });
    expect(session.statusCode).toBe(200);
    expect(session.json()).toMatchObject({
      applicationNo: "APP-WEB-ENTRY-001",
      operationType: "WITHDRAWAL",
      availableBalanceMinor: "12500",
    });
  });

  it("returns the current wallet session from the HttpOnly cookie", async () => {
    const session = sessions.create({
      applicationNo: "APP-WEB-001",
      walletOperationJumpRef: "woj_1234567890abcdef1234567890abcd",
      operationType: "WITHDRAWAL",
      externalWalletRef: "wallet-ext-web-001",
      walletStatus: "WALLET_AVAILABLE",
      availableBalanceMinor: "12500",
      currency: "USD",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/wallet/session",
      headers: {
        cookie: `__Host-payease_lender_wallet_session=${session.sessionToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      applicationNo: "APP-WEB-001",
      walletOperationJumpRef: "woj_1234567890abcdef1234567890abcd",
      operationType: "WITHDRAWAL",
      walletStatus: "WALLET_AVAILABLE",
      availableBalanceMinor: "12500",
      currency: "USD",
    });
  });

  it("rejects cross-origin wallet entry exchange before ticket redemption", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/wallet/entry",
      headers: {
        origin: "https://evil.example",
      },
      payload: {
        jumpRef: "woj_1234567890abcdef1234567890abcd",
        jumpToken: "token-12345678901234567890",
        operationType: "WITHDRAWAL",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ code: "WALLET_ORIGIN_FORBIDDEN" });
  });

  it("rejects authorization confirmation without a valid double-submit CSRF token", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/wallet/authorizations/confirm",
      headers: {
        origin: "https://wallet.test",
        cookie:
          "__Host-payease_lender_wallet_session=fake-session; __Host-payease_lender_wallet_csrf=fake-csrf",
      },
      payload: {},
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ code: "WALLET_CSRF_TOKEN_INVALID" });
  });

  it("surfaces upstream ticket rejection when the broker exchange cannot redeem the jump", async () => {
    setExchangeJumpHandlerForTests(async () => {
      throw new Error("WALLET_OPERATION_JUMP_NOT_FOUND");
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/wallet/entry",
      headers: {
        origin: "https://wallet.test",
      },
      payload: {
        jumpRef: "woj_1234567890abcdef1234567890abcd",
        jumpToken: "token-12345678901234567890",
        operationType: "WITHDRAWAL",
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      code: "WALLET_OPERATION_JUMP_NOT_FOUND",
    });
  });

  it("rejects wallet channel callbacks with a bad signature before any database call", async () => {
    const payload = {
      provider: "bank-sim",
      orderRef: "WALLET-ORDER-001",
      callbackRef: "callback-001",
      eventType: "AUTHORIZED",
      amountMinor: "8800",
      occurredAt: new Date().toISOString(),
      metadata: { provider: "bank-sim" },
    };
    const headers = walletChannelCallbackHeaders({
      method: "POST",
      path: "/v1/wallet/channel-callbacks/funds-orders",
      payload,
      keyId: "lender-channel-hmac-v1",
      secret: "wrong-secret",
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/wallet/channel-callbacks/funds-orders",
      headers,
      payload,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ code: "WALLET_CHANNEL_BAD_SIGNATURE" });
  });
});
