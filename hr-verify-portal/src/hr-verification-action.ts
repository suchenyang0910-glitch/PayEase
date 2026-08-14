import type { HrCopy } from "./hr-copy";

export type HrVerificationResult = Readonly<{
  notice: string;
  sessionExpired: boolean;
  deliveryUncertain: boolean;
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
          deliveryUncertain: false,
        }
      : {
          notice: `${copy.blocked} (${response.status}): ${JSON.stringify(payload)}`,
          sessionExpired: response.status === 401,
          deliveryUncertain: false,
        };
  } catch {
    return {
      notice: `${copy.blocked}: ${copy.requestFailed}`,
      sessionExpired: false,
      deliveryUncertain: true,
    };
  }
}
