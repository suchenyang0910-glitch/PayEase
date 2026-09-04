export type SingleKycLocationSnapshot = Readonly<{
  latitude: number;
  longitude: number;
  horizontalAccuracyMeters: number;
  capturedAt: string;
}>;

export type TelegramLocationRequestResult =
  | Readonly<{ kind: "success"; snapshot: SingleKycLocationSnapshot }>
  | Readonly<{ kind: "cancelled" | "unsupported" }>;

type TelegramLocationValue = Readonly<{
  latitude?: number;
  longitude?: number;
  horizontal_accuracy?: number;
  horizontalAccuracy?: number;
  accuracy?: number;
  timestamp?: number;
}>;

type TelegramLocationManager = Readonly<{
  init?: (callback?: (available?: boolean) => void) => void;
  getLocation?: (callback?: (location?: TelegramLocationValue) => void) => void;
}>;

type TelegramWindow = Window &
  typeof globalThis & {
    Telegram?: {
      WebApp?: {
        LocationManager?: TelegramLocationManager;
      };
    };
  };

function parseLocationValue(
  value: TelegramLocationValue | undefined,
): SingleKycLocationSnapshot | undefined {
  if (
    typeof value?.latitude !== "number" ||
    typeof value.longitude !== "number"
  ) {
    return undefined;
  }
  const horizontalAccuracyMeters =
    typeof value.horizontal_accuracy === "number"
      ? value.horizontal_accuracy
      : typeof value.horizontalAccuracy === "number"
        ? value.horizontalAccuracy
        : typeof value.accuracy === "number"
          ? value.accuracy
          : undefined;
  if (
    typeof horizontalAccuracyMeters !== "number" ||
    !Number.isFinite(horizontalAccuracyMeters) ||
    horizontalAccuracyMeters <= 0
  ) {
    return undefined;
  }
  const timestampMillis =
    typeof value.timestamp === "number" && Number.isFinite(value.timestamp)
      ? value.timestamp > 1_000_000_000_000
        ? value.timestamp
        : value.timestamp * 1000
      : Date.now();
  return {
    latitude: value.latitude,
    longitude: value.longitude,
    horizontalAccuracyMeters,
    capturedAt: new Date(timestampMillis).toISOString(),
  };
}

async function initializeManager(
  manager: TelegramLocationManager,
): Promise<boolean> {
  if (typeof manager.init !== "function") return true;
  return await new Promise<boolean>((resolve) => {
    try {
      manager.init?.((available) => resolve(available !== false));
    } catch {
      resolve(false);
    }
  });
}

export async function requestTelegramSingleLocation(
  win: TelegramWindow,
): Promise<TelegramLocationRequestResult> {
  const manager = win.Telegram?.WebApp?.LocationManager;
  if (!manager || typeof manager.getLocation !== "function") {
    return { kind: "unsupported" };
  }
  const initialized = await initializeManager(manager);
  if (!initialized) {
    return { kind: "unsupported" };
  }
  return await new Promise<TelegramLocationRequestResult>((resolve) => {
    try {
      manager.getLocation?.((location) => {
        const snapshot = parseLocationValue(location);
        resolve(
          snapshot ? { kind: "success", snapshot } : { kind: "cancelled" },
        );
      });
    } catch {
      resolve({ kind: "unsupported" });
    }
  });
}
