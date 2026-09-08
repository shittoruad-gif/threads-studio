/**
 * 投稿の「自然さ」をAIに採点させる最終関門（2026-09-08 三上様指示「二度と不自然な日本語を出さない」）。
 *
 * 正規表現で取れるのは語尾の癖まで。「夏の疲れ、そのままにすると秋に3つの不調が出ます。」のように
 * 文法は合っていても店主が書く文に見えないものは、読んで判断するしかない。
 * 生成とは別の短い依頼で「店主が自分のスマホで打った文に見えるか」を1〜5で採点させ、
 * 基準未満なら公開せず作り直す（呼び出し側で最大3回）。
 *
 * APIが落ちているときは止めない（機械検査は別に通っている）。ただしログに残す。
 */
import { invokeLLM } from "./_core/llm";

export const NATURALNESS_MIN_SCORE = 4;

export interface NaturalnessReview {
  score: number;
  problems: string[];
}

const SCHEMA = {
  name: "naturalness_review",
  schema: {
    type: "object",
    properties: {
      score: { type: "integer", description: "1〜5。5=店主が自分で打った文にしか見えない。3以下=不自然で出せない" },
      problems: { type: "array", items: { type: "string" }, description: "不自然な箇所を、その文を引用して短く" },
    },
    required: ["score", "problems"],
    additionalProperties: false,
  },
  strict: true,
} as const;

export async function reviewNaturalness(
  text: string,
  ctx: { brandVoice?: string | null; businessType?: string | null; storeName?: string | null },
): Promise<NaturalnessReview | null> {
  const voice = String(ctx.brandVoice || "").trim();
  const prompt = `あなたは日本語の編集者です。次の文は、${ctx.businessType || "お店"}${ctx.storeName ? `「${ctx.storeName}」` : ""}の店主がThreadsに投稿する下書きです。
${voice ? `店主が登録した口調：「${voice}」\n` : ""}
店主本人が自分のスマホで打った文に見えるかを、1〜5で採点してください。

【3以下（出せない）にする例】
- 名詞や一語で切る問いかけ（「〜など、心当たり？」）
- 登録した口調と合わない砕けた言い方（敬語の店で「〜ますよ😊」「だね」）
- 症状や不調を予告・断定する言い切り（「秋に3つの不調が出ます」）
- 症状やメニューを「〜や〜、〜など」と並べるだけの文
- 「お手伝いをしています」「サポートします」のような、どの店でも言える締め
- 読点で無理に切った断片、主語と述語が噛み合わない文、直訳のような言い回し

【4以上にしてよい例】
- 短くても、1つのことを店主の言葉で言い切っている
- 問いかけがあるなら、相手が本当に答えられる質問になっている

採点だけでなく、不自然な箇所をその文を引用して挙げてください。無ければ空配列。

---
${text}
---`;
  try {
    const res: any = await invokeLLM({
      messages: [{ role: "user", content: prompt }],
      outputSchema: SCHEMA as any,
    });
    const content = res?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) return null;
    const parsed = JSON.parse(content);
    const score = Math.max(1, Math.min(5, Number(parsed.score) || 0));
    const problems = Array.isArray(parsed.problems) ? parsed.problems.map((p: unknown) => String(p).slice(0, 120)).slice(0, 5) : [];
    return { score, problems };
  } catch (e) {
    console.warn("[NaturalnessReview] 採点できませんでした（止めずに進めます）:", (e as Error)?.message);
    return null;
  }
}
