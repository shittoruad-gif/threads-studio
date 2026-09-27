/**
 * 他店の当たり型を貯める・選ぶ（2026-09-28 三上様指示・shared/hitPatterns.ts に決まり）。
 *
 *   refreshHitPatterns … postAnalytics から当たりを選び、LLMで「型」だけを取り出して hitPatterns に入れる。
 *                         元の投稿が健康表現の検査に落ちるもの・型に本文が漏れたものは rejected で残す（使わない）。
 *   pickHitPatternId   … 枠ごとに、同じ業種のまとまりで最近使っていない型を1つ選ぶ。
 */
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  businessGroupOf, selectHitCandidates, validatePattern, type BusinessGroup,
} from "../shared/hitPatterns";

const SCHEMA = {
  name: "hit_pattern",
  schema: {
    type: "object",
    properties: {
      liveFact: { type: "boolean", description: "その日・その場の事実（今日の出来事・空き枠・日付・天気・イベント・募集）が無いと書けない投稿なら true" },
      pattern: { type: "string", description: "型。1行目の形／段の順番（各段で何をするか）／締め方／おおよその長さ、を箇条書きで。店名・地名・人名・数字・固有の出来事・元の言い回しは一切書かない" },
    },
    required: ["liveFact", "pattern"],
    additionalProperties: false,
  },
  strict: true,
} as const;

async function extractPattern(text: string): Promise<{ liveFact: boolean; pattern: string } | null> {
  const { invokeLLM } = await import("./_core/llm");
  const prompt = `次のThreads投稿は、そのお店の普段の2倍以上読まれました。別のお店が同じ「型」で書けるように、型だけを取り出してください。

- 取り出すもの：1行目の形（例：よくある思い込みを一言で否定する／患者さんのセリフで始める）、段の順番と各段の役割、締め方、おおよその長さ
- 書かないもの：店名・地名・人名・数字・固有の出来事・症状名の具体例・元の文の言い回し（元の文を8文字以上続けて写さない）
- 効果の言い切り（治る・逆効果・根本改善など）は型に入れない

---
${text}
---`;
  try {
    const res: any = await invokeLLM({ messages: [{ role: "user", content: prompt }], outputSchema: SCHEMA as any });
    const content = res?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) return null;
    const parsed = JSON.parse(content);
    return { liveFact: Boolean(parsed.liveFact), pattern: String(parsed.pattern ?? "").trim() };
  } catch (e) {
    console.warn("[HitPatterns] 型を取り出せませんでした:", (e as Error)?.message);
    return null;
  }
}

export async function refreshHitPatterns(opts: { dryRun?: boolean; limit?: number; sinceDays?: number } = {}): Promise<{ candidates: number; added: number; rejected: number; lines: string[] }> {
  const db = await getDb();
  if (!db) throw new Error("DB未接続");
  const sinceDays = opts.sinceDays ?? 90;
  const rows: any[] = ((await db.execute(sql`
    SELECT DISTINCT pa.threadsPostId, pa.threadsAccountId accountId, pa.impressions, pa.postContent text
    FROM postAnalytics pa
    JOIN threadsAccounts a ON a.id = pa.threadsAccountId AND a.userId = pa.userId
    JOIN users u ON u.id = a.userId
    WHERE (u.isDemoMode IS NULL OR u.isDemoMode = 0) AND u.email NOT LIKE 'meta-review%'
      AND pa.postedAt >= NOW() - INTERVAL ${sinceDays} DAY
      AND pa.postedAt < NOW() - INTERVAL 24 HOUR`)) as any)[0] ?? [];
  const cands = selectHitCandidates(rows.map((r) => ({
    threadsPostId: String(r.threadsPostId), accountId: Number(r.accountId), impressions: Number(r.impressions) || 0, text: r.text,
  })));
  let existing = new Set<string>();
  try {
    existing = new Set<string>((((await db.execute(sql`SELECT sourceThreadsPostId s FROM hitPatterns`)) as any)[0] ?? []).map((r: any) => String(r.s)));
  } catch (e) {
    if (!opts.dryRun) throw e; // 試しの表示だけなら、表がまだ無くても進める
  }

  // 業種のまとまり（アカウントのお店の情報から）
  const groupOf = new Map<number, BusinessGroup>();
  const accRows: any[] = ((await db.execute(sql`
    SELECT a.id, p.businessType, p.target, p.mainProblem, p.n1Customer
    FROM threadsAccounts a LEFT JOIN projects p ON p.id = a.defaultProjectId`)) as any)[0] ?? [];
  const { looksLikeRecruiting } = await import("../shared/recruitingPost");
  for (const a of accRows) groupOf.set(Number(a.id), businessGroupOf(a.businessType, { recruiting: looksLikeRecruiting(a) }));

  const { checkHealthClaims } = await import("../shared/healthClaimGuard");
  const lines: string[] = [];
  let added = 0, rejected = 0, done = 0;
  for (const c of cands) {
    if (existing.has(c.threadsPostId)) continue;
    if (opts.limit && done >= opts.limit) break;
    done++;
    const group = groupOf.get(c.accountId) ?? "other";
    let status = "active";
    let note: string | null = null;
    let pattern = "";
    const claims = checkHealthClaims(c.text);
    if (!claims.ok) {
      status = "rejected"; note = `元の投稿が健康表現の検査に落ちる（${claims.hits.slice(0, 2).join("・")}）`;
    } else {
      const ex = await extractPattern(c.text);
      if (!ex) { status = "rejected"; note = "型を取り出せなかった"; }
      else if (ex.liveFact) { status = "rejected"; note = "その場の事実が要る型（店主の一言が要る）"; pattern = ex.pattern; }
      else {
        pattern = ex.pattern;
        const v = validatePattern(pattern, c.text, group);
        if (!v.ok) { status = "rejected"; note = v.reason; }
      }
    }
    lines.push(`${status === "active" ? "採用" : "不採用"} acc${c.accountId}(${group}) ${c.impressions}回・普段の${c.ratio}倍${note ? `／${note}` : ""}`);
    if (opts.dryRun && status === "active") lines.push(pattern.split("\n").map((l) => "    " + l).join("\n"));
    if (status === "active") added++; else rejected++;
    if (!opts.dryRun) {
      await db.execute(sql`
        INSERT IGNORE INTO hitPatterns (sourceThreadsPostId, sourceAccountId, businessGroup, impressions, ratio, pattern, status, note)
        VALUES (${c.threadsPostId}, ${c.accountId}, ${group}, ${c.impressions}, ${c.ratio}, ${pattern || "(なし)"}, ${status}, ${note})`);
    }
  }
  return { candidates: cands.length, added, rejected, lines };
}

/** 同じ業種のまとまりの型から、ここ14日で使った回数が少ないものを1つ。自分のアカウントの型は後回し */
export async function pickHitPatternId(accountId: number, group: BusinessGroup): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const rows: any[] = ((await db.execute(sql`
    SELECT h.id, h.sourceAccountId,
      (SELECT COUNT(*) FROM scheduledPosts s WHERE s.hitPatternId = h.id AND s.createdAt >= NOW() - INTERVAL 14 DAY) used,
      (SELECT COUNT(*) FROM scheduledPosts s WHERE s.hitPatternId = h.id AND s.threadsAccountId = ${accountId} AND s.createdAt >= NOW() - INTERVAL 30 DAY) usedHere
    FROM hitPatterns h
    WHERE h.status = 'active' AND h.businessGroup = ${group}`)) as any)[0] ?? [];
  if (rows.length === 0) return null;
  rows.sort((a, b) =>
    Number(a.usedHere) - Number(b.usedHere)
    || (Number(a.sourceAccountId) === accountId ? 1 : 0) - (Number(b.sourceAccountId) === accountId ? 1 : 0)
    || Number(a.used) - Number(b.used)
    || Math.random() - 0.5);
  return Number(rows[0].id);
}

export async function getHitPatternText(id: number): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows: any[] = ((await db.execute(sql`SELECT pattern FROM hitPatterns WHERE id = ${id} AND status = 'active' LIMIT 1`)) as any)[0] ?? [];
  return rows[0]?.pattern ? String(rows[0].pattern) : null;
}
