import { describe, expect, it } from "vitest";
import { hrVerificationNotice } from "../hr-verification-action";

const copy = {
  recorded: "Recorded",
  blocked: "Blocked",
  requestFailed: "The verification request could not be sent.",
};

describe("HR verification action", () => {
  it("does not represent a network failure as a recorded decision", async () => {
    await expect(
      hrVerificationNotice(
        async () => Promise.reject(new Error("offline")),
        copy,
      ),
    ).resolves.toBe("Blocked: The verification request could not be sent.");
  });
});
