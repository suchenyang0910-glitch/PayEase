import type { Currency, Money } from "@payease/shared-money";
import { moneySub } from "@payease/shared-money";
import type { ReconLineMock } from "../mocks/fin-mocks.static";

export type ReconLine = ReconLineMock;

export function diffLine(line: {
  readonly expected: Money;
  readonly settled: Money;
}): Money {
  if (line.expected.currency !== line.settled.currency) {
    return { amountMinor: "0", currency: line.expected.currency };
  }
  return moneySub(line.expected, line.settled);
}
