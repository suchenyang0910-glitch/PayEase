import { afterEach, describe, expect, it, vi } from "vitest";
import AppDefault, { App as AppNamed } from "../src/App.tsx";

afterEach(() => {
  document.body.innerHTML = "";
  vi.resetModules();
  vi.clearAllMocks();
});

describe("user-mini-app entrypoint", () => {
  it("exports App as both named and default exports", () => {
    expect(AppDefault).toBe(AppNamed);
    expect(typeof AppDefault).toBe("function");
  });

  it("mounts the app from main.tsx using the root element", async () => {
    const render = vi.fn();
    const createRoot = vi.fn(() => ({ render }));

    vi.doMock("react-dom/client", () => ({
      createRoot,
    }));

    const root = document.createElement("div");
    root.id = "root";
    document.body.append(root);

    await import("../src/main.tsx");

    expect(createRoot).toHaveBeenCalledWith(root);
    expect(render).toHaveBeenCalledTimes(1);
  });
});
