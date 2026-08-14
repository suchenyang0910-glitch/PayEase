import { describe, expect, it } from "vitest";
import { brokerReviewNotice } from "../src/broker-review-action";

const copy = {
  recorded: "Recorded",
  blocked: "Action blocked",
  reviewRequestFailed:
    "The review request could not be sent. No review decision was recorded.",
};

describe("broker review action", () => {
  it("does not report a network failure as a recorded broker review", async () => {
    await expect(
      brokerReviewNotice(
        async () => Promise.reject(new Error("offline")),
        copy,
      ),
    ).resolves.toBe(
      "Action blocked: The review request could not be sent. No review decision was recorded.",
    );
  });

  it("keeps a server-side rejection visible to the broker", async () => {
    await expect(
      brokerReviewNotice(
        async () =>
          new Response(JSON.stringify({ code: "INVALID_APPLICATION_STATE" }), {
            status: 409,
          }),
        copy,
      ),
    ).resolves.toBe(
      'Action blocked (409): {"code":"INVALID_APPLICATION_STATE"}',
    );
  });
});
