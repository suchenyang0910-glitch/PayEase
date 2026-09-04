import { randomBytes } from "node:crypto";

export type WalletOperationType = "WITHDRAWAL" | "REPAYMENT";

export type WalletSession = Readonly<{
  sessionToken: string;
  applicationNo: string;
  walletOperationJumpRef: string;
  operationType: WalletOperationType;
  externalWalletRef: string | null;
  walletStatus: string;
  availableBalanceMinor: string;
  currency: string;
  createdAt: string;
  expiresAt: string;
}>;

export class WalletSessionStore {
  private readonly sessions = new Map<string, WalletSession>();

  create(
    args: Omit<WalletSession, "sessionToken" | "createdAt">,
  ): WalletSession {
    const createdAt = new Date().toISOString();
    const sessionToken = randomBytes(32).toString("base64url");
    const session: WalletSession = {
      ...args,
      sessionToken,
      createdAt,
    };
    this.sessions.set(sessionToken, session);
    return session;
  }

  get(
    sessionToken: string | undefined,
    now = Date.now(),
  ): WalletSession | undefined {
    if (!sessionToken) return undefined;
    const session = this.sessions.get(sessionToken);
    if (!session) return undefined;
    if (Date.parse(session.expiresAt) <= now) {
      this.sessions.delete(sessionToken);
      return undefined;
    }
    return session;
  }

  revoke(sessionToken: string | undefined): void {
    if (!sessionToken) return;
    this.sessions.delete(sessionToken);
  }
}
