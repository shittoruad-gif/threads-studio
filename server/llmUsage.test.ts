import { describe, it, expect } from "vitest";
import { cleanPurpose, jstDay, mergeUsage, usageRow } from "./llmUsage";

describe("AIの利用量の記録", () => {
  it("日付はJSTで切る", () => {
    expect(jstDay(Date.UTC(2026, 10, 10, 14, 59))).toBe("2026-11-10");
    expect(jstDay(Date.UTC(2026, 10, 10, 15, 0))).toBe("2026-11-11");
  });
  it("用途は半角英数字と_だけ。空なら other", () => {
    expect(cleanPurpose("post_generate")).toBe("post_generate");
    expect(cleanPurpose("お店の名前 x-1")).toBe("x1");
    expect(cleanPurpose(undefined)).toBe("other");
  });
  it("応答から数だけを取り出す（無い数は0）", () => {
    const now = Date.UTC(2026, 10, 10, 20, 0);
    const r = usageRow("naturalness_review", { model: "models/gemini-2.5-flash", usage: { prompt_tokens: 306, completion_tokens: 25, total_tokens: 1106, prompt_tokens_details: { cached_tokens: 100 } } } as any, now);
    expect(r).toEqual({ day: "2026-11-11", purpose: "naturalness_review", model: "gemini-2.5-flash", calls: 1, prompt: 306, completion: 25, total: 1106, cached: 100 });
    const z = usageRow(null, { model: "", usage: undefined } as any, now);
    expect(z).toMatchObject({ purpose: "other", model: "unknown", calls: 1, prompt: 0, completion: 0, total: 0, cached: 0 });
  });
  it("同じ日・用途・モデルは足し込み、違えば別の行", () => {
    const m = new Map<string, any>();
    const now = Date.UTC(2026, 10, 10, 20, 0);
    const res = { model: "gemini-2.5-flash", usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 30 } } as any;
    mergeUsage(m, usageRow("a", res, now));
    mergeUsage(m, usageRow("a", res, now));
    mergeUsage(m, usageRow("b", res, now));
    expect(m.size).toBe(2);
    expect(m.get("2026-11-11|a|gemini-2.5-flash")).toMatchObject({ calls: 2, prompt: 20, completion: 4, total: 60 });
  });
});
