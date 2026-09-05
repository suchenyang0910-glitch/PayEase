import { describe, expect, it, vi } from "vitest";
import {
  prepareTelegramWebApp,
  resolveTelegramInitData,
  telegramInitDataFromLaunchParams,
} from "../src/telegram-webapp-init-data.ts";

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
    expect(
      resolveTelegramInitData(undefined, {
        search: "?tgWebAppData=query_id%3Dxyz%26user%3D2",
        hash: "",
      }),
    ).toBe("query_id=xyz&user=2");
  });

  it("does not recover initData from browser storage after a refresh", () => {
    expect(
      resolveTelegramInitData({}, { search: "", hash: "" }),
    ).toBeUndefined();
  });
});
