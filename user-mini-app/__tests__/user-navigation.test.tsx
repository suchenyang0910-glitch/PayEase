import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { App } from "../src/App.tsx";
import { USER_SKELETON_COPY } from "../src/copy/user-copy.ts";

describe("user-mini-app P0 skeleton navigation", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, "Telegram");
    Reflect.deleteProperty(document, "cookie");
    window.history.replaceState(null, "", "/");
  });

  async function renderEnglishApp(expectHomeTab = true) {
    const view = render(<App />);
    fireEvent.change(screen.getByRole("combobox", { name: "Language" }), {
      target: { value: "en" },
    });
    if (expectHomeTab) {
      await waitFor(() =>
        expect(
          screen.getByRole("tab", {
            name: USER_SKELETON_COPY.en.tabs.home,
            selected: true,
          }),
        ).toBeInTheDocument(),
      );
    }
    return view;
  }

  async function goto(label: string) {
    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: label }));
    });
  }

  it("defaults to Home page with visible HomePage heading and four bottom tabs", async () => {
    await renderEnglishApp();
    const tabs = USER_SKELETON_COPY.en.tabs;
    expect(
      screen.getByRole("heading", { name: USER_SKELETON_COPY.en.home.title }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: tabs.home, selected: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: tabs.orders, selected: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: tabs.repayment, selected: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: tabs.profile, selected: false }),
    ).toBeInTheDocument();
  });

  it("can navigate Orders → Repayment → Profile and render each page heading", async () => {
    await renderEnglishApp();
    const tabs = USER_SKELETON_COPY.en.tabs;
    await goto(tabs.orders);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: USER_SKELETON_COPY.en.orders.title,
        }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("tab", { name: tabs.orders, selected: true }),
    ).toBeInTheDocument();

    await goto(tabs.repayment);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: USER_SKELETON_COPY.en.repayment.title,
        }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("tab", { name: tabs.repayment, selected: true }),
    ).toBeInTheDocument();

    await goto(tabs.profile);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: USER_SKELETON_COPY.en.profile.title,
        }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("tab", { name: tabs.profile, selected: true }),
    ).toBeInTheDocument();
  });

  it("opens explicit order-detail query and Back button returns Orders", async () => {
    window.history.replaceState(
      null,
      "",
      "/?page=order-detail&application=DEMO-APP-0001",
    );
    await renderEnglishApp(false);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: USER_SKELETON_COPY.en.orderDetail.title,
        }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("tab", { name: USER_SKELETON_COPY.en.tabs.home }),
    ).not.toBeInTheDocument();
    const backButton = screen.getByRole("link", {
      name: USER_SKELETON_COPY.en.backToOrders,
    });
    await act(async () => {
      fireEvent.click(backButton);
    });
    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: USER_SKELETON_COPY.en.orders.title,
        }),
      ).toBeInTheDocument(),
    );
  });

  it("switches language picker to zh-CN and updates tab labels without touching API model", async () => {
    await renderEnglishApp();
    fireEvent.change(screen.getByRole("combobox", { name: "Language" }), {
      target: { value: "zh-CN" },
    });
    await waitFor(() =>
      expect(
        screen.getByRole("tab", {
          name: USER_SKELETON_COPY["zh-CN"].tabs.home,
          selected: true,
        }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("tab", {
        name: USER_SKELETON_COPY["zh-CN"].tabs.orders,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", {
        name: USER_SKELETON_COPY["zh-CN"].tabs.repayment,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", {
        name: USER_SKELETON_COPY["zh-CN"].tabs.profile,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: USER_SKELETON_COPY["zh-CN"].home.title,
      }),
    ).toBeInTheDocument();
  });

  it("keeps the original topbar language select, brand, hero welcome, footer, preview badge DOM intact (no old-test regressions)", async () => {
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get: () => "__Host-payease_applicant_csrf=applicant-csrf-test-token",
    });
    vi.stubEnv("VITE_PAYEASE_DEPLOYMENT_MODE", "controlled-preview");
    await renderEnglishApp();
    expect(screen.getByText("PayEase")).toBeInTheDocument();
    expect(screen.getByLabelText("Language")).toBeInTheDocument();
    expect(screen.getByText("Controlled preview")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /flexibility before payday/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Enter requested amount (USD 10–500)"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /start application/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/USD 10–500 · 7–180 days/)).toBeInTheDocument();
  });
});
