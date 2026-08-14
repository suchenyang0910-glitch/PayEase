import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";
const defaultKeyVersion = "v1";

export type PersonalProfile = {
  fullName: string;
  phone: string;
  employerName: string;
};

export function personalDataKeyVersion(
  source = process.env.PAYEASE_PII_ENCRYPTION_KEY_VERSION,
): string {
  const version = source?.trim() || defaultKeyVersion;
  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(version)) {
    throw new Error("PAYEASE_PII_ENCRYPTION_KEY_VERSION is invalid.");
  }
  return version;
}

function configuredKey(version: string): string | undefined {
  const keyring = process.env.PAYEASE_PII_ENCRYPTION_KEYS_JSON;
  if (keyring) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(keyring);
    } catch {
      throw new Error("PAYEASE_PII_ENCRYPTION_KEYS_JSON must be valid JSON.");
    }
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed) ||
      typeof (parsed as Record<string, unknown>)[version] !== "string"
    ) {
      throw new Error(
        `No personal-data encryption key is configured for version ${version}.`,
      );
    }
    return (parsed as Record<string, string>)[version];
  }
  return version === personalDataKeyVersion()
    ? process.env.PAYEASE_PII_ENCRYPTION_KEY
    : undefined;
}

function encryptionKey(version: string): Buffer {
  const source = configuredKey(version);
  if (!source) {
    throw new Error(
      "PAYEASE_PII_ENCRYPTION_KEY is required before storing personal data.",
    );
  }
  const key = Buffer.from(source, "base64");
  if (key.length !== 32) {
    throw new Error(
      "PAYEASE_PII_ENCRYPTION_KEY must be a base64-encoded 32-byte key.",
    );
  }
  return key;
}

// The database stores only this self-describing ciphertext.  It deliberately
// has no plaintext fallback: a missing or malformed deployment secret must
// stop personal-data collection rather than silently weaken confidentiality.
export function encryptPersonalValue(value: string): Buffer {
  const keyVersion = personalDataKeyVersion();
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, encryptionKey(keyVersion), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.from(
    `${keyVersion}.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`,
    "utf8",
  );
}

export function decryptPersonalValue(ciphertext: Buffer): string {
  const [version, ivValue, tagValue, encryptedValue] = ciphertext
    .toString("utf8")
    .split(".");
  if (!version || !ivValue || !tagValue || !encryptedValue) {
    throw new Error("Invalid personal-profile ciphertext.");
  }
  const decipher = createDecipheriv(
    algorithm,
    encryptionKey(version),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  return plaintext;
}

export function encryptPersonalProfile(profile: PersonalProfile): {
  fullName: Buffer;
  phone: Buffer;
  employerName: Buffer;
} {
  return {
    fullName: encryptPersonalValue(profile.fullName),
    phone: encryptPersonalValue(profile.phone),
    employerName: encryptPersonalValue(profile.employerName),
  };
}

export function decryptPersonalProfile(ciphertext: {
  fullName: Buffer;
  phone: Buffer;
  employerName: Buffer;
}): PersonalProfile {
  return {
    fullName: decryptPersonalValue(ciphertext.fullName),
    phone: decryptPersonalValue(ciphertext.phone),
    employerName: decryptPersonalValue(ciphertext.employerName),
  };
}
