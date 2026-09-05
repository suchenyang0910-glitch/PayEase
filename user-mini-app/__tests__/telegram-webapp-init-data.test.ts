import { describe, expect, it, vi } from "vitest";
import {
  prepareTelegramWebApp,
  readStoredTelegramInitData,
  resolveTelegramInitData,
  telegramInitDataFromLaunchParams,
} from "../src/telegram-webapp-init-data.ts";

function memoryStorage(seed?: Record<string, string>) {
  const data = new Map(Object.entries(seed ?? {}));
  return {
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
  };
}

describe("telegram init data recovery", () => {
  it("signals each Telegram bridge only once while initData is polled", () => {
    const ready = vi.fn();
    const expand = vi.fn();
    const webApp = { ready, expand };

    prepareTelegramWebApp(webApp);
    prepareTelegramWebApp(webApp);

    expect(ready).toHaveBeenCalledTimes(1);
    expect(expand).toHaveBeenCalledTimes(1);
  });

  it("reads init data from Telegram launch hash params", () => {
    expect(
      telegramInitDataFromLaunchParams({
        search: "",
        hash: "#tgWebAppVersion=7.10&tgWebAppData=query_id%3Dabc%26user%3D1",
      }),
    ).toBe("query_id=abc&user=1");
  });

  it("falls back to launch params when Telegram bridge is not ready", () => {
    const storage = memoryStorage();

    expect(
      resolveTelegramInitData(
        undefined,
        {
          search: "?tgWebAppData=query_id%3Dxyz%26user%3D2",
          hash: "",
        },
        storage,
      ),
    ).toBe("query_id=xyz&user=2");
    expect(readStoredTelegramInitData(storage)).toBe("query_id=xyz&user=2");
  });

  it("reuses cached init data after a same-webview refresh", () => {
    const storage = memoryStorage({
      "payease.telegram.initData": "query_id=cached&user=3",
    });

    expect(resolveTelegramInitData({}, { search: "", hash: "" }, storage)).toBe(
      "query_id=cached&user=3",
    );
  });
});
