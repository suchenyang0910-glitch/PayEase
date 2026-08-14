import { describe, expect, it } from "vitest";
import { lenderActionNotice } from "../src/lender-action.ts";

const copy = {
  recorded: "Recorded",
  blocked: "Blocked",
  actionFailed: "The request could not be sent. No operation was recorded.",
};

describe("lender action notice", () => {
  it("never represents a network failure as a recorded operation", async () => {
    await expect(
      lenderActionNotice(
        async () => Promise.reject(new Error("offline")),
        copy,
      ),
    ).resolves.toEqual({
      notice:
        "Blocked: The request could not be sent. No operation was recorded.",
      sessionExpired: false,
      deliveryUncertain: true,
    });
  });

  it("keeps a server-side rejection distinguishable from a recorded action", async () => {
    await expect(
      lenderActionNotice(
        async () =>
          new Response(JSON.stringify({ code: "DUAL_CONTROL_CONFLICT" }), {
            status: 409,
          }),
        copy,
      ),
    ).resolves.toEqual({
      notice: 'Blocked (409): {"code":"DUAL_CONTROL_CONFLICT"}',
      sessionExpired: false,
      deliveryUncertain: false,
    });
  });

  it("identifies an expired server-side session without treating it as a business rejection", async () => {
    await expect(
      lenderActionNotice(async () => new Response(null, { status: 401 }), copy),
    ).resolves.toEqual({
      notice: "Blocked (401): {}",
      sessionExpired: true,
      deliveryUncertain: false,
    });
  });
});
