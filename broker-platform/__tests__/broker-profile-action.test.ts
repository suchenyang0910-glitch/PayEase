import { describe, expect, it } from "vitest";
import { brokerProfileResult } from "../src/broker-profile-action";

const copy = {
  profileAccessRecorded: "Profile access recorded in the audit log.",
  profileUnavailable: "Profile unavailable",
  profileRequestFailed:
    "The profile could not be retrieved. No profile data is displayed.",
};

describe("broker authorised profile read", () => {
  it("does not display profile data when the request cannot reach the server", async () => {
    await expect(
      brokerProfileResult(
        async () => Promise.reject(new Error("offline")),
        copy,
      ),
    ).resolves.toEqual({
      notice:
        "Profile unavailable: The profile could not be retrieved. No profile data is displayed.",
    });
  });

  it("keeps a forbidden profile access distinguishable from a network failure", async () => {
    await expect(
      brokerProfileResult(
        async () =>
          new Response(JSON.stringify({ code: "FORBIDDEN" }), { status: 403 }),
        copy,
      ),
    ).resolves.toEqual({
      notice: 'Profile unavailable (403): {"code":"FORBIDDEN"}',
    });
  });
});
