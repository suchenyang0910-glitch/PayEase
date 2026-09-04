import { describe, expect, it } from "vitest";
import {
  hashLenderOperatorPassword,
  verifyLenderOperatorLoginPassword,
  verifyLenderOperatorPassword,
} from "../src/operator-passwords.js";

describe("lender operator passwords", () => {
  it("uses a salted password hash and accepts only the original password", async () => {
    const hash = await hashLenderOperatorPassword("safe local test password");
    expect(hash).toMatch(/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
    await expect(
      verifyLenderOperatorPassword("safe local test password", hash),
    ).resolves.toBe(true);
    await expect(verifyLenderOperatorPassword("wrong", hash)).resolves.toBe(
      false,
    );
  });

  it("performs a non-enumerating password check when the account does not exist", async () => {
    await expect(
      verifyLenderOperatorLoginPassword("wrong", undefined),
    ).resolves.toBe(false);
  });
});
