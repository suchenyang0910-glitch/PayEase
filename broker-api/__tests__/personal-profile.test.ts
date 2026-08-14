import { afterEach, describe, expect, it } from "vitest";
import {
  decryptPersonalProfile,
  encryptPersonalProfile,
} from "../src/personal-profile.js";

const originalKey = process.env.PAYEASE_PII_ENCRYPTION_KEY;

afterEach(() => {
  if (originalKey === undefined) delete process.env.PAYEASE_PII_ENCRYPTION_KEY;
  else process.env.PAYEASE_PII_ENCRYPTION_KEY = originalKey;
});

describe("personal profile encryption", () => {
  it("round-trips AES-GCM ciphertext without retaining plaintext", () => {
    process.env.PAYEASE_PII_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
      "base64",
    );
    const profile = {
      fullName: "Test Applicant",
      phone: "+85512345678",
      employerName: "Pilot Factory",
    };
    const encrypted = encryptPersonalProfile(profile);

    expect(encrypted.fullName.toString("utf8")).not.toContain(profile.fullName);
    expect(encrypted.phone.toString("utf8")).not.toContain(profile.phone);
    expect(decryptPersonalProfile(encrypted)).toEqual(profile);
  });

  it("fails closed when the deployment key is absent or invalid", () => {
    delete process.env.PAYEASE_PII_ENCRYPTION_KEY;
    expect(() =>
      encryptPersonalProfile({
        fullName: "Test",
        phone: "+85512345678",
        employerName: "Factory",
      }),
    ).toThrow("PAYEASE_PII_ENCRYPTION_KEY is required");

    process.env.PAYEASE_PII_ENCRYPTION_KEY = "not-a-32-byte-key";
    expect(() =>
      encryptPersonalProfile({
        fullName: "Test",
        phone: "+85512345678",
        employerName: "Factory",
      }),
    ).toThrow("base64-encoded 32-byte key");
  });
});
