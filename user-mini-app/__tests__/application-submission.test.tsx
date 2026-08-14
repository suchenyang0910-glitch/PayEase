import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { App } from "../src/App";

describe("applicant submission", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/");
  });

  it("sends explicit personal-data and phone consent with the profile", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          applicationNo: "APP-CONSENT-001",
          status: "BROKER_REVIEW",
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    fireEvent.change(screen.getByRole("combobox", { name: "Language" }), {
      target: { value: "en" },
    });
    fireEvent.click(screen.getByRole("button", { name: /start application/i }));
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Test Applicant" },
    });
    fireEvent.change(screen.getByLabelText("Mobile number"), {
      target: { value: "+85512345678" },
    });
    fireEvent.change(screen.getByLabelText("Employer"), {
      target: { value: "Pilot Factory" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /personal-data authorization and privacy notice/i,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /submit for broker review/i }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      preferredLanguage: "en",
      personalProfile: {
        fullName: "Test Applicant",
        phone: "+85512345678",
        employerName: "Pilot Factory",
      },
      personalDataAndPhoneConsent: true,
    });
  });
});
