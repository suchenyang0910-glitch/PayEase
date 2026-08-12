import "@testing-library/jest-dom/vitest";
import { afterAll, beforeAll } from "vitest";

const WEB_08_RE =
  /(token|credential|password|secret|key|jwt|id_token|access_token|refresh_token|nonce|initData)/i;

type Patch = { readonly restore: () => void };

function patchStorage(name: "localStorage" | "sessionStorage"): Patch {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => {
      if (WEB_08_RE.test(key))
        throw new Error(
          `[S0.5-WEB-08] ${name}.setItem with forbidden key=${key}. Tokens and credentials must not be persisted to browser storage.`,
        );
      values.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: storage,
  });
  return {
    restore: () =>
      original
        ? Object.defineProperty(globalThis, name, original)
        : delete (globalThis as Record<string, unknown>)[name],
  };
}

function patchFetch(): Patch {
  const orig = globalThis.fetch;
  globalThis.fetch = function (...args) {
    const [input] = args;
    const url =
      typeof input === "string"
        ? input
        : typeof input === "undefined"
          ? "<undefined>"
          : ((input as Request).url ?? String(input));
    if (url.startsWith("data:"))
      return Promise.resolve(new Response()) as Promise<Response>;
    try {
      const u = new URL(url, "http://localhost");
      if (
        u.hostname === "localhost" ||
        u.hostname === "127.0.0.1" ||
        u.protocol === "file:"
      ) {
        return Promise.resolve(new Response()) as Promise<Response>;
      }
    } catch {
      // fall-through
    }
    throw new Error(
      `[S0.5-NETWORK-ZERO] fetch() called with url=${url}. S0.5 finance-verify-portal must NOT issue any real network calls. If this is a future S1.0 MVP test, opt-out of this patch explicitly.`,
    );
  };
  return {
    restore: () => {
      globalThis.fetch = orig;
    },
  };
}

function patchXHR(): Patch {
  const proto = globalThis.XMLHttpRequest?.prototype;
  if (!proto) return { restore: () => {} };
  const orig = proto.open;
  proto.open = function (
    _method: string,
    url: string | URL,
    _async = true,
    _u?: string | null,
    _p?: string | null,
  ): void {
    const u = String(url);
    if (u.startsWith("data:"))
      return orig.apply(this, arguments as unknown as Parameters<typeof orig>);
    try {
      const p = new URL(u, "http://localhost");
      if (
        p.hostname === "localhost" ||
        p.hostname === "127.0.0.1" ||
        p.protocol === "file:"
      ) {
        return orig.apply(
          this,
          arguments as unknown as Parameters<typeof orig>,
        );
      }
    } catch {
      // fall-through
    }
    throw new Error(
      `[S0.5-NETWORK-ZERO] XMLHttpRequest.open(url=${u}). S0.5 finance portal must not make any real network calls.`,
    );
  };
  return {
    restore: () => {
      proto.open = orig;
    },
  };
}

function patchWebSocket(): Patch {
  const orig = globalThis.WebSocket;
  if (!orig) return { restore: () => {} };
  globalThis.WebSocket = function (url: string | URL) {
    throw new Error(
      `[S0.5-NETWORK-ZERO] WebSocket(${String(url)}). S0.5 finance portal must not open WebSocket connections.`,
    );
  } as unknown as typeof WebSocket;
  return {
    restore: () => {
      globalThis.WebSocket = orig;
    },
  };
}

function patchSendBeacon(): Patch {
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis.navigator,
    "sendBeacon",
  );
  Object.defineProperty(globalThis.navigator, "sendBeacon", {
    configurable: true,
    value: function (url: string | URL) {
      throw new Error(
        `[S0.5-NETWORK-ZERO] navigator.sendBeacon(url=${String(url)}) must not be called in S0.5 finance portal.`,
      );
    },
  });
  return {
    restore: () => {
      if (descriptor)
        Object.defineProperty(globalThis.navigator, "sendBeacon", descriptor);
      else Reflect.deleteProperty(globalThis.navigator, "sendBeacon");
    },
  };
}

let patches: Patch[] = [];
beforeAll(() => {
  patches = [
    patchStorage("localStorage"),
    patchStorage("sessionStorage"),
    patchFetch(),
    patchXHR(),
    patchWebSocket(),
    patchSendBeacon(),
  ];
});
afterAll(() => {
  patches.forEach((p) => p.restore());
  patches = [];
});
