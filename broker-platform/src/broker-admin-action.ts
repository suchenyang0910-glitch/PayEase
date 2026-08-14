import type { BrokerCopy } from "./broker-copy";

export type BrokerAdminActionResult = Readonly<{
  ok: boolean;
  notice: string;
  sessionExpired: boolean;
}>;

/** Directory writes change future access boundaries, so network failures must
 * never be indistinguishable from a successfully recorded change. */
export async function brokerAdminActionResult(
  request: () => Promise<Response>,
  copy: Pick<BrokerCopy, "recorded" | "blocked" | "adminRequestFailed">,
): Promise<BrokerAdminActionResult> {
  try {
    const response = await request();
    const payload: unknown = await response.json().catch(() => ({}));
    return response.ok
      ? {
          ok: true,
          notice: `${copy.recorded}: ${JSON.stringify(payload)}`,
          sessionExpired: false,
        }
      : {
          ok: false,
          notice: `${copy.blocked} (${response.status}): ${JSON.stringify(payload)}`,
          sessionExpired: response.status === 401,
        };
  } catch {
    return {
      ok: false,
      notice: `${copy.blocked}: ${copy.adminRequestFailed}`,
      sessionExpired: false,
    };
  }
}
