import { createHash, randomBytes, randomUUID } from "node:crypto";
import Fastify from "fastify";
import { Pool, type PoolClient } from "pg";
import { z } from "zod";
import {
  brokerReviewSchema,
  bootstrapAdminSchema,
  adminAccountCreateSchema,
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
import { hashPassword, verifyPassword } from "./passwords.js";
import {
  buildRepaymentSchedule,
  formatApplicantLoanSummary,
  summarizeRepaymentSchedule,
  type RepaymentScheduleItem,
} from "./repayment.js";
import {
  configuredTelegramBots,
  verifyTelegramMiniAppInitData,
} from "./telegram-auth.js";
import { requiresTelegramAuthentication } from "./telegram-auth-policy.js";
import {
  encryptPersonalProfile,
  personalDataKeyVersion,
} from "./personal-profile.js";
import { runDatabaseMigrations } from "./database-migrations.js";

declare module "fastify" {
  interface FastifyRequest {
    adminIdentity?: { loginName: string; roles: string[] };
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

// Schema failures are client input errors.  Never surface them as a 500, which
// would make malformed public submissions look like a service outage.
app.setErrorHandler((error, _request, reply) => {
  if (error instanceof z.ZodError) {
    return reply.code(400).send({
      code: "VALIDATION_ERROR",
      fields: error.issues.map((issue) => issue.path.join(".")),
    });
  }
  reply.send(error);
});

function sessionToken(cookieHeader: string | undefined): string | undefined {
  return cookieHeader
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("payease_session="))
    ?.slice("payease_session=".length);
}

function applicantAccessToken(
  cookieHeader: string | undefined,
): string | undefined {
  return cookieHeader
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("payease_application="))
    ?.slice("payease_application=".length);
}

function applicantSessionToken(
  cookieHeader: string | undefined,
): string | undefined {
  return cookieHeader
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("payease_applicant_session="))
    ?.slice("payease_applicant_session=".length);
}

async function authenticatedApplicant(
  cookieHeader: string | undefined,
): Promise<{ telegramUserRef: string } | undefined> {
  const token = applicantSessionToken(cookieHeader);
  if (!token) return undefined;
  const result = await pool.query<{ telegram_user_ref: string }>(
    `SELECT telegram_user_ref FROM telegram_auth_sessions
     WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
    [eventHash([token])],
  );
  const identity = result.rows[0];
  return identity ? { telegramUserRef: identity.telegram_user_ref } : undefined;
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
  const isPublicUserApplicationSubmission =
    request.method === "POST" && request.url === "/v1/local/applications";
  const isPublicTelegramSession =
    request.method === "POST" &&
    (request.url === "/v1/local/public/telegram-sessions" ||
      request.url === "/v1/local/public/telegram-sessions/logout");
  const isPublicApplicantLanguagePreference =
    request.method === "PUT" &&
    request.url === "/v1/local/public/profile/preferred-language";
  const isPublicUserApplicationView =
    request.url === "/v1/local/public/applications" ||
    request.url.startsWith("/v1/local/public/applications/");
  if (
    !request.url.startsWith("/v1/local/") ||
    request.url.startsWith("/v1/local/auth/") ||
    isPublicUserApplicationSubmission ||
    isPublicTelegramSession ||
    isPublicApplicantLanguagePreference ||
    isPublicUserApplicationView
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

app.addHook("onSend", async (_request, reply) => {
  reply.header("X-PayEase-Environment", "controlled-preview");
  reply.header("Cache-Control", "no-store");
});

function eventHash(parts: readonly string[]): string {
  return createHash("sha256").update(parts.join("|"), "utf8").digest("hex");
}

type ApplicationRow = Readonly<{ id: string; status: string }>;

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

async function lockApplication(
  client: PoolClient,
  applicationNo: string,
): Promise<ApplicationRow | undefined> {
  const result = await client.query<ApplicationRow>(
    "SELECT id, status FROM applications WHERE application_no = $1 FOR UPDATE",
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
    `INSERT INTO approval_events (application_id, stage, decision, actor_user_ref, actor_role, reason_code, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())`,
    [
      application.id,
      stage,
      input.decision,
      input.actorUserRef,
      input.actorRole,
      input.reasonCode,
    ],
  );
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
    input,
  );
  return toStatus;
}

async function addAuditEvent(
  client: PoolClient,
  entityId: string,
  eventType: string,
  actorUserRef: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const payloadHash = eventHash([JSON.stringify(payload)]);
  const previous = await client.query<{ event_hash: string }>(
    "SELECT event_hash FROM audit_events WHERE entity_type = 'APPLICATION' AND entity_id = $1 ORDER BY occurred_at DESC LIMIT 1",
    [entityId],
  );
  const previousHash = previous.rows[0]?.event_hash ?? null;
  const auditHash = eventHash([
    entityId,
    eventType,
    actorUserRef,
    payloadHash,
    previousHash ?? "",
  ]);
  await client.query(
    `INSERT INTO audit_events
      (entity_type, entity_id, event_type, actor_user_ref, payload_hash, previous_event_hash, event_hash, occurred_at)
     VALUES ('APPLICATION', $1, $2, $3, $4, $5, $6, now())`,
    [entityId, eventType, actorUserRef, payloadHash, previousHash, auditHash],
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

app.get("/health", async () => {
  await pool.query("SELECT 1");
  return { status: "ok", service: "broker-api", storage: "postgresql" };
});

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
       VALUES ('OPS', 'OPS_ADMIN', '平台运营', 'Platform operations', 'Platform operations') RETURNING id`,
    );
    const role = await client.query<{ id: string }>(
      `INSERT INTO roles (domain, code, display_name_zh, display_name_en, display_name_km)
       VALUES ('OPS', 'OPS_ADMIN', '平台管理员', 'Platform administrator', 'Platform administrator') RETURNING id`,
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
    for (const [domain, code, zh, en] of [
      ["BROKER", "BROKER_OFFICER", "助贷审核员", "Broker officer"],
      [
        "LENDER",
        "LENDER_CREDIT_OFFICER",
        "持牌初审员",
        "Lender initial reviewer",
      ],
      [
        "LENDER",
        "LENDER_CREDIT_REVIEWER",
        "持牌复审员",
        "Lender final reviewer",
      ],
      ["LENDER", "LENDER_CONTRACT_OFFICER", "合同专员", "Contract officer"],
      ["LENDER", "LENDER_DISBURSEMENT_MAKER", "放款经办", "Disbursement maker"],
      [
        "LENDER",
        "LENDER_DISBURSEMENT_CHECKER",
        "放款复核",
        "Disbursement checker",
      ],
      ["LENDER", "LENDER_REPAYMENT_MAKER", "还款核销经办", "Repayment maker"],
      [
        "LENDER",
        "LENDER_REPAYMENT_CHECKER",
        "还款核销复核",
        "Repayment checker",
      ],
      ["EMPLOYER", "EMPLOYER_HR", "企业 HR 核验员", "Employer HR verifier"],
      [
        "EMPLOYER",
        "EMPLOYER_FINANCE",
        "企业财务核验员",
        "Employer finance verifier",
      ],
    ] as const) {
      await client.query(
        "INSERT INTO roles (domain, code, display_name_zh, display_name_en, display_name_km) VALUES ($1, $2, $3, $4, $4)",
        [domain, code, zh, en],
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
  const account = await pool.query<{
    id: string;
    password_hash: string;
    preferred_language: string;
  }>(
    "SELECT id, password_hash, preferred_language FROM admin_accounts WHERE login_name = $1 AND is_active = true",
    [input.loginName],
  );
  const row = account.rows[0];
  if (!row || !(await verifyPassword(input.password, row.password_hash))) {
    return reply.code(401).send({ code: "INVALID_CREDENTIALS" });
  }
  const token = randomBytes(32).toString("base64url");
  await pool.query(
    "INSERT INTO admin_sessions (token_hash, account_id, expires_at) VALUES ($1, $2, now() + interval '8 hours')",
    [eventHash([token]), row.id],
  );
  reply.header(
    "Set-Cookie",
    `payease_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/`,
  );
  return {
    loginName: input.loginName,
    preferredLanguage: row.preferred_language,
  };
});

app.post("/v1/local/auth/logout", async (request, reply) => {
  const token = sessionToken(request.headers.cookie);
  if (token) {
    await pool.query(
      "UPDATE admin_sessions SET revoked_at = now() WHERE token_hash = $1",
      [eventHash([token])],
    );
  }
  reply.header(
    "Set-Cookie",
    "payease_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0",
  );
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
    const department = await client.query<{ id: string }>(
      "SELECT id FROM departments WHERE code = $1",
      [input.departmentCode],
    );
    const roles = await client.query<{ id: string; code: string }>(
      "SELECT id, code FROM roles WHERE code = ANY($1::text[])",
      [input.roleCodes],
    );
    if (!department.rows[0] || roles.rowCount !== input.roleCodes.length) {
      await client.query("ROLLBACK");
      return reply.code(422).send({ code: "UNKNOWN_DEPARTMENT_OR_ROLE" });
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
       VALUES ($1, $2, $3, now() + interval '30 minutes')`,
      [
        eventHash([sessionToken]),
        identity.telegramUserRef,
        identity.authenticatedBotId,
      ],
    );
    await client.query("COMMIT");
    reply.header(
      "Set-Cookie",
      `payease_applicant_session=${sessionToken}; HttpOnly; Secure; SameSite=Lax; Path=/api/v1/local/; Max-Age=1800`,
    );
    return reply.code(201).send({ authenticated: true });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
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
    reply.header(
      "Set-Cookie",
      "payease_applicant_session=; HttpOnly; Secure; SameSite=Lax; Path=/api/v1/local/; Max-Age=0",
    );
    return { loggedOut: true };
  },
);

app.post("/v1/local/applications", async (request, reply) => {
  const input = createApplicationSchema.parse(request.body);
  const applicant = await authenticatedApplicant(request.headers.cookie);
  if (requiresTelegramAuthentication() && !applicant) {
    return reply.code(401).send({ code: "TELEGRAM_AUTH_REQUIRED" });
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
    const applicantAccessToken = randomBytes(32).toString("base64url");
    const user = await client.query<{ id: string }>(
      `INSERT INTO users (
         telegram_user_ref, preferred_language, full_name_encrypted,
         phone_encrypted, employer_name_encrypted, personal_data_consent_version,
         personal_data_consented_at, personal_data_key_version
       )
       VALUES (
         $1, $2, $3::bytea, $4::bytea, $5::bytea, $6,
         CASE WHEN $3::bytea IS NULL THEN NULL ELSE now() END,
         CASE WHEN $3::bytea IS NULL THEN NULL ELSE $7 END
       )
       ON CONFLICT (telegram_user_ref) DO UPDATE SET
         preferred_language = EXCLUDED.preferred_language,
         full_name_encrypted = COALESCE(EXCLUDED.full_name_encrypted, users.full_name_encrypted),
         phone_encrypted = COALESCE(EXCLUDED.phone_encrypted, users.phone_encrypted),
         employer_name_encrypted = COALESCE(EXCLUDED.employer_name_encrypted, users.employer_name_encrypted),
         personal_data_consent_version = COALESCE(EXCLUDED.personal_data_consent_version, users.personal_data_consent_version),
         personal_data_consented_at = COALESCE(EXCLUDED.personal_data_consented_at, users.personal_data_consented_at),
         personal_data_key_version = COALESCE(EXCLUDED.personal_data_key_version, users.personal_data_key_version),
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
        eventHash([applicantAccessToken]),
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
      },
    );
    await client.query("COMMIT");
    reply.header(
      "Set-Cookie",
      `payease_application=${applicantAccessToken}; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/local/public/applications/; Max-Age=2592000`,
    );
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
    const hasApplicationAccessToken = Boolean(token && token.length >= 32);
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
    }>(
      `SELECT id, application_no, requested_amount_minor::text, currency, tenor_days, status,
            approved_amount_minor::text, rejection_condition_resolved
       FROM applications
       WHERE application_no = $1
         AND (
           applicant_access_token_hash = $2
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
    created_at: Date;
  }>(
    `SELECT applications.application_no, applications.status,
            applications.requested_amount_minor::text, applications.currency,
            applications.tenor_days, applications.approved_amount_minor::text,
            applications.rejection_condition_resolved,
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
    `SELECT id, application_no, requested_amount_minor::text AS requested_amount_minor, currency, tenor_days, status, approved_amount_minor::text AS approved_amount_minor, rejection_condition_resolved, created_at
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
      const locked = await client.query<{ id: string; status: string }>(
        "SELECT id, status FROM applications WHERE application_no = $1 FOR UPDATE",
        [params.applicationNo],
      );
      const application = locked.rows[0];
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
      const toStatus =
        input.decision === "APPROVED"
          ? "EMPLOYER_VERIFICATION"
          : input.decision === "REJECTED"
            ? "REJECTED"
            : "BROKER_REVIEW";
      await client.query(
        `INSERT INTO approval_events (application_id, stage, decision, actor_user_ref, actor_role, reason_code, occurred_at)
       VALUES ($1, 'BROKER_REVIEW', $2, $3, $4, $5, now())`,
        [
          application.id,
          input.decision,
          actorUserRef,
          "BROKER_OFFICER",
          input.reasonCode,
        ],
      );
      if (toStatus !== application.status) {
        await client.query(
          "UPDATE applications SET status = $1, updated_at = now() WHERE id = $2",
          [toStatus, application.id],
        );
        await client.query(
          `INSERT INTO application_status_events (application_id, from_status, to_status, actor_user_ref, reason_code, occurred_at)
         VALUES ($1, $2, $3, $4, $5, now())`,
          [
            application.id,
            application.status,
            toStatus,
            actorUserRef,
            input.reasonCode,
          ],
        );
      }
      await addAuditEvent(
        client,
        application.id,
        "BROKER_REVIEW_RECORDED",
        actorUserRef,
        { ...input, actorUserRef, actorRole: "BROKER_OFFICER" },
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
      if (application.status !== "CONTRACT_PENDING") {
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
    const params = z
      .object({ applicationNo: z.string().min(1) })
      .parse(request.params);
    const input = makerApprovalSchema.parse(request.body);
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
      await recordMakerApproval(
        client,
        application,
        "DISBURSEMENT_RELEASE",
        request.adminIdentity!.loginName,
        "LENDER_DISBURSEMENT_MAKER",
        input.reasonCode,
      );
      await client.query("COMMIT");
      return {
        applicationNo: params.applicationNo,
        status: "DISBURSEMENT_PENDING",
        approval: "MAKER_RECORDED",
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
  "/v1/local/applications/:applicationNo/disbursement-confirmation",
  async (request, reply) => {
    if (!requireRole(request, reply, "LENDER_DISBURSEMENT_CHECKER")) return;
    const params = z
      .object({ applicationNo: z.string().min(1) })
      .parse(request.params);
    const input = checkerApprovalSchema.parse(request.body);
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
      await recordCheckerApproval(
        client,
        application,
        "DISBURSEMENT_RELEASE",
        "DISBURSEMENT_CONFIRMATION",
        request.adminIdentity!.loginName,
        "LENDER_DISBURSEMENT_CHECKER",
        input.reasonCode,
        input.evidenceReference,
        "DISBURSED",
        "DISBURSEMENT_RECEIPT",
      );
      await createRepaymentSchedule(client, application.id);
      await client.query("COMMIT");
      return { applicationNo: params.applicationNo, status: "DISBURSED" };
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
    const params = z
      .object({ applicationNo: z.string().min(1) })
      .parse(request.params);
    const input = makerApprovalSchema.parse(request.body);
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
        request.adminIdentity!.loginName,
        "LENDER_REPAYMENT_MAKER",
        input.reasonCode,
        nextInstallment.installment_no,
      );
      await client.query("COMMIT");
      return {
        applicationNo: params.applicationNo,
        status: "REPAYMENT_ACTIVE",
        approval: "MAKER_RECORDED",
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
  "/v1/local/applications/:applicationNo/repayment-confirmation",
  async (request, reply) => {
    if (!requireRole(request, reply, "LENDER_REPAYMENT_CHECKER")) return;
    const params = z
      .object({ applicationNo: z.string().min(1) })
      .parse(request.params);
    const input = checkerApprovalSchema.parse(request.body);
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
      const installment = await client.query<{
        id: string;
        amount_due_minor: string;
        installment_no: number;
      }>(
        `SELECT id, amount_due_minor::text FROM repayment_installments
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
        request.adminIdentity!.loginName,
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
      await client.query("COMMIT");
      return { applicationNo: params.applicationNo, status: nextStatus };
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
