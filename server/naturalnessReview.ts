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
import { emojiAllowed, splitStyleSamples } from "../shared/styleTraits";

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
  ctx: {
    brandVoice?: string | null; businessType?: string | null; storeName?: string | null;
    /** 店主の理想の投稿（本人の過去投稿、または本人が貼った例）。あれば「これに近いか」で採点する */
    styleSamples?: string | null;
    /** この店を指す言葉（地名・店名・実績など）。らしさの手がかり */
    identityHint?: string | null;
  },
): Promise<NaturalnessReview | null> {
  const voice = String(ctx.brandVoice || "").trim();
  // ★お手本が絵文字を使っている／口調に「フレンドリー」が入っているなら、
  //   絵文字とあたたかい締め（「〜していますよ😊」）を減点材料にしない（2026-09-11）。
  //   ここが一律に減点していたため、「丁寧な敬語＋少しフレンドリー」で登録した方の投稿が
  //   作り直しても同じ理由で落ち続け、その日の投稿がゼロになっていた。
  const warmOk = emojiAllowed(voice, ctx.styleSamples ?? null);
  const samples = splitStyleSamples(ctx.styleSamples).slice(0, 2)
    .map((s) => Array.from(s).slice(0, 300).join(""));
  const sampleBlock = samples.length
    ? `\n【店主の理想の投稿（お手本）】\n以下は店主本人が「こういう投稿を出したい」と示した実物です。採点は「この店主が書いたと言われて違和感がないか」を最優先にしてください。\n---\n${samples.join("\n---\n")}\n---\n`
    : "";
  const prompt = `あなたは日本語の編集者です。次の文は、${ctx.businessType || "お店"}${ctx.storeName ? `「${ctx.storeName}」` : ""}の店主がThreadsに投稿する下書きです。
${voice ? `店主が登録した口調：「${voice}」\n` : ""}${ctx.identityHint ? `この店を指す言葉：${ctx.identityHint}\n` : ""}${sampleBlock}
店主本人が自分のスマホで打った文に見えるか、そしてこの店主らしいかを、1〜5で採点してください。
どこの${ctx.businessType || "お店"}でも出せる一般的な文は、文法が正しくても3以下です。

【3以下（出せない）にする例】
- 名詞や一語で切る問いかけ（「〜など、心当たり？」）
- 登録した口調と合わない砕けた言い方（敬語の店で「だね」「だよ」${warmOk ? "" : "「〜ますよ😊」"}）
- 症状や不調を予告・断定する言い切り（「秋に3つの不調が出ます」）
- 症状やメニューを「〜や〜、〜など」と並べるだけの文
- 「お手伝いをしています」「サポートします」のような、どの店でも言える締め
- 読点で無理に切った断片、主語と述語が噛み合わない文、直訳のような言い回し

【4以上にしてよい例】
- 短くても、1つのことを店主の言葉で言い切っている
- 問いかけがあるなら、相手が本当に答えられる質問になっている（「もし着物で海外へ行くなら、どこへ？」のように疑問詞があれば可）
${warmOk ? "- 絵文字が入っている／「〜していますよ😊」のようにあたたかく締めている（この店主はそう登録し、お手本もそう書いているので減点しない）\n" : ""}

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
