import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { App } from "../App";

describe("HR portal access boundary", () => {
  afterEach(() => cleanup());

  it("shows only the login screen before a server session exists", async () => {
    render(<App />);
    expect(
      await screen.findByRole("heading", {
        name: /employer verification portal/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /sign in/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/confirm employment|confirm authorised salary/i),
    ).toBeNull();
  });
});
