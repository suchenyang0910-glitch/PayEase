import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { readFileSync } from "node:fs";
import https from "node:https";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { Pool, type PoolClient } from "pg";
import {
  sha256Hex,
  signDomainEventRequest,
  stableJson,
  type DomainEventEnvelope,
} from "@payease/shared-security";
import { z } from "zod";
import {
  brokerJumpExchangeResponseSchema,
  createWalletOperationResultEvent,
  createWalletStatusEvent,
  walletChannelCallbackHeadersSchema,
  walletChannelCallbackRequestSchema,
  walletChannelCallbackHeaders,
  walletBrokerRequestHeaders,
  verifyWalletChannelCallbackRequest,
  type BrokerJumpExchangeResponse,
  type WalletChannelCallbackRequest,
} from "./protocol.js";
import { runDatabaseMigrations } from "./database-migrations.js";
import {
  createFundsOrder,
  transitionFundsOrder,
  type FundsOrderRow,
} from "./funds-orders.js";
import { WalletSessionStore, type WalletSession } from "./wallet-sessions.js";

const app = Fastify({ logger: true });
const sessions = new WalletSessionStore();

const isTestMode = process.env.NODE_ENV === "test";
const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl && !isTestMode) {
  throw new Error("DATABASE_URL is required.");
}
const pool = databaseUrl
  ? new Pool({ connectionString: databaseUrl, max: 5 })
  : undefined;

type InternalWorkerHeaders = Readonly<{
  token: string;
}>;

type MtlsConfig = Readonly<{
  cert: Buffer;
  key: Buffer;
  ca: Buffer;
  passphrase?: string;
}>;

type WalletStatus = WalletSession["walletStatus"];
type WalletOperationType = WalletSession["operationType"];

type OutboxRow = Readonly<{
  event_id: string;
  external_application_ref: string;
  idempotency_key: string;
  occurred_at: string;
  payload: {
    externalWalletRef: string;
    walletStatus: WalletStatus;
    availableBalanceMinor: string;
    currency: "USD";
  };
}>;

type WalletChannelCallbackEventType = WalletChannelCallbackRequest["eventType"];
type SetCookieHeader = string | string[] | undefined;

type WalletOperationResultOutboxRow = Readonly<{
  event_id: string;
  event_type: "AUTHORIZED" | "PROCESSING" | "SETTLED" | "FAILED";
  external_application_ref: string;
  order_ref: string;
  idempotency_key: string;
  occurred_at: string;
  payload: {
    externalWalletRef: string;
    orderRef: string;
    operationType: "WITHDRAWAL" | "REPAYMENT";
    operationStatus: "AUTHORIZED" | "PROCESSING" | "SETTLED" | "FAILED";
    requestedAmountMinor: string;
    settledAmountMinor: string | null;
    currency: "USD";
  };
}>;

function env(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function requireHttpsUrl(name: string): URL {
  const url = new URL(env(name));
  if (url.protocol !== "https:") {
    throw new Error(`${name} must use HTTPS.`);
  }
  return url;
}

function walletPublicOrigin(): string | undefined {
  const configured = process.env.PAYEASE_LENDER_WALLET_PUBLIC_ORIGIN?.trim();
  if (!configured) {
    if (isTestMode) return undefined;
    throw new Error("PAYEASE_LENDER_WALLET_PUBLIC_ORIGIN is required.");
  }
  const url = new URL(configured);
  if (url.protocol !== "https:") {
    throw new Error("PAYEASE_LENDER_WALLET_PUBLIC_ORIGIN must use HTTPS.");
  }
  if (url.username || url.password || url.hash || url.search) {
    throw new Error(
      "PAYEASE_LENDER_WALLET_PUBLIC_ORIGIN must not include credentials, query, or fragment.",
    );
  }
  return url.origin;
}

function loadMtlsConfig(): MtlsConfig {
  return {
    cert: readFileSync(env("PAYEASE_WALLET_MTLS_CLIENT_CERT_PATH")),
    key: readFileSync(env("PAYEASE_WALLET_MTLS_CLIENT_KEY_PATH")),
    ca: readFileSync(env("PAYEASE_WALLET_MTLS_CA_CERT_PATH")),
    ...(process.env.PAYEASE_WALLET_MTLS_CLIENT_KEY_PASSPHRASE
      ? {
          passphrase: process.env.PAYEASE_WALLET_MTLS_CLIENT_KEY_PASSPHRASE,
        }
      : {}),
  };
}

function walletStatusEventHeaders(
  event: DomainEventEnvelope,
): Readonly<Record<string, string>> {
  const timestampMillis = String(Date.now());
  const nonce = `wallet-event-${randomUUID()}`;
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
      secret: env("PAYEASE_LENDER_EVENT_SHARED_SECRET"),
    }),
  };
}

function secureCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function assertPool(): Pool {
  if (!pool) {
    throw new Error("DATABASE_URL is required.");
  }
  return pool;
}

async function httpsJsonRequest<T>(args: {
  url: URL;
  method: "POST";
  headers: Readonly<Record<string, string>>;
  payload: Record<string, unknown>;
}): Promise<Readonly<{ statusCode: number; body: T | undefined }>> {
  const body = JSON.stringify(args.payload);
  const mtls = loadMtlsConfig();
  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        protocol: args.url.protocol,
        hostname: args.url.hostname,
        port: args.url.port || 443,
        path: `${args.url.pathname}${args.url.search}`,
        method: args.method,
        cert: mtls.cert,
        key: mtls.key,
        ca: mtls.ca,
        passphrase: mtls.passphrase,
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body).toString(),
          ...args.headers,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          const parsed =
            raw.length > 0
              ? (JSON.parse(raw) as T)
              : (undefined as T | undefined);
          resolve({
            statusCode: response.statusCode ?? 500,
            body: parsed,
          });
        });
      },
    );
    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

function brokerExchangeUrl(): URL {
  return requireHttpsUrl("PAYEASE_BROKER_WALLET_EXCHANGE_URL");
}

function brokerDomainEventInboxUrl(): URL {
  return requireHttpsUrl("PAYEASE_BROKER_DOMAIN_EVENT_INBOX_URL");
}

function isTimestampWithinWindow(
  timestampMillis: string,
  windowMillis = 5 * 60 * 1000,
): boolean {
  const parsed = Number(timestampMillis);
  return (
    Number.isFinite(parsed) && Math.abs(Date.now() - parsed) <= windowMillis
  );
}

function sessionTokenFromCookie(
  cookieHeader: string | undefined,
): string | undefined {
  return cookieValueFromHeader(
    cookieHeader,
    "__Host-payease_lender_wallet_session",
  );
}

function cookieValueFromHeader(
  cookieHeader: string | undefined,
  cookieName: string,
): string | undefined {
  return cookieHeader
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`))
    ?.slice(`${cookieName}=`.length);
}

function csrfTokenFromCookie(
  cookieHeader: string | undefined,
): string | undefined {
  return cookieValueFromHeader(
    cookieHeader,
    "__Host-payease_lender_wallet_csrf",
  );
}

function walletCookieHeaders(args: {
  sessionToken: string;
  csrfToken: string;
  ttlSeconds: number;
}): string[] {
  return [
    `__Host-payease_lender_wallet_session=${args.sessionToken}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${args.ttlSeconds}`,
    `__Host-payease_lender_wallet_csrf=${args.csrfToken}; Secure; SameSite=Strict; Path=/; Max-Age=${args.ttlSeconds}`,
  ];
}

function appendSetCookieHeader(reply: FastifyReply, cookies: string[]): void {
  const existing = reply.getHeader("set-cookie") as SetCookieHeader;
  const next = [
    ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
    ...cookies,
  ];
  reply.header("set-cookie", next);
}

function requireTrustedWalletOrigin(
  request: FastifyRequest,
  reply: FastifyReply,
): boolean {
  const expectedOrigin = walletPublicOrigin();
  if (!expectedOrigin) return true;
  const header = request.headers.origin;
  if (Array.isArray(header) || typeof header !== "string") {
    reply.code(403).send({ code: "WALLET_ORIGIN_FORBIDDEN" });
    return false;
  }
  try {
    if (new URL(header).origin !== expectedOrigin) {
      reply.code(403).send({ code: "WALLET_ORIGIN_FORBIDDEN" });
      return false;
    }
  } catch {
    reply.code(403).send({ code: "WALLET_ORIGIN_FORBIDDEN" });
    return false;
  }
  return true;
}

function requireWalletCsrf(
  request: FastifyRequest,
  reply: FastifyReply,
): boolean {
  const tokenHeader = request.headers["x-csrf-token"];
  if (Array.isArray(tokenHeader) || typeof tokenHeader !== "string") {
    reply.code(403).send({ code: "WALLET_CSRF_TOKEN_INVALID" });
    return false;
  }
  const cookieToken = csrfTokenFromCookie(request.headers.cookie);
  if (!cookieToken || !secureCompare(cookieToken, tokenHeader.trim())) {
    reply.code(403).send({ code: "WALLET_CSRF_TOKEN_INVALID" });
    return false;
  }
  return true;
}

async function addAuditEvent(
  client: PoolClient,
  args: {
    actorRef: string;
    eventName: string;
    applicationNo?: string;
    subjectRef?: string;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO lender_wallet_audit_events
      (actor_ref, event_name, application_no, subject_ref, details)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [
      args.actorRef,
      args.eventName,
      args.applicationNo ?? null,
      args.subjectRef ?? null,
      JSON.stringify(args.details ?? {}),
    ],
  );
}

async function createPersistentWalletSession(
  client: PoolClient,
  args: Omit<WalletSession, "sessionToken" | "createdAt">,
): Promise<WalletSession> {
  const sessionToken = randomBytes(32).toString("base64url");
  const sessionTokenHash = createHash("sha256")
    .update(sessionToken)
    .digest("hex");
  const created = await client.query<{
    application_no: string;
    jump_ref: string;
    operation_type: WalletOperationType;
    external_wallet_ref: string | null;
    wallet_status: WalletStatus;
    available_balance_minor: string;
    currency: string;
    expires_at: string;
    created_at: string;
  }>(
    `INSERT INTO lender_wallet_sessions
      (session_token_hash, application_no, jump_ref, operation_type,
       external_wallet_ref, wallet_status, available_balance_minor, currency, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING application_no,
               jump_ref,
               operation_type,
               external_wallet_ref,
               wallet_status,
               available_balance_minor::text,
               currency,
               expires_at::text,
               created_at::text`,
    [
      sessionTokenHash,
      args.applicationNo,
      args.walletOperationJumpRef,
      args.operationType,
      args.externalWalletRef,
      args.walletStatus,
      args.availableBalanceMinor,
      args.currency,
      args.expiresAt,
    ],
  );
  return {
    sessionToken,
    applicationNo: created.rows[0]!.application_no,
    walletOperationJumpRef: created.rows[0]!.jump_ref,
    operationType: created.rows[0]!.operation_type,
    externalWalletRef: created.rows[0]!.external_wallet_ref,
    walletStatus: created.rows[0]!.wallet_status,
    availableBalanceMinor: created.rows[0]!.available_balance_minor,
    currency: created.rows[0]!.currency,
    expiresAt: created.rows[0]!.expires_at,
    createdAt: created.rows[0]!.created_at,
  };
}

async function loadPersistentWalletSession(
  client: PoolClient,
  sessionToken: string,
): Promise<WalletSession | undefined> {
  const sessionTokenHash = createHash("sha256")
    .update(sessionToken)
    .digest("hex");
  const result = await client.query<{
    application_no: string;
    jump_ref: string;
    operation_type: WalletOperationType;
    external_wallet_ref: string | null;
    wallet_status: WalletStatus;
    available_balance_minor: string;
    currency: string;
    expires_at: string;
    created_at: string;
  }>(
    `SELECT application_no,
            jump_ref,
            operation_type,
            external_wallet_ref,
            wallet_status,
            available_balance_minor::text,
            currency,
            expires_at::text,
            created_at::text
       FROM lender_wallet_sessions
      WHERE session_token_hash = $1
        AND revoked_at IS NULL
        AND expires_at > now()`,
    [sessionTokenHash],
  );
  return result.rowCount
    ? {
        sessionToken,
        applicationNo: result.rows[0]!.application_no,
        walletOperationJumpRef: result.rows[0]!.jump_ref,
        operationType: result.rows[0]!.operation_type,
        externalWalletRef: result.rows[0]!.external_wallet_ref,
        walletStatus: result.rows[0]!.wallet_status,
        availableBalanceMinor: result.rows[0]!.available_balance_minor,
        currency: result.rows[0]!.currency,
        expiresAt: result.rows[0]!.expires_at,
        createdAt: result.rows[0]!.created_at,
      }
    : undefined;
}

async function currentWalletSession(
  sessionToken: string | undefined,
): Promise<WalletSession | undefined> {
  if (!sessionToken) return undefined;
  if (!pool) {
    return sessions.get(sessionToken);
  }
  const client = await pool.connect();
  try {
    return await loadPersistentWalletSession(client, sessionToken);
  } finally {
    client.release();
  }
}

function renderHtmlDocument(args: {
  title: string;
  heading: string;
  body: string;
  script?: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${args.title}</title>
    <style>
      :root { color-scheme: light; font-family: Inter, Arial, sans-serif; }
      body { margin: 0; background: #f8fafc; color: #0f172a; }
      main { max-width: 760px; margin: 0 auto; padding: 32px 20px 56px; }
      .card { background: #fff; border: 1px solid #cbd5e1; border-radius: 16px; padding: 24px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06); }
      h1 { margin: 0 0 12px; font-size: 28px; }
      p { line-height: 1.6; }
      dl { display: grid; grid-template-columns: max-content 1fr; gap: 8px 12px; margin: 18px 0; }
      dt { color: #475569; font-weight: 600; }
      dd { margin: 0; }
      .muted { color: #475569; }
      .error { color: #b91c1c; }
      .ok { color: #166534; }
      .row { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 18px; }
      button { appearance: none; border: 0; border-radius: 999px; padding: 12px 18px; font-weight: 700; cursor: pointer; }
      button.primary { background: #0f172a; color: #fff; }
      button.secondary { background: #e2e8f0; color: #0f172a; }
      input { width: 100%; box-sizing: border-box; border: 1px solid #cbd5e1; border-radius: 10px; padding: 12px; margin-top: 8px; }
      label { display: block; margin-top: 18px; font-weight: 600; }
      pre { white-space: pre-wrap; word-break: break-word; background: #f8fafc; border-radius: 10px; padding: 12px; }
    </style>
  </head>
  <body>
    <main>
      <section class="card">
        <h1>${args.heading}</h1>
        ${args.body}
      </section>
    </main>
    ${args.script ? `<script type="module">${args.script}</script>` : ""}
  </body>
</html>`;
}

function walletEntryPageHtml(): string {
  return renderHtmlDocument({
    title: "SMILE Wallet Entry",
    heading: "Opening SMILE Wallet",
    body: `
      <p class="muted">This page exchanges the one-time wallet jump ticket from the browser fragment and creates a lender-domain HttpOnly session. The fragment never leaves the browser URL bar until this page posts it to the wallet service.</p>
      <p id="status">Preparing secure wallet session…</p>
      <pre id="details" hidden></pre>
    `,
    script: `
      const status = document.getElementById("status");
      const details = document.getElementById("details");
      const params = new URLSearchParams(window.location.search);
      const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const jumpRef = params.get("jump_ref");
      const operationType = params.get("operation");
      const jumpToken = fragment.get("jump_token");
      if (!jumpRef || !jumpToken || !operationType) {
        status.textContent = "This wallet link is incomplete or has already been stripped of its fragment.";
        status.className = "error";
      } else {
        fetch("/v1/wallet/entry", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jumpRef, jumpToken, operationType }),
        })
          .then(async (response) => {
            const payload = await response.json().catch(() => undefined);
            if (!response.ok) {
              throw new Error((payload && payload.code) || "WALLET_ENTRY_FORBIDDEN");
            }
            history.replaceState({}, "", "/v1/wallet/authorize");
            window.location.replace("/v1/wallet/authorize");
          })
          .catch((error) => {
            status.textContent = "SMILE Wallet could not create a secure session from this one-time ticket.";
            status.className = "error";
            if (details) {
              details.hidden = false;
              details.textContent = String(error instanceof Error ? error.message : error);
            }
          });
      }
    `,
  });
}

function walletAuthorizePageHtml(): string {
  return renderHtmlDocument({
    title: "SMILE Wallet Authorization",
    heading: "Authorize Wallet Operation",
    body: `
      <p class="muted">This lender-domain page reads only the secure wallet session cookie. Repayment is calculated from the lender's own contract and accounting snapshot. A withdrawal amount is entered only here, never at KhmerX. Confirming records an authorization request; later signed channel callbacks advance the funds order.</p>
      <p id="status">Loading wallet session…</p>
      <div id="session" hidden>
        <dl>
          <dt>Application</dt><dd id="applicationNo">-</dd>
          <dt>Operation</dt><dd id="operationType">-</dd>
          <dt>Wallet status</dt><dd id="walletStatus">-</dd>
          <dt>Available balance</dt><dd id="availableBalance">-</dd>
          <dt>Expires</dt><dd id="expiresAt">-</dd>
        </dl>
        <label id="withdrawalAmountLabel" hidden>Withdrawal amount (USD minor units)
          <input id="withdrawalAmountMinor" inputmode="numeric" pattern="[0-9]*" autocomplete="off" />
        </label>
        <div class="row">
          <button id="confirm" class="primary" type="button">Confirm authorization request</button>
          <button id="refresh" class="secondary" type="button">Refresh session</button>
        </div>
        <pre id="result" hidden></pre>
      </div>
    `,
    script: `
      function cookieValue(name) {
        const cookie = document.cookie
          .split(";")
          .map((part) => part.trim())
          .find((part) => part.startsWith(name + "="));
        return cookie ? cookie.slice(name.length + 1) : "";
      }

      const status = document.getElementById("status");
      const sessionPanel = document.getElementById("session");
      const applicationNo = document.getElementById("applicationNo");
      const operationType = document.getElementById("operationType");
      const withdrawalAmountLabel = document.getElementById("withdrawalAmountLabel");
      const withdrawalAmountMinor = document.getElementById("withdrawalAmountMinor");
      const walletStatus = document.getElementById("walletStatus");
      const availableBalance = document.getElementById("availableBalance");
      const expiresAt = document.getElementById("expiresAt");
      const confirmButton = document.getElementById("confirm");
      const refreshButton = document.getElementById("refresh");
      const result = document.getElementById("result");

      async function loadSession() {
        status.textContent = "Loading wallet session…";
        status.className = "";
        const response = await fetch("/v1/wallet/session", { credentials: "include" });
        const payload = await response.json().catch(() => undefined);
        if (!response.ok || !payload) {
          throw new Error((payload && payload.code) || "LENDER_WALLET_SESSION_REQUIRED");
        }
        applicationNo.textContent = payload.applicationNo;
        operationType.textContent = payload.operationType;
        withdrawalAmountLabel.hidden = payload.operationType !== "WITHDRAWAL";
        walletStatus.textContent = payload.walletStatus;
        availableBalance.textContent = payload.availableBalanceMinor + " " + payload.currency + " minor";
        expiresAt.textContent = payload.expiresAt;
        sessionPanel.hidden = false;
        status.textContent = "Wallet session ready.";
        status.className = "ok";
        return payload;
      }

      async function confirmAuthorization() {
        result.hidden = true;
        const response = await fetch("/v1/wallet/authorizations/confirm", {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": cookieValue("__Host-payease_lender_wallet_csrf"),
          },
          body: JSON.stringify({
            ...(withdrawalAmountLabel.hidden ? {} : {
              requestedAmountMinor: withdrawalAmountMinor.value.trim(),
            }),
          }),
        });
        const payload = await response.json().catch(() => undefined);
        if (!response.ok) {
          throw new Error((payload && payload.code) || "WALLET_AUTHORIZATION_FAILED");
        }
        result.hidden = false;
        result.textContent = JSON.stringify(payload, null, 2);
        status.textContent = "Wallet authorization request recorded. Await signed channel callbacks.";
        status.className = "ok";
      }

      refreshButton?.addEventListener("click", () => {
        loadSession().catch((error) => {
          status.textContent = String(error instanceof Error ? error.message : error);
          status.className = "error";
        });
      });
      confirmButton?.addEventListener("click", () => {
        confirmAuthorization().catch((error) => {
          status.textContent = String(error instanceof Error ? error.message : error);
          status.className = "error";
        });
      });

      loadSession().catch((error) => {
        status.textContent = String(error instanceof Error ? error.message : error);
        status.className = "error";
      });
    `,
  });
}

async function requireWalletSession(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<WalletSession | undefined> {
  const session = await currentWalletSession(
    sessionTokenFromCookie(request.headers.cookie),
  );
  if (!session) {
    reply.code(401).send({ code: "LENDER_WALLET_SESSION_REQUIRED" });
    return undefined;
  }
  return session;
}

function walletChannelCallbackHeadersFromRequest(request: FastifyRequest) {
  return walletChannelCallbackHeadersSchema.parse({
    algorithm: request.headers["x-payease-wallet-callback-algo"],
    keyId: request.headers["x-payease-wallet-callback-key-id"],
    nonce: request.headers["x-payease-wallet-callback-nonce"],
    timestampMillis:
      request.headers["x-payease-wallet-callback-timestamp-millis"],
    signature: request.headers["x-payease-wallet-callback-signature"],
  });
}

async function findFundsOrderByRef(client: PoolClient, orderRef: string) {
  const result = await client.query<{
    id: string;
    application_no: string;
    external_wallet_ref: string;
    order_ref: string;
    order_type: "WITHDRAWAL" | "REPAYMENT";
    status:
      | "PENDING_AUTH"
      | "AUTHORIZED"
      | "PROCESSING"
      | "SETTLED"
      | "FAILED"
      | "CANCELLED";
    requested_amount_minor: string;
    settled_amount_minor: string | null;
    currency: "USD";
    metadata: Record<string, unknown>;
    updated_at: string;
  }>(
    `SELECT id,
            application_no,
            external_wallet_ref,
            order_ref,
            order_type,
            status,
            requested_amount_minor::text,
            settled_amount_minor::text,
            currency,
            metadata,
            updated_at::text
       FROM lender_wallet_funds_orders
      WHERE order_ref = $1
      FOR UPDATE`,
    [orderRef],
  );
  return result.rows[0];
}

async function recordChannelCallbackReceipt(args: {
  client: PoolClient;
  provider: string;
  callbackRef: string;
  nonce: string;
  payloadSha256: string;
  orderRef: string;
}): Promise<Readonly<{ duplicate: boolean }>> {
  let inserted;
  try {
    inserted = await args.client.query(
      `INSERT INTO channel_callback_receipts
        (provider, callback_ref, nonce, payload_sha256, order_ref)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (provider, callback_ref) DO NOTHING
       RETURNING id`,
      [
        args.provider,
        args.callbackRef,
        args.nonce,
        args.payloadSha256,
        args.orderRef,
      ],
    );
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      throw new Error("WALLET_CHANNEL_CALLBACK_NONCE_REUSED");
    }
    throw error;
  }
  if (inserted.rowCount) return { duplicate: false };

  const existing = await args.client.query<{
    payload_sha256: string;
    order_ref: string;
  }>(
    `SELECT payload_sha256, order_ref
       FROM channel_callback_receipts
      WHERE provider = $1 AND callback_ref = $2
      FOR UPDATE`,
    [args.provider, args.callbackRef],
  );
  if (!existing.rowCount) {
    throw new Error("WALLET_CHANNEL_CALLBACK_NONCE_REUSED");
  }
  const receipt = existing.rows[0]!;
  if (
    receipt.payload_sha256 !== args.payloadSha256 ||
    receipt.order_ref !== args.orderRef
  ) {
    throw new Error("WALLET_CHANNEL_CALLBACK_REF_CONFLICT");
  }
  return { duplicate: true };
}

async function findWalletAuthorizationOrder(args: {
  client: PoolClient;
  applicationNo: string;
  walletOperationJumpRef: string;
}) {
  const result = await args.client.query<{
    order_ref: string;
    status: string;
    requested_amount_minor: string;
    settled_amount_minor: string | null;
    currency: string;
    metadata: Record<string, unknown>;
    updated_at: string;
  }>(
    `SELECT order_ref,
            status,
            requested_amount_minor::text,
            settled_amount_minor::text,
            currency,
            metadata,
            updated_at::text
       FROM lender_wallet_funds_orders
      WHERE application_no = $1
        AND metadata @> $2::jsonb
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE`,
    [
      args.applicationNo,
      JSON.stringify({
        walletOperationJumpRef: args.walletOperationJumpRef,
      }),
    ],
  );
  return result.rows[0];
}

async function exchangeJump(args: {
  jumpRef: string;
  jumpToken: string;
  operationType: WalletOperationType;
}): Promise<BrokerJumpExchangeResponse> {
  const url = brokerExchangeUrl();
  const payload = {
    jumpRef: args.jumpRef,
    jumpToken: args.jumpToken,
    operationType: args.operationType,
  };
  const response = await httpsJsonRequest<
    BrokerJumpExchangeResponse | { code?: string }
  >({
    url,
    method: "POST",
    headers: walletBrokerRequestHeaders({
      method: "POST",
      path: url.pathname,
      payload,
      keyId: "lender-wallet-hmac-v1",
      secret: env("PAYEASE_LENDER_WALLET_SHARED_SECRET"),
    }),
    payload,
  });
  if (response.statusCode < 200 || response.statusCode >= 300) {
    const body = response.body as { code?: string } | undefined;
    throw new Error(
      typeof body?.code === "string" ? body.code : "WALLET_EXCHANGE_FAILED",
    );
  }
  return brokerJumpExchangeResponseSchema.parse(response.body);
}

let exchangeJumpHandler: typeof exchangeJump = exchangeJump;

function setExchangeJumpHandlerForTests(handler: typeof exchangeJump): void {
  exchangeJumpHandler = handler;
}

function internalWorkerHeaders(
  request: FastifyRequest,
): InternalWorkerHeaders | undefined {
  const header = request.headers["x-lender-wallet-internal-token"];
  if (Array.isArray(header) || typeof header !== "string") {
    return undefined;
  }
  return z
    .object({ token: z.string().min(24).max(256) })
    .safeParse({ token: header.trim() }).data;
}

function requireInternalWorker(
  request: FastifyRequest,
  reply: FastifyReply,
): boolean {
  const headers = internalWorkerHeaders(request);
  const expected = process.env.PAYEASE_LENDER_WALLET_INTERNAL_TOKEN?.trim();
  if (!headers?.token || !expected || !secureCompare(headers.token, expected)) {
    reply.code(401).send({ code: "LENDER_INTERNAL_AUTH_REQUIRED" });
    return false;
  }
  return true;
}

async function enqueueWalletCreditEvent(
  client: PoolClient,
  args: {
    applicationNo: string;
    externalWalletRef: string;
    availableBalanceMinor: string;
    sourceReference: string;
  },
): Promise<
  Readonly<{
    accepted: true;
    duplicate: boolean;
    eventId: string;
    dispatchStatus: string;
  }>
> {
  const idempotencyKey = `wallet-credit:${args.sourceReference}`;
  const occurredAt = new Date().toISOString();
  const eventId = `evt_wallet_credit_${randomUUID().replaceAll("-", "")}`;
  const event = createWalletStatusEvent({
    applicationNo: args.applicationNo,
    externalWalletRef: args.externalWalletRef,
    availableBalanceMinor: args.availableBalanceMinor,
    idempotencyKey,
    eventId,
    occurredAt,
  });
  const ledgerInsert = await client.query(
    `INSERT INTO lender_wallet_ledger_entries
      (application_no, external_wallet_ref, entry_type, amount_minor,
       balance_after_minor, currency, source_reference, metadata)
     VALUES ($1, $2, 'CREDIT', $3, $3, 'USD', $4, $5::jsonb)
     ON CONFLICT (source_reference) DO NOTHING`,
    [
      args.applicationNo,
      args.externalWalletRef,
      args.availableBalanceMinor,
      args.sourceReference,
      JSON.stringify({ sourceReference: args.sourceReference }),
    ],
  );
  if (!ledgerInsert.rowCount) {
    const existing = await client.query<{
      event_id: string;
      dispatch_status: string;
    }>(
      `SELECT outbox.event_id,
              COALESCE(attempt.delivery_status, 'PENDING') AS dispatch_status
         FROM lender_wallet_event_outbox outbox
         LEFT JOIN LATERAL (
           SELECT delivery_status
             FROM lender_wallet_event_dispatch_attempts
            WHERE event_id = outbox.event_id
            ORDER BY attempted_at DESC
            LIMIT 1
         ) attempt ON true
        WHERE outbox.idempotency_key = $1`,
      [idempotencyKey],
    );
    return {
      accepted: true,
      duplicate: true,
      eventId: existing.rows[0]!.event_id,
      dispatchStatus: existing.rows[0]!.dispatch_status,
    };
  }
  await client.query(
    `INSERT INTO lender_wallet_event_outbox
      (event_id, event_type, external_application_ref, idempotency_key,
       occurred_at, payload, payload_sha256, signature_key_id)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 'lender-hmac-v1')`,
    [
      event.eventId,
      event.eventType,
      event.externalApplicationRef,
      event.idempotencyKey,
      event.occurredAt,
      JSON.stringify(event.payload),
      event.payloadSha256,
    ],
  );
  await addAuditEvent(client, {
    actorRef: "lender-wallet-internal-worker",
    eventName: "WALLET_CREDIT_ENQUEUED",
    applicationNo: args.applicationNo,
    subjectRef: args.sourceReference,
    details: {
      eventId: event.eventId,
      externalWalletRef: args.externalWalletRef,
      availableBalanceMinor: args.availableBalanceMinor,
    },
  });
  return {
    accepted: true,
    duplicate: false,
    eventId: event.eventId,
    dispatchStatus: "PENDING",
  };
}

async function pendingOutboxEvents(
  client: PoolClient,
  limit: number,
): Promise<OutboxRow[]> {
  const result = await client.query<OutboxRow>(
    `SELECT event_id,
            external_application_ref,
            idempotency_key,
            occurred_at::text,
            payload
       FROM lender_wallet_event_outbox outbox
      WHERE NOT EXISTS (
              SELECT 1
                FROM lender_wallet_event_dispatch_attempts attempt
               WHERE attempt.event_id = outbox.event_id
                 AND attempt.delivery_status = 'DISPATCHED'
            )
      ORDER BY created_at ASC
      LIMIT $1
      FOR UPDATE SKIP LOCKED`,
    [limit],
  );
  return result.rows;
}

async function enqueueWalletOperationResult(
  client: PoolClient,
  order: FundsOrderRow,
): Promise<void> {
  if (
    order.status !== "AUTHORIZED" &&
    order.status !== "PROCESSING" &&
    order.status !== "SETTLED" &&
    order.status !== "FAILED"
  ) {
    return;
  }
  const event = createWalletOperationResultEvent({
    applicationNo: order.application_no,
    externalWalletRef: order.external_wallet_ref,
    orderRef: order.order_ref,
    operationType: order.order_type,
    operationStatus: order.status,
    requestedAmountMinor: order.requested_amount_minor,
    settledAmountMinor: order.settled_amount_minor,
    idempotencyKey: `wallet-operation-result:${order.order_ref}:${order.status}`,
  });
  await client.query(
    `INSERT INTO wallet_operation_result_outbox
      (event_id, event_type, external_application_ref, order_ref, idempotency_key,
       occurred_at, payload, payload_sha256, signature_key_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, 'lender-hmac-v1')
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [
      event.eventId,
      order.status,
      order.application_no,
      order.order_ref,
      event.idempotencyKey,
      event.occurredAt,
      JSON.stringify(event.payload),
      event.payloadSha256,
    ],
  );
}

async function pendingWalletOperationResultEvents(
  client: PoolClient,
  limit: number,
): Promise<WalletOperationResultOutboxRow[]> {
  const result = await client.query<WalletOperationResultOutboxRow>(
    `SELECT event_id, event_type, external_application_ref, order_ref,
            idempotency_key, occurred_at::text, payload
       FROM wallet_operation_result_outbox outbox
      WHERE NOT EXISTS (
              SELECT 1
                FROM wallet_operation_result_dispatch_attempts attempt
               WHERE attempt.event_id = outbox.event_id
                 AND attempt.delivery_status = 'DISPATCHED'
            )
      ORDER BY created_at ASC
      LIMIT $1
      FOR UPDATE SKIP LOCKED`,
    [limit],
  );
  return result.rows;
}

async function dispatchOutboxEvent(
  event: OutboxRow,
): Promise<Readonly<{ statusCode: number; body: unknown }>> {
  const envelope = createWalletStatusEvent({
    applicationNo: event.external_application_ref,
    externalWalletRef: event.payload.externalWalletRef,
    availableBalanceMinor: event.payload.availableBalanceMinor,
    idempotencyKey: event.idempotency_key,
    eventId: event.event_id,
    occurredAt: event.occurred_at,
  });
  const url = brokerDomainEventInboxUrl();
  return httpsJsonRequest({
    url,
    method: "POST",
    headers: walletStatusEventHeaders(envelope),
    payload: envelope as unknown as Record<string, unknown>,
  });
}

async function dispatchWalletOperationResultEvent(
  event: WalletOperationResultOutboxRow,
): Promise<Readonly<{ statusCode: number; body: unknown }>> {
  const envelope = createWalletOperationResultEvent({
    applicationNo: event.external_application_ref,
    externalWalletRef: event.payload.externalWalletRef,
    orderRef: event.order_ref,
    operationType: event.payload.operationType,
    operationStatus: event.event_type,
    requestedAmountMinor: event.payload.requestedAmountMinor,
    settledAmountMinor: event.payload.settledAmountMinor,
    idempotencyKey: event.idempotency_key,
    eventId: event.event_id,
    occurredAt: event.occurred_at,
  });
  const url = brokerDomainEventInboxUrl();
  return httpsJsonRequest({
    url,
    method: "POST",
    headers: walletStatusEventHeaders(envelope),
    payload: envelope as unknown as Record<string, unknown>,
  });
}

app.get("/health/live", async () => ({ ok: true, service: "lender-wallet" }));

app.get("/v1/wallet/entry", async (_request, reply) => {
  reply.type("text/html; charset=utf-8");
  return walletEntryPageHtml();
});

app.post(
  "/v1/wallet/entry",
  async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireTrustedWalletOrigin(request, reply)) return;
    const input = z
      .object({
        jumpRef: z.string().regex(/^woj_[A-Za-z0-9]{24,64}$/),
        jumpToken: z.string().min(20).max(256),
        operationType: z.enum(["WITHDRAWAL", "REPAYMENT"]),
      })
      .strict()
      .parse(request.body);
    try {
      const exchange = await exchangeJumpHandler(input);
      const ttlMillis = Math.max(
        Date.parse(exchange.expiresAt) - Date.now(),
        60_000,
      );
      if (pool) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const session = await createPersistentWalletSession(client, {
            applicationNo: exchange.applicationNo,
            walletOperationJumpRef: exchange.walletOperationJumpRef,
            operationType: exchange.operationType,
            externalWalletRef: exchange.externalWalletRef,
            walletStatus: exchange.walletStatus,
            availableBalanceMinor: exchange.availableBalanceMinor,
            currency: exchange.currency,
            expiresAt: new Date(Date.now() + ttlMillis).toISOString(),
          });
          await addAuditEvent(client, {
            actorRef: "lender-wallet-service",
            eventName: "WALLET_SESSION_CREATED",
            applicationNo: session.applicationNo,
            subjectRef: session.walletOperationJumpRef,
            details: {
              operationType: session.operationType,
              walletStatus: session.walletStatus,
            },
          });
          await client.query("COMMIT");
          appendSetCookieHeader(
            reply,
            walletCookieHeaders({
              sessionToken: session.sessionToken,
              csrfToken: randomBytes(24).toString("base64url"),
              ttlSeconds: Math.floor(ttlMillis / 1000),
            }),
          );
          return {
            applicationNo: session.applicationNo,
            walletOperationJumpRef: session.walletOperationJumpRef,
            operationType: session.operationType,
            walletStatus: session.walletStatus,
            availableBalanceMinor: session.availableBalanceMinor,
            currency: session.currency,
            expiresAt: session.expiresAt,
          };
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      }
      const session = sessions.create({
        applicationNo: exchange.applicationNo,
        walletOperationJumpRef: exchange.walletOperationJumpRef,
        operationType: exchange.operationType,
        externalWalletRef: exchange.externalWalletRef,
        walletStatus: exchange.walletStatus,
        availableBalanceMinor: exchange.availableBalanceMinor,
        currency: exchange.currency,
        expiresAt: new Date(Date.now() + ttlMillis).toISOString(),
      });
      appendSetCookieHeader(
        reply,
        walletCookieHeaders({
          sessionToken: session.sessionToken,
          csrfToken: randomBytes(24).toString("base64url"),
          ttlSeconds: Math.floor(ttlMillis / 1000),
        }),
      );
      return {
        applicationNo: session.applicationNo,
        walletOperationJumpRef: session.walletOperationJumpRef,
        operationType: session.operationType,
        walletStatus: session.walletStatus,
        availableBalanceMinor: session.availableBalanceMinor,
        currency: session.currency,
        expiresAt: session.expiresAt,
      };
    } catch (error) {
      request.log.error({ err: error }, "wallet jump exchange failed");
      if (error instanceof Error) {
        if (
          [
            "WALLET_EXCHANGE_BAD_SIGNATURE",
            "WALLET_EXCHANGE_STALE_TIMESTAMP",
            "WALLET_OPERATION_JUMP_NOT_FOUND",
          ].includes(error.message)
        ) {
          return reply.code(401).send({ code: error.message });
        }
      }
      return reply.code(401).send({ code: "WALLET_ENTRY_FORBIDDEN" });
    }
  },
);

app.get("/v1/wallet/authorize", async (_request, reply) => {
  reply.type("text/html; charset=utf-8");
  return walletAuthorizePageHtml();
});

app.get(
  "/v1/wallet/session",
  async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionToken = sessionTokenFromCookie(request.headers.cookie);
    const session = await currentWalletSession(sessionToken);
    if (!session) {
      return reply.code(401).send({ code: "LENDER_WALLET_SESSION_REQUIRED" });
    }
    return {
      applicationNo: session.applicationNo,
      walletOperationJumpRef: session.walletOperationJumpRef,
      operationType: session.operationType,
      walletStatus: session.walletStatus,
      availableBalanceMinor: session.availableBalanceMinor,
      currency: session.currency,
      expiresAt: session.expiresAt,
    };
  },
);

app.post(
  "/v1/wallet/authorizations/confirm",
  async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireTrustedWalletOrigin(request, reply)) return;
    if (!requireWalletCsrf(request, reply)) return;
    const session = await requireWalletSession(request, reply);
    if (!session) return;
    const input = z
      .object({
        requestedAmountMinor: z.string().regex(/^\d+$/).optional(),
      })
      .strict()
      .parse(request.body);
    if (!session.externalWalletRef) {
      return reply
        .code(409)
        .send({ code: "LENDER_WALLET_EXTERNAL_REF_REQUIRED" });
    }
    const availableBalanceMinor = BigInt(session.availableBalanceMinor);
    let requestedAmountMinor: bigint;
    if (session.operationType === "WITHDRAWAL") {
      if (!input.requestedAmountMinor) {
        return reply.code(422).send({ code: "LENDER_WALLET_AMOUNT_REQUIRED" });
      }
      requestedAmountMinor = BigInt(input.requestedAmountMinor);
    } else {
      if (input.requestedAmountMinor) {
        return reply
          .code(422)
          .send({ code: "LENDER_WALLET_REPAYMENT_AMOUNT_MANAGED" });
      }
      requestedAmountMinor = 0n;
    }
    if (requestedAmountMinor < 0n) {
      return reply
        .code(422)
        .send({ code: "LENDER_WALLET_AMOUNT_OUT_OF_RANGE" });
    }
    const client = await assertPool().connect();
    try {
      await client.query("BEGIN");
      if (session.operationType === "REPAYMENT") {
        const snapshot = await client.query<{ payable_amount_minor: string }>(
          `SELECT payable_amount_minor::text
             FROM lender_wallet_repayment_snapshots
            WHERE application_no = $1
              AND external_wallet_ref = $2
              AND effective_at <= now()
            ORDER BY effective_at DESC, created_at DESC
            LIMIT 1
            FOR SHARE`,
          [session.applicationNo, session.externalWalletRef],
        );
        if (!snapshot.rowCount) {
          await client.query("ROLLBACK");
          return reply
            .code(409)
            .send({ code: "LENDER_REPAYMENT_SNAPSHOT_REQUIRED" });
        }
        requestedAmountMinor = BigInt(snapshot.rows[0]!.payable_amount_minor);
      }
      if (
        requestedAmountMinor <= 0n ||
        (session.operationType === "WITHDRAWAL" &&
          requestedAmountMinor > availableBalanceMinor)
      ) {
        await client.query("ROLLBACK");
        return reply
          .code(422)
          .send({ code: "LENDER_WALLET_AMOUNT_OUT_OF_RANGE" });
      }
      const existing = await findWalletAuthorizationOrder({
        client,
        applicationNo: session.applicationNo,
        walletOperationJumpRef: session.walletOperationJumpRef,
      });
      if (existing) {
        await client.query("COMMIT");
        return {
          duplicate: true,
          orderRef: existing.order_ref,
          status: existing.status,
          requestedAmountMinor: existing.requested_amount_minor,
          settledAmountMinor: existing.settled_amount_minor,
          currency: existing.currency,
          updatedAt: existing.updated_at,
        };
      }
      const orderRef = `WALLET-${randomUUID().replaceAll("-", "").slice(0, 24).toUpperCase()}`;
      const idempotencyKey = [
        "wallet-auth",
        session.walletOperationJumpRef,
        session.operationType,
        requestedAmountMinor.toString(),
      ].join(":");
      const metadata = {
        walletOperationJumpRef: session.walletOperationJumpRef,
        walletStatus: session.walletStatus,
      };
      await createFundsOrder(client, {
        applicationNo: session.applicationNo,
        externalWalletRef: session.externalWalletRef,
        orderRef,
        orderType: session.operationType,
        requestedAmountMinor: requestedAmountMinor.toString(),
        idempotencyKey,
        actorRef: "lender-wallet-applicant",
        eventRef: `order-created-${randomUUID()}`,
        metadata,
      });
      const requested = await transitionFundsOrder(client, {
        orderRef,
        eventRef: `order-auth-requested-${randomUUID()}`,
        eventType: "AUTHORIZATION_REQUESTED",
        actorRef: "lender-wallet-applicant",
        fromStatus: "PENDING_AUTH",
        amountMinor: requestedAmountMinor.toString(),
        metadata,
      });
      await addAuditEvent(client, {
        actorRef: "lender-wallet-applicant",
        eventName: "WALLET_AUTHORIZATION_REQUESTED",
        applicationNo: session.applicationNo,
        subjectRef: orderRef,
        details: {
          walletOperationJumpRef: session.walletOperationJumpRef,
          operationType: session.operationType,
          requestedAmountMinor: requestedAmountMinor.toString(),
        },
      });
      await client.query("COMMIT");
      return {
        duplicate: false,
        orderRef: requested.order_ref,
        status: requested.status,
        requestedAmountMinor: requested.requested_amount_minor,
        settledAmountMinor: requested.settled_amount_minor,
        currency: requested.currency,
        updatedAt: requested.updated_at,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
);

app.post(
  "/v1/wallet/channel-callbacks/funds-orders",
  async (request: FastifyRequest, reply: FastifyReply) => {
    const input = walletChannelCallbackRequestSchema.parse(request.body);
    const headers = walletChannelCallbackHeadersFromRequest(request);
    if (headers.keyId !== "lender-channel-hmac-v1") {
      return reply.code(401).send({ code: "WALLET_CHANNEL_BAD_KEY_ID" });
    }
    if (!isTimestampWithinWindow(headers.timestampMillis)) {
      return reply.code(408).send({ code: "WALLET_CHANNEL_STALE_TIMESTAMP" });
    }
    const bodySha256 = sha256Hex(stableJson(input));
    if (
      !verifyWalletChannelCallbackRequest({
        method: "POST",
        path: "/v1/wallet/channel-callbacks/funds-orders",
        timestampMillis: headers.timestampMillis,
        nonce: headers.nonce,
        keyId: headers.keyId,
        bodySha256,
        signature: headers.signature,
        secret: env("PAYEASE_LENDER_CHANNEL_CALLBACK_SECRET"),
      })
    ) {
      return reply.code(401).send({ code: "WALLET_CHANNEL_BAD_SIGNATURE" });
    }

    const client = await assertPool().connect();
    try {
      await client.query("BEGIN");
      const order = await findFundsOrderByRef(client, input.orderRef);
      if (!order) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ code: "LENDER_WALLET_ORDER_NOT_FOUND" });
      }
      let receipt;
      try {
        receipt = await recordChannelCallbackReceipt({
          client,
          provider: input.provider,
          callbackRef: input.callbackRef,
          nonce: headers.nonce,
          payloadSha256: bodySha256,
          orderRef: input.orderRef,
        });
      } catch (error) {
        await client.query("ROLLBACK");
        if (
          error instanceof Error &&
          /^WALLET_CHANNEL_CALLBACK_(REF_CONFLICT|NONCE_REUSED)$/.test(
            error.message,
          )
        ) {
          return reply.code(409).send({ code: error.message });
        }
        throw error;
      }
      if (receipt.duplicate) {
        await client.query("COMMIT");
        return {
          duplicate: true,
          orderRef: order.order_ref,
          status: order.status,
          requestedAmountMinor: order.requested_amount_minor,
          settledAmountMinor: order.settled_amount_minor,
          currency: order.currency,
          updatedAt: order.updated_at,
        };
      }

      const amountMinor = input.amountMinor ?? order.requested_amount_minor;
      const settledAmountMinor =
        input.eventType === "SETTLED"
          ? (input.settledAmountMinor ??
            input.amountMinor ??
            order.requested_amount_minor)
          : undefined;
      const eventRef = `wallet-callback-${createHash("sha256")
        .update(`${input.orderRef}:${input.callbackRef}:${input.eventType}`)
        .digest("hex")
        .slice(0, 32)}`;

      let nextOrder;
      try {
        nextOrder = await transitionFundsOrder(client, {
          orderRef: order.order_ref,
          eventRef,
          eventType: input.eventType,
          actorRef: "lender-wallet-channel",
          fromStatus: order.status,
          externalCallbackRef: input.callbackRef,
          amountMinor,
          settledAmountMinor,
          metadata: {
            occurredAt: input.occurredAt,
            ...(input.metadata ?? {}),
          },
        });
      } catch (error) {
        await client.query("ROLLBACK");
        if (error instanceof Error) {
          if (/illegal funds order transition/i.test(error.message)) {
            return reply
              .code(409)
              .send({ code: "WALLET_CHANNEL_CALLBACK_OUT_OF_ORDER" });
          }
          if (/event type .* is not allowed/i.test(error.message)) {
            return reply
              .code(422)
              .send({ code: "WALLET_CHANNEL_CALLBACK_EVENT_INVALID" });
          }
        }
        throw error;
      }

      await addAuditEvent(client, {
        actorRef: "lender-wallet-channel",
        eventName: "WALLET_CHANNEL_CALLBACK_RECORDED",
        applicationNo: order.application_no,
        subjectRef: order.order_ref,
        details: {
          callbackRef: input.callbackRef,
          eventType: input.eventType,
          resultingStatus: nextOrder.status,
        },
      });
      await enqueueWalletOperationResult(client, nextOrder);
      await client.query("COMMIT");
      return {
        duplicate: false,
        orderRef: nextOrder.order_ref,
        status: nextOrder.status,
        requestedAmountMinor: nextOrder.requested_amount_minor,
        settledAmountMinor: nextOrder.settled_amount_minor,
        currency: nextOrder.currency,
        updatedAt: nextOrder.updated_at,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
);

app.post(
  "/v1/internal/repayment-snapshots",
  async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireInternalWorker(request, reply)) return;
    const input = z
      .object({
        applicationNo: z.string().min(1),
        externalWalletRef: z.string().min(3).max(128),
        payableAmountMinor: z.string().regex(/^\d+$/),
        accountingSnapshotRef: z.string().min(8).max(160),
        effectiveAt: z.string().datetime({ offset: true }),
      })
      .strict()
      .parse(request.body);
    if (BigInt(input.payableAmountMinor) <= 0n) {
      return reply
        .code(422)
        .send({ code: "LENDER_REPAYMENT_AMOUNT_OUT_OF_RANGE" });
    }
    const client = await assertPool().connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO lender_wallet_repayment_snapshots
          (application_no, external_wallet_ref, payable_amount_minor, currency,
           accounting_snapshot_ref, effective_at)
         VALUES ($1, $2, $3, 'USD', $4, $5)
         ON CONFLICT (accounting_snapshot_ref) DO NOTHING
         RETURNING id`,
        [
          input.applicationNo,
          input.externalWalletRef,
          input.payableAmountMinor,
          input.accountingSnapshotRef,
          input.effectiveAt,
        ],
      );
      if (!inserted.rowCount) {
        const existing = await client.query<{
          application_no: string;
          external_wallet_ref: string;
          payable_amount_minor: string;
        }>(
          `SELECT application_no, external_wallet_ref, payable_amount_minor::text
             FROM lender_wallet_repayment_snapshots
            WHERE accounting_snapshot_ref = $1
            FOR SHARE`,
          [input.accountingSnapshotRef],
        );
        const snapshot = existing.rows[0];
        if (
          !snapshot ||
          snapshot.application_no !== input.applicationNo ||
          snapshot.external_wallet_ref !== input.externalWalletRef ||
          snapshot.payable_amount_minor !== input.payableAmountMinor
        ) {
          await client.query("ROLLBACK");
          return reply
            .code(409)
            .send({ code: "LENDER_REPAYMENT_SNAPSHOT_CONFLICT" });
        }
      }
      await addAuditEvent(client, {
        actorRef: "lender-wallet-internal-worker",
        eventName: "LENDER_REPAYMENT_SNAPSHOT_RECORDED",
        applicationNo: input.applicationNo,
        subjectRef: input.accountingSnapshotRef,
        details: {
          externalWalletRef: input.externalWalletRef,
          payableAmountMinor: input.payableAmountMinor,
        },
      });
      await client.query("COMMIT");
      return { accepted: true, duplicate: !inserted.rowCount };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
);

app.post(
  "/v1/internal/wallet-ledger/credits",
  async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireInternalWorker(request, reply)) return;
    const input = z
      .object({
        applicationNo: z.string().min(1),
        externalWalletRef: z.string().min(3).max(128),
        availableBalanceMinor: z.string().regex(/^\d+$/),
        sourceReference: z.string().min(8).max(160),
      })
      .strict()
      .parse(request.body);
    const client = await assertPool().connect();
    try {
      await client.query("BEGIN");
      const queued = await enqueueWalletCreditEvent(client, input);
      await client.query("COMMIT");
      return queued;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
);

app.post(
  "/v1/internal/outbox/dispatch-pending",
  async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireInternalWorker(request, reply)) return;
    const input = z
      .object({
        limit: z.number().int().min(1).max(50).default(20),
      })
      .partial()
      .parse(request.body ?? {});
    const client = await assertPool().connect();
    try {
      await client.query("BEGIN");
      const pending = await pendingOutboxEvents(client, input.limit ?? 20);
      const pendingOperationResults = await pendingWalletOperationResultEvents(
        client,
        input.limit ?? 20,
      );
      let dispatched = 0;
      let failed = 0;
      for (const event of pending) {
        try {
          const response = await dispatchOutboxEvent(event);
          const accepted =
            response.statusCode >= 200 && response.statusCode < 300;
          await client.query(
            `INSERT INTO lender_wallet_event_dispatch_attempts
              (event_id, delivery_status, http_status_code, error_code)
             VALUES ($1, $2, $3, $4)`,
            [
              event.event_id,
              accepted ? "DISPATCHED" : "FAILED",
              response.statusCode,
              accepted ? null : `BROKER_HTTP_${response.statusCode}`,
            ],
          );
          await addAuditEvent(client, {
            actorRef: "lender-wallet-dispatcher",
            eventName: accepted
              ? "WALLET_EVENT_DISPATCHED"
              : "WALLET_EVENT_DISPATCH_FAILED",
            applicationNo: event.external_application_ref,
            subjectRef: event.event_id,
            details: {
              brokerStatusCode: response.statusCode,
            },
          });
          if (accepted) {
            dispatched += 1;
          } else {
            failed += 1;
          }
        } catch (error) {
          await client.query(
            `INSERT INTO lender_wallet_event_dispatch_attempts
              (event_id, delivery_status, error_code)
             VALUES ($1, 'FAILED', $2)`,
            [
              event.event_id,
              error instanceof Error
                ? error.message.slice(0, 120)
                : "DISPATCH_ERROR",
            ],
          );
          await addAuditEvent(client, {
            actorRef: "lender-wallet-dispatcher",
            eventName: "WALLET_EVENT_DISPATCH_FAILED",
            applicationNo: event.external_application_ref,
            subjectRef: event.event_id,
            details: {
              errorCode:
                error instanceof Error
                  ? error.message.slice(0, 120)
                  : "DISPATCH_ERROR",
            },
          });
          failed += 1;
        }
      }
      for (const event of pendingOperationResults) {
        try {
          const response = await dispatchWalletOperationResultEvent(event);
          const accepted =
            response.statusCode >= 200 && response.statusCode < 300;
          await client.query(
            `INSERT INTO wallet_operation_result_dispatch_attempts
              (event_id, delivery_status, http_status_code, error_code)
             VALUES ($1, $2, $3, $4)`,
            [
              event.event_id,
              accepted ? "DISPATCHED" : "FAILED",
              response.statusCode,
              accepted ? null : `BROKER_HTTP_${response.statusCode}`,
            ],
          );
          if (accepted) dispatched += 1;
          else failed += 1;
        } catch (error) {
          await client.query(
            `INSERT INTO wallet_operation_result_dispatch_attempts
              (event_id, delivery_status, error_code)
             VALUES ($1, 'FAILED', $2)`,
            [
              event.event_id,
              error instanceof Error
                ? error.message.slice(0, 120)
                : "DISPATCH_ERROR",
            ],
          );
          failed += 1;
        }
      }
      await client.query("COMMIT");
      return {
        scanned: pending.length + pendingOperationResults.length,
        dispatched,
        failed,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
);

const close = async (): Promise<void> => {
  await app.close();
  await pool?.end();
};

if (!isTestMode) {
  env("PAYEASE_LENDER_WALLET_SHARED_SECRET");
  env("PAYEASE_LENDER_EVENT_SHARED_SECRET");
  env("PAYEASE_LENDER_WALLET_INTERNAL_TOKEN");
  walletPublicOrigin();
  brokerExchangeUrl();
  brokerDomainEventInboxUrl();
  loadMtlsConfig();
  await runDatabaseMigrations(assertPool());
  const port = Number(process.env.PORT ?? 3200);
  const host = process.env.HOST ?? "127.0.0.1";
  app.listen({ host, port }).catch(async (error: unknown) => {
    app.log.error(error);
    await close();
    process.exit(1);
  });
}

export { app, close, sessions, setExchangeJumpHandlerForTests };
