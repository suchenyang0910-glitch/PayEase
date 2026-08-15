export type TelegramContactRequestResult = "sent" | "cancelled" | "unsupported";

type TelegramWebApp = Readonly<{
  requestContact?: (callback: (sent: boolean) => void) => void;
}>;

/**
 * Requests the contact through Telegram's native consent UI. The callback
 * confirms only that Telegram sent an update to the Bot; the API remains the
 * sole authority for verified status after its webhook authenticates that
 * update.
 */
export function requestTelegramPhoneContact(
  source: unknown,
  onResult: (result: TelegramContactRequestResult) => void,
): void {
  const webApp = (source as { Telegram?: { WebApp?: TelegramWebApp } })
    ?.Telegram?.WebApp;
  if (!webApp?.requestContact) {
    onResult("unsupported");
    return;
  }
  webApp.requestContact((sent) => onResult(sent ? "sent" : "cancelled"));
}
