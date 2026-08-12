import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { App } from "../App";

describe("Finance portal access boundary", () => {
  afterEach(() => cleanup());

  it("shows only the login screen before a server session exists", async () => {
    render(<App />);
    expect(
      await screen.findByRole("heading", {
        name: /employer finance reconciliation/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /sign in/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/manual reconciliation work queue/i)).toBeNull();
  });
});
