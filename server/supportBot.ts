/**
 * お客様からのご質問に自動でお答えする仕組み。
 *
 * 方針:
 *  - 事実は shared/productKnowledge.ts に書かれていることだけを使う。
 *    知らないことを推測で答えると、後から「言っていたことと違う」になるため。
 *  - 答えられないと判断したら、答えを作らずに担当者へおつなぎする。
 *  - 質問はすべて記録し、「よくある質問」への反映と説明会の題材づくりに使う。
 */
import { productKnowledge, QUESTION_CATEGORIES } from "@shared/productKnowledge";
import * as db from "./db";

export type BotAnswer = {
  /** お客様にお送りする本文 */
  answer: string;
  /** 知識の範囲で答えられたか（false なら担当者へ） */
  confident: boolean;
  /**
   * AIに問い合わせできたか。
   * false は「AIが落ちていて判断すらできていない」状態で、
   * このときだけ従来のキーワード案内にフォールバックする。
   */
  available: boolean;
  /** 質問の分類 */
  category: string;
  /** 記録した質問のID（担当者返信・FAQ反映で使う） */
  questionId?: number;
};

const SYSTEM_PROMPT = `あなたは「Threads Studio」というサービスのサポート担当です。
お客様（店舗オーナー・個人事業主）からのご質問に、日本語の敬体でお答えします。

【厳守】
1. 下の「サービス情報」に書かれていることだけを事実として使ってください。
   書かれていない料金・数字・機能・日程・対応可否を、推測で答えてはいけません。
2. サービス情報から答えられない質問（個別のご契約状況、不具合の調査、要望、日程の相談、
   サービス外の話題など）は、答えを作らず confident を false にしてください。
3. 回答は3〜5文程度にまとめ、LINEのトークで読みやすい長さにしてください。
4. 箇条書きを使う場合は「・」を使い、記号の装飾や絵文字は使わないでください。
5. 操作をご案内するときは、アプリの画面名やLINEのボタン名をそのまま書いてください。

【サービス情報】
${productKnowledge()}`;

const SCHEMA = {
  name: "support_answer",
  schema: {
    type: "object",
    properties: {
      answer: { type: "string", description: "お客様への回答本文。答えられない場合は空文字" },
      confident: { type: "boolean", description: "サービス情報の範囲で確かに答えられたか" },
      category: { type: "string", enum: [...QUESTION_CATEGORIES], description: "質問の分類" },
    },
    required: ["answer", "confident", "category"],
    additionalProperties: false,
  },
  strict: true,
} as const;

/** 担当者へおつなぎするときの定型文 */
export const HANDOFF_TEXT =
  "申し訳ありません、こちらではお答えしきれないご質問でした。\n" +
  "担当者におつなぎしますので、下の「担当者に聞く」を押してから、ご質問をもう一度お送りください。";

/**
 * ご質問に自動でお答えし、内容を記録する。
 * AIが使えない・失敗した場合も、記録だけは残して担当者へつなぐ。
 */
export async function answerQuestion(params: {
  question: string;
  userId?: number | null;
  lineUserId?: string | null;
  source?: "line" | "web";
}): Promise<BotAnswer> {
  const question = params.question.trim().slice(0, 1000);
  let result: { answer: string; confident: boolean; category: string } = {
    answer: "",
    confident: false,
    category: "その他",
  };
  let available = false;

  try {
    const { invokeLLM } = await import("./_core/llm");
    const res: any = await invokeLLM({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: question },
      ],
      outputSchema: SCHEMA as any,
    });
    const content = res?.choices?.[0]?.message?.content;
    if (typeof content === "string" && content.trim()) {
      const parsed = JSON.parse(content);
      result = {
        answer: String(parsed.answer || "").trim(),
        confident: Boolean(parsed.confident) && Boolean(String(parsed.answer || "").trim()),
        category: String(parsed.category || "その他"),
      };
      available = true;
    }
  } catch (e) {
    console.error("[SupportBot] 自動応答に失敗:", e);
  }

  let questionId: number | undefined;
  try {
    questionId = await db.createSupportQuestion({
      userId: params.userId ?? null,
      lineUserId: params.lineUserId ?? null,
      source: params.source ?? "line",
      question,
      aiAnswer: result.answer || null,
      aiConfident: result.confident ? 1 : 0,
      category: result.category,
    });
  } catch (e) {
    console.error("[SupportBot] ご質問の記録に失敗:", e);
  }

  return { ...result, available, questionId };
}
