import { describe, expect, it } from "vitest";
import { lenderServiceFeeSummaryLabel } from "../src/lender-summary-label.ts";

describe("lender summary labels", () => {
  it("shows approved service fee labels in every supported language", () => {
    expect(lenderServiceFeeSummaryLabel("en")).toBe("Approved service fee");
    expect(lenderServiceFeeSummaryLabel("zh-CN")).toBe("已批准服务费");
    expect(lenderServiceFeeSummaryLabel("km")).toBe("កម្រៃសេវាដែលបានអនុម័ត");
  });
});
