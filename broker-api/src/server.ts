import { AsyncLocalStorage } from "node:async_hooks";
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { readFileSync } from "node:fs";
import type { ServerOptions as HttpsServerOptions } from "node:https";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { Pool, type PoolClient } from "pg";
import { z } from "zod";
import {
  applicantApplicationDraftSchema,
  applicantPaymentProofReviewSchema,
  applicantPaymentProofUploadSchema,
  applicantReassessmentBrokerReviewSchema,
  applicantReassessmentLenderReviewSchema,
  applicantReassessmentRequestSchema,
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
  employerCollectionVerificationSchema,
  employerVerificationSchema,
  employerTenantCreateSchema,
  kycLocationEvidenceCreateSchema,
  lenderFinalReviewSchema,
  lenderCollectionExceptionResolutionSchema,
  lenderCollectionWorkItemCreateSchema,
  lenderInitialReviewSchema,
  lifecycleActorSchema,
  loginSchema,
  preferredLanguageUpdateSchema,
  makerApprovalSchema,
  checkerApprovalSchema,
  repaymentDualControlSchema,
  reconciliationAssignSchema,
  reconciliationResolutionSchema,
  serviceAreaZoneCreateSchema,
  serviceAreaZoneDraftPatchSchema,
  serviceAreaZoneRetireSchema,
  serviceAreaZoneReviewSchema,
  telegramSessionSchema,
  walletOperationJumpCreateSchema,
} from "./validation.js";
import { hashPassword, verifyLoginPassword } from "./passwords.js";
import {
  buildSalaryLoanV2RepaymentSchedule,
  buildRepaymentSchedule,
  formatApplicantLoanSummary,
  summarizeRepaymentSchedule,
  type ApplicantLoanSummary,
  type RepaymentScheduleItem,
} from "./repayment.js";
import {
  createOutgoingDomainEvent,
  configuredDomainEventSharedSecrets,
  domainEventEnvelopeSchema,
  domainEventHeadersSchema,
  DOMAIN_EVENT_TYPES,
  isDomainEventTimestampWithinWindow,
  sha256Hex,
  signDomainEventRequest,
  stableJson,
  type DomainEventEnvelope,
  verifyDomainEventSignature,
} from "./domain-events.js";
import {
  walletBrokerExchangeHeadersSchema,
  walletBrokerExchangeRequestSchema,
  walletBrokerExchangeResponseSchema,
} from "@payease/shared-security";
import {
  buildApplicantNotification,
  buildApplicantNotificationId,
  type ApplicantNotification,
  type ApplicantNotificationTimelineRow,
} from "./applicant-notifications.js";
import {
  configuredTelegramBots,
  enabledTelegramBotEntryUrls,
  isTelegramBotEnabled,
  isTelegramWebhookSecretValid,
  requireTelegramRecoveryTopology,
  verifiedTelegramContactFromUpdate,
  verifyTelegramMiniAppInitData,
} from "./telegram-auth.js";
import {
  isControlledPreview,
  isUnauthenticatedControlledPreview,
  requiresTelegramAuthentication,
  requiresTelegramPhoneVerification,
} from "./telegram-auth-policy.js";
import { isLenderWalletIntegrationEnabled } from "./lender-wallet-policy.js";
import {
  isAllowedApplicantOrigin,
  requireConfiguredApplicantOrigins,
} from "./applicant-origin.js";
import {
  decryptPersonalProfile,
  decryptPersonalValue,
  encryptPersonalProfile,
  encryptPersonalValue,
  identityDocumentLookupHash,
  identityDocumentLookupHashesMatch,
  personalDataEncryptionPreflight,
  personalDataKeyVersion,
} from "./personal-profile.js";
import { runDatabaseMigrations } from "./database-migrations.js";
import { applicantRejectionNoticeCode } from "./applicant-rejection-notice.js";
import {
  buildWalletOperationJump,
  configuredWalletOperationJumpSettings,
} from "./wallet-operation-jumps.js";
import {
  cookieValue,
  csrfCookie,
  csrfCompatibilityCookie,
  expiredCsrfCookie,
  expiredCsrfCompatibilityCookie,
  hasValidDoubleSubmitCsrf,
} from "./csrf.js";
import {
  isInsideCambodia,
  parseZonePolygon,
  polygonContainsPoint,
  polygonOverlaps,
  type LocationAssessmentResult,
  type ParsedZonePolygon,
  type Point,
} from "./service-area-zones.js";

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

const lenderWalletIntegrationEnabled = isLenderWalletIntegrationEnabled();

function loadBrokerInternalMtlsServerOptions():
  | (HttpsServerOptions & {
      requestCert: true;
      rejectUnauthorized: false;
    })
  | undefined {
  const certPath = process.env.PAYEASE_BROKER_MTLS_SERVER_CERT_PATH?.trim();
  const keyPath = process.env.PAYEASE_BROKER_MTLS_SERVER_KEY_PATH?.trim();
  const caPath = process.env.PAYEASE_BROKER_MTLS_CA_CERT_PATH?.trim();
  if (!certPath && !keyPath && !caPath) {
    if (process.env.NODE_ENV !== "test" && lenderWalletIntegrationEnabled) {
      throw new Error(
        "Broker internal mTLS is required but server certificate paths are missing.",
      );
    }
    return undefined;
  }
  if (!certPath || !keyPath || !caPath) {
    throw new Error(
      "PAYEASE_BROKER_MTLS_SERVER_CERT_PATH, PAYEASE_BROKER_MTLS_SERVER_KEY_PATH, and PAYEASE_BROKER_MTLS_CA_CERT_PATH must all be configured together.",
    );
  }
  return {
    cert: readFileSync(certPath),
    key: readFileSync(keyPath),
    ca: readFileSync(caPath),
    requestCert: true,
    rejectUnauthorized: false,
    ...(process.env.PAYEASE_BROKER_MTLS_SERVER_KEY_PASSPHRASE
      ? {
          passphrase: process.env.PAYEASE_BROKER_MTLS_SERVER_KEY_PASSPHRASE,
        }
      : {}),
  };
}

function brokerInternalMtlsListenSettings(): Readonly<{
  host: string;
  port: number;
}> {
  const host = process.env.PAYEASE_BROKER_INTERNAL_MTLS_HOST?.trim();
  const port = Number(process.env.PAYEASE_BROKER_INTERNAL_MTLS_PORT);
  if (!host) {
    throw new Error(
      "PAYEASE_BROKER_INTERNAL_MTLS_HOST is required for the isolated lender listener.",
    );
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      "PAYEASE_BROKER_INTERNAL_MTLS_PORT must be an integer from 1 to 65535.",
    );
  }
  return { host, port };
}

const brokerInternalMtlsServerOptions = loadBrokerInternalMtlsServerOptions();
const pool = new Pool({ connectionString: databaseUrl, max: 5 });
const app = Fastify({
  logger: true,
  bodyLimit: 4 * 1024 * 1024,
});
// Public applicant and back-office traffic stays on this listener. The lender
// transport is intentionally isolated below so a reverse proxy can terminate
// public TLS without breaking peer-certificate verification.
const internalMtlsApp = brokerInternalMtlsServerOptions
  ? Fastify({
      logger: true,
      bodyLimit: 4 * 1024 * 1024,
      https: brokerInternalMtlsServerOptions,
    })
  : undefined;
app.addContentTypeParser(
  /^multipart\/form-data/i,
  { parseAs: "buffer" },
  (_request, body, done) => {
    done(null, body);
  },
);
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

function normalizedPhoneNumber(value: string): string {
  return value.normalize("NFKC").replace(/[\s()-]/g, "");
}

function multipartBoundary(contentType: string): string | undefined {
  const matched = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  return matched?.[1]?.trim() || matched?.[2]?.trim();
}

function multipartDispositionParams(
  header: string | undefined,
): Readonly<{ name?: string; filename?: string }> {
  if (!header) return {};
  const name = /(?:^|;)\s*name="([^"]+)"/i.exec(header)?.[1];
  const filename = /(?:^|;)\s*filename="([^"]*)"/i.exec(header)?.[1];
  return {
    ...(name ? { name } : {}),
    ...(typeof filename === "string" ? { filename } : {}),
  };
}

function parseApplicantPaymentProofMultipart(
  contentType: string | undefined,
  body: unknown,
): z.infer<typeof applicantPaymentProofUploadSchema> {
  if (!contentType) {
    throw new Error("Missing multipart content type.");
  }
  const boundary = multipartBoundary(contentType);
  if (!boundary || !Buffer.isBuffer(body)) {
    throw new Error("Invalid multipart payment proof payload.");
  }
  const raw = body.toString("latin1");
  const marker = `--${boundary}`;
  const sections = raw.split(marker);
  let transferReference: string | undefined;
  let file:
    | undefined
    | Readonly<{
        fieldName: string;
        fileName: string;
        contentType: string;
        contentBase64: string;
      }>;

  for (const section of sections) {
    if (!section || section === "--\r\n" || section === "--") continue;
    let normalized = section.startsWith("\r\n") ? section.slice(2) : section;
    if (normalized.endsWith("--\r\n")) normalized = normalized.slice(0, -4);
    if (normalized.endsWith("\r\n")) normalized = normalized.slice(0, -2);
    const headerBreak = normalized.indexOf("\r\n\r\n");
    if (headerBreak < 0) continue;
    const headerText = normalized.slice(0, headerBreak);
    const contentText = normalized.slice(headerBreak + 4);
    const headers = new Map(
      headerText.split("\r\n").map((line) => {
        const separator = line.indexOf(":");
        return [
          line.slice(0, separator).trim().toLowerCase(),
          line.slice(separator + 1).trim(),
        ] as const;
      }),
    );
    const disposition = multipartDispositionParams(
      headers.get("content-disposition"),
    );
    if (!disposition.name) continue;
    if (typeof disposition.filename === "string") {
      if (file) {
        throw new Error("Only one payment proof file is allowed.");
      }
      file = {
        fieldName: disposition.name,
        fileName: disposition.filename,
        contentType:
          headers.get("content-type")?.toLowerCase() ??
          "application/octet-stream",
        contentBase64: Buffer.from(contentText, "latin1").toString("base64"),
      };
      continue;
    }
    if (disposition.name === "transferReference") {
      transferReference = contentText;
    }
  }

  if (!file || file.fieldName !== "file") {
    throw new Error("Payment proof file field is required.");
  }

  return applicantPaymentProofUploadSchema.parse({
    fileName: file.fileName,
    contentType: file.contentType,
    contentBase64: file.contentBase64,
    ...(transferReference ? { transferReference } : {}),
  });
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
  userAgent: string | string[] | undefined,
): Promise<{ telegramUserRef: string } | undefined> {
  const token = applicantSessionToken(cookieHeader);
  if (!token) return undefined;
  const result = await pool.query<{
    telegram_user_ref: string;
    authenticated_bot_id: string;
    client_user_agent_hash: string | null;
  }>(
    `SELECT telegram_user_ref, authenticated_bot_id, client_user_agent_hash
       FROM telegram_auth_sessions
     WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
       AND last_seen_at > now() - interval '5 minutes'`,
    [eventHash([token])],
  );
  const identity = result.rows[0];
  if (!identity) return undefined;
  // Sessions created after V0024 are scoped to the browser context that
  // initiated Telegram authentication. A NULL value only exists during the
  // short transition window for sessions minted before that migration.
  if (
    identity.client_user_agent_hash !== null &&
    identity.client_user_agent_hash !==
      eventHash([typeof userAgent === "string" ? userAgent : ""])
  )
    return undefined;
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

async function authenticatedApplicantUser(
  cookieHeader: string | undefined,
  userAgent: string | string[] | undefined,
): Promise<{ id: string; telegramUserRef: string } | undefined> {
  const applicant = await authenticatedApplicant(cookieHeader, userAgent);
  if (!applicant) return undefined;
  const user = await pool.query<{ id: string }>(
    "SELECT id FROM users WHERE telegram_user_ref = $1",
    [applicant.telegramUserRef],
  );
  if (!user.rowCount) return undefined;
  return { id: user.rows[0]!.id, telegramUserRef: applicant.telegramUserRef };
}

type ApplicantApplicationDraft = z.infer<
  typeof applicantApplicationDraftSchema
>;
type RepaymentMethod =
  | "SMILE_WALLET_AUTHORIZATION"
  | "EMPLOYER_PAYROLL_DEDUCTION"
  | "USER_DIRECT_DEBIT"
  | "USER_MANUAL_PAYMENT";
const SALARY_LOAN_V2_COLLECTION_SCOPE = "PRINCIPAL_AND_INTEREST" as const;
type SalaryLoanV2CollectionScope = typeof SALARY_LOAN_V2_COLLECTION_SCOPE;
type LenderCollectionSourceType =
  | "EMPLOYER_PAYROLL_REPORT"
  | "USER_DIRECT_DEBIT_REPORT"
  | "USER_MANUAL_PAYMENT_PROOF"
  | "REFUND_REVERSAL";
type LenderCollectionResult =
  | "COLLECTED"
  | "PARTIALLY_COLLECTED"
  | "NOT_COLLECTED"
  | "DIRECT_DEBIT_FAILED"
  | "AUTHORIZATION_EXPIRED"
  | "REFUND_REVERSED";
type LenderCollectionWorkItemStatus =
  "OPEN" | "PROCESSING" | "CONFIRMED" | "EXCEPTION";
type LenderCollectionExceptionType =
  | "PARTIALLY_COLLECTED"
  | "NOT_COLLECTED"
  | "DIRECT_DEBIT_FAILED"
  | "AUTHORIZATION_EXPIRED"
  | "REFUND_REVERSED";
type EmployerPayrollInstructionStatus =
  | "SCHEDULED"
  | "PAYROLL_COLLECTION_PENDING"
  | "COLLECTION_RECONCILIATION_PENDING"
  | "RECONCILED"
  | "COLLECTION_EXCEPTION";
type EmployerRepaymentConfig = Readonly<{
  availableRepaymentMethods: readonly RepaymentMethod[];
  defaultRepaymentMethod: RepaymentMethod;
  employerPayrollRuleVersion: string | null;
}>;

function serializeApplicantApplicationDraft(
  draft: ApplicantApplicationDraft,
): Buffer {
  return encryptPersonalValue(JSON.stringify(draft));
}

function parseApplicantApplicationDraft(
  ciphertext: Buffer,
): ApplicantApplicationDraft {
  return applicantApplicationDraftSchema.parse(
    JSON.parse(decryptPersonalValue(ciphertext)) as unknown,
  );
}

async function loadEmployerRepaymentConfig(
  client: PoolClient,
  employerTenantId: string | undefined,
): Promise<EmployerRepaymentConfig> {
  if (!employerTenantId) {
    return {
      availableRepaymentMethods: ["SMILE_WALLET_AUTHORIZATION"],
      defaultRepaymentMethod: "SMILE_WALLET_AUTHORIZATION",
      employerPayrollRuleVersion: null,
    };
  }
  const rule = await client.query<{
    rule_code: string;
  }>(
    `SELECT rule_code
               FROM employer_payroll_rules
              WHERE employer_tenant_id = $1
                AND workflow_version = 'SALARY_LOAN_V2'
                AND retired_at IS NULL
              ORDER BY published_at DESC
              LIMIT 1`,
    [employerTenantId],
  );
  if (!rule.rowCount) {
    return {
      availableRepaymentMethods: ["SMILE_WALLET_AUTHORIZATION"],
      defaultRepaymentMethod: "SMILE_WALLET_AUTHORIZATION",
      employerPayrollRuleVersion: null,
    };
  }
  return {
    availableRepaymentMethods: ["SMILE_WALLET_AUTHORIZATION"],
    defaultRepaymentMethod: "SMILE_WALLET_AUTHORIZATION",
    employerPayrollRuleVersion: rule.rows[0]!.rule_code,
  };
}

function authorizationReference(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function maskedApplicationReference(
  applicationNo: string | null | undefined,
): string | undefined {
  if (!applicationNo) return undefined;
  if (applicationNo.length <= 8) return applicationNo;
  return `${applicationNo.slice(0, 4)}***${applicationNo.slice(-4)}`;
}

function profileNextAction(status: string): string {
  switch (status) {
    case "DRAFT":
      return "CONTINUE_APPLICATION";
    case "SUBMITTED":
    case "BROKER_REVIEW":
    case "EMPLOYER_VERIFICATION":
    case "LENDER_INITIAL_REVIEW":
    case "LENDER_FINAL_REVIEW":
      return "VIEW_PROGRESS";
    case "CONTRACT_PENDING":
    case "CONTRACT_CONFIRMED":
      return "VIEW_CONTRACT";
    case "DISBURSEMENT_PENDING":
    case "DISBURSED":
    case "REPAYMENT_ACTIVE":
      return "VIEW_BILL";
    case "SETTLED":
      return "VIEW_RECORD";
    default:
      return "VIEW_DETAILS";
  }
}

function canApplicantUploadPaymentProof(status: string): boolean {
  return status === "REPAYMENT_ACTIVE";
}

function canApplicantRequestReassessment(status: string): boolean {
  return ["REJECTED", "SETTLED", "CLOSED"].includes(status);
}

const REAPPLICATION_COOLING_OFF_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function applicantCoolingOffEndsAt(
  rejectedAt: string | null | undefined,
): string | null {
  if (!rejectedAt) return null;
  const rejected = new Date(rejectedAt);
  if (Number.isNaN(rejected.getTime())) return null;
  return new Date(
    rejected.getTime() + REAPPLICATION_COOLING_OFF_DAYS * MS_PER_DAY,
  ).toISOString();
}

function applicantCoolingOffDaysRemaining(
  rejectedAt: string | null | undefined,
): number | null {
  const endsAt = applicantCoolingOffEndsAt(rejectedAt);
  if (!endsAt) return null;
  const remainingMs = new Date(endsAt).getTime() - Date.now();
  if (remainingMs <= 0) {
    // Keep the UI fail-closed until the back-office explicitly clears the
    // reapplication restriction.
    return 1;
  }
  return Math.max(1, Math.ceil(remainingMs / MS_PER_DAY));
}

function approvalCaseAction(decision: "APPROVED" | "RETURNED" | "REJECTED") {
  return decision === "APPROVED"
    ? "APPROVE"
    : decision === "RETURNED"
      ? "RETURN"
      : "REJECT";
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
  const isPublicApplicantPhoneVerification =
    request.method === "GET" &&
    requestPath === "/v1/local/public/profile/telegram-phone-verification";
  const isPublicApplicantProfileView =
    request.method === "GET" && requestPath === "/v1/local/public/profile/view";
  const isPublicApplicantDraft =
    requestPath === "/v1/local/public/application-draft";
  const isPublicKycLocationEvidence =
    requestPath === "/v1/local/public/kyc-location-evidence" ||
    requestPath === "/v1/local/public/kyc-location-evidence/status";
  const isPublicApplicantNotification =
    requestPath === "/v1/local/public/notifications" ||
    requestPath === "/v1/local/public/notifications/read-all" ||
    requestPath.startsWith("/v1/local/public/notifications/");
  const isPublicUserApplicationView =
    requestPath === "/v1/local/public/applications" ||
    requestPath.startsWith("/v1/local/public/applications/");
  const isPublicTelegramEntryPoints =
    request.method === "GET" &&
    requestPath === "/v1/local/public/telegram-entrypoints";
  const isPublicEmployerTenantList =
    request.method === "GET" &&
    requestPath === "/v1/local/public/employer-tenants";
  const isTelegramBotWebhook =
    request.method === "POST" &&
    /^\/v1\/local\/internal\/telegram-bot-updates\/\d{5,20}$/.test(requestPath);
  const isIncomingDomainEventTransport =
    request.method === "POST" &&
    requestPath === "/v1/local/domain-events/inbox/receive";
  const isWalletBrokerExchangeTransport =
    request.method === "POST" &&
    requestPath === "/v1/local/wallet-operation-jumps/exchange";
  const isApplicantStateChange =
    isPublicUserApplicationSubmission ||
    isPublicTelegramSession ||
    ((request.method === "PUT" || request.method === "DELETE") &&
      isPublicApplicantDraft) ||
    (request.method === "POST" && isPublicKycLocationEvidence) ||
    ((request.method === "POST" || request.method === "DELETE") &&
      isPublicApplicantNotification) ||
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
    !isIncomingDomainEventTransport &&
    !isWalletBrokerExchangeTransport &&
    !isTelegramBotWebhook &&
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
    isPublicApplicantPhoneVerification ||
    isPublicApplicantProfileView ||
    isPublicApplicantDraft ||
    isPublicKycLocationEvidence ||
    isPublicApplicantNotification ||
    isPublicUserApplicationView ||
    isPublicTelegramEntryPoints ||
    isPublicEmployerTenantList ||
    isIncomingDomainEventTransport ||
    isWalletBrokerExchangeTransport ||
    // Telegram invokes this server-to-server endpoint without a browser or
    // an admin cookie. Its handler below performs its own per-Bot webhook
    // secret authentication, so it must not fall through to admin-session
    // authentication here.
    isTelegramBotWebhook
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

function requireLenderRepaymentRole(
  request: { adminIdentity?: { roles: string[] } },
  reply: any,
): boolean {
  const roles = request.adminIdentity?.roles ?? [];
  if (
    !roles.includes("LENDER_REPAYMENT_MAKER") &&
    !roles.includes("LENDER_REPAYMENT_CHECKER")
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

function requirePaymentProofReviewRole(
  request: { adminIdentity?: { roles: string[] } },
  reply: any,
): boolean {
  const roles = request.adminIdentity?.roles ?? [];
  if (
    !roles.includes("BROKER_OFFICER") &&
    !roles.includes("LENDER_REPAYMENT_CHECKER")
  ) {
    reply.code(403).send({ code: "FORBIDDEN__ROLE_OUT_OF_SCOPE" });
    return false;
  }
  return true;
}

function requireKycLocationReadRole(
  request: { adminIdentity?: { roles: string[] } },
  reply: any,
): boolean {
  const roles = request.adminIdentity?.roles ?? [];
  if (!roles.includes("BROKER_OFFICER") && !roles.includes("OPS_ADMIN")) {
    reply.code(403).send({ code: "FORBIDDEN__ROLE_OUT_OF_SCOPE" });
    return false;
  }
  return true;
}

function requireReassessmentQueueRole(
  request: { adminIdentity?: { roles: string[] } },
  reply: any,
): boolean {
  const roles = request.adminIdentity?.roles ?? [];
  if (
    !roles.includes("BROKER_OFFICER") &&
    !roles.includes("LENDER_CREDIT_OFFICER") &&
    !roles.includes("LENDER_CREDIT_REVIEWER")
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
  application_no: string;
  status: string;
  review_round: number;
  employer_tenant_id: string | null;
  workflow_version: "LEGACY_V1" | "SALARY_LOAN_V2";
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

type EmploymentIdentityMatchCommand = Readonly<{
  identityDocumentNumber: string;
  reasonCode: string;
}>;

type FinalReviewTerms = Readonly<{
  approvedAmountMinor?: string;
  actualDisbursementAmountMinor?: string;
  lenderInterestMinor?: string;
  totalRepaymentAmountMinor?: string;
  brokerageRemunerationReceivableMinor?: string;
  installmentCount?: number;
  firstDueDate?: string;
  productRuleVersion?: string;
  brokerageRemunerationRuleVersion?: string;
  lenderInterestRuleVersion?: string;
}>;

class DualControlConflictError extends Error {}

type ManualActionName =
  | "BROKER_REVIEW"
  | "APPLICANT_PAYMENT_PROOF_UPLOAD"
  | "APPLICANT_PAYMENT_PROOF_REVIEW"
  | "APPLICANT_REASSESSMENT_REQUEST"
  | "REASSESSMENT_BROKER_REVIEW"
  | "REASSESSMENT_LENDER_REVIEW"
  | "EMPLOYER_IDENTITY_MATCH"
  | "EMPLOYER_VERIFICATION"
  | "EMPLOYER_FINANCE_VERIFICATION"
  | "LENDER_INITIAL_REVIEW"
  | "LENDER_FINAL_REVIEW"
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

function requestHeaderValue(
  header: string | string[] | undefined,
): string | undefined {
  return Array.isArray(header) ? undefined : header?.trim();
}

function configuredWalletBrokerServiceSecrets(): Readonly<
  Record<
    string,
    Readonly<{
      algorithm: "HMAC-SHA256";
      secret: string;
    }>
  >
> {
  const sharedSecret = process.env.PAYEASE_LENDER_WALLET_SHARED_SECRET?.trim();
  if (!sharedSecret && process.env.NODE_ENV !== "test") {
    throw new Error("PAYEASE_LENDER_WALLET_SHARED_SECRET is required.");
  }
  return {
    "lender-wallet-hmac-v1": {
      algorithm: "HMAC-SHA256",
      secret: sharedSecret ?? `lender_wallet_test_only_${"*".repeat(40)}`,
    },
  };
}

function requireBrokerInternalMtls(
  request: FastifyRequest,
  reply: FastifyReply,
): boolean {
  if (!brokerInternalMtlsServerOptions) {
    return true;
  }
  const socket = request.raw.socket as {
    encrypted?: boolean;
    authorized?: boolean;
    getPeerCertificate?: () => { subject?: { CN?: string } };
  };
  if (!socket.encrypted || !socket.authorized) {
    reply.code(401).send({ code: "CLIENT_CERT_REQUIRED" });
    return false;
  }
  const expectedCn =
    process.env.PAYEASE_BROKER_TRUSTED_LENDER_WALLET_CLIENT_CN?.trim();
  if (expectedCn) {
    const presentedCn = socket.getPeerCertificate?.().subject?.CN;
    if (presentedCn !== expectedCn) {
      reply.code(403).send({ code: "CLIENT_CERT_SUBJECT_FORBIDDEN" });
      return false;
    }
  }
  return true;
}

function verifyWalletBrokerServiceSignature(args: {
  method: string;
  path: string;
  headers: z.infer<typeof walletBrokerExchangeHeadersSchema>;
  bodySha256: string;
}): boolean {
  const configured = configuredWalletBrokerServiceSecrets()[args.headers.keyId];
  if (!configured || configured.algorithm !== args.headers.algorithm) {
    return false;
  }
  const expected = signDomainEventRequest({
    method: args.method,
    path: args.path,
    timestampMillis: args.headers.timestampMillis,
    nonce: args.headers.nonce,
    keyId: args.headers.keyId,
    bodySha256: args.bodySha256,
    secret: configured.secret,
  });
  const actualBuffer = Buffer.from(args.headers.signature.toLowerCase(), "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
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

type AdminActionName =
  | "SERVICE_AREA_ZONE_CREATE"
  | "SERVICE_AREA_ZONE_PATCH"
  | "SERVICE_AREA_ZONE_SUBMIT_REVIEW"
  | "SERVICE_AREA_ZONE_REVIEW"
  | "SERVICE_AREA_ZONE_ACTIVATE"
  | "SERVICE_AREA_ZONE_RETIRE";

type AdminActionReplay =
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

type ServiceAreaZoneStatus = "DRAFT" | "PENDING_REVIEW" | "ACTIVE" | "RETIRED";

type ZoneScopeType = "PLATFORM" | "EMPLOYER_TENANT";

type ServiceAreaZoneRow = Readonly<{
  id: string;
  zone_ref: string;
  version: number;
  display_name: string;
  scope_type: ZoneScopeType;
  employer_tenant_id: string | null;
  polygon_geojson: unknown;
  polygon_bbox: Record<string, number>;
  status: ServiceAreaZoneStatus;
  effective_from: string;
  effective_until: string | null;
  change_reason: string;
  created_by_user_ref: string;
  submitted_by_user_ref: string | null;
  submitted_at: string | null;
  reviewed_by_user_ref: string | null;
  reviewed_at: string | null;
  activated_by_user_ref: string | null;
  activated_at: string | null;
  retired_by_user_ref: string | null;
  retired_at: string | null;
  created_at: string;
  updated_at: string;
}>;

type AssessedServiceAreaZone = Readonly<{
  id: string;
  zoneRef: string;
  version: number;
  scopeType: ZoneScopeType;
  employerTenantId: string | null;
  effectiveFrom: string;
  effectiveUntil: string | null;
  polygon: ParsedZonePolygon;
}>;

type KycLocationStatusRow = Readonly<{
  assessment_result: LocationAssessmentResult;
  submitted_at: string;
}>;

const KYC_LOCATION_RULE_VERSION = "KYC_LOCATION_RULE_V1";
const DEFAULT_KYC_LOCATION_ACCURACY_THRESHOLD_METERS = 200;

function configuredKycLocationAccuracyThresholdMeters(): number {
  const raw =
    process.env.PAYEASE_KYC_LOCATION_ACCURACY_THRESHOLD_METERS?.trim();
  const parsed = raw
    ? Number(raw)
    : DEFAULT_KYC_LOCATION_ACCURACY_THRESHOLD_METERS;
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_KYC_LOCATION_ACCURACY_THRESHOLD_METERS;
}

async function adminActionReplay(
  client: PoolClient,
  actionName: AdminActionName,
  actorUserRef: string,
  idempotencyKey: string,
  requestBody: object,
): Promise<AdminActionReplay> {
  const requestFingerprint = eventHash([JSON.stringify(requestBody)]);
  const existing = await client.query<{
    request_fingerprint: string;
    response_status: number;
    response_body: Record<string, unknown>;
  }>(
    `SELECT request_fingerprint, response_status, response_body
       FROM admin_action_idempotency
      WHERE action_name = $1 AND actor_user_ref = $2 AND idempotency_key = $3
      FOR UPDATE`,
    [actionName, actorUserRef, idempotencyKey],
  );
  const recorded = existing.rows[0];
  if (!recorded) return { kind: "new", idempotencyKey, requestFingerprint };
  if (recorded.request_fingerprint !== requestFingerprint) {
    return { kind: "key-reused" };
  }
  return {
    kind: "replay",
    responseStatus: recorded.response_status,
    responseBody: recorded.response_body,
  };
}

async function recordAdminActionResult(
  client: PoolClient,
  actionName: AdminActionName,
  actorUserRef: string,
  replay: Extract<AdminActionReplay, { kind: "new" }>,
  responseStatus: number,
  responseBody: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `INSERT INTO admin_action_idempotency
      (action_name, actor_user_ref, idempotency_key, request_fingerprint,
       response_status, response_body)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      actionName,
      actorUserRef,
      replay.idempotencyKey,
      replay.requestFingerprint,
      responseStatus,
      JSON.stringify(responseBody),
    ],
  );
}

function serviceAreaZoneResponse(
  zone: ServiceAreaZoneRow,
): Record<string, unknown> {
  return {
    zoneRef: zone.zone_ref,
    version: zone.version,
    displayName: zone.display_name,
    scopeType: zone.scope_type,
    employerTenantId: zone.employer_tenant_id,
    polygonGeoJson: zone.polygon_geojson,
    polygonBbox: zone.polygon_bbox,
    status: zone.status,
    effectiveFrom: zone.effective_from,
    effectiveUntil: zone.effective_until,
    changeReason: zone.change_reason,
    createdBy: zone.created_by_user_ref,
    submittedBy: zone.submitted_by_user_ref,
    submittedAt: zone.submitted_at,
    reviewedBy: zone.reviewed_by_user_ref,
    reviewedAt: zone.reviewed_at,
    activatedBy: zone.activated_by_user_ref,
    activatedAt: zone.activated_at,
    retiredBy: zone.retired_by_user_ref,
    retiredAt: zone.retired_at,
    createdAt: zone.created_at,
    updatedAt: zone.updated_at,
  };
}

function zoneRowToAssessmentZone(row: {
  id: string;
  zone_ref: string;
  version: number;
  scope_type: ZoneScopeType;
  employer_tenant_id: string | null;
  effective_from: string;
  effective_until: string | null;
  polygon_geojson: unknown;
}): AssessedServiceAreaZone {
  return {
    id: row.id,
    zoneRef: row.zone_ref,
    version: row.version,
    scopeType: row.scope_type,
    employerTenantId: row.employer_tenant_id,
    effectiveFrom: row.effective_from,
    effectiveUntil: row.effective_until,
    polygon: parseZonePolygon(row.polygon_geojson),
  };
}

async function loadZoneVersionForUpdate(
  client: PoolClient,
  zoneRef: string,
  version: number,
): Promise<ServiceAreaZoneRow | undefined> {
  const result = await client.query<ServiceAreaZoneRow>(
    `SELECT id, zone_ref, version, display_name, scope_type, employer_tenant_id,
            polygon_geojson, polygon_bbox, status, effective_from::text,
            effective_until::text, change_reason, created_by_user_ref,
            submitted_by_user_ref, submitted_at::text, reviewed_by_user_ref,
            reviewed_at::text, activated_by_user_ref, activated_at::text,
            retired_by_user_ref, retired_at::text, created_at::text, updated_at::text
       FROM service_area_zone_versions
      WHERE zone_ref = $1 AND version = $2
      FOR UPDATE`,
    [zoneRef, version],
  );
  return result.rows[0];
}

async function loadActiveServiceAreaZones(
  client: PoolClient,
  scopeType: ZoneScopeType,
  employerTenantId: string | null,
  effectiveAt: string,
): Promise<AssessedServiceAreaZone[]> {
  const result = await client.query<{
    id: string;
    zone_ref: string;
    version: number;
    scope_type: ZoneScopeType;
    employer_tenant_id: string | null;
    effective_from: string;
    effective_until: string | null;
    polygon_geojson: unknown;
  }>(
    `SELECT id, zone_ref, version, scope_type, employer_tenant_id,
            effective_from::text, effective_until::text, polygon_geojson
       FROM service_area_zone_versions
      WHERE status = 'ACTIVE'
        AND scope_type = $1
        AND (
          ($1 = 'PLATFORM' AND employer_tenant_id IS NULL) OR
          ($1 = 'EMPLOYER_TENANT' AND employer_tenant_id = $2)
        )
        AND effective_from <= $3::timestamptz
        AND (effective_until IS NULL OR effective_until > $3::timestamptz)
      ORDER BY version DESC`,
    [scopeType, employerTenantId, effectiveAt],
  );
  return result.rows.map(zoneRowToAssessmentZone);
}

function assessZones(
  point: Point,
  zones: readonly AssessedServiceAreaZone[],
): { matched: boolean; zone?: AssessedServiceAreaZone } {
  for (const zone of zones) {
    if (polygonContainsPoint(zone.polygon, point)) {
      return { matched: true, zone };
    }
  }
  return { matched: false };
}

async function assessKycLocationEvidence(args: {
  client: PoolClient;
  userId: string;
  applicationId?: string | null;
  employerTenantId?: string | null;
  evidenceId: string;
  point: Point;
  horizontalAccuracyMeters: number;
  effectiveAt: string;
}): Promise<{
  assessmentResult: LocationAssessmentResult;
  assessedScopeType: ZoneScopeType;
  employerTenantId: string | null;
  matchedZoneRef: string | null;
  matchedZoneVersion: number | null;
}> {
  const threshold = configuredKycLocationAccuracyThresholdMeters();
  if (args.horizontalAccuracyMeters > threshold) {
    return {
      assessmentResult: "LOW_ACCURACY",
      assessedScopeType: args.employerTenantId ? "EMPLOYER_TENANT" : "PLATFORM",
      employerTenantId: args.employerTenantId ?? null,
      matchedZoneRef: null,
      matchedZoneVersion: null,
    };
  }
  if (!isInsideCambodia(args.point)) {
    return {
      assessmentResult: "OUT_OF_COUNTRY",
      assessedScopeType: args.employerTenantId ? "EMPLOYER_TENANT" : "PLATFORM",
      employerTenantId: args.employerTenantId ?? null,
      matchedZoneRef: null,
      matchedZoneVersion: null,
    };
  }

  const tenantZones = args.employerTenantId
    ? await loadActiveServiceAreaZones(
        args.client,
        "EMPLOYER_TENANT",
        args.employerTenantId,
        args.effectiveAt,
      )
    : [];
  const selectedTenantZones =
    tenantZones.length > 0
      ? tenantZones
      : await loadActiveServiceAreaZones(
          args.client,
          "PLATFORM",
          null,
          args.effectiveAt,
        );
  const match = assessZones(args.point, selectedTenantZones);
  return {
    assessmentResult: match.matched ? "MATCH" : "OUT_OF_ZONE",
    assessedScopeType:
      tenantZones.length > 0 && args.employerTenantId
        ? "EMPLOYER_TENANT"
        : "PLATFORM",
    employerTenantId:
      tenantZones.length > 0 && args.employerTenantId
        ? args.employerTenantId
        : null,
    matchedZoneRef: match.zone?.zoneRef ?? null,
    matchedZoneVersion: match.zone?.version ?? null,
  };
}

async function insertKycLocationAssessment(args: {
  client: PoolClient;
  evidenceId: string;
  userId: string;
  applicationId?: string | null;
  employerTenantId?: string | null;
  actorUserRef: string;
  assessmentResult: LocationAssessmentResult;
  assessedScopeType: ZoneScopeType;
  matchedZoneRef: string | null;
  matchedZoneVersion: number | null;
}): Promise<void> {
  await args.client.query(
    `INSERT INTO kyc_location_assessments
      (evidence_id, user_id, application_id, assessment_result, assessed_scope_type,
       employer_tenant_id, matched_zone_ref, matched_zone_version, rule_version,
       actor_user_ref)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      args.evidenceId,
      args.userId,
      args.applicationId ?? null,
      args.assessmentResult,
      args.assessedScopeType,
      args.employerTenantId ?? null,
      args.matchedZoneRef,
      args.matchedZoneVersion,
      KYC_LOCATION_RULE_VERSION,
      args.actorUserRef,
    ],
  );
}

function kycLocationStatusResponse(
  row: KycLocationStatusRow,
): NonNullable<ApplicantLoanSummary["kycLocation"]> {
  return {
    assessmentResult: row.assessment_result,
    submittedAt: row.submitted_at,
  };
}

async function loadLatestKycLocationStatus(args: {
  client: PoolClient | Pool;
  userId: string;
  applicationId?: string | null;
}): Promise<undefined | NonNullable<ApplicantLoanSummary["kycLocation"]>> {
  const result = await args.client.query<KycLocationStatusRow>(
    `SELECT assessment.assessment_result,
            evidence.created_at::text AS submitted_at
       FROM kyc_location_evidence evidence
       JOIN kyc_location_assessments assessment
         ON assessment.evidence_id = evidence.id
      WHERE evidence.user_id = $1
        AND ($2::uuid IS NULL OR assessment.application_id = $2 OR assessment.application_id IS NULL)
      ORDER BY
        CASE WHEN $2::uuid IS NOT NULL AND assessment.application_id = $2 THEN 0 ELSE 1 END,
        assessment.assessed_at DESC,
        evidence.created_at DESC
      LIMIT 1`,
    [args.userId, args.applicationId ?? null],
  );
  const row = result.rows[0];
  return row ? kycLocationStatusResponse(row) : undefined;
}

async function loadOverlappingActiveZoneVersions(args: {
  client: PoolClient;
  zoneId: string;
  scopeType: ZoneScopeType;
  employerTenantId: string | null;
  effectiveFrom: string;
  effectiveUntil: string | null;
}): Promise<AssessedServiceAreaZone[]> {
  const result = await args.client.query<{
    id: string;
    zone_ref: string;
    version: number;
    scope_type: ZoneScopeType;
    employer_tenant_id: string | null;
    effective_from: string;
    effective_until: string | null;
    polygon_geojson: unknown;
  }>(
    `SELECT id, zone_ref, version, scope_type, employer_tenant_id,
            effective_from::text, effective_until::text, polygon_geojson
       FROM service_area_zone_versions
      WHERE status = 'ACTIVE'
        AND id <> $1
        AND scope_type = $2
        AND (
          ($2 = 'PLATFORM' AND employer_tenant_id IS NULL) OR
          ($2 = 'EMPLOYER_TENANT' AND employer_tenant_id = $3)
        )
        AND tstzrange(effective_from, COALESCE(effective_until, 'infinity'::timestamptz), '[)')
            && tstzrange($4::timestamptz, COALESCE($5::timestamptz, 'infinity'::timestamptz), '[)')`,
    [
      args.zoneId,
      args.scopeType,
      args.employerTenantId,
      args.effectiveFrom,
      args.effectiveUntil,
    ],
  );
  return result.rows.map(zoneRowToAssessmentZone);
}

async function lockApplication(
  client: PoolClient,
  applicationNo: string,
): Promise<ApplicationRow | undefined> {
  const result = await client.query<ApplicationRow>(
    `SELECT id, application_no, status, review_round, employer_tenant_id, workflow_version
       FROM applications
      WHERE application_no = $1
      FOR UPDATE`,
    [applicationNo],
  );
  return result.rows[0];
}

async function lockApplicantOwnedApplication(
  client: PoolClient,
  applicationNo: string,
  telegramUserRef: string,
): Promise<ApplicationRow | undefined> {
  const result = await client.query<ApplicationRow>(
    `SELECT applications.id, applications.application_no, applications.status,
            applications.review_round, applications.employer_tenant_id,
            applications.workflow_version
       FROM applications
       JOIN users ON users.id = applications.user_id
      WHERE applications.application_no = $1
        AND users.telegram_user_ref = $2
      FOR UPDATE`,
    [applicationNo, telegramUserRef],
  );
  return result.rows[0];
}

async function lockApplicationById(
  client: PoolClient,
  applicationId: string,
): Promise<ApplicationRow | undefined> {
  const result = await client.query<ApplicationRow>(
    `SELECT id, application_no, status, review_round, employer_tenant_id, workflow_version
       FROM applications
      WHERE id = $1
      FOR UPDATE`,
    [applicationId],
  );
  return result.rows[0];
}

async function employerTenantAccess(
  client: PoolClient,
  application: ApplicationRow,
  loginName: string,
): Promise<"GRANTED" | "APPLICATION_UNASSIGNED" | "DENIED"> {
  if (!application.employer_tenant_id) return "APPLICATION_UNASSIGNED";
  const membership = await client.query(
    `SELECT 1
       FROM employer_tenant_members m
       JOIN admin_accounts a ON a.id = m.account_id
       JOIN employer_tenants t ON t.id = m.employer_tenant_id
      WHERE m.employer_tenant_id = $1 AND a.login_name = $2
        AND a.is_active = true AND t.is_active = true`,
    [application.employer_tenant_id, loginName],
  );
  return membership.rowCount ? "GRANTED" : "DENIED";
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
  const existing = await client.query(
    "SELECT 1 FROM repayment_installments WHERE application_id = $1 LIMIT 1",
    [applicationId],
  );
  if (existing.rowCount) return;

  const application = await client.query<{
    workflow_version: "LEGACY_V1" | "SALARY_LOAN_V2";
  }>(
    `SELECT workflow_version
       FROM applications
      WHERE id = $1`,
    [applicationId],
  );
  const workflowVersion = application.rows[0]?.workflow_version;
  if (!workflowVersion) throw new Error("application not found");

  if (workflowVersion === "SALARY_LOAN_V2") {
    const v2Context = await client.query<{
      principal_amount_minor: string;
      lender_interest_minor: string;
      tenor_days: 15 | 30;
      installment_count: 1 | 2;
      first_due_date: string;
      product_rule_version: string;
      lender_interest_rule_version: string;
      selected_repayment_method: RepaymentMethod;
      employer_payroll_rule_version: string;
      payroll_nodes: Array<
        | { nodeRef: string; scheduleType: "FIXED_DAY"; dayOfMonth: number }
        | { nodeRef: string; scheduleType: "LAST_DAY_OF_MONTH" }
      >;
      collection_payee_ref: string;
    }>(
      `SELECT quote.principal_amount_minor::text,
              quote.lender_interest_minor::text,
              application_row.tenor_days,
              quote.installment_count,
              quote.first_due_date::text,
              quote.product_rule_version,
              quote.lender_interest_rule_version,
              preference.selected_repayment_method,
              COALESCE(preference.employer_payroll_rule_version, rule.rule_code)
                AS employer_payroll_rule_version,
              rule.payroll_nodes,
              preference.collection_payee_ref
         FROM application_v2_quote_snapshots quote
         JOIN applications application_row
           ON application_row.id = quote.application_id
         JOIN application_repayment_preferences preference
           ON preference.application_id = quote.application_id
         LEFT JOIN LATERAL (
           SELECT rule_code, payroll_nodes
             FROM employer_payroll_rules
            WHERE employer_tenant_id = (
              SELECT employer_tenant_id FROM applications WHERE id = quote.application_id
            )
              AND workflow_version = 'SALARY_LOAN_V2'
              AND retired_at IS NULL
            ORDER BY published_at DESC
            LIMIT 1
         ) AS rule ON true
        WHERE quote.application_id = $1`,
      [applicationId],
    );
    const row = v2Context.rows[0];
    if (!row) {
      throw new Error(
        "V2 quote snapshot and repayment preferences are required",
      );
    }
    for (const installment of buildSalaryLoanV2RepaymentSchedule({
      principalAmountMinor: row.principal_amount_minor,
      lenderInterestMinor: row.lender_interest_minor,
      contractualTermDays: row.tenor_days,
      installmentCount: row.installment_count,
      firstDueDate: row.first_due_date,
      selectedRepaymentMethod: row.selected_repayment_method,
      employerPayrollRuleVersion: row.employer_payroll_rule_version,
      payrollNodes: row.payroll_nodes,
      collectionPayeeRef: row.collection_payee_ref,
      productRuleVersion: row.product_rule_version,
      lenderInterestRuleVersion: row.lender_interest_rule_version,
    })) {
      await client.query(
        `INSERT INTO repayment_installments
          (application_id, installment_no, due_date, amount_due_minor,
           principal_due_minor, lender_interest_due_minor, payroll_node_ref)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          applicationId,
          installment.installmentNo,
          installment.dueDate,
          installment.amountDueMinor,
          installment.principalDueMinor,
          installment.lenderInterestDueMinor,
          installment.payrollNodeRef ?? null,
        ],
      );
    }
    return;
  }

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
  for (const installment of buildRepaymentSchedule(
    term.total_repayable_minor,
    term.installment_count,
    term.first_due_date,
  )) {
    await client.query(
      `INSERT INTO repayment_installments
        (application_id, installment_no, due_date, amount_due_minor,
         principal_due_minor, lender_interest_due_minor, payroll_node_ref)
       VALUES ($1, $2, $3, $4, $4, 0, NULL)`,
      [
        applicationId,
        installment.installmentNo,
        installment.dueDate,
        installment.amountDueMinor,
      ],
    );
  }
}

async function ensureEmployerPayrollCollectionInstructions(
  client: PoolClient,
  applicationId: string,
  actorUserRef: string,
): Promise<void> {
  const existing = await client.query(
    `SELECT 1 FROM employer_payroll_collection_instructions
      WHERE application_id = $1
      LIMIT 1`,
    [applicationId],
  );
  if (existing.rowCount) return;

  const context = await client.query<{
    employer_tenant_id: string | null;
    employer_payroll_rule_version: string | null;
    selected_repayment_method: RepaymentMethod | null;
    collection_mode: SalaryLoanV2CollectionScope | null;
    payroll_deduction_authorized: boolean | null;
    product_rule_version: string | null;
    installment_count: number | null;
    disbursed_at: string | null;
  }>(
    `SELECT application_row.employer_tenant_id,
            preference.employer_payroll_rule_version,
            preference.selected_repayment_method,
            preference.collection_mode,
            auth_snapshot.payroll_deduction_authorized,
            quote.product_rule_version,
            quote.installment_count,
            status_event.occurred_at::text AS disbursed_at
       FROM applications application_row
       LEFT JOIN application_repayment_preferences preference
         ON preference.application_id = application_row.id
       LEFT JOIN application_authorization_snapshots auth_snapshot
         ON auth_snapshot.application_id = application_row.id
       LEFT JOIN application_v2_quote_snapshots quote
         ON quote.application_id = application_row.id
       LEFT JOIN LATERAL (
         SELECT occurred_at
           FROM application_status_events
           WHERE application_id = application_row.id
            AND to_status = 'DISBURSED'
          ORDER BY occurred_at DESC
          LIMIT 1
       ) AS status_event ON true
      WHERE application_row.id = $1`,
    [applicationId],
  );
  const row = context.rows[0];
  if (
    !row?.employer_tenant_id ||
    row.selected_repayment_method !== "EMPLOYER_PAYROLL_DEDUCTION" ||
    row.payroll_deduction_authorized !== true
  ) {
    return;
  }

  const installments = await client.query<{
    installment_no: number;
    due_date: string;
    amount_due_minor: string;
  }>(
    `SELECT installment_no, due_date::text, amount_due_minor::text
       FROM repayment_installments
      WHERE application_id = $1
      ORDER BY installment_no ASC`,
    [applicationId],
  );
  if (!installments.rowCount) return;

  for (const installment of installments.rows) {
    const lenderEventRef = `PAYROLL-SCHEDULED-${applicationId}-${installment.installment_no}`;
    await client.query(
      `INSERT INTO employer_payroll_collection_instructions
        (application_id, workflow_version, employer_tenant_id,
         repayment_installment_no, selected_repayment_method, collection_scope,
         projection_status, scheduled_due_date, scheduled_amount_minor,
         currency, lender_event_ref, payroll_schedule_snapshot)
       VALUES (
         $1, 'SALARY_LOAN_V2', $2, $3, 'EMPLOYER_PAYROLL_DEDUCTION', $4,
         $5, $6, $7, 'USD', $8, $9::jsonb
       )`,
      [
        applicationId,
        row.employer_tenant_id,
        installment.installment_no,
        SALARY_LOAN_V2_COLLECTION_SCOPE,
        installment.installment_no === 1
          ? "PAYROLL_COLLECTION_PENDING"
          : "SCHEDULED",
        installment.due_date,
        installment.amount_due_minor,
        lenderEventRef,
        JSON.stringify({
          employerTenantId: row.employer_tenant_id,
          employerPayrollRuleVersion: row.employer_payroll_rule_version,
          collectionSequence: installment.installment_no,
          scheduledDueDate: installment.due_date,
          actualDisbursedAt: row.disbursed_at,
          productRuleVersion: row.product_rule_version,
          installmentCount: row.installment_count,
          collectionScope:
            row.collection_mode ?? SALARY_LOAN_V2_COLLECTION_SCOPE,
        }),
      ],
    );
    await client.query(
      `INSERT INTO payroll_collection_events
        (application_id, workflow_version, event_type, source_domain,
         actor_user_ref, payroll_run_date, amount_minor, currency,
         evidence_reference, reason_code, occurred_at)
       VALUES (
         $1, 'SALARY_LOAN_V2', 'PAYROLL_COLLECTION_SCHEDULED', 'LENDER',
         $2, $3, $4, 'USD', $5, 'INSTALLMENT_SCHEDULED', now()
       )`,
      [
        applicationId,
        actorUserRef,
        installment.due_date,
        installment.amount_due_minor,
        lenderEventRef,
      ],
    );
  }
}

async function promoteNextEmployerPayrollCollectionInstruction(
  client: PoolClient,
  applicationId: string,
): Promise<void> {
  await client.query(
    `UPDATE employer_payroll_collection_instructions
        SET projection_status = 'PAYROLL_COLLECTION_PENDING',
            updated_at = now()
      WHERE id = (
        SELECT id
          FROM employer_payroll_collection_instructions
         WHERE application_id = $1
           AND projection_status = 'SCHEDULED'
         ORDER BY repayment_installment_no ASC
         LIMIT 1
      )`,
    [applicationId],
  );
}

async function loadEmployerPayrollCollectionInstructionForUpdate(
  client: PoolClient,
  applicationId: string,
  collectionSequence?: number,
): Promise<
  | undefined
  | Readonly<{
      id: string;
      repayment_installment_no: number;
      projection_status: EmployerPayrollInstructionStatus;
      scheduled_amount_minor: string;
      scheduled_due_date: string;
      collection_scope: SalaryLoanV2CollectionScope;
    }>
> {
  const result = await client.query<{
    id: string;
    repayment_installment_no: number;
    projection_status: EmployerPayrollInstructionStatus;
    scheduled_amount_minor: string;
    scheduled_due_date: string;
    collection_scope: SalaryLoanV2CollectionScope;
  }>(
    `SELECT id,
            repayment_installment_no,
            projection_status,
            scheduled_amount_minor::text,
            scheduled_due_date::text,
            collection_scope
       FROM employer_payroll_collection_instructions
      WHERE application_id = $1
        AND projection_status = 'PAYROLL_COLLECTION_PENDING'
        AND ($2::int IS NULL OR repayment_installment_no = $2)
      ORDER BY repayment_installment_no ASC
      LIMIT 1
      FOR UPDATE`,
    [applicationId, collectionSequence ?? null],
  );
  return result.rows[0];
}

async function markEmployerPayrollInstructionReconciled(
  client: PoolClient,
  applicationId: string,
  collectionSequence: number,
): Promise<void> {
  await client.query(
    `UPDATE employer_payroll_collection_instructions
        SET projection_status = 'RECONCILED',
            updated_at = now()
      WHERE application_id = $1
        AND repayment_installment_no = $2`,
    [applicationId, collectionSequence],
  );
}

function lenderCollectionWorkItemStatusForResult(
  collectionResult: LenderCollectionResult,
): LenderCollectionWorkItemStatus {
  return collectionResult === "COLLECTED" ? "OPEN" : "EXCEPTION";
}

function lenderCollectionExceptionTypeForResult(
  collectionResult: LenderCollectionResult,
): LenderCollectionExceptionType | null {
  switch (collectionResult) {
    case "PARTIALLY_COLLECTED":
      return "PARTIALLY_COLLECTED";
    case "NOT_COLLECTED":
      return "NOT_COLLECTED";
    case "DIRECT_DEBIT_FAILED":
      return "DIRECT_DEBIT_FAILED";
    case "AUTHORIZATION_EXPIRED":
      return "AUTHORIZATION_EXPIRED";
    case "REFUND_REVERSED":
      return "REFUND_REVERSED";
    default:
      return null;
  }
}

async function loadRepaymentPreferenceForUpdate(
  client: PoolClient,
  applicationId: string,
): Promise<
  | undefined
  | Readonly<{
      workflow_version: "LEGACY_V1" | "SALARY_LOAN_V2";
      selected_repayment_method: RepaymentMethod;
    }>
> {
  const result = await client.query<{
    workflow_version: "LEGACY_V1" | "SALARY_LOAN_V2";
    selected_repayment_method: RepaymentMethod;
  }>(
    `SELECT workflow_version, selected_repayment_method
       FROM application_repayment_preferences
      WHERE application_id = $1
      FOR UPDATE`,
    [applicationId],
  );
  return result.rows[0];
}

async function loadWalletProjectionForUpdate(
  client: PoolClient,
  applicationId: string,
): Promise<
  | undefined
  | Readonly<{
      wallet_status: string;
      available_balance_minor: string;
    }>
> {
  const result = await client.query<{
    wallet_status: string;
    available_balance_minor: string;
  }>(
    `SELECT wallet_status, available_balance_minor::text
       FROM lender_wallet_projection_snapshots
      WHERE application_id = $1
      FOR UPDATE`,
    [applicationId],
  );
  return result.rows[0];
}

async function applyLenderWalletProjectionEvent(
  client: PoolClient,
  application: Readonly<{ id: string }>,
  envelope: DomainEventEnvelope,
): Promise<void> {
  const payload = z
    .object({
      externalWalletRef: z.string().min(3).max(128),
      walletStatus: z.enum(["WALLET_AVAILABLE"]),
      availableBalanceMinor: z.string().regex(/^\d+$/),
      currency: z.literal("USD"),
    })
    .strict()
    .parse(envelope.payload);
  await client.query(
    `INSERT INTO lender_wallet_projection_snapshots
       (application_id, external_wallet_ref, wallet_status,
        available_balance_minor, currency, last_callback_event_id,
        last_projected_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now(), now())
     ON CONFLICT (application_id) DO UPDATE SET
       external_wallet_ref = EXCLUDED.external_wallet_ref,
       wallet_status = EXCLUDED.wallet_status,
       available_balance_minor = EXCLUDED.available_balance_minor,
       currency = EXCLUDED.currency,
       last_callback_event_id = EXCLUDED.last_callback_event_id,
       last_projected_at = now(),
       updated_at = now()`,
    [
      application.id,
      payload.externalWalletRef,
      payload.walletStatus,
      payload.availableBalanceMinor,
      payload.currency,
      envelope.eventId,
    ],
  );
  await addAuditEvent(
    client,
    application.id,
    "WALLET_CREDIT_PROJECTED",
    "lender-domain-event",
    {
      externalWalletRef: payload.externalWalletRef,
      availableBalanceMinor: payload.availableBalanceMinor,
      callbackEventId: envelope.eventId,
    },
  );
}

async function applyLenderWalletOperationResultEvent(
  client: PoolClient,
  application: Readonly<{ id: string }>,
  envelope: DomainEventEnvelope,
): Promise<void> {
  const payload = z
    .object({
      externalWalletRef: z.string().min(3).max(128),
      orderRef: z.string().min(3).max(128),
      operationType: z.enum(["WITHDRAWAL", "REPAYMENT"]),
      operationStatus: z.enum([
        "AUTHORIZED",
        "PROCESSING",
        "SETTLED",
        "FAILED",
      ]),
      requestedAmountMinor: z.string().regex(/^\d+$/),
      settledAmountMinor: z.string().regex(/^\d+$/).nullable(),
      currency: z.literal("USD"),
    })
    .strict()
    .parse(envelope.payload);
  await client.query(
    `INSERT INTO lender_wallet_operation_projection_snapshots
       (application_id, order_ref, operation_type, operation_status,
        requested_amount_minor, settled_amount_minor, currency,
        last_callback_event_id, last_projected_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())
     ON CONFLICT (application_id, order_ref) DO UPDATE SET
       operation_status = EXCLUDED.operation_status,
       requested_amount_minor = EXCLUDED.requested_amount_minor,
       settled_amount_minor = EXCLUDED.settled_amount_minor,
       currency = EXCLUDED.currency,
       last_callback_event_id = EXCLUDED.last_callback_event_id,
       last_projected_at = now(),
       updated_at = now()`,
    [
      application.id,
      payload.orderRef,
      payload.operationType,
      payload.operationStatus,
      payload.requestedAmountMinor,
      payload.settledAmountMinor,
      payload.currency,
      envelope.eventId,
    ],
  );
  await addAuditEvent(
    client,
    application.id,
    "WALLET_OPERATION_RESULT_PROJECTED",
    "lender-domain-event",
    {
      orderRef: payload.orderRef,
      operationType: payload.operationType,
      operationStatus: payload.operationStatus,
      callbackEventId: envelope.eventId,
    },
  );
}

async function processIncomingDomainEvent(
  client: PoolClient,
  application: Readonly<{ id: string }>,
  envelope: DomainEventEnvelope,
): Promise<"RECEIVED" | "PROCESSED"> {
  if (envelope.eventType === "WALLET_CREDIT_CONFIRMED") {
    await applyLenderWalletProjectionEvent(client, application, envelope);
    return "PROCESSED";
  }
  if (envelope.eventType === "WALLET_OPERATION_RESULT") {
    await applyLenderWalletOperationResultEvent(client, application, envelope);
    return "PROCESSED";
  }
  return "RECEIVED";
}

async function loadRepaymentInstallmentForCollection(
  client: PoolClient,
  applicationId: string,
  collectionSequence?: number,
): Promise<
  | undefined
  | Readonly<{
      installment_no: number;
      status: string;
      amount_due_minor: string;
    }>
> {
  const result = await client.query<{
    installment_no: number;
    status: string;
    amount_due_minor: string;
  }>(
    `SELECT installment_no, status, amount_due_minor::text
       FROM repayment_installments
      WHERE application_id = $1
        AND ($2::int IS NULL OR installment_no = $2)
      ORDER BY CASE WHEN status = 'PENDING' THEN 0 ELSE 1 END,
               installment_no ASC
      LIMIT 1
      FOR UPDATE`,
    [applicationId, collectionSequence ?? null],
  );
  return result.rows[0];
}

async function queueBrokerToLenderCollectionEvent(
  client: PoolClient,
  application: ApplicationRow,
  args: Readonly<{
    sourceType: LenderCollectionSourceType;
    collectionResult: LenderCollectionResult;
    collectionSequence: number;
    selectedRepaymentMethod: RepaymentMethod;
    actualCollectedAmountMinor: string;
    evidenceReference: string;
    sourceReference: string;
    reasonCode: string;
  }>,
): Promise<void> {
  const eventType =
    args.collectionResult === "COLLECTED"
      ? "COLLECTION_ACCEPTED"
      : "COLLECTION_EXCEPTION";
  const envelope = createOutgoingDomainEvent({
    eventId: `evt_${randomUUID()}`,
    eventType,
    sourceDomain: "BROKER",
    occurredAt: new Date().toISOString(),
    idempotencyKey: `idem_${randomUUID()}`,
    externalApplicationRef: application.application_no,
    payload: {
      applicationNo: application.application_no,
      collectionSequence: args.collectionSequence,
      selectedRepaymentMethod: args.selectedRepaymentMethod,
      sourceType: args.sourceType,
      collectionResult: args.collectionResult,
      actualCollectedAmountMinor: args.actualCollectedAmountMinor,
      evidenceReference: args.evidenceReference,
      sourceReference: args.sourceReference,
      reasonCode: args.reasonCode,
    },
  });
  await client.query(
    `INSERT INTO domain_event_outbox
      (event_id, event_type, source_domain, target_domain, external_application_ref,
       idempotency_key, occurred_at, payload, payload_sha256,
       signature_algorithm, signature_key_id)
     VALUES ($1, $2, 'BROKER', 'LENDER', $3, $4, $5, $6::jsonb, $7, 'HMAC-SHA256', 'broker-hmac-v1')`,
    [
      envelope.eventId,
      envelope.eventType,
      envelope.externalApplicationRef,
      envelope.idempotencyKey,
      envelope.occurredAt,
      JSON.stringify(envelope.payload),
      envelope.payloadSha256,
    ],
  );
}

async function createLenderCollectionWorkItem(
  client: PoolClient,
  application: ApplicationRow,
  actorUserRef: string,
  args: Readonly<{
    sourceType: LenderCollectionSourceType;
    collectionResult: LenderCollectionResult;
    actualCollectedAmountMinor: string;
    evidenceReference: string;
    sourceReference: string;
    reasonCode: string;
    collectionSequence?: number;
    metadata?: Record<string, unknown>;
  }>,
): Promise<
  Readonly<{
    workItemId: string;
    collectionSequence: number;
    workItemStatus: LenderCollectionWorkItemStatus;
    exceptionId: string | null;
    selectedRepaymentMethod: RepaymentMethod;
  }>
> {
  const preference = await loadRepaymentPreferenceForUpdate(
    client,
    application.id,
  );
  if (
    !preference ||
    preference.workflow_version !== "SALARY_LOAN_V2" ||
    application.workflow_version !== "SALARY_LOAN_V2"
  ) {
    throw new Error("V2 repayment preference is required for collection work");
  }
  if (
    (args.sourceType === "EMPLOYER_PAYROLL_REPORT" &&
      preference.selected_repayment_method !== "EMPLOYER_PAYROLL_DEDUCTION") ||
    (args.sourceType === "USER_DIRECT_DEBIT_REPORT" &&
      preference.selected_repayment_method !== "USER_DIRECT_DEBIT") ||
    (args.sourceType === "USER_MANUAL_PAYMENT_PROOF" &&
      preference.selected_repayment_method !== "USER_MANUAL_PAYMENT")
  ) {
    throw new Error("COLLECTION_SOURCE_REPAYMENT_METHOD_MISMATCH");
  }
  const installment = await loadRepaymentInstallmentForCollection(
    client,
    application.id,
    args.collectionSequence,
  );
  if (!installment) {
    throw new Error("COLLECTION_INSTALLMENT_NOT_FOUND");
  }
  const workItemStatus = lenderCollectionWorkItemStatusForResult(
    args.collectionResult,
  );
  const exceptionType = lenderCollectionExceptionTypeForResult(
    args.collectionResult,
  );
  const inserted = await client.query<{
    id: string;
    repayment_installment_no: number;
    work_item_status: LenderCollectionWorkItemStatus;
  }>(
    `INSERT INTO lender_collection_work_items
      (application_id, workflow_version, repayment_installment_no,
       selected_repayment_method, source_type, source_reference, source_domain,
       collection_result, reported_amount_minor, currency, work_item_status,
       exception_code, evidence_reference, metadata)
     VALUES (
       $1, 'SALARY_LOAN_V2', $2, $3, $4, $5, 'BROKER',
       $6, $7, 'USD', $8, $9, $10, $11::jsonb
     )
     RETURNING id, repayment_installment_no, work_item_status`,
    [
      application.id,
      installment.installment_no,
      preference.selected_repayment_method,
      args.sourceType,
      args.sourceReference,
      args.collectionResult,
      args.actualCollectedAmountMinor,
      workItemStatus,
      exceptionType,
      args.evidenceReference,
      JSON.stringify({
        actorUserRef,
        reasonCode: args.reasonCode,
        installmentStatus: installment.status,
        ...args.metadata,
      }),
    ],
  );
  let exceptionId: string | null = null;
  if (exceptionType) {
    const exception = await client.query<{ id: string }>(
      `INSERT INTO lender_collection_exceptions
        (work_item_id, application_id, workflow_version,
         repayment_installment_no, selected_repayment_method, exception_type,
         reason_code, evidence_reference, reported_amount_minor, currency)
       VALUES (
         $1, $2, 'SALARY_LOAN_V2', $3, $4, $5, $6, $7, $8, 'USD'
       )
       RETURNING id`,
      [
        inserted.rows[0]!.id,
        application.id,
        installment.installment_no,
        preference.selected_repayment_method,
        exceptionType,
        args.reasonCode,
        args.evidenceReference,
        args.actualCollectedAmountMinor,
      ],
    );
    exceptionId = exception.rows[0]!.id;
  }
  await queueBrokerToLenderCollectionEvent(client, application, {
    sourceType: args.sourceType,
    collectionResult: args.collectionResult,
    collectionSequence: installment.installment_no,
    selectedRepaymentMethod: preference.selected_repayment_method,
    actualCollectedAmountMinor: args.actualCollectedAmountMinor,
    evidenceReference: args.evidenceReference,
    sourceReference: args.sourceReference,
    reasonCode: args.reasonCode,
  });
  return {
    workItemId: inserted.rows[0]!.id,
    collectionSequence: inserted.rows[0]!.repayment_installment_no,
    workItemStatus: inserted.rows[0]!.work_item_status,
    exceptionId,
    selectedRepaymentMethod: preference.selected_repayment_method,
  };
}

async function loadActiveLenderCollectionWorkItemForInstallment(
  client: PoolClient,
  applicationId: string,
  collectionSequence: number,
): Promise<
  | undefined
  | Readonly<{
      id: string;
      work_item_status: LenderCollectionWorkItemStatus;
    }>
> {
  const result = await client.query<{
    id: string;
    work_item_status: LenderCollectionWorkItemStatus;
  }>(
    `SELECT id, work_item_status
       FROM lender_collection_work_items
      WHERE application_id = $1
        AND repayment_installment_no = $2
        AND work_item_status IN ('OPEN', 'PROCESSING')
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE`,
    [applicationId, collectionSequence],
  );
  return result.rows[0];
}

async function loadLoanDetails(
  applicationId: string,
  workflowVersion?: "LEGACY_V1" | "SALARY_LOAN_V2",
): Promise<{
  terms: null | {
    approvedAmountMinor: string;
    serviceFeeMinor: string;
    totalRepayableMinor: string;
    installmentCount: number;
    firstDueDate: string;
  };
  quote: null | {
    principalAmountMinor: string;
    actualDisbursementAmountMinor: string;
    lenderInterestMinor: string;
    totalRepaymentAmountMinor: string;
    brokerageRemunerationReceivableMinor: string;
    productRuleVersion: string;
    brokerageRemunerationRuleVersion: string;
    lenderInterestRuleVersion: string;
    installmentCount: number;
    firstDueDate: string;
    repaymentGraceDays: number;
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
    principal_due_minor: string;
    lender_interest_due_minor: string;
    payroll_node_ref: string | null;
    amount_paid_minor: string;
    status: "PENDING" | "PAID";
  }>(
    `SELECT installment_no, due_date::text, amount_due_minor::text,
            principal_due_minor::text, lender_interest_due_minor::text,
            payroll_node_ref, amount_paid_minor::text, status
       FROM repayment_installments WHERE application_id = $1 ORDER BY installment_no ASC`,
    [applicationId],
  );
  const quoteSnapshots = await pool.query<{
    principal_amount_minor: string;
    actual_disbursement_amount_minor: string;
    lender_interest_minor: string;
    total_repayment_amount_minor: string;
    brokerage_remuneration_receivable_minor: string;
    product_rule_version: string;
    brokerage_remuneration_rule_version: string;
    lender_interest_rule_version: string;
    installment_count: number;
    first_due_date: string;
    repayment_grace_days: number;
  }>(
    `SELECT principal_amount_minor::text, actual_disbursement_amount_minor::text,
            lender_interest_minor::text, total_repayment_amount_minor::text,
            brokerage_remuneration_receivable_minor::text, product_rule_version,
            brokerage_remuneration_rule_version, lender_interest_rule_version,
            installment_count, first_due_date::text, repayment_grace_days
       FROM application_v2_quote_snapshots
      WHERE application_id = $1`,
    [applicationId],
  );
  const schedule: RepaymentScheduleItem[] = installments.rows.map((item) => ({
    installmentNo: item.installment_no,
    dueDate: item.due_date,
    amountDueMinor: item.amount_due_minor,
    principalDueMinor: item.principal_due_minor,
    lenderInterestDueMinor: item.lender_interest_due_minor,
    payrollNodeRef: item.payroll_node_ref,
    amountPaidMinor: item.amount_paid_minor,
    status: item.status,
  }));
  const term = terms.rows[0];
  const quote = quoteSnapshots.rows[0];
  return {
    terms:
      workflowVersion === "SALARY_LOAN_V2" && quote
        ? null
        : term
          ? {
              approvedAmountMinor: term.approved_amount_minor,
              serviceFeeMinor: term.service_fee_minor,
              totalRepayableMinor: term.total_repayable_minor,
              installmentCount: term.installment_count,
              firstDueDate: term.first_due_date,
            }
          : null,
    quote: quote
      ? {
          principalAmountMinor: quote.principal_amount_minor,
          actualDisbursementAmountMinor: quote.actual_disbursement_amount_minor,
          lenderInterestMinor: quote.lender_interest_minor,
          totalRepaymentAmountMinor: quote.total_repayment_amount_minor,
          brokerageRemunerationReceivableMinor:
            quote.brokerage_remuneration_receivable_minor,
          productRuleVersion: quote.product_rule_version,
          brokerageRemunerationRuleVersion:
            quote.brokerage_remuneration_rule_version,
          lenderInterestRuleVersion: quote.lender_interest_rule_version,
          installmentCount: quote.installment_count,
          firstDueDate: quote.first_due_date,
          repaymentGraceDays: quote.repayment_grace_days,
        }
      : null,
    repayment: summarizeRepaymentSchedule(schedule),
  };
}

async function loadApplicantExperienceData(applicationId: string): Promise<{
  repaymentProof: null | {
    proofNo: string;
    status: "UNDER_REVIEW" | "NEEDS_MORE" | "RECONCILED" | "EXCEPTION";
    fileName: string;
    contentType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
    transferReference?: string;
    submittedAt: string;
  };
  reassessmentRequest: null | {
    requestNo: string;
    status: "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "DECLINED" | "CLOSED";
    addressChanged: boolean;
    employerUpdated: boolean;
    wealthProofDeclared: boolean;
    submittedAt: string;
  };
}> {
  const latestProof = await pool.query<{
    proof_no: string;
    status: "UNDER_REVIEW" | "NEEDS_MORE" | "RECONCILED" | "EXCEPTION";
    file_name: string;
    content_type: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
    transfer_reference: string | null;
    submitted_at: string;
  }>(
    `SELECT proof_no, status, file_name, content_type, transfer_reference, submitted_at::text
       FROM applicant_payment_proofs
      WHERE application_id = $1
      ORDER BY submitted_at DESC
      LIMIT 1`,
    [applicationId],
  );
  const latestRequest = await pool.query<{
    request_no: string;
    status: "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "DECLINED" | "CLOSED";
    address_changed: boolean;
    employer_updated: boolean;
    wealth_proof_declared: boolean;
    created_at: string;
  }>(
    `SELECT request_no, status, address_changed, employer_updated,
            wealth_proof_declared, created_at::text
       FROM applicant_reassessment_requests
      WHERE application_id = $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [applicationId],
  );
  return {
    repaymentProof: latestProof.rows[0]
      ? {
          proofNo: latestProof.rows[0]!.proof_no,
          status: latestProof.rows[0]!.status,
          fileName: latestProof.rows[0]!.file_name,
          contentType: latestProof.rows[0]!.content_type,
          ...(latestProof.rows[0]!.transfer_reference
            ? { transferReference: latestProof.rows[0]!.transfer_reference }
            : {}),
          submittedAt: latestProof.rows[0]!.submitted_at,
        }
      : null,
    reassessmentRequest: latestRequest.rows[0]
      ? {
          requestNo: latestRequest.rows[0]!.request_no,
          status: latestRequest.rows[0]!.status,
          addressChanged: latestRequest.rows[0]!.address_changed,
          employerUpdated: latestRequest.rows[0]!.employer_updated,
          wealthProofDeclared: latestRequest.rows[0]!.wealth_proof_declared,
          submittedAt: latestRequest.rows[0]!.created_at,
        }
      : null,
  };
}

async function loadApplicantTimeline(applicationId: string): Promise<
  Array<{
    occurredAt: string;
    entryType:
      | "STATUS"
      | "APPROVAL"
      | "PAYMENT_PROOF_SUBMITTED"
      | "PAYMENT_PROOF_REVIEWED"
      | "REASSESSMENT_SUBMITTED"
      | "REASSESSMENT_APPROVAL";
    status?: string;
    stage?: string;
    decision?: string;
    actorUserRef?: string;
    actorRole?: string;
    reasonCode?: string;
    referenceNo?: string;
  }>
> {
  const rows = await pool.query<{
    occurred_at: string;
    entry_type:
      | "STATUS"
      | "APPROVAL"
      | "PAYMENT_PROOF_SUBMITTED"
      | "PAYMENT_PROOF_REVIEWED"
      | "REASSESSMENT_SUBMITTED"
      | "REASSESSMENT_APPROVAL";
    status: string | null;
    stage: string | null;
    decision: string | null;
    actor_user_ref: string | null;
    actor_role: string | null;
    reason_code: string | null;
    reference_no: string | null;
  }>(
    `SELECT occurred_at::text, entry_type, status, stage, decision, actor_user_ref,
            actor_role, reason_code, reference_no
       FROM (
         SELECT e.occurred_at, 'STATUS'::text AS entry_type, e.to_status AS status,
                NULL::text AS stage, NULL::text AS decision, e.actor_user_ref,
                NULL::text AS actor_role, e.reason_code, NULL::text AS reference_no
           FROM application_status_events e
          WHERE e.application_id = $1
         UNION ALL
         SELECT e.occurred_at, 'APPROVAL'::text AS entry_type, NULL::text AS status,
                e.stage, e.decision, e.actor_user_ref, e.actor_role, e.reason_code,
                NULL::text AS reference_no
           FROM approval_events e
          WHERE e.application_id = $1
         UNION ALL
         SELECT p.submitted_at, 'PAYMENT_PROOF_SUBMITTED'::text AS entry_type,
                p.status, NULL::text AS stage, NULL::text AS decision,
                NULL::text AS actor_user_ref, NULL::text AS actor_role,
                NULL::text AS reason_code, p.proof_no
           FROM applicant_payment_proofs p
          WHERE p.application_id = $1
         UNION ALL
         SELECT p.reviewed_at, 'PAYMENT_PROOF_REVIEWED'::text AS entry_type,
                p.status, NULL::text AS stage, NULL::text AS decision,
                p.reviewed_by_user_ref, NULL::text AS actor_role,
                p.review_reason_code, p.proof_no
           FROM applicant_payment_proofs p
          WHERE p.application_id = $1 AND p.reviewed_at IS NOT NULL
         UNION ALL
         SELECT r.created_at, 'REASSESSMENT_SUBMITTED'::text AS entry_type,
                r.status, NULL::text AS stage, NULL::text AS decision,
                NULL::text AS actor_user_ref, NULL::text AS actor_role,
                NULL::text AS reason_code, r.request_no
           FROM applicant_reassessment_requests r
          WHERE r.application_id = $1
         UNION ALL
         SELECT e.occurred_at, 'REASSESSMENT_APPROVAL'::text AS entry_type,
                NULL::text AS status, e.step, e.action AS decision,
                e.actor_user_ref, e.actor_role, e.reason_code, r.request_no
           FROM applicant_reassessment_requests r
           JOIN approval_case_events e ON e.approval_case_id = r.approval_case_id
          WHERE r.application_id = $1
       ) timeline
      ORDER BY occurred_at DESC`,
    [applicationId],
  );
  return rows.rows.map((row) => ({
    occurredAt: row.occurred_at,
    entryType: row.entry_type,
    ...(row.status ? { status: row.status } : {}),
    ...(row.stage ? { stage: row.stage } : {}),
    ...(row.decision ? { decision: row.decision } : {}),
    ...(row.actor_user_ref ? { actorUserRef: row.actor_user_ref } : {}),
    ...(row.actor_role ? { actorRole: row.actor_role } : {}),
    ...(row.reason_code ? { reasonCode: row.reason_code } : {}),
    ...(row.reference_no ? { referenceNo: row.reference_no } : {}),
  }));
}

async function loadApplicantNotifications(
  userId: string,
): Promise<ApplicantNotification[]> {
  const applications = await pool.query<{ id: string; application_no: string }>(
    `SELECT id, application_no
       FROM applications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 20`,
    [userId],
  );
  const timelineGroups = await Promise.all(
    applications.rows.map(async (application) => {
      const timeline = await loadApplicantTimeline(application.id);
      return timeline.map<ApplicantNotificationTimelineRow>((entry) => ({
        applicationNo: application.application_no,
        occurredAt: entry.occurredAt,
        entryType: entry.entryType,
        ...(entry.status ? { status: entry.status } : {}),
        ...(entry.stage ? { stage: entry.stage } : {}),
        ...(entry.decision ? { decision: entry.decision } : {}),
        ...(entry.reasonCode ? { reasonCode: entry.reasonCode } : {}),
        ...(entry.referenceNo ? { referenceNo: entry.referenceNo } : {}),
      }));
    }),
  );
  const timelineRows = timelineGroups
    .flat()
    .sort(
      (left, right) =>
        new Date(right.occurredAt).getTime() -
        new Date(left.occurredAt).getTime(),
    )
    .slice(0, 50);
  if (timelineRows.length === 0) return [];
  const notificationIds = timelineRows.map((row) =>
    buildApplicantNotificationId(row),
  );
  const readRows = await pool.query<{
    notification_id: string;
    read_at: string;
  }>(
    `SELECT notification_id, read_at::text
       FROM applicant_notification_reads
      WHERE user_id = $1
        AND notification_id = ANY($2::text[])`,
    [userId, notificationIds],
  );
  const readAtByNotificationId = new Map(
    readRows.rows.map((row) => [row.notification_id, row.read_at]),
  );
  return timelineRows.map((row) =>
    buildApplicantNotification(
      row,
      readAtByNotificationId.get(buildApplicantNotificationId(row)),
    ),
  );
}

function paginateApplicantNotifications(
  notifications: readonly ApplicantNotification[],
  page: number,
  pageSize: number,
): Readonly<{
  items: ApplicantNotification[];
  itemCount: number;
  pageCount: number;
  unreadCount: number;
}> {
  const itemCount = notifications.length;
  const pageCount = Math.max(1, Math.ceil(itemCount / pageSize));
  const normalizedPage = Math.min(Math.max(1, page), pageCount);
  return {
    items: notifications.slice(
      (normalizedPage - 1) * pageSize,
      normalizedPage * pageSize,
    ),
    itemCount,
    pageCount,
    unreadCount: notifications.filter((item) => item.unread).length,
  };
}

async function lockPaymentProof(
  client: PoolClient,
  proofNo: string,
): Promise<
  | undefined
  | {
      id: string;
      application_id: string;
      proof_no: string;
      status: "UNDER_REVIEW" | "NEEDS_MORE" | "RECONCILED" | "EXCEPTION";
      file_name: string;
      content_type:
        "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
      file_content_encrypted: Buffer;
      transfer_reference: string | null;
      submitted_at: string;
    }
> {
  const result = await client.query<{
    id: string;
    application_id: string;
    proof_no: string;
    status: "UNDER_REVIEW" | "NEEDS_MORE" | "RECONCILED" | "EXCEPTION";
    file_name: string;
    content_type: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
    file_content_encrypted: Buffer;
    transfer_reference: string | null;
    submitted_at: string;
  }>(
    `SELECT id, application_id, proof_no, status, file_name, content_type,
            file_content_encrypted, transfer_reference, submitted_at::text
       FROM applicant_payment_proofs
      WHERE proof_no = $1
      FOR UPDATE`,
    [proofNo],
  );
  return result.rows[0];
}

async function lockReassessmentRequest(
  client: PoolClient,
  requestNo: string,
): Promise<
  | undefined
  | {
      id: string;
      application_id: string;
      request_no: string;
      status: "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "DECLINED" | "CLOSED";
      approval_case_id: string | null;
      note_encrypted: Buffer | null;
      address_changed: boolean;
      employer_updated: boolean;
      wealth_proof_declared: boolean;
      created_at: string;
    }
> {
  const result = await client.query<{
    id: string;
    application_id: string;
    request_no: string;
    status: "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "DECLINED" | "CLOSED";
    approval_case_id: string | null;
    note_encrypted: Buffer | null;
    address_changed: boolean;
    employer_updated: boolean;
    wealth_proof_declared: boolean;
    created_at: string;
  }>(
    `SELECT id, application_id, request_no, status, approval_case_id, note_encrypted,
            address_changed, employer_updated, wealth_proof_declared,
            created_at::text
       FROM applicant_reassessment_requests
      WHERE request_no = $1
      FOR UPDATE`,
    [requestNo],
  );
  return result.rows[0];
}

async function recordDomainEventDeadLetter(
  client: PoolClient,
  args: {
    eventId: string;
    eventType: string;
    sourceDomain: "BROKER" | "LENDER";
    targetDomain: "BROKER" | "LENDER";
    externalApplicationRef: string;
    failureStage: "VALIDATION" | "AUTHENTICATION" | "ORDERING" | "PROCESSING";
    failureCode: string;
    payloadSha256: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO domain_event_dead_letters
      (event_id, event_type, source_domain, target_domain,
       external_application_ref, failure_stage, failure_code,
       payload_sha256, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
    [
      args.eventId,
      args.eventType,
      args.sourceDomain,
      args.targetDomain,
      args.externalApplicationRef,
      args.failureStage,
      args.failureCode,
      args.payloadSha256,
      JSON.stringify(args.payload),
    ],
  );
}

async function lookupApplicationProjectionForDomainEvent(
  client: PoolClient,
  externalApplicationRef: string,
): Promise<
  | undefined
  | Readonly<{
      id: string;
      status: string;
      workflow_version: "LEGACY_V1" | "SALARY_LOAN_V2";
    }>
> {
  const result = await client.query<{
    id: string;
    status: string;
    workflow_version: "LEGACY_V1" | "SALARY_LOAN_V2";
  }>(
    `SELECT id, status, workflow_version
       FROM applications
      WHERE application_no = $1
      LIMIT 1`,
    [externalApplicationRef],
  );
  return result.rows[0];
}

function incomingDomainEventOrderingError(
  eventType: string,
  applicationStatus: string | undefined,
): string | undefined {
  if (eventType === "DISBURSEMENT_CONFIRMED") {
    return applicationStatus === "DISBURSEMENT_PENDING"
      ? undefined
      : "EVENT_OUT_OF_ORDER__DISBURSEMENT";
  }
  if (eventType === "WALLET_CREDIT_CONFIRMED") {
    return ["DISBURSED", "REPAYMENT_ACTIVE"].includes(applicationStatus ?? "")
      ? undefined
      : "EVENT_OUT_OF_ORDER__WALLET_CREDIT";
  }
  if (eventType === "WALLET_OPERATION_RESULT") {
    return ["DISBURSED", "REPAYMENT_ACTIVE", "COLLECTION_EXCEPTION"].includes(
      applicationStatus ?? "",
    )
      ? undefined
      : "EVENT_OUT_OF_ORDER__WALLET_OPERATION";
  }
  if (
    eventType === "COLLECTION_ACCEPTED" ||
    eventType === "COLLECTION_EXCEPTION"
  ) {
    return ["DISBURSED", "REPAYMENT_ACTIVE", "COLLECTION_EXCEPTION"].includes(
      applicationStatus ?? "",
    )
      ? undefined
      : "EVENT_OUT_OF_ORDER__COLLECTION";
  }
  return undefined;
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

app.get("/v1/local/domain-events/outbox", async (request, reply) => {
  if (!requireRole(request, reply, "BROKER_OFFICER")) return;
  const rows = await pool.query<{
    event_id: string;
    event_type: string;
    target_domain: string;
    external_application_ref: string;
    delivery_status: string;
    delivery_attempt_count: number;
    occurred_at: string;
    created_at: string;
  }>(
    `SELECT event_id, event_type, target_domain, external_application_ref,
            delivery_status, delivery_attempt_count, occurred_at::text,
            created_at::text
       FROM domain_event_outbox
      ORDER BY created_at DESC
      LIMIT 50`,
  );
  return { items: rows.rows };
});

app.post("/v1/local/domain-events/outbox", async (request, reply) => {
  if (!requireRole(request, reply, "BROKER_OFFICER")) return;
  const domainEventOutboxCreateSchema = z.object({
    eventId: z.string().min(8).max(80).optional(),
    eventType: z.enum(DOMAIN_EVENT_TYPES),
    externalApplicationRef: z.string().min(3).max(128),
    payload: z.record(z.string(), z.unknown()),
    idempotencyKey: z.string().min(8).max(128).optional(),
  });
  const input = domainEventOutboxCreateSchema.parse(request.body);
  const envelope = createOutgoingDomainEvent({
    eventId: input.eventId ?? `evt_${randomUUID()}`,
    eventType: input.eventType,
    sourceDomain: "BROKER",
    occurredAt: new Date().toISOString(),
    idempotencyKey: input.idempotencyKey ?? `idem_${randomUUID()}`,
    externalApplicationRef: input.externalApplicationRef,
    payload: input.payload,
  });
  const secret = configuredDomainEventSharedSecrets()["broker-hmac-v1"]!;
  const timestampMillis = String(Date.now());
  const nonce = `nonce_${randomUUID()}`;
  const transportBodySha256 = sha256Hex(stableJson(envelope));
  const signature = signDomainEventRequest({
    method: "POST",
    path: "/v1/local/domain-events/inbox/receive",
    timestampMillis,
    nonce,
    keyId: "broker-hmac-v1",
    bodySha256: transportBodySha256,
    secret: secret.secret,
  });
  await pool.query(
    `INSERT INTO domain_event_outbox
      (event_id, event_type, source_domain, target_domain, external_application_ref,
       idempotency_key, occurred_at, payload, payload_sha256,
       signature_algorithm, signature_key_id)
     VALUES ($1, $2, 'BROKER', 'LENDER', $3, $4, $5, $6::jsonb, $7, 'HMAC-SHA256', 'broker-hmac-v1')`,
    [
      envelope.eventId,
      envelope.eventType,
      envelope.externalApplicationRef,
      envelope.idempotencyKey,
      envelope.occurredAt,
      JSON.stringify(envelope.payload),
      envelope.payloadSha256,
    ],
  );
  return reply.code(201).send({
    event: envelope,
    transport: {
      method: "POST",
      path: "/v1/local/domain-events/inbox/receive",
      headers: {
        "x-payease-algo": "HMAC-SHA256",
        "x-payease-key-id": "broker-hmac-v1",
        "x-payease-timestamp-millis": timestampMillis,
        "x-payease-nonce": nonce,
        "x-payease-signature": signature,
      },
    },
  });
});

app.get("/v1/local/domain-events/inbox", async (request, reply) => {
  if (!requireRole(request, reply, "BROKER_OFFICER")) return;
  const rows = await pool.query<{
    event_id: string;
    event_type: string;
    source_domain: string;
    external_application_ref: string;
    processing_status: string;
    processing_error_code: string | null;
    received_at: string;
  }>(
    `SELECT event_id, event_type, source_domain, external_application_ref,
            processing_status, processing_error_code, received_at::text
       FROM domain_event_inbox
      ORDER BY received_at DESC
      LIMIT 50`,
  );
  return { items: rows.rows };
});

const handleIncomingDomainEvent = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  if (!requireBrokerInternalMtls(request, reply)) return;
  const envelope = domainEventEnvelopeSchema.parse(request.body);
  const headers = domainEventHeadersSchema.parse({
    algorithm: requestHeaderValue(request.headers["x-payease-algo"]),
    keyId: requestHeaderValue(request.headers["x-payease-key-id"]),
    nonce: requestHeaderValue(request.headers["x-payease-nonce"]),
    timestampMillis: requestHeaderValue(
      request.headers["x-payease-timestamp-millis"],
    ),
    signature: requestHeaderValue(request.headers["x-payease-signature"]),
  });
  if (envelope.sourceDomain !== "LENDER") {
    return reply.code(403).send({ code: "DOMAIN_EVENT_SOURCE_FORBIDDEN" });
  }
  if (
    !isDomainEventTimestampWithinWindow({
      timestampMillis: headers.timestampMillis,
    })
  ) {
    return reply.code(408).send({ code: "DOMAIN_EVENT_STALE_TIMESTAMP" });
  }
  const transportBodySha256 = sha256Hex(stableJson(envelope));
  if (
    !verifyDomainEventSignature({
      method: "POST",
      path: "/v1/local/domain-events/inbox/receive",
      headers,
      bodySha256: transportBodySha256,
      sourceDomain: envelope.sourceDomain,
    })
  ) {
    return reply.code(401).send({ code: "DOMAIN_EVENT_BAD_SIGNATURE" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const duplicate = await client.query<{
      payload_sha256: string;
      processing_status: string;
    }>(
      `SELECT payload_sha256, processing_status
         FROM domain_event_inbox
        WHERE event_id = $1`,
      [envelope.eventId],
    );
    if (duplicate.rowCount) {
      if (duplicate.rows[0]!.payload_sha256 !== envelope.payloadSha256) {
        await client.query("ROLLBACK");
        return reply.code(409).send({ code: "DOMAIN_EVENT_ID_REUSED" });
      }
      await client.query("ROLLBACK");
      return reply.code(202).send({
        accepted: true,
        duplicate: true,
        processingStatus: duplicate.rows[0]!.processing_status,
      });
    }
    const nonceGuard = await client.query(
      `INSERT INTO domain_event_nonce_guards
        (source_domain, nonce, event_id, expires_at)
       VALUES ($1, $2, $3, now() + interval '5 minutes')
       ON CONFLICT DO NOTHING`,
      [envelope.sourceDomain, headers.nonce, envelope.eventId],
    );
    if (!nonceGuard.rowCount) {
      await client.query("ROLLBACK");
      return reply.code(409).send({ code: "DOMAIN_EVENT_NONCE_REPLAY" });
    }
    const application = await lookupApplicationProjectionForDomainEvent(
      client,
      envelope.externalApplicationRef,
    );
    const orderingError = !application
      ? "DOMAIN_EVENT_APPLICATION_NOT_FOUND"
      : incomingDomainEventOrderingError(
          envelope.eventType,
          application.status,
        );
    let processingStatus: "RECEIVED" | "PROCESSED" | "DEAD_LETTER" =
      orderingError ? "DEAD_LETTER" : "RECEIVED";
    await client.query(
      `INSERT INTO domain_event_inbox
        (event_id, event_type, event_version, source_domain, target_domain,
         external_application_ref, idempotency_key, occurred_at, payload,
         payload_sha256, signature_algorithm, signature_key_id,
         transport_timestamp_millis, transport_nonce, processing_status,
         processing_error_code, raw_headers)
       VALUES (
         $1, $2, $3, $4, 'BROKER', $5, $6, $7, $8::jsonb, $9, $10, $11,
         $12, $13, $14, $15, $16::jsonb
       )`,
      [
        envelope.eventId,
        envelope.eventType,
        envelope.eventVersion,
        envelope.sourceDomain,
        envelope.externalApplicationRef,
        envelope.idempotencyKey,
        envelope.occurredAt,
        JSON.stringify(envelope.payload),
        envelope.payloadSha256,
        headers.algorithm,
        headers.keyId,
        Number(headers.timestampMillis),
        headers.nonce,
        processingStatus,
        orderingError ?? null,
        JSON.stringify({
          algorithm: headers.algorithm,
          keyId: headers.keyId,
          nonce: headers.nonce,
          timestampMillis: headers.timestampMillis,
        }),
      ],
    );
    if (orderingError) {
      await recordDomainEventDeadLetter(client, {
        eventId: envelope.eventId,
        eventType: envelope.eventType,
        sourceDomain: envelope.sourceDomain,
        targetDomain: "BROKER",
        externalApplicationRef: envelope.externalApplicationRef,
        failureStage: !application ? "VALIDATION" : "ORDERING",
        failureCode: orderingError,
        payloadSha256: envelope.payloadSha256,
        payload: envelope.payload,
      });
    } else if (application) {
      processingStatus = await processIncomingDomainEvent(
        client,
        application,
        envelope,
      );
      if (processingStatus === "PROCESSED") {
        await client.query(
          `UPDATE domain_event_inbox
              SET processing_status = 'PROCESSED',
                  processed_at = now()
            WHERE event_id = $1`,
          [envelope.eventId],
        );
      }
    }
    await client.query("COMMIT");
    return reply.code(202).send({
      accepted: true,
      processingStatus,
      ...(orderingError ? { failureCode: orderingError } : {}),
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

if (internalMtlsApp) {
  internalMtlsApp.post(
    "/v1/local/domain-events/inbox/receive",
    handleIncomingDomainEvent,
  );
} else if (process.env.NODE_ENV === "test") {
  app.post("/v1/local/domain-events/inbox/receive", handleIncomingDomainEvent);
}

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

// A factory is a tenant boundary, not a display-only grouping.  OPS_ADMIN is
// the only actor allowed to create a tenant or grant/revoke its staff access.
app.get("/v1/local/admin/employer-tenants", async (request, reply) => {
  if (!(await requireOpsAdmin(request, reply))) return;
  const result = await pool.query(
    `SELECT id, external_ref AS "externalRef", display_name AS "displayName", is_active AS "isActive"
       FROM employer_tenants ORDER BY display_name`,
  );
  return { tenants: result.rows };
});

app.post("/v1/local/admin/employer-tenants", async (request, reply) => {
  if (!(await requireOpsAdmin(request, reply))) return;
  const input = employerTenantCreateSchema.parse(request.body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const created = await client.query<{
      id: string;
      external_ref: string;
      display_name: string;
    }>(
      `INSERT INTO employer_tenants (external_ref, display_name)
       VALUES ($1, $2) RETURNING id, external_ref, display_name`,
      [input.externalRef, input.displayName],
    );
    await addAuditEvent(
      client,
      created.rows[0]!.id,
      "EMPLOYER_TENANT_CREATED",
      request.adminIdentity!.loginName,
      { externalRef: input.externalRef },
      "EMPLOYER_TENANT",
    );
    await client.query("COMMIT");
    return reply.code(201).send({
      id: created.rows[0]!.id,
      externalRef: created.rows[0]!.external_ref,
      displayName: created.rows[0]!.display_name,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

// Deactivation is a real access boundary: it stops new applicant selection
// and freezes all employer-side verification work for that factory.
app.patch(
  "/v1/local/admin/employer-tenants/:tenantId/activity",
  async (request, reply) => {
    if (!(await requireOpsAdmin(request, reply))) return;
    const params = z
      .object({ tenantId: z.string().uuid() })
      .parse(request.params);
    const input = adminAccountActivitySchema.parse(request.body);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const tenant = await client.query<{
        id: string;
        external_ref: string;
        is_active: boolean;
      }>(
        `UPDATE employer_tenants SET is_active = $1, updated_at = now()
          WHERE id = $2 RETURNING id, external_ref, is_active`,
        [input.isActive, params.tenantId],
      );
      const row = tenant.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ code: "EMPLOYER_TENANT_NOT_FOUND" });
      }
      await addAuditEvent(
        client,
        row.id,
        row.is_active
          ? "EMPLOYER_TENANT_REACTIVATED"
          : "EMPLOYER_TENANT_DEACTIVATED",
        request.adminIdentity!.loginName,
        { externalRef: row.external_ref },
        "EMPLOYER_TENANT",
      );
      await client.query("COMMIT");
      return { id: row.id, isActive: row.is_active };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
);

// This directory contains only back-office login names and role codes.  It
// intentionally never joins applications, personal profiles or identity
// documents: a tenant administrator needs to review access, not applicant
// data, in order to revoke a mistaken factory assignment.
app.get(
  "/v1/local/admin/employer-tenants/:tenantId/members",
  async (request, reply) => {
    if (!(await requireOpsAdmin(request, reply))) return;
    const params = z
      .object({ tenantId: z.string().uuid() })
      .parse(request.params);
    const tenant = await pool.query(
      "SELECT 1 FROM employer_tenants WHERE id = $1",
      [params.tenantId],
    );
    if (!tenant.rowCount) {
      return reply.code(404).send({ code: "EMPLOYER_TENANT_NOT_FOUND" });
    }
    const members = await pool.query<{
      loginName: string;
      roleCodes: string[];
    }>(
      `SELECT a.login_name AS "loginName",
              COALESCE(array_agg(r.code ORDER BY r.code) FILTER (WHERE r.code IS NOT NULL), '{}') AS "roleCodes"
         FROM employer_tenant_members m
         JOIN admin_accounts a ON a.id = m.account_id
         LEFT JOIN admin_account_roles ar ON ar.account_id = a.id
         LEFT JOIN roles r ON r.id = ar.role_id
        WHERE m.employer_tenant_id = $1
        GROUP BY a.id, a.login_name
        ORDER BY a.login_name`,
      [params.tenantId],
    );
    return { members: members.rows };
  },
);

app.put(
  "/v1/local/admin/employer-tenants/:tenantId/members/:loginName",
  async (request, reply) => {
    if (!(await requireOpsAdmin(request, reply))) return;
    const params = z
      .object({
        tenantId: z.string().uuid(),
        loginName: z.string().regex(/^[a-z0-9._-]{3,64}$/),
      })
      .parse(request.params);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const account = await client.query<{ id: string }>(
        `SELECT a.id
           FROM admin_accounts a JOIN departments d ON d.id = a.department_id
          WHERE a.login_name = $1 AND a.is_active = true AND d.domain = 'EMPLOYER'
          FOR KEY SHARE`,
        [params.loginName],
      );
      if (!account.rowCount) {
        await client.query("ROLLBACK");
        return reply.code(422).send({ code: "EMPLOYER_ACCOUNT_REQUIRED" });
      }
      const tenant = await client.query(
        "SELECT 1 FROM employer_tenants WHERE id = $1 FOR KEY SHARE",
        [params.tenantId],
      );
      if (!tenant.rowCount) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ code: "EMPLOYER_TENANT_NOT_FOUND" });
      }
      await client.query(
        `INSERT INTO employer_tenant_members (employer_tenant_id, account_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [params.tenantId, account.rows[0]!.id],
      );
      await addAuditEvent(
        client,
        params.tenantId,
        "EMPLOYER_TENANT_MEMBER_GRANTED",
        request.adminIdentity!.loginName,
        { targetLoginNameHash: eventHash([params.loginName]) },
        "EMPLOYER_TENANT",
      );
      await client.query("COMMIT");
      return reply.code(204).send();
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
);

app.delete(
  "/v1/local/admin/employer-tenants/:tenantId/members/:loginName",
  async (request, reply) => {
    if (!(await requireOpsAdmin(request, reply))) return;
    const params = z
      .object({
        tenantId: z.string().uuid(),
        loginName: z.string().regex(/^[a-z0-9._-]{3,64}$/),
      })
      .parse(request.params);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const removed = await client.query(
        `DELETE FROM employer_tenant_members m
        USING admin_accounts a
       WHERE m.account_id = a.id AND m.employer_tenant_id = $1 AND a.login_name = $2`,
        [params.tenantId, params.loginName],
      );
      if (!removed.rowCount) {
        await client.query("ROLLBACK");
        return reply
          .code(404)
          .send({ code: "EMPLOYER_TENANT_MEMBER_NOT_FOUND" });
      }
      await addAuditEvent(
        client,
        params.tenantId,
        "EMPLOYER_TENANT_MEMBER_REVOKED",
        request.adminIdentity!.loginName,
        { targetLoginNameHash: eventHash([params.loginName]) },
        "EMPLOYER_TENANT",
      );
      await client.query("COMMIT");
      return reply.code(204).send();
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
);

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

app.get("/v1/local/admin/service-area-zones", async (request, reply) => {
  if (!(await requireOpsAdmin(request, reply))) return;
  const result = await pool.query<ServiceAreaZoneRow>(
    `SELECT id, zone_ref, version, display_name, scope_type, employer_tenant_id,
            polygon_geojson, polygon_bbox, status, effective_from::text,
            effective_until::text, change_reason, created_by_user_ref,
            submitted_by_user_ref, submitted_at::text, reviewed_by_user_ref,
            reviewed_at::text, activated_by_user_ref, activated_at::text,
            retired_by_user_ref, retired_at::text, created_at::text, updated_at::text
       FROM service_area_zone_versions
      ORDER BY zone_ref ASC, version DESC`,
  );
  return { zones: result.rows.map(serviceAreaZoneResponse) };
});

app.post("/v1/local/admin/service-area-zones", async (request, reply) => {
  if (!(await requireOpsAdmin(request, reply))) return;
  const idempotencyKey = manualActionIdempotencyKey(
    request.headers["idempotency-key"],
  );
  if (!idempotencyKey) {
    return reply.code(400).send({ code: "IDEMPOTENCY_KEY_REQUIRED" });
  }
  const input = serviceAreaZoneCreateSchema.parse(request.body);
  const actorUserRef = request.adminIdentity!.loginName;
  const parsedPolygon = parseZonePolygon(input.polygonGeoJson);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const replay = await adminActionReplay(
      client,
      "SERVICE_AREA_ZONE_CREATE",
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
    if (input.employerTenantId) {
      const tenant = await client.query(
        `SELECT 1 FROM employer_tenants
          WHERE id = $1 AND is_active = true
          FOR KEY SHARE`,
        [input.employerTenantId],
      );
      if (!tenant.rowCount) {
        await client.query("ROLLBACK");
        return reply.code(422).send({ code: "EMPLOYER_TENANT_UNAVAILABLE" });
      }
    }
    const latest = await client.query<{ version: number }>(
      `SELECT version
         FROM service_area_zone_versions
        WHERE zone_ref = $1
        ORDER BY version DESC
        LIMIT 1
        FOR UPDATE`,
      [input.zoneRef],
    );
    const nextVersion = (latest.rows[0]?.version ?? 0) + 1;
    const created = await client.query<ServiceAreaZoneRow>(
      `INSERT INTO service_area_zone_versions
        (zone_ref, version, display_name, scope_type, employer_tenant_id,
         polygon_geojson, polygon_bbox, status, effective_from, effective_until,
         change_reason, created_by_user_ref)
       VALUES
        ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, 'DRAFT', $8, $9, $10, $11)
       RETURNING id, zone_ref, version, display_name, scope_type, employer_tenant_id,
                 polygon_geojson, polygon_bbox, status, effective_from::text,
                 effective_until::text, change_reason, created_by_user_ref,
                 submitted_by_user_ref, submitted_at::text, reviewed_by_user_ref,
                 reviewed_at::text, activated_by_user_ref, activated_at::text,
                 retired_by_user_ref, retired_at::text, created_at::text, updated_at::text`,
      [
        input.zoneRef,
        nextVersion,
        input.displayName,
        input.scopeType,
        input.employerTenantId ?? null,
        JSON.stringify(parsedPolygon.geoJson),
        JSON.stringify(parsedPolygon.bbox),
        input.effectiveFrom,
        input.effectiveUntil ?? null,
        input.changeReason,
        actorUserRef,
      ],
    );
    const zone = created.rows[0]!;
    const responseBody = { zone: serviceAreaZoneResponse(zone) };
    await addAuditEvent(
      client,
      zone.id,
      "SERVICE_AREA_ZONE_CREATED",
      actorUserRef,
      {
        zoneRef: zone.zone_ref,
        version: zone.version,
        scopeType: zone.scope_type,
        employerTenantId: zone.employer_tenant_id,
        effectiveFrom: zone.effective_from,
        effectiveUntil: zone.effective_until,
      },
      "SERVICE_AREA_ZONE",
    );
    await recordAdminActionResult(
      client,
      "SERVICE_AREA_ZONE_CREATE",
      actorUserRef,
      replay,
      201,
      responseBody,
    );
    await client.query("COMMIT");
    return reply.code(201).send(responseBody);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

app.patch(
  "/v1/local/admin/service-area-zones/:zoneRef/drafts/:version",
  async (request, reply) => {
    if (!(await requireOpsAdmin(request, reply))) return;
    const idempotencyKey = manualActionIdempotencyKey(
      request.headers["idempotency-key"],
    );
    if (!idempotencyKey) {
      return reply.code(400).send({ code: "IDEMPOTENCY_KEY_REQUIRED" });
    }
    const params = z
      .object({
        zoneRef: z.string().regex(/^ZONE-[A-Z0-9-]{3,64}$/),
        version: z.coerce.number().int().min(1),
      })
      .parse(request.params);
    const input = serviceAreaZoneDraftPatchSchema.parse(request.body);
    const actorUserRef = request.adminIdentity!.loginName;
    const parsedPolygon = parseZonePolygon(input.polygonGeoJson);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const replay = await adminActionReplay(
        client,
        "SERVICE_AREA_ZONE_PATCH",
        actorUserRef,
        idempotencyKey,
        { ...params, ...input },
      );
      if (replay.kind === "replay") {
        await client.query("ROLLBACK");
        return reply.code(replay.responseStatus).send(replay.responseBody);
      }
      if (replay.kind === "key-reused") {
        await client.query("ROLLBACK");
        return reply.code(409).send({ code: "IDEMPOTENCY_KEY_REUSED" });
      }
      if (input.employerTenantId) {
        const tenant = await client.query(
          `SELECT 1 FROM employer_tenants
            WHERE id = $1 AND is_active = true
            FOR KEY SHARE`,
          [input.employerTenantId],
        );
        if (!tenant.rowCount) {
          await client.query("ROLLBACK");
          return reply.code(422).send({ code: "EMPLOYER_TENANT_UNAVAILABLE" });
        }
      }
      const current = await loadZoneVersionForUpdate(
        client,
        params.zoneRef,
        params.version,
      );
      if (!current) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ code: "SERVICE_AREA_ZONE_NOT_FOUND" });
      }
      if (current.status !== "DRAFT") {
        await client.query("ROLLBACK");
        return reply.code(409).send({
          code: "SERVICE_AREA_ZONE_NOT_EDITABLE",
          currentStatus: current.status,
        });
      }
      const updated = await client.query<ServiceAreaZoneRow>(
        `UPDATE service_area_zone_versions
            SET display_name = $3,
                scope_type = $4,
                employer_tenant_id = $5,
                polygon_geojson = $6::jsonb,
                polygon_bbox = $7::jsonb,
                effective_from = $8,
                effective_until = $9,
                change_reason = $10,
                updated_at = now()
          WHERE zone_ref = $1 AND version = $2
        RETURNING id, zone_ref, version, display_name, scope_type, employer_tenant_id,
                  polygon_geojson, polygon_bbox, status, effective_from::text,
                  effective_until::text, change_reason, created_by_user_ref,
                  submitted_by_user_ref, submitted_at::text, reviewed_by_user_ref,
                  reviewed_at::text, activated_by_user_ref, activated_at::text,
                  retired_by_user_ref, retired_at::text, created_at::text, updated_at::text`,
        [
          params.zoneRef,
          params.version,
          input.displayName,
          input.scopeType,
          input.employerTenantId ?? null,
          JSON.stringify(parsedPolygon.geoJson),
          JSON.stringify(parsedPolygon.bbox),
          input.effectiveFrom,
          input.effectiveUntil ?? null,
          input.changeReason,
        ],
      );
      const zone = updated.rows[0]!;
      const responseBody = { zone: serviceAreaZoneResponse(zone) };
      await addAuditEvent(
        client,
        zone.id,
        "SERVICE_AREA_ZONE_PATCHED",
        actorUserRef,
        { zoneRef: zone.zone_ref, version: zone.version },
        "SERVICE_AREA_ZONE",
      );
      await recordAdminActionResult(
        client,
        "SERVICE_AREA_ZONE_PATCH",
        actorUserRef,
        replay,
        200,
        responseBody,
      );
      await client.query("COMMIT");
      return responseBody;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
);

app.post(
  "/v1/local/admin/service-area-zones/:zoneRef/drafts/:version/submit-review",
  async (request, reply) => {
    if (!(await requireOpsAdmin(request, reply))) return;
    const idempotencyKey = manualActionIdempotencyKey(
      request.headers["idempotency-key"],
    );
    if (!idempotencyKey) {
      return reply.code(400).send({ code: "IDEMPOTENCY_KEY_REQUIRED" });
    }
    const params = z
      .object({
        zoneRef: z.string().regex(/^ZONE-[A-Z0-9-]{3,64}$/),
        version: z.coerce.number().int().min(1),
      })
      .parse(request.params);
    const actorUserRef = request.adminIdentity!.loginName;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const replay = await adminActionReplay(
        client,
        "SERVICE_AREA_ZONE_SUBMIT_REVIEW",
        actorUserRef,
        idempotencyKey,
        params,
      );
      if (replay.kind === "replay") {
        await client.query("ROLLBACK");
        return reply.code(replay.responseStatus).send(replay.responseBody);
      }
      if (replay.kind === "key-reused") {
        await client.query("ROLLBACK");
        return reply.code(409).send({ code: "IDEMPOTENCY_KEY_REUSED" });
      }
      const current = await loadZoneVersionForUpdate(
        client,
        params.zoneRef,
        params.version,
      );
      if (!current) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ code: "SERVICE_AREA_ZONE_NOT_FOUND" });
      }
      if (current.status !== "DRAFT") {
        await client.query("ROLLBACK");
        return reply.code(409).send({
          code: "SERVICE_AREA_ZONE_NOT_EDITABLE",
          currentStatus: current.status,
        });
      }
      parseZonePolygon(current.polygon_geojson);
      const updated = await client.query<ServiceAreaZoneRow>(
        `UPDATE service_area_zone_versions
            SET status = 'PENDING_REVIEW',
                submitted_by_user_ref = $3,
                submitted_at = now(),
                updated_at = now()
          WHERE zone_ref = $1 AND version = $2
        RETURNING id, zone_ref, version, display_name, scope_type, employer_tenant_id,
                  polygon_geojson, polygon_bbox, status, effective_from::text,
                  effective_until::text, change_reason, created_by_user_ref,
                  submitted_by_user_ref, submitted_at::text, reviewed_by_user_ref,
                  reviewed_at::text, activated_by_user_ref, activated_at::text,
                  retired_by_user_ref, retired_at::text, created_at::text, updated_at::text`,
        [params.zoneRef, params.version, actorUserRef],
      );
      const zone = updated.rows[0]!;
      const responseBody = { zone: serviceAreaZoneResponse(zone) };
      await addAuditEvent(
        client,
        zone.id,
        "SERVICE_AREA_ZONE_SUBMITTED_FOR_REVIEW",
        actorUserRef,
        { zoneRef: zone.zone_ref, version: zone.version },
        "SERVICE_AREA_ZONE",
      );
      await recordAdminActionResult(
        client,
        "SERVICE_AREA_ZONE_SUBMIT_REVIEW",
        actorUserRef,
        replay,
        200,
        responseBody,
      );
      await client.query("COMMIT");
      return responseBody;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
);

app.post(
  "/v1/local/admin/service-area-zones/:zoneRef/versions/:version/review",
  async (request, reply) => {
    if (!(await requireOpsAdmin(request, reply))) return;
    const idempotencyKey = manualActionIdempotencyKey(
      request.headers["idempotency-key"],
    );
    if (!idempotencyKey) {
      return reply.code(400).send({ code: "IDEMPOTENCY_KEY_REQUIRED" });
    }
    const params = z
      .object({
        zoneRef: z.string().regex(/^ZONE-[A-Z0-9-]{3,64}$/),
        version: z.coerce.number().int().min(1),
      })
      .parse(request.params);
    const input = serviceAreaZoneReviewSchema.parse(request.body);
    const actorUserRef = request.adminIdentity!.loginName;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const replay = await adminActionReplay(
        client,
        "SERVICE_AREA_ZONE_REVIEW",
        actorUserRef,
        idempotencyKey,
        { ...params, ...input },
      );
      if (replay.kind === "replay") {
        await client.query("ROLLBACK");
        return reply.code(replay.responseStatus).send(replay.responseBody);
      }
      if (replay.kind === "key-reused") {
        await client.query("ROLLBACK");
        return reply.code(409).send({ code: "IDEMPOTENCY_KEY_REUSED" });
      }
      const current = await loadZoneVersionForUpdate(
        client,
        params.zoneRef,
        params.version,
      );
      if (!current) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ code: "SERVICE_AREA_ZONE_NOT_FOUND" });
      }
      if (current.status !== "PENDING_REVIEW") {
        await client.query("ROLLBACK");
        return reply.code(409).send({
          code: "SERVICE_AREA_ZONE_NOT_REVIEWABLE",
          currentStatus: current.status,
        });
      }
      if (current.created_by_user_ref === actorUserRef) {
        await client.query("ROLLBACK");
        return reply
          .code(409)
          .send({ code: "SERVICE_AREA_ZONE_DUAL_CONTROL_REQUIRED" });
      }
      if (current.reviewed_by_user_ref) {
        await client.query("ROLLBACK");
        return reply
          .code(409)
          .send({ code: "SERVICE_AREA_ZONE_ALREADY_REVIEWED" });
      }
      const updated = await client.query<ServiceAreaZoneRow>(
        `UPDATE service_area_zone_versions
            SET reviewed_by_user_ref = $3,
                reviewed_at = now(),
                updated_at = now()
          WHERE zone_ref = $1 AND version = $2
        RETURNING id, zone_ref, version, display_name, scope_type, employer_tenant_id,
                  polygon_geojson, polygon_bbox, status, effective_from::text,
                  effective_until::text, change_reason, created_by_user_ref,
                  submitted_by_user_ref, submitted_at::text, reviewed_by_user_ref,
                  reviewed_at::text, activated_by_user_ref, activated_at::text,
                  retired_by_user_ref, retired_at::text, created_at::text, updated_at::text`,
        [params.zoneRef, params.version, actorUserRef],
      );
      const zone = updated.rows[0]!;
      const responseBody = { zone: serviceAreaZoneResponse(zone) };
      await addAuditEvent(
        client,
        zone.id,
        "SERVICE_AREA_ZONE_REVIEWED",
        actorUserRef,
        {
          zoneRef: zone.zone_ref,
          version: zone.version,
          reviewNote: input.reviewNote,
        },
        "SERVICE_AREA_ZONE",
      );
      await recordAdminActionResult(
        client,
        "SERVICE_AREA_ZONE_REVIEW",
        actorUserRef,
        replay,
        200,
        responseBody,
      );
      await client.query("COMMIT");
      return responseBody;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
);

app.post(
  "/v1/local/admin/service-area-zones/:zoneRef/versions/:version/activate",
  async (request, reply) => {
    if (!(await requireOpsAdmin(request, reply))) return;
    const idempotencyKey = manualActionIdempotencyKey(
      request.headers["idempotency-key"],
    );
    if (!idempotencyKey) {
      return reply.code(400).send({ code: "IDEMPOTENCY_KEY_REQUIRED" });
    }
    const params = z
      .object({
        zoneRef: z.string().regex(/^ZONE-[A-Z0-9-]{3,64}$/),
        version: z.coerce.number().int().min(1),
      })
      .parse(request.params);
    const actorUserRef = request.adminIdentity!.loginName;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const replay = await adminActionReplay(
        client,
        "SERVICE_AREA_ZONE_ACTIVATE",
        actorUserRef,
        idempotencyKey,
        params,
      );
      if (replay.kind === "replay") {
        await client.query("ROLLBACK");
        return reply.code(replay.responseStatus).send(replay.responseBody);
      }
      if (replay.kind === "key-reused") {
        await client.query("ROLLBACK");
        return reply.code(409).send({ code: "IDEMPOTENCY_KEY_REUSED" });
      }
      const current = await loadZoneVersionForUpdate(
        client,
        params.zoneRef,
        params.version,
      );
      if (!current) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ code: "SERVICE_AREA_ZONE_NOT_FOUND" });
      }
      if (current.status !== "PENDING_REVIEW") {
        await client.query("ROLLBACK");
        return reply.code(409).send({
          code: "SERVICE_AREA_ZONE_NOT_ACTIVATABLE",
          currentStatus: current.status,
        });
      }
      if (!current.reviewed_by_user_ref) {
        await client.query("ROLLBACK");
        return reply
          .code(409)
          .send({ code: "SERVICE_AREA_ZONE_REVIEW_REQUIRED" });
      }
      if (current.created_by_user_ref === actorUserRef) {
        await client.query("ROLLBACK");
        return reply
          .code(409)
          .send({ code: "SERVICE_AREA_ZONE_DUAL_CONTROL_REQUIRED" });
      }
      const candidatePolygon = parseZonePolygon(current.polygon_geojson);
      const overlapping = await loadOverlappingActiveZoneVersions({
        client,
        zoneId: current.id,
        scopeType: current.scope_type,
        employerTenantId: current.employer_tenant_id,
        effectiveFrom: current.effective_from,
        effectiveUntil: current.effective_until,
      });
      const conflicting = overlapping.find((zone) =>
        polygonOverlaps(candidatePolygon, zone.polygon),
      );
      if (conflicting) {
        await client.query("ROLLBACK");
        return reply.code(409).send({
          code: "SERVICE_AREA_ZONE_OVERLAPS_ACTIVE_ZONE",
          conflictingZoneRef: conflicting.zoneRef,
          conflictingZoneVersion: conflicting.version,
        });
      }
      const updated = await client.query<ServiceAreaZoneRow>(
        `UPDATE service_area_zone_versions
            SET status = 'ACTIVE',
                activated_by_user_ref = $3,
                activated_at = now(),
                updated_at = now()
          WHERE zone_ref = $1 AND version = $2
        RETURNING id, zone_ref, version, display_name, scope_type, employer_tenant_id,
                  polygon_geojson, polygon_bbox, status, effective_from::text,
                  effective_until::text, change_reason, created_by_user_ref,
                  submitted_by_user_ref, submitted_at::text, reviewed_by_user_ref,
                  reviewed_at::text, activated_by_user_ref, activated_at::text,
                  retired_by_user_ref, retired_at::text, created_at::text, updated_at::text`,
        [params.zoneRef, params.version, actorUserRef],
      );
      const zone = updated.rows[0]!;
      const responseBody = { zone: serviceAreaZoneResponse(zone) };
      await addAuditEvent(
        client,
        zone.id,
        "SERVICE_AREA_ZONE_ACTIVATED",
        actorUserRef,
        { zoneRef: zone.zone_ref, version: zone.version },
        "SERVICE_AREA_ZONE",
      );
      await recordAdminActionResult(
        client,
        "SERVICE_AREA_ZONE_ACTIVATE",
        actorUserRef,
        replay,
        200,
        responseBody,
      );
      await client.query("COMMIT");
      return responseBody;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
);

app.post(
  "/v1/local/admin/service-area-zones/:zoneRef/versions/:version/retire",
  async (request, reply) => {
    if (!(await requireOpsAdmin(request, reply))) return;
    const idempotencyKey = manualActionIdempotencyKey(
      request.headers["idempotency-key"],
    );
    if (!idempotencyKey) {
      return reply.code(400).send({ code: "IDEMPOTENCY_KEY_REQUIRED" });
    }
    const params = z
      .object({
        zoneRef: z.string().regex(/^ZONE-[A-Z0-9-]{3,64}$/),
        version: z.coerce.number().int().min(1),
      })
      .parse(request.params);
    const input = serviceAreaZoneRetireSchema.parse(request.body);
    const actorUserRef = request.adminIdentity!.loginName;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const replay = await adminActionReplay(
        client,
        "SERVICE_AREA_ZONE_RETIRE",
        actorUserRef,
        idempotencyKey,
        { ...params, ...input },
      );
      if (replay.kind === "replay") {
        await client.query("ROLLBACK");
        return reply.code(replay.responseStatus).send(replay.responseBody);
      }
      if (replay.kind === "key-reused") {
        await client.query("ROLLBACK");
        return reply.code(409).send({ code: "IDEMPOTENCY_KEY_REUSED" });
      }
      const current = await loadZoneVersionForUpdate(
        client,
        params.zoneRef,
        params.version,
      );
      if (!current) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ code: "SERVICE_AREA_ZONE_NOT_FOUND" });
      }
      if (current.status !== "ACTIVE") {
        await client.query("ROLLBACK");
        return reply.code(409).send({
          code: "SERVICE_AREA_ZONE_NOT_RETIRABLE",
          currentStatus: current.status,
        });
      }
      const updated = await client.query<ServiceAreaZoneRow>(
        `UPDATE service_area_zone_versions
            SET status = 'RETIRED',
                retired_by_user_ref = $3,
                retired_at = now(),
                updated_at = now()
          WHERE zone_ref = $1 AND version = $2
        RETURNING id, zone_ref, version, display_name, scope_type, employer_tenant_id,
                  polygon_geojson, polygon_bbox, status, effective_from::text,
                  effective_until::text, change_reason, created_by_user_ref,
                  submitted_by_user_ref, submitted_at::text, reviewed_by_user_ref,
                  reviewed_at::text, activated_by_user_ref, activated_at::text,
                  retired_by_user_ref, retired_at::text, created_at::text, updated_at::text`,
        [params.zoneRef, params.version, actorUserRef],
      );
      const zone = updated.rows[0]!;
      const responseBody = { zone: serviceAreaZoneResponse(zone) };
      await addAuditEvent(
        client,
        zone.id,
        "SERVICE_AREA_ZONE_RETIRED",
        actorUserRef,
        {
          zoneRef: zone.zone_ref,
          version: zone.version,
          retireReason: input.retireReason,
        },
        "SERVICE_AREA_ZONE",
      );
      await recordAdminActionResult(
        client,
        "SERVICE_AREA_ZONE_RETIRE",
        actorUserRef,
        replay,
        200,
        responseBody,
      );
      await client.query("COMMIT");
      return responseBody;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
);

app.get("/v1/local/admin/kyc-location-evidence", async (request, reply) => {
  if (!requireKycLocationReadRole(request, reply)) return;
  const result = await pool.query<{
    evidence_ref: string;
    source: string;
    consent_version: string;
    submitted_at: string;
    application_no: string | null;
    assessment_result: LocationAssessmentResult | null;
    assessed_scope_type: ZoneScopeType | null;
    employer_tenant_id: string | null;
    matched_zone_ref: string | null;
    matched_zone_version: number | null;
    assessed_at: string | null;
  }>(
    `SELECT evidence.evidence_ref,
            evidence.source,
            evidence.consent_version,
            evidence.created_at::text AS submitted_at,
            application_row.application_no,
            assessment.assessment_result,
            assessment.assessed_scope_type,
            assessment.employer_tenant_id,
            assessment.matched_zone_ref,
            assessment.matched_zone_version,
            assessment.assessed_at::text
       FROM kyc_location_evidence evidence
       LEFT JOIN LATERAL (
         SELECT application_id, assessment_result, assessed_scope_type,
                employer_tenant_id, matched_zone_ref, matched_zone_version,
                assessed_at
           FROM kyc_location_assessments
          WHERE evidence_id = evidence.id
          ORDER BY assessed_at DESC
          LIMIT 1
       ) assessment ON true
       LEFT JOIN applications application_row
         ON application_row.id = assessment.application_id
      ORDER BY evidence.created_at DESC
      LIMIT 100`,
  );
  return {
    items: result.rows.map((row) => ({
      evidenceRef: row.evidence_ref,
      source: row.source,
      consentVersion: row.consent_version,
      submittedAt: row.submitted_at,
      applicationNo: row.application_no,
      assessmentResult: row.assessment_result,
      assessedScopeType: row.assessed_scope_type,
      employerTenantId: row.employer_tenant_id,
      matchedZoneRef: row.matched_zone_ref,
      matchedZoneVersion: row.matched_zone_version,
      assessedAt: row.assessed_at,
    })),
  };
});

app.get(
  "/v1/local/admin/kyc-location-evidence/:evidenceRef",
  async (request, reply) => {
    if (!requireKycLocationReadRole(request, reply)) return;
    const params = z
      .object({
        evidenceRef: z.string().regex(/^KYCLOC-[A-Z0-9]{8,32}$/),
      })
      .parse(request.params);
    const evidence = await pool.query<{
      id: string;
      evidence_ref: string;
      source: string;
      consent_version: string;
      submitted_at: string;
      application_no: string | null;
      assessment_result: LocationAssessmentResult | null;
      assessed_scope_type: ZoneScopeType | null;
      employer_tenant_id: string | null;
      matched_zone_ref: string | null;
      matched_zone_version: number | null;
      assessed_at: string | null;
      rule_version: string | null;
    }>(
      `SELECT evidence.id,
              evidence.evidence_ref,
              evidence.source,
              evidence.consent_version,
              evidence.created_at::text AS submitted_at,
              application_row.application_no,
              assessment.assessment_result,
              assessment.assessed_scope_type,
              assessment.employer_tenant_id,
              assessment.matched_zone_ref,
              assessment.matched_zone_version,
              assessment.assessed_at::text,
              assessment.rule_version
         FROM kyc_location_evidence evidence
         LEFT JOIN LATERAL (
           SELECT application_id, assessment_result, assessed_scope_type,
                  employer_tenant_id, matched_zone_ref, matched_zone_version,
                  assessed_at, rule_version
             FROM kyc_location_assessments
            WHERE evidence_id = evidence.id
            ORDER BY assessed_at DESC
            LIMIT 1
         ) assessment ON true
         LEFT JOIN applications application_row
           ON application_row.id = assessment.application_id
        WHERE evidence.evidence_ref = $1`,
      [params.evidenceRef],
    );
    const row = evidence.rows[0];
    if (!row) {
      return reply.code(404).send({ code: "KYC_LOCATION_EVIDENCE_NOT_FOUND" });
    }
    const audit = await pool.query<{
      event_type: string;
      actor_user_ref: string;
      occurred_at: string;
      payload: Record<string, unknown>;
    }>(
      `SELECT event_type, actor_user_ref, occurred_at::text, payload
         FROM audit_events
        WHERE entity_type = 'KYC_LOCATION_EVIDENCE' AND entity_id = $1
        ORDER BY occurred_at ASC, id ASC`,
      [row.id],
    );
    return {
      evidence: {
        evidenceRef: row.evidence_ref,
        source: row.source,
        consentVersion: row.consent_version,
        submittedAt: row.submitted_at,
        applicationNo: row.application_no,
        assessmentResult: row.assessment_result,
        assessedScopeType: row.assessed_scope_type,
        employerTenantId: row.employer_tenant_id,
        matchedZoneRef: row.matched_zone_ref,
        matchedZoneVersion: row.matched_zone_version,
        assessedAt: row.assessed_at,
        ruleVersion: row.rule_version,
      },
      audit: audit.rows.map((entry) => ({
        eventType: entry.event_type,
        actorUserRef: entry.actor_user_ref,
        occurredAt: entry.occurred_at,
        payload: entry.payload,
      })),
    };
  },
);

const createStageHandler = (
  expectedStatus: string,
  stage: string,
  approvedStatus:
    | string
    | ((
        application: ApplicationRow,
        input: ApprovalCommand & FinalReviewTerms,
      ) => string),
  requiredRole: string,
  schema: z.ZodType<ApprovalCommand & FinalReviewTerms>,
  actionName: ManualActionName,
  afterRecord?: (
    client: PoolClient,
    application: ApplicationRow,
    input: ApprovalCommand & FinalReviewTerms,
    actorUserRef: string,
  ) => Promise<void>,
) => {
  return async (request: any, reply: any) => {
    if (!requireRole(request as any, reply, requiredRole)) return;
    const idempotencyKey = manualActionIdempotencyKey(
      request.headers["idempotency-key"],
    );
    if (!idempotencyKey)
      return reply.code(400).send({ code: "IDEMPOTENCY_KEY_REQUIRED" });
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
      const replay = await manualActionReplay(
        client,
        application,
        actionName,
        securedInput.actorUserRef,
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
      if (application.status !== expectedStatus) {
        await client.query("ROLLBACK");
        return reply.code(409).send({
          code: "INVALID_APPLICATION_STATE",
          currentStatus: application.status,
        });
      }
      const approvedTargetStatus =
        typeof approvedStatus === "function"
          ? approvedStatus(application, input)
          : approvedStatus;
      // A broker must not hand an application into a verification queue whose
      // factory has been deactivated.  The employer-side access check below
      // protects HR/finance actions; this complementary check prevents a
      // broker from creating a queue item that nobody can lawfully process.
      if (
        requiredRole === "BROKER_OFFICER" &&
        input.decision === "APPROVED" &&
        approvedTargetStatus === "EMPLOYER_VERIFICATION" &&
        application.employer_tenant_id
      ) {
        const activeTenant = await client.query(
          `SELECT 1 FROM employer_tenants
            WHERE id = $1 AND is_active = true
            FOR KEY SHARE`,
          [application.employer_tenant_id],
        );
        if (!activeTenant.rowCount) {
          await client.query("ROLLBACK");
          return reply.code(409).send({ code: "EMPLOYER_TENANT_UNAVAILABLE" });
        }
      }
      if (
        requiredRole === "EMPLOYER_HR" ||
        requiredRole === "EMPLOYER_FINANCE"
      ) {
        const access = await employerTenantAccess(
          client,
          application,
          securedInput.actorUserRef,
        );
        if (access === "APPLICATION_UNASSIGNED") {
          await client.query("ROLLBACK");
          return reply.code(409).send({ code: "EMPLOYER_TENANT_NOT_ASSIGNED" });
        }
        if (access === "DENIED") {
          await client.query("ROLLBACK");
          return reply
            .code(403)
            .send({ code: "EMPLOYER_TENANT_ACCESS_DENIED" });
        }
      }
      // Authenticated production applications carry an identity lookup hash.
      // HR must record a factory-record match before approving such a case.
      // Legacy controlled-preview records without a document remain usable.
      if (requiredRole === "EMPLOYER_HR" && input.decision === "APPROVED") {
        const identityMatch = await client.query<{
          employment_identity_match_status: string;
          identity_document_lookup_hash: string | null;
        }>(
          `SELECT a.employment_identity_match_status, u.identity_document_lookup_hash
             FROM applications a JOIN users u ON u.id = a.user_id
            WHERE a.id = $1`,
          [application.id],
        );
        const identity = identityMatch.rows[0];
        if (
          identity?.identity_document_lookup_hash &&
          identity.employment_identity_match_status !== "MATCHED"
        ) {
          await client.query("ROLLBACK");
          return reply
            .code(409)
            .send({ code: "EMPLOYMENT_IDENTITY_MATCH_REQUIRED" });
        }
      }
      const status = await recordSingleApproval(
        client,
        application,
        stage,
        securedInput,
        approvedTargetStatus,
      );
      if (afterRecord)
        await afterRecord(
          client,
          application,
          input,
          securedInput.actorUserRef,
        );
      const response = {
        applicationNo: params.applicationNo,
        status,
        decision: securedInput.decision,
      };
      await recordManualActionResult(
        client,
        application,
        actionName,
        securedInput.actorUserRef,
        replay,
        response,
      );
      await client.query("COMMIT");
      return response;
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
    // A user may share their Telegram contact before their first loan
    // application. Create the minimal identity row at authenticated login so
    // the Bot webhook has a safe record to bind that proof to.
    await client.query(
      `INSERT INTO users (
         telegram_user_ref, preferred_language, telegram_display_name,
         telegram_username, telegram_photo_url
       )
       VALUES ($1, 'en', $2, $3, $4)
       ON CONFLICT (telegram_user_ref) DO UPDATE SET
         telegram_display_name = COALESCE(EXCLUDED.telegram_display_name, users.telegram_display_name),
         telegram_username = EXCLUDED.telegram_username,
         telegram_photo_url = COALESCE(EXCLUDED.telegram_photo_url, users.telegram_photo_url),
         updated_at = now()`,
      [
        identity.telegramUserRef,
        identity.displayName,
        identity.username,
        identity.photoUrl,
      ],
    );
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
        (token_hash, telegram_user_ref, authenticated_bot_id, client_user_agent_hash, expires_at)
       VALUES ($1, $2, $3, $4, now() + interval '15 minutes')`,
      [
        eventHash([sessionToken]),
        identity.telegramUserRef,
        identity.authenticatedBotId,
        eventHash([
          typeof request.headers["user-agent"] === "string"
            ? request.headers["user-agent"]
            : "",
        ]),
      ],
    );
    await client.query("COMMIT");
    const applicantCsrfToken = randomBytes(32).toString("base64url");
    reply.header("Set-Cookie", [
      `__Host-payease_applicant_session=${sessionToken}; HttpOnly; Secure; SameSite=None; Partitioned; Path=/; Max-Age=900`,
      // Telegram's embedded iOS WebView can reject a Partitioned cookie on
      // older platform versions. Keep a path-scoped compatibility cookie so a
      // successful initData exchange is usable by the immediately following
      // same-origin applicant API requests. It is HttpOnly, Secure and has the
      // same short lifetime; the server accepts either name and logout clears
      // both.
      `payease_applicant_session=${sessionToken}; HttpOnly; Secure; SameSite=Lax; Path=/api/v1/local/; Max-Age=900`,
      csrfCookie("applicant", applicantCsrfToken, 900),
      csrfCompatibilityCookie("applicant", applicantCsrfToken, 900)!,
    ]);
    return reply.code(201).send({ authenticated: true });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

// Telegram calls this endpoint after a user explicitly shares a contact from
// a private chat or Mini App. It is intentionally not a browser session
// endpoint: the per-Bot setWebhook secret is mandatory and CSRF is irrelevant.
// Invalid/unsupported updates return 204 to avoid creating a webhook oracle.
app.post(
  "/v1/local/internal/telegram-bot-updates/:botId",
  async (request, reply) => {
    const params = z
      .object({ botId: z.string().regex(/^\d{5,20}$/) })
      .parse(request.params);
    const suppliedSecret = request.headers["x-telegram-bot-api-secret-token"];
    const suppliedSecretValue = Array.isArray(suppliedSecret)
      ? suppliedSecret.length === 1
        ? suppliedSecret[0]
        : undefined
      : suppliedSecret;
    const bots = configuredTelegramBots();
    if (
      !isTelegramWebhookSecretValid(
        params.botId,
        typeof suppliedSecretValue === "string"
          ? suppliedSecretValue
          : undefined,
        bots,
      )
    ) {
      // This is intentionally secret-free operational telemetry. A failed
      // webhook must be diagnosable without ever logging a Bot token, its
      // webhook secret, or a caller-supplied secret value.
      request.log.warn(
        {
          botId: params.botId,
          suppliedSecretPresent: typeof suppliedSecretValue === "string",
          configuredEnabledBot: bots.some(
            (bot) => bot.botId === params.botId && bot.enabled,
          ),
          configuredWebhookSecret: bots.some(
            (bot) =>
              bot.botId === params.botId &&
              bot.enabled &&
              bot.webhookSecret !== undefined,
          ),
        },
        "telegram webhook authentication failed",
      );
      return reply.code(401).send({ code: "TELEGRAM_WEBHOOK_UNAUTHORIZED" });
    }
    const contact = verifiedTelegramContactFromUpdate(request.body);
    if (!contact) return reply.code(204).send();
    let encryptedPhone: Buffer;
    try {
      encryptedPhone = encryptPersonalValue(contact.phoneNumber);
    } catch (error) {
      request.log.error({ err: error }, "telegram phone storage unavailable");
      return reply
        .code(503)
        .send({ code: "TELEGRAM_PHONE_STORAGE_UNAVAILABLE" });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const user = await client.query<{ id: string }>(
        `UPDATE users
            SET telegram_phone_encrypted = $1,
                telegram_phone_verified_at = now(),
                telegram_phone_verified_bot_id = $2,
                updated_at = now()
          WHERE telegram_user_ref = $3
        RETURNING id`,
        [encryptedPhone, params.botId, contact.telegramUserRef],
      );
      if (!user.rowCount) {
        await client.query("ROLLBACK");
        return reply.code(204).send();
      }
      await addAuditEvent(
        client,
        user.rows[0]!.id,
        "TELEGRAM_PHONE_VERIFIED",
        contact.telegramUserRef,
        { authenticatedBotId: params.botId },
        "USER",
      );
      await client.query("COMMIT");
      return reply.code(204).send();
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
);

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

// The applicant selects a factory before submitting. This directory is
// intentionally minimal: it never reveals tenant staff, volumes, or any
// application data.
app.get("/v1/local/public/employer-tenants", async () => {
  const result = await pool.query<{
    id: string;
    display_name: string;
  }>(
    `SELECT tenant.id, tenant.display_name
       FROM employer_tenants AS tenant
      WHERE is_active = true
      ORDER BY display_name ASC`,
  );
  return {
    tenants: result.rows.map((tenant) => ({
      id: tenant.id,
      displayName: tenant.display_name,
      availableRepaymentMethods: ["SMILE_WALLET_AUTHORIZATION"],
      defaultRepaymentMethod: "SMILE_WALLET_AUTHORIZATION",
    })),
  };
});

app.get("/v1/local/public/profile/view", async (request, reply) => {
  const applicant = await authenticatedApplicant(
    request.headers.cookie,
    request.headers["user-agent"],
  );
  if (!applicant) {
    return reply.code(401).send({ code: "TELEGRAM_AUTH_REQUIRED" });
  }
  const user = await pool.query<{
    user_id: string;
    preferred_language: "km" | "en" | "zh-CN";
    telegram_display_name: string | null;
    telegram_username: string | null;
    telegram_photo_url: string | null;
    telegram_phone_verified_at: Date | null;
    employer_display_name: string | null;
    active_application_no: string | null;
    active_application_status: string | null;
    bill_application_no: string | null;
    bill_status: string | null;
  }>(
    `SELECT
       u.id AS user_id,
       u.preferred_language,
       u.telegram_display_name,
       u.telegram_username,
       u.telegram_photo_url,
       u.telegram_phone_verified_at,
       employer_tenant.display_name AS employer_display_name,
       app.application_no AS active_application_no,
       app.status AS active_application_status,
       bill.application_no AS bill_application_no,
       bill.status AS bill_status
     FROM users u
     LEFT JOIN LATERAL (
       SELECT a.application_no, a.status, a.employer_tenant_id
         FROM applications a
        WHERE a.user_id = u.id
        ORDER BY a.created_at DESC
        LIMIT 1
     ) app ON true
     LEFT JOIN employer_tenants employer_tenant
       ON employer_tenant.id = app.employer_tenant_id
     LEFT JOIN LATERAL (
       SELECT a.application_no, a.status
         FROM applications a
        WHERE a.user_id = u.id
          AND a.status IN ('DISBURSEMENT_PENDING', 'DISBURSED', 'REPAYMENT_ACTIVE')
        ORDER BY a.created_at DESC
        LIMIT 1
     ) bill ON true
    WHERE u.telegram_user_ref = $1`,
    [applicant.telegramUserRef],
  );
  const profile = user.rows[0];
  if (!profile) {
    return reply.code(404).send({ code: "APPLICANT_PROFILE_NOT_FOUND" });
  }
  const kycLocation = await loadLatestKycLocationStatus({
    client: pool,
    userId: profile.user_id,
  });
  return {
    displayName: profile.telegram_display_name,
    username: profile.telegram_username,
    photoUrl: profile.telegram_photo_url,
    telegramVerified: true,
    phoneVerificationStatus: profile.telegram_phone_verified_at
      ? "VERIFIED"
      : requiresTelegramPhoneVerification()
        ? "PENDING"
        : "NOT_STARTED",
    employerDisplayName: profile.employer_display_name,
    language: profile.preferred_language,
    kycLocation: kycLocation ?? null,
    ...(profile.active_application_no && profile.active_application_status
      ? {
          activeApplication: {
            referenceMasked: maskedApplicationReference(
              profile.active_application_no,
            ),
            status: profile.active_application_status,
            nextAction: profileNextAction(profile.active_application_status),
          },
        }
      : {}),
    ...(profile.bill_application_no && profile.bill_status
      ? {
          activeBill: {
            referenceMasked: maskedApplicationReference(
              profile.bill_application_no,
            ),
            status: profile.bill_status,
            dueDate: null,
          },
        }
      : {}),
  };
});

// Never return the contact itself to the browser. The Mini App needs only the
// boolean state to decide whether it should ask Telegram to share a contact.
app.get(
  "/v1/local/public/profile/telegram-phone-verification",
  async (request, reply) => {
    const applicant = await authenticatedApplicant(
      request.headers.cookie,
      request.headers["user-agent"],
    );
    if (!applicant) {
      return reply.code(401).send({ code: "TELEGRAM_AUTH_REQUIRED" });
    }
    const user = await pool.query<{ verified_at: Date | null }>(
      `SELECT telegram_phone_verified_at AS verified_at
         FROM users WHERE telegram_user_ref = $1`,
      [applicant.telegramUserRef],
    );
    const verifiedAt = user.rows[0]?.verified_at;
    return {
      verified: Boolean(verifiedAt),
      ...(verifiedAt ? { verifiedAt: verifiedAt.toISOString() } : {}),
      required: requiresTelegramPhoneVerification(),
    };
  },
);

app.get("/v1/local/public/application-draft", async (request, reply) => {
  const applicant = await authenticatedApplicantUser(
    request.headers.cookie,
    request.headers["user-agent"],
  );
  if (!applicant) {
    return reply.code(401).send({ code: "TELEGRAM_AUTH_REQUIRED" });
  }
  const draft = await pool.query<{
    draft_payload_encrypted: Buffer;
  }>(
    `SELECT draft_payload_encrypted
       FROM applicant_application_drafts
      WHERE user_id = $1`,
    [applicant.id],
  );
  if (!draft.rowCount) {
    return { draft: null };
  }
  try {
    return {
      draft: parseApplicantApplicationDraft(
        draft.rows[0]!.draft_payload_encrypted,
      ),
    };
  } catch (error) {
    request.log.error({ err: error }, "applicant draft read unavailable");
    return reply
      .code(503)
      .send({ code: "APPLICATION_DRAFT_STORAGE_UNAVAILABLE" });
  }
});

app.put("/v1/local/public/application-draft", async (request, reply) => {
  const applicant = await authenticatedApplicantUser(
    request.headers.cookie,
    request.headers["user-agent"],
  );
  if (!applicant) {
    return reply.code(401).send({ code: "TELEGRAM_AUTH_REQUIRED" });
  }
  const input = applicantApplicationDraftSchema.parse(request.body);
  let encryptedDraft: Buffer;
  let keyVersion: string;
  try {
    encryptedDraft = serializeApplicantApplicationDraft(input);
    keyVersion = personalDataKeyVersion();
  } catch (error) {
    request.log.error({ err: error }, "applicant draft storage unavailable");
    return reply
      .code(503)
      .send({ code: "APPLICATION_DRAFT_STORAGE_UNAVAILABLE" });
  }
  await pool.query(
    `INSERT INTO applicant_application_drafts
      (user_id, draft_version, stage, form_step, draft_payload_encrypted, draft_key_version)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id) DO UPDATE SET
       draft_version = EXCLUDED.draft_version,
       stage = EXCLUDED.stage,
       form_step = EXCLUDED.form_step,
       draft_payload_encrypted = EXCLUDED.draft_payload_encrypted,
       draft_key_version = EXCLUDED.draft_key_version,
       updated_at = now()`,
    [
      applicant.id,
      input.version,
      input.stage,
      input.formStep,
      encryptedDraft,
      keyVersion,
    ],
  );
  return reply.code(204).send();
});

app.delete("/v1/local/public/application-draft", async (request, reply) => {
  const applicant = await authenticatedApplicantUser(
    request.headers.cookie,
    request.headers["user-agent"],
  );
  if (!applicant) {
    return reply.code(401).send({ code: "TELEGRAM_AUTH_REQUIRED" });
  }
  await pool.query(
    "DELETE FROM applicant_application_drafts WHERE user_id = $1",
    [applicant.id],
  );
  return reply.code(204).send();
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
      expiredCsrfCompatibilityCookie("applicant")!,
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
    const applicant = await authenticatedApplicant(
      request.headers.cookie,
      request.headers["user-agent"],
    );
    if (!applicant) {
      return reply.code(401).send({ code: "TELEGRAM_SESSION_REQUIRED" });
    }
    return reply.code(204).send();
  },
);

app.post("/v1/local/public/kyc-location-evidence", async (request, reply) => {
  const applicant = await authenticatedApplicantUser(
    request.headers.cookie,
    request.headers["user-agent"],
  );
  if (!applicant) {
    return reply.code(401).send({ code: "TELEGRAM_AUTH_REQUIRED" });
  }
  const input = kycLocationEvidenceCreateSchema.parse(request.body);
  const capturedAtMillis = new Date(input.capturedAt).getTime();
  const now = Date.now();
  if (
    !Number.isFinite(capturedAtMillis) ||
    capturedAtMillis < now - 10 * 60 * 1000 ||
    capturedAtMillis > now + 60 * 1000
  ) {
    return reply
      .code(422)
      .send({ code: "KYC_LOCATION_CAPTURED_AT_OUT_OF_WINDOW" });
  }
  let latitudeEncrypted: Buffer;
  let longitudeEncrypted: Buffer;
  let horizontalAccuracyEncrypted: Buffer;
  let capturedAtEncrypted: Buffer;
  let piiKeyVersion: string;
  try {
    latitudeEncrypted = encryptPersonalValue(String(input.latitude));
    longitudeEncrypted = encryptPersonalValue(String(input.longitude));
    horizontalAccuracyEncrypted = encryptPersonalValue(
      String(input.horizontalAccuracyMeters),
    );
    capturedAtEncrypted = encryptPersonalValue(input.capturedAt);
    piiKeyVersion = personalDataKeyVersion();
  } catch (error) {
    request.log.error({ err: error }, "kyc location storage unavailable");
    return reply.code(503).send({ code: "KYC_LOCATION_STORAGE_UNAVAILABLE" });
  }
  const point: Point = {
    latitude: input.latitude,
    longitude: input.longitude,
  };
  const evidenceRef = `KYCLOC-${randomBytes(8).toString("hex").toUpperCase()}`;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let employerTenantId: string | null = null;
    const draft = await client.query<{ draft_payload_encrypted: Buffer }>(
      `SELECT draft_payload_encrypted
         FROM applicant_application_drafts
        WHERE user_id = $1`,
      [applicant.id],
    );
    if (draft.rowCount) {
      try {
        employerTenantId =
          parseApplicantApplicationDraft(draft.rows[0]!.draft_payload_encrypted)
            .employerTenantId || null;
      } catch (error) {
        request.log.error(
          { err: error },
          "kyc location draft read unavailable",
        );
        await client.query("ROLLBACK");
        return reply
          .code(503)
          .send({ code: "APPLICATION_DRAFT_STORAGE_UNAVAILABLE" });
      }
      if (employerTenantId) {
        const tenant = await client.query(
          `SELECT 1 FROM employer_tenants
            WHERE id = $1 AND is_active = true
            FOR KEY SHARE`,
          [employerTenantId],
        );
        if (!tenant.rowCount) employerTenantId = null;
      }
    }
    const evidence = await client.query<{ id: string; created_at: string }>(
      `INSERT INTO kyc_location_evidence
        (evidence_ref, user_id, application_id, latitude_encrypted, longitude_encrypted,
         horizontal_accuracy_encrypted, captured_at_encrypted, consent_version,
         source, pii_key_version)
       VALUES
        ($1, $2, NULL, $3::bytea, $4::bytea, $5::bytea, $6::bytea, $7,
         'TELEGRAM_LOCATION_MANAGER', $8)
       RETURNING id, created_at::text`,
      [
        evidenceRef,
        applicant.id,
        latitudeEncrypted,
        longitudeEncrypted,
        horizontalAccuracyEncrypted,
        capturedAtEncrypted,
        input.consentVersion,
        piiKeyVersion,
      ],
    );
    const assessment = await assessKycLocationEvidence({
      client,
      userId: applicant.id,
      employerTenantId,
      evidenceId: evidence.rows[0]!.id,
      point,
      horizontalAccuracyMeters: input.horizontalAccuracyMeters,
      effectiveAt: input.capturedAt,
    });
    await insertKycLocationAssessment({
      client,
      evidenceId: evidence.rows[0]!.id,
      userId: applicant.id,
      employerTenantId: assessment.employerTenantId,
      actorUserRef: "SYSTEM",
      assessmentResult: assessment.assessmentResult,
      assessedScopeType: assessment.assessedScopeType,
      matchedZoneRef: assessment.matchedZoneRef,
      matchedZoneVersion: assessment.matchedZoneVersion,
    });
    await addAuditEvent(
      client,
      evidence.rows[0]!.id,
      "KYC_LOCATION_EVIDENCE_SUBMITTED",
      applicant.telegramUserRef,
      {
        evidenceRef,
        consentVersion: input.consentVersion,
        source: "TELEGRAM_LOCATION_MANAGER",
      },
      "KYC_LOCATION_EVIDENCE",
    );
    await addAuditEvent(
      client,
      evidence.rows[0]!.id,
      "KYC_LOCATION_EVIDENCE_ASSESSED",
      "SYSTEM",
      {
        evidenceRef,
        assessmentResult: assessment.assessmentResult,
        assessedScopeType: assessment.assessedScopeType,
        employerTenantId: assessment.employerTenantId,
        matchedZoneRef: assessment.matchedZoneRef,
        matchedZoneVersion: assessment.matchedZoneVersion,
        ruleVersion: KYC_LOCATION_RULE_VERSION,
      },
      "KYC_LOCATION_EVIDENCE",
    );
    await client.query("COMMIT");
    return reply.code(201).send({
      kycLocation: {
        assessmentResult: assessment.assessmentResult,
        submittedAt: evidence.rows[0]!.created_at,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

app.get(
  "/v1/local/public/kyc-location-evidence/status",
  async (request, reply) => {
    const applicant = await authenticatedApplicantUser(
      request.headers.cookie,
      request.headers["user-agent"],
    );
    if (!applicant) {
      return reply.code(401).send({ code: "TELEGRAM_AUTH_REQUIRED" });
    }
    return {
      kycLocation:
        (await loadLatestKycLocationStatus({
          client: pool,
          userId: applicant.id,
        })) ?? null,
    };
  },
);

app.post("/v1/local/applications", async (request, reply) => {
  if (isUnauthenticatedControlledPreview()) {
    return reply
      .code(403)
      .send({ code: "CONTROLLED_PREVIEW_APPLICATIONS_DISABLED" });
  }
  const input = createApplicationSchema.parse(request.body);
  const applicant = await authenticatedApplicant(
    request.headers.cookie,
    request.headers["user-agent"],
  );
  if (requiresTelegramAuthentication() && !applicant) {
    return reply.code(401).send({ code: "TELEGRAM_AUTH_REQUIRED" });
  }
  if (requiresTelegramAuthentication() && !input.personalProfile) {
    return reply.code(422).send({ code: "PERSONAL_PROFILE_REQUIRED" });
  }
  if (requiresTelegramAuthentication() && !input.employerTenantId) {
    return reply.code(422).send({ code: "EMPLOYER_TENANT_REQUIRED" });
  }
  if (requiresTelegramAuthentication() && !input.identityDocument) {
    return reply.code(422).send({ code: "IDENTITY_DOCUMENT_REQUIRED" });
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
  let identityLookupHash: string | undefined;
  let encryptedIdentityDocumentNumber: Buffer | undefined;
  if (input.identityDocument) {
    try {
      identityLookupHash = identityDocumentLookupHash(input.identityDocument);
      encryptedIdentityDocumentNumber = encryptPersonalValue(
        input.identityDocument.number
          .normalize("NFKC")
          .toUpperCase()
          .replace(/[ -]/g, ""),
      );
    } catch (error) {
      request.log.error(
        { err: error },
        "identity document storage unavailable",
      );
      return reply
        .code(503)
        .send({ code: "IDENTITY_DOCUMENT_STORAGE_UNAVAILABLE" });
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (input.employerTenantId) {
      const tenant = await client.query(
        "SELECT 1 FROM employer_tenants WHERE id = $1 AND is_active = true FOR KEY SHARE",
        [input.employerTenantId],
      );
      if (!tenant.rowCount) {
        await client.query("ROLLBACK");
        return reply.code(422).send({ code: "EMPLOYER_TENANT_UNAVAILABLE" });
      }
    }
    const employerRepaymentConfig = await loadEmployerRepaymentConfig(
      client,
      input.employerTenantId,
    );
    const availableRepaymentMethods =
      employerRepaymentConfig.availableRepaymentMethods;
    if (!availableRepaymentMethods.includes(input.selectedRepaymentMethod)) {
      await client.query("ROLLBACK");
      return reply.code(422).send({
        code: "REPAYMENT_METHOD_UNAVAILABLE",
        availableRepaymentMethods,
        defaultRepaymentMethod: employerRepaymentConfig.defaultRepaymentMethod,
      });
    }
    // The opaque per-application cookie is useful only for the controlled
    // preview, which deliberately has no Telegram container. Production
    // access must remain bound to the short-lived, revocable Telegram session.
    const applicantAccessToken = requiresTelegramAuthentication()
      ? undefined
      : randomBytes(32).toString("base64url");
    const user = await client.query<{
      id: string;
      identity_document_type: "NATIONAL_ID" | "PASSPORT" | null;
      identity_document_lookup_hash: string | null;
      telegram_phone_encrypted: Buffer | null;
    }>(
      `INSERT INTO users (
         telegram_user_ref, preferred_language, full_name_encrypted,
         phone_encrypted, employer_name_encrypted, personal_data_consent_version,
         personal_data_consented_at, personal_data_key_version,
         phone_consent_version, phone_consented_at, identity_document_type,
         identity_document_number_encrypted, identity_document_lookup_hash
       )
       VALUES (
         $1, $2, $3::bytea, $4::bytea, $5::bytea, $6,
         CASE WHEN $3::bytea IS NULL THEN NULL ELSE now() END,
         CASE WHEN $3::bytea IS NULL THEN NULL ELSE $7 END,
         CASE WHEN $4::bytea IS NULL THEN NULL ELSE $6 END,
         CASE WHEN $4::bytea IS NULL THEN NULL ELSE now() END, $8, $9::bytea, $10
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
         identity_document_type = COALESCE(EXCLUDED.identity_document_type, users.identity_document_type),
         identity_document_number_encrypted = COALESCE(EXCLUDED.identity_document_number_encrypted, users.identity_document_number_encrypted),
         identity_document_lookup_hash = COALESCE(EXCLUDED.identity_document_lookup_hash, users.identity_document_lookup_hash),
         updated_at = now()
       RETURNING id, identity_document_type, identity_document_lookup_hash,
                 telegram_phone_encrypted`,
      [
        telegramUserRef,
        input.preferredLanguage,
        encryptedPersonalProfile?.fullName,
        encryptedPersonalProfile?.phone,
        encryptedPersonalProfile?.employerName,
        "PAYEASE-PERSONAL-DATA-v1",
        activePersonalDataKeyVersion,
        input.identityDocument?.type,
        encryptedIdentityDocumentNumber,
        identityLookupHash,
      ],
    );
    if (requiresTelegramPhoneVerification() && input.personalProfile) {
      const verifiedPhone = user.rows[0]!.telegram_phone_encrypted;
      if (!verifiedPhone) {
        await client.query("ROLLBACK");
        return reply
          .code(422)
          .send({ code: "TELEGRAM_PHONE_VERIFICATION_REQUIRED" });
      }
      let matchingPhone = false;
      try {
        matchingPhone =
          normalizedPhoneNumber(decryptPersonalValue(verifiedPhone)) ===
          normalizedPhoneNumber(input.personalProfile.phone);
      } catch (error) {
        request.log.error(
          { err: error },
          "telegram phone verification unavailable",
        );
        await client.query("ROLLBACK");
        return reply
          .code(503)
          .send({ code: "TELEGRAM_PHONE_STORAGE_UNAVAILABLE" });
      }
      if (!matchingPhone) {
        await client.query("ROLLBACK");
        return reply.code(422).send({ code: "TELEGRAM_PHONE_MISMATCH" });
      }
    }
    if (
      user.rows[0]!.identity_document_type &&
      user.rows[0]!.identity_document_lookup_hash
    ) {
      // Serialize submissions that represent the same identity before the
      // active-application check. Without this transaction-scoped lock, two
      // separate Telegram accounts could both observe an empty queue and
      // create duplicate applications concurrently.
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 4701))",
        [
          `${user.rows[0]!.identity_document_type}|${user.rows[0]!.identity_document_lookup_hash}`,
        ],
      );
    }
    const existing = await client.query<{
      application_no: string;
      status: string;
      rejection_condition_resolved: boolean;
      belongs_to_current_user: boolean;
    }>(
      `SELECT a.application_no, a.status, a.rejection_condition_resolved,
              a.user_id = $1 AS belongs_to_current_user
         FROM applications a
         JOIN users existing_user ON existing_user.id = a.user_id
        WHERE (
            a.user_id = $1
            OR (
              $2::text IS NOT NULL AND $3::text IS NOT NULL
              AND existing_user.identity_document_type = $2
              AND existing_user.identity_document_lookup_hash = $3
            )
          )
          AND (
            a.status NOT IN ('REJECTED', 'SETTLED', 'CLOSED')
            OR (a.status = 'REJECTED' AND a.rejection_condition_resolved = false)
          )
        ORDER BY a.created_at DESC
        LIMIT 1
        FOR UPDATE`,
      [
        user.rows[0]!.id,
        user.rows[0]!.identity_document_type,
        user.rows[0]!.identity_document_lookup_hash,
      ],
    );
    const blockingApplication = existing.rows[0];
    if (blockingApplication) {
      await client.query("ROLLBACK");
      if (!blockingApplication.belongs_to_current_user) {
        // A different Telegram account must never learn another applicant's
        // application number or lifecycle state from an identity collision.
        return reply.code(409).send({
          code: "IDENTITY_DOCUMENT_ACTIVE_APPLICATION_EXISTS",
        });
      }
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
      `INSERT INTO applications (application_no, user_id, requested_amount_minor, currency, tenor_days, status, applicant_access_token_hash, employer_tenant_id, workflow_version)
       VALUES ($1, $2, $3, 'USD', $4, 'BROKER_REVIEW', $5, $6, 'SALARY_LOAN_V2')
       RETURNING id, application_no, status`,
      [
        applicationNo,
        user.rows[0]!.id,
        amountMinor.toString(),
        input.tenorDays,
        applicantAccessToken ? eventHash([applicantAccessToken]) : null,
        input.employerTenantId ?? null,
      ],
    );
    const application = created.rows[0]!;
    await client.query(
      `INSERT INTO application_repayment_preferences
         (application_id, workflow_version, selected_repayment_method, available_repayment_methods, employer_payroll_rule_version, collection_mode, collection_payee_ref)
       VALUES ($1, 'SALARY_LOAN_V2', $2, $3::text[], $4, $5, $6)`,
      [
        application.id,
        input.selectedRepaymentMethod,
        availableRepaymentMethods,
        employerRepaymentConfig.employerPayrollRuleVersion,
        SALARY_LOAN_V2_COLLECTION_SCOPE,
        "LICENSED_LENDER_SMILE_WALLET",
      ],
    );
    await client.query(
      `INSERT INTO application_authorization_snapshots
         (application_id, workflow_version, employer_verification_authorized, service_agreement_authorized,
          post_disbursement_brokerage_authorized, payroll_deduction_authorized, direct_debit_authorized,
          employer_verification_authorization_ref, service_agreement_authorization_ref,
          post_disbursement_brokerage_authorization_ref, payroll_deduction_authorization_ref,
          direct_debit_authorization_ref)
       VALUES ($1, 'SALARY_LOAN_V2', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        application.id,
        input.authorizationSnapshot.employerVerificationAuthorized,
        input.authorizationSnapshot.serviceAgreementAuthorized,
        input.authorizationSnapshot.postDisbursementBrokerageAuthorized,
        false,
        false,
        authorizationReference("AUTH-EMPLOYER"),
        authorizationReference("AUTH-SERVICE"),
        authorizationReference("AUTH-BROKERAGE"),
        null,
        null,
      ],
    );
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
        employerTenantSelected: Boolean(input.employerTenantId),
        workflowVersion: "SALARY_LOAN_V2",
        selectedRepaymentMethod: input.selectedRepaymentMethod,
        availableRepaymentMethods,
        collectionScope: SALARY_LOAN_V2_COLLECTION_SCOPE,
        identityDocumentProvided: Boolean(input.identityDocument),
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
        authorizationSnapshot: input.authorizationSnapshot,
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
      request.headers["user-agent"],
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
      user_id: string;
      application_no: string;
      requested_amount_minor: string;
      currency: string;
      tenor_days: number;
      status: string;
      workflow_version: "LEGACY_V1" | "SALARY_LOAN_V2";
      approved_amount_minor: string | null;
      rejection_condition_resolved: boolean;
      supplement_requested: boolean;
      rejected_reason_code: string | null;
      rejected_at: string | null;
      employer_tenant_display_name: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT applications.id, applications.user_id, applications.application_no, applications.requested_amount_minor::text,
            applications.currency, applications.tenor_days, applications.status,
            applications.workflow_version,
            approved_amount_minor::text, rejection_condition_resolved, supplement_requested,
            applications.created_at::text, applications.updated_at::text,
            tenant.display_name AS employer_tenant_display_name,
            (
              SELECT reason_code FROM approval_events
               WHERE application_id = applications.id AND decision = 'REJECTED'
               ORDER BY occurred_at DESC LIMIT 1
            ) AS rejected_reason_code,
            (
              SELECT occurred_at::text FROM approval_events
               WHERE application_id = applications.id AND decision = 'REJECTED'
               ORDER BY occurred_at DESC LIMIT 1
            ) AS rejected_at
       FROM applications
       LEFT JOIN employer_tenants tenant ON tenant.id = applications.employer_tenant_id
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
    const loanDetails = await loadLoanDetails(
      application.id,
      application.workflow_version,
    );
    const experience = await loadApplicantExperienceData(application.id);
    const timeline = await loadApplicantTimeline(application.id);
    const kycLocation = await loadLatestKycLocationStatus({
      client: pool,
      userId: application.user_id,
      applicationId: application.id,
    });
    const workflowSnapshot = await pool.query<{
      selected_repayment_method: string | null;
      available_repayment_methods: string[] | null;
      collection_scope: SalaryLoanV2CollectionScope | null;
      employer_verification_authorized: boolean | null;
      service_agreement_authorized: boolean | null;
      post_disbursement_brokerage_authorized: boolean | null;
      payroll_deduction_authorized: boolean | null;
      direct_debit_authorized: boolean | null;
    }>(
      `SELECT preference.selected_repayment_method,
              preference.available_repayment_methods,
              preference.collection_mode AS collection_scope,
              auth_snapshot.employer_verification_authorized,
              auth_snapshot.service_agreement_authorized,
              auth_snapshot.post_disbursement_brokerage_authorized,
              auth_snapshot.payroll_deduction_authorized,
              auth_snapshot.direct_debit_authorized
         FROM applications application_row
         LEFT JOIN application_repayment_preferences preference
           ON preference.application_id = application_row.id
         LEFT JOIN application_authorization_snapshots auth_snapshot
           ON auth_snapshot.application_id = application_row.id
        WHERE application_row.id = $1`,
      [application.id],
    );
    return formatApplicantLoanSummary(
      {
        applicationNo: application.application_no,
        status: application.status,
        requestedAmountMinor: application.requested_amount_minor,
        currency: application.currency,
        tenorDays: application.tenor_days,
        approvedAmountMinor: application.approved_amount_minor,
        rejectionConditionResolved: application.rejection_condition_resolved,
        rejectionCoolingOffEndsAt:
          application.status === "REJECTED" &&
          !application.rejection_condition_resolved
            ? applicantCoolingOffEndsAt(application.rejected_at)
            : null,
        rejectionCoolingOffDaysRemaining:
          application.status === "REJECTED" &&
          !application.rejection_condition_resolved
            ? applicantCoolingOffDaysRemaining(application.rejected_at)
            : null,
        rejectionNoticeCode: applicantRejectionNoticeCode(
          application.status,
          application.rejected_reason_code,
        ),
        supplementRequested: application.supplement_requested,
        employerTenantDisplayName: application.employer_tenant_display_name,
      },
      loanDetails.terms,
      loanDetails.repayment,
      {
        quote: loanDetails.quote,
        workflow: {
          workflowVersion: application.workflow_version,
          selectedRepaymentMethod:
            workflowSnapshot.rows[0]?.selected_repayment_method ?? null,
          availableRepaymentMethods:
            workflowSnapshot.rows[0]?.available_repayment_methods ?? [],
          collectionScope: workflowSnapshot.rows[0]?.collection_scope ?? null,
          employerVerificationAuthorized:
            workflowSnapshot.rows[0]?.employer_verification_authorized ?? false,
          serviceAgreementAuthorized:
            workflowSnapshot.rows[0]?.service_agreement_authorized ?? false,
          postDisbursementBrokerageAuthorized:
            workflowSnapshot.rows[0]?.post_disbursement_brokerage_authorized ??
            false,
        },
        recordDetail: {
          createdAt: application.created_at,
          updatedAt: application.updated_at,
          canUploadPaymentProof: canApplicantUploadPaymentProof(
            application.status,
          ),
          canRequestReassessment: canApplicantRequestReassessment(
            application.status,
          ),
        },
        repaymentProof: experience.repaymentProof,
        reassessmentRequest: experience.reassessmentRequest,
        kycLocation,
        timeline,
      },
    );
  },
);

app.get("/v1/local/public/applications", async (request, reply) => {
  const authenticatedUser = await authenticatedApplicant(
    request.headers.cookie,
    request.headers["user-agent"],
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
    rejected_at: string | null;
    created_at: Date;
    employer_tenant_display_name: string | null;
  }>(
    `SELECT applications.application_no, applications.status,
            applications.requested_amount_minor::text, applications.currency,
            applications.tenor_days, applications.approved_amount_minor::text,
            applications.rejection_condition_resolved, applications.supplement_requested,
            tenant.display_name AS employer_tenant_display_name,
            (
              SELECT reason_code FROM approval_events
               WHERE application_id = applications.id AND decision = 'REJECTED'
               ORDER BY occurred_at DESC LIMIT 1
            ) AS rejected_reason_code,
            (
              SELECT occurred_at::text FROM approval_events
               WHERE application_id = applications.id AND decision = 'REJECTED'
               ORDER BY occurred_at DESC LIMIT 1
            ) AS rejected_at,
            applications.created_at
       FROM applications
       JOIN users ON users.id = applications.user_id
       LEFT JOIN employer_tenants tenant ON tenant.id = applications.employer_tenant_id
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
      rejectionCoolingOffEndsAt:
        application.status === "REJECTED" &&
        !application.rejection_condition_resolved
          ? applicantCoolingOffEndsAt(application.rejected_at)
          : null,
      rejectionCoolingOffDaysRemaining:
        application.status === "REJECTED" &&
        !application.rejection_condition_resolved
          ? applicantCoolingOffDaysRemaining(application.rejected_at)
          : null,
      rejectionNoticeCode: applicantRejectionNoticeCode(
        application.status,
        application.rejected_reason_code,
      ),
      supplementRequested: application.supplement_requested,
      employerTenantDisplayName: application.employer_tenant_display_name,
      createdAt: application.created_at.toISOString(),
    })),
  };
});

app.get("/v1/local/public/notifications", async (request, reply) => {
  const query = z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(50).default(10),
    })
    .parse(request.query);
  const authenticatedUser = await authenticatedApplicant(
    request.headers.cookie,
    request.headers["user-agent"],
  );
  if (!authenticatedUser) {
    return reply.code(401).send({ code: "TELEGRAM_AUTH_REQUIRED" });
  }
  const user = await pool.query<{ id: string }>(
    "SELECT id FROM users WHERE telegram_user_ref = $1",
    [authenticatedUser.telegramUserRef],
  );
  if (!user.rowCount) {
    return reply.code(401).send({ code: "TELEGRAM_AUTH_REQUIRED" });
  }
  const notifications = await loadApplicantNotifications(user.rows[0]!.id);
  const page = Math.max(1, query.page);
  const pageSize = Math.max(1, query.pageSize);
  const paginated = paginateApplicantNotifications(
    notifications,
    page,
    pageSize,
  );
  return {
    page: Math.min(page, paginated.pageCount),
    pageSize,
    itemCount: paginated.itemCount,
    pageCount: paginated.pageCount,
    unreadCount: paginated.unreadCount,
    items: paginated.items,
  };
});

app.get(
  "/v1/local/public/notifications/:notificationId",
  async (request, reply) => {
    const params = z
      .object({ notificationId: z.string().regex(/^[a-f0-9]{64}$/i) })
      .parse(request.params);
    const authenticatedUser = await authenticatedApplicant(
      request.headers.cookie,
      request.headers["user-agent"],
    );
    if (!authenticatedUser) {
      return reply.code(401).send({ code: "TELEGRAM_AUTH_REQUIRED" });
    }
    const user = await pool.query<{ id: string }>(
      "SELECT id FROM users WHERE telegram_user_ref = $1",
      [authenticatedUser.telegramUserRef],
    );
    if (!user.rowCount) {
      return reply.code(401).send({ code: "TELEGRAM_AUTH_REQUIRED" });
    }
    const items = await loadApplicantNotifications(user.rows[0]!.id);
    const target = items.find((item) => item.id === params.notificationId);
    if (!target) {
      return reply.code(404).send({ code: "NOTIFICATION_NOT_FOUND" });
    }
    return target;
  },
);

app.post("/v1/local/public/notifications/read-all", async (request, reply) => {
  const authenticatedUser = await authenticatedApplicant(
    request.headers.cookie,
    request.headers["user-agent"],
  );
  if (!authenticatedUser) {
    return reply.code(401).send({ code: "TELEGRAM_AUTH_REQUIRED" });
  }
  const user = await pool.query<{ id: string }>(
    "SELECT id FROM users WHERE telegram_user_ref = $1",
    [authenticatedUser.telegramUserRef],
  );
  if (!user.rowCount) {
    return reply.code(401).send({ code: "TELEGRAM_AUTH_REQUIRED" });
  }
  const userId = user.rows[0]!.id;
  const items = await loadApplicantNotifications(userId);
  const unreadIds = items.filter((item) => item.unread).map((item) => item.id);
  if (unreadIds.length === 0) {
    return {
      readCount: 0,
      unreadCount: 0,
    };
  }
  const result = await pool.query<{ notification_id: string; read_at: string }>(
    `INSERT INTO applicant_notification_reads (user_id, notification_id)
       SELECT $1, notification_id
         FROM unnest($2::text[]) AS source(notification_id)
       ON CONFLICT (user_id, notification_id)
       DO UPDATE SET read_at = applicant_notification_reads.read_at
       RETURNING notification_id, read_at::text`,
    [userId, unreadIds],
  );
  return {
    readCount: result.rowCount,
    unreadCount: 0,
    readAt: result.rows[0]?.read_at,
  };
});

app.post(
  "/v1/local/public/notifications/:notificationId/read",
  async (request, reply) => {
    const params = z
      .object({ notificationId: z.string().regex(/^[a-f0-9]{64}$/i) })
      .parse(request.params);
    const authenticatedUser = await authenticatedApplicant(
      request.headers.cookie,
      request.headers["user-agent"],
    );
    if (!authenticatedUser) {
      return reply.code(401).send({ code: "TELEGRAM_AUTH_REQUIRED" });
    }
    const user = await pool.query<{ id: string }>(
      "SELECT id FROM users WHERE telegram_user_ref = $1",
      [authenticatedUser.telegramUserRef],
    );
    if (!user.rowCount) {
      return reply.code(401).send({ code: "TELEGRAM_AUTH_REQUIRED" });
    }
    const userId = user.rows[0]!.id;
    const items = await loadApplicantNotifications(userId);
    const target = items.find((item) => item.id === params.notificationId);
    if (!target) {
      return reply.code(404).send({ code: "NOTIFICATION_NOT_FOUND" });
    }
    const result = await pool.query<{ read_at: string }>(
      `INSERT INTO applicant_notification_reads (user_id, notification_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, notification_id)
       DO UPDATE SET read_at = applicant_notification_reads.read_at
       RETURNING read_at::text`,
      [userId, params.notificationId],
    );
    return {
      notificationId: params.notificationId,
      unread: false,
      readAt: result.rows[0]!.read_at,
    };
  },
);

const handleWalletOperationJumpExchange = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  if (!requireBrokerInternalMtls(request, reply)) return;
  const input = walletBrokerExchangeRequestSchema.parse(request.body);
  const headers = walletBrokerExchangeHeadersSchema.parse({
    algorithm: requestHeaderValue(request.headers["x-payease-wallet-algo"]),
    keyId: requestHeaderValue(request.headers["x-payease-wallet-key-id"]),
    nonce: requestHeaderValue(request.headers["x-payease-wallet-nonce"]),
    timestampMillis: requestHeaderValue(
      request.headers["x-payease-wallet-timestamp-millis"],
    ),
    signature: requestHeaderValue(
      request.headers["x-payease-wallet-signature"],
    ),
  });
  if (
    !isDomainEventTimestampWithinWindow({
      timestampMillis: headers.timestampMillis,
    })
  ) {
    return reply.code(408).send({ code: "WALLET_EXCHANGE_STALE_TIMESTAMP" });
  }
  const transportBodySha256 = sha256Hex(stableJson(input));
  if (
    !verifyWalletBrokerServiceSignature({
      method: "POST",
      path: "/v1/local/wallet-operation-jumps/exchange",
      headers,
      bodySha256: transportBodySha256,
    })
  ) {
    return reply.code(401).send({ code: "WALLET_EXCHANGE_BAD_SIGNATURE" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const consumedJump = await client.query<{
      application_id: string;
      jump_ref: string;
      operation_type: "WITHDRAWAL" | "REPAYMENT";
      expires_at: string;
    }>(
      `UPDATE wallet_operation_jumps
            SET consumed_at = now(),
                updated_at = now()
          WHERE jump_ref = $1
            AND jump_token_hash = $2
            AND operation_type = $3
            AND consumed_at IS NULL
            AND revoked_at IS NULL
            AND expires_at > now()
          RETURNING application_id, jump_ref, operation_type, expires_at::text`,
      [
        input.jumpRef,
        createHash("sha256").update(input.jumpToken).digest("hex"),
        input.operationType,
      ],
    );
    if (!consumedJump.rowCount) {
      await client.query("ROLLBACK");
      return reply.code(404).send({ code: "WALLET_OPERATION_JUMP_NOT_FOUND" });
    }
    const application = await client.query<{ application_no: string }>(
      `SELECT application_no
           FROM applications
          WHERE id = $1`,
      [consumedJump.rows[0]!.application_id],
    );
    if (!application.rowCount) {
      await client.query("ROLLBACK");
      return reply.code(404).send({ code: "APPLICATION_NOT_FOUND" });
    }
    const walletProjection = await client.query<{
      external_wallet_ref: string | null;
      wallet_status: string;
      available_balance_minor: string;
    }>(
      `SELECT external_wallet_ref,
                wallet_status,
                available_balance_minor::text
           FROM lender_wallet_projection_snapshots
          WHERE application_id = $1`,
      [consumedJump.rows[0]!.application_id],
    );
    const projection = walletProjection.rows[0];
    const payload = walletBrokerExchangeResponseSchema.parse({
      applicationNo: application.rows[0]!.application_no,
      walletOperationJumpRef: consumedJump.rows[0]!.jump_ref,
      operationType: consumedJump.rows[0]!.operation_type,
      externalWalletRef: projection?.external_wallet_ref ?? null,
      walletStatus: projection?.wallet_status ?? "WALLET_PENDING",
      availableBalanceMinor: projection?.available_balance_minor ?? "0",
      currency: "USD",
      brokerSessionNonce: randomBytes(16).toString("hex"),
      // PostgreSQL's ::text representation may use a numeric timezone offset
      // (for example, +00). The cross-domain schema requires RFC 3339 UTC
      // form, so normalize the database timestamp before signing the response.
      expiresAt: new Date(consumedJump.rows[0]!.expires_at).toISOString(),
    });
    await addAuditEvent(
      client,
      consumedJump.rows[0]!.application_id,
      "WALLET_OPERATION_JUMP_CONSUMED",
      "lender-wallet-service",
      {
        walletOperationJumpRef: consumedJump.rows[0]!.jump_ref,
        operationType: consumedJump.rows[0]!.operation_type,
        walletStatus: payload.walletStatus,
      },
    );
    await client.query("COMMIT");
    return payload;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

if (internalMtlsApp) {
  internalMtlsApp.post(
    "/v1/local/wallet-operation-jumps/exchange",
    handleWalletOperationJumpExchange,
  );
} else if (process.env.NODE_ENV === "test") {
  app.post(
    "/v1/local/wallet-operation-jumps/exchange",
    handleWalletOperationJumpExchange,
  );
}

app.post(
  "/v1/local/public/applications/:applicationNo/wallet-operation-jumps",
  async (request, reply) => {
    const applicant = await authenticatedApplicant(
      request.headers.cookie,
      request.headers["user-agent"],
    );
    if (!applicant) {
      return reply.code(401).send({ code: "TELEGRAM_AUTH_REQUIRED" });
    }
    if (!lenderWalletIntegrationEnabled) {
      return reply
        .code(503)
        .send({ code: "LENDER_WALLET_INTEGRATION_UNAVAILABLE" });
    }
    const params = z
      .object({ applicationNo: z.string().min(1) })
      .parse(request.params);
    const input = walletOperationJumpCreateSchema.parse(request.body);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const application = await lockApplicantOwnedApplication(
        client,
        params.applicationNo,
        applicant.telegramUserRef,
      );
      if (!application) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ code: "APPLICATION_NOT_FOUND" });
      }
      if (
        input.operationType === "REPAYMENT" &&
        application.status !== "REPAYMENT_ACTIVE"
      ) {
        await client.query("ROLLBACK");
        return reply.code(409).send({
          code: "WALLET_OPERATION_NOT_AVAILABLE",
          currentStatus: application.status,
        });
      }
      if (
        input.operationType === "WITHDRAWAL" &&
        application.status !== "DISBURSED" &&
        application.status !== "REPAYMENT_ACTIVE"
      ) {
        await client.query("ROLLBACK");
        return reply.code(409).send({
          code: "WALLET_OPERATION_NOT_AVAILABLE",
          currentStatus: application.status,
        });
      }
      if (input.operationType === "WITHDRAWAL") {
        const walletProjection = await loadWalletProjectionForUpdate(
          client,
          application.id,
        );
        const availableBalance = BigInt(
          walletProjection?.available_balance_minor ?? "0",
        );
        if (
          walletProjection?.wallet_status !== "WALLET_AVAILABLE" ||
          availableBalance <= 0n
        ) {
          await client.query("ROLLBACK");
          return reply.code(409).send({
            code: "WALLET_OPERATION_NOT_AVAILABLE",
            currentStatus: application.status,
            walletStatus: walletProjection?.wallet_status ?? "WALLET_PENDING",
          });
        }
      }
      let settings;
      try {
        settings = configuredWalletOperationJumpSettings();
      } catch (error) {
        request.log.error(
          { err: error },
          "wallet operation jump misconfigured",
        );
        await client.query("ROLLBACK");
        return reply.code(503).send({ code: "SMILE_WALLET_UNAVAILABLE" });
      }
      if (!settings) {
        await client.query("ROLLBACK");
        return reply.code(503).send({ code: "SMILE_WALLET_UNAVAILABLE" });
      }
      const jump = buildWalletOperationJump({
        settings,
        operationType: input.operationType,
      });
      await client.query(
        `UPDATE wallet_operation_jumps
            SET revoked_at = now(),
                updated_at = now()
          WHERE application_id = $1
            AND operation_type = $2
            AND consumed_at IS NULL
            AND revoked_at IS NULL
            AND expires_at > now()`,
        [application.id, input.operationType],
      );
      await client.query(
        `INSERT INTO wallet_operation_jumps
          (application_id, jump_ref, operation_type, jump_token_hash,
           target_host, expires_at, created_by_user_ref)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          application.id,
          jump.walletOperationJumpRef,
          input.operationType,
          jump.jumpTokenHash,
          jump.targetHost,
          jump.expiresAt,
          applicant.telegramUserRef,
        ],
      );
      await addAuditEvent(
        client,
        application.id,
        "WALLET_OPERATION_JUMP_CREATED",
        applicant.telegramUserRef,
        {
          walletOperationJumpRef: jump.walletOperationJumpRef,
          operationType: input.operationType,
          targetHost: jump.targetHost,
          expiresAt: jump.expiresAt,
        },
      );
      await client.query("COMMIT");
      return {
        applicationNo: params.applicationNo,
        operationType: input.operationType,
        walletOperationJumpRef: jump.walletOperationJumpRef,
        walletOperationUrl: jump.walletOperationUrl,
        expiresAt: jump.expiresAt,
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
  "/v1/local/public/applications/:applicationNo/payment-proofs",
  async (request, reply) => {
    const applicant = await authenticatedApplicant(
      request.headers.cookie,
      request.headers["user-agent"],
    );
    if (!applicant) {
      return reply.code(401).send({ code: "TELEGRAM_AUTH_REQUIRED" });
    }
    const idempotencyKey = manualActionIdempotencyKey(
      request.headers["idempotency-key"],
    );
    if (!idempotencyKey) {
      return reply.code(400).send({ code: "IDEMPOTENCY_KEY_REQUIRED" });
    }
    const params = z
      .object({ applicationNo: z.string().min(1) })
      .parse(request.params);
    const input =
      typeof request.headers["content-type"] === "string" &&
      /^multipart\/form-data/i.test(request.headers["content-type"])
        ? parseApplicantPaymentProofMultipart(
            request.headers["content-type"],
            request.body,
          )
        : applicantPaymentProofUploadSchema.parse(request.body);
    let encryptedContent: Buffer;
    let keyVersion: string;
    try {
      encryptedContent = encryptPersonalValue(input.contentBase64);
      keyVersion = personalDataKeyVersion();
    } catch (error) {
      request.log.error({ err: error }, "payment proof encryption unavailable");
      return reply
        .code(503)
        .send({ code: "PERSONAL_DATA_STORAGE_UNAVAILABLE" });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const application = await lockApplicantOwnedApplication(
        client,
        params.applicationNo,
        applicant.telegramUserRef,
      );
      if (!application) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ code: "APPLICATION_NOT_FOUND" });
      }
      const replay = await manualActionReplay(
        client,
        application,
        "APPLICANT_PAYMENT_PROOF_UPLOAD",
        applicant.telegramUserRef,
        idempotencyKey,
        {
          fileName: input.fileName,
          contentType: input.contentType,
          contentBase64Hash: eventHash([input.contentBase64]),
          transferReference: input.transferReference ?? null,
        },
      );
      if (replay.kind === "replay") {
        await client.query("ROLLBACK");
        return reply.code(replay.responseStatus).send(replay.responseBody);
      }
      if (replay.kind === "key-reused") {
        await client.query("ROLLBACK");
        return reply.code(409).send({ code: "IDEMPOTENCY_KEY_REUSED" });
      }
      if (!canApplicantUploadPaymentProof(application.status)) {
        await client.query("ROLLBACK");
        return reply.code(409).send({
          code: "PAYMENT_PROOF_NOT_AVAILABLE",
          currentStatus: application.status,
        });
      }
      const latestProof = await client.query<{ status: string }>(
        `SELECT status
           FROM applicant_payment_proofs
          WHERE application_id = $1
          ORDER BY submitted_at DESC
          LIMIT 1
          FOR UPDATE`,
        [application.id],
      );
      if (
        latestProof.rows[0]?.status === "UNDER_REVIEW" ||
        latestProof.rows[0]?.status === "RECONCILED"
      ) {
        await client.query("ROLLBACK");
        return reply.code(409).send({
          code: "PAYMENT_PROOF_ALREADY_ACTIVE",
          currentStatus: latestProof.rows[0]!.status,
        });
      }
      const owner = await client.query<{ user_id: string }>(
        `SELECT user_id FROM applications WHERE id = $1`,
        [application.id],
      );
      const proofNo = `PRF-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
      const created = await client.query<{
        proof_no: string;
        status: "UNDER_REVIEW";
        submitted_at: string;
      }>(
        `INSERT INTO applicant_payment_proofs
          (proof_no, application_id, user_id, file_name, content_type, file_size_bytes,
           file_content_encrypted, file_key_version, transfer_reference)
         VALUES ($1, $2, $3, $4, $5, $6, $7::bytea, $8, $9)
         RETURNING proof_no, status, submitted_at::text`,
        [
          proofNo,
          application.id,
          owner.rows[0]!.user_id,
          input.fileName,
          input.contentType,
          Buffer.from(input.contentBase64, "base64").byteLength,
          encryptedContent,
          keyVersion,
          input.transferReference ?? null,
        ],
      );
      const response = {
        proofNo: created.rows[0]!.proof_no,
        status: created.rows[0]!.status,
        submittedAt: created.rows[0]!.submitted_at,
      };
      await addAuditEvent(
        client,
        application.id,
        "APPLICANT_PAYMENT_PROOF_SUBMITTED",
        applicant.telegramUserRef,
        {
          proofNo,
          contentType: input.contentType,
          transferReferenceProvided: Boolean(input.transferReference),
        },
      );
      await recordManualActionResult(
        client,
        application,
        "APPLICANT_PAYMENT_PROOF_UPLOAD",
        applicant.telegramUserRef,
        replay,
        response,
      );
      await client.query("COMMIT");
      return reply.code(201).send(response);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
);

app.post(
  "/v1/local/public/applications/:applicationNo/reassessment-requests",
  async (request, reply) => {
    const applicant = await authenticatedApplicant(
      request.headers.cookie,
      request.headers["user-agent"],
    );
    if (!applicant) {
      return reply.code(401).send({ code: "TELEGRAM_AUTH_REQUIRED" });
    }
    const idempotencyKey = manualActionIdempotencyKey(
      request.headers["idempotency-key"],
    );
    if (!idempotencyKey) {
      return reply.code(400).send({ code: "IDEMPOTENCY_KEY_REQUIRED" });
    }
    const params = z
      .object({ applicationNo: z.string().min(1) })
      .parse(request.params);
    const input = applicantReassessmentRequestSchema.parse(request.body);
    let encryptedNote: Buffer | undefined;
    let keyVersion: string | undefined;
    if (input.note) {
      try {
        encryptedNote = encryptPersonalValue(input.note);
        keyVersion = personalDataKeyVersion();
      } catch (error) {
        request.log.error(
          { err: error },
          "reassessment request encryption unavailable",
        );
        return reply
          .code(503)
          .send({ code: "PERSONAL_DATA_STORAGE_UNAVAILABLE" });
      }
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const application = await lockApplicantOwnedApplication(
        client,
        params.applicationNo,
        applicant.telegramUserRef,
      );
      if (!application) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ code: "APPLICATION_NOT_FOUND" });
      }
      const replay = await manualActionReplay(
        client,
        application,
        "APPLICANT_REASSESSMENT_REQUEST",
        applicant.telegramUserRef,
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
      if (!canApplicantRequestReassessment(application.status)) {
        await client.query("ROLLBACK");
        return reply.code(409).send({
          code: "REASSESSMENT_NOT_AVAILABLE",
          currentStatus: application.status,
        });
      }
      const existing = await client.query<{ status: string }>(
        `SELECT status
           FROM applicant_reassessment_requests
          WHERE application_id = $1
            AND status IN ('SUBMITTED', 'UNDER_REVIEW')
          LIMIT 1
          FOR UPDATE`,
        [application.id],
      );
      if (existing.rowCount) {
        await client.query("ROLLBACK");
        return reply.code(409).send({
          code: "REASSESSMENT_ALREADY_ACTIVE",
          currentStatus: existing.rows[0]!.status,
        });
      }
      const owner = await client.query<{ user_id: string }>(
        `SELECT user_id FROM applications WHERE id = $1`,
        [application.id],
      );
      const requestNo = `REA-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
      const created = await client.query<{
        request_no: string;
        status: "SUBMITTED";
        created_at: string;
        id: string;
      }>(
        `INSERT INTO applicant_reassessment_requests
          (request_no, application_id, user_id, address_changed, employer_updated,
           wealth_proof_declared, note_encrypted, note_key_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7::bytea, $8)
         RETURNING id, request_no, status, created_at::text`,
        [
          requestNo,
          application.id,
          owner.rows[0]!.user_id,
          input.addressChanged,
          input.employerUpdated,
          input.wealthProofDeclared,
          encryptedNote ?? null,
          keyVersion ?? null,
        ],
      );
      const approvalCase = await client.query<{ id: string }>(
        `INSERT INTO approval_cases
          (aggregate_type, aggregate_id, workflow_definition_code, workflow_definition_version,
           current_step, status, assigned_role_code, strategy_requires_checker)
         VALUES ('REASSESSMENT_REQUEST', $1, 'REASSESSMENT_REVIEW_V1', 1,
           'BROKER_REVIEW', 'PENDING', 'BROKER_OFFICER', true)
         RETURNING id`,
        [created.rows[0]!.id],
      );
      await client.query(
        `UPDATE applicant_reassessment_requests
            SET approval_case_id = $1, updated_at = now()
          WHERE id = $2`,
        [approvalCase.rows[0]!.id, created.rows[0]!.id],
      );
      const response = {
        requestNo: created.rows[0]!.request_no,
        status: created.rows[0]!.status,
        submittedAt: created.rows[0]!.created_at,
      };
      await addAuditEvent(
        client,
        application.id,
        "APPLICANT_REASSESSMENT_REQUESTED",
        applicant.telegramUserRef,
        {
          requestNo,
          addressChanged: input.addressChanged,
          employerUpdated: input.employerUpdated,
          wealthProofDeclared: input.wealthProofDeclared,
          noteProvided: Boolean(input.note),
        },
      );
      await recordManualActionResult(
        client,
        application,
        "APPLICANT_REASSESSMENT_REQUEST",
        applicant.telegramUserRef,
        replay,
        response,
      );
      await client.query("COMMIT");
      return reply.code(201).send(response);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
);

app.put(
  "/v1/local/public/profile/preferred-language",
  async (request, reply) => {
    const authenticatedUser = await authenticatedApplicant(
      request.headers.cookie,
      request.headers["user-agent"],
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
    `SELECT id, application_no, requested_amount_minor::text AS requested_amount_minor,
            currency, tenor_days, status,
            approved_amount_minor::text AS approved_amount_minor,
            rejection_condition_resolved, supplement_requested, created_at,
            workflow_version
     FROM applications WHERE application_no = $1`,
    [params.applicationNo],
  );
  if (result.rowCount === 0)
    return reply.code(404).send({ code: "APPLICATION_NOT_FOUND" });
  const application = result.rows[0]!;
  const loanDetails = await loadLoanDetails(
    application.id,
    application.workflow_version,
  );
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
    {
      quote: loanDetails.quote,
      workflow: { workflowVersion: application.workflow_version },
    },
  );
});

app.post(
  "/v1/local/applications/:applicationNo/broker-review",
  createStageHandler(
    "BROKER_REVIEW",
    "BROKER_REVIEW",
    "EMPLOYER_VERIFICATION",
    "BROKER_OFFICER",
    brokerReviewSchema,
    "BROKER_REVIEW",
  ),
);

app.post(
  "/v1/local/applications/:applicationNo/employer-identity-match",
  async (request, reply) => {
    if (!requireRole(request, reply, "EMPLOYER_HR")) return;
    const idempotencyKey = manualActionIdempotencyKey(
      request.headers["idempotency-key"],
    );
    if (!idempotencyKey)
      return reply.code(400).send({ code: "IDEMPOTENCY_KEY_REQUIRED" });
    const params = z
      .object({ applicationNo: z.string().min(1) })
      .parse(request.params);
    const input = z
      .object({
        // HR enters the number from the factory's own personnel record.
        // The applicant's number is never returned to the employer portal.
        identityDocumentNumber: z
          .string()
          .trim()
          .regex(/^[A-Za-z0-9][A-Za-z0-9 -]{4,63}$/),
        reasonCode: z.string().min(1).max(64),
      })
      .parse(request.body) as EmploymentIdentityMatchCommand;
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
        "EMPLOYER_IDENTITY_MATCH",
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
      if (application.status !== "EMPLOYER_VERIFICATION") {
        await client.query("ROLLBACK");
        return reply.code(409).send({
          code: "INVALID_APPLICATION_STATE",
          currentStatus: application.status,
        });
      }
      const access = await employerTenantAccess(
        client,
        application,
        actorUserRef,
      );
      if (access === "APPLICATION_UNASSIGNED") {
        await client.query("ROLLBACK");
        return reply.code(409).send({ code: "EMPLOYER_TENANT_NOT_ASSIGNED" });
      }
      if (access === "DENIED") {
        await client.query("ROLLBACK");
        return reply.code(403).send({ code: "EMPLOYER_TENANT_ACCESS_DENIED" });
      }
      const existingMatch = await client.query<{
        employment_identity_match_status: string;
      }>(
        "SELECT employment_identity_match_status FROM applications WHERE id = $1",
        [application.id],
      );
      if (
        existingMatch.rows[0]?.employment_identity_match_status !== "PENDING"
      ) {
        await client.query("ROLLBACK");
        return reply
          .code(409)
          .send({ code: "EMPLOYMENT_IDENTITY_MATCH_ALREADY_RECORDED" });
      }
      const applicantIdentity = await client.query<{
        identity_document_type: "NATIONAL_ID" | "PASSPORT" | null;
        identity_document_lookup_hash: string | null;
      }>(
        `SELECT u.identity_document_type, u.identity_document_lookup_hash
           FROM users u JOIN applications a ON a.user_id = u.id
          WHERE a.id = $1`,
        [application.id],
      );
      const storedIdentity = applicantIdentity.rows[0];
      if (
        !storedIdentity?.identity_document_type ||
        !storedIdentity.identity_document_lookup_hash
      ) {
        await client.query("ROLLBACK");
        return reply
          .code(409)
          .send({ code: "IDENTITY_DOCUMENT_NOT_AVAILABLE" });
      }
      let identityMatchStatus: "MATCHED" | "NOT_MATCHED";
      try {
        identityMatchStatus = identityDocumentLookupHashesMatch(
          storedIdentity.identity_document_lookup_hash,
          identityDocumentLookupHash({
            type: storedIdentity.identity_document_type,
            number: input.identityDocumentNumber,
          }),
        )
          ? "MATCHED"
          : "NOT_MATCHED";
      } catch (error) {
        request.log.error(
          { err: error },
          "identity document comparison unavailable",
        );
        await client.query("ROLLBACK");
        return reply
          .code(503)
          .send({ code: "IDENTITY_DOCUMENT_STORAGE_UNAVAILABLE" });
      }
      await client.query(
        `UPDATE applications
            SET employment_identity_match_status = $1,
                employment_identity_matched_at = now(),
                employment_identity_matched_by = $2
          WHERE id = $3`,
        [identityMatchStatus, actorUserRef, application.id],
      );
      await addAuditEvent(
        client,
        application.id,
        "EMPLOYMENT_IDENTITY_MATCH_RECORDED",
        actorUserRef,
        { decision: identityMatchStatus, reasonCode: input.reasonCode },
      );
      const response = {
        applicationNo: params.applicationNo,
        identityMatchStatus,
      };
      await recordManualActionResult(
        client,
        application,
        "EMPLOYER_IDENTITY_MATCH",
        actorUserRef,
        replay,
        response,
      );
      await client.query("COMMIT");
      return response;
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
    (application) =>
      application.workflow_version === "SALARY_LOAN_V2"
        ? "LENDER_INITIAL_REVIEW"
        : "EMPLOYER_FINANCE_VERIFICATION",
    "EMPLOYER_HR",
    employerVerificationSchema,
    "EMPLOYER_VERIFICATION",
  ),
);

app.post(
  "/v1/local/applications/:applicationNo/employer-finance-verification",
  async (request, reply) => {
    if (!requireRole(request, reply, "EMPLOYER_FINANCE")) return;
    const idempotencyKey = manualActionIdempotencyKey(
      request.headers["idempotency-key"],
    );
    if (!idempotencyKey)
      return reply.code(400).send({ code: "IDEMPOTENCY_KEY_REQUIRED" });
    const params = z
      .object({ applicationNo: z.string().min(1) })
      .parse(request.params);
    const input = employerCollectionVerificationSchema.parse(request.body);
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
        "EMPLOYER_FINANCE_VERIFICATION",
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
      const access = await employerTenantAccess(
        client,
        application,
        actorUserRef,
      );
      if (access === "APPLICATION_UNASSIGNED") {
        await client.query("ROLLBACK");
        return reply.code(409).send({ code: "EMPLOYER_TENANT_NOT_ASSIGNED" });
      }
      if (access === "DENIED") {
        await client.query("ROLLBACK");
        return reply.code(403).send({ code: "EMPLOYER_TENANT_ACCESS_DENIED" });
      }
      const instruction =
        await loadEmployerPayrollCollectionInstructionForUpdate(
          client,
          application.id,
          input.collectionSequence,
        );
      if (!instruction) {
        await client.query("ROLLBACK");
        return reply
          .code(409)
          .send({ code: "NO_PAYROLL_COLLECTION_INSTRUCTION" });
      }
      await client.query(
        `INSERT INTO approval_events
          (application_id, stage, decision, actor_user_ref, actor_role,
           reason_code, review_round, repayment_installment_no, occurred_at)
         VALUES ($1, 'EMPLOYER_FINANCE_VERIFICATION', $2, $3, 'EMPLOYER_FINANCE', $4, $5, $6, now())`,
        [
          application.id,
          input.collectionResult === "COLLECTED"
            ? "APPROVED"
            : input.collectionResult === "PARTIALLY_COLLECTED"
              ? "RETURNED"
              : "REJECTED",
          actorUserRef,
          input.reasonCode,
          application.review_round,
          instruction.repayment_installment_no,
        ],
      );

      let projectionStatus: EmployerPayrollInstructionStatus =
        instruction.projection_status;
      let payrollEventType:
        | "PAYROLL_COLLECTION_REPORTED"
        | "PARTIALLY_COLLECTED_REPORTED"
        | "NOT_COLLECTED_REPORTED";
      if (input.collectionResult === "COLLECTED") {
        projectionStatus = "COLLECTION_RECONCILIATION_PENDING";
        payrollEventType = "PAYROLL_COLLECTION_REPORTED";
      } else if (input.collectionResult === "PARTIALLY_COLLECTED") {
        projectionStatus = "COLLECTION_EXCEPTION";
        payrollEventType = "PARTIALLY_COLLECTED_REPORTED";
      } else {
        projectionStatus = "COLLECTION_EXCEPTION";
        payrollEventType = "NOT_COLLECTED_REPORTED";
      }
      const actualCollectedAmountMinor = BigInt(
        input.actualCollectedAmountMinor,
      );
      if (
        input.collectionResult === "COLLECTED" &&
        actualCollectedAmountMinor !==
          BigInt(instruction.scheduled_amount_minor)
      ) {
        await client.query("ROLLBACK");
        return reply.code(422).send({
          code: "INVALID_COLLECTION_AMOUNT",
          scheduledAmountMinor: instruction.scheduled_amount_minor,
        });
      }
      if (
        input.collectionResult === "PARTIALLY_COLLECTED" &&
        actualCollectedAmountMinor >= BigInt(instruction.scheduled_amount_minor)
      ) {
        await client.query("ROLLBACK");
        return reply.code(422).send({
          code: "INVALID_PARTIAL_COLLECTION_AMOUNT",
          scheduledAmountMinor: instruction.scheduled_amount_minor,
        });
      }
      const employerEventRef = `EMPLOYER-COLLECTION-${application.id}-${instruction.repayment_installment_no}-${Date.now()}`;
      await client.query(
        `UPDATE employer_payroll_collection_instructions
            SET projection_status = $1,
                reported_event_ref = $2,
                reported_by_user_ref = $3,
                reported_reason_code = $4,
                reported_collection_result = $5,
                reported_actual_amount_minor = $6,
                reported_evidence_reference = $7,
                reported_at = now(),
                updated_at = now()
          WHERE id = $8`,
        [
          projectionStatus,
          employerEventRef,
          actorUserRef,
          input.reasonCode,
          input.collectionResult,
          input.actualCollectedAmountMinor,
          input.evidenceReference,
          instruction.id,
        ],
      );
      await client.query(
        `INSERT INTO payroll_collection_events
          (application_id, workflow_version, event_type, source_domain,
           actor_user_ref, payroll_run_date, amount_minor, currency,
           evidence_reference, reason_code, occurred_at)
         VALUES (
           $1, 'SALARY_LOAN_V2', $2, 'EMPLOYER',
           $3, $4, $5, 'USD', $6, $7, now()
         )`,
        [
          application.id,
          payrollEventType,
          actorUserRef,
          instruction.scheduled_due_date,
          input.actualCollectedAmountMinor,
          input.evidenceReference,
          input.reasonCode,
        ],
      );
      const workItem = await createLenderCollectionWorkItem(
        client,
        application,
        actorUserRef,
        {
          sourceType: "EMPLOYER_PAYROLL_REPORT",
          collectionResult: input.collectionResult,
          actualCollectedAmountMinor: input.actualCollectedAmountMinor,
          evidenceReference: input.evidenceReference,
          sourceReference: employerEventRef,
          reasonCode: input.reasonCode,
          collectionSequence: instruction.repayment_installment_no,
          metadata: {
            collectionScope: instruction.collection_scope,
            scheduledAmountMinor: instruction.scheduled_amount_minor,
            projectionStatus,
          },
        },
      );

      await addAuditEvent(
        client,
        application.id,
        "EMPLOYER_PAYROLL_COLLECTION_REPORTED",
        actorUserRef,
        {
          collectionResult: input.collectionResult,
          reasonCode: input.reasonCode,
          collectionSequence: instruction.repayment_installment_no,
          collectionScope: instruction.collection_scope,
          actualCollectedAmountMinor: input.actualCollectedAmountMinor,
          evidenceReference: input.evidenceReference,
          projectionStatus,
          lenderCollectionWorkItemId: workItem.workItemId,
          lenderCollectionExceptionId: workItem.exceptionId,
        },
      );
      const response = {
        applicationNo: params.applicationNo,
        status: projectionStatus,
        collectionSequence: instruction.repayment_installment_no,
        actualCollectedAmountMinor: input.actualCollectedAmountMinor,
        lenderCollectionWorkItemId: workItem.workItemId,
        lenderCollectionExceptionId: workItem.exceptionId,
      };
      await recordManualActionResult(
        client,
        application,
        "EMPLOYER_FINANCE_VERIFICATION",
        actorUserRef,
        replay,
        response,
      );
      await client.query("COMMIT");
      return response;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
);

app.get("/v1/local/employer/verifications/open", async (request, reply) => {
  const roles = request.adminIdentity!.roles;
  const isHr = roles.includes("EMPLOYER_HR");
  const isFinance = roles.includes("EMPLOYER_FINANCE");
  if (!isHr && !isFinance) {
    return reply.code(403).send({ code: "FORBIDDEN__ROLE_OUT_OF_SCOPE" });
  }
  const items: Array<Record<string, unknown>> = [];
  if (isHr) {
    const hrQueue = await pool.query<{
      application_no: string;
      status: string;
      created_at: Date;
      identity_document_type: "NATIONAL_ID" | "PASSPORT" | null;
      employment_identity_match_status: "PENDING" | "MATCHED" | "NOT_MATCHED";
      employer_tenant_id: string;
    }>(
      `SELECT a.application_no, a.status, a.created_at,
              u.identity_document_type,
              a.employment_identity_match_status,
              a.employer_tenant_id
         FROM applications a
         JOIN users u ON u.id = a.user_id
         JOIN employer_tenants tenant
           ON tenant.id = a.employer_tenant_id
          AND tenant.is_active = true
         JOIN employer_tenant_members m
           ON m.employer_tenant_id = a.employer_tenant_id
         JOIN admin_accounts account
           ON account.id = m.account_id
        WHERE account.login_name = $1
          AND account.is_active = true
          AND a.status = 'EMPLOYER_VERIFICATION'
        ORDER BY a.created_at ASC`,
      [request.adminIdentity!.loginName],
    );
    items.push(
      ...hrQueue.rows.map((row) => ({
        applicationNo: row.application_no,
        stage: row.status,
        createdAt: row.created_at.toISOString(),
        identityDocumentType: row.identity_document_type,
        identityMatchStatus: row.employment_identity_match_status,
        employerTenantId: row.employer_tenant_id,
      })),
    );
  }
  if (isFinance) {
    const financeQueue = await pool.query<{
      application_no: string;
      projection_status: EmployerPayrollInstructionStatus;
      created_at: Date;
      employer_tenant_id: string;
      repayment_installment_no: number;
      scheduled_due_date: string;
      scheduled_amount_minor: string;
      selected_repayment_method: "EMPLOYER_PAYROLL_DEDUCTION";
      collection_scope: SalaryLoanV2CollectionScope;
    }>(
      `SELECT a.application_no,
              instruction.projection_status,
              instruction.created_at,
              instruction.employer_tenant_id,
              instruction.repayment_installment_no,
              instruction.scheduled_due_date::text,
              instruction.scheduled_amount_minor::text,
              instruction.selected_repayment_method,
              instruction.collection_scope
         FROM employer_payroll_collection_instructions instruction
         JOIN applications a
           ON a.id = instruction.application_id
         JOIN employer_tenants tenant
           ON tenant.id = instruction.employer_tenant_id
          AND tenant.is_active = true
         JOIN employer_tenant_members m
           ON m.employer_tenant_id = instruction.employer_tenant_id
         JOIN admin_accounts account
           ON account.id = m.account_id
        WHERE account.login_name = $1
          AND account.is_active = true
          AND instruction.projection_status = 'PAYROLL_COLLECTION_PENDING'
        ORDER BY instruction.scheduled_due_date ASC,
                 instruction.repayment_installment_no ASC`,
      [request.adminIdentity!.loginName],
    );
    items.push(
      ...financeQueue.rows.map((row) => ({
        applicationNo: row.application_no,
        stage: row.projection_status,
        createdAt: row.created_at.toISOString(),
        employerTenantId: row.employer_tenant_id,
        collectionSequence: row.repayment_installment_no,
        dueDate: row.scheduled_due_date,
        scheduledAmountMinor: row.scheduled_amount_minor,
        selectedRepaymentMethod: row.selected_repayment_method,
        payrollDeductionAuthorized: true,
        collectionScope: row.collection_scope,
      })),
    );
  }
  return {
    items,
  };
});

app.get(
  "/v1/local/lender-repayment-work-items/open",
  async (request, reply) => {
    if (!requireLenderRepaymentRole(request, reply)) return;
    const result = await pool.query<{
      id: string;
      application_no: string;
      repayment_installment_no: number;
      selected_repayment_method: RepaymentMethod;
      source_type: LenderCollectionSourceType;
      collection_result: LenderCollectionResult;
      reported_amount_minor: string;
      evidence_reference: string;
      work_item_status: LenderCollectionWorkItemStatus;
      created_at: string;
    }>(
      `SELECT item.id,
            application_row.application_no,
            item.repayment_installment_no,
            item.selected_repayment_method,
            item.source_type,
            item.collection_result,
            item.reported_amount_minor::text,
            item.evidence_reference,
            item.work_item_status,
            item.created_at::text
       FROM lender_collection_work_items item
       JOIN applications application_row ON application_row.id = item.application_id
      WHERE item.work_item_status IN ('OPEN', 'PROCESSING', 'EXCEPTION')
      ORDER BY item.created_at ASC`,
    );
    return {
      items: result.rows.map((row) => ({
        workItemId: row.id,
        applicationNo: row.application_no,
        collectionSequence: row.repayment_installment_no,
        selectedRepaymentMethod: row.selected_repayment_method,
        sourceType: row.source_type,
        collectionResult: row.collection_result,
        reportedAmountMinor: row.reported_amount_minor,
        evidenceReference: row.evidence_reference,
        workItemStatus: row.work_item_status,
        createdAt: row.created_at,
      })),
    };
  },
);

app.get(
  "/v1/local/lender-collection-exceptions/open",
  async (request, reply) => {
    if (!requireLenderRepaymentRole(request, reply)) return;
    const result = await pool.query<{
      id: string;
      application_no: string;
      repayment_installment_no: number;
      selected_repayment_method: RepaymentMethod;
      exception_type: LenderCollectionExceptionType;
      reason_code: string;
      evidence_reference: string;
      reported_amount_minor: string;
      created_at: string;
      work_item_id: string;
    }>(
      `SELECT exception.id,
              application_row.application_no,
              exception.repayment_installment_no,
              exception.selected_repayment_method,
              exception.exception_type,
              exception.reason_code,
              exception.evidence_reference,
              exception.reported_amount_minor::text,
              exception.created_at::text,
              exception.work_item_id
         FROM lender_collection_exceptions exception
         JOIN applications application_row ON application_row.id = exception.application_id
        WHERE exception.status = 'OPEN'
        ORDER BY exception.created_at ASC`,
    );
    return {
      items: result.rows.map((row) => ({
        exceptionId: row.id,
        workItemId: row.work_item_id,
        applicationNo: row.application_no,
        collectionSequence: row.repayment_installment_no,
        selectedRepaymentMethod: row.selected_repayment_method,
        exceptionType: row.exception_type,
        reasonCode: row.reason_code,
        evidenceReference: row.evidence_reference,
        reportedAmountMinor: row.reported_amount_minor,
        createdAt: row.created_at,
      })),
    };
  },
);

app.post(
  "/v1/local/lender-collection-exceptions/:exceptionId/resolve",
  async (request, reply) => {
    if (!requireRole(request, reply, "LENDER_REPAYMENT_CHECKER")) return;
    const params = z
      .object({ exceptionId: z.string().uuid() })
      .parse(request.params);
    const input = lenderCollectionExceptionResolutionSchema.parse(request.body);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const exception = await client.query<{
        id: string;
        application_id: string;
        status: "OPEN" | "RESOLVED" | "CLOSED";
      }>(
        `SELECT id, application_id, status
           FROM lender_collection_exceptions
          WHERE id = $1
          FOR UPDATE`,
        [params.exceptionId],
      );
      const item = exception.rows[0];
      if (!item) {
        await client.query("ROLLBACK");
        return reply
          .code(404)
          .send({ code: "LENDER_COLLECTION_EXCEPTION_NOT_FOUND" });
      }
      if (item.status !== "OPEN") {
        await client.query("ROLLBACK");
        return reply.code(409).send({
          code: "LENDER_COLLECTION_EXCEPTION_NOT_OPEN",
          currentStatus: item.status,
        });
      }
      await client.query(
        `UPDATE lender_collection_exceptions
            SET status = 'RESOLVED',
                resolved_by_user_ref = $1,
                resolution_reason_code = $2,
                resolution_evidence_reference = $3,
                resolved_at = now(),
                updated_at = now()
          WHERE id = $4`,
        [
          request.adminIdentity!.loginName,
          input.reasonCode,
          input.evidenceReference,
          item.id,
        ],
      );
      await addAuditEvent(
        client,
        item.application_id,
        "LENDER_COLLECTION_EXCEPTION_RESOLVED",
        request.adminIdentity!.loginName,
        {
          exceptionId: item.id,
          reasonCode: input.reasonCode,
          evidenceReference: input.evidenceReference,
        },
      );
      await client.query("COMMIT");
      return { exceptionId: item.id, status: "RESOLVED" };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
);

app.post(
  "/v1/local/applications/:applicationNo/lender-collection-work-items",
  async (request, reply) => {
    if (!requireRole(request, reply, "BROKER_OFFICER")) return;
    const params = z
      .object({ applicationNo: z.string().min(1) })
      .parse(request.params);
    const input = lenderCollectionWorkItemCreateSchema.parse(request.body);
    const actorUserRef = request.adminIdentity!.loginName;
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
      const workItem = await createLenderCollectionWorkItem(
        client,
        application,
        actorUserRef,
        {
          sourceType: input.sourceType,
          collectionResult: input.collectionResult,
          actualCollectedAmountMinor: input.actualCollectedAmountMinor,
          evidenceReference: input.evidenceReference,
          sourceReference:
            input.sourceReference ??
            `${input.sourceType}:${input.evidenceReference}:${input.collectionSequence ?? "NEXT"}`,
          reasonCode: input.reasonCode,
          collectionSequence: input.collectionSequence,
          metadata: {
            fixture: "DAY3_UAT",
          },
        },
      );
      await addAuditEvent(
        client,
        application.id,
        "LENDER_COLLECTION_WORK_ITEM_CREATED",
        actorUserRef,
        {
          sourceType: input.sourceType,
          collectionResult: input.collectionResult,
          collectionSequence: workItem.collectionSequence,
          actualCollectedAmountMinor: input.actualCollectedAmountMinor,
          evidenceReference: input.evidenceReference,
          lenderCollectionWorkItemId: workItem.workItemId,
          lenderCollectionExceptionId: workItem.exceptionId,
        },
      );
      await client.query("COMMIT");
      return reply.code(201).send({
        applicationNo: params.applicationNo,
        collectionSequence: workItem.collectionSequence,
        selectedRepaymentMethod: workItem.selectedRepaymentMethod,
        workItemId: workItem.workItemId,
        workItemStatus: workItem.workItemStatus,
        exceptionId: workItem.exceptionId,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: string }).code === "23505"
      ) {
        return reply
          .code(409)
          .send({ code: "DUPLICATE_COLLECTION_SOURCE_REFERENCE" });
      }
      if (error instanceof Error) {
        if (error.message === "COLLECTION_SOURCE_REPAYMENT_METHOD_MISMATCH") {
          return reply
            .code(409)
            .send({ code: "COLLECTION_SOURCE_REPAYMENT_METHOD_MISMATCH" });
        }
        if (error.message === "COLLECTION_INSTALLMENT_NOT_FOUND") {
          return reply
            .code(409)
            .send({ code: "COLLECTION_INSTALLMENT_NOT_FOUND" });
        }
      }
      throw error;
    } finally {
      client.release();
    }
  },
);

app.post(
  "/v1/local/applications/:applicationNo/lender-initial-review",
  createStageHandler(
    "LENDER_INITIAL_REVIEW",
    "LENDER_INITIAL_REVIEW",
    "LENDER_FINAL_REVIEW",
    "LENDER_CREDIT_OFFICER",
    lenderInitialReviewSchema,
    "LENDER_INITIAL_REVIEW",
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
    "LENDER_FINAL_REVIEW",
    async (client, application, input, actorUserRef) => {
      if (input.decision !== "APPROVED") return;
      if (
        !input.approvedAmountMinor ||
        !input.actualDisbursementAmountMinor ||
        !input.lenderInterestMinor ||
        !input.totalRepaymentAmountMinor ||
        !input.brokerageRemunerationReceivableMinor ||
        !input.installmentCount ||
        !input.firstDueDate ||
        !input.productRuleVersion ||
        !input.brokerageRemunerationRuleVersion ||
        !input.lenderInterestRuleVersion
      ) {
        throw new Error(
          "approved final review requires complete V2 quote terms",
        );
      }
      const approvedAmountMinor = BigInt(input.approvedAmountMinor);
      const actualDisbursementAmountMinor = BigInt(
        input.actualDisbursementAmountMinor,
      );
      const lenderInterestMinor = BigInt(input.lenderInterestMinor);
      const totalRepaymentAmountMinor = BigInt(input.totalRepaymentAmountMinor);
      const brokerageRemunerationReceivableMinor = BigInt(
        input.brokerageRemunerationReceivableMinor,
      );
      if (approvedAmountMinor < 1000n || approvedAmountMinor > 50000n) {
        throw new Error("approved amount is outside the V2 salary loan range");
      }
      if (actualDisbursementAmountMinor !== approvedAmountMinor) {
        throw new Error("actual disbursement must equal approved principal");
      }
      if (
        totalRepaymentAmountMinor !==
        approvedAmountMinor + lenderInterestMinor
      ) {
        throw new Error(
          "total repayment amount must equal principal plus lender interest",
        );
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
          lenderInterestMinor.toString(),
          totalRepaymentAmountMinor.toString(),
          input.installmentCount,
          input.firstDueDate,
          actorUserRef,
        ],
      );
      await client.query(
        `INSERT INTO application_v2_quote_snapshots
          (application_id, workflow_version, principal_amount_minor,
           actual_disbursement_amount_minor, lender_interest_minor,
           total_repayment_amount_minor,
           brokerage_remuneration_receivable_minor, product_rule_version,
           brokerage_remuneration_rule_version, lender_interest_rule_version,
           installment_count, first_due_date, created_by_user_ref)
         VALUES ($1, 'SALARY_LOAN_V2', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (application_id) DO UPDATE SET
           principal_amount_minor = EXCLUDED.principal_amount_minor,
           actual_disbursement_amount_minor = EXCLUDED.actual_disbursement_amount_minor,
           lender_interest_minor = EXCLUDED.lender_interest_minor,
           total_repayment_amount_minor = EXCLUDED.total_repayment_amount_minor,
           brokerage_remuneration_receivable_minor = EXCLUDED.brokerage_remuneration_receivable_minor,
           product_rule_version = EXCLUDED.product_rule_version,
           brokerage_remuneration_rule_version = EXCLUDED.brokerage_remuneration_rule_version,
           lender_interest_rule_version = EXCLUDED.lender_interest_rule_version,
           installment_count = EXCLUDED.installment_count,
           first_due_date = EXCLUDED.first_due_date,
           created_by_user_ref = EXCLUDED.created_by_user_ref`,
        [
          application.id,
          approvedAmountMinor.toString(),
          actualDisbursementAmountMinor.toString(),
          lenderInterestMinor.toString(),
          totalRepaymentAmountMinor.toString(),
          brokerageRemunerationReceivableMinor.toString(),
          input.productRuleVersion,
          input.brokerageRemunerationRuleVersion,
          input.lenderInterestRuleVersion,
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
    const applicant = await authenticatedApplicant(
      request.headers.cookie,
      request.headers["user-agent"],
    );
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
    const applicant = await authenticatedApplicant(
      request.headers.cookie,
      request.headers["user-agent"],
    );
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
    const applicant = await authenticatedApplicant(
      request.headers.cookie,
      request.headers["user-agent"],
    );
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
    const applicant = await authenticatedApplicant(
      request.headers.cookie,
      request.headers["user-agent"],
    );
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
    const applicant = await authenticatedApplicant(
      request.headers.cookie,
      request.headers["user-agent"],
    );
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
  "/v1/local/service-cases/:caseNo/acknowledge",
  async (request, reply) => {
    if (!requireRole(request, reply, "BROKER_OFFICER")) return;
    const params = z
      .object({ caseNo: z.string().min(1) })
      .parse(request.params);
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
      if (record.status !== "OPEN" && record.status !== "ACKNOWLEDGED") {
        await client.query("ROLLBACK");
        return reply.code(409).send({
          code: "INVALID_SERVICE_CASE_STATE",
          currentStatus: record.status,
        });
      }
      if (record.status === "OPEN") {
        await client.query(
          "UPDATE applicant_service_cases SET status = 'ACKNOWLEDGED' WHERE id = $1",
          [record.id],
        );
        await addAuditEvent(
          client,
          record.id,
          "APPLICANT_SERVICE_CASE_ACKNOWLEDGED",
          request.adminIdentity!.loginName,
          { caseNo: params.caseNo },
          "SERVICE_CASE",
        );
      }
      await client.query("COMMIT");
      return { caseNo: params.caseNo, status: "ACKNOWLEDGED" };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
);

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
    const applicant = await authenticatedApplicant(
      request.headers.cookie,
      request.headers["user-agent"],
    );
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
      await ensureEmployerPayrollCollectionInstructions(
        client,
        application.id,
        actorUserRef,
      );
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
      await ensureEmployerPayrollCollectionInstructions(
        client,
        application.id,
        actorUserRef,
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
      const lenderCollectionWorkItem =
        await loadActiveLenderCollectionWorkItemForInstallment(
          client,
          application.id,
          nextInstallment.installment_no,
        );
      if (lenderCollectionWorkItem) {
        await client.query(
          `UPDATE lender_collection_work_items
              SET work_item_status = 'PROCESSING',
                  assigned_to_user_ref = $1,
                  updated_at = now()
            WHERE id = $2`,
          [actorUserRef, lenderCollectionWorkItem.id],
        );
      }
      const result = {
        applicationNo: params.applicationNo,
        status: "REPAYMENT_ACTIVE",
        approval: "MAKER_RECORDED",
        lenderCollectionWorkItemId: lenderCollectionWorkItem?.id ?? null,
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
      const lenderCollectionWorkItem =
        await loadActiveLenderCollectionWorkItemForInstallment(
          client,
          application.id,
          nextInstallment.installment_no,
        );
      if (lenderCollectionWorkItem) {
        await client.query(
          `UPDATE lender_collection_work_items
              SET work_item_status = 'CONFIRMED',
                  confirmed_by_user_ref = $1,
                  confirmed_at = now(),
                  updated_at = now()
            WHERE id = $2`,
          [actorUserRef, lenderCollectionWorkItem.id],
        );
      }
      await client.query(
        `UPDATE repayment_installments
         SET status = 'PAID', amount_paid_minor = amount_due_minor, paid_at = now()
         WHERE id = $1`,
        [nextInstallment.id],
      );
      await markEmployerPayrollInstructionReconciled(
        client,
        application.id,
        nextInstallment.installment_no,
      );
      if (nextStatus === "REPAYMENT_ACTIVE") {
        await promoteNextEmployerPayrollCollectionInstruction(
          client,
          application.id,
        );
      }
      const result = {
        applicationNo: params.applicationNo,
        status: nextStatus,
        lenderCollectionWorkItemId: lenderCollectionWorkItem?.id ?? null,
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

app.get("/v1/local/payment-proofs/open", async (request, reply) => {
  if (!requirePaymentProofReviewRole(request, reply)) return;
  const result = await pool.query<{
    proof_no: string;
    application_no: string;
    status: "UNDER_REVIEW" | "NEEDS_MORE" | "RECONCILED" | "EXCEPTION";
    file_name: string;
    content_type: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
    transfer_reference: string | null;
    submitted_at: string;
  }>(
    `SELECT p.proof_no, a.application_no, p.status, p.file_name, p.content_type,
            p.transfer_reference, p.submitted_at::text
       FROM applicant_payment_proofs p
       JOIN applications a ON a.id = p.application_id
      WHERE p.status = 'UNDER_REVIEW'
      ORDER BY p.submitted_at ASC`,
  );
  return {
    items: result.rows.map((row) => ({
      proofNo: row.proof_no,
      applicationNo: row.application_no,
      status: row.status,
      fileName: row.file_name,
      contentType: row.content_type,
      transferReference: row.transfer_reference,
      submittedAt: row.submitted_at,
    })),
  };
});

app.get("/v1/local/payment-proofs/:proofNo", async (request, reply) => {
  if (!requirePaymentProofReviewRole(request, reply)) return;
  const params = z.object({ proofNo: z.string().min(1) }).parse(request.params);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const proof = await lockPaymentProof(client, params.proofNo);
    if (!proof) {
      await client.query("ROLLBACK");
      return reply.code(404).send({ code: "PAYMENT_PROOF_NOT_FOUND" });
    }
    let contentBase64: string;
    try {
      contentBase64 = decryptPersonalValue(proof.file_content_encrypted);
    } catch (error) {
      request.log.error({ err: error }, "payment proof decryption unavailable");
      await client.query("ROLLBACK");
      return reply
        .code(503)
        .send({ code: "PERSONAL_DATA_STORAGE_UNAVAILABLE" });
    }
    await addAuditEvent(
      client,
      proof.id,
      "APPLICANT_PAYMENT_PROOF_VIEWED",
      request.adminIdentity!.loginName,
      { proofNo: proof.proof_no },
      "APPLICANT_PAYMENT_PROOF",
    );
    await client.query("COMMIT");
    return {
      proofNo: proof.proof_no,
      applicationId: proof.application_id,
      status: proof.status,
      fileName: proof.file_name,
      contentType: proof.content_type,
      transferReference: proof.transfer_reference,
      submittedAt: proof.submitted_at,
      contentBase64,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

app.post("/v1/local/payment-proofs/:proofNo/review", async (request, reply) => {
  if (!requirePaymentProofReviewRole(request, reply)) return;
  const idempotencyKey = manualActionIdempotencyKey(
    request.headers["idempotency-key"],
  );
  if (!idempotencyKey)
    return reply.code(400).send({ code: "IDEMPOTENCY_KEY_REQUIRED" });
  const params = z.object({ proofNo: z.string().min(1) }).parse(request.params);
  const input = applicantPaymentProofReviewSchema.parse(request.body);
  const actorUserRef = request.adminIdentity!.loginName;
  const actorRole = request.adminIdentity!.roles.includes(
    "LENDER_REPAYMENT_CHECKER",
  )
    ? "LENDER_REPAYMENT_CHECKER"
    : "BROKER_OFFICER";
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const proof = await lockPaymentProof(client, params.proofNo);
    if (!proof) {
      await client.query("ROLLBACK");
      return reply.code(404).send({ code: "PAYMENT_PROOF_NOT_FOUND" });
    }
    const application = await lockApplicationById(client, proof.application_id);
    if (!application) {
      await client.query("ROLLBACK");
      return reply.code(404).send({ code: "APPLICATION_NOT_FOUND" });
    }
    const replay = await manualActionReplay(
      client,
      application,
      "APPLICANT_PAYMENT_PROOF_REVIEW",
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
    if (proof.status !== "UNDER_REVIEW") {
      await client.query("ROLLBACK");
      return reply.code(409).send({
        code: "PAYMENT_PROOF_REVIEW_NOT_AVAILABLE",
        currentStatus: proof.status,
      });
    }
    await client.query(
      `UPDATE applicant_payment_proofs
          SET status = $1,
              review_reason_code = $2,
              reviewed_by_user_ref = $3,
              reviewed_at = now()
        WHERE id = $4`,
      [input.status, input.reasonCode, actorUserRef, proof.id],
    );
    let lenderCollectionWorkItem:
      | Readonly<{
          workItemId: string;
          exceptionId: string | null;
        }>
      | undefined;
    if (input.status === "RECONCILED") {
      const pendingInstallment = await loadRepaymentInstallmentForCollection(
        client,
        application.id,
      );
      if (pendingInstallment) {
        try {
          const created = await createLenderCollectionWorkItem(
            client,
            application,
            actorUserRef,
            {
              sourceType: "USER_MANUAL_PAYMENT_PROOF",
              collectionResult: "COLLECTED",
              actualCollectedAmountMinor: pendingInstallment.amount_due_minor,
              evidenceReference:
                proof.transfer_reference ?? `${proof.proof_no}-REVIEWED`,
              sourceReference: proof.proof_no,
              reasonCode: input.reasonCode,
              metadata: {
                reviewedStatus: input.status,
                proofNo: proof.proof_no,
                transferReference: proof.transfer_reference,
              },
            },
          );
          lenderCollectionWorkItem = {
            workItemId: created.workItemId,
            exceptionId: created.exceptionId,
          };
        } catch (error) {
          if (
            !(error instanceof Error) ||
            error.message !== "COLLECTION_SOURCE_REPAYMENT_METHOD_MISMATCH"
          ) {
            throw error;
          }
        }
      }
    }
    const response = {
      proofNo: proof.proof_no,
      status: input.status,
      reviewedBy: actorUserRef,
      lenderCollectionWorkItemId: lenderCollectionWorkItem?.workItemId ?? null,
    };
    await addAuditEvent(
      client,
      proof.id,
      "APPLICANT_PAYMENT_PROOF_REVIEWED",
      actorUserRef,
      {
        proofNo: proof.proof_no,
        actorRole,
        lenderCollectionWorkItemId:
          lenderCollectionWorkItem?.workItemId ?? null,
        ...input,
      },
      "APPLICANT_PAYMENT_PROOF",
    );
    await recordManualActionResult(
      client,
      application,
      "APPLICANT_PAYMENT_PROOF_REVIEW",
      actorUserRef,
      replay,
      response,
    );
    await client.query("COMMIT");
    return response;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

app.get("/v1/local/reassessment-requests/open", async (request, reply) => {
  if (!requireReassessmentQueueRole(request, reply)) return;
  const roles = request.adminIdentity!.roles;
  const assignedRoleCodes = [
    ...(roles.includes("BROKER_OFFICER") ? ["BROKER_OFFICER"] : []),
    ...(roles.includes("LENDER_CREDIT_OFFICER")
      ? ["LENDER_CREDIT_OFFICER"]
      : []),
    ...(roles.includes("LENDER_CREDIT_REVIEWER")
      ? ["LENDER_CREDIT_REVIEWER"]
      : []),
  ];
  const result = await pool.query<{
    request_no: string;
    application_no: string;
    status: string;
    current_step: string;
    assigned_role_code: string | null;
    created_at: string;
  }>(
    `SELECT r.request_no, a.application_no, r.status, c.current_step,
            c.assigned_role_code, r.created_at::text
       FROM applicant_reassessment_requests r
       JOIN applications a ON a.id = r.application_id
       JOIN approval_cases c ON c.id = r.approval_case_id
      WHERE c.workflow_definition_code = 'REASSESSMENT_REVIEW_V1'
        AND c.status IN ('PENDING', 'RETURNED')
        AND c.assigned_role_code = ANY($1::text[])
      ORDER BY r.created_at ASC`,
    [assignedRoleCodes],
  );
  return {
    items: result.rows.map((row) => ({
      requestNo: row.request_no,
      applicationNo: row.application_no,
      status: row.status,
      currentStep: row.current_step,
      assignedRoleCode: row.assigned_role_code,
      submittedAt: row.created_at,
    })),
  };
});

app.get(
  "/v1/local/reassessment-requests/:requestNo",
  async (request, reply) => {
    if (!requireReassessmentQueueRole(request, reply)) return;
    const params = z
      .object({ requestNo: z.string().min(1) })
      .parse(request.params);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const record = await lockReassessmentRequest(client, params.requestNo);
      if (!record) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ code: "REASSESSMENT_REQUEST_NOT_FOUND" });
      }
      const approvalCase = record.approval_case_id
        ? await client.query<{
            current_step: string;
            status: string;
            assigned_role_code: string | null;
          }>(
            `SELECT current_step, status, assigned_role_code
               FROM approval_cases
              WHERE id = $1
              FOR UPDATE`,
            [record.approval_case_id],
          )
        : undefined;
      let note: string | null = null;
      if (record.note_encrypted) {
        try {
          note = decryptPersonalValue(record.note_encrypted);
        } catch (error) {
          request.log.error(
            { err: error },
            "reassessment note decryption unavailable",
          );
          await client.query("ROLLBACK");
          return reply
            .code(503)
            .send({ code: "PERSONAL_DATA_STORAGE_UNAVAILABLE" });
        }
      }
      await addAuditEvent(
        client,
        record.id,
        "APPLICANT_REASSESSMENT_VIEWED",
        request.adminIdentity!.loginName,
        { requestNo: record.request_no },
        "APPLICANT_REASSESSMENT_REQUEST",
      );
      await client.query("COMMIT");
      return {
        requestNo: record.request_no,
        applicationId: record.application_id,
        status: record.status,
        addressChanged: record.address_changed,
        employerUpdated: record.employer_updated,
        wealthProofDeclared: record.wealth_proof_declared,
        submittedAt: record.created_at,
        note,
        approvalCase: approvalCase?.rows[0]
          ? {
              currentStep: approvalCase.rows[0]!.current_step,
              status: approvalCase.rows[0]!.status,
              assignedRoleCode: approvalCase.rows[0]!.assigned_role_code,
            }
          : null,
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
  "/v1/local/reassessment-requests/:requestNo/broker-review",
  async (request, reply) => {
    if (!requireRole(request, reply, "BROKER_OFFICER")) return;
    const idempotencyKey = manualActionIdempotencyKey(
      request.headers["idempotency-key"],
    );
    if (!idempotencyKey)
      return reply.code(400).send({ code: "IDEMPOTENCY_KEY_REQUIRED" });
    const params = z
      .object({ requestNo: z.string().min(1) })
      .parse(request.params);
    const input = applicantReassessmentBrokerReviewSchema.parse(request.body);
    const actorUserRef = request.adminIdentity!.loginName;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const record = await lockReassessmentRequest(client, params.requestNo);
      if (!record || !record.approval_case_id) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ code: "REASSESSMENT_REQUEST_NOT_FOUND" });
      }
      const application = await lockApplicationById(
        client,
        record.application_id,
      );
      if (!application) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ code: "APPLICATION_NOT_FOUND" });
      }
      const replay = await manualActionReplay(
        client,
        application,
        "REASSESSMENT_BROKER_REVIEW",
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
      const approvalCase = await client.query<{
        current_step: string;
        status: string;
        current_round: number;
      }>(
        `SELECT current_step, status, current_round
           FROM approval_cases
          WHERE id = $1
          FOR UPDATE`,
        [record.approval_case_id],
      );
      const item = approvalCase.rows[0];
      if (!item || item.current_step !== "BROKER_REVIEW") {
        await client.query("ROLLBACK");
        return reply
          .code(409)
          .send({ code: "REASSESSMENT_REVIEW_NOT_AVAILABLE" });
      }
      await client.query(
        `INSERT INTO approval_case_events
          (approval_case_id, step, action, actor_user_ref, actor_role, reason_code,
           input_snapshot_hash, idempotency_key, occurred_at, current_round)
         VALUES ($1, 'BROKER_REVIEW', $2, $3, 'BROKER_OFFICER', $4, $5, $6, now(), $7)`,
        [
          record.approval_case_id,
          approvalCaseAction(input.decision),
          actorUserRef,
          input.reasonCode,
          eventHash([JSON.stringify(input)]),
          idempotencyKey,
          item.current_round,
        ],
      );
      if (input.decision === "APPROVED") {
        await client.query(
          `UPDATE approval_cases
              SET current_step = 'CREDIT_MAKER_REVIEW',
                  status = 'PENDING',
                  assigned_role_code = 'LENDER_CREDIT_OFFICER',
                  updated_at = now()
            WHERE id = $1`,
          [record.approval_case_id],
        );
        await client.query(
          `UPDATE applicant_reassessment_requests
              SET status = 'UNDER_REVIEW', updated_at = now()
            WHERE id = $1`,
          [record.id],
        );
      } else if (input.decision === "RETURNED") {
        await client.query(
          `UPDATE approval_cases
              SET status = 'RETURNED',
                  assigned_role_code = 'BROKER_OFFICER',
                  current_round = current_round + 1,
                  updated_at = now()
            WHERE id = $1`,
          [record.approval_case_id],
        );
        await client.query(
          `UPDATE applicant_reassessment_requests
              SET status = 'UNDER_REVIEW', updated_at = now()
            WHERE id = $1`,
          [record.id],
        );
      } else {
        await client.query(
          `UPDATE approval_cases
              SET status = 'REJECTED', updated_at = now()
            WHERE id = $1`,
          [record.approval_case_id],
        );
        await client.query(
          `UPDATE applicant_reassessment_requests
              SET status = 'DECLINED',
                  decision_reason_code = $1,
                  reviewed_by_user_ref = $2,
                  reviewed_at = now(),
                  updated_at = now()
            WHERE id = $3`,
          [input.reasonCode, actorUserRef, record.id],
        );
      }
      const response = {
        requestNo: record.request_no,
        decision: input.decision,
      };
      await addAuditEvent(
        client,
        record.id,
        "APPLICANT_REASSESSMENT_BROKER_REVIEWED",
        actorUserRef,
        { requestNo: record.request_no, ...input },
        "APPLICANT_REASSESSMENT_REQUEST",
      );
      await recordManualActionResult(
        client,
        application,
        "REASSESSMENT_BROKER_REVIEW",
        actorUserRef,
        replay,
        response,
      );
      await client.query("COMMIT");
      return response;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
);

app.post(
  "/v1/local/reassessment-requests/:requestNo/lender-review",
  async (request, reply) => {
    if (!requireReassessmentQueueRole(request, reply)) return;
    const idempotencyKey = manualActionIdempotencyKey(
      request.headers["idempotency-key"],
    );
    if (!idempotencyKey)
      return reply.code(400).send({ code: "IDEMPOTENCY_KEY_REQUIRED" });
    const params = z
      .object({ requestNo: z.string().min(1) })
      .parse(request.params);
    const input = applicantReassessmentLenderReviewSchema.parse(request.body);
    const actorUserRef = request.adminIdentity!.loginName;
    const roles = request.adminIdentity!.roles;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const record = await lockReassessmentRequest(client, params.requestNo);
      if (!record || !record.approval_case_id) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ code: "REASSESSMENT_REQUEST_NOT_FOUND" });
      }
      const application = await lockApplicationById(
        client,
        record.application_id,
      );
      if (!application) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ code: "APPLICATION_NOT_FOUND" });
      }
      const replay = await manualActionReplay(
        client,
        application,
        "REASSESSMENT_LENDER_REVIEW",
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
      const approvalCase = await client.query<{
        current_step: string;
        status: string;
        current_round: number;
      }>(
        `SELECT current_step, status, current_round
           FROM approval_cases
          WHERE id = $1
          FOR UPDATE`,
        [record.approval_case_id],
      );
      const item = approvalCase.rows[0];
      if (!item) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ code: "REASSESSMENT_REQUEST_NOT_FOUND" });
      }
      const actorRole =
        item.current_step === "CREDIT_MAKER_REVIEW"
          ? "LENDER_CREDIT_OFFICER"
          : "LENDER_CREDIT_REVIEWER";
      if (
        (item.current_step === "CREDIT_MAKER_REVIEW" &&
          !roles.includes("LENDER_CREDIT_OFFICER")) ||
        (item.current_step === "CREDIT_CHECKER_REVIEW" &&
          !roles.includes("LENDER_CREDIT_REVIEWER"))
      ) {
        await client.query("ROLLBACK");
        return reply.code(403).send({ code: "FORBIDDEN__ROLE_OUT_OF_SCOPE" });
      }
      if (
        item.current_step === "CREDIT_CHECKER_REVIEW" &&
        input.decision === "APPROVED"
      ) {
        const maker = await client.query<{ actor_user_ref: string }>(
          `SELECT actor_user_ref
             FROM approval_case_events
            WHERE approval_case_id = $1
              AND step = 'CREDIT_MAKER_REVIEW'
              AND action = 'APPROVE'
              AND current_round = $2
            ORDER BY occurred_at DESC
            LIMIT 1`,
          [record.approval_case_id, item.current_round],
        );
        if (maker.rows[0]?.actor_user_ref === actorUserRef) {
          await client.query("ROLLBACK");
          return reply.code(409).send({ code: "DUAL_CONTROL_CONFLICT" });
        }
      }
      await client.query(
        `INSERT INTO approval_case_events
          (approval_case_id, step, action, actor_user_ref, actor_role, reason_code,
           input_snapshot_hash, idempotency_key, occurred_at, current_round)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), $9)`,
        [
          record.approval_case_id,
          item.current_step,
          approvalCaseAction(input.decision),
          actorUserRef,
          actorRole,
          input.reasonCode,
          eventHash([JSON.stringify(input)]),
          idempotencyKey,
          item.current_round,
        ],
      );
      if (item.current_step === "CREDIT_MAKER_REVIEW") {
        if (input.decision === "APPROVED") {
          await client.query(
            `UPDATE approval_cases
                SET current_step = 'CREDIT_CHECKER_REVIEW',
                    status = 'PENDING',
                    assigned_role_code = 'LENDER_CREDIT_REVIEWER',
                    updated_at = now()
              WHERE id = $1`,
            [record.approval_case_id],
          );
        } else if (input.decision === "RETURNED") {
          await client.query(
            `UPDATE approval_cases
                SET current_step = 'BROKER_REVIEW',
                    status = 'RETURNED',
                    assigned_role_code = 'BROKER_OFFICER',
                    current_round = current_round + 1,
                    updated_at = now()
              WHERE id = $1`,
            [record.approval_case_id],
          );
        } else {
          await client.query(
            `UPDATE approval_cases
                SET status = 'REJECTED', updated_at = now()
              WHERE id = $1`,
            [record.approval_case_id],
          );
          await client.query(
            `UPDATE applicant_reassessment_requests
                SET status = 'DECLINED',
                    decision_reason_code = $1,
                    reviewed_by_user_ref = $2,
                    reviewed_at = now(),
                    updated_at = now()
              WHERE id = $3`,
            [input.reasonCode, actorUserRef, record.id],
          );
        }
      } else if (item.current_step === "CREDIT_CHECKER_REVIEW") {
        if (input.decision === "APPROVED") {
          await client.query(
            `UPDATE approval_cases
                SET current_step = 'OFFER_READY',
                    status = 'COMPLETED',
                    assigned_role_code = 'LENDER_CREDIT_REVIEWER',
                    updated_at = now()
              WHERE id = $1`,
            [record.approval_case_id],
          );
          await client.query(
            `UPDATE applicant_reassessment_requests
                SET status = 'APPROVED',
                    decision_reason_code = $1,
                    reviewed_by_user_ref = $2,
                    reviewed_at = now(),
                    updated_at = now()
              WHERE id = $3`,
            [input.reasonCode, actorUserRef, record.id],
          );
        } else if (input.decision === "RETURNED") {
          await client.query(
            `UPDATE approval_cases
                SET current_step = 'CREDIT_MAKER_REVIEW',
                    status = 'RETURNED',
                    assigned_role_code = 'LENDER_CREDIT_OFFICER',
                    current_round = current_round + 1,
                    updated_at = now()
              WHERE id = $1`,
            [record.approval_case_id],
          );
        } else {
          await client.query(
            `UPDATE approval_cases
                SET status = 'REJECTED', updated_at = now()
              WHERE id = $1`,
            [record.approval_case_id],
          );
          await client.query(
            `UPDATE applicant_reassessment_requests
                SET status = 'DECLINED',
                    decision_reason_code = $1,
                    reviewed_by_user_ref = $2,
                    reviewed_at = now(),
                    updated_at = now()
              WHERE id = $3`,
            [input.reasonCode, actorUserRef, record.id],
          );
        }
      } else {
        await client.query("ROLLBACK");
        return reply
          .code(409)
          .send({ code: "REASSESSMENT_REVIEW_NOT_AVAILABLE" });
      }
      const response = {
        requestNo: record.request_no,
        decision: input.decision,
        step: item.current_step,
      };
      await addAuditEvent(
        client,
        record.id,
        "APPLICANT_REASSESSMENT_LENDER_REVIEWED",
        actorUserRef,
        { requestNo: record.request_no, actorRole, ...input },
        "APPLICANT_REASSESSMENT_REQUEST",
      );
      await recordManualActionResult(
        client,
        application,
        "REASSESSMENT_LENDER_REVIEW",
        actorUserRef,
        replay,
        response,
      );
      await client.query("COMMIT");
      return response;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
);

app.get("/v1/local/reconciliation/open", async (request, reply) => {
  if (!requireRole(request, reply, "EMPLOYER_FINANCE")) return;
  const result = await pool.query(
    `SELECT r.id, a.application_no, r.evidence_type, r.evidence_reference, r.status,
            r.assigned_to_user_ref, r.resolution_reason, r.created_at
     FROM reconciliation_work_items r
     JOIN applications a ON a.id = r.application_id
     JOIN employer_tenants tenant ON tenant.id = a.employer_tenant_id
     JOIN employer_tenant_members membership
       ON membership.employer_tenant_id = a.employer_tenant_id
     JOIN admin_accounts account ON account.id = membership.account_id
     WHERE r.status IN ('OPEN', 'DIFFERENCE')
       AND account.login_name = $1
       AND account.is_active = true
       AND tenant.is_active = true
     ORDER BY r.created_at ASC`,
    [request.adminIdentity!.loginName],
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

async function reconciliationTenantAccess(
  client: PoolClient,
  applicationId: string,
  loginName: string,
): Promise<boolean> {
  const membership = await client.query(
    `SELECT 1
       FROM applications application_row
       JOIN employer_tenants tenant ON tenant.id = application_row.employer_tenant_id
       JOIN employer_tenant_members membership
         ON membership.employer_tenant_id = application_row.employer_tenant_id
       JOIN admin_accounts account ON account.id = membership.account_id
      WHERE application_row.id = $1 AND account.login_name = $2
        AND account.is_active = true AND tenant.is_active = true`,
    [applicationId, loginName],
  );
  return Boolean(membership.rowCount);
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
      if (
        !(await reconciliationTenantAccess(
          client,
          workItem.application_id,
          request.adminIdentity!.loginName,
        ))
      ) {
        await client.query("ROLLBACK");
        return reply.code(403).send({ code: "EMPLOYER_TENANT_ACCESS_DENIED" });
      }
      const assignee = await client.query(
        `SELECT 1
           FROM applications application_row
           JOIN employer_tenants tenant ON tenant.id = application_row.employer_tenant_id
           JOIN employer_tenant_members membership
             ON membership.employer_tenant_id = application_row.employer_tenant_id
           JOIN admin_accounts account ON account.id = membership.account_id
           JOIN admin_account_roles account_role ON account_role.account_id = account.id
           JOIN roles role ON role.id = account_role.role_id
          WHERE application_row.id = $1 AND account.login_name = $2
            AND account.is_active = true AND tenant.is_active = true
            AND role.code = 'EMPLOYER_FINANCE'`,
        [workItem.application_id, input.assigneeLoginName],
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
      !(await reconciliationTenantAccess(
        client,
        workItem.application_id,
        request.adminIdentity!.loginName,
      ))
    ) {
      await client.query("ROLLBACK");
      return reply.code(403).send({ code: "EMPLOYER_TENANT_ACCESS_DENIED" });
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
  await internalMtlsApp?.close();
  await app.close();
  await pool.end();
};

if (process.env.NODE_ENV !== "test") {
  // Fail before opening the port when real applicant authentication would be
  // impossible. Per-request configuration is still used so a compromised Bot
  // can be disabled without a restart.
  if (lenderWalletIntegrationEnabled) {
    configuredWalletBrokerServiceSecrets();
  }
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
  try {
    await app.listen({ host, port });
    if (internalMtlsApp) {
      await internalMtlsApp.listen(brokerInternalMtlsListenSettings());
    }
  } catch (error) {
    app.log.error(error);
    await close();
    process.exit(1);
  }
}

export { app, close, internalMtlsApp };
