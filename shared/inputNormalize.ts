/**
 * お客様が入力した文字の「ゆれ」を吸収する。
 *
 * 日本語のキーボードでは、数字・英字・記号が全角で入ってしまうことがある。
 * また、コピー＆ペーストでは前後に空白が付きやすい。
 * それだけで「コードが違います」「コードが見つかりません」となるのは、
 * お客様には原因が分からず、問い合わせにも結びつかないまま止まってしまう。
 *
 * 実際に、メールアドレスが連携コードと誤認されて連携できないお客様がいた。
 * 同じ種類の取りこぼしを防ぐため、判定の前にここを通す。
 */

/** 全角の英数字・記号を半角に直す */
export function toHalfWidth(s: string): string {
  return String(s ?? "")
    // 全角英数字と記号（！〜～）をまとめて半角へ
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    // 全角スペース
    .replace(/　/g, " ");
}

/** 連携コードなどの「数字だけ」を取り出す（全角数字も拾う） */
export function extractDigits(s: string): string {
  return toHalfWidth(s).replace(/[^0-9]/g, "");
}

/** メールアドレスの整形（全角→半角・前後の空白除去・小文字化） */
export function normalizeEmail(s: string): string {
  return toHalfWidth(s).trim().toLowerCase();
}

/** 紹介コードの整形（全角→半角・空白除去・大文字化） */
export function normalizeCouponCode(s: string): string {
  return toHalfWidth(s).replace(/\s+/g, "").toUpperCase();
}
