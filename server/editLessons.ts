/**
 * アカウントごとの手直しから決まりを作る（shared/editLessons.ts・2026-10-08 クレーム対応）。
 * 1つのアカウントについて、いちばん新しい手直しが変わるまで結果を覚えておく（朝の生成で毎枠AIを呼ばない）。
 */
import * as db from "./db";
import { sql } from "drizzle-orm";
import { EDIT_LESSONS, buildEditLessonsPrompt, EDIT_LESSONS_SCHEMA, parseEditLessons, type EditPair } from "../shared/editLessons";

const cache = new Map<string, { rules: string[]; pairs: EditPair[] }>();

/** このアカウントの手直し（新しい順）。アカウントが分かればそのアカウントだけ（別のアカウントの直しを混ぜない） */
export async function getAccountEditPairs(userId: number, threadsAccountId: number | null, limit: number = EDIT_LESSONS.maxPairs): Promise<{ pairs: EditPair[]; latest: string }> {
  const d = await db.getDb();
  if (!d) return { pairs: [], latest: "" };
  const n = Math.min(Math.max(limit, 1), 30);
  const rows: any = await d.execute(sql`
    SELECT originalContent, postContent, editedByUserAt FROM scheduledPosts
    WHERE userId = ${userId} AND editedByUserAt IS NOT NULL
      AND originalContent IS NOT NULL AND postContent IS NOT NULL
      ${threadsAccountId ? sql`AND threadsAccountId = ${threadsAccountId}` : sql``}
    ORDER BY editedByUserAt DESC LIMIT ${n}`);
  const list = ((rows as any)[0] ?? []) as any[];
  const pairs = list
    .map((r) => ({ before: String(r.originalContent ?? ""), after: String(r.postContent ?? "") }))
    .filter((p) => p.after.trim().length >= 20 && p.before.replace(/\s/g, "") !== p.after.replace(/\s/g, ""));
  return { pairs, latest: list[0]?.editedByUserAt ? new Date(list[0].editedByUserAt).toISOString() : "" };
}

export async function getEditLessons(userId: number, threadsAccountId: number): Promise<{ rules: string[]; pairs: EditPair[] }> {
  const { pairs, latest } = await getAccountEditPairs(userId, threadsAccountId);
  if (pairs.length === 0) return { rules: [], pairs: [] };
  const key = `${threadsAccountId}:${latest}:${pairs.length}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let rules: string[] = [];
  if (pairs.length >= EDIT_LESSONS.minPairs) {
    try {
      const { invokeLLM } = await import("./_core/llm");
      const res: any = await invokeLLM({ messages: [{ role: "user", content: buildEditLessonsPrompt(pairs) }], response_format: EDIT_LESSONS_SCHEMA } as any);
      rules = parseEditLessons(String(res?.choices?.[0]?.message?.content ?? ""));
    } catch (e) {
      console.warn(`[EditLessons] 決まりを作れませんでした account=${threadsAccountId}: ${(e as Error)?.message}`);
    }
  }
  const out = { rules, pairs };
  cache.set(key, out);
  return out;
}
