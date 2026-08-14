import type { BrokerCopy } from "./broker-copy";

/**
 * Broker review failures must never be presented as an accepted decision.
 * The server is authoritative for the next application state.
 */
export async function brokerReviewNotice(
  request: () => Promise<Response>,
  copy: Pick<BrokerCopy, "recorded" | "blocked" | "reviewRequestFailed">,
): Promise<string> {
  try {
    const response = await request();
    const payload: unknown = await response.json().catch(() => ({}));
    return response.ok
      ? `${copy.recorded}: ${JSON.stringify(payload)}`
      : `${copy.blocked} (${response.status}): ${JSON.stringify(payload)}`;
  } catch {
    return `${copy.blocked}: ${copy.reviewRequestFailed}`;
  }
}
