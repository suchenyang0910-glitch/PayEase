import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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

  it("shows only minimal HR verification fields for an authenticated queue", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            loginName: "hr.user",
            preferredLanguage: "en",
            roles: ["EMPLOYER_HR"],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                applicationNo: "APP-HR-001",
                stage: "EMPLOYER_VERIFICATION",
                createdAt: "2026-08-21T00:00:00.000Z",
                employerTenantId: "tenant-001",
                identityDocumentType: "NATIONAL_ID",
                identityMatchStatus: "PENDING",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText(/APP-HR-001/)).toBeInTheDocument();
    expect(
      screen.getByText(/HR sees only employment status/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("25000")).toBeNull();
    expect(screen.queryByText("30d")).toBeNull();
    expect(screen.queryByText(/LENDER-/i)).toBeNull();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("records identity match and clears the selected case after queue refresh", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            loginName: "hr.user",
            preferredLanguage: "en",
            roles: ["EMPLOYER_HR"],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                applicationNo: "APP-HR-LOOP-001",
                stage: "EMPLOYER_VERIFICATION",
                createdAt: "2026-08-21T00:00:00.000Z",
                employerTenantId: "tenant-001",
                identityDocumentType: "NATIONAL_ID",
                identityMatchStatus: "PENDING",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            applicationNo: "APP-HR-LOOP-001",
            identityMatchStatus: "MATCHED",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    fireEvent.click(
      await screen.findByRole("button", { name: /APP-HR-LOOP-001/i }),
    );
    fireEvent.change(screen.getByLabelText(/Application number/i), {
      target: { value: "APP-HR-LOOP-001" },
    });
    fireEvent.change(
      screen.getByLabelText(
        /Identity document number in factory personnel record/i,
      ),
      {
        target: { value: "KH-ID-12345" },
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Verify factory personnel record/i }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      "/api/v1/local/applications/APP-HR-LOOP-001/employer-identity-match",
    );
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({
      method: "POST",
      credentials: "include",
    });
    expect(
      JSON.parse(String((fetchMock.mock.calls[2]?.[1] as RequestInit).body)),
    ).toEqual({
      identityDocumentNumber: "KH-ID-12345",
      reasonCode: "FACTORY_PERSONNEL_RECORD_COMPARISON",
    });
    expect(
      await screen.findByText(/Identity match recorded: APP-HR-LOOP-001/i),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        (screen.getByLabelText(/Application number/i) as HTMLInputElement)
          .value,
      ).toBe(""),
    );
  });
});
