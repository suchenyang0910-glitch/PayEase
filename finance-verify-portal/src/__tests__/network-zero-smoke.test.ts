import { describe, it, expect } from "vitest";

describe("Finance-verify-portal S0.5 Network-Zero + WEB-08 patches active (not dead code)", () => {
  it("fetch to any real bank/payment host throws S0.5-NETWORK-ZERO", () => {
    expect(() => fetch("https://api.ababank.com/transactions/v2")).toThrow(
      /S0\.5-NETWORK-ZERO/,
    );
    expect(() => fetch("https://api.stripe.com/v1/charges")).toThrow(
      /S0\.5-NETWORK-ZERO/,
    );
    expect(() => fetch("https://payway.wingmoney.com/api/pay")).toThrow(
      /S0\.5-NETWORK-ZERO/,
    );
  });

  it("new XMLHttpRequest().open to remote host throws S0.5-NETWORK-ZERO", () => {
    const xhr = new XMLHttpRequest();
    expect(() =>
      xhr.open("POST", "https://erp.oraclecorp.example/gl/post"),
    ).toThrow(/S0\.5-NETWORK-ZERO/);
  });

  it("new WebSocket('wss://...') throws S0.5-NETWORK-ZERO (no realtime to any backend yet)", () => {
    expect(() => new WebSocket("wss://realtime.payease.io/recon")).toThrow(
      /S0\.5-NETWORK-ZERO/,
    );
  });

  it("navigator.sendBeacon to analytics throws S0.5-NETWORK-ZERO", () => {
    expect(() =>
      navigator.sendBeacon("https://analytics.example.com/finance-events"),
    ).toThrow(/S0\.5-NETWORK-ZERO/);
  });

  it("localStorage.setItem with credential keys throws S0.5-WEB-08", () => {
    const forbiddenKeys = [
      "access_token",
      "id_token",
      "refresh_token",
      "jwt_token",
      "password_hash",
      "client_secret",
      "initData",
      "nonce_xyz",
    ];
    for (const k of forbiddenKeys) {
      expect(() => localStorage.setItem(k, "x")).toThrow(/S0\.5-WEB-08/);
      expect(() => sessionStorage.setItem(k, "x")).toThrow(/S0\.5-WEB-08/);
    }
  });

  it("benign localStorage keys still work (no false positives breaking UX)", () => {
    localStorage.setItem("table_density", "compact");
    expect(localStorage.getItem("table_density")).toBe("compact");
    localStorage.removeItem("table_density");
  });

  it("data: URLs allowed through (no false positives breaking SVG/fonts as data uri)", () => {
    let threw = false;
    try {
      void fetch("data:application/json;base64,eyJhIjoxfQ==");
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });

  it("http://127.0.0.1:4173 (vite preview) allowed through (no false positives in build-demo-portals)", () => {
    let threw = false;
    try {
      // nosemgrep: typescript.react.security.react-insecure-request.react-insecure-request -- local-only test fixture for the Vite preview asset path.
      void fetch("http://127.0.0.1:4173/assets/index.js");
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });
});
