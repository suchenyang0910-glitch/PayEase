import type { BrokerCopy } from "./broker-copy";

export type BrokerProfileResult = Readonly<{
  payload?: unknown;
  notice: string;
  sessionExpired: boolean;
}>;

/**
 * A failed authorised-profile request must leave no stale profile data in the
 * UI. The caller records a new audit-visible access only after a successful
 * response from the server.
 */
export async function brokerProfileResult(
  request: () => Promise<Response>,
  copy: Pick<
    BrokerCopy,
    "profileAccessRecorded" | "profileUnavailable" | "profileRequestFailed"
  >,
): Promise<BrokerProfileResult> {
  try {
    const response = await request();
    const payload: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        notice: `${copy.profileUnavailable} (${response.status}): ${JSON.stringify(payload)}`,
        sessionExpired: response.status === 401,
      };
    }
    return {
      payload,
      notice: copy.profileAccessRecorded,
      sessionExpired: false,
    };
  } catch {
    return {
      notice: `${copy.profileUnavailable}: ${copy.profileRequestFailed}`,
      sessionExpired: false,
    };
  }
}
