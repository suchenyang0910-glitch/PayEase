import { describe, expect, it } from "vitest";
import { isControlledPreviewBuild } from "../src/deployment-mode.ts";

describe("user Mini App deployment mode", () => {
  it("shows the preview marker only for an explicit controlled preview build", () => {
    expect(isControlledPreviewBuild("controlled-preview")).toBe(true);
    expect(isControlledPreviewBuild(undefined)).toBe(false);
    expect(isControlledPreviewBuild("production")).toBe(false);
    expect(isControlledPreviewBuild("CONTROLLED-PREVIEW")).toBe(false);
  });
});
