/**
 * 承認が予定時刻に間に合わなかったときの「ずらし方」（2026-09-11 三上様指示）。
 * 現場に出ている先生は予定時刻までに承認できないことが多い。
 *  - 承認待ちのまま時刻を過ぎた投稿は、その日の少し後ろの時間帯へずらす（19時以降なら翌朝10時台）
 *  - 遅れて承認されたときは、7〜21時ならすぐ公開、それ以外は翌朝10時台に公開
 */
const JST = 9 * 3600 * 1000;

function jstParts(now: number) {
  const d = new Date(now + JST);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes() };
}

/** 翌朝10:00〜10:29 JST */
export function nextMorningJst(now: number, rand: () => number = Math.random): Date {
  const p = jstParts(now);
  return new Date(Date.UTC(p.y, p.m, p.day + 1, 10, Math.floor(rand() * 30)) - JST);
}

/** 承認待ちのまま時刻を過ぎた投稿の、新しい予定時刻 */
export function slideOverdueTime(now: number, rand: () => number = Math.random): { at: Date; label: string } {
  const p = jstParts(now);
  if (p.hour < 19) {
    // 2時間後の正時〜29分（21:29まで）
    const hour = Math.min(p.hour + 2, 21);
    const at = new Date(Date.UTC(p.y, p.m, p.day, hour, Math.floor(rand() * 30)) - JST);
    return { at, label: `今日の${hour}時台` };
  }
  return { at: nextMorningJst(now, rand), label: "明日の10時台" };
}

/** 遅れて承認されたときの公開時刻 */
export function lateApprovalTime(now: number, rand: () => number = Math.random): { at: Date; label: string } {
  const p = jstParts(now);
  if (p.hour >= 7 && p.hour < 21) return { at: new Date(now), label: "まもなく" };
  return { at: nextMorningJst(now, rand), label: "明日の10時ごろに" };
}
