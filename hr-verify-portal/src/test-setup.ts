import "@testing-library/jest-dom/vitest";
import { afterAll, beforeAll } from "vitest";

const WEB_08_RE =
  /(token|credential|password|secret|key|jwt|id_token|access_token|refresh_token|nonce|initData)/i;

type Patch = {
  readonly restore: () => void;
};

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
      if (WEB_08_RE.test(key)) {
        throw new Error(
          `[S0.5-WEB-08] ${name}.setItem with forbidden key=${key}. Tokens and credentials must not be persisted to browser storage.`,
        );
      }
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
  globalThis.fetch = function fetchPatched(
    ...args: Parameters<typeof orig>
  ): ReturnType<typeof orig> {
    const [input] = args;
    const url =
      typeof input === "string"
        ? input
        : typeof input === "undefined"
          ? "<undefined>"
          : ((input as Request).url ?? String(input));
    // Allow Vite HMR's data: + same-domain assets. Fail anything else (including non-data file:// URLs and any remote).
    if (url.startsWith("data:"))
      return Promise.resolve(new Response()) as ReturnType<typeof orig>;
    try {
      const u = new URL(url, "http://localhost");
      const sameDomain =
        u.hostname === "localhost" ||
        u.hostname === "127.0.0.1" ||
        u.protocol === "file:";
      if (sameDomain)
        return Promise.resolve(new Response()) as ReturnType<typeof orig>;
    } catch {
      // fall-through to error
    }
    throw new Error(
      `[S0.5-NETWORK-ZERO] fetch() called with url=${url}. S0.5 portals MUST NOT make any real network calls. If this is part of a test for S1.0 MVP integration, disable this patch explicitly in the specific test file and re-enable once S0.2 isolation is signed.`,
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
  const origOpen = proto.open;
  proto.open = function openPatched(
    _method: string,
    url: string | URL,
    async = true,
    _user?: string | null,
    _pass?: string | null,
  ): void {
    const u = String(url);
    if (u.startsWith("data:"))
      return origOpen.apply(
        this,
        arguments as unknown as Parameters<typeof origOpen>,
      );
    try {
      const parsed = new URL(u, "http://localhost");
      const same =
        parsed.hostname === "localhost" ||
        parsed.hostname === "127.0.0.1" ||
        parsed.protocol === "file:";
      if (same)
        return origOpen.apply(
          this,
          arguments as unknown as Parameters<typeof origOpen>,
        );
    } catch {
      // fall-through
    }
    throw new Error(
      `[S0.5-NETWORK-ZERO] XMLHttpRequest.open called with url=${u}. S0.5 portals must not make real network calls.`,
    );
  };
  return {
    restore: () => {
      proto.open = origOpen;
    },
  };
}

function patchWebSocket(): Patch {
  const orig = globalThis.WebSocket;
  if (!orig) return { restore: () => {} };
  globalThis.WebSocket = function WebSocketPatched(
    url: string | URL,
    protocols?: string | string[],
  ) {
    throw new Error(
      `[S0.5-NETWORK-ZERO] WebSocket(url=${String(url)}) constructed. S0.5 portals must not open WebSocket connections.`,
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
    value: function sendBeaconPatched(
      url: string | URL,
      _data?: BodyInit | null,
    ) {
      throw new Error(
        `[S0.5-NETWORK-ZERO] navigator.sendBeacon(url=${String(url)}) called. S0.5 portals must not call sendBeacon.`,
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
