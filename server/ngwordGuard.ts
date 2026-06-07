/**
 * NGワード（投稿に入れたくない言葉）を、文章として自然なまま除外するためのガード。
 *
 * 方針（自然さと「必ず含めない」の両立）:
 *  1. 生成プロンプトで禁止 → 大半はそのまま自然な文で出力される。
 *  2. それでもNGワードが残っていたら、AIに「その語を使わず、意味・トーンを保って
 *     自然な日本語に書き換え」させる（単純削除で不自然になるのを防ぐ）。
 *  3. 書き換え後も万一残っていたら、最終手段として機械的に削除（確定保証）。
 */
import { containsNgWord, applyNgWordFilter } from "../shared/ngwords";

type PostLike = {
  title?: string;
  mainPost?: string;
  treePosts?: string[];
  cta?: string;
  [k: string]: any;
};

const REWRITE_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "ngword_rewrite",
    strict: true,
    schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        mainPost: { type: "string" },
        treePosts: { type: "array", items: { type: "string" } },
        cta: { type: "string" },
      },
      required: ["title", "mainPost", "treePosts", "cta"],
      additionalProperties: false,
    },
  },
};

function hasAnyViolation(result: PostLike, ngWords: string[]): boolean {
  if (!ngWords.length) return false;
  const fields: (string | undefined)[] = [result.title, result.mainPost, result.cta, ...(result.treePosts ?? [])];
  return fields.some((f) => containsNgWord(f, ngWords));
}

/**
 * NGワードを自然な文章のまま除外する。違反が無ければそのまま返す（追加コストなし）。
 * 違反時のみ書き換えLLMを1回呼び、最後に確定削除で保証する。
 */
export async function enforceNgWords<T extends PostLike>(result: T, ngWords: string[]): Promise<T> {
  if (!result || ngWords.length === 0) return result;
  if (!hasAnyViolation(result, ngWords)) return result;

  let working: T = result;

  // 2) AIに自然な書き換えをさせる（意味・トーン維持）
  try {
    const { invokeLLM } = await import("./_core/llm");
    const prompt = `次のJSONの各テキスト（title / mainPost / treePosts[] / cta）から、下記の「禁止ワード」を使わずに、意味とトーンを保ったまま自然な日本語に書き換えてください。
- 単に語を削除して不自然な文（例：「当店はの価格で」）にしないこと。文として成立するよう言い換える。
- 禁止ワードは表記ゆれ・部分一致も含めて一切使わない。
- 元の構成・長さ・絵文字の使い方はできるだけ維持する。
- ハッシュタグ（#）は使わない。

【禁止ワード】
${ngWords.map((w) => `・${w}`).join("\n")}

【元のJSON】
${JSON.stringify({
  title: result.title ?? "",
  mainPost: result.mainPost ?? "",
  treePosts: result.treePosts ?? [],
  cta: result.cta ?? "",
})}

同じ構造のJSONのみを返してください。`;

    const res = await invokeLLM({
      messages: [{ role: "user", content: prompt }],
      response_format: REWRITE_SCHEMA,
    });
    const content = res.choices?.[0]?.message?.content;
    if (content && typeof content === "string") {
      const rewritten = JSON.parse(content);
      working = {
        ...working,
        title: typeof rewritten.title === "string" ? rewritten.title : working.title,
        mainPost: typeof rewritten.mainPost === "string" ? rewritten.mainPost : working.mainPost,
        treePosts: Array.isArray(rewritten.treePosts) ? rewritten.treePosts : working.treePosts,
        cta: typeof rewritten.cta === "string" ? rewritten.cta : working.cta,
      };
    }
  } catch (e) {
    console.error("[NGWord] rewrite failed, will fall back to deterministic strip:", e);
  }

  // 3) 最終保証: 書き換え後も残っていたら機械的に削除（必ず含めない）
  if (hasAnyViolation(working, ngWords)) {
    working = applyNgWordFilter(working, ngWords);
  }
  return working;
}
