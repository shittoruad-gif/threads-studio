/**
 * 「登録情報に無い数字」を投稿から見つける（2026-09-08）。
 *
 * 事実：比嘉先生（整骨院・連携2日目）の当日補充で、AIが
 *   「八千代市で肩こりに悩む人の3人に1人が知らないこと。」
 * と書いた。登録情報（実績：開業11年・業界歴20年・のべ20万人）のどこにも無い数字で、
 * 「書いていない数字をAIが作ることはない」というお約束に反していた。
 * 割合・人数・順位のような「それらしい数字」は、根拠が無いと景表法の面でも危ない。
 *
 * やること：投稿に出てくる数字つき表現のうち、登録情報の文字列に見つからないものを返す。
 * 時刻・日付・住所・電話・「1つ」「1人分」のような数え言葉は対象にしない。
 */

/** 根拠が要る「それらしい数字」の型 */
const CLAIM_NUMBER_RE = /(\d+(?:[.,]\d+)?)\s*(人に\s*1\s*人|％|%|割|人以上|人超|万人|名以上|件以上|年以上|年連続|位|倍|回以上)/g;

/** 対象外（時刻・日付・年齢帯・住所番地・電話・「1つ／1人」など） */
const IGNORE_RE = /(\d+\s*(時|分|秒|月|日|歳|代|丁目|番地|号|階|円|分間|時間|km|m|cm|kg)|\d{2,4}-\d{2,4}-\d{3,4})/g;

const norm = (s: string) => String(s || "").replace(/[\s,、，]/g, "").replace(/％/g, "%");

export interface FabricatedNumber {
  /** 投稿に出てきた表現（例：3人に1人） */
  text: string;
}

/**
 * 登録情報（実績・強み・はじめの設定の回答などを連結した文字列）に無い数字つき表現を返す。
 * 何も無ければ空配列。
 */
export function findFabricatedNumbers(postText: string, registeredFacts: string): FabricatedNumber[] {
  const facts = norm(registeredFacts);
  const body = String(postText || "").replace(IGNORE_RE, " ");
  const out: FabricatedNumber[] = [];
  const seen = new Set<string>();
  CLAIM_NUMBER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CLAIM_NUMBER_RE.exec(body)) !== null) {
    const phrase = m[0].trim();
    const key = norm(phrase);
    if (seen.has(key)) continue;
    seen.add(key);
    // 数字＋単位が登録情報にそのまま出てくれば根拠あり
    if (facts.includes(key)) continue;
    // 「20万人以上」のように、数字だけでも登録側にあれば根拠ありとみなす（表記ゆれ対策）
    const digits = m[1].replace(/[.,]/g, "");
    if (digits.length >= 2 && facts.includes(digits)) continue;
    out.push({ text: phrase });
  }
  return out;
}

/** 生成側で「登録情報」として渡す文字列を作る（project の主な欄を連結） */
export function registeredFactsOf(project: {
  proof?: string | null; strength?: string | null; usp?: string | null;
  counselingResult?: string | null; storeName?: string | null; area?: string | null;
  n1Customer?: string | null; catchphrase?: string | null; customerWords?: string | null;
}): string {
  return [project.proof, project.strength, project.usp, project.counselingResult, project.storeName,
    project.area, project.n1Customer, project.catchphrase, project.customerWords]
    .filter(Boolean).join("\n");
}
