import { createHash, randomUUID } from "node:crypto";
import Fastify from "fastify";
import { Pool, type PoolClient } from "pg";
import { z } from "zod";
import {
  brokerReviewSchema,
  contractConfirmationSchema,
  createApplicationSchema,
  disbursementDualControlSchema,
  employerVerificationSchema,
  lenderFinalReviewSchema,
  lenderInitialReviewSchema,
  lifecycleActorSchema,
  repaymentDualControlSchema,
} from "./validation.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required; local PostgreSQL only for the controlled pilot.",
  );
}

const pool = new Pool({ connectionString: databaseUrl, max: 5 });
const app = Fastify({ logger: true });

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

app.get("/health", async () => {
  await pool.query("SELECT 1");
  return { status: "ok", service: "broker-api", storage: "postgresql" };
});

const createStageHandler = (
  expectedStatus: string,
  stage: string,
  approvedStatus: string,
  schema: z.ZodType<SingleApproval>,
) => {
  return async (request: { params: unknown; body: unknown }, reply: any) => {
    const params = z
      .object({ applicationNo: z.string().min(1) })
      .parse(request.params);
    const input = schema.parse(request.body);
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
        input,
        approvedStatus,
      );
      await client.query("COMMIT");
      return {
        applicationNo: params.applicationNo,
        status,
        decision: input.decision,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };
};

app.post("/v1/local/applications", async (request, reply) => {
  const input = createApplicationSchema.parse(request.body);
  const amountMinor = BigInt(input.requestedAmount.amountMinor);
  if (amountMinor < 1000n || amountMinor > 50000n) {
    return reply.code(422).send({
      code: "AMOUNT_OUT_OF_RANGE",
      message: "USD 10 to USD 500 is required.",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const user = await client.query<{ id: string }>(
      `INSERT INTO users (telegram_user_ref, preferred_language)
       VALUES ($1, $2)
       ON CONFLICT (telegram_user_ref) DO UPDATE SET preferred_language = EXCLUDED.preferred_language, updated_at = now()
       RETURNING id`,
      [input.telegramUserRef, input.preferredLanguage],
    );
    const applicationNo = `APP-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const created = await client.query<{
      id: string;
      application_no: string;
      status: string;
    }>(
      `INSERT INTO applications (application_no, user_id, requested_amount_minor, currency, tenor_days, status)
       VALUES ($1, $2, $3, 'USD', $4, 'BROKER_REVIEW')
       RETURNING id, application_no, status`,
      [
        applicationNo,
        user.rows[0]!.id,
        amountMinor.toString(),
        input.tenorDays,
      ],
    );
    const application = created.rows[0]!;
    await client.query(
      `INSERT INTO application_status_events (application_id, from_status, to_status, actor_user_ref, reason_code, occurred_at)
       VALUES ($1, 'DRAFT', 'SUBMITTED', $2, 'USER_SUBMITTED', now()),
              ($1, 'SUBMITTED', 'BROKER_REVIEW', 'system', 'QUEUE_BROKER_REVIEW', now())`,
      [application.id, input.telegramUserRef],
    );
    await addAuditEvent(
      client,
      application.id,
      "APPLICATION_SUBMITTED",
      input.telegramUserRef,
      {
        applicationNo: application.application_no,
        amountMinor: input.requestedAmount.amountMinor,
        currency: "USD",
        tenorDays: input.tenorDays,
      },
    );
    await client.query("COMMIT");
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

app.get("/v1/local/applications/:applicationNo", async (request, reply) => {
  const params = z
    .object({ applicationNo: z.string().min(1) })
    .parse(request.params);
  const result = await pool.query(
    `SELECT application_no, requested_amount_minor::text AS requested_amount_minor, currency, tenor_days, status, created_at
     FROM applications WHERE application_no = $1`,
    [params.applicationNo],
  );
  if (result.rowCount === 0)
    return reply.code(404).send({ code: "APPLICATION_NOT_FOUND" });
  return result.rows[0];
});

app.post(
  "/v1/local/applications/:applicationNo/broker-review",
  async (request, reply) => {
    const params = z
      .object({ applicationNo: z.string().min(1) })
      .parse(request.params);
    const input = brokerReviewSchema.parse(request.body);
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
          input.actorUserRef,
          input.actorRole,
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
            input.actorUserRef,
            input.reasonCode,
          ],
        );
      }
      await addAuditEvent(
        client,
        application.id,
        "BROKER_REVIEW_RECORDED",
        input.actorUserRef,
        input,
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
    "LENDER_INITIAL_REVIEW",
    employerVerificationSchema,
  ),
);

app.post(
  "/v1/local/applications/:applicationNo/lender-initial-review",
  createStageHandler(
    "LENDER_INITIAL_REVIEW",
    "LENDER_INITIAL_REVIEW",
    "LENDER_FINAL_REVIEW",
    lenderInitialReviewSchema,
  ),
);

app.post(
  "/v1/local/applications/:applicationNo/lender-final-review",
  createStageHandler(
    "LENDER_FINAL_REVIEW",
    "LENDER_FINAL_REVIEW",
    "CONTRACT_PENDING",
    lenderFinalReviewSchema,
  ),
);

app.post(
  "/v1/local/applications/:applicationNo/contract-confirmation",
  async (request, reply) => {
    const params = z
      .object({ applicationNo: z.string().min(1) })
      .parse(request.params);
    const input = contractConfirmationSchema.parse(request.body);
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
        input.actorUserRef,
        "CONTRACT_CONFIRMED",
      );
      await addAuditEvent(
        client,
        application.id,
        "CONTRACT_CONFIRMED",
        input.actorUserRef,
        input,
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
    const params = z
      .object({ applicationNo: z.string().min(1) })
      .parse(request.params);
    const input = lifecycleActorSchema.parse(request.body);
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
        input.actorUserRef,
        input.reasonCode,
      );
      await addAuditEvent(
        client,
        application.id,
        "DISBURSEMENT_OPENED",
        input.actorUserRef,
        input,
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

app.post(
  "/v1/local/applications/:applicationNo/disbursement-dual-control",
  async (request, reply) => {
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
  },
);

app.post(
  "/v1/local/applications/:applicationNo/activate-repayment",
  async (request, reply) => {
    const params = z
      .object({ applicationNo: z.string().min(1) })
      .parse(request.params);
    const input = lifecycleActorSchema.parse(request.body);
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
        input.actorUserRef,
        input.reasonCode,
      );
      await addAuditEvent(
        client,
        application.id,
        "REPAYMENT_OPENED",
        input.actorUserRef,
        input,
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
  "/v1/local/applications/:applicationNo/repayment-dual-control",
  async (request, reply) => {
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
  },
);

app.get("/v1/local/reconciliation/open", async () => {
  const result = await pool.query(
    `SELECT r.id, a.application_no, r.evidence_type, r.evidence_reference, r.status, r.created_at
     FROM reconciliation_work_items r
     JOIN applications a ON a.id = r.application_id
     WHERE r.status IN ('OPEN', 'DIFFERENCE')
     ORDER BY r.created_at ASC`,
  );
  return result.rows;
});

const close = async (): Promise<void> => {
  await app.close();
  await pool.end();
};

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 3100);
  const host = process.env.HOST ?? "127.0.0.1";
  app.listen({ host, port }).catch(async (error) => {
    app.log.error(error);
    await close();
    process.exit(1);
  });
}

export { app, close };
