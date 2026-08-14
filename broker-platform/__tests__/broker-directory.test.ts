import { describe, expect, it } from "vitest";
import { parseDirectoryAccounts } from "../src/broker-directory";

describe("broker directory account parser", () => {
  it("normalizes only complete account rows that can safely be actioned", () => {
    expect(
      parseDirectoryAccounts([
        {
          login_name: "lanhai.credit.1",
          preferred_language: "km",
          is_active: true,
          department_code: "LENDER_CREDIT",
          roles: ["LENDER_CREDIT_OFFICER"],
        },
        { login_name: "incomplete", is_active: true },
      ]),
    ).toEqual([
      {
        loginName: "lanhai.credit.1",
        preferredLanguage: "km",
        isActive: true,
        departmentCode: "LENDER_CREDIT",
        roles: ["LENDER_CREDIT_OFFICER"],
      },
    ]);
  });

  it("fails closed for non-list and unsafe account payloads", () => {
    expect(parseDirectoryAccounts({})).toEqual([]);
    expect(
      parseDirectoryAccounts([
        {
          login_name: "unexpected-role-shape",
          preferred_language: "en",
          is_active: true,
          department_code: "OPS",
          roles: "OPS_ADMIN",
        },
      ]),
    ).toEqual([]);
  });
});
