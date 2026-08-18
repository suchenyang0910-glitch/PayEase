type TelegramLaunchLocation = Pick<Location, "search" | "hash">;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

type TelegramWebAppLike = Readonly<{
  initData?: string;
}>;

const TELEGRAM_INIT_DATA_STORAGE_KEY = "payease.telegram.initData";

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

export function readStoredTelegramInitData(
  storageLike: StorageLike,
): string | undefined {
  const stored = storageLike.getItem(TELEGRAM_INIT_DATA_STORAGE_KEY)?.trim();
  return stored ? stored : undefined;
}

export function storeTelegramInitData(
  initData: string,
  storageLike: StorageLike,
): void {
  storageLike.setItem(TELEGRAM_INIT_DATA_STORAGE_KEY, initData);
}

export function resolveTelegramInitData(
  webApp: TelegramWebAppLike | undefined,
  locationLike: TelegramLaunchLocation,
  storageLike: StorageLike,
): string | undefined {
  const direct = webApp?.initData?.trim();
  if (direct) {
    storeTelegramInitData(direct, storageLike);
    return direct;
  }

  const fromLaunchParams = telegramInitDataFromLaunchParams(locationLike);
  if (fromLaunchParams) {
    storeTelegramInitData(fromLaunchParams, storageLike);
    return fromLaunchParams;
  }

  if (!webApp) return undefined;
  return readStoredTelegramInitData(storageLike);
}
