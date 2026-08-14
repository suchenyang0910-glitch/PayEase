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
    ).resolves.toEqual({
      notice:
        "Action blocked: The review request could not be sent. No review decision was recorded.",
      sessionExpired: false,
      deliveryUncertain: true,
    });
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
    ).resolves.toEqual({
      notice: 'Action blocked (409): {"code":"INVALID_APPLICATION_STATE"}',
      sessionExpired: false,
      deliveryUncertain: false,
    });
  });

  it("identifies a revoked or expired session", async () => {
    await expect(
      brokerReviewNotice(async () => new Response(null, { status: 401 }), copy),
    ).resolves.toEqual({
      notice: "Action blocked (401): {}",
      sessionExpired: true,
      deliveryUncertain: false,
    });
  });
});
