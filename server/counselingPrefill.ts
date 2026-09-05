/**
 * 連携ずみのThreadsアカウント（アカウント名・プロフィール文）から、
 * 「はじめの設定」の答えを先に埋めておく。
 *
 * 三上様指示（2026-09-06）：お客様は先にアカウントを連携しているので、
 * プロフィールを読んで業種や内容を入れた状態で質問を出し、
 * 直したいところだけ直して進めるのが理想。
 *
 * ★書いてあることしか使わない。プロフィールに無い実績・メニュー・特典を
 *   AIが補ってはいけない（事実だけで投稿を作る、という土台を崩さないため）。
 *   読み取れない項目は空にして、ふつうに質問する。
 */
import * as db from "./db";
import { invokeLLM } from "./_core/llm";

/** 先に埋める対象（これ以外の質問はプロフィールから読み取れない） */
export const PREFILL_FIELDS = [
  "businessTypeRaw", "areaRaw", "storeNameRaw", "targetRaw", "mainProblemRaw",
  "strengthRaw", "uspRaw", "menuRaw", "hoursInfoRaw", "realProofsRaw", "ctaAssetsRaw",
] as const;
export type PrefillField = typeof PREFILL_FIELDS[number];
export type Prefill = Partial<Record<PrefillField, string>>;

export interface PrefillResult {
  answers: Prefill;
  /** 何を読んだか（案内文に出す。例：「@tsunokuniya のプロフィール」） */
  source: string;
}

const FIELD_GUIDE: Record<PrefillField, string> = {
  businessTypeRaw: "業種（例：呉服店、整体院、カフェ）。屋号や文面から明らかな場合だけ",
  areaRaw: "所在地（市区町村・町名）。書いてある場合だけ",
  storeNameRaw: "お店の名前・屋号。アカウント名から読める場合も含む",
  targetRaw: "来てほしいお客さん像。文面に「〜の方へ」などがある場合だけ",
  mainProblemRaw: "お客さんの悩み。文面に書いてある場合だけ",
  strengthRaw: "強み・こだわり。文面に書いてある場合だけ",
  uspRaw: "選ぶ理由を一言で。文面に書いてある場合だけ",
  menuRaw: "メニュー・商品。文面に書いてあるものだけ（読点区切り）",
  hoursInfoRaw: "営業時間・定休日・予約方法。書いてある場合だけ",
  realProofsRaw: "数字の実績（創業〇年など）。書いてある数字だけ",
  ctaAssetsRaw: "初回の特典・無料相談など。書いてある場合だけ",
};

/** AIの出力を安全な形に整える（知らないキー・空・長すぎるものを落とす） */
export function sanitizePrefill(raw: unknown): Prefill {
  const out: Prefill = {};
  if (!raw || typeof raw !== "object") return out;
  for (const k of PREFILL_FIELDS) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v !== "string") continue;
    const t = v.replace(/\s+/g, " ").trim();
    if (!t || /^(なし|不明|未記載|n\/a|none|null)$/i.test(t)) continue;
    out[k] = Array.from(t).slice(0, 200).join("");
  }
  return out;
}

/** 先に入れた答えの出どころ。saved＝前回の登録内容、profile＝連携アカウントのプロフィール */
export type PrefillKind = "saved" | "profile";

/** 質問に添える「こう入れてあります」の文 */
export function prefillProposalText(value: string, source: string, kind: PrefillKind = "profile"): string {
  const lead = kind === "saved"
    ? "いまの登録内容："
    : `${source}から、こう読み取りました：`;
  return `${lead}\n「${value}」\n\n合っていれば「これでOK」を押してください。変えたい場合は、新しい内容をそのまま送ってください。`;
}

/** 設定の最初に出す案内（先に入れた項目があるときだけ） */
export function prefillIntroText(source: string, count: number, kind: PrefillKind = "profile"): string {
  if (kind === "saved") {
    return `前回ご登録いただいた内容を入れてあります（${count}項目）。\nもう一度すべて入力していただく必要はありません。合っているものは「これでOK」を押すだけで進み、変えたいところだけ直せます。`;
  }
  return `${source}を読んで、分かる範囲で先に入れておきました（${count}項目）。\n合っているものは「これでOK」を押すだけで進めます。`;
}

/**
 * すでに登録ずみのお店の情報から、答えをそのまま先に入れる。
 * ★登録が終わっている方に20問をもう一度入力させない（2026-09-06 三上様指示）。
 *   counselingResult.rawAnswers があればそれを、無ければ列の値から復元する。
 */
export function buildPrefillFromSavedProject(project: {
  businessType?: string | null; area?: string | null; storeName?: string | null;
  target?: string | null; mainProblem?: string | null; strength?: string | null;
  usp?: string | null; proof?: string | null; n1Customer?: string | null; belief?: string | null;
  ngWords?: string | null; counselingResult?: string | null;
} | null | undefined): Record<string, string> {
  if (!project) return {};
  let raw: Record<string, unknown> = {};
  if (project.counselingResult) {
    try { raw = JSON.parse(project.counselingResult)?.rawAnswers ?? {}; } catch { raw = {}; }
  }
  const out: Record<string, string> = {};
  const put = (k: string, v: unknown) => {
    const t = typeof v === "string" ? v.trim() : "";
    if (t) out[k] = t;
  };
  for (const [k, v] of Object.entries(raw)) put(k, v);
  // 古い登録で rawAnswers が無い場合は、列の値から分かるものだけ
  const fallback: Record<string, string | null | undefined> = {
    businessTypeRaw: project.businessType, areaRaw: project.area, storeNameRaw: project.storeName,
    targetRaw: project.target, mainProblemRaw: project.mainProblem, strengthRaw: project.strength,
    uspRaw: project.usp, realProofsRaw: project.proof, realEpisodesRaw: project.n1Customer,
    industryMythsRaw: project.belief, ngListRaw: project.ngWords,
  };
  for (const [k, v] of Object.entries(fallback)) if (!out[k]) put(k, v);
  return out;
}

/**
 * アカウントのプロフィールから答えを読み取る。失敗したら空（ふつうに質問する）。
 * @param accountId 指定が無ければ、そのお客様の1つ目の有効なアカウント
 */
export async function buildPrefillFromThreadsAccount(userId: number, accountId?: number | null): Promise<PrefillResult> {
  const empty: PrefillResult = { answers: {}, source: "" };
  let account: any = null;
  try {
    const accounts = ((await db.getThreadsAccountsByUserId(userId)) || []).filter((a: any) => a.isActive !== false);
    account = accountId ? accounts.find((a: any) => Number(a.id) === Number(accountId)) : accounts[0];
  } catch { return empty; }
  if (!account) return empty;

  const username = String(account.threadsUsername || "").trim();
  let biography = String(account.biography || "").trim();
  // 連携時の文面が空なら、いまのプロフィールを取りに行く（QAでは外に出ない）
  if (!biography && account.accessToken && process.env.QA_SAFE_MODE !== "1") {
    try {
      const { getThreadsUserProfile } = await import("./threadsApi");
      const p: any = await getThreadsUserProfile(account.accessToken);
      biography = String(p?.threads_biography || "").trim();
      if (biography) await db.updateThreadsAccount(account.id, { biography } as any).catch(() => {});
    } catch { /* 取れなくても、アカウント名だけで進める */ }
  }
  const source = username ? `@${username} のプロフィール` : "連携アカウントのプロフィール";
  if (!username && !biography) return empty;
  if (!biography) {
    // 文面が無いときはAIに聞かない（アカウント名だけから業種を推測させると外れる）
    return { answers: {}, source };
  }

  const prompt =
    `以下は、あるお店（または個人）のThreadsのアカウント名とプロフィール文です。\n` +
    `ここに書いてあることだけを根拠に、各項目を日本語で埋めてください。\n\n` +
    `【絶対のルール】\n` +
    `- 書いてないことは書かない。推測で補わない。読み取れない項目は空文字 "" にする。\n` +
    `- 数字（年数・人数・料金）は、文面にある数字だけを使う。\n` +
    `- 文面の言い回しをできるだけそのまま使う（要約しすぎない）。各項目は60文字以内。\n` +
    `- businessTypeRaw は「呉服店」「整体院」「カフェ」のように短い業種名にする。\n\n` +
    `【項目】\n` + PREFILL_FIELDS.map((k) => `- ${k}: ${FIELD_GUIDE[k]}`).join("\n") + `\n\n` +
    `【アカウント名】@${username}\n【プロフィール文】\n${biography.slice(0, 1500)}`;

  const schema = {
    type: "json_schema",
    json_schema: {
      name: "counseling_prefill",
      schema: {
        type: "object",
        properties: Object.fromEntries(PREFILL_FIELDS.map((k) => [k, { type: "string" }])),
        required: [...PREFILL_FIELDS],
        additionalProperties: false,
      },
      strict: true,
    },
  };

  try {
    const res: any = await invokeLLM({ messages: [{ role: "user", content: prompt }], response_format: schema as any });
    const raw = res?.choices?.[0]?.message?.content;
    if (typeof raw !== "string" || !raw.trim()) return { answers: {}, source };
    const answers = sanitizePrefill(JSON.parse(raw));
    // 屋号はアカウント名からでも分かることが多い。AIが空にしたら名前は入れない（推測させない）。
    return { answers, source };
  } catch (e) {
    console.error("[Prefill] プロフィールの読み取りに失敗:", e);
    return { answers: {}, source };
  }
}
