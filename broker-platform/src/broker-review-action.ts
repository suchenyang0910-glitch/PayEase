import type { BrokerCopy } from "./broker-copy";

export type BrokerReviewResult = Readonly<{
  notice: string;
  sessionExpired: boolean;
  deliveryUncertain: boolean;
}>;

/**
 * Broker review failures must never be presented as an accepted decision.
 * The server is authoritative for the next application state.
 */
export async function brokerReviewNotice(
  request: () => Promise<Response>,
  copy: Pick<BrokerCopy, "recorded" | "blocked" | "reviewRequestFailed">,
): Promise<BrokerReviewResult> {
  try {
    const response = await request();
    const payload: unknown = await response.json().catch(() => ({}));
    return response.ok
      ? {
          notice: `${copy.recorded}: ${JSON.stringify(payload)}`,
          sessionExpired: false,
          deliveryUncertain: false,
        }
      : {
          notice: `${copy.blocked} (${response.status}): ${JSON.stringify(payload)}`,
          sessionExpired: response.status === 401,
          deliveryUncertain: false,
        };
  } catch {
    return {
      notice: `${copy.blocked}: ${copy.reviewRequestFailed}`,
      sessionExpired: false,
      deliveryUncertain: true,
    };
  }
}
