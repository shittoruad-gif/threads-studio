/**
 * 健康系の断定・体験談・価格連呼のガード（2026-09-06 梅原様のアカウント停止を受けて）。
 *
 * Threads/Instagramは「健康に関する誤情報」「スパム」の自動判定を新しいアカウントに厳しくかける。
 * 実際に停止された @daigo.sekkotsuin の直近投稿には、
 *   「杖なしでスタスタ歩ける方もいます」「朝、痛みなくスッと起き上がれる毎日」「朝までぐっすり眠れて」
 *   「初回お試し1980円」（同日に2回）「5万人以上の実績」
 * が並んでいた。治療の結果を語る体験談と価格の連呼は、人が読めば普通でもAI判定には引っかかる。
 *
 * 対象業種：整体・整骨・接骨・鍼灸・カイロ・エステ・医療・歯科・美容医療・ジム/ピラティス（体の変化を扱う）
 * やること：
 *   1. 結果の断定・体験談（歩ける/眠れる/痛みが消える/治る/完治/改善する 等）を検出
 *   2. 価格訴求（初回◯◯円・お試し◯◯円・◯円引き）を検出（1投稿1回まで・3日に1回まで）
 *   3. 検出したら「言い換え表」で機械的に和らげる。和らげられない文は落とす。
 */
export const HEALTH_BUSINESS_RE = /(整体|整骨|接骨|鍼灸|はり|きゅう|カイロ|エステ|医院|クリニック|歯科|美容皮膚|矯正|リハビリ|ピラティス|ジム|トレーニング|ヨガ|サロン|治療院)/;

export function isHealthBusiness(businessType: string | null | undefined): boolean {
  return HEALTH_BUSINESS_RE.test(String(businessType || ""));
}

/** 結果の断定・治療結果の体験談として引っかかりやすい表現 */
export const OUTCOME_PATTERNS: ReadonlyArray<{ re: RegExp; label: string; fix?: (m: string) => string }> = [
  { re: /杖(なし|無し)で(スタスタ)?歩け(る|た|ます)/g, label: "歩行回復の体験談", fix: () => "歩きやすくなったと話す方もいます" },
  { re: /痛み(が|も)?(なく|無く|消え|取れ|なくな)[^。\n]*/g, label: "痛みの消失", fix: () => "楽に感じる方もいます" },
  { re: /(ぐっすり|朝まで)眠れ[^。\n]*/g, label: "睡眠改善の体験談", fix: () => "眠りが変わったと話す方もいます" },
  { re: /(治る|治り|治し|治せ|完治|根治|根本改善|改善します|改善する|改善した|良くなります|良くなる|効きます|効く)/g, label: "治る・改善の断定", fix: () => "ケア" },
  { re: /(必ず|絶対|確実に|100%|誰でも)[^。\n]{0,12}(楽|良く|改善|変わ|効)/g, label: "保証表現", fix: () => "" },
  { re: /(ヘルニア|坐骨神経痛|自律神経失調|うつ|糖尿|高血圧|がん|癌)[^。\n]{0,10}(治|改善|完治|解消)/g, label: "疾患名＋治癒", fix: () => "" },
];

export const PRICE_RE = /(初回|お試し|体験|限定|今だけ|キャンペーン)[^。\n]{0,12}?(\d{1,3}(,\d{3})*|\d+)\s*円|(\d{1,3}(,\d{3})*|\d+)\s*円(引き|OFF|オフ)/g;

export interface ClaimVerdict {
  ok: boolean;
  hits: string[];
  /** 和らげたあとの本文（ok=false でも返す。空なら公開しない） */
  text: string;
  priceMentions: number;
}

export function checkHealthClaims(text: string, opts: { allowPrice?: boolean } = {}): ClaimVerdict {
  const hits: string[] = [];
  let out = String(text ?? "");
  for (const p of OUTCOME_PATTERNS) {
    if (p.re.test(out)) {
      hits.push(p.label);
      p.re.lastIndex = 0;
      out = out.replace(p.re, (m) => (p.fix ? p.fix(m) : ""));
    }
    p.re.lastIndex = 0;
  }
  const prices = out.match(PRICE_RE) ?? [];
  if (prices.length > 0 && !opts.allowPrice) {
    hits.push("価格訴求");
    // 価格の行ごと落とす（「初回1980円。」のような1文）
    out = out.split("\n").filter((l) => !PRICE_RE.test(l) || (PRICE_RE.lastIndex = 0, false)).join("\n");
    PRICE_RE.lastIndex = 0;
  }
  // 空になった文・二重句読点・空行の連続を整える
  out = out
    .replace(/[、,]\s*[。．]/g, "。")
    .replace(/。{2,}/g, "。")
    .replace(/^[、。]\s*/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { ok: hits.length === 0, hits, text: out, priceMentions: prices.length };
}
