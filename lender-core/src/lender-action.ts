import type { LenderCopy } from "./lender-copy";

/**
 * Turns the result of a lender operation into operator-facing text. Network
 * failures intentionally never look like a recorded approval: the operator
 * must retry only after checking the authoritative application state.
 */
export async function lenderActionNotice(
  request: () => Promise<Response>,
  copy: Pick<LenderCopy, "recorded" | "blocked" | "actionFailed">,
): Promise<string> {
  try {
    const response = await request();
    const payload: unknown = await response.json().catch(() => ({}));
    return response.ok
      ? `${copy.recorded}: ${JSON.stringify(payload)}`
      : `${copy.blocked} (${response.status}): ${JSON.stringify(payload)}`;
  } catch {
    return `${copy.blocked}: ${copy.actionFailed}`;
  }
}
