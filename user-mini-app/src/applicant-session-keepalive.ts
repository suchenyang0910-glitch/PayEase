export const applicantSessionKeepaliveIntervalMs = 4 * 60 * 1000;

/**
 * Keepalive requests must result from applicant activity, never a background
 * timer. This preserves the server's five-minute idle expiry while allowing a
 * person who is genuinely completing a form to retain their session.
 */
export function shouldKeepApplicantSessionAlive(
  lastKeepaliveAt: number,
  now = Date.now(),
): boolean {
  return now - lastKeepaliveAt >= applicantSessionKeepaliveIntervalMs;
}
