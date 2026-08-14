import { describe, expect, it } from "vitest";
import {
  applicantSessionKeepaliveIntervalMs,
  shouldKeepApplicantSessionAlive,
} from "../src/applicant-session-keepalive.ts";

describe("applicant session keepalive", () => {
  it("throttles activity-based renewal while preserving an idle timeout", () => {
    const startedAt = 1_700_000_000_000;

    expect(
      shouldKeepApplicantSessionAlive(
        startedAt,
        startedAt + applicantSessionKeepaliveIntervalMs - 1,
      ),
    ).toBe(false);
    expect(
      shouldKeepApplicantSessionAlive(
        startedAt,
        startedAt + applicantSessionKeepaliveIntervalMs,
      ),
    ).toBe(true);
  });
});
