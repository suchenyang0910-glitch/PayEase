import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";
const keyVersion = "v1";

export type PersonalProfile = {
  fullName: string;
  phone: string;
  employerName: string;
};

function encryptionKey(
  source = process.env.PAYEASE_PII_ENCRYPTION_KEY,
): Buffer {
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
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, encryptionKey(), iv);
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
  if (version !== keyVersion || !ivValue || !tagValue || !encryptedValue) {
    throw new Error("Invalid personal-profile ciphertext.");
  }
  const decipher = createDecipheriv(
    algorithm,
    encryptionKey(),
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
