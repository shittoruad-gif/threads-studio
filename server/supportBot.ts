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
import { hasUnkeptPromise } from "@shared/supportAnswerGuard";
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
  /**
   * 投稿の中身・書き方についてのご希望だったときの、決まりの文の案（shared/contentRequest.ts で整えてから使う）。
   * ご質問・操作の相談なら空。
   */
  contentRules: string[];
  /** 答えに守る人のいない約束（「担当者が登録します」）が入っていたため、答えられなかった扱いにしたか */
  unkeptPromise: boolean;
};

const SYSTEM_PROMPT = `あなたは「Threads Studio」というサービスのサポート担当です。
お客様（店舗オーナー・個人事業主）からのご質問に、日本語の敬体でお答えします。

【厳守】
1. 下の「サービス情報」と「このお客様の状況」に書かれていることだけを事実として使ってください。
   書かれていない料金・数字・機能・日程・対応可否を、推測で答えてはいけません。
2. どちらにも書かれていない質問（不具合の調査、要望、日程の相談、サービス外の話題など）は、
   答えを作らず confident を false にしてください。
   ただし「このお客様の状況」が付いている場合、そこに書かれているご契約・設定・件数は
   そのお客様ご自身のことですので、そのままお答えしてかまいません（confident は true）。
   例：「今月あと何件？」「私のプランはいくら？」「公開前確認は入っていますか？」
   状況に無い項目（例：来月の見込み、他社との比較）は、今までどおり confident を false にしてください。
3. 回答は3〜5文程度にまとめ、LINEのトークで読みやすい長さにしてください。
4. 箇条書きを使う場合は「・」を使い、記号の装飾や絵文字は使わないでください。
5. 操作をご案内するときは、アプリの画面名やLINEのボタン名をそのまま書いてください。
6. お客様は「Threads Studioのこと」と「Threadsアプリのこと」を分けて聞かれません。
   Threadsアプリ側の言葉（興味関心、トピック、ゴースト投稿など）を尋ねられたら、
   「Threads Studioにはその機能はありません」で終わらせず、
   サービス情報の【Threadsアプリ側のこと】を使って、アプリ側の話としてお答えしてください。
   そのうえで、Threads Studio側で代わりにできること（すでに自動でやっていること）があれば添えてください。
7. サービス情報に無いThreadsアプリの操作は、手順を推測で書かないでください。
   「Threadsアプリ側の設定で、こちらの画面からは確認できません」とお伝えし、confident を false にしてください。
8. 「担当者が登録します」「こちらで対応いたします」のように、サービス情報に書かれていない作業を
   担当者が代わりに行うと約束しないでください（confident が true の返事は担当者に届かないため、約束が守られません）。
   お客様ご自身でできる操作をご案内し、こちらの作業が要るときは confident を false にしてください。
   （2026-10-13 ご質問 #56「運動療法、リハサクをお勧めしたい」に「担当者が責任をもって登録させていただきます」と答え、どこにも登録されなかった）
   「担当者からご連絡します」「担当者におつなぎします」とも書かないでください。担当者へおつなぎするときは、こちらで決まった文をお出しします。
9. お客様の文が、ご自身の投稿の中身・書き方についてのご希望のとき（例：「〇〇の話題はいらない」「〇〇を勧めたい」「〇〇の話を増やして」
   「絵文字を減らして」「短くして」「呼びかけは町名なしで」）は、contentRules に「書き方の決まり」の文を入れてください。
   ・1つ80字以内の言い切り（例：「スポーツ選手の話題は書かない」「運動療法やリハサクをおすすめする」「絵文字は少なめにする」）
   ・お客様が書いた言葉（メニュー名・話題の名前）はそのまま使い、数字・料金・実績などの事実を足さない
   ・何を指すか分からない（「この辺を使って」「あれはやめて」）、ご質問・操作の相談・不具合のご連絡のときは空の配列 []
   contentRules を入れたときは、登録の確認はこちらでお出しするので、answer は空でかまいません（confident は true）。
   ご希望ではないときは、必ず空の配列 [] にしてください。

【サービス情報】
${productKnowledge()}`;

/** システムプロンプト＋（分かれば）このお客様ご自身の状況 */
export function systemPromptFor(facts: string | null | undefined): string {
  if (!facts) return SYSTEM_PROMPT;
  return `${SYSTEM_PROMPT}

【このお客様の状況】
${facts}`;
}

const SCHEMA = {
  name: "support_answer",
  schema: {
    type: "object",
    properties: {
      answer: { type: "string", description: "お客様への回答本文。答えられない場合は空文字" },
      confident: { type: "boolean", description: "サービス情報の範囲で確かに答えられたか" },
      category: { type: "string", enum: [...QUESTION_CATEGORIES], description: "質問の分類" },
      contentRules: {
        type: "array",
        items: { type: "string" },
        description: "投稿の中身・書き方についてのご希望なら、書き方の決まりの文（1つ80字以内の言い切り）。ご質問なら空の配列",
      },
    },
    required: ["answer", "confident", "category", "contentRules"],
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
  let result: { answer: string; confident: boolean; category: string; contentRules: string[] } = {
    answer: "",
    confident: false,
    category: "その他",
    contentRules: [],
  };
  let available = false;
  let unkeptPromise = false;

  // ★ご自身のご契約・件数のお尋ねは、知識だけでは答えようがない（誰にでも同じ説明しか持っていない）。
  //   読めた事実だけをプロンプトに添える。読めなくても今までどおり動く。
  let facts: string | null = null;
  try {
    const { customerFacts } = await import("./supportCustomerFacts");
    facts = await customerFacts(params.userId);
  } catch (e) {
    console.error("[SupportBot] お客様の状況の読み取りに失敗:", e);
  }

  try {
    const { invokeLLM } = await import("./_core/llm");
    const res: any = await invokeLLM({
      messages: [
        { role: "system", content: systemPromptFor(facts) },
        { role: "user", content: question },
      ],
      outputSchema: SCHEMA as any,
    });
    const content = res?.choices?.[0]?.message?.content;
    if (typeof content === "string" && content.trim()) {
      const parsed = JSON.parse(content);
      const contentRules = Array.isArray(parsed.contentRules)
        ? parsed.contentRules.map((r: unknown) => String(r ?? "").trim()).filter(Boolean).slice(0, 5)
        : [];
      result = {
        answer: String(parsed.answer || "").trim(),
        confident: Boolean(parsed.confident) && (Boolean(String(parsed.answer || "").trim()) || contentRules.length > 0),
        category: String(parsed.category || "その他"),
        contentRules,
      };
      available = true;
      // ★プロンプトで禁じても、守る人のいない約束（「担当者が登録します」）が出ることがある。
      //   答えられた扱いにすると担当者に届かないので、答えられなかった扱いにして担当者へ回す（2026-11-03）。
      if (result.confident && hasUnkeptPromise(result.answer)) {
        console.warn("[SupportBot] 守る人のいない約束が入った答えのため、担当者へ回します:", result.answer.slice(0, 80));
        result.confident = false;
        unkeptPromise = true;
      }
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

  return { ...result, available, questionId, unkeptPromise };
}
