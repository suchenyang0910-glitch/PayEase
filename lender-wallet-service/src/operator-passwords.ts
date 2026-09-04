import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

const unavailableAccountHash =
  "scrypt$9573b76f9f6e6951a9616971581e423b$6fe407004635153b1bfdebbfbfbc1c5c3d54018e1465d02fcedd7b4f2bcd54f4b19c9a2fe99dec2ba7fe4f3845aee49a5949b099ba26143060dd4d8a84023c15";

export async function hashLenderOperatorPassword(
  password: string,
): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyLenderOperatorPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [algorithm, salt, expectedHex] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function verifyLenderOperatorLoginPassword(
  password: string,
  stored: string | undefined,
): Promise<boolean> {
  return verifyLenderOperatorPassword(
    password,
    stored ?? unavailableAccountHash,
  );
}
