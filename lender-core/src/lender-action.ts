import type { LenderCopy } from "./lender-copy";

export type LenderActionResult = Readonly<{
  notice: string;
  sessionExpired: boolean;
}>;

/**
 * Turns the result of a lender operation into operator-facing text. Network
 * failures intentionally never look like a recorded approval: the operator
 * must retry only after checking the authoritative application state.
 */
export async function lenderActionNotice(
  request: () => Promise<Response>,
  copy: Pick<LenderCopy, "recorded" | "blocked" | "actionFailed">,
): Promise<LenderActionResult> {
  try {
    const response = await request();
    const payload: unknown = await response.json().catch(() => ({}));
    return response.ok
      ? {
          notice: `${copy.recorded}: ${JSON.stringify(payload)}`,
          sessionExpired: false,
        }
      : {
          notice: `${copy.blocked} (${response.status}): ${JSON.stringify(payload)}`,
          sessionExpired: response.status === 401,
        };
  } catch {
    return {
      notice: `${copy.blocked}: ${copy.actionFailed}`,
      sessionExpired: false,
    };
  }
}
