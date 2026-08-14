import type { HrCopy } from "./hr-copy";

export type HrVerificationResult = Readonly<{
  notice: string;
  sessionExpired: boolean;
}>;

export async function hrVerificationNotice(
  request: () => Promise<Response>,
  copy: Pick<HrCopy, "recorded" | "blocked" | "requestFailed">,
): Promise<HrVerificationResult> {
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
      notice: `${copy.blocked}: ${copy.requestFailed}`,
      sessionExpired: false,
    };
  }
}
