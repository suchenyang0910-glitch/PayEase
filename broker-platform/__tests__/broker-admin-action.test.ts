import { describe, expect, it } from "vitest";
import { brokerAdminActionResult } from "../src/broker-admin-action";

const copy = {
  recorded: "Recorded",
  blocked: "Action blocked",
  adminRequestFailed:
    "The directory request could not be sent. No directory change was recorded.",
};

describe("broker directory administration action", () => {
  it("does not report a network failure as a recorded directory change", async () => {
    await expect(
      brokerAdminActionResult(
        async () => Promise.reject(new Error("offline")),
        copy,
      ),
    ).resolves.toEqual({
      ok: false,
      notice:
        "Action blocked: The directory request could not be sent. No directory change was recorded.",
    });
  });

  it("keeps a duplicate account rejection visible to the administrator", async () => {
    await expect(
      brokerAdminActionResult(
        async () =>
          new Response(JSON.stringify({ code: "ACCOUNT_ALREADY_EXISTS" }), {
            status: 409,
          }),
        copy,
      ),
    ).resolves.toEqual({
      ok: false,
      notice: 'Action blocked (409): {"code":"ACCOUNT_ALREADY_EXISTS"}',
    });
  });
});
