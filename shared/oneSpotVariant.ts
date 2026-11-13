/**
 * 1か所だけ変えた投稿の比べ（2026-11-13 三上様「進めて」）。
 *
 *   読まれた投稿を、言葉を1か所だけ変えてもう一度出し、どの言葉に反応があるかを絞る。
 *
 * 決まり
 *  - 対象は学習用の自社3アカウントだけ。1日の最後の枠（契約より後ろの上乗せの枠）を1本だけ使う
 *  - 元にするのは、そのアカウント自身の当たり（普段の2倍以上読まれた／コメント3件以上）で、公開から7〜60日たったもの
 *  - 変えるのは1か所（1行目の言葉、または2行目以降の言葉）。変えた前後の言葉を記録する
 *  - 同じ元の投稿から作るのは2本まで（1行目・2行目以降で1本ずつ）。同じ元の投稿は7日あける
 *  - 「同じ投稿に見せない決まり」の例外になるので、お客様のアカウントには広げない（広げるときは三上様の承諾）
 */
export const ONE_SPOT = {
  accountIds: [10, 12, 36] as readonly number[],
  from: "2026-11-14",
  minSourceAgeDays: 7,
  maxSourceAgeDays: 60,
  gapDaysPerSource: 7,
  minChangedChars: 2,
  maxChangedChars: 40,
};

export type OneSpot = "first_line" | "later_line";
export const ONE_SPOT_LABEL: Record<OneSpot, string> = { first_line: "1行目の言葉", later_line: "2行目以降の言葉" };
export const oneSpotExperimentKey = (spot: OneSpot): string => `onespot_${spot}`;

export function inOneSpot(accountId: number, now: number = Date.now()): boolean {
  if (!ONE_SPOT.accountIds.includes(accountId)) return false;
  const from = Date.parse(ONE_SPOT.from + "T00:00:00+09:00");
  return Number.isFinite(from) && now >= from;
}

/** その日の最後の枠で、かつ契約の本数より後ろ（上乗せの枠）のときだけ */
export function isOneSpotSlot(accountId: number, slotIndex: number, contractCount: number, postCount: number, now: number = Date.now()): boolean {
  return inOneSpot(accountId, now) && slotIndex === postCount - 1 && slotIndex >= contractCount;
}

const chars = (s: string) => Array.from(String(s ?? ""));

/**
 * 元の本文の changedFrom を changedTo に置き換えた本文を作る。1か所だけ変わることを保証する。
 * changedFrom は元の本文にちょうど1回だけ現れ、指定の場所（1行目／2行目以降）にあること。
 */
export function applyOneSpot(
  source: string, spot: OneSpot, changedFrom: string, changedTo: string,
): { ok: true; text: string } | { ok: false; reason: string } {
  const src = String(source ?? "");
  const from = String(changedFrom ?? "");
  const to = String(changedTo ?? "").trim();
  if (!from.trim() || !to) return { ok: false, reason: "変える言葉が空" };
  if (from.trim() === to) return { ok: false, reason: "変える前後が同じ" };
  if (/\n/.test(from) || /\n/.test(to)) return { ok: false, reason: "改行をまたいでいる" };
  const fl = chars(from.trim()).length, tl = chars(to).length;
  if (fl < ONE_SPOT.minChangedChars || fl > ONE_SPOT.maxChangedChars) return { ok: false, reason: "変える前の言葉の長さが範囲外" };
  if (tl < ONE_SPOT.minChangedChars || tl > ONE_SPOT.maxChangedChars) return { ok: false, reason: "変えた後の言葉の長さが範囲外" };
  const first = src.indexOf(from);
  if (first < 0) return { ok: false, reason: "変える前の言葉が元の本文に無い" };
  if (src.indexOf(from, first + 1) >= 0) return { ok: false, reason: "変える前の言葉が元の本文に2回以上ある" };
  const firstBreak = src.indexOf("\n");
  const firstLineEnd = firstBreak < 0 ? src.length : firstBreak;
  const inFirst = first + from.length <= firstLineEnd;
  if (spot === "first_line" && !inFirst) return { ok: false, reason: "1行目の言葉ではない" };
  if (spot === "later_line" && first < firstLineEnd) return { ok: false, reason: "2行目以降の言葉ではない" };
  if (spot === "later_line" && firstBreak < 0) return { ok: false, reason: "元の本文が1行だけ" };
  return { ok: true, text: src.slice(0, first) + from.replace(from.trim(), to) + src.slice(first + from.length) };
}

/** 次に試す場所。まだ試していない方。両方済みなら null */
export function nextSpot(done: ReadonlyArray<string>, lineCount: number): OneSpot | null {
  if (!done.includes("first_line")) return "first_line";
  if (!done.includes("later_line") && lineCount >= 2) return "later_line";
  return null;
}

/** 季節・時期の言葉が入った投稿は元にしない（時期がずれると不自然になる） */
export const SEASON_RE = /(春|夏|秋|冬|梅雨|花見|桜|紅葉|花火|お盆|年末|年始|正月|クリスマス|ハロウィン|バレンタイン|新学期|入学|卒業|暑[いさく]|寒[いさく]|猛暑|残暑|初雪)/;

/** 文末の署名（「◯◯より。」だけの行）を外す。署名は 2026-10-26 にやめたため、元の投稿に残っていても引き継がない */
export function stripSignature(text: string): string {
  const lines = String(text ?? "").replace(/\s+$/, "").split("\n");
  while (lines.length > 1 && (!lines[lines.length - 1].trim() || /^.{1,24}より[。.]?$/.test(lines[lines.length - 1].trim()))) lines.pop();
  return lines.join("\n");
}
