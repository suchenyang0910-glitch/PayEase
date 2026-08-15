import { describe, expect, it } from "vitest";
import { LANGUAGE_CODES } from "@payease/v1-domain";
import {
  USER_SKELETON_COPY,
  type UserSkeletonCopy,
} from "../src/copy/user-copy.ts";

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

function lastDotKey(fullKey: string): string {
  const lastDot = fullKey.lastIndexOf(".");
  return lastDot === -1 ? fullKey : fullKey.slice(lastDot + 1);
}

type ByKeyMap = ReadonlyMap<string, readonly (readonly [string, string])[]>;

function buildByKeyMap(entries: readonly StringLeaf[]): ByKeyMap {
  const map = new Map<string, (readonly [string, string])[]>();
  for (const [full, value] of entries) {
    const key = lastDotKey(full);
    const existing = map.get(key) ?? [];
    map.set(key, [...existing, [full, value]]);
  }
  return map;
}

function countDifferentByKey(
  en: ByKeyMap,
  target: ByKeyMap,
): { sameKeyPairs: number; different: number } {
  let sameKeyPairs = 0;
  let different = 0;
  for (const [key, enList] of en) {
    const targetList = target.get(key);
    if (!targetList) continue;
    const min = Math.min(enList.length, targetList.length);
    for (let i = 0; i < min; i += 1) {
      sameKeyPairs += 1;
      if (enList[i][1] !== targetList[i][1]) different += 1;
    }
  }
  return { sameKeyPairs, different };
}

describe("USER_SKELETON_COPY trilingual acceptance", () => {
  it("only covers zh-CN / en / km and exports a typed UserSkeletonCopy for each language", () => {
    expect([...LANGUAGE_CODES].sort()).toEqual(["en", "km", "zh-CN"]);
    for (const code of LANGUAGE_CODES) {
      const row: UserSkeletonCopy = USER_SKELETON_COPY[code];
      expect(typeof row).toBe("object");
      expect(row).not.toBeNull();
    }
  });

  it("every leaf string is non-empty, non-placeholder, non-todo; no TODO/FIXME/PLACEHOLDER leaks", () => {
    const forbidden = /(TODO|FIXME|PLACEHOLDER|TBD|XX+)/i;
    for (const code of LANGUAGE_CODES) {
      const leaves = collectStringLeaves(USER_SKELETON_COPY[code]);
      expect(leaves.length).toBeGreaterThan(20);
      for (const [path, raw] of leaves) {
        const value = String(raw ?? "").trim();
        expect(value.length).toBeGreaterThanOrEqual(2);
        expect(forbidden.test(value)).toBe(false);
        expect(value).not.toContain("Lorem");
      }
    }
  });

  it("zh-CN and km differ from en in >=75% of by-key leaf pairs; no wholesale copy", () => {
    const enEntries = collectStringLeaves(USER_SKELETON_COPY.en);
    const zhEntries = collectStringLeaves(USER_SKELETON_COPY["zh-CN"]);
    const kmEntries = collectStringLeaves(USER_SKELETON_COPY.km);
    expect(enEntries.length).toBeGreaterThan(20);
    expect(zhEntries.length).toBe(enEntries.length);
    expect(kmEntries.length).toBe(enEntries.length);
    const enByKey = buildByKeyMap(enEntries);
    const zhByKey = buildByKeyMap(zhEntries);
    const kmByKey = buildByKeyMap(kmEntries);
    const zhStat = countDifferentByKey(enByKey, zhByKey);
    const kmStat = countDifferentByKey(enByKey, kmByKey);
    const zhThreshold = Math.ceil(zhStat.sameKeyPairs * 0.75);
    const kmThreshold = Math.ceil(kmStat.sameKeyPairs * 0.75);
    expect(zhStat.different).toBeGreaterThanOrEqual(zhThreshold);
    expect(kmStat.different).toBeGreaterThanOrEqual(kmThreshold);
  });

  it("never uses real applicant name, national id, passport, phone, salary, bank or payment-channel samples", () => {
    const text = LANGUAGE_CODES.flatMap((code) =>
      collectStringLeaves(USER_SKELETON_COPY[code]).map(([, v]) => v),
    ).join("\n");
    const patterns: readonly RegExp[] = [
      /\d{6,}/,
      /(national|passport|id)[\s-]*(number|no\.?)/i,
      /(phone|mobile|tel)[\s-]*(number|no\.?|\+\d)/i,
      /(salary|wage|income|monthly)[\s-]*base/i,
      /(aba|wing|acleda|stripe|payway|visa|mastercard|unionpay)/i,
      /(swift|iban|bank[\s-]*(account|no\.?))/i,
    ];
    for (const re of patterns) expect(text).not.toMatch(re);
  });
});
