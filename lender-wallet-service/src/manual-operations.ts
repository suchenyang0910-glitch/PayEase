import type { PoolClient } from "pg";

export const MANUAL_OPERATION_EVENT_TO_STATUS = {
  MAKER_VERIFIED: "MAKER_VERIFIED",
  CHECKER_APPROVED: "CHECKER_APPROVED",
  BANK_TRANSFER_RECORDED: "BANK_TRANSFER_RECORDED",
  SETTLED: "SETTLED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

export type ManualOperationStatus =
  | "REQUESTED"
  | (typeof MANUAL_OPERATION_EVENT_TO_STATUS)[keyof typeof MANUAL_OPERATION_EVENT_TO_STATUS];
export type ManualOperationEventType =
  keyof typeof MANUAL_OPERATION_EVENT_TO_STATUS;
export type ManualOperationActorRole = "MAKER" | "CHECKER";

export type ManualOperationRow = Readonly<{
  id: string;
  funds_order_id: string;
  status: ManualOperationStatus;
  requested_by_ref: string;
  maker_ref: string | null;
  checker_ref: string | null;
  created_at: string;
  updated_at: string;
}>;

const MANUAL_OPERATION_COLUMNS = `id,
  funds_order_id,
  status,
  requested_by_ref,
  maker_ref,
  checker_ref,
  created_at::text,
  updated_at::text`;

const allowedTransitions: Readonly<
  Record<ManualOperationStatus, readonly ManualOperationStatus[]>
> = {
  REQUESTED: ["MAKER_VERIFIED", "CANCELLED"],
  MAKER_VERIFIED: ["CHECKER_APPROVED", "CANCELLED"],
  CHECKER_APPROVED: ["BANK_TRANSFER_RECORDED", "CANCELLED"],
  BANK_TRANSFER_RECORDED: ["SETTLED", "FAILED"],
  SETTLED: [],
  FAILED: [],
  CANCELLED: [],
};

export function assertManualOperationTransition(
  args: Readonly<{
    fromStatus: ManualOperationStatus;
    eventType: ManualOperationEventType;
    actorRole: ManualOperationActorRole;
    actorRef: string;
    makerRef?: string | null;
    evidenceReference?: string | null;
  }>,
): ManualOperationStatus {
  const nextStatus = MANUAL_OPERATION_EVENT_TO_STATUS[args.eventType];
  if (!allowedTransitions[args.fromStatus].includes(nextStatus)) {
    throw new Error(
      `Illegal manual operation transition ${args.fromStatus} -> ${nextStatus}.`,
    );
  }
  const requiredRole: ManualOperationActorRole =
    args.eventType === "MAKER_VERIFIED" ||
    args.eventType === "BANK_TRANSFER_RECORDED"
      ? "MAKER"
      : "CHECKER";
  if (args.actorRole !== requiredRole) {
    throw new Error(
      `Manual operation event ${args.eventType} requires ${requiredRole}.`,
    );
  }
  if (
    args.eventType === "CHECKER_APPROVED" &&
    args.makerRef === args.actorRef
  ) {
    throw new Error("Manual operation checker must differ from maker.");
  }
  if (
    ["BANK_TRANSFER_RECORDED", "SETTLED", "FAILED"].includes(args.eventType) &&
    !args.evidenceReference?.trim()
  ) {
    throw new Error(
      `Manual operation event ${args.eventType} requires evidence reference.`,
    );
  }
  return nextStatus;
}

export async function createManualOperation(
  client: PoolClient,
  args: Readonly<{
    fundsOrderId: string;
    requestedByRef: string;
    eventRef: string;
    metadata?: Record<string, unknown>;
  }>,
): Promise<ManualOperationRow> {
  const result = await client.query<ManualOperationRow>(
    `SELECT ${MANUAL_OPERATION_COLUMNS}
       FROM create_lender_wallet_manual_operation($1, $2, $3, $4::jsonb)`,
    [
      args.fundsOrderId,
      args.requestedByRef,
      args.eventRef,
      JSON.stringify(args.metadata ?? {}),
    ],
  );
  return result.rows[0]!;
}

export async function transitionManualOperation(
  client: PoolClient,
  args: Readonly<{
    operationId: string;
    eventRef: string;
    fromStatus: ManualOperationStatus;
    eventType: ManualOperationEventType;
    actorRef: string;
    actorRole: ManualOperationActorRole;
    makerRef?: string | null;
    evidenceReference?: string | null;
    reasonCode?: string | null;
    metadata?: Record<string, unknown>;
  }>,
): Promise<ManualOperationRow> {
  assertManualOperationTransition({
    fromStatus: args.fromStatus,
    eventType: args.eventType,
    actorRole: args.actorRole,
    actorRef: args.actorRef,
    makerRef: args.makerRef,
    evidenceReference: args.evidenceReference,
  });
  const result = await client.query<ManualOperationRow>(
    `SELECT ${MANUAL_OPERATION_COLUMNS}
       FROM transition_lender_wallet_manual_operation(
              $1, $2, $3, $4, $5, $6, $7, $8::jsonb
            )`,
    [
      args.operationId,
      args.eventRef,
      args.eventType,
      args.actorRef,
      args.actorRole,
      args.evidenceReference ?? null,
      args.reasonCode ?? null,
      JSON.stringify(args.metadata ?? {}),
    ],
  );
  return result.rows[0]!;
}
