import type { PoolClient } from "pg";

export const FUNDS_ORDER_EVENT_TO_STATUS = {
  AUTHORIZATION_REQUESTED: "PENDING_AUTH",
  AUTHORIZED: "AUTHORIZED",
  PROCESSING: "PROCESSING",
  SETTLED: "SETTLED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

export const POST_CREATE_FUNDS_ORDER_EVENTS = [
  "AUTHORIZATION_REQUESTED",
  "AUTHORIZED",
  "PROCESSING",
  "SETTLED",
  "FAILED",
  "CANCELLED",
] as const;

export type FundsOrderType = "WITHDRAWAL" | "REPAYMENT";
export type FundsOrderStatus =
  | "PENDING_AUTH"
  | "AUTHORIZED"
  | "PROCESSING"
  | "SETTLED"
  | "FAILED"
  | "CANCELLED";
export type FundsOrderEventType = keyof typeof FUNDS_ORDER_EVENT_TO_STATUS;

export type FundsOrderRow = Readonly<{
  id: string;
  application_no: string;
  external_wallet_ref: string;
  order_ref: string;
  order_type: FundsOrderType;
  status: FundsOrderStatus;
  requested_amount_minor: string;
  settled_amount_minor: string | null;
  currency: "USD";
  idempotency_key: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}>;

const ALLOWED_STATUS_TRANSITIONS: Readonly<
  Record<FundsOrderStatus, readonly FundsOrderStatus[]>
> = {
  PENDING_AUTH: ["AUTHORIZED", "FAILED", "CANCELLED"],
  AUTHORIZED: ["PROCESSING", "FAILED", "CANCELLED"],
  PROCESSING: ["SETTLED", "FAILED"],
  SETTLED: [],
  FAILED: [],
  CANCELLED: [],
};

export function assertFundsOrderTransition(args: {
  fromStatus: FundsOrderStatus;
  eventType: FundsOrderEventType | "ORDER_CREATED";
  nextStatus?: FundsOrderStatus;
}): FundsOrderStatus {
  if (args.eventType === "ORDER_CREATED") {
    throw new Error(
      "Funds order event ORDER_CREATED is only allowed during creation.",
    );
  }
  const derivedStatus = FUNDS_ORDER_EVENT_TO_STATUS[args.eventType];
  const nextStatus = args.nextStatus ?? derivedStatus;
  if (
    args.eventType !== "AUTHORIZATION_REQUESTED" &&
    nextStatus !== derivedStatus
  ) {
    throw new Error(
      `Funds order event ${args.eventType} cannot target ${nextStatus}.`,
    );
  }
  if (args.eventType === "AUTHORIZATION_REQUESTED") {
    if (args.fromStatus !== "PENDING_AUTH") {
      throw new Error(
        "Funds order event AUTHORIZATION_REQUESTED is only allowed from PENDING_AUTH.",
      );
    }
    if (nextStatus !== args.fromStatus) {
      throw new Error(
        `Funds order event ${args.eventType} must preserve ${args.fromStatus}.`,
      );
    }
    return nextStatus;
  }
  if (!ALLOWED_STATUS_TRANSITIONS[args.fromStatus].includes(nextStatus)) {
    throw new Error(
      `Illegal funds order transition ${args.fromStatus} -> ${nextStatus}.`,
    );
  }
  return nextStatus;
}

export async function createFundsOrder(
  client: PoolClient,
  args: {
    applicationNo: string;
    externalWalletRef: string;
    orderRef: string;
    orderType: FundsOrderType;
    requestedAmountMinor: string;
    currency?: "USD";
    idempotencyKey: string;
    actorRef: string;
    eventRef: string;
    metadata?: Record<string, unknown>;
  },
): Promise<FundsOrderRow> {
  const result = await client.query<FundsOrderRow>(
    `SELECT id,
            application_no,
            external_wallet_ref,
            order_ref,
            order_type,
            status,
            requested_amount_minor::text,
            settled_amount_minor::text,
            currency,
            idempotency_key,
            metadata,
            created_at::text,
            updated_at::text
       FROM create_lender_wallet_funds_order(
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb
            )`,
    [
      args.applicationNo,
      args.externalWalletRef,
      args.orderRef,
      args.orderType,
      args.requestedAmountMinor,
      args.currency ?? "USD",
      args.idempotencyKey,
      args.actorRef,
      args.eventRef,
      JSON.stringify(args.metadata ?? {}),
    ],
  );
  return result.rows[0]!;
}

export async function transitionFundsOrder(
  client: PoolClient,
  args: {
    orderRef: string;
    eventRef: string;
    eventType: FundsOrderEventType | "ORDER_CREATED";
    actorRef: string;
    fromStatus: FundsOrderStatus;
    nextStatus?: FundsOrderStatus;
    externalCallbackRef?: string | null;
    amountMinor?: string | null;
    settledAmountMinor?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<FundsOrderRow> {
  const nextStatus = assertFundsOrderTransition({
    fromStatus: args.fromStatus,
    eventType: args.eventType,
    nextStatus: args.nextStatus,
  });
  const result = await client.query<FundsOrderRow>(
    `SELECT id,
            application_no,
            external_wallet_ref,
            order_ref,
            order_type,
            status,
            requested_amount_minor::text,
            settled_amount_minor::text,
            currency,
            idempotency_key,
            metadata,
            created_at::text,
            updated_at::text
       FROM transition_lender_wallet_funds_order(
              $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb
            )`,
    [
      args.orderRef,
      args.eventRef,
      args.eventType,
      args.actorRef,
      nextStatus,
      args.externalCallbackRef ?? null,
      args.amountMinor ?? null,
      args.settledAmountMinor ?? null,
      JSON.stringify(args.metadata ?? {}),
    ],
  );
  return result.rows[0]!;
}
