import type { FinanceCopy } from "./finance-copy";

export async function financeReconciliationNotice(
  request: () => Promise<Response>,
  copy: Pick<FinanceCopy, "recorded" | "blocked" | "requestFailed">,
): Promise<{ notice: string; succeeded: boolean }> {
  try {
    const response = await request();
    const payload: unknown = await response.json().catch(() => ({}));
    return response.ok
      ? {
          notice: `${copy.recorded}: ${JSON.stringify(payload)}`,
          succeeded: true,
        }
      : {
          notice: `${copy.blocked} (${response.status}): ${JSON.stringify(payload)}`,
          succeeded: false,
        };
  } catch {
    return {
      notice: `${copy.blocked}: ${copy.requestFailed}`,
      succeeded: false,
    };
  }
}
