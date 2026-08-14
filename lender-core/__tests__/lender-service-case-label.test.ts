import { describe, expect, it } from "vitest";
import { lenderServiceCaseTypeLabel } from "../src/lender-service-case-label.ts";

describe("lender service-case type labels", () => {
  it("localizes the case type for all supported lender languages", () => {
    expect(lenderServiceCaseTypeLabel("COMPLAINT", "en")).toBe("Complaint");
    expect(lenderServiceCaseTypeLabel("COMPLAINT", "zh-CN")).toBe("投诉");
    expect(lenderServiceCaseTypeLabel("COMPLAINT", "km")).toBe("បណ្តឹងតវ៉ា");
  });

  it("keeps an unknown case type visible for controlled diagnosis", () => {
    expect(lenderServiceCaseTypeLabel("FUTURE_TYPE", "en")).toBe("FUTURE_TYPE");
  });
});
