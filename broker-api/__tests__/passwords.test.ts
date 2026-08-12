import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/passwords.js";

describe("admin password storage", () => {
  it("uses salted hashes and validates only the matching password", async () => {
    const stored = await hashPassword("Controlled-preview-only-2026");
    expect(stored).not.toContain("Controlled-preview-only-2026");
    await expect(
      verifyPassword("Controlled-preview-only-2026", stored),
    ).resolves.toBe(true);
    await expect(verifyPassword("incorrect-password", stored)).resolves.toBe(
      false,
    );
  });
});
