type TelegramLaunchLocation = Pick<Location, "search" | "hash">;

type TelegramWebAppLike = Readonly<{
  initData?: string;
  ready?: () => void;
  expand?: () => void;
}>;

const preparedTelegramWebApps = new WeakSet<object>();

/**
 * Signal the Telegram bridge exactly once for each bridge instance. Session
 * recovery polls for late initData, so calling ready/expand from that polling
 * path would otherwise emit the same WebView event repeatedly.
 */
export function prepareTelegramWebApp(
  webApp: TelegramWebAppLike | undefined,
): void {
  if (!webApp || preparedTelegramWebApps.has(webApp)) return;
  preparedTelegramWebApps.add(webApp);
  webApp.ready?.();
  webApp.expand?.();
}

function readTelegramInitDataFromParams(
  params: URLSearchParams,
): string | undefined {
  const value = params.get("tgWebAppData");
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function telegramInitDataFromLaunchParams(
  locationLike: TelegramLaunchLocation,
): string | undefined {
  const fromSearch = readTelegramInitDataFromParams(
    new URLSearchParams(locationLike.search),
  );
  if (fromSearch) return fromSearch;
  const hash = locationLike.hash.startsWith("#")
    ? locationLike.hash.slice(1)
    : locationLike.hash;
  return readTelegramInitDataFromParams(new URLSearchParams(hash));
}

export function resolveTelegramInitData(
  webApp: TelegramWebAppLike | undefined,
  locationLike: TelegramLaunchLocation,
): string | undefined {
  const direct = webApp?.initData?.trim();
  if (direct) return direct;

  const fromLaunchParams = telegramInitDataFromLaunchParams(locationLike);
  return fromLaunchParams;
}
