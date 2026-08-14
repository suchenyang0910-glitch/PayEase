/**
 * Converts a human-entered USD value to minor units without Number/float
 * arithmetic. V1 accepts USD 10.00 through USD 500.00 inclusive.
 */
export function usdInputToMinor(value: string): string | undefined {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return undefined;

  const whole = BigInt(match[1] ?? "0");
  const cents = BigInt((match[2] ?? "").padEnd(2, "0") || "0");
  const amountMinor = whole * 100n + cents;
  if (amountMinor < 1000n || amountMinor > 50000n) return undefined;
  return amountMinor.toString();
}
