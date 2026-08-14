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
    ).resolves.toBe(
      "Blocked: The request could not be sent. No operation was recorded.",
    );
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
    ).resolves.toBe('Blocked (409): {"code":"DUAL_CONTROL_CONFLICT"}');
  });
});
