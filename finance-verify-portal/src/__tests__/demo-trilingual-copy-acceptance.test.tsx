import { afterEach, describe, expect, it } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  App,
  type DemoLanguage,
  DEMO_LANGUAGE_LABELS,
  DEMO_LANGUAGES,
  FINANCE_DEMO_COPY,
} from "../pages/DemoApp";

type StringLeaf = readonly [string, string];

function collectStringLeaves(
  node: unknown,
  prefix = "$",
): readonly StringLeaf[] {
  if (typeof node === "string") {
    return [[prefix, node]] as const;
  }
  if (Array.isArray(node)) {
    return node.flatMap((v, i) => collectStringLeaves(v, `${prefix}[${i}]`));
  }
  if (node && typeof node === "object") {
    return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) =>
      collectStringLeaves(v, `${prefix}.${k}`),
    );
  }
  return [];
}

function assertAllNonEmpty(entries: readonly StringLeaf[]) {
  for (const [key, raw] of entries) {
    const s = String(raw ?? "").trim();
    expect.soft(s, `${key} should be non-empty after trim`).not.toBe("");
    expect.soft(s, `${key} should not be placeholder`).not.toMatch(/^TODO$/i);
    expect.soft(s, `${key} should not be placeholder`).not.toMatch(/^FIXME$/i);
    expect
      .soft(s, `${key} should not be placeholder`)
      .not.toMatch(/^PLACEHOLDER$/i);
    expect
      .soft(s.length, `${key} should have length >= 2`)
      .toBeGreaterThanOrEqual(2);
  }
}

function buildByKeyMap(leaves: readonly StringLeaf[], label: string) {
  const out = new Map<string, string>();
  for (const [path, value] of leaves) {
    const lastDot = path.lastIndexOf(".");
    const key = lastDot >= 0 ? path.slice(lastDot + 1) : path;
    const duplicate = out.has(key) && out.get(key) !== value;
    expect
      .soft(duplicate, `duplicate leaf key "${key}" under ${label}`)
      .not.toBe(true);
    out.set(key, String(value).trim());
  }
  return out;
}

function countDifferentByKey(
  base: Map<string, string>,
  other: Map<string, string>,
): number {
  let diff = 0;
  for (const [key, b] of base) {
    const o = other.get(key);
    if (typeof o === "string" && o !== b) diff += 1;
  }
  return diff;
}

describe("Finance DemoApp trilingual copy uses exported FINANCE_DEMO_COPY from DemoApp directly", () => {
  afterEach(() => cleanup());

  it("every leaf in FINANCE_DEMO_COPY[zh-CN/en/km] is non-empty, non-placeholder; zh-CN and km differ from en in >=75% by-key leaf pairs", () => {
    const byLang = new Map<DemoLanguage, Map<string, string>>();
    for (const lang of DEMO_LANGUAGES) {
      const leaves = collectStringLeaves(
        FINANCE_DEMO_COPY[lang],
        `FINANCE_DEMO_COPY.${lang}`,
      );
      assertAllNonEmpty(leaves);
      byLang.set(lang, buildByKeyMap(leaves, lang));
    }
    const en = byLang.get("en")!;
    expect(en.size).toBeGreaterThan(0);
    const threshold = Math.ceil(en.size * 0.75);
    expect(
      countDifferentByKey(en, byLang.get("zh-CN")!),
      `zh-CN should differ from en in >=${threshold} by-key leaf pairs`,
    ).toBeGreaterThanOrEqual(threshold);
    expect(
      countDifferentByKey(en, byLang.get("km")!),
      `km should differ from en in >=${threshold} by-key leaf pairs`,
    ).toBeGreaterThanOrEqual(threshold);
  });

  it("language switcher at runtime renders FINANCE_DEMO_COPY login + repayment + reconciliation strings", async () => {
    for (const lang of DEMO_LANGUAGES) {
      cleanup();
      render(
        <MemoryRouter initialEntries={["/login"]}>
          <App />
        </MemoryRouter>,
      );
      const label = DEMO_LANGUAGE_LABELS[lang];
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: label }));
      });
      const copy = FINANCE_DEMO_COPY[lang];
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: copy.title }),
        ).toBeInTheDocument();
        expect(screen.getByText(copy.trilingualLabel)).toBeInTheDocument();
        expect(screen.getByText(copy.syntheticOnly)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: copy.enterButton }));
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: copy.repaymentHeading }),
        ).toBeInTheDocument();
        expect(screen.getByText(copy.repaymentIntro)).toBeInTheDocument();
        expect(screen.getByText("DEMO-LEDGER-001")).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByRole("button", { name: copy.openReconciliation }),
      );
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: copy.reconHeading }),
        ).toBeInTheDocument();
        expect(screen.getByText(copy.reconIntro)).toBeInTheDocument();
        expect(screen.getByText("DEMO-RECON-001")).toBeInTheDocument();
        expect(screen.getByText("MATCHED")).toBeInTheDocument();
        expect(screen.getByText("DIFFERENCE")).toBeInTheDocument();
      });
    }
  });
});
