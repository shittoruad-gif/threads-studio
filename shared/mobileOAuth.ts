/**
 * スマホでThreadsとの連携を押したときに、先に「パソコンでお願いします」を出すかの判定（2026-10-12 三上様「今夜、実装して」）。
 *   スマホにThreadsアプリが入っていると、許可画面（www.threads.com/oauth/authorize）をアプリが横取りして開き、
 *   アプリには許可画面が無いのでホームが開くだけになる（「ただスレッズに飛ぶだけ」「このページは存在しません」）。
 *   Meta側の動きで止められないため、飛ぶ前に案内する。止めはしない（「このまま進める」で従来どおり飛べる）。
 */
export function isPhoneLike(ua: string, maxTouchPoints = 0): boolean {
  const s = String(ua || "");
  if (/iPhone|iPod|Android|Mobile/i.test(s)) return true;
  // iPadOS の Safari は Mac と同じ表記で来る。タッチがあれば iPad とみなす
  if (/iPad/i.test(s)) return true;
  if (/Macintosh/i.test(s) && maxTouchPoints > 1) return true;
  return false;
}

export const CONNECT_PAGE_URL = "https://threads-studio.com/threads-connect";
