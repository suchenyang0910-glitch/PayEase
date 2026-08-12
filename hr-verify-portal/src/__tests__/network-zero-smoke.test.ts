import { describe, it, expect } from "vitest";

describe("S0.5 Network-Zero global patch (test-setup.ts) must actually throw on any real network call", () => {
  it("fetch('https://stripe.com') throws [S0.5-NETWORK-ZERO] — patch is active, not dead code", () => {
    expect(() => fetch("https://stripe.com/v1/charges")).toThrow(
      /S0\.5-NETWORK-ZERO/,
    );
  });

  it("fetch('https://api.payway.com.kh/...') throws — any bank/payment host blocked", () => {
    expect(() => fetch("https://api.payway.com.kh/v2/payments")).toThrow(
      /S0\.5-NETWORK-ZERO/,
    );
  });

  it("fetch to an AWS host (s3.*.amazonaws.com) throws — S0.2 isolation enforced by patch", () => {
    expect(() =>
      fetch("https://s3-ap-southeast-1.amazonaws.com/bucket-x/file"),
    ).toThrow(/S0\.5-NETWORK-ZERO/);
  });

  it("new XMLHttpRequest().open('GET', 'https://wingmoney.com/...') throws", () => {
    const xhr = new XMLHttpRequest();
    expect(() =>
      xhr.open("GET", "https://wingmoney.com/api/v1/transactions"),
    ).toThrow(/S0\.5-NETWORK-ZERO/);
  });

  it("new WebSocket('wss://ws.payease.io') throws — WebSocket blocked in S0.5", () => {
    expect(() => new WebSocket("wss://ws.payease.io/realtime")).toThrow(
      /S0\.5-NETWORK-ZERO/,
    );
  });

  it("navigator.sendBeacon('https://analytics.example/...') throws", () => {
    expect(() =>
      navigator.sendBeacon(
        "https://analytics.example/collect",
        new Uint8Array([1, 2, 3]),
      ),
    ).toThrow(/S0\.5-NETWORK-ZERO/);
  });

  it("localStorage.setItem with forbidden key throws WEB-08 (token/credential/secret/jwt/initData)", () => {
    const badKeys = [
      "access_token",
      "id_token",
      "refresh_token",
      "jwt",
      "credential",
      "password",
      "secret",
      "private_key",
      "initData",
      "nonce",
    ];
    for (const k of badKeys) {
      expect(() => localStorage.setItem(k, "value-x")).toThrow(/S0\.5-WEB-08/);
    }
  });

  it("localStorage.setItem with benign key (like 'theme' or 'lang') still works", () => {
    localStorage.setItem("theme", "dark");
    expect(localStorage.getItem("theme")).toBe("dark");
    localStorage.removeItem("theme");
  });

  it("data: URLs are still allowed through fetch (no false positives breaking Vite/data-uri assets)", () => {
    let threw = false;
    try {
      void fetch("data:text/plain;base64,SGVsbG8=");
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });

  it("http://localhost/* allowed through fetch (no false positives breaking vite HMR or local tests)", () => {
    let threw = false;
    try {
      void fetch("http://localhost:5173/src/App.tsx");
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });
});
