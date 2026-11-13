/**
 * 1か所だけ変えた投稿の比べ（決まりは shared/oneSpotVariant.ts）。
 *
 *   pickOneSpotSource … そのアカウント自身の当たりから、まだ試していない元の投稿と場所を1つ選ぶ
 *   makeOneSpotVariant … LLMに「変える言葉」と「変えた後の言葉」だけを出させ、置き換えはこちらで行う（1か所だけを保証）
 *   recordOneSpotVariant … 元の投稿・変えた前後の言葉を残す
 */
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { selectHitCandidates } from "../shared/hitPatterns";
import { ONE_SPOT, ONE_SPOT_LABEL, SEASON_RE, applyOneSpot, nextSpot, stripSignature, type OneSpot } from "../shared/oneSpotVariant";

export type OneSpotSource = { threadsPostId: string; text: string; impressions: number; ratio: number; spot: OneSpot };

export async function pickOneSpotSource(accountId: number): Promise<OneSpotSource | null> {
  const db = await getDb();
  if (!db) return null;
  const rows: any[] = ((await db.execute(sql`
    SELECT pa.threadsPostId, pa.impressions, pa.replies, pa.postContent text,
           TIMESTAMPDIFF(HOUR, pa.postedAt, NOW()) / 24 ageDays
    FROM postAnalytics pa
    WHERE pa.threadsAccountId = ${accountId} AND pa.postedAt >= NOW() - INTERVAL 90 DAY`)) as any)[0] ?? [];
  const age = new Map<string, number>(rows.map((r) => [String(r.threadsPostId), Number(r.ageDays)]));
  const hits = selectHitCandidates(rows.map((r) => ({
    threadsPostId: String(r.threadsPostId), accountId, impressions: Number(r.impressions) || 0, text: r.text, replies: Number(r.replies) || 0,
  })));
  if (hits.length === 0) return null;
  const used: any[] = ((await db.execute(sql`
    SELECT sourceThreadsPostId s, spot, variantText v, TIMESTAMPDIFF(HOUR, createdAt, NOW()) / 24 ageDays
    FROM oneSpotVariants WHERE threadsAccountId = ${accountId}`)) as any)[0] ?? [];
  // 変えて出した投稿そのものは、元にしない（変えたものをさらに変えると何が効いたか分からなくなる）
  const variantTexts = new Set(used.map((u) => String(u.v).trim()));
  for (const h of hits) {
    const a = age.get(h.threadsPostId) ?? 0;
    if (a < ONE_SPOT.minSourceAgeDays || a > ONE_SPOT.maxSourceAgeDays) continue;
    if (variantTexts.has(h.text.trim())) continue;
    const text = stripSignature(h.text);
    if (variantTexts.has(text.trim()) || SEASON_RE.test(text)) continue;
    const mine = used.filter((u) => String(u.s) === h.threadsPostId);
    if (mine.some((u) => Number(u.ageDays) < ONE_SPOT.gapDaysPerSource)) continue;
    const lineCount = text.split("\n").filter((l) => l.trim()).length;
    const spot = nextSpot(mine.map((u) => String(u.spot)), lineCount);
    if (!spot) continue;
    return { threadsPostId: h.threadsPostId, text, impressions: h.impressions, ratio: h.ratio, spot };
  }
  return null;
}

const SCHEMA = {
  name: "one_spot",
  schema: {
    type: "object",
    properties: {
      changedFrom: { type: "string", description: "元の投稿から変える言葉。元の投稿にある文字をそのまま写す（2〜40文字・改行をまたがない）" },
      changedTo: { type: "string", description: "置き換える言葉（2〜40文字）。前後の文とそのままつながる形にする" },
    },
    required: ["changedFrom", "changedTo"],
    additionalProperties: false,
  },
  strict: true,
} as const;

export async function makeOneSpotVariant(
  source: OneSpotSource,
): Promise<{ text: string; changedFrom: string; changedTo: string } | null> {
  const { invokeLLM } = await import("./_core/llm");
  const { checkHealthClaims } = await import("../shared/healthClaimGuard");
  let hint = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const prompt = `次のThreads投稿は、このお店の普段よりよく読まれました。どの言葉に反応があったかを確かめるため、言葉を1か所だけ変えた投稿をもう一度出します。

- 変えるのは「${ONE_SPOT_LABEL[source.spot]}」の中の1か所だけ。${source.spot === "first_line" ? "1行目の中の、いちばん目を引いている言葉（名詞や言い切りの部分）を選ぶ。" : "2行目以降の中の、読む人が手に入れたいこと・気持ちを表している言葉を選ぶ。"}
- changedFrom には、元の投稿にある文字をそのまま写す（一字も変えない）。元の投稿に1回しか出てこない部分にする。
- changedTo は、同じ意味の言い換えではなく、別の切り口の言葉にする（例：別の場面・別の言い方の悩み）。前後の文とそのままつながること。
- 新しい事実・数字・実績・お客様の話・料金は足さない。効果を約束する言葉（治る・改善する・必ず）は使わない。店名・地名は変えない。
${hint}
---
${source.text}
---`;
    try {
      const res: any = await invokeLLM({ purpose: "one_spot_variant", messages: [{ role: "user", content: prompt }], outputSchema: SCHEMA as any });
      const content = res?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) continue;
      const p = JSON.parse(content);
      const applied = applyOneSpot(source.text, source.spot, String(p.changedFrom ?? ""), String(p.changedTo ?? ""));
      if (!applied.ok) { hint = `- 前回は「${applied.reason}」で使えなかった。決まりどおりに選び直す。`; continue; }
      if (/\d/.test(String(p.changedTo)) && !/\d/.test(String(p.changedFrom))) { hint = "- 前回は数字を足していた。数字は足さない。"; continue; }
      const claims = checkHealthClaims(applied.text);
      if (!claims.ok) { hint = `- 前回は効果を約束する言葉（${claims.hits.slice(0, 2).join("・")}）が入った。使わない。`; continue; }
      return { text: applied.text, changedFrom: String(p.changedFrom).trim(), changedTo: String(p.changedTo).trim() };
    } catch (e) {
      console.warn("[OneSpot] 変えた投稿を作れませんでした:", (e as Error)?.message);
    }
  }
  return null;
}

export async function recordOneSpotVariant(d: {
  accountId: number; source: OneSpotSource; changedFrom: string; changedTo: string; variantText: string; scheduledPostId: number | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.execute(sql`
    INSERT INTO oneSpotVariants (threadsAccountId, sourceThreadsPostId, sourceImpressions, spot, changedFrom, changedTo, variantText, scheduledPostId)
    VALUES (${d.accountId}, ${d.source.threadsPostId}, ${d.source.impressions}, ${d.source.spot}, ${d.changedFrom.slice(0, 120)}, ${d.changedTo.slice(0, 120)}, ${d.variantText}, ${d.scheduledPostId})`);
}
