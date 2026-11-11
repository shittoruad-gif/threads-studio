/**
 * AIの利用量の記録（2026-11-11 三上様「投稿数を増やしたらこちらがかかるコストはどれぐらい変わる？」）。
 *
 * これまで利用量をどこにも残しておらず、1投稿あたりの原価を実測できなかった
 * （docs/scaling-thresholds.md にも「実測は取得できず」）。
 * 日（JST）・用途・モデルごとに、呼び出しの回数とトークン数を足し込む（表 llmUsageDaily・0116）。
 * 本文やお客様の情報は残さない。数だけ。
 *
 *  - promptTokens     … 入力
 *  - completionTokens … 出力（見える文）
 *  - totalTokens      … 合計。合計 −（入力＋出力）が「考えた分」（出力として課金される）
 *  - cachedTokens     … 入力のうち、キャッシュが効いて割引になった分
 *
 * 1回ごとにDBへ書かず、メモリにためて30秒ごとにまとめて書く（朝の生成は数百回の呼び出しが続くため）。
 */
import type { InvokeResult } from "./_core/llm";

type Bucket = { day: string; purpose: string; model: string; calls: number; prompt: number; completion: number; total: number; cached: number };

const FLUSH_MS = 30_000;
const pending = new Map<string, Bucket>();
let timer: ReturnType<typeof setTimeout> | null = null;

export function jstDay(now: number = Date.now()): string {
  return new Date(now + 9 * 3600_000).toISOString().slice(0, 10);
}

export function cleanPurpose(purpose: string | null | undefined): string {
  const p = String(purpose ?? "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 40);
  return p || "other";
}

/** 応答1件ぶんを足し込む形にする（数えられないものは0） */
export function usageRow(purpose: string | null | undefined, res: Pick<InvokeResult, "model" | "usage"> | null | undefined, now: number = Date.now()): Bucket {
  const u: any = res?.usage ?? {};
  const n = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : 0);
  return {
    day: jstDay(now),
    purpose: cleanPurpose(purpose),
    model: String(res?.model ?? "").replace(/^models\//, "").replace(/[^A-Za-z0-9.\-_]/g, "").slice(0, 60) || "unknown",
    calls: 1,
    prompt: n(u.prompt_tokens),
    completion: n(u.completion_tokens),
    total: n(u.total_tokens),
    cached: n(u.prompt_tokens_details?.cached_tokens),
  };
}

export function mergeUsage(into: Map<string, Bucket>, row: Bucket): void {
  const key = `${row.day}|${row.purpose}|${row.model}`;
  const cur = into.get(key);
  if (!cur) { into.set(key, { ...row }); return; }
  cur.calls += row.calls; cur.prompt += row.prompt; cur.completion += row.completion; cur.total += row.total; cur.cached += row.cached;
}

export function recordLlmUsage(purpose: string | null | undefined, res: InvokeResult): void {
  if (process.env.VITEST || process.env.NODE_ENV === "test") return;
  mergeUsage(pending, usageRow(purpose, res));
  if (!timer) {
    timer = setTimeout(() => { timer = null; void flushLlmUsage(); }, FLUSH_MS);
    (timer as any).unref?.();
  }
}

export async function flushLlmUsage(): Promise<number> {
  if (pending.size === 0) return 0;
  const rows = Array.from(pending.values());
  pending.clear();
  try {
    const { getDb } = await import("./db");
    const d = await getDb();
    if (!d) return 0;
    const { sql } = await import("drizzle-orm");
    for (const r of rows) {
      await d.execute(sql`INSERT INTO llmUsageDaily (day, purpose, model, calls, promptTokens, completionTokens, totalTokens, cachedTokens)
        VALUES (${r.day}, ${r.purpose}, ${r.model}, ${r.calls}, ${r.prompt}, ${r.completion}, ${r.total}, ${r.cached})
        ON DUPLICATE KEY UPDATE calls = calls + VALUES(calls), promptTokens = promptTokens + VALUES(promptTokens),
          completionTokens = completionTokens + VALUES(completionTokens), totalTokens = totalTokens + VALUES(totalTokens),
          cachedTokens = cachedTokens + VALUES(cachedTokens)`);
    }
    return rows.length;
  } catch (e) {
    console.warn(`[LlmUsage] 記録できませんでした: ${(e as Error)?.message?.slice(0, 160)}`);
    return 0;
  }
}
