import { afterEach, describe, expect, it } from "vitest";
import {
  decryptPersonalProfile,
  encryptPersonalProfile,
  identityDocumentLookupHash,
  identityDocumentLookupHashesMatch,
  personalDataEncryptionPreflight,
} from "../src/personal-profile.js";

const originalKey = process.env.PAYEASE_PII_ENCRYPTION_KEY;
const originalKeyVersion = process.env.PAYEASE_PII_ENCRYPTION_KEY_VERSION;
const originalKeyring = process.env.PAYEASE_PII_ENCRYPTION_KEYS_JSON;
const originalIdentityLookupKey = process.env.PAYEASE_IDENTITY_LOOKUP_KEY;

afterEach(() => {
  if (originalKey === undefined) delete process.env.PAYEASE_PII_ENCRYPTION_KEY;
  else process.env.PAYEASE_PII_ENCRYPTION_KEY = originalKey;
  if (originalKeyVersion === undefined)
    delete process.env.PAYEASE_PII_ENCRYPTION_KEY_VERSION;
  else process.env.PAYEASE_PII_ENCRYPTION_KEY_VERSION = originalKeyVersion;
  if (originalKeyring === undefined)
    delete process.env.PAYEASE_PII_ENCRYPTION_KEYS_JSON;
  else process.env.PAYEASE_PII_ENCRYPTION_KEYS_JSON = originalKeyring;
  if (originalIdentityLookupKey === undefined)
    delete process.env.PAYEASE_IDENTITY_LOOKUP_KEY;
  else process.env.PAYEASE_IDENTITY_LOOKUP_KEY = originalIdentityLookupKey;
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

    expect(() =>
      personalDataEncryptionPreflight({
        PAYEASE_PII_ENCRYPTION_KEYS_JSON: JSON.stringify({
          v1: key,
          legacy: "not-a-32-byte-key",
        }),
        PAYEASE_PII_ENCRYPTION_KEY_VERSION: "v1",
      }),
    ).toThrow("base64-encoded 32-byte key");
  });

  it("uses a separate keyed, normalized lookup value for an identity document", () => {
    const key = Buffer.alloc(32, 8).toString("base64");
    const first = identityDocumentLookupHash(
      { type: "NATIONAL_ID", number: "ab- 12345" },
      key,
    );
    const normalized = identityDocumentLookupHash(
      { type: "NATIONAL_ID", number: "AB12345" },
      key,
    );
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).toBe(normalized);
    expect(identityDocumentLookupHashesMatch(first, normalized)).toBe(true);
    expect(
      identityDocumentLookupHashesMatch(
        first,
        identityDocumentLookupHash(
          { type: "NATIONAL_ID", number: "AB12346" },
          key,
        ),
      ),
    ).toBe(false);
    expect(identityDocumentLookupHashesMatch(first, "not-a-hash")).toBe(false);
    expect(() =>
      identityDocumentLookupHash(
        { type: "PASSPORT", number: "P12345" },
        undefined,
      ),
    ).toThrow("PAYEASE_IDENTITY_LOOKUP_KEY is required");
  });
});
