import { afterEach, describe, expect, it } from "vitest";
import {
  decryptPersonalProfile,
  encryptPersonalProfile,
  personalDataEncryptionPreflight,
} from "../src/personal-profile.js";

const originalKey = process.env.PAYEASE_PII_ENCRYPTION_KEY;
const originalKeyVersion = process.env.PAYEASE_PII_ENCRYPTION_KEY_VERSION;
const originalKeyring = process.env.PAYEASE_PII_ENCRYPTION_KEYS_JSON;

afterEach(() => {
  if (originalKey === undefined) delete process.env.PAYEASE_PII_ENCRYPTION_KEY;
  else process.env.PAYEASE_PII_ENCRYPTION_KEY = originalKey;
  if (originalKeyVersion === undefined)
    delete process.env.PAYEASE_PII_ENCRYPTION_KEY_VERSION;
  else process.env.PAYEASE_PII_ENCRYPTION_KEY_VERSION = originalKeyVersion;
  if (originalKeyring === undefined)
    delete process.env.PAYEASE_PII_ENCRYPTION_KEYS_JSON;
  else process.env.PAYEASE_PII_ENCRYPTION_KEYS_JSON = originalKeyring;
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

  it("decrypts existing data after the active key moves to a new keyring version", () => {
    const keyV1 = Buffer.alloc(32, 3).toString("base64");
    const keyV2 = Buffer.alloc(32, 9).toString("base64");
    process.env.PAYEASE_PII_ENCRYPTION_KEYS_JSON = JSON.stringify({
      v1: keyV1,
      v2: keyV2,
    });
    process.env.PAYEASE_PII_ENCRYPTION_KEY_VERSION = "v1";
    const existing = encryptPersonalProfile({
      fullName: "Existing applicant",
      phone: "+85512345678",
      employerName: "Pilot Factory",
    });

    process.env.PAYEASE_PII_ENCRYPTION_KEY_VERSION = "v2";
    expect(decryptPersonalProfile(existing).fullName).toBe(
      "Existing applicant",
    );
  });

  it("validates the active keyring entry without returning any key material", () => {
    const key = Buffer.alloc(32, 5).toString("base64");
    expect(
      personalDataEncryptionPreflight({
        PAYEASE_PII_ENCRYPTION_KEYS_JSON: JSON.stringify({ v2: key }),
        PAYEASE_PII_ENCRYPTION_KEY_VERSION: "v2",
      }),
    ).toEqual({ activeKeyVersion: "v2" });

    expect(() =>
      personalDataEncryptionPreflight({
        PAYEASE_PII_ENCRYPTION_KEYS_JSON: JSON.stringify({ v1: key }),
        PAYEASE_PII_ENCRYPTION_KEY_VERSION: "v2",
      }),
    ).toThrow("No personal-data encryption key is configured for version v2");
  });
});
