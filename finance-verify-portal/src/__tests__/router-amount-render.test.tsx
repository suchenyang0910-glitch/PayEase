import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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

  it("shows only authorized collection-projection fields for an authenticated finance queue", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            loginName: "finance.user",
            preferredLanguage: "en",
            roles: ["EMPLOYER_FINANCE"],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                applicationNo: "APP-FIN-001",
                stage: "PAYROLL_COLLECTION_PENDING",
                createdAt: "2026-08-21T00:00:00.000Z",
                employerTenantId: "tenant-001",
                collectionSequence: 1,
                scheduledAmountMinor: "12750",
                selectedRepaymentMethod: "EMPLOYER_PAYROLL_DEDUCTION",
                payrollDeductionAuthorized: true,
                collectionScope: "PRINCIPAL_AND_INTEREST",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText(/APP-FIN-001/)).toBeInTheDocument();
    expect(
      screen.getByText(/Finance reports authorized principal-and-interest/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/USD 12750/)).toBeInTheDocument();
    expect(screen.queryByText("25000")).toBeNull();
    expect(screen.queryByText("30d")).toBeNull();
    expect(screen.queryByText(/LENDER-/i)).toBeNull();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("uses the selected repayment method to drive finance confirmation and clears the queue selection", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            loginName: "finance.user",
            preferredLanguage: "en",
            roles: ["EMPLOYER_FINANCE"],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                applicationNo: "APP-FIN-LOOP-001",
                stage: "PAYROLL_COLLECTION_PENDING",
                createdAt: "2026-08-21T00:00:00.000Z",
                employerTenantId: "tenant-001",
                collectionSequence: 1,
                scheduledAmountMinor: "12750",
                selectedRepaymentMethod: "EMPLOYER_PAYROLL_DEDUCTION",
                payrollDeductionAuthorized: true,
                collectionScope: "PRINCIPAL_AND_INTEREST",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ status: "COLLECTION_RECONCILIATION_PENDING" }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
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
      await screen.findByRole("button", { name: /APP-FIN-LOOP-001/i }),
    );
    expect(
      (screen.getByLabelText(/Actual collected amount/i) as HTMLInputElement)
        .value,
    ).toBe("12750");
    expect(
      (screen.getByLabelText(/Resolution reason/i) as HTMLInputElement).value,
    ).toBe("PAYROLL_INSTALLMENT_COLLECTION_REPORTED");
    fireEvent.change(screen.getByLabelText(/Evidence reference/i), {
      target: { value: "PAYROLL-EVIDENCE-001" },
    });

    fireEvent.click(screen.getByRole("button", { name: /^Collected$/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      "/api/v1/local/applications/APP-FIN-LOOP-001/employer-finance-verification",
    );
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({
      method: "POST",
      credentials: "include",
    });
    expect(
      JSON.parse(String((fetchMock.mock.calls[2]?.[1] as RequestInit).body)),
    ).toEqual({
      collectionResult: "COLLECTED",
      reasonCode: "PAYROLL_INSTALLMENT_COLLECTION_REPORTED",
      collectionSequence: 1,
      actualCollectedAmountMinor: "12750",
      evidenceReference: "PAYROLL-EVIDENCE-001",
    });
    expect(
      await screen.findByText(/Recorded: COLLECTION_RECONCILIATION_PENDING/i),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        (screen.getByLabelText(/Application number/i) as HTMLInputElement)
          .value,
      ).toBe(""),
    );
  });
});
