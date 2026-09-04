import { createHash, randomBytes, randomUUID } from "node:crypto";

export type WalletOperationType = "WITHDRAWAL" | "REPAYMENT";

export type WalletOperationJumpSettings = Readonly<{
  baseUrl: URL;
  allowedHosts: ReadonlySet<string>;
  ttlSeconds: number;
}>;

export type WalletOperationJump = Readonly<{
  walletOperationJumpRef: string;
  walletOperationUrl: string;
  expiresAt: string;
  targetHost: string;
  jumpTokenHash: string;
}>;

function normalizedHostList(source: string | undefined): ReadonlySet<string> {
  if (!source?.trim()) return new Set();
  return new Set(
    source
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function configuredWalletOperationJumpSettings(
  environment: NodeJS.ProcessEnv = process.env,
): WalletOperationJumpSettings | undefined {
  const baseUrlRaw = environment.PAYEASE_SMILE_WALLET_BASE_URL?.trim();
  if (!baseUrlRaw) return undefined;

  const baseUrl = new URL(baseUrlRaw);
  if (baseUrl.protocol !== "https:") {
    throw new Error("PAYEASE_SMILE_WALLET_BASE_URL must use HTTPS.");
  }
  if (baseUrl.username || baseUrl.password || baseUrl.hash) {
    throw new Error(
      "PAYEASE_SMILE_WALLET_BASE_URL must not include credentials or fragments.",
    );
  }

  const allowedHosts = normalizedHostList(
    environment.PAYEASE_SMILE_WALLET_ALLOWED_HOSTS,
  );
  const effectiveHosts =
    allowedHosts.size > 0
      ? allowedHosts
      : new Set([baseUrl.host.toLowerCase()]);
  if (!effectiveHosts.has(baseUrl.host.toLowerCase())) {
    throw new Error(
      "PAYEASE_SMILE_WALLET_BASE_URL host must appear in PAYEASE_SMILE_WALLET_ALLOWED_HOSTS.",
    );
  }

  const ttlSeconds = Number(environment.PAYEASE_WALLET_JUMP_TTL_SECONDS ?? 900);
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 3600) {
    throw new Error(
      "PAYEASE_WALLET_JUMP_TTL_SECONDS must be an integer between 60 and 3600.",
    );
  }

  return {
    baseUrl,
    allowedHosts: effectiveHosts,
    ttlSeconds,
  };
}

export function buildWalletOperationJump(args: {
  settings: WalletOperationJumpSettings;
  operationType: WalletOperationType;
}): WalletOperationJump {
  const walletOperationJumpRef = `woj_${randomUUID().replaceAll("-", "")}`;
  const expiresAt = new Date(
    Date.now() + args.settings.ttlSeconds * 1000,
  ).toISOString();
  const rawToken = randomBytes(32).toString("base64url");
  const jumpTokenHash = createHash("sha256").update(rawToken).digest("hex");
  const walletOperationUrl = new URL(args.settings.baseUrl);
  walletOperationUrl.searchParams.set("jump_ref", walletOperationJumpRef);
  walletOperationUrl.searchParams.set("operation", args.operationType);
  walletOperationUrl.hash = new URLSearchParams({
    jump_token: rawToken,
  }).toString();

  return {
    walletOperationJumpRef,
    walletOperationUrl: walletOperationUrl.toString(),
    expiresAt,
    targetHost: walletOperationUrl.host,
    jumpTokenHash,
  };
}
