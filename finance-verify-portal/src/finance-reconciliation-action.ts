import type { FinanceCopy } from "./finance-copy";

export type FinanceReconciliationResult = Readonly<{
  notice: string;
  succeeded: boolean;
  sessionExpired: boolean;
}>;

export async function financeReconciliationNotice(
  request: () => Promise<Response>,
  copy: Pick<FinanceCopy, "recorded" | "blocked" | "requestFailed">,
): Promise<FinanceReconciliationResult> {
  try {
    const response = await request();
    const payload: unknown = await response.json().catch(() => ({}));
    return response.ok
      ? {
          notice: `${copy.recorded}: ${JSON.stringify(payload)}`,
          succeeded: true,
          sessionExpired: false,
        }
      : {
          notice: `${copy.blocked} (${response.status}): ${JSON.stringify(payload)}`,
          succeeded: false,
          sessionExpired: response.status === 401,
        };
  } catch {
    return {
      notice: `${copy.blocked}: ${copy.requestFailed}`,
      succeeded: false,
      sessionExpired: false,
    };
  }
}
