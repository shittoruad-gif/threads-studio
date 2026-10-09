/**
 * 公式LINEの「6桁の連携番号」の総当たり・連携メールの連打を止める見張り（2026-10-09 セキュリティ点検）。
 *
 * なぜ要るか：
 *  - 連携番号は6桁（90万通り）・10分有効。LINEのトークに数字を送るだけで照合されるため、
 *    回数の制限が無いと、他人の番号を当てるまで送り続けられる。
 *    当たると、そのLINEが他人のアカウントにつながり、LIFFの自動ログインでアカウントに入れてしまう。
 *  - 「登録のメールアドレスを送る」と番号つきのメールが届く。回数の制限が無いと、
 *    他人のアドレスへ何通でも送らせることができる（番号も毎回作り直されて本人が連携できなくなる）。
 *
 * 方針：DBを使わずメモリだけで数える（再起動で0に戻るが、総当たりの速度を落とすには十分）。
 *       ふつうの方が打ち間違える回数（数回）では止まらない値にしている。
 */

/** 番号の打ち間違いは、同じLINEから10分に5回まで */
export const LINK_CODE_MAX_FAILURES = 5;
export const LINK_CODE_WINDOW_MS = 10 * 60 * 1000;

/** 連携メールの送信は、同じLINEから・同じアドレスへ、それぞれ1時間に3回まで */
export const LINK_EMAIL_MAX_SENDS = 3;
export const LINK_EMAIL_WINDOW_MS = 60 * 60 * 1000;

const MAX_KEYS = 10000;

const codeFailures = new Map<string, number[]>();
const emailSends = new Map<string, number[]>();

function recent(map: Map<string, number[]>, key: string, windowMs: number, now: number): number[] {
  const arr = (map.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length > 0) map.set(key, arr);
  else map.delete(key);
  return arr;
}

function push(map: Map<string, number[]>, key: string, windowMs: number, now: number): void {
  const arr = recent(map, key, windowMs, now);
  arr.push(now);
  map.set(key, arr);
  if (map.size > MAX_KEYS) {
    // 古いものから捨てる（Mapは入れた順）
    const drop = map.size - MAX_KEYS;
    Array.from(map.keys()).slice(0, drop).forEach((k) => map.delete(k));
  }
}

/** このLINEから、いま連携番号を照合してよいか（打ち間違いが続いていたら止める） */
export function canTryLinkCode(lineUserId: string, now: number = Date.now()): boolean {
  return recent(codeFailures, lineUserId, LINK_CODE_WINDOW_MS, now).length < LINK_CODE_MAX_FAILURES;
}

/** 連携番号の打ち間違いを1回数える */
export function recordLinkCodeFailure(lineUserId: string, now: number = Date.now()): void {
  push(codeFailures, lineUserId, LINK_CODE_WINDOW_MS, now);
}

/** 連携できたら、そのLINEの打ち間違いの記録を消す */
export function clearLinkCodeFailures(lineUserId: string): void {
  codeFailures.delete(lineUserId);
}

/**
 * 連携メールを送ってよいか。送ってよければ回数を数えて true を返す。
 * 同じLINEから・同じアドレスへのどちらかが上限に達していたら false（送らない）。
 */
export function takeLinkEmailSend(lineUserId: string, email: string, now: number = Date.now()): boolean {
  const keys = [`line:${lineUserId}`, `mail:${String(email).toLowerCase()}`];
  for (const k of keys) {
    if (recent(emailSends, k, LINK_EMAIL_WINDOW_MS, now).length >= LINK_EMAIL_MAX_SENDS) return false;
  }
  for (const k of keys) push(emailSends, k, LINK_EMAIL_WINDOW_MS, now);
  return true;
}

/** テスト用：記録をすべて消す */
export function __resetLineLinkGuardForTest(): void {
  codeFailures.clear();
  emailSends.clear();
}
