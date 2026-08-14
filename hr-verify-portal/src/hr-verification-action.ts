import type { HrCopy } from "./hr-copy";

export async function hrVerificationNotice(
  request: () => Promise<Response>,
  copy: Pick<HrCopy, "recorded" | "blocked" | "requestFailed">,
): Promise<string> {
  try {
    const response = await request();
    const payload: unknown = await response.json().catch(() => ({}));
    return response.ok
      ? `${copy.recorded}: ${JSON.stringify(payload)}`
      : `${copy.blocked} (${response.status}): ${JSON.stringify(payload)}`;
  } catch {
    return `${copy.blocked}: ${copy.requestFailed}`;
  }
}
