/**
 * 承認が予定時刻に間に合わなかったときの「ずらし方」（2026-09-11 三上様指示）。
 * 現場に出ている先生は予定時刻までに承認できないことが多い。
 *  - 承認待ちのまま時刻を過ぎた投稿は、その日の少し後ろの時間帯へずらす
 *  - 遅れて承認されたときは、7〜21時ならすぐ公開、それ以外は翌朝10時台に公開
 *
 * ★2026-09-21：19時以降に「翌朝10時台」へずらすのをやめた（null を返す＝ずらさない）。
 *   承認待ちのまま日をまたいだ投稿は、翌日 promoteSoftApprovedDuePosts が必ず見送りにする（R2）。
 *   それなのに翌朝へずらしていたため、朝6時の生成が「今日すでに1件ある」と数えて新規を作らず、
 *   その1件も昼に見送りになって、1日の公開が0件になっていた（香取様・実測）。
 *   ずらさずに置けば、日付が変わった時点で見送りになり、朝6時には新しい投稿が作られる。
 *   遅れて承認された場合は lateApprovalTime が別途「翌朝10時ごろ」に回すので、取りこぼさない。
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

/**
 * 承認待ちのまま時刻を過ぎた投稿の、新しい予定時刻。
 * 19時以降は null（＝ずらさない。そのまま置いて、日付が変わったら見送りにする）。
 */
export function slideOverdueTime(now: number, rand: () => number = Math.random): { at: Date; label: string } | null {
  const p = jstParts(now);
  if (p.hour < 19) {
    // 2時間後の正時〜29分（21:29まで）
    const hour = Math.min(p.hour + 2, 21);
    const at = new Date(Date.UTC(p.y, p.m, p.day, hour, Math.floor(rand() * 30)) - JST);
    return { at, label: `今日の${hour}時台` };
  }
  return null;
}

/** 遅れて承認されたときの公開時刻 */
export function lateApprovalTime(now: number, rand: () => number = Math.random): { at: Date; label: string } {
  const p = jstParts(now);
  if (p.hour >= 7 && p.hour < 21) return { at: new Date(now), label: "まもなく" };
  return { at: nextMorningJst(now, rand), label: "明日の10時ごろに" };
}
