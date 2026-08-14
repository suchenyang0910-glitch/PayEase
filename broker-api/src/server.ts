import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import Fastify from "fastify";
import { Pool, type PoolClient } from "pg";
import { z } from "zod";
import {
  brokerReviewSchema,
  bootstrapAdminSchema,
  adminAccountCreateSchema,
  adminAccountActivitySchema,
  adminAccountRolesUpdateSchema,
  applicantServiceCaseCreateSchema,
  applicantServiceCaseLenderResolutionSchema,
  applicantSupplementResponseSchema,
  departmentCreateSchema,
  roleCreateSchema,
  contractConfirmationSchema,
  createApplicationSchema,
  disbursementDualControlSchema,
  employerVerificationSchema,
  lenderFinalReviewSchema,
  lenderInitialReviewSchema,
  lifecycleActorSchema,
  loginSchema,
  preferredLanguageUpdateSchema,
  makerApprovalSchema,
  checkerApprovalSchema,
  repaymentDualControlSchema,
  reconciliationAssignSchema,
  reconciliationResolutionSchema,
  telegramSessionSchema,
} from "./validation.js";
import { hashPassword, verifyLoginPassword } from "./passwords.js";
import {
  buildRepaymentSchedule,
  formatApplicantLoanSummary,
  summarizeRepaymentSchedule,
  type RepaymentScheduleItem,
} from "./repayment.js";
import {
  configuredTelegramBots,
  enabledTelegramBotEntryUrls,
  isTelegramBotEnabled,
  requireTelegramRecoveryTopology,
  verifyTelegramMiniAppInitData,
} from "./telegram-auth.js";
import {
  isControlledPreview,
  requiresTelegramAuthentication,
} from "./telegram-auth-policy.js";
import {
  isAllowedApplicantOrigin,
  requireConfiguredApplicantOrigins,
} from "./applicant-origin.js";
import {
  decryptPersonalProfile,
  decryptPersonalValue,
  encryptPersonalProfile,
  encryptPersonalValue,
  personalDataEncryptionPreflight,
  personalDataKeyVersion,
} from "./personal-profile.js";
import { runDatabaseMigrations } from "./database-migrations.js";
import { applicantRejectionNoticeCode } from "./applicant-rejection-notice.js";
import {
  cookieValue,
  csrfCookie,
  expiredCsrfCookie,
  hasValidDoubleSubmitCsrf,
} from "./csrf.js";

declare module "fastify" {
  interface FastifyRequest {
    adminIdentity?: { loginName: string; roles: string[] };
    traceId?: string;
  }
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required; local PostgreSQL only for the controlled pilot.",
  );
}

const pool = new Pool({ connectionString: databaseUrl, max: 5 });
const app = Fastify({ logger: true });
const requestTraceContext = new AsyncLocalStorage<{ traceId: string }>();
const acceptedTraceId =
  /^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i;
const apiSecurityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
} as const;
const maxConsecutiveAdminLoginFailures = 5;
const adminLoginFailureWindowMinutes = 15;

function traceIdForRequest(header: string | string[] | undefined): string {
  const candidate = typeof header === "string" ? header.trim() : "";
  return acceptedTraceId.test(candidate)
    ? candidate.toLowerCase()
    : randomUUID();
}

function currentTraceId(): string {
  return requestTraceContext.getStore()?.traceId ?? randomUUID();
}

// Schema failures are client input errors.  Never surface them as a 500, which
// would make malformed public submissions look like a service outage.
app.setErrorHandler((error, request, reply) => {
  if (error instanceof z.ZodError) {
    return reply.code(400).send({
      code: "VALIDATION_ERROR",
      fields: error.issues.map((issue) => issue.path.join(".")),
      request_id: request.traceId ?? currentTraceId(),
    });
  }
  // Internal errors can contain database constraint names, ciphertext parsing
  // details, or other operational context. Log them for operators, but do not
  // expose that detail to an applicant or back-office browser.
  request.log.error({ err: error }, "Unhandled PayEase API error");
  return reply.code(500).send({
    code: "INTERNAL_ERROR",
    request_id: request.traceId ?? currentTraceId(),
  });
});

function sessionToken(cookieHeader: string | undefined): string | undefined {
  return cookieValue(cookieHeader, "payease_session");
}

function applicantAccessToken(
  cookieHeader: string | undefined,
): string | undefined {
  return cookieValue(cookieHeader, "payease_application");
}

function applicantSessionToken(
  cookieHeader: string | undefined,
): string | undefined {
  const cookies = cookieHeader?.split(";").map((part) => part.trim()) ?? [];
  // Keep accepting the previous name only until its short-lived cookie ages
  // out. New Telegram iframe sessions use __Host- plus Partitioned, so they
  // cannot be scoped to another host or silently reused outside the container.
  const hostCookie = cookies.find((part) =>
    part.startsWith("__Host-payease_applicant_session="),
  );
  if (hostCookie)
    return hostCookie.slice("__Host-payease_applicant_session=".length);
  return cookies
    .find((part) => part.startsWith("payease_applicant_session="))
    ?.slice("payease_applicant_session=".length);
}

async function authenticatedApplicant(
  cookieHeader: string | undefined,
): Promise<{ telegramUserRef: string } | undefined> {
  const token = applicantSessionToken(cookieHeader);
  if (!token) return undefined;
  const result = await pool.query<{
    telegram_user_ref: string;
    authenticated_bot_id: string;
  }>(
    `SELECT telegram_user_ref, authenticated_bot_id FROM telegram_auth_sessions
     WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
       AND last_seen_at > now() - interval '5 minutes'`,
    [eventHash([token])],
  );
  const identity = result.rows[0];
  if (!identity) return undefined;
  // Re-evaluate the Bot allowlist for every authenticated request.  This gives
  // incident responders an immediate kill switch for sessions minted by a bot
  // that was disabled after a suspected compromise; users can authenticate
  // through another enabled Bot because their record is keyed by Telegram ID.
  if (
    !isTelegramBotEnabled(
      identity.authenticated_bot_id,
      configuredTelegramBots(),
    )
  )
    return undefined;
  const touched = await pool.query(
    `UPDATE telegram_auth_sessions SET last_seen_at = now()
      WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
        AND last_seen_at > now() - interval '5 minutes'`,
    [eventHash([token])],
  );
  if (!touched.rowCount) return undefined;
  return { telegramUserRef: identity.telegram_user_ref };
}

async function hasRole(
  cookieHeader: string | undefined,
  roleCode: string,
): Promise<boolean> {
  const token = sessionToken(cookieHeader);
  if (!token) return false;
  const result = await pool.query(
    `SELECT 1 FROM admin_sessions s
     JOIN admin_account_roles ar ON ar.account_id = s.account_id
     JOIN roles r ON r.id = ar.role_id
     WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND r.code = $2`,
    [eventHash([token]), roleCode],
  );
  return Boolean(result.rowCount);
}

async function requireOpsAdmin(
  request: { headers: { cookie?: string } },
  reply: any,
): Promise<boolean> {
  if (!(await hasRole(request.headers.cookie, "OPS_ADMIN"))) {
    reply.code(403).send({ code: "FORBIDDEN__ROLE_OUT_OF_SCOPE" });
    return false;
  }
  return true;
}

app.addHook("onRequest", async (request, reply) => {
  const traceId = traceIdForRequest(request.headers["x-trace-id"]);
  request.traceId = traceId;
  requestTraceContext.enterWith({ traceId });
  reply.header("X-Trace-Id", traceId);
  const requestPath = request.url.split("?", 1)[0]!;
  const isPublicUserApplicationSubmission =
    request.method === "POST" && requestPath === "/v1/local/applications";
  const isPublicTelegramSession =
    request.method === "POST" &&
    (requestPath === "/v1/local/public/telegram-sessions" ||
      requestPath === "/v1/local/public/telegram-sessions/logout" ||
      requestPath === "/v1/local/public/telegram-sessions/keepalive");
  const isTelegramSessionCreation =
    request.method === "POST" &&
    requestPath === "/v1/local/public/telegram-sessions";
  const isPublicApplicantLanguagePreference =
    request.method === "PUT" &&
    requestPath === "/v1/local/public/profile/preferred-language";
  const isPublicUserApplicationView =
    requestPath === "/v1/local/public/applications" ||
    requestPath.startsWith("/v1/local/public/applications/");
  const isPublicTelegramEntryPoints =
    request.method === "GET" &&
    requestPath === "/v1/local/public/telegram-entrypoints";
  const isApplicantStateChange =
    isPublicUserApplicationSubmission ||
    isPublicTelegramSession ||
    isPublicApplicantLanguagePreference ||
    ((request.method === "POST" ||
      request.method === "PUT" ||
      request.method === "PATCH" ||
      request.method === "DELETE") &&
      requestPath.startsWith("/v1/local/public/applications/"));
  const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(
    request.method,
  );
  const isApplicantCsrfProtected =
    isApplicantStateChange && !isTelegramSessionCreation;
  const isAdminCsrfProtected =
    isMutation &&
    requestPath.startsWith("/v1/local/") &&
    !isPublicUserApplicationSubmission &&
    !isPublicTelegramSession &&
    !isPublicApplicantLanguagePreference &&
    requestPath !== "/v1/local/auth/login" &&
    requestPath !== "/v1/local/auth/bootstrap";
  // In production, the Telegram iframe's fetch Origin is the Mini App's own
  // HTTPS origin. Reject any other browser context before it can send a
  // cookie-backed state change. Test fixtures exercise the parser separately
  // and intentionally omit browser headers.
  if (
    process.env.NODE_ENV !== "test" &&
    requiresTelegramAuthentication() &&
    isApplicantStateChange &&
    !isAllowedApplicantOrigin(
      request.headers.origin,
      requireConfiguredApplicantOrigins(),
    )
  ) {
    return reply.code(403).send({ code: "APPLICANT_ORIGIN_FORBIDDEN" });
  }
  // Browser cookies authenticate both applicant and back-office state changes.
  // Require a same-site readable token in addition to the HttpOnly session
  // cookie. The initial Telegram initData exchange is exempt because there is
  // no session yet and initData itself is a signed, short-lived proof.
  if (
    process.env.NODE_ENV !== "test" &&
    isApplicantCsrfProtected &&
    !hasValidDoubleSubmitCsrf(
      "applicant",
      request.headers.cookie,
      request.headers["x-csrf-token"],
    )
  ) {
    return reply.code(403).send({ code: "CSRF_TOKEN_INVALID" });
  }
  if (
    process.env.NODE_ENV !== "test" &&
    isAdminCsrfProtected &&
    !hasValidDoubleSubmitCsrf(
      "admin",
      request.headers.cookie,
      request.headers["x-csrf-token"],
    )
  ) {
    return reply.code(403).send({ code: "CSRF_TOKEN_INVALID" });
  }
  if (
    !requestPath.startsWith("/v1/local/") ||
    requestPath.startsWith("/v1/local/auth/") ||
    isPublicUserApplicationSubmission ||
    isPublicTelegramSession ||
    isPublicApplicantLanguagePreference ||
    isPublicUserApplicationView ||
    isPublicTelegramEntryPoints
  )
    return;
  const token = sessionToken(request.headers.cookie);
  const result = token
    ? await pool.query(
        `SELECT a.login_name, COALESCE(array_agg(r.code) FILTER (WHERE r.code IS NOT NULL), '{}') AS roles
         FROM admin_sessions s JOIN admin_accounts a ON a.id = s.account_id
         LEFT JOIN admin_account_roles ar ON ar.account_id = a.id
         LEFT JOIN roles r ON r.id = ar.role_id
         WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND a.is_active = true
         GROUP BY a.login_name`,
        [eventHash([token])],
      )
    : undefined;
  if (!result?.rowCount)
    return reply.code(401).send({ code: "UNAUTHENTICATED" });
  const identity = result.rows[0] as { login_name: string; roles: string[] };
  request.adminIdentity = {
    loginName: identity.login_name,
    roles: identity.roles,
  };
});

function requireRole(
  request: { adminIdentity?: { roles: string[] } },
  reply: any,
  roleCode: string,
): boolean {
  if (!request.adminIdentity?.roles.includes(roleCode)) {
    reply.code(403).send({ code: "FORBIDDEN__ROLE_OUT_OF_SCOPE" });
    return false;
  }
  return true;
}

function requireLenderRole(
  request: { adminIdentity?: { roles: string[] } },
  reply: any,
): boolean {
  if (
    !request.adminIdentity?.roles.some((role) => role.startsWith("LENDER_"))
  ) {
    reply.code(403).send({ code: "FORBIDDEN__ROLE_OUT_OF_SCOPE" });
    return false;
  }
  return true;
}

function requireServiceCaseReadRole(
  request: { adminIdentity?: { roles: string[] } },
  reply: any,
): boolean {
  const roles = request.adminIdentity?.roles ?? [];
  if (
    !roles.includes("BROKER_OFFICER") &&
    !roles.includes("LENDER_COMPLAINT_OFFICER")
  ) {
    reply.code(403).send({ code: "FORBIDDEN__ROLE_OUT_OF_SCOPE" });
    return false;
  }
  return true;
}

function requireLenderComplaintOfficer(
  request: { adminIdentity?: { roles: string[] } },
  reply: any,
): boolean {
  return requireRole(request, reply, "LENDER_COMPLAINT_OFFICER");
}

app.addHook("onSend", async (_request, reply) => {
  // Do not advertise a misleading preview mode from a production deployment.
  // The marker exists only as a visible safeguard on intentionally limited UX
  // review environments.
  if (isControlledPreview())
    reply.header("X-PayEase-Environment", "controlled-preview");
  // These are safe for JSON responses regardless of the calling browser.
  // Document-level CSP, framing and HSTS remain the responsibility of the
  // TLS reverse proxy because the Telegram Mini App and back-office portals
  // deliberately require different document policies.
  for (const [name, value] of Object.entries(apiSecurityHeaders))
    reply.header(name, value);
  reply.header("Cache-Control", "no-store");
});

function eventHash(parts: readonly string[]): string {
  return createHash("sha256").update(parts.join("|"), "utf8").digest("hex");
}

type ApplicationRow = Readonly<{
  id: string;
  status: string;
  review_round: number;
}>;

type SingleApproval = Readonly<{
  actorUserRef: string;
  actorRole: string;
  decision: "APPROVED" | "REJECTED" | "RETURNED";
  reasonCode: string;
}>;

type ApprovalCommand = Readonly<{
  decision: "APPROVED" | "REJECTED" | "RETURNED";
  reasonCode: string;
}>;

type FinalReviewTerms = Readonly<{
  approvedAmountMinor?: string;
  serviceFeeMinor?: string;
  totalRepayableMinor?: string;
  installmentCount?: number;
  firstDueDate?: string;
}>;

class DualControlConflictError extends Error {}

type ManualActionName =
  | "DISBURSEMENT_RELEASE"
  | "DISBURSEMENT_CONFIRMATION"
  | "REPAYMENT_WRITE_OFF"
  | "REPAYMENT_CONFIRMATION";

type ManualActionReplay =
  | Readonly<{
      kind: "new";
      idempotencyKey: string;
      requestFingerprint: string;
    }>
  | Readonly<{
      kind: "replay";
      responseStatus: number;
      responseBody: Record<string, unknown>;
    }>
  | Readonly<{ kind: "key-reused" }>;

function manualActionIdempotencyKey(
  header: string | string[] | undefined,
): string | undefined {
  const value = Array.isArray(header) ? undefined : header;
  return z
    .string()
    .regex(/^[A-Za-z0-9._:-]{16,128}$/)
    .safeParse(value).data;
}

async function manualActionReplay(
  client: PoolClient,
  application: ApplicationRow,
  actionName: ManualActionName,
  actorUserRef: string,
  idempotencyKey: string,
  requestBody: object,
): Promise<ManualActionReplay> {
  const requestFingerprint = eventHash([JSON.stringify(requestBody)]);
  const existing = await client.query<{
    request_fingerprint: string;
    response_status: number;
    response_body: Record<string, unknown>;
  }>(
    `SELECT request_fingerprint, response_status, response_body
       FROM manual_action_idempotency
      WHERE application_id = $1 AND action_name = $2
        AND actor_user_ref = $3 AND idempotency_key = $4
      FOR UPDATE`,
    [application.id, actionName, actorUserRef, idempotencyKey],
  );
  const recorded = existing.rows[0];
  if (!recorded) return { kind: "new", idempotencyKey, requestFingerprint };
  if (recorded.request_fingerprint !== requestFingerprint)
    return { kind: "key-reused" };
  return {
    kind: "replay",
    responseStatus: recorded.response_status,
    responseBody: recorded.response_body,
  };
}

async function recordManualActionResult(
  client: PoolClient,
  application: ApplicationRow,
  actionName: ManualActionName,
  actorUserRef: string,
  replay: Extract<ManualActionReplay, { kind: "new" }>,
  responseBody: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `INSERT INTO manual_action_idempotency
      (application_id, action_name, actor_user_ref, idempotency_key,
       request_fingerprint, response_status, response_body)
     VALUES ($1, $2, $3, $4, $5, 200, $6::jsonb)`,
    [
      application.id,
      actionName,
      actorUserRef,
      replay.idempotencyKey,
      replay.requestFingerprint,
      JSON.stringify(responseBody),
    ],
  );
}

async function lockApplication(
  client: PoolClient,
  applicationNo: string,
): Promise<ApplicationRow | undefined> {
  const result = await client.query<ApplicationRow>(
    "SELECT id, status, review_round FROM applications WHERE application_no = $1 FOR UPDATE",
    [applicationNo],
  );
  return result.rows[0];
}

async function updateStatus(
  client: PoolClient,
  application: ApplicationRow,
  toStatus: string,
  actorUserRef: string,
  reasonCode: string,
): Promise<void> {
  if (application.status === toStatus) return;
  await client.query(
    "UPDATE applications SET status = $1, updated_at = now() WHERE id = $2",
    [toStatus, application.id],
  );
  await client.query(
    `INSERT INTO application_status_events (application_id, from_status, to_status, actor_user_ref, reason_code, occurred_at)
     VALUES ($1, $2, $3, $4, $5, now())`,
    [application.id, application.status, toStatus, actorUserRef, reasonCode],
  );
}

async function recordSingleApproval(
  client: PoolClient,
  application: ApplicationRow,
  stage: string,
  input: SingleApproval,
  approvedStatus: string,
): Promise<string> {
  const toStatus =
    input.decision === "APPROVED"
      ? approvedStatus
      : input.decision === "REJECTED"
        ? "REJECTED"
        : application.status;
  await client.query(
    `INSERT INTO approval_events (application_id, stage, decision, actor_user_ref, actor_role, reason_code, review_round, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
    [
      application.id,
      stage,
      input.decision,
      input.actorUserRef,
      input.actorRole,
      input.reasonCode,
      application.review_round,
    ],
  );
  if (input.decision === "RETURNED") {
    await client.query(
      `UPDATE applications
          SET review_round = review_round + 1,
              supplement_requested = true,
              updated_at = now()
        WHERE id = $1`,
      [application.id],
    );
  } else {
    await client.query(
      `UPDATE applications
          SET supplement_requested = false, updated_at = now()
        WHERE id = $1`,
      [application.id],
    );
  }
  await updateStatus(
    client,
    application,
    toStatus,
    input.actorUserRef,
    input.reasonCode,
  );
  await addAuditEvent(
    client,
    application.id,
    `${stage}_RECORDED`,
    input.actorUserRef,
    { ...input, reviewRound: application.review_round },
  );
  return toStatus;
}

async function addAuditEvent(
  client: PoolClient,
  entityId: string,
  eventType: string,
  actorUserRef: string,
  payload: Record<string, unknown>,
  entityType = "APPLICATION",
): Promise<void> {
  const payloadHash = eventHash([JSON.stringify(payload)]);
  const previous = await client.query<{ event_hash: string }>(
    "SELECT event_hash FROM audit_events WHERE entity_type = $1 AND entity_id = $2 ORDER BY occurred_at DESC, id DESC LIMIT 1",
    [entityType, entityId],
  );
  const previousHash = previous.rows[0]?.event_hash ?? null;
  // Preserve the existing application-ledger hash formula. Other entity types
  // include their type in the commitment so identical UUIDs cannot be chained
  // across unrelated audit domains.
  const auditHash = eventHash([
    ...(entityType === "APPLICATION" ? [] : [entityType]),
    entityId,
    eventType,
    actorUserRef,
    currentTraceId(),
    payloadHash,
    previousHash ?? "",
  ]);
  await client.query(
    `INSERT INTO audit_events
      (entity_type, entity_id, event_type, actor_user_ref, trace_id, payload_hash, previous_event_hash, event_hash, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
    [
      entityType,
      entityId,
      eventType,
      actorUserRef,
      currentTraceId(),
      payloadHash,
      previousHash,
      auditHash,
    ],
  );
}

async function addAuthenticationAuditEvent(
  client: PoolClient,
  entityId: string,
  eventType: "AUTH_LOGIN_SUCCESS" | "AUTH_LOGIN_FAILURE" | "AUTH_LOGOUT",
  actorUserRef: string,
  payload: Record<string, unknown>,
): Promise<void> {
  // The immutable audit table stores a payload commitment rather than the
  // payload itself. Keep raw login names, user agents and credentials out of
  // the ledger; operators can correlate events through the opaque actor hash.
  const payloadHash = eventHash([JSON.stringify(payload), randomUUID()]);
  const previous = await client.query<{ event_hash: string }>(
    `SELECT event_hash FROM audit_events
      WHERE entity_type = 'ADMIN_AUTH' AND entity_id = $1
      ORDER BY occurred_at DESC, id DESC LIMIT 1`,
    [entityId],
  );
  const previousHash = previous.rows[0]?.event_hash ?? null;
  const auditHash = eventHash([
    "ADMIN_AUTH",
    entityId,
    eventType,
    actorUserRef,
    currentTraceId(),
    payloadHash,
    previousHash ?? "",
  ]);
  await client.query(
    `INSERT INTO audit_events
      (entity_type, entity_id, event_type, actor_user_ref, trace_id, payload_hash, previous_event_hash, event_hash, occurred_at)
     VALUES ('ADMIN_AUTH', $1, $2, $3, $4, $5, $6, $7, now())`,
    [
      entityId,
      eventType,
      actorUserRef,
      currentTraceId(),
      payloadHash,
      previousHash,
      auditHash,
    ],
  );
}

async function hasExceededAdminLoginFailureLimit(
  client: PoolClient,
  loginNameHash: string,
): Promise<boolean> {
  // The audit ledger is append-only, so the latest success naturally resets
  // the consecutive-failure sequence without a mutable lockout column. This
  // remains consistent across replacement containers in the controlled pilot.
  const recent = await client.query<{ event_type: string }>(
    `SELECT event_type
       FROM audit_events
      WHERE entity_type = 'ADMIN_AUTH'
        AND actor_user_ref = $1
        AND occurred_at > now() - ($2::text || ' minutes')::interval
        AND event_type IN ('AUTH_LOGIN_FAILURE', 'AUTH_LOGIN_SUCCESS')
      ORDER BY occurred_at DESC, id DESC
      LIMIT $3`,
    [
      loginNameHash,
      String(adminLoginFailureWindowMinutes),
      maxConsecutiveAdminLoginFailures,
    ],
  );
  return (
    recent.rows.length === maxConsecutiveAdminLoginFailures &&
    recent.rows.every((event) => event.event_type === "AUTH_LOGIN_FAILURE")
  );
}

async function createRepaymentSchedule(
  client: PoolClient,
  applicationId: string,
): Promise<void> {
  const terms = await client.query<{
    total_repayable_minor: string;
    installment_count: number;
    first_due_date: string;
  }>(
    `SELECT total_repayable_minor::text, installment_count, first_due_date::text
       FROM loan_terms WHERE application_id = $1`,
    [applicationId],
  );
  const term = terms.rows[0];
  if (!term) throw new Error("contractual loan terms are required");
  const existing = await client.query(
    "SELECT 1 FROM repayment_installments WHERE application_id = $1 LIMIT 1",
    [applicationId],
  );
  if (existing.rowCount) return;
  for (const installment of buildRepaymentSchedule(
    term.total_repayable_minor,
    term.installment_count,
    term.first_due_date,
  )) {
    await client.query(
      `INSERT INTO repayment_installments (application_id, installment_no, due_date, amount_due_minor)
       VALUES ($1, $2, $3, $4)`,
      [
        applicationId,
        installment.installmentNo,
        installment.dueDate,
        installment.amountDueMinor,
      ],
    );
  }
}

async function loadLoanDetails(applicationId: string): Promise<{
  terms: null | {
    approvedAmountMinor: string;
    serviceFeeMinor: string;
    totalRepayableMinor: string;
    installmentCount: number;
    firstDueDate: string;
  };
  repayment: ReturnType<typeof summarizeRepaymentSchedule>;
}> {
  const terms = await pool.query<{
    approved_amount_minor: string;
    service_fee_minor: string;
    total_repayable_minor: string;
    installment_count: number;
    first_due_date: string;
  }>(
    `SELECT approved_amount_minor::text, service_fee_minor::text,
            total_repayable_minor::text, installment_count, first_due_date::text
       FROM loan_terms WHERE application_id = $1`,
    [applicationId],
  );
  const installments = await pool.query<{
    installment_no: number;
    due_date: string;
    amount_due_minor: string;
    amount_paid_minor: string;
    status: "PENDING" | "PAID";
  }>(
    `SELECT installment_no, due_date::text, amount_due_minor::text,
            amount_paid_minor::text, status
       FROM repayment_installments WHERE application_id = $1 ORDER BY installment_no ASC`,
    [applicationId],
  );
  const schedule: RepaymentScheduleItem[] = installments.rows.map((item) => ({
    installmentNo: item.installment_no,
    dueDate: item.due_date,
    amountDueMinor: item.amount_due_minor,
    amountPaidMinor: item.amount_paid_minor,
    status: item.status,
  }));
  const term = terms.rows[0];
  return {
    terms: term
      ? {
          approvedAmountMinor: term.approved_amount_minor,
          serviceFeeMinor: term.service_fee_minor,
          totalRepayableMinor: term.total_repayable_minor,
          installmentCount: term.installment_count,
          firstDueDate: term.first_due_date,
        }
      : null,
    repayment: summarizeRepaymentSchedule(schedule),
  };
}

app.get("/health/live", async () => {
  return { status: "live", service: "broker-api" };
});

async function readinessPayload() {
  await pool.query("SELECT 1");
  return { status: "ready", service: "broker-api", storage: "postgresql" };
}

// Keep the original health endpoint as a readiness probe for existing Caddy,
// Docker, or external monitors; new deployments should use the explicit path.
app.get("/health", readinessPayload);
app.get("/health/ready", readinessPayload);

app.post("/v1/local/auth/bootstrap", async (request, reply) => {
  const input = bootstrapAdminSchema.parse(request.body);
  const bootstrapPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (
    !bootstrapPassword ||
    request.headers["x-bootstrap-password"] !== bootstrapPassword
  ) {
    return reply.code(403).send({ code: "BOOTSTRAP_FORBIDDEN" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query("SELECT 1 FROM admin_accounts LIMIT 1");
    if (existing.rowCount) {
      await client.query("ROLLBACK");
      return reply.code(409).send({ code: "BOOTSTRAP_ALREADY_COMPLETED" });
    }
    const department = await client.query<{ id: string }>(
      `INSERT INTO departments (domain, code, display_name_zh, display_name_en, display_name_km)
       VALUES ('OPS', 'OPS_ADMIN', '平台运营', 'Platform operations', 'ប្រតិបត្តិការវេទិកា') RETURNING id`,
    );
    const role = await client.query<{ id: string }>(
      `INSERT INTO roles (domain, code, display_name_zh, display_name_en, display_name_km)
       VALUES ('OPS', 'OPS_ADMIN', '平台管理员', 'Platform administrator', 'អ្នកគ្រប់គ្រងវេទិកា') RETURNING id`,
    );
    await client.query(
      "INSERT INTO permissions (code, description) VALUES ('ADMIN_RBAC_MANAGE', 'Manage departments, roles and accounts')",
    );
    await client.query(
      "INSERT INTO role_permissions (role_id, permission_code) VALUES ($1, 'ADMIN_RBAC_MANAGE')",
      [role.rows[0]!.id],
    );
    const account = await client.query<{ id: string }>(
      `INSERT INTO admin_accounts (login_name, password_hash, department_id, preferred_language)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [
        input.loginName,
        await hashPassword(input.password),
        department.rows[0]!.id,
        input.preferredLanguage,
      ],
    );
    await client.query(
      "INSERT INTO admin_account_roles (account_id, role_id) VALUES ($1, $2)",
      [account.rows[0]!.id, role.rows[0]!.id],
    );
    for (const [domain, code, zh, en, km] of [
      [
        "BROKER",
        "BROKER_OFFICER",
        "助贷审核员",
        "Broker officer",
        "មន្ត្រីត្រួតពិនិត្យឯកសារ",
      ],
      [
        "LENDER",
        "LENDER_CREDIT_OFFICER",
        "持牌初审员",
        "Lender initial reviewer",
        "មន្ត្រីពិនិត្យឥណទានដំបូង",
      ],
      [
        "LENDER",
        "LENDER_CREDIT_REVIEWER",
        "持牌复审员",
        "Lender final reviewer",
        "មន្ត្រីពិនិត្យឥណទានចុងក្រោយ",
      ],
      [
        "LENDER",
        "LENDER_CONTRACT_OFFICER",
        "合同专员",
        "Contract officer",
        "មន្ត្រីកិច្ចសន្យា",
      ],
      [
        "LENDER",
        "LENDER_DISBURSEMENT_MAKER",
        "放款经办",
        "Disbursement maker",
        "មន្ត្រីបញ្ចេញប្រាក់",
      ],
      [
        "LENDER",
        "LENDER_DISBURSEMENT_CHECKER",
        "放款复核",
        "Disbursement checker",
        "មន្ត្រីត្រួតពិនិត្យការបញ្ចេញប្រាក់",
      ],
      [
        "LENDER",
        "LENDER_REPAYMENT_MAKER",
        "还款核销经办",
        "Repayment maker",
        "មន្ត្រីកត់ត្រាការសងប្រាក់",
      ],
      [
        "LENDER",
        "LENDER_REPAYMENT_CHECKER",
        "还款核销复核",
        "Repayment checker",
        "មន្ត្រីត្រួតពិនិត្យការសងប្រាក់",
      ],
      [
        "LENDER",
        "LENDER_COMPLAINT_OFFICER",
        "投诉处理专员",
        "Lender complaint officer",
        "មន្ត្រីដោះស្រាយបណ្តឹង",
      ],
      [
        "EMPLOYER",
        "EMPLOYER_HR",
        "企业 HR 核验员",
        "Employer HR verifier",
        "មន្ត្រីផ្ទៀងផ្ទាត់ធនធានមនុស្ស",
      ],
      [
        "EMPLOYER",
        "EMPLOYER_FINANCE",
        "企业财务核验员",
        "Employer finance verifier",
        "មន្ត្រីផ្ទៀងផ្ទាត់ហិរញ្ញវត្ថុ",
      ],
    ] as const) {
      await client.query(
        `INSERT INTO roles (domain, code, display_name_zh, display_name_en, display_name_km)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (code) DO NOTHING`,
        [domain, code, zh, en, km],
      );
    }
    await addAuditEvent(
      client,
      account.rows[0]!.id,
      "ADMIN_BOOTSTRAPPED",
      input.loginName,
      { loginName: input.loginName },
    );
    await client.query("COMMIT");
    return reply
      .code(201)
      .send({ loginName: input.loginName, role: "OPS_ADMIN" });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

app.post("/v1/local/auth/login", async (request, reply) => {
  const input = loginSchema.parse(request.body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const account = await client.query<{
      id: string;
      password_hash: string;
      preferred_language: string;
    }>(
      "SELECT id, password_hash, preferred_language FROM admin_accounts WHERE login_name = $1 AND is_active = true",
      [input.loginName],
    );
    const row = account.rows[0];
    const loginNameHash = eventHash([input.loginName]);
    const authPayload = {
      sourceIp: request.ip,
      userAgentHash: eventHash([request.headers["user-agent"] ?? ""]),
    };
    if (await hasExceededAdminLoginFailureLimit(client, loginNameHash)) {
      await client.query("COMMIT");
      reply.header("Retry-After", String(adminLoginFailureWindowMinutes * 60));
      return reply.code(429).send({ code: "LOGIN_RATE_LIMITED" });
    }
    if (!(await verifyLoginPassword(input.password, row?.password_hash))) {
      await addAuthenticationAuditEvent(
        client,
        row?.id ?? randomUUID(),
        "AUTH_LOGIN_FAILURE",
        loginNameHash,
        authPayload,
      );
      await client.query("COMMIT");
      return reply.code(401).send({ code: "INVALID_CREDENTIALS" });
    }
    const token = randomBytes(32).toString("base64url");
    await client.query(
      "INSERT INTO admin_sessions (token_hash, account_id, expires_at) VALUES ($1, $2, now() + interval '30 minutes')",
      [eventHash([token]), row.id],
    );
    await addAuthenticationAuditEvent(
      client,
      row.id,
      "AUTH_LOGIN_SUCCESS",
      loginNameHash,
      authPayload,
    );
    await client.query("COMMIT");
    reply.header("Set-Cookie", [
      `payease_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=1800`,
      csrfCookie("admin", randomBytes(32).toString("base64url"), 1800),
    ]);
    return {
      loginName: input.loginName,
      preferredLanguage: row.preferred_language,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

app.post("/v1/local/auth/logout", async (request, reply) => {
  const token = sessionToken(request.headers.cookie);
  if (!token) {
    reply.header("Set-Cookie", [
      "payease_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0",
      expiredCsrfCookie("admin"),
    ]);
    return reply.code(204).send();
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const revoked = await client.query<{
      account_id: string;
      login_name: string;
    }>(
      `UPDATE admin_sessions AS session
          SET revoked_at = now()
         FROM admin_accounts AS account
        WHERE session.token_hash = $1
          AND session.account_id = account.id
          AND session.revoked_at IS NULL
        RETURNING session.account_id, account.login_name`,
      [eventHash([token])],
    );
    const row = revoked.rows[0];
    if (row) {
      await addAuthenticationAuditEvent(
        client,
        row.account_id,
        "AUTH_LOGOUT",
        eventHash([row.login_name]),
        { reason: "USER_INITIATED_LOGOUT" },
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  reply.header("Set-Cookie", [
    "payease_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0",
    expiredCsrfCookie("admin"),
  ]);
  return reply.code(204).send();
});

app.get("/v1/local/auth/me", async (request, reply) => {
  const token = sessionToken(request.headers.cookie);
  const result = token
    ? await pool.query<{
        login_name: string;
        preferred_language: string;
        roles: string[];
      }>(
        `SELECT a.login_name, a.preferred_language,
                COALESCE(array_agg(r.code) FILTER (WHERE r.code IS NOT NULL), '{}') AS roles
         FROM admin_sessions s JOIN admin_accounts a ON a.id = s.account_id
         LEFT JOIN admin_account_roles ar ON ar.account_id = a.id
         LEFT JOIN roles r ON r.id = ar.role_id
         WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND a.is_active = true
         GROUP BY a.login_name, a.preferred_language`,
        [eventHash([token])],
      )
    : undefined;
  if (!result?.rowCount)
    return reply.code(401).send({ code: "UNAUTHENTICATED" });
  const identity = result.rows[0]!;
  return {
    loginName: identity.login_name,
    preferredLanguage: identity.preferred_language,
    roles: identity.roles,
  };
});

app.patch("/v1/local/auth/me/preferred-language", async (request, reply) => {
  const input = preferredLanguageUpdateSchema.parse(request.body);
  const token = sessionToken(request.headers.cookie);
  if (!token) return reply.code(401).send({ code: "UNAUTHENTICATED" });
  const updated = await pool.query<{
    login_name: string;
    preferred_language: string;
  }>(
    `UPDATE admin_accounts a SET preferred_language = $1, updated_at = now()
     FROM admin_sessions s
     WHERE s.account_id = a.id AND s.token_hash = $2 AND s.revoked_at IS NULL
       AND s.expires_at > now() AND a.is_active = true
     RETURNING a.login_name, a.preferred_language`,
    [input.preferredLanguage, eventHash([token])],
  );
  if (!updated.rowCount)
    return reply.code(401).send({ code: "UNAUTHENTICATED" });
  return {
    loginName: updated.rows[0]!.login_name,
    preferredLanguage: updated.rows[0]!.preferred_language,
  };
});

app.get("/v1/local/admin/departments", async (request, reply) => {
  if (!(await requireOpsAdmin(request, reply))) return;
  const result = await pool.query(
    "SELECT code, domain, display_name_zh, display_name_en, display_name_km FROM departments ORDER BY domain, code",
  );
  return result.rows;
});

app.post("/v1/local/admin/departments", async (request, reply) => {
  if (!(await requireOpsAdmin(request, reply))) return;
  const input = departmentCreateSchema.parse(request.body);
  const result = await pool.query(
    `INSERT INTO departments (domain, code, display_name_zh, display_name_en, display_name_km)
     VALUES ($1, $2, $3, $4, $5) RETURNING code, domain`,
    [
      input.domain,
      input.code,
      input.displayNameZh,
      input.displayNameEn,
      input.displayNameKm,
    ],
  );
  return reply.code(201).send(result.rows[0]);
});

app.get("/v1/local/admin/roles", async (request, reply) => {
  if (!(await requireOpsAdmin(request, reply))) return;
  const result = await pool.query(
    `SELECT r.code, r.domain, r.display_name_zh, r.display_name_en, r.display_name_km,
       COALESCE(array_agg(rp.permission_code) FILTER (WHERE rp.permission_code IS NOT NULL), '{}') AS permissions
     FROM roles r LEFT JOIN role_permissions rp ON rp.role_id = r.id
     GROUP BY r.id ORDER BY r.domain, r.code`,
  );
  return result.rows;
});

app.post("/v1/local/admin/roles", async (request, reply) => {
  if (!(await requireOpsAdmin(request, reply))) return;
  const input = roleCreateSchema.parse(request.body);
  await pool.query(
    `INSERT INTO roles (domain, code, display_name_zh, display_name_en, display_name_km)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [
      input.domain,
      input.code,
      input.displayNameZh,
      input.displayNameEn,
      input.displayNameKm,
    ],
  );
  return reply.code(201).send({ code: input.code, domain: input.domain });
});

app.get("/v1/local/admin/accounts", async (request, reply) => {
  if (!(await requireOpsAdmin(request, reply))) return;
  const result = await pool.query(
    `SELECT a.login_name, a.preferred_language, a.is_active, d.code AS department_code,
       COALESCE(array_agg(r.code) FILTER (WHERE r.code IS NOT NULL), '{}') AS roles
     FROM admin_accounts a JOIN departments d ON d.id = a.department_id
     LEFT JOIN admin_account_roles ar ON ar.account_id = a.id LEFT JOIN roles r ON r.id = ar.role_id
     GROUP BY a.id, d.code ORDER BY a.created_at`,
  );
  return result.rows;
});

app.post("/v1/local/admin/accounts", async (request, reply) => {
  if (!(await requireOpsAdmin(request, reply))) return;
  const input = adminAccountCreateSchema.parse(request.body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const department = await client.query<{ id: string; domain: string }>(
      "SELECT id, domain FROM departments WHERE code = $1",
      [input.departmentCode],
    );
    const roles = await client.query<{
      id: string;
      code: string;
      domain: string;
    }>("SELECT id, code, domain FROM roles WHERE code = ANY($1::text[])", [
      input.roleCodes,
    ]);
    if (!department.rows[0] || roles.rowCount !== input.roleCodes.length) {
      await client.query("ROLLBACK");
      return reply.code(422).send({ code: "UNKNOWN_DEPARTMENT_OR_ROLE" });
    }
    if (roles.rows.some((role) => role.domain !== department.rows[0]!.domain)) {
      await client.query("ROLLBACK");
      return reply.code(422).send({ code: "ROLE_DOMAIN_MISMATCH" });
    }
    const account = await client.query<{ id: string }>(
      `INSERT INTO admin_accounts (login_name, password_hash, department_id, preferred_language)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [
        input.loginName,
        await hashPassword(input.password),
        department.rows[0].id,
        input.preferredLanguage,
      ],
    );
    for (const role of roles.rows) {
      await client.query(
        "INSERT INTO admin_account_roles (account_id, role_id) VALUES ($1, $2)",
        [account.rows[0]!.id, role.id],
      );
    }
    await addAuditEvent(
      client,
      account.rows[0]!.id,
      "ADMIN_ACCOUNT_CREATED",
      input.loginName,
      { roleCodes: input.roleCodes, departmentCode: input.departmentCode },
    );
    await client.query("COMMIT");
    return reply.code(201).send({
      loginName: input.loginName,
      roleCodes: input.roleCodes,
      preferredLanguage: input.preferredLanguage,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

// Disabling an internal account is an incident/offboarding control, not a
// cosmetic directory edit. Revoke every outstanding session in the same
// transaction so the account loses access immediately.
app.patch(
  "/v1/local/admin/accounts/:loginName/activity",
  async (request, reply) => {
    if (!(await requireOpsAdmin(request, reply))) return;
    const params = z
      .object({ loginName: z.string().regex(/^[a-z0-9._-]{3,64}$/) })
      .parse(request.params);
    const input = adminAccountActivitySchema.parse(request.body);
    const actorLoginName = request.adminIdentity!.loginName;
    if (!input.isActive && params.loginName === actorLoginName) {
      return reply.code(409).send({ code: "ADMIN_SELF_DEACTIVATION_BLOCKED" });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const account = await client.query<{
        id: string;
        login_name: string;
        is_active: boolean;
      }>(
        `UPDATE admin_accounts SET is_active = $1, updated_at = now()
          WHERE login_name = $2
          RETURNING id, login_name, is_active`,
        [input.isActive, params.loginName],
      );
      const row = account.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ code: "ADMIN_ACCOUNT_NOT_FOUND" });
      }
      const revoked = input.isActive
        ? 0
        : ((
            await client.query(
              `UPDATE admin_sessions SET revoked_at = now()
                WHERE account_id = $1 AND revoked_at IS NULL`,
              [row.id],
            )
          ).rowCount ?? 0);
      await addAuditEvent(
        client,
        row.id,
        input.isActive
          ? "ADMIN_ACCOUNT_REACTIVATED"
          : "ADMIN_ACCOUNT_DEACTIVATED",
        actorLoginName,
        {
          targetLoginNameHash: eventHash([row.login_name]),
          revokedSessions: revoked,
        },
        "ADMIN_ACCOUNT",
      );
      await client.query("COMMIT");
      return {
        loginName: row.login_name,
        isActive: row.is_active,
        revokedSessions: revoked,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
);

// A role set is a live authorization boundary. Do not allow an administrator
// to self-escalate or self-demote; another OPS_ADMIN must perform the change.
// Sessions are revoked atomically so a role change is always re-authenticated.
app.put("/v1/local/admin/accounts/:loginName/roles", async (request, reply) => {
  if (!(await requireOpsAdmin(request, reply))) return;
  const params = z
    .object({ loginName: z.string().regex(/^[a-z0-9._-]{3,64}$/) })
    .parse(request.params);
  const input = adminAccountRolesUpdateSchema.parse(request.body);
  const actorLoginName = request.adminIdentity!.loginName;
  if (params.loginName === actorLoginName) {
    return reply.code(409).send({ code: "ADMIN_SELF_ROLE_CHANGE_BLOCKED" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const account = await client.query<{
      id: string;
      login_name: string;
      domain: string;
    }>(
      `SELECT a.id, a.login_name, d.domain
           FROM admin_accounts a JOIN departments d ON d.id = a.department_id
          WHERE a.login_name = $1 FOR UPDATE`,
      [params.loginName],
    );
    const row = account.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return reply.code(404).send({ code: "ADMIN_ACCOUNT_NOT_FOUND" });
    }
    const roles = await client.query<{
      id: string;
      code: string;
      domain: string;
    }>("SELECT id, code, domain FROM roles WHERE code = ANY($1::text[])", [
      input.roleCodes,
    ]);
    if (roles.rowCount !== input.roleCodes.length) {
      await client.query("ROLLBACK");
      return reply.code(422).send({ code: "UNKNOWN_ROLE" });
    }
    if (roles.rows.some((role) => role.domain !== row.domain)) {
      await client.query("ROLLBACK");
      return reply.code(422).send({ code: "ROLE_DOMAIN_MISMATCH" });
    }
    await client.query(
      "DELETE FROM admin_account_roles WHERE account_id = $1",
      [row.id],
    );
    for (const role of roles.rows) {
      await client.query(
        "INSERT INTO admin_account_roles (account_id, role_id) VALUES ($1, $2)",
        [row.id, role.id],
      );
    }
    const revokedSessions =
      (
        await client.query(
          `UPDATE admin_sessions SET revoked_at = now()
              WHERE account_id = $1 AND revoked_at IS NULL`,
          [row.id],
        )
      ).rowCount ?? 0;
    await addAuditEvent(
      client,
      row.id,
      "ADMIN_ACCOUNT_ROLES_UPDATED",
      actorLoginName,
      { roleCodes: input.roleCodes, revokedSessions },
      "ADMIN_ACCOUNT",
    );
    await client.query("COMMIT");
    return {
      loginName: row.login_name,
      roleCodes: input.roleCodes,
      revokedSessions,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const createStageHandler = (
  expectedStatus: string,
  stage: string,
  approvedStatus: string,
  requiredRole: string,
  schema: z.ZodType<ApprovalCommand & FinalReviewTerms>,
  afterRecord?: (
    client: PoolClient,
    application: ApplicationRow,
    input: ApprovalCommand & FinalReviewTerms,
    actorUserRef: string,
  ) => Promise<void>,
) => {
  return async (request: { params: unknown; body: unknown }, reply: any) => {
    if (!requireRole(request as any, reply, requiredRole)) return;
    const params = z
      .object({ applicationNo: z.string().min(1) })
      .parse(request.params);
    const input = schema.parse(request.body);
    const securedInput: SingleApproval = {
      ...input,
      actorUserRef: (request as any).adminIdentity.loginName,
      actorRole: requiredRole,
    };
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const application = await lockApplication(client, params.applicationNo);
      if (!application) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ code: "APPLICATION_NOT_FOUND" });
      }
      if (application.status !== expectedStatus) {
        await client.query("ROLLBACK");
        return reply.code(409).send({
          code: "INVALID_APPLICATION_STATE",
          currentStatus: application.status,
        });
      }
      const status = await recordSingleApproval(
        client,
        application,
        stage,
        securedInput,
        approvedStatus,
      );
      if (afterRecord)
        await afterRecord(
          client,
          application,
          input,
          securedInput.actorUserRef,
        );
      await client.query("COMMIT");
      return {
        applicationNo: params.applicationNo,
        status,
        decision: securedInput.decision,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };
};

app.post("/v1/local/public/telegram-sessions", async (request, reply) => {
  const input = telegramSessionSchema.parse(request.body);
  const bots = configuredTelegramBots();
  if (!bots.some((bot) => bot.enabled)) {
    return reply.code(503).send({ code: "TELEGRAM_AUTH_NOT_CONFIGURED" });
  }
  const identity = verifyTelegramMiniAppInitData(input.initData, bots);
  if (!identity) {
    return reply.code(401).send({ code: "TELEGRAM_INITDATA_INVALID" });
  }
  const sessionToken = randomBytes(32).toString("base64url");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const replay = await client.query(
      `INSERT INTO telegram_initdata_replay_guards
        (initdata_hash, authenticated_bot_id, expires_at)
       -- Keep the replay guard longer than the applicant session.  A session
       -- expiring or being revoked must not make an otherwise-valid initData
       -- immediately usable to mint a replacement session.
       VALUES ($1, $2, now() + interval '2 hours')
       ON CONFLICT (initdata_hash) DO NOTHING`,
      [identity.initDataHash, identity.authenticatedBotId],
    );
    if (!replay.rowCount) {
      await client.query("ROLLBACK");
      return reply.code(409).send({ code: "TELEGRAM_INITDATA_REPLAYED" });
    }
    await client.query(
      `INSERT INTO telegram_auth_sessions
        (token_hash, telegram_user_ref, authenticated_bot_id, expires_at)
       VALUES ($1, $2, $3, now() + interval '15 minutes')`,
      [
        eventHash([sessionToken]),
        identity.telegramUserRef,
        identity.authenticatedBotId,
      ],
    );
    await client.query("COMMIT");
    reply.header("Set-Cookie", [
      `__Host-payease_applicant_session=${sessionToken}; HttpOnly; Secure; SameSite=None; Partitioned; Path=/; Max-Age=900`,
      csrfCookie("applicant", randomBytes(32).toString("base64url"), 900),
    ]);
    return reply.code(201).send({ authenticated: true });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

// This remains readable without an applicant session so a person whose Bot
// was disabled can still navigate to another enabled PayEase Bot. It exposes
// only configured public t.me entry URLs, never a Bot ID or token.
app.get("/v1/local/public/telegram-entrypoints", async (_request, reply) => {
  const entrypoints = enabledTelegramBotEntryUrls();
  // Do not present a false-success recovery response when operations has
  // disabled every Bot. The client can then show its generic Telegram support
  // instruction rather than an empty list that looks like a valid fallback.
  if (entrypoints.length === 0) {
    return reply.code(503).send({ code: "TELEGRAM_RECOVERY_UNAVAILABLE" });
  }
  return { entrypoints };
});

app.post(
  "/v1/local/public/telegram-sessions/logout",
  async (request, reply) => {
    const token = applicantSessionToken(request.headers.cookie);
    if (!token)
      return reply.code(401).send({ code: "TELEGRAM_SESSION_REQUIRED" });
    await pool.query(
      `UPDATE telegram_auth_sessions
          SET revoked_at = now()
        WHERE token_hash = $1 AND revoked_at IS NULL`,
      [eventHash([token])],
    );
    reply.header("Set-Cookie", [
      "__Host-payease_applicant_session=; HttpOnly; Secure; SameSite=None; Partitioned; Path=/; Max-Age=0",
      "payease_applicant_session=; HttpOnly; Secure; SameSite=Lax; Path=/api/v1/local/; Max-Age=0",
      expiredCsrfCookie("applicant"),
    ]);
    return { loggedOut: true };
  },
);

// This endpoint deliberately has no timer-driven caller. The Mini App uses it
// only after a real pointer, keyboard, or touch interaction so active form
// completion is not interrupted by the short idle-session timeout.
app.post(
  "/v1/local/public/telegram-sessions/keepalive",
  async (request, reply) => {
    const applicant = await authenticatedApplicant(request.headers.cookie);
    if (!applicant) {
      return reply.code(401).send({ code: "TELEGRAM_SESSION_REQUIRED" });
    }
    return reply.code(204).send();
  },
);

app.post("/v1/local/applications", async (request, reply) => {
  const input = createApplicationSchema.parse(request.body);
  const applicant = await authenticatedApplicant(request.headers.cookie);
  if (requiresTelegramAuthentication() && !applicant) {
    return reply.code(401).send({ code: "TELEGRAM_AUTH_REQUIRED" });
  }
  if (requiresTelegramAuthentication() && !input.personalProfile) {
    return reply.code(422).send({ code: "PERSONAL_PROFILE_REQUIRED" });
  }
  const telegramUserRef = applicant?.telegramUserRef ?? input.telegramUserRef;
  if (!telegramUserRef) {
    return reply.code(400).send({ code: "TELEGRAM_USER_REFERENCE_REQUIRED" });
  }
  const amountMinor = BigInt(input.requestedAmount.amountMinor);
  if (amountMinor < 1000n || amountMinor > 50000n) {
    return reply.code(422).send({
      code: "AMOUNT_OUT_OF_RANGE",
      message: "USD 10 to USD 500 is required.",
    });
  }

  let encryptedPersonalProfile:
    { fullName: Buffer; phone: Buffer; employerName: Buffer } | undefined;
  if (input.personalProfile) {
    try {
      encryptedPersonalProfile = encryptPersonalProfile(input.personalProfile);
    } catch (error) {
      request.log.error(
        { err: error },
        "personal profile encryption unavailable",
      );
      return reply
        .code(503)
        .send({ code: "PERSONAL_DATA_STORAGE_UNAVAILABLE" });
    }
  }
  let activePersonalDataKeyVersion: string | undefined;
  if (encryptedPersonalProfile) {
    try {
      activePersonalDataKeyVersion = personalDataKeyVersion();
    } catch (error) {
      request.log.error(
        { err: error },
        "personal profile key version unavailable",
      );
      return reply
        .code(503)
        .send({ code: "PERSONAL_DATA_STORAGE_UNAVAILABLE" });
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // The opaque per-application cookie is useful only for the controlled
    // preview, which deliberately has no Telegram container. Production
    // access must remain bound to the short-lived, revocable Telegram session.
    const applicantAccessToken = requiresTelegramAuthentication()
      ? undefined
      : randomBytes(32).toString("base64url");
    const user = await client.query<{ id: string }>(
      `INSERT INTO users (
         telegram_user_ref, preferred_language, full_name_encrypted,
         phone_encrypted, employer_name_encrypted, personal_data_consent_version,
         personal_data_consented_at, personal_data_key_version,
         phone_consent_version, phone_consented_at
       )
       VALUES (
         $1, $2, $3::bytea, $4::bytea, $5::bytea, $6,
         CASE WHEN $3::bytea IS NULL THEN NULL ELSE now() END,
         CASE WHEN $3::bytea IS NULL THEN NULL ELSE $7 END,
         CASE WHEN $4::bytea IS NULL THEN NULL ELSE $6 END,
         CASE WHEN $4::bytea IS NULL THEN NULL ELSE now() END
       )
       ON CONFLICT (telegram_user_ref) DO UPDATE SET
         preferred_language = EXCLUDED.preferred_language,
         full_name_encrypted = COALESCE(EXCLUDED.full_name_encrypted, users.full_name_encrypted),
         phone_encrypted = COALESCE(EXCLUDED.phone_encrypted, users.phone_encrypted),
         employer_name_encrypted = COALESCE(EXCLUDED.employer_name_encrypted, users.employer_name_encrypted),
         personal_data_consent_version = COALESCE(EXCLUDED.personal_data_consent_version, users.personal_data_consent_version),
         personal_data_consented_at = COALESCE(EXCLUDED.personal_data_consented_at, users.personal_data_consented_at),
         personal_data_key_version = COALESCE(EXCLUDED.personal_data_key_version, users.personal_data_key_version),
         phone_consent_version = COALESCE(EXCLUDED.phone_consent_version, users.phone_consent_version),
         phone_consented_at = COALESCE(EXCLUDED.phone_consented_at, users.phone_consented_at),
         updated_at = now()
       RETURNING id`,
      [
        telegramUserRef,
        input.preferredLanguage,
        encryptedPersonalProfile?.fullName,
        encryptedPersonalProfile?.phone,
        encryptedPersonalProfile?.employerName,
        "PAYEASE-PERSONAL-DATA-v1",
        activePersonalDataKeyVersion,
      ],
    );
    const existing = await client.query<{
      application_no: string;
      status: string;
      rejection_condition_resolved: boolean;
    }>(
      `SELECT application_no, status, rejection_condition_resolved
         FROM applications
        WHERE user_id = $1
          AND (
            status NOT IN ('REJECTED', 'SETTLED', 'CLOSED')
            OR (status = 'REJECTED' AND rejection_condition_resolved = false)
          )
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE`,
      [user.rows[0]!.id],
    );
    const blockingApplication = existing.rows[0];
    if (blockingApplication) {
      await client.query("ROLLBACK");
      return reply.code(409).send({
        code:
          blockingApplication.status === "REJECTED"
            ? "REAPPLICATION_REJECTION_CONDITION_UNRESOLVED"
            : "REAPPLICATION_ACTIVE_APPLICATION_EXISTS",
        applicationNo: blockingApplication.application_no,
        currentStatus: blockingApplication.status,
      });
    }
    const applicationNo = `APP-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const created = await client.query<{
      id: string;
      application_no: string;
      status: string;
    }>(
      `INSERT INTO applications (application_no, user_id, requested_amount_minor, currency, tenor_days, status, applicant_access_token_hash)
       VALUES ($1, $2, $3, 'USD', $4, 'BROKER_REVIEW', $5)
       RETURNING id, application_no, status`,
      [
        applicationNo,
        user.rows[0]!.id,
        amountMinor.toString(),
        input.tenorDays,
        applicantAccessToken ? eventHash([applicantAccessToken]) : null,
      ],
    );
    const application = created.rows[0]!;
    await client.query(
      `INSERT INTO application_status_events (application_id, from_status, to_status, actor_user_ref, reason_code, occurred_at)
       VALUES ($1, 'DRAFT', 'SUBMITTED', $2, 'USER_SUBMITTED', now()),
              ($1, 'SUBMITTED', 'BROKER_REVIEW', 'system', 'QUEUE_BROKER_REVIEW', now())`,
      [application.id, telegramUserRef],
    );
    await addAuditEvent(
      client,
      application.id,
      "APPLICATION_SUBMITTED",
      telegramUserRef,
      {
        applicationNo: application.application_no,
        amountMinor: input.requestedAmount.amountMinor,
        currency: "USD",
        tenorDays: input.tenorDays,
        // This is deliberately recorded separately from profile encryption:
        // reviewers can prove that the applicant affirmatively authorized the
        // two data categories without decrypting the applicant's values.
        personalDataAndPhoneConsent: input.personalDataAndPhoneConsent === true,
        personalDataConsentVersion: input.personalProfile
          ? "PAYEASE-PERSONAL-DATA-v1"
          : undefined,
        personalDataConsentLanguage: input.personalProfile
          ? input.preferredLanguage
          : undefined,
      },
    );
    await client.query("COMMIT");
    if (applicantAccessToken) {
      reply.header(
        "Set-Cookie",
        `payease_application=${applicantAccessToken}; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/local/public/applications/; Max-Age=2592000`,
      );
    }
    return reply.code(201).send({
      applicationNo: application.application_no,
      status: application.status,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

app.get(
  "/v1/local/public/applications/:applicationNo",
  async (request, reply) => {
    const params = z
      .object({ applicationNo: z.string().min(1) })
      .parse(request.params);
    const token = applicantAccessToken(request.headers.cookie);
    const authenticatedUser = await authenticatedApplicant(
      request.headers.cookie,
    );
    const opaqueApplicationTokenAllowed = !requiresTelegramAuthentication();
    const hasApplicationAccessToken = Boolean(
      opaqueApplicationTokenAllowed && token && token.length >= 32,
    );
    if (!hasApplicationAccessToken && !authenticatedUser) {
      return reply.code(401).send({ code: "USER_APPLICATION_ACCESS_DENIED" });
    }
    const result = await pool.query<{
      id: string;
      application_no: string;
      requested_amount_minor: string;
      currency: string;
      tenor_days: number;
      status: string;
      approved_amount_minor: string | null;
      rejection_condition_resolved: boolean;
      supplement_requested: boolean;
      rejected_reason_code: string | null;
    }>(
      `SELECT id, application_no, requested_amount_minor::text, currency, tenor_days, status,
            approved_amount_minor::text, rejection_condition_resolved, supplement_requested,
            (
              SELECT reason_code FROM approval_events
               WHERE application_id = applications.id AND decision = 'REJECTED'
               ORDER BY occurred_at DESC LIMIT 1
            ) AS rejected_reason_code
       FROM applications
       WHERE application_no = $1
         AND (
           ($4::boolean AND applicant_access_token_hash = $2)
           OR EXISTS (
             SELECT 1 FROM users
             WHERE users.id = applications.user_id
               AND users.telegram_user_ref = $3
           )
         )`,
      [
        params.applicationNo,
        eventHash([hasApplicationAccessToken ? token! : ""]),
        authenticatedUser?.telegramUserRef ?? "",
        opaqueApplicationTokenAllowed,
      ],
    );
    if (!result.rowCount) {
      return reply.code(404).send({ code: "APPLICATION_NOT_FOUND" });
    }
    const application = result.rows[0]!;
    const loanDetails = await loadLoanDetails(application.id);
    return formatApplicantLoanSummary(
      {
        applicationNo: application.application_no,
        status: application.status,
        requestedAmountMinor: application.requested_amount_minor,
        currency: application.currency,
        tenorDays: application.tenor_days,
        approvedAmountMinor: application.approved_amount_minor,
        rejectionConditionResolved: application.rejection_condition_resolved,
        rejectionNoticeCode: applicantRejectionNoticeCode(
          application.status,
          application.rejected_reason_code,
        ),
        supplementRequested: application.supplement_requested,
      },
      loanDetails.terms,
      loanDetails.repayment,
    );
  },
);

app.get("/v1/local/public/applications", async (request, reply) => {
  const authenticatedUser = await authenticatedApplicant(
    request.headers.cookie,
  );
  if (!authenticatedUser) {
    return reply.code(401).send({ code: "TELEGRAM_AUTH_REQUIRED" });
  }
  const user = await pool.query<{ preferred_language: "km" | "en" | "zh-CN" }>(
    `SELECT preferred_language FROM users WHERE telegram_user_ref = $1`,
    [authenticatedUser.telegramUserRef],
  );
  const applications = await pool.query<{
    application_no: string;
    status: string;
    requested_amount_minor: string;
    currency: string;
    tenor_days: number;
    approved_amount_minor: string | null;
    rejection_condition_resolved: boolean;
    supplement_requested: boolean;
    rejected_reason_code: string | null;
    created_at: Date;
  }>(
    `SELECT applications.application_no, applications.status,
            applications.requested_amount_minor::text, applications.currency,
            applications.tenor_days, applications.approved_amount_minor::text,
            applications.rejection_condition_resolved, applications.supplement_requested,
            (
              SELECT reason_code FROM approval_events
               WHERE application_id = applications.id AND decision = 'REJECTED'
               ORDER BY occurred_at DESC LIMIT 1
            ) AS rejected_reason_code,
            applications.created_at
       FROM applications
       JOIN users ON users.id = applications.user_id
      WHERE users.telegram_user_ref = $1
      ORDER BY applications.created_at DESC
      LIMIT 20`,
    [authenticatedUser.telegramUserRef],
  );
  return {
    preferredLanguage: user.rows[0]?.preferred_language,
    applications: applications.rows.map((application) => ({
      applicationNo: application.application_no,
      status: application.status,
      requestedAmountMinor: application.requested_amount_minor,
      currency: application.currency,
      tenorDays: application.tenor_days,
      approvedAmountMinor: application.approved_amount_minor,
      rejectionConditionResolved: application.rejection_condition_resolved,
      rejectionNoticeCode: applicantRejectionNoticeCode(
        application.status,
        application.rejected_reason_code,
      ),
      supplementRequested: application.supplement_requested,
      createdAt: application.created_at.toISOString(),
    })),
  };
});

app.put(
  "/v1/local/public/profile/preferred-language",
  async (request, reply) => {
    const authenticatedUser = await authenticatedApplicant(
      request.headers.cookie,
    );
    if (!authenticatedUser) {
      return reply.code(401).send({ code: "TELEGRAM_AUTH_REQUIRED" });
    }
    const input = z
      .object({ preferredLanguage: z.enum(["km", "en", "zh-CN"]) })
      .parse(request.body);
    const updated = await pool.query(
      `UPDATE users
        SET preferred_language = $1, updated_at = now()
      WHERE telegram_user_ref = $2`,
      [input.preferredLanguage, authenticatedUser.telegramUserRef],
    );
    if (!updated.rowCount) {
      return reply.code(404).send({ code: "TELEGRAM_USER_NOT_FOUND" });
    }
    return { preferredLanguage: input.preferredLanguage };
  },
);

// Broker reviewers need the minimum profile fields to conduct the manual
// application review.  This endpoint intentionally excludes every other
// domain; lender/enterprise access must use separately approved data-sharing
// contracts rather than this broker-side record.
app.get(
  "/v1/local/applications/:applicationNo/personal-profile",
  async (request, reply) => {
    if (!requireRole(request, reply, "BROKER_OFFICER")) return;
    const params = z
      .object({ applicationNo: z.string().min(1) })
      .parse(request.params);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const profile = await client.query<{
        application_id: string;
        full_name_encrypted: Buffer | null;
        phone_encrypted: Buffer | null;
        employer_name_encrypted: Buffer | null;
        personal_data_consent_version: string | null;
        personal_data_consented_at: Date | null;
        phone_consent_version: string | null;
        phone_consented_at: Date | null;
      }>(
        `SELECT a.id AS application_id,
                u.full_name_encrypted, u.phone_encrypted, u.employer_name_encrypted,
                u.personal_data_consent_version, u.personal_data_consented_at,
                u.phone_consent_version, u.phone_consented_at
           FROM applications a
           JOIN users u ON u.id = a.user_id
          WHERE a.application_no = $1
          FOR UPDATE`,
        [params.applicationNo],
      );
      const stored = profile.rows[0];
      if (!stored) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ code: "APPLICATION_NOT_FOUND" });
      }
      if (
        !stored.full_name_encrypted ||
        !stored.phone_encrypted ||
        !stored.employer_name_encrypted
      ) {
        await client.query("ROLLBACK");
        return reply.code(409).send({ code: "PERSONAL_PROFILE_NOT_AVAILABLE" });
      }
      let decrypted;
      try {
        decrypted = decryptPersonalProfile({
          fullName: stored.full_name_encrypted,
          phone: stored.phone_encrypted,
          employerName: stored.employer_name_encrypted,
        });
      } catch (error) {
        request.log.error(
          { err: error },
          "personal profile decryption unavailable",
        );
        await client.query("ROLLBACK");
        return reply
          .code(503)
          .send({ code: "PERSONAL_DATA_STORAGE_UNAVAILABLE" });
      }
      await addAuditEvent(
        client,
        stored.application_id,
        "PERSONAL_PROFILE_VIEWED",
        request.adminIdentity!.loginName,
        {
          actorRole: "BROKER_OFFICER",
          fields: ["fullName", "phone", "employerName"],
        },
      );
      await client.query("COMMIT");
      return {
        applicationNo: params.applicationNo,
        profile: decrypted,
        consent: {
          personalDataVersion: stored.personal_data_consent_version,
          personalDataConsentedAt:
            stored.personal_data_consented_at?.toISOString() ?? null,
          phoneVersion: stored.phone_consent_version,
          phoneConsentedAt: stored.phone_consented_at?.toISOString() ?? null,
        },
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
  "/v1/local/applications/:applicationNo/reapplication-condition-resolved",
  async (request, reply) => {
    if (!requireRole(request, reply, "LENDER_CREDIT_OFFICER")) return;
    const params = z
      .object({ applicationNo: z.string().min(1) })
      .parse(request.params);
    const input = lifecycleActorSchema.parse(request.body);
    const actorUserRef = request.adminIdentity!.loginName;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const application = await lockApplication(client, params.applicationNo);
      if (!application) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ code: "APPLICATION_NOT_FOUND" });
      }
      if (application.status !== "REJECTED") {
        await client.query("ROLLBACK");
        return reply.code(409).send({
          code: "INVALID_APPLICATION_STATE",
          currentStatus: application.status,
        });
      }
      await client.query(
        `UPDATE applications
            SET rejection_condition_resolved = true, updated_at = now()
          WHERE id = $1`,
        [application.id],
      );
      await addAuditEvent(
        client,
        application.id,
        "REAPPLICATION_CONDITION_RESOLVED",
        actorUserRef,
        { ...input, actorUserRef, actorRole: "LENDER_CREDIT_OFFICER" },
      );
      await client.query("COMMIT");
      return {
        applicationNo: params.applicationNo,
        status: "REJECTED",
        rejectionConditionResolved: true,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
);

app.get("/v1/local/applications/:applicationNo", async (request, reply) => {
  if (!requireLenderRole(request, reply)) return;
  const params = z
    .object({ applicationNo: z.string().min(1) })
    .parse(request.params);
  const result = await pool.query(
    `SELECT id, application_no, requested_amount_minor::text AS requested_amount_minor, currency, tenor_days, status, approved_amount_minor::text AS approved_amount_minor, rejection_condition_resolved, supplement_requested, created_at
     FROM applications WHERE application_no = $1`,
    [params.applicationNo],
  );
  if (result.rowCount === 0)
    return reply.code(404).send({ code: "APPLICATION_NOT_FOUND" });
  const application = result.rows[0]!;
  const loanDetails = await loadLoanDetails(application.id);
  return formatApplicantLoanSummary(
    {
      applicationNo: application.application_no,
      status: application.status,
      requestedAmountMinor: application.requested_amount_minor,
      currency: application.currency,
      tenorDays: application.tenor_days,
      approvedAmountMinor: application.approved_amount_minor,
      rejectionConditionResolved: application.rejection_condition_resolved,
      rejectionNoticeCode: applicantRejectionNoticeCode(
        application.status,
        null,
      ),
      supplementRequested: application.supplement_requested,
    },
    loanDetails.terms,
    loanDetails.repayment,
  );
});

app.post(
  "/v1/local/applications/:applicationNo/broker-review",
  async (request, reply) => {
    if (!requireRole(request, reply, "BROKER_OFFICER")) return;
    const params = z
      .object({ applicationNo: z.string().min(1) })
      .parse(request.params);
    const input = brokerReviewSchema.parse(request.body);
    const actorUserRef = request.adminIdentity!.loginName;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const application = await lockApplication(client, params.applicationNo);
      if (!application) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ code: "APPLICATION_NOT_FOUND" });
      }
      if (application.status !== "BROKER_REVIEW") {
        await client.query("ROLLBACK");
        return reply.code(409).send({
          code: "INVALID_APPLICATION_STATE",
          currentStatus: application.status,
        });
      }
      const toStatus = await recordSingleApproval(
        client,
        application,
        "BROKER_REVIEW",
        {
          ...input,
          actorUserRef,
          actorRole: "BROKER_OFFICER",
        },
        "EMPLOYER_VERIFICATION",
      );
      await client.query("COMMIT");
      return {
        applicationNo: params.applicationNo,
        status: toStatus,
        decision: input.decision,
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
  "/v1/local/applications/:applicationNo/employer-verification",
  createStageHandler(
    "EMPLOYER_VERIFICATION",
    "EMPLOYER_VERIFICATION",
    "EMPLOYER_FINANCE_VERIFICATION",
    "EMPLOYER_HR",
    employerVerificationSchema,
  ),
);

app.post(
  "/v1/local/applications/:applicationNo/employer-finance-verification",
  createStageHandler(
    "EMPLOYER_FINANCE_VERIFICATION",
    "EMPLOYER_FINANCE_VERIFICATION",
    "LENDER_INITIAL_REVIEW",
    "EMPLOYER_FINANCE",
    employerVerificationSchema,
  ),
);

app.post(
  "/v1/local/applications/:applicationNo/lender-initial-review",
  createStageHandler(
    "LENDER_INITIAL_REVIEW",
    "LENDER_INITIAL_REVIEW",
    "LENDER_FINAL_REVIEW",
    "LENDER_CREDIT_OFFICER",
    lenderInitialReviewSchema,
  ),
);

app.post(
  "/v1/local/applications/:applicationNo/lender-final-review",
  createStageHandler(
    "LENDER_FINAL_REVIEW",
    "LENDER_FINAL_REVIEW",
    "CONTRACT_PENDING",
    "LENDER_CREDIT_REVIEWER",
    lenderFinalReviewSchema,
    async (client, application, input, actorUserRef) => {
      if (input.decision !== "APPROVED") return;
      if (
        !input.approvedAmountMinor ||
        !input.serviceFeeMinor ||
        !input.totalRepayableMinor ||
        !input.installmentCount ||
        !input.firstDueDate
      ) {
        throw new Error("approved final review requires complete loan terms");
      }
      const approvedAmountMinor = BigInt(input.approvedAmountMinor);
      const serviceFeeMinor = BigInt(input.serviceFeeMinor);
      const totalRepayableMinor = BigInt(input.totalRepayableMinor);
      if (approvedAmountMinor < 1000n || approvedAmountMinor > 50000n) {
        throw new Error("approved amount is outside the V1 range");
      }
      if (totalRepayableMinor < approvedAmountMinor + serviceFeeMinor) {
        throw new Error("total repayable amount does not cover loan terms");
      }
      await client.query(
        "UPDATE applications SET approved_amount_minor = $1, updated_at = now() WHERE id = $2",
        [approvedAmountMinor.toString(), application.id],
      );
      await client.query(
        `INSERT INTO loan_terms
          (application_id, approved_amount_minor, service_fee_minor, total_repayable_minor, installment_count, first_due_date, created_by_user_ref)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          application.id,
          approvedAmountMinor.toString(),
          serviceFeeMinor.toString(),
          totalRepayableMinor.toString(),
          input.installmentCount,
          input.firstDueDate,
          actorUserRef,
        ],
      );
    },
  ),
);

app.post(
  "/v1/local/public/applications/:applicationNo/withdraw",
  async (request, reply) => {
    const applicant = await authenticatedApplicant(request.headers.cookie);
    if (!applicant) {
      return reply.code(401).send({ code: "TELEGRAM_AUTH_REQUIRED" });
    }
    const params = z
      .object({ applicationNo: z.string().min(1) })
      .parse(request.params);
    const withdrawableStatuses = new Set([
      "BROKER_REVIEW",
      "EMPLOYER_VERIFICATION",
      "EMPLOYER_FINANCE_VERIFICATION",
      "LENDER_INITIAL_REVIEW",
      "LENDER_FINAL_REVIEW",
      "CONTRACT_PENDING",
    ]);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const owned = await client.query<ApplicationRow>(
        `SELECT applications.id, applications.status, applications.review_round
           FROM applications
           JOIN users ON users.id = applications.user_id
          WHERE applications.application_no = $1
            AND users.telegram_user_ref = $2
          FOR UPDATE`,
        [params.applicationNo, applicant.telegramUserRef],
      );
      const application = owned.rows[0];
      if (!application) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ code: "APPLICATION_NOT_FOUND" });
      }
      if (application.status === "CLOSED") {
        const priorWithdrawal = await client.query(
          `SELECT 1 FROM audit_events
            WHERE entity_type = 'APPLICATION'
              AND entity_id = $1
              AND event_type = 'USER_APPLICATION_WITHDRAWN'
            LIMIT 1`,
          [application.id],
        );
        await client.query("ROLLBACK");
        if (priorWithdrawal.rowCount) {
          return {
            applicationNo: params.applicationNo,
            status: "CLOSED",
            withdrawn: true,
          };
        }
        return reply.code(409).send({
          code: "WITHDRAWAL_NOT_AVAILABLE",
          currentStatus: application.status,
        });
      }
      if (!withdrawableStatuses.has(application.status)) {
        await client.query("ROLLBACK");
        return reply.code(409).send({
          code: "WITHDRAWAL_REQUIRES_LENDER_CASE",
          currentStatus: application.status,
        });
      }
      await updateStatus(
        client,
        application,
        "CLOSED",
        applicant.telegramUserRef,
        "USER_APPLICATION_WITHDRAWN",
      );
      await addAuditEvent(
        client,
        application.id,
        "USER_APPLICATION_WITHDRAWN",
        applicant.telegramUserRef,
        { applicationNo: params.applicationNo },
      );
      await client.query("COMMIT");
      return {
        applicationNo: params.applicationNo,
        status: "CLOSED",
        withdrawn: true,
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
  "/v1/local/public/applications/:applicationNo/supplement-responses",
  async (request, reply) => {
    const applicant = await authenticatedApplicant(request.headers.cookie);
    if (!applicant) {
      return reply.code(401).send({ code: "TELEGRAM_AUTH_REQUIRED" });
    }
    const params = z
      .object({ applicationNo: z.string().min(1) })
      .parse(request.params);
    const input = applicantSupplementResponseSchema.parse(request.body);
    let encryptedMessage: Buffer;
    let keyVersion: string;
    try {
      encryptedMessage = encryptPersonalValue(input.message);
      keyVersion = personalDataKeyVersion();
    } catch (error) {
      request.log.error(
        { err: error },
        "supplement response encryption unavailable",
      );
      return reply
        .code(503)
        .send({ code: "PERSONAL_DATA_STORAGE_UNAVAILABLE" });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const owned = await client.query<{
        application_id: string;
        user_id: string;
        preferred_language: "km" | "en" | "zh-CN";
        supplement_requested: boolean;
      }>(
        `SELECT applications.id AS application_id, users.id AS user_id,
                users.preferred_language, applications.supplement_requested
           FROM applications JOIN users ON users.id = applications.user_id
          WHERE applications.application_no = $1
            AND users.telegram_user_ref = $2
          FOR UPDATE`,
        [params.applicationNo, applicant.telegramUserRef],
      );
      const application = owned.rows[0];
      if (!application) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ code: "APPLICATION_NOT_FOUND" });
      }
      if (!application.supplement_requested) {
        await client.query("ROLLBACK");
        return reply.code(409).send({ code: "SUPPLEMENT_NOT_REQUESTED" });
      }
      const responseNo = `SUP-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
      const created = await client.query<{
        id: string;
        response_no: string;
        submitted_at: string;
      }>(
        `INSERT INTO applicant_supplement_responses
          (response_no, application_id, user_id, message_encrypted, message_key_version, applicant_language)
         VALUES ($1, $2, $3, $4::bytea, $5, $6)
         RETURNING id, response_no, submitted_at`,
        [
          responseNo,
          application.application_id,
          application.user_id,
          encryptedMessage,
          keyVersion,
          application.preferred_language,
        ],
      );
      const response = created.rows[0]!;
      await addAuditEvent(
        client,
        response.id,
        "APPLICANT_SUPPLEMENT_RESPONSE_CREATED",
        applicant.telegramUserRef,
        {
          responseNo: response.response_no,
          applicationNo: params.applicationNo,
        },
        "SUPPLEMENT_RESPONSE",
      );
      await client.query("COMMIT");
      return reply.code(201).send({
        responseNo: response.response_no,
        submittedAt: response.submitted_at,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
);

app.get(
  "/v1/local/public/applications/:applicationNo/supplement-responses",
  async (request, reply) => {
    const applicant = await authenticatedApplicant(request.headers.cookie);
    if (!applicant) {
      return reply.code(401).send({ code: "TELEGRAM_AUTH_REQUIRED" });
    }
    const params = z
      .object({ applicationNo: z.string().min(1) })
      .parse(request.params);
    const responses = await pool.query<{
      response_no: string;
      submitted_at: string;
    }>(
      `SELECT r.response_no, r.submitted_at
         FROM applicant_supplement_responses r
         JOIN applications a ON a.id = r.application_id
         JOIN users u ON u.id = r.user_id
        WHERE a.application_no = $1 AND u.telegram_user_ref = $2
        ORDER BY r.submitted_at DESC`,
      [params.applicationNo, applicant.telegramUserRef],
    );
    return {
      responses: responses.rows.map((response) => ({
        responseNo: response.response_no,
        submittedAt: response.submitted_at,
      })),
    };
  },
);

app.get(
  "/v1/local/applications/:applicationNo/supplement-responses",
  async (request, reply) => {
    if (!requireRole(request, reply, "BROKER_OFFICER")) return;
    const params = z
      .object({ applicationNo: z.string().min(1) })
      .parse(request.params);
    const responses = await pool.query<{
      response_no: string;
      applicant_language: "km" | "en" | "zh-CN";
      submitted_at: string;
    }>(
      `SELECT r.response_no, r.applicant_language, r.submitted_at
         FROM applicant_supplement_responses r
         JOIN applications a ON a.id = r.application_id
        WHERE a.application_no = $1
        ORDER BY r.submitted_at DESC`,
      [params.applicationNo],
    );
    return {
      responses: responses.rows.map((response) => ({
        responseNo: response.response_no,
        applicantLanguage: response.applicant_language,
        submittedAt: response.submitted_at,
      })),
    };
  },
);

app.get(
  "/v1/local/supplement-responses/:responseNo",
  async (request, reply) => {
    if (!requireRole(request, reply, "BROKER_OFFICER")) return;
    const params = z
      .object({ responseNo: z.string().min(1) })
      .parse(request.params);
    const result = await pool.query<{
      id: string;
      response_no: string;
      application_no: string;
      message_encrypted: Buffer;
      submitted_at: string;
    }>(
      `SELECT r.id, r.response_no, a.application_no, r.message_encrypted, r.submitted_at
         FROM applicant_supplement_responses r
         JOIN applications a ON a.id = r.application_id
        WHERE r.response_no = $1`,
      [params.responseNo],
    );
    const response = result.rows[0];
    if (!response)
      return reply.code(404).send({ code: "SUPPLEMENT_RESPONSE_NOT_FOUND" });
    let message: string;
    try {
      message = decryptPersonalValue(response.message_encrypted);
    } catch (error) {
      request.log.error(
        { err: error },
        "supplement response decryption unavailable",
      );
      return reply
        .code(503)
        .send({ code: "PERSONAL_DATA_STORAGE_UNAVAILABLE" });
    }
    const auditClient = await pool.connect();
    try {
      await auditClient.query("BEGIN");
      await addAuditEvent(
        auditClient,
        response.id,
        "APPLICANT_SUPPLEMENT_RESPONSE_VIEWED",
        request.adminIdentity!.loginName,
        { responseNo: response.response_no },
        "SUPPLEMENT_RESPONSE",
      );
      await auditClient.query("COMMIT");
    } catch (error) {
      await auditClient.query("ROLLBACK");
      throw error;
    } finally {
      auditClient.release();
    }
    return {
      responseNo: response.response_no,
      applicationNo: response.application_no,
      message,
      submittedAt: response.submitted_at,
    };
  },
);

app.post(
  "/v1/local/public/applications/:applicationNo/service-cases",
  async (request, reply) => {
    const applicant = await authenticatedApplicant(request.headers.cookie);
    if (!applicant) {
      return reply.code(401).send({ code: "TELEGRAM_AUTH_REQUIRED" });
    }
    const params = z
      .object({ applicationNo: z.string().min(1) })
      .parse(request.params);
    const input = applicantServiceCaseCreateSchema.parse(request.body);
    let encryptedMessage: Buffer;
    let keyVersion: string;
    try {
      encryptedMessage = encryptPersonalValue(input.message);
      keyVersion = personalDataKeyVersion();
    } catch (error) {
      request.log.error({ err: error }, "service case encryption unavailable");
      return reply
        .code(503)
        .send({ code: "PERSONAL_DATA_STORAGE_UNAVAILABLE" });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const owned = await client.query<{
        application_id: string;
        user_id: string;
        preferred_language: "km" | "en" | "zh-CN";
      }>(
        `SELECT applications.id AS application_id, users.id AS user_id, users.preferred_language
           FROM applications JOIN users ON users.id = applications.user_id
          WHERE applications.application_no = $1
            AND users.telegram_user_ref = $2
          FOR UPDATE`,
        [params.applicationNo, applicant.telegramUserRef],
      );
      const application = owned.rows[0];
      if (!application) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ code: "APPLICATION_NOT_FOUND" });
      }
      const caseNo = `CASE-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
      const created = await client.query<{ id: string; case_no: string }>(
        `INSERT INTO applicant_service_cases
          (case_no, application_id, user_id, case_type, message_encrypted, message_key_version, applicant_language)
         VALUES ($1, $2, $3, $4, $5::bytea, $6, $7)
         RETURNING id, case_no`,
        [
          caseNo,
          application.application_id,
          application.user_id,
          input.caseType,
          encryptedMessage,
          keyVersion,
          application.preferred_language,
        ],
      );
      const serviceCase = created.rows[0]!;
      // The immutable ledger commits to the case number/type only.  The free
      // text remains encrypted in the case table and is never copied to audit
      // payloads, logs or customer-service notifications.
      await addAuditEvent(
        client,
        serviceCase.id,
        "APPLICANT_SERVICE_CASE_CREATED",
        applicant.telegramUserRef,
        { caseNo: serviceCase.case_no, caseType: input.caseType },
        "SERVICE_CASE",
      );
      await client.query("COMMIT");
      return reply.code(201).send({
        caseNo: serviceCase.case_no,
        caseType: input.caseType,
        status: "OPEN",
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
);

app.get(
  "/v1/local/public/applications/:applicationNo/service-cases",
  async (request, reply) => {
    const applicant = await authenticatedApplicant(request.headers.cookie);
    if (!applicant) {
      return reply.code(401).send({ code: "TELEGRAM_AUTH_REQUIRED" });
    }
    const params = z
      .object({ applicationNo: z.string().min(1) })
      .parse(request.params);
    const cases = await pool.query<{
      case_no: string;
      case_type: "SERVICE_QUERY" | "COMPLAINT";
      status: string;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT c.case_no, c.case_type, c.status, c.created_at, c.updated_at
         FROM applicant_service_cases c
         JOIN applications a ON a.id = c.application_id
         JOIN users u ON u.id = c.user_id
        WHERE a.application_no = $1 AND u.telegram_user_ref = $2
        ORDER BY c.created_at DESC`,
      [params.applicationNo, applicant.telegramUserRef],
    );
    return {
      cases: cases.rows.map((serviceCase) => ({
        caseNo: serviceCase.case_no,
        caseType: serviceCase.case_type,
        status: serviceCase.status,
        createdAt: serviceCase.created_at,
        updatedAt: serviceCase.updated_at,
      })),
    };
  },
);

app.get("/v1/local/service-cases/open", async (request, reply) => {
  if (!requireRole(request, reply, "BROKER_OFFICER")) return;
  const cases = await pool.query<{
    case_no: string;
    application_no: string;
    case_type: "SERVICE_QUERY" | "COMPLAINT";
    status: string;
    applicant_language: "km" | "en" | "zh-CN";
    created_at: string;
  }>(
    `SELECT c.case_no, a.application_no, c.case_type, c.status, c.applicant_language, c.created_at
       FROM applicant_service_cases c JOIN applications a ON a.id = c.application_id
      WHERE c.status IN ('OPEN', 'ACKNOWLEDGED', 'REFERRED_TO_LENDER')
      ORDER BY c.created_at ASC`,
  );
  return {
    cases: cases.rows.map((serviceCase) => ({
      caseNo: serviceCase.case_no,
      applicationNo: serviceCase.application_no,
      caseType: serviceCase.case_type,
      status: serviceCase.status,
      applicantLanguage: serviceCase.applicant_language,
      createdAt: serviceCase.created_at,
    })),
  };
});

app.get(
  "/v1/local/service-cases/referred-to-lender",
  async (request, reply) => {
    if (!requireLenderComplaintOfficer(request, reply)) return;
    const cases = await pool.query<{
      case_no: string;
      application_no: string;
      case_type: "SERVICE_QUERY" | "COMPLAINT";
      applicant_language: "km" | "en" | "zh-CN";
      referred_to_lender_at: string;
    }>(
      `SELECT c.case_no, a.application_no, c.case_type, c.applicant_language, c.referred_to_lender_at
         FROM applicant_service_cases c JOIN applications a ON a.id = c.application_id
        WHERE c.status = 'REFERRED_TO_LENDER'
        ORDER BY c.referred_to_lender_at ASC`,
    );
    return {
      cases: cases.rows.map((serviceCase) => ({
        caseNo: serviceCase.case_no,
        applicationNo: serviceCase.application_no,
        caseType: serviceCase.case_type,
        applicantLanguage: serviceCase.applicant_language,
        referredToLenderAt: serviceCase.referred_to_lender_at,
      })),
    };
  },
);

app.get("/v1/local/service-cases/:caseNo", async (request, reply) => {
  if (!requireServiceCaseReadRole(request, reply)) return;
  const params = z.object({ caseNo: z.string().min(1) }).parse(request.params);
  const serviceCase = await pool.query<{
    id: string;
    case_no: string;
    application_no: string;
    case_type: "SERVICE_QUERY" | "COMPLAINT";
    status: string;
    message_encrypted: Buffer;
    created_at: string;
  }>(
    `SELECT c.id, c.case_no, a.application_no, c.case_type, c.status, c.message_encrypted, c.created_at
       FROM applicant_service_cases c JOIN applications a ON a.id = c.application_id
      WHERE c.case_no = $1`,
    [params.caseNo],
  );
  const record = serviceCase.rows[0];
  if (!record) return reply.code(404).send({ code: "SERVICE_CASE_NOT_FOUND" });
  let message: string;
  try {
    message = decryptPersonalValue(record.message_encrypted);
  } catch (error) {
    request.log.error({ err: error }, "service case decryption unavailable");
    return reply.code(503).send({ code: "PERSONAL_DATA_STORAGE_UNAVAILABLE" });
  }
  const auditClient = await pool.connect();
  try {
    await auditClient.query("BEGIN");
    await addAuditEvent(
      auditClient,
      record.id,
      "APPLICANT_SERVICE_CASE_VIEWED",
      request.adminIdentity!.loginName,
      { caseNo: record.case_no },
      "SERVICE_CASE",
    );
    await auditClient.query("COMMIT");
  } catch (error) {
    await auditClient.query("ROLLBACK");
    throw error;
  } finally {
    auditClient.release();
  }
  return {
    caseNo: record.case_no,
    applicationNo: record.application_no,
    caseType: record.case_type,
    status: record.status,
    message,
    createdAt: record.created_at,
  };
});

app.post(
  "/v1/local/service-cases/:caseNo/refer-to-lender",
  async (request, reply) => {
    if (!requireRole(request, reply, "BROKER_OFFICER")) return;
    const params = z
      .object({ caseNo: z.string().min(1) })
      .parse(request.params);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const serviceCase = await client.query<{
        id: string;
        application_id: string;
        status: string;
      }>(
        "SELECT id, application_id, status FROM applicant_service_cases WHERE case_no = $1 FOR UPDATE",
        [params.caseNo],
      );
      const record = serviceCase.rows[0];
      if (!record) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ code: "SERVICE_CASE_NOT_FOUND" });
      }
      if (
        !["OPEN", "ACKNOWLEDGED", "REFERRED_TO_LENDER"].includes(record.status)
      ) {
        await client.query("ROLLBACK");
        return reply.code(409).send({
          code: "INVALID_SERVICE_CASE_STATE",
          currentStatus: record.status,
        });
      }
      if (record.status !== "REFERRED_TO_LENDER") {
        await client.query(
          "UPDATE applicant_service_cases SET status = 'REFERRED_TO_LENDER', referred_to_lender_at = now() WHERE id = $1",
          [record.id],
        );
        await addAuditEvent(
          client,
          record.id,
          "APPLICANT_SERVICE_CASE_REFERRED_TO_LENDER",
          request.adminIdentity!.loginName,
          { caseNo: params.caseNo },
          "SERVICE_CASE",
        );
      }
      await client.query("COMMIT");
      return { caseNo: params.caseNo, status: "REFERRED_TO_LENDER" };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
);

app.post(
  "/v1/local/service-cases/:caseNo/lender-resolution",
  async (request, reply) => {
    if (!requireLenderComplaintOfficer(request, reply)) return;
    const params = z
      .object({ caseNo: z.string().min(1) })
      .parse(request.params);
    const input = applicantServiceCaseLenderResolutionSchema.parse(
      request.body,
    );
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const serviceCase = await client.query<{ id: string; status: string }>(
        "SELECT id, status FROM applicant_service_cases WHERE case_no = $1 FOR UPDATE",
        [params.caseNo],
      );
      const record = serviceCase.rows[0];
      if (!record) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ code: "SERVICE_CASE_NOT_FOUND" });
      }
      if (record.status === "RESOLVED") {
        await client.query("ROLLBACK");
        return { caseNo: params.caseNo, status: "RESOLVED" };
      }
      if (record.status !== "REFERRED_TO_LENDER") {
        await client.query("ROLLBACK");
        return reply.code(409).send({
          code: "INVALID_SERVICE_CASE_STATE",
          currentStatus: record.status,
        });
      }
      await client.query(
        `UPDATE applicant_service_cases
          SET status = 'RESOLVED', lender_resolution_reason_code = $1, resolved_at = now()
        WHERE id = $2`,
        [input.reasonCode, record.id],
      );
      await addAuditEvent(
        client,
        record.id,
        "APPLICANT_SERVICE_CASE_RESOLVED_BY_LENDER",
        request.adminIdentity!.loginName,
        { caseNo: params.caseNo, reasonCode: input.reasonCode },
        "SERVICE_CASE",
      );
      await client.query("COMMIT");
      return { caseNo: params.caseNo, status: "RESOLVED" };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
);

app.post(
  "/v1/local/public/applications/:applicationNo/contract-confirmation",
  async (request, reply) => {
    const applicant = await authenticatedApplicant(request.headers.cookie);
    if (!applicant) {
      return reply.code(401).send({ code: "TELEGRAM_AUTH_REQUIRED" });
    }
    const params = z
      .object({ applicationNo: z.string().min(1) })
      .parse(request.params);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const owned = await client.query<ApplicationRow>(
        `SELECT applications.id, applications.status, applications.review_round
           FROM applications
           JOIN users ON users.id = applications.user_id
          WHERE applications.application_no = $1
            AND users.telegram_user_ref = $2
          FOR UPDATE`,
        [params.applicationNo, applicant.telegramUserRef],
      );
      const application = owned.rows[0];
      if (!application) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ code: "APPLICATION_NOT_FOUND" });
      }
      // A Telegram Mini App can retry after a response is lost.  Treat the
      // already-recorded confirmation as a successful no-op so one user
      // action never produces duplicate status/audit events.
      if (application.status === "USER_CONTRACT_CONFIRMED") {
        await client.query("ROLLBACK");
        return {
          applicationNo: params.applicationNo,
          status: "USER_CONTRACT_CONFIRMED",
        };
      }
      if (application.status !== "CONTRACT_PENDING") {
        await client.query("ROLLBACK");
        return reply.code(409).send({
          code: "INVALID_APPLICATION_STATE",
          currentStatus: application.status,
        });
      }
      const terms = await client.query(
        "SELECT 1 FROM loan_terms WHERE application_id = $1",
        [application.id],
      );
      if (!terms.rowCount) {
        await client.query("ROLLBACK");
        return reply.code(409).send({ code: "CONTRACT_TERMS_NOT_AVAILABLE" });
      }
      await updateStatus(
        client,
        application,
        "USER_CONTRACT_CONFIRMED",
        applicant.telegramUserRef,
        "USER_TELEGRAM_CONTRACT_CONFIRMATION",
      );
      await addAuditEvent(
        client,
        application.id,
        "USER_CONTRACT_CONFIRMED",
        applicant.telegramUserRef,
        {
          channel: "TELEGRAM_MINI_APP",
          confirmation: "DISPLAYED_TERMS_CONFIRMED",
        },
      );
      await client.query("COMMIT");
      return {
        applicationNo: params.applicationNo,
        status: "USER_CONTRACT_CONFIRMED",
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
  "/v1/local/applications/:applicationNo/contract-confirmation",
  async (request, reply) => {
    if (!requireRole(request, reply, "LENDER_CONTRACT_OFFICER")) return;
    const params = z
      .object({ applicationNo: z.string().min(1) })
      .parse(request.params);
    const input = contractConfirmationSchema.parse(request.body);
    const actorUserRef = request.adminIdentity!.loginName;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const application = await lockApplication(client, params.applicationNo);
      if (!application) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ code: "APPLICATION_NOT_FOUND" });
      }
      if (application.status !== "USER_CONTRACT_CONFIRMED") {
        await client.query("ROLLBACK");
        return reply.code(409).send({
          code: "INVALID_APPLICATION_STATE",
          currentStatus: application.status,
        });
      }
      await updateStatus(
        client,
        application,
        "CONTRACT_CONFIRMED",
        actorUserRef,
        "CONTRACT_CONFIRMED",
      );
      await addAuditEvent(
        client,
        application.id,
        "CONTRACT_CONFIRMED",
        actorUserRef,
        { ...input, actorUserRef, actorRole: "LENDER_CONTRACT_OFFICER" },
      );
      await client.query("COMMIT");
      return {
        applicationNo: params.applicationNo,
        status: "CONTRACT_CONFIRMED",
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
  "/v1/local/applications/:applicationNo/open-disbursement",
  async (request, reply) => {
    if (!requireRole(request, reply, "LENDER_DISBURSEMENT_MAKER")) return;
    const params = z
      .object({ applicationNo: z.string().min(1) })
      .parse(request.params);
    const input = lifecycleActorSchema.parse(request.body);
    const actorUserRef = request.adminIdentity!.loginName;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const application = await lockApplication(client, params.applicationNo);
      if (!application) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ code: "APPLICATION_NOT_FOUND" });
      }
      if (application.status !== "CONTRACT_CONFIRMED") {
        await client.query("ROLLBACK");
        return reply.code(409).send({
          code: "INVALID_APPLICATION_STATE",
          currentStatus: application.status,
        });
      }
      await updateStatus(
        client,
        application,
        "DISBURSEMENT_PENDING",
        actorUserRef,
        input.reasonCode,
      );
      await addAuditEvent(
        client,
        application.id,
        "DISBURSEMENT_OPENED",
        actorUserRef,
        { ...input, actorUserRef, actorRole: "LENDER_DISBURSEMENT_MAKER" },
      );
      await client.query("COMMIT");
      return {
        applicationNo: params.applicationNo,
        status: "DISBURSEMENT_PENDING",
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
);

async function recordDualControl(
  client: PoolClient,
  application: ApplicationRow,
  input: {
    first: Readonly<{
      actorUserRef: string;
      actorRole: string;
      reasonCode: string;
    }>;
    second: Readonly<{
      actorUserRef: string;
      actorRole: string;
      reasonCode: string;
    }>;
    evidenceReference: string;
  },
  stages: readonly [string, string],
  toStatus: string,
  evidenceType: "DISBURSEMENT_RECEIPT" | "REPAYMENT_RECEIPT",
): Promise<void> {
  if (input.first.actorUserRef === input.second.actorUserRef) {
    throw new Error("Dual control requires two distinct accounts");
  }
  for (const [stage, actor] of [
    [stages[0], input.first],
    [stages[1], input.second],
  ] as const) {
    await client.query(
      `INSERT INTO approval_events (application_id, stage, decision, actor_user_ref, actor_role, reason_code, occurred_at)
       VALUES ($1, $2, 'APPROVED', $3, $4, $5, now())`,
      [
        application.id,
        stage,
        actor.actorUserRef,
        actor.actorRole,
        actor.reasonCode,
      ],
    );
  }
  await updateStatus(
    client,
    application,
    toStatus,
    input.second.actorUserRef,
    input.second.reasonCode,
  );
  await client.query(
    `INSERT INTO funds_evidence (application_id, evidence_type, evidence_reference, recorded_by_user_ref, recorded_at)
     VALUES ($1, $2, $3, $4, now())`,
    [
      application.id,
      evidenceType,
      input.evidenceReference,
      input.second.actorUserRef,
    ],
  );
  await client.query(
    `INSERT INTO reconciliation_work_items (application_id, evidence_type, evidence_reference)
     VALUES ($1, $2, $3)`,
    [application.id, evidenceType, input.evidenceReference],
  );
  await addAuditEvent(
    client,
    application.id,
    `${evidenceType}_DUAL_CONTROL_RECORDED`,
    input.second.actorUserRef,
    input,
  );
}

async function recordMakerApproval(
  client: PoolClient,
  application: ApplicationRow,
  stage: string,
  actorUserRef: string,
  actorRole: string,
  reasonCode: string,
  collectionSequence?: number,
): Promise<void> {
  const existing = collectionSequence
    ? await client.query(
        `SELECT 1 FROM approval_events
         WHERE application_id = $1 AND stage = $2 AND repayment_installment_no = $3
         LIMIT 1`,
        [application.id, stage, collectionSequence],
      )
    : await client.query(
        "SELECT 1 FROM approval_events WHERE application_id = $1 AND stage = $2 LIMIT 1",
        [application.id, stage],
      );
  if (existing.rowCount) {
    throw new DualControlConflictError("Maker approval already recorded");
  }
  await client.query(
    `INSERT INTO approval_events (application_id, stage, decision, actor_user_ref, actor_role, reason_code, repayment_installment_no, occurred_at)
     VALUES ($1, $2, 'APPROVED', $3, $4, $5, $6, now())`,
    [
      application.id,
      stage,
      actorUserRef,
      actorRole,
      reasonCode,
      collectionSequence ?? null,
    ],
  );
  await addAuditEvent(
    client,
    application.id,
    `${stage}_RECORDED`,
    actorUserRef,
    {
      stage,
      reasonCode,
      collectionSequence,
    },
  );
}

async function recordCheckerApproval(
  client: PoolClient,
  application: ApplicationRow,
  makerStage: string,
  checkerStage: string,
  actorUserRef: string,
  actorRole: string,
  reasonCode: string,
  evidenceReference: string,
  nextStatus: string,
  evidenceType: "DISBURSEMENT_RECEIPT" | "REPAYMENT_RECEIPT",
  collectionSequence?: number,
): Promise<void> {
  const maker = collectionSequence
    ? await client.query<{ actor_user_ref: string }>(
        `SELECT actor_user_ref FROM approval_events
         WHERE application_id = $1 AND stage = $2 AND decision = 'APPROVED'
           AND repayment_installment_no = $3
         ORDER BY occurred_at DESC LIMIT 1`,
        [application.id, makerStage, collectionSequence],
      )
    : await client.query<{ actor_user_ref: string }>(
        `SELECT actor_user_ref FROM approval_events
         WHERE application_id = $1 AND stage = $2 AND decision = 'APPROVED'
         ORDER BY occurred_at DESC LIMIT 1`,
        [application.id, makerStage],
      );
  const makerActor = maker.rows[0]?.actor_user_ref;
  if (!makerActor) {
    throw new DualControlConflictError(
      "Maker approval is required before checker approval",
    );
  }
  if (makerActor === actorUserRef) {
    throw new DualControlConflictError(
      "Dual control requires two distinct authenticated accounts",
    );
  }
  await client.query(
    `INSERT INTO approval_events (application_id, stage, decision, actor_user_ref, actor_role, reason_code, repayment_installment_no, occurred_at)
     VALUES ($1, $2, 'APPROVED', $3, $4, $5, $6, now())`,
    [
      application.id,
      checkerStage,
      actorUserRef,
      actorRole,
      reasonCode,
      collectionSequence ?? null,
    ],
  );
  await updateStatus(client, application, nextStatus, actorUserRef, reasonCode);
  await client.query(
    `INSERT INTO funds_evidence (application_id, evidence_type, evidence_reference, recorded_by_user_ref, recorded_at)
     VALUES ($1, $2, $3, $4, now())`,
    [application.id, evidenceType, evidenceReference, actorUserRef],
  );
  await client.query(
    `INSERT INTO reconciliation_work_items (application_id, evidence_type, evidence_reference)
     VALUES ($1, $2, $3)`,
    [application.id, evidenceType, evidenceReference],
  );
  await addAuditEvent(
    client,
    application.id,
    `${evidenceType}_CHECKER_RECORDED`,
    actorUserRef,
    {
      makerStage,
      checkerStage,
      evidenceReference,
      collectionSequence,
    },
  );
}

app.post(
  "/v1/local/applications/:applicationNo/disbursement-release",
  async (request, reply) => {
    if (!requireRole(request, reply, "LENDER_DISBURSEMENT_MAKER")) return;
    const idempotencyKey = manualActionIdempotencyKey(
      request.headers["idempotency-key"],
    );
    if (!idempotencyKey)
      return reply.code(400).send({ code: "IDEMPOTENCY_KEY_REQUIRED" });
    const params = z
      .object({ applicationNo: z.string().min(1) })
      .parse(request.params);
    const input = makerApprovalSchema.parse(request.body);
    const actorUserRef = request.adminIdentity!.loginName;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const application = await lockApplication(client, params.applicationNo);
      if (!application) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ code: "APPLICATION_NOT_FOUND" });
      }
      const replay = await manualActionReplay(
        client,
        application,
        "DISBURSEMENT_RELEASE",
        actorUserRef,
        idempotencyKey,
        input,
      );
      if (replay.kind === "replay") {
        await client.query("ROLLBACK");
        return reply.code(replay.responseStatus).send(replay.responseBody);
      }
      if (replay.kind === "key-reused") {
        await client.query("ROLLBACK");
        return reply.code(409).send({ code: "IDEMPOTENCY_KEY_REUSED" });
      }
      if (application.status !== "DISBURSEMENT_PENDING") {
        await client.query("ROLLBACK");
        return reply.code(409).send({
          code: "INVALID_APPLICATION_STATE",
          currentStatus: application.status,
        });
      }
      await recordMakerApproval(
        client,
        application,
        "DISBURSEMENT_RELEASE",
        actorUserRef,
        "LENDER_DISBURSEMENT_MAKER",
        input.reasonCode,
      );
      const result = {
        applicationNo: params.applicationNo,
        status: "DISBURSEMENT_PENDING",
        approval: "MAKER_RECORDED",
      };
      await recordManualActionResult(
        client,
        application,
        "DISBURSEMENT_RELEASE",
        actorUserRef,
        replay,
        result,
      );
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof DualControlConflictError) {
        return reply.code(409).send({ code: "DUAL_CONTROL_CONFLICT" });
      }
      throw error;
    } finally {
      client.release();
    }
  },
);

app.post(
  "/v1/local/applications/:applicationNo/disbursement-confirmation",
  async (request, reply) => {
    if (!requireRole(request, reply, "LENDER_DISBURSEMENT_CHECKER")) return;
    const idempotencyKey = manualActionIdempotencyKey(
      request.headers["idempotency-key"],
    );
    if (!idempotencyKey)
      return reply.code(400).send({ code: "IDEMPOTENCY_KEY_REQUIRED" });
    const params = z
      .object({ applicationNo: z.string().min(1) })
      .parse(request.params);
    const input = checkerApprovalSchema.parse(request.body);
    const actorUserRef = request.adminIdentity!.loginName;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const application = await lockApplication(client, params.applicationNo);
      if (!application) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ code: "APPLICATION_NOT_FOUND" });
      }
      const replay = await manualActionReplay(
        client,
        application,
        "DISBURSEMENT_CONFIRMATION",
        actorUserRef,
        idempotencyKey,
        input,
      );
      if (replay.kind === "replay") {
        await client.query("ROLLBACK");
        return reply.code(replay.responseStatus).send(replay.responseBody);
      }
      if (replay.kind === "key-reused") {
        await client.query("ROLLBACK");
        return reply.code(409).send({ code: "IDEMPOTENCY_KEY_REUSED" });
      }
      if (application.status !== "DISBURSEMENT_PENDING") {
        await client.query("ROLLBACK");
        return reply.code(409).send({
          code: "INVALID_APPLICATION_STATE",
          currentStatus: application.status,
        });
      }
      await recordCheckerApproval(
        client,
        application,
        "DISBURSEMENT_RELEASE",
        "DISBURSEMENT_CONFIRMATION",
        actorUserRef,
        "LENDER_DISBURSEMENT_CHECKER",
        input.reasonCode,
        input.evidenceReference,
        "DISBURSED",
        "DISBURSEMENT_RECEIPT",
      );
      await createRepaymentSchedule(client, application.id);
      const result = {
        applicationNo: params.applicationNo,
        status: "DISBURSED",
      };
      await recordManualActionResult(
        client,
        application,
        "DISBURSEMENT_CONFIRMATION",
        actorUserRef,
        replay,
        result,
      );
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof DualControlConflictError) {
        return reply.code(409).send({ code: "DUAL_CONTROL_CONFLICT" });
      }
      throw error;
    } finally {
      client.release();
    }
  },
);

app.post(
  "/v1/local/applications/:applicationNo/disbursement-dual-control",
  async (request, reply) => {
    return reply.code(410).send({
      code: "LEGACY_DUAL_CONTROL_DISABLED",
      message:
        "Use disbursement-release and disbursement-confirmation with two authenticated accounts.",
    });
    /*
    const params = z
      .object({ applicationNo: z.string().min(1) })
      .parse(request.params);
    const input = disbursementDualControlSchema.parse(request.body);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const application = await lockApplication(client, params.applicationNo);
      if (!application) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ code: "APPLICATION_NOT_FOUND" });
      }
      if (application.status !== "DISBURSEMENT_PENDING") {
        await client.query("ROLLBACK");
        return reply.code(409).send({
          code: "INVALID_APPLICATION_STATE",
          currentStatus: application.status,
        });
      }
      await recordDualControl(
        client,
        application,
        {
          first: input.release,
          second: input.confirmation,
          evidenceReference: input.evidenceReference,
        },
        ["DISBURSEMENT_RELEASE", "DISBURSEMENT_CONFIRMATION"],
        "DISBURSED",
        "DISBURSEMENT_RECEIPT",
      );
      await client.query("COMMIT");
      return { applicationNo: params.applicationNo, status: "DISBURSED" };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    */
  },
);

app.post(
  "/v1/local/applications/:applicationNo/activate-repayment",
  async (request, reply) => {
    if (!requireRole(request, reply, "LENDER_REPAYMENT_MAKER")) return;
    const params = z
      .object({ applicationNo: z.string().min(1) })
      .parse(request.params);
    const input = lifecycleActorSchema.parse(request.body);
    const actorUserRef = request.adminIdentity!.loginName;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const application = await lockApplication(client, params.applicationNo);
      if (!application) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ code: "APPLICATION_NOT_FOUND" });
      }
      if (application.status !== "DISBURSED") {
        await client.query("ROLLBACK");
        return reply.code(409).send({
          code: "INVALID_APPLICATION_STATE",
          currentStatus: application.status,
        });
      }
      await updateStatus(
        client,
        application,
        "REPAYMENT_ACTIVE",
        actorUserRef,
        input.reasonCode,
      );
      await addAuditEvent(
        client,
        application.id,
        "REPAYMENT_OPENED",
        actorUserRef,
        { ...input, actorUserRef, actorRole: "LENDER_REPAYMENT_MAKER" },
      );
      await client.query("COMMIT");
      return {
        applicationNo: params.applicationNo,
        status: "REPAYMENT_ACTIVE",
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
  "/v1/local/applications/:applicationNo/repayment-write-off",
  async (request, reply) => {
    if (!requireRole(request, reply, "LENDER_REPAYMENT_MAKER")) return;
    const idempotencyKey = manualActionIdempotencyKey(
      request.headers["idempotency-key"],
    );
    if (!idempotencyKey)
      return reply.code(400).send({ code: "IDEMPOTENCY_KEY_REQUIRED" });
    const params = z
      .object({ applicationNo: z.string().min(1) })
      .parse(request.params);
    const input = makerApprovalSchema.parse(request.body);
    const actorUserRef = request.adminIdentity!.loginName;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const application = await lockApplication(client, params.applicationNo);
      if (!application) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ code: "APPLICATION_NOT_FOUND" });
      }
      const replay = await manualActionReplay(
        client,
        application,
        "REPAYMENT_WRITE_OFF",
        actorUserRef,
        idempotencyKey,
        input,
      );
      if (replay.kind === "replay") {
        await client.query("ROLLBACK");
        return reply.code(replay.responseStatus).send(replay.responseBody);
      }
      if (replay.kind === "key-reused") {
        await client.query("ROLLBACK");
        return reply.code(409).send({ code: "IDEMPOTENCY_KEY_REUSED" });
      }
      if (application.status !== "REPAYMENT_ACTIVE") {
        await client.query("ROLLBACK");
        return reply.code(409).send({
          code: "INVALID_APPLICATION_STATE",
          currentStatus: application.status,
        });
      }
      const installment = await client.query<{ installment_no: number }>(
        `SELECT installment_no FROM repayment_installments
         WHERE application_id = $1 AND status = 'PENDING'
         ORDER BY installment_no ASC LIMIT 1 FOR UPDATE`,
        [application.id],
      );
      const nextInstallment = installment.rows[0];
      if (!nextInstallment) {
        await client.query("ROLLBACK");
        return reply.code(409).send({ code: "NO_PENDING_INSTALLMENT" });
      }
      await recordMakerApproval(
        client,
        application,
        "REPAYMENT_WRITE_OFF",
        actorUserRef,
        "LENDER_REPAYMENT_MAKER",
        input.reasonCode,
        nextInstallment.installment_no,
      );
      const result = {
        applicationNo: params.applicationNo,
        status: "REPAYMENT_ACTIVE",
        approval: "MAKER_RECORDED",
      };
      await recordManualActionResult(
        client,
        application,
        "REPAYMENT_WRITE_OFF",
        actorUserRef,
        replay,
        result,
      );
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof DualControlConflictError) {
        return reply.code(409).send({ code: "DUAL_CONTROL_CONFLICT" });
      }
      throw error;
    } finally {
      client.release();
    }
  },
);

app.post(
  "/v1/local/applications/:applicationNo/repayment-confirmation",
  async (request, reply) => {
    if (!requireRole(request, reply, "LENDER_REPAYMENT_CHECKER")) return;
    const idempotencyKey = manualActionIdempotencyKey(
      request.headers["idempotency-key"],
    );
    if (!idempotencyKey)
      return reply.code(400).send({ code: "IDEMPOTENCY_KEY_REQUIRED" });
    const params = z
      .object({ applicationNo: z.string().min(1) })
      .parse(request.params);
    const input = checkerApprovalSchema.parse(request.body);
    const actorUserRef = request.adminIdentity!.loginName;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const application = await lockApplication(client, params.applicationNo);
      if (!application) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ code: "APPLICATION_NOT_FOUND" });
      }
      const replay = await manualActionReplay(
        client,
        application,
        "REPAYMENT_CONFIRMATION",
        actorUserRef,
        idempotencyKey,
        input,
      );
      if (replay.kind === "replay") {
        await client.query("ROLLBACK");
        return reply.code(replay.responseStatus).send(replay.responseBody);
      }
      if (replay.kind === "key-reused") {
        await client.query("ROLLBACK");
        return reply.code(409).send({ code: "IDEMPOTENCY_KEY_REUSED" });
      }
      if (application.status !== "REPAYMENT_ACTIVE") {
        await client.query("ROLLBACK");
        return reply.code(409).send({
          code: "INVALID_APPLICATION_STATE",
          currentStatus: application.status,
        });
      }
      const installment = await client.query<{
        id: string;
        amount_due_minor: string;
        installment_no: number;
      }>(
        `SELECT id, amount_due_minor::text, installment_no FROM repayment_installments
         WHERE application_id = $1 AND status = 'PENDING'
         ORDER BY installment_no ASC LIMIT 1 FOR UPDATE`,
        [application.id],
      );
      const nextInstallment = installment.rows[0];
      if (!nextInstallment) {
        await client.query("ROLLBACK");
        return reply.code(409).send({ code: "NO_PENDING_INSTALLMENT" });
      }
      const remaining = await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM repayment_installments WHERE application_id = $1 AND status = 'PENDING'",
        [application.id],
      );
      const nextStatus =
        Number(remaining.rows[0]!.count) === 1 ? "SETTLED" : "REPAYMENT_ACTIVE";
      await recordCheckerApproval(
        client,
        application,
        "REPAYMENT_WRITE_OFF",
        "REPAYMENT_CONFIRMATION",
        actorUserRef,
        "LENDER_REPAYMENT_CHECKER",
        input.reasonCode,
        input.evidenceReference,
        nextStatus,
        "REPAYMENT_RECEIPT",
        nextInstallment.installment_no,
      );
      await client.query(
        `UPDATE repayment_installments
         SET status = 'PAID', amount_paid_minor = amount_due_minor, paid_at = now()
         WHERE id = $1`,
        [nextInstallment.id],
      );
      const result = {
        applicationNo: params.applicationNo,
        status: nextStatus,
      };
      await recordManualActionResult(
        client,
        application,
        "REPAYMENT_CONFIRMATION",
        actorUserRef,
        replay,
        result,
      );
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof DualControlConflictError) {
        return reply.code(409).send({ code: "DUAL_CONTROL_CONFLICT" });
      }
      throw error;
    } finally {
      client.release();
    }
  },
);

app.post(
  "/v1/local/applications/:applicationNo/repayment-dual-control",
  async (request, reply) => {
    return reply.code(410).send({
      code: "LEGACY_DUAL_CONTROL_DISABLED",
      message:
        "Use repayment-write-off and repayment-confirmation with two authenticated accounts.",
    });
    /*
    const params = z
      .object({ applicationNo: z.string().min(1) })
      .parse(request.params);
    const input = repaymentDualControlSchema.parse(request.body);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const application = await lockApplication(client, params.applicationNo);
      if (!application) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ code: "APPLICATION_NOT_FOUND" });
      }
      if (application.status !== "REPAYMENT_ACTIVE") {
        await client.query("ROLLBACK");
        return reply.code(409).send({
          code: "INVALID_APPLICATION_STATE",
          currentStatus: application.status,
        });
      }
      await recordDualControl(
        client,
        application,
        {
          first: input.writeOff,
          second: input.confirmation,
          evidenceReference: input.evidenceReference,
        },
        ["REPAYMENT_WRITE_OFF", "REPAYMENT_CONFIRMATION"],
        "SETTLED",
        "REPAYMENT_RECEIPT",
      );
      await client.query("COMMIT");
      return { applicationNo: params.applicationNo, status: "SETTLED" };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    */
  },
);

app.get("/v1/local/reconciliation/open", async (request, reply) => {
  if (!requireRole(request, reply, "EMPLOYER_FINANCE")) return;
  const result = await pool.query(
    `SELECT r.id, a.application_no, r.evidence_type, r.evidence_reference, r.status,
            r.assigned_to_user_ref, r.resolution_reason, r.created_at
     FROM reconciliation_work_items r
     JOIN applications a ON a.id = r.application_id
     WHERE r.status IN ('OPEN', 'DIFFERENCE')
     ORDER BY r.created_at ASC`,
  );
  return result.rows;
});

async function lockReconciliationWorkItem(
  client: PoolClient,
  workItemId: string,
) {
  const result = await client.query<{
    id: string;
    application_id: string;
    assigned_to_user_ref: string | null;
    status: string;
  }>(
    "SELECT id, application_id, assigned_to_user_ref, status FROM reconciliation_work_items WHERE id = $1 FOR UPDATE",
    [workItemId],
  );
  return result.rows[0];
}

app.post(
  "/v1/local/reconciliation/:workItemId/assign",
  async (request, reply) => {
    if (!requireRole(request, reply, "EMPLOYER_FINANCE")) return;
    const params = z
      .object({ workItemId: z.string().uuid() })
      .parse(request.params);
    const input = reconciliationAssignSchema.parse(request.body);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const workItem = await lockReconciliationWorkItem(
        client,
        params.workItemId,
      );
      if (!workItem) {
        await client.query("ROLLBACK");
        return reply
          .code(404)
          .send({ code: "RECONCILIATION_WORK_ITEM_NOT_FOUND" });
      }
      const assignee = await client.query(
        `SELECT 1 FROM admin_accounts a JOIN admin_account_roles ar ON ar.account_id = a.id
       JOIN roles r ON r.id = ar.role_id WHERE a.login_name = $1 AND a.is_active = true AND r.code = 'EMPLOYER_FINANCE'`,
        [input.assigneeLoginName],
      );
      if (!assignee.rowCount) {
        await client.query("ROLLBACK");
        return reply.code(422).send({ code: "INVALID_FINANCE_ASSIGNEE" });
      }
      await client.query(
        "UPDATE reconciliation_work_items SET assigned_to_user_ref = $1 WHERE id = $2",
        [input.assigneeLoginName, workItem.id],
      );
      await addAuditEvent(
        client,
        workItem.application_id,
        "RECONCILIATION_ASSIGNED",
        request.adminIdentity!.loginName,
        { workItemId: workItem.id, assigneeLoginName: input.assigneeLoginName },
      );
      await client.query("COMMIT");
      return {
        workItemId: workItem.id,
        assignedToUserRef: input.assigneeLoginName,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
);

function ensureAssignedToCurrentUser(
  workItem: { assigned_to_user_ref: string | null },
  identity: string,
  reply: any,
): boolean {
  if (workItem.assigned_to_user_ref !== identity) {
    reply.code(403).send({ code: "FORBIDDEN__RECONCILIATION_NOT_ASSIGNED" });
    return false;
  }
  return true;
}

async function resolveReconciliation(
  request: any,
  reply: any,
  targetStatus: "MATCHED" | "DIFFERENCE" | "CLOSED",
) {
  if (!requireRole(request, reply, "EMPLOYER_FINANCE")) return;
  const params = z
    .object({ workItemId: z.string().uuid() })
    .parse(request.params);
  const input = reconciliationResolutionSchema.parse(request.body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const workItem = await lockReconciliationWorkItem(
      client,
      params.workItemId,
    );
    if (!workItem) {
      await client.query("ROLLBACK");
      return reply
        .code(404)
        .send({ code: "RECONCILIATION_WORK_ITEM_NOT_FOUND" });
    }
    if (
      !ensureAssignedToCurrentUser(
        workItem,
        request.adminIdentity!.loginName,
        reply,
      )
    ) {
      await client.query("ROLLBACK");
      return;
    }
    const permitted =
      targetStatus === "CLOSED"
        ? ["MATCHED", "DIFFERENCE"]
        : ["OPEN", "DIFFERENCE"];
    if (!permitted.includes(workItem.status)) {
      await client.query("ROLLBACK");
      return reply.code(409).send({
        code: "INVALID_RECONCILIATION_STATE",
        currentStatus: workItem.status,
      });
    }
    await client.query(
      "UPDATE reconciliation_work_items SET status = $1, resolution_reason = $2, resolved_at = CASE WHEN $1 = 'CLOSED' THEN now() ELSE NULL END WHERE id = $3",
      [targetStatus, input.reasonCode, workItem.id],
    );
    await addAuditEvent(
      client,
      workItem.application_id,
      `RECONCILIATION_${targetStatus}`,
      request.adminIdentity!.loginName,
      { workItemId: workItem.id, reasonCode: input.reasonCode },
    );
    await client.query("COMMIT");
    return { workItemId: workItem.id, status: targetStatus };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

app.post("/v1/local/reconciliation/:workItemId/match", (request, reply) =>
  resolveReconciliation(request, reply, "MATCHED"),
);
app.post("/v1/local/reconciliation/:workItemId/difference", (request, reply) =>
  resolveReconciliation(request, reply, "DIFFERENCE"),
);
app.post("/v1/local/reconciliation/:workItemId/close", (request, reply) =>
  resolveReconciliation(request, reply, "CLOSED"),
);

const close = async (): Promise<void> => {
  await app.close();
  await pool.end();
};

if (process.env.NODE_ENV !== "test") {
  // Fail before opening the port when real applicant authentication would be
  // impossible. Per-request configuration is still used so a compromised Bot
  // can be disabled without a restart.
  if (requiresTelegramAuthentication()) {
    requireTelegramRecoveryTopology();
    requireConfiguredApplicantOrigins();
    // The same invariant is checked by the deployment command, but retaining
    // it at process startup prevents an operator from accidentally bypassing
    // that command and accepting applicant PII without an active AES key.
    personalDataEncryptionPreflight();
  }
  await runDatabaseMigrations(pool);
  const port = Number(process.env.PORT ?? 3100);
  const host = process.env.HOST ?? "127.0.0.1";
  app.listen({ host, port }).catch(async (error) => {
    app.log.error(error);
    await close();
    process.exit(1);
  });
}

export { app, close };
