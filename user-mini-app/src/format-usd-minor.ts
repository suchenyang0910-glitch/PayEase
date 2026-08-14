/**
 * Formats a USD minor-unit integer without converting the amount to a
 * JavaScript number. API values are BIGINT-compatible strings, so precision
 * is retained beyond Number.MAX_SAFE_INTEGER.
 */
export function formatUsdMinor(minor: string | null | undefined): string {
  const source = minor ?? "0";
  if (!/^-?\d+$/.test(source)) return "$0.00";

  const amount = BigInt(source);
  const sign = amount < 0n ? "-" : "";
  const absolute = amount < 0n ? -amount : amount;
  const major = absolute / 100n;
  const cents = (absolute % 100n).toString().padStart(2, "0");
  return `${sign}$${major.toLocaleString("en-US")}.${cents}`;
}
