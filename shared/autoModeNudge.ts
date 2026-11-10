/**
 * 「公開前の確認」を続けている方に、「そろそろ自動（確認なし）にしませんか」とお声がけする判定と文面。
 * 三上様指示（2026-09-10）：ある程度使ったら自動で投稿されるのがこのアプリのウリ。案内も自動で送る。
 *
 * 判定は「承認が習慣になっていて、見送りがほとんど無い」こと。数字は運用で見直す。
 */
export interface ApprovalStats {
  /** 承認して公開された自動投稿の累計 */
  approvedTotal: number;
  /** 最初に承認して公開された日 */
  firstApprovedAt: Date | string | null;
  /** 直近14日に承認した自動投稿（公開済み＋公開待ち） */
  approvedRecent: number;
  /** 直近14日にご本人が見送った自動投稿 */
  declinedRecent: number;
  /** 直近14日にご本人が手直しした自動投稿 */
  editedRecent: number;
  /** これまでに案内した回数 */
  nudgeCount: number;
  /** 前回の案内日時 */
  lastNudgeAt: Date | string | null;
}

export const NUDGE_MIN_APPROVED_TOTAL = 10;
export const NUDGE_MIN_DAYS_SINCE_FIRST = 7;
export const NUDGE_MIN_APPROVED_RECENT = 5;
export const NUDGE_MAX_DECLINE_RATE = 0.2;
export const NUDGE_MAX_EDIT_RATE = 0.3;
export const NUDGE_MAX_COUNT = 3;
export const NUDGE_INTERVAL_DAYS = 21;

const days = (from: Date | string, now: number) => (now - new Date(from).getTime()) / 86400000;

/** 今日お声がけしてよいか。理由も返す（ログ用） */
export function shouldNudgeAutoMode(s: ApprovalStats, now: number = Date.now()): { ok: boolean; reason: string } {
  if (s.nudgeCount >= NUDGE_MAX_COUNT) return { ok: false, reason: "案内の上限に達している" };
  if (s.lastNudgeAt && days(s.lastNudgeAt, now) < NUDGE_INTERVAL_DAYS) return { ok: false, reason: "前回の案内から日が浅い" };
  if (s.approvedTotal < NUDGE_MIN_APPROVED_TOTAL) return { ok: false, reason: `承認が${s.approvedTotal}件（${NUDGE_MIN_APPROVED_TOTAL}件未満）` };
  if (!s.firstApprovedAt || days(s.firstApprovedAt, now) < NUDGE_MIN_DAYS_SINCE_FIRST) return { ok: false, reason: "最初の承認から日が浅い" };
  if (s.approvedRecent < NUDGE_MIN_APPROVED_RECENT) return { ok: false, reason: `直近14日の承認が${s.approvedRecent}件` };
  const decided = s.approvedRecent + s.declinedRecent;
  if (decided > 0 && s.declinedRecent / decided > NUDGE_MAX_DECLINE_RATE) return { ok: false, reason: `見送りが多い（${s.declinedRecent}/${decided}）` };
  if (s.approvedRecent > 0 && s.editedRecent / s.approvedRecent > NUDGE_MAX_EDIT_RATE) return { ok: false, reason: `手直しが多い（${s.editedRecent}/${s.approvedRecent}）` };
  return { ok: true, reason: "承認が習慣になっていて見送りが少ない" };
}

/** お声がけの文面 */
export function autoModeNudgeText(s: ApprovalStats): string {
  const declined = s.declinedRecent === 0 ? "見送りはありませんでした" : `見送りは${s.declinedRecent}件だけでした`;
  return (
    "ひとつご提案です。\n\n" +
    `これまでに${s.approvedTotal}件の投稿を承認いただき、直近2週間は${declined}。\n` +
    "Threads Studioは、毎日の投稿をおまかせで続けられるのが本来の使い方です。\n" +
    "よろしければ「公開前の確認」をなしにして、AIが作った投稿をそのまま予定時刻に公開する設定に切り替えませんか？\n\n" +
    "切り替えると\n" +
    "・毎朝6時に投稿が作られ、承認なしで予定時刻に公開されます（承認カードは届きません）\n" +
    "・公開した投稿は、毎朝7:40の報告と「今日の投稿」で確認できます\n" +
    "・いつでも「設定」→「公開前に確認する」で元に戻せます"
  );
}

/** 切り替えたあとの案内 */
export const AUTO_MODE_ON_TEXT =
  "確認なしで公開する設定にしました。明日の朝6時に作られる投稿から、承認なしで予定時刻に公開されます。\n\n" +
  "きょう承認をお待ちしている投稿があれば、それはこれまでどおり「今日の投稿」から承認してください。\n" +
  "元に戻したいときは「設定」→「公開前に確認する」を押してください。";

export const AUTO_MODE_KEEP_TEXT =
  "承知しました。これまでどおり、公開前に確認していただく設定のままにします。\n" +
  "切り替えたくなったら、「設定」→「確認なしにする」からいつでも変えられます。この案内はもうお送りしません。";

/**
 * 前日に「承認されないまま見送り」になった投稿があった方への、翌朝の一言（2026-11-11 三上様
 * 「承認待ちでスルーされてしまっている投稿が多い。自動投稿に切り替えましょうかという選択肢を」）。
 * 以前の「昨日は1件も公開されませんでした」は、朝の時点で承認待ちがもう見送りに変わっていて一度も出ていなかった。
 * declinedBefore＝「このまま確認する」を選んだことがある方（autoModeNudgeCount>=3）。事実の一言とボタンだけにして、しつこくしない。
 */
export function skippedApprovalMorningPart(p: {
  expired: number; postedYesterday: number; softOn: boolean; declinedBefore: boolean;
}): { text: string; buttons: Array<{ label: string; data: string }> } | null {
  if (p.expired <= 0) return null;
  const head =
    `★昨日の投稿のうち ${p.expired}件が、承認されないまま見送りになりました（公開されていません）` +
    (p.postedYesterday === 0 ? "。昨日は1件も公開されていません。" : "。");
  const auto = { label: "自動投稿にする（確認なし）", data: "c=automode&v=on" };
  const soft = { label: "見送りしなければ公開", data: "s=softappr&v=on" };
  if (p.declinedBefore) {
    return { text: head, buttons: [{ label: "今日の投稿", data: "m=posts" }, auto] };
  }
  const text =
    head + "\n" +
    "いまの設定では、「OK」を押した投稿だけが公開されます。\n" +
    "押す時間がない日が多いようでしたら、自動投稿に切り替えませんか。\n" +
    "・「自動投稿にする」：確認なしで、毎朝作られた投稿が予定時刻にそのまま公開されます\n" +
    (p.softOn ? "" : "・「見送りしなければ公開」：カードは今までどおり届き、「見送る」を押さない限り予定時刻に公開されます\n") +
    "・「このまま確認する」：今の設定のままにします（この案内は出さなくなります）\n" +
    "どれも「設定」からいつでも戻せます。";
  return {
    text,
    buttons: [auto, ...(p.softOn ? [] : [soft]), { label: "このまま確認する", data: "c=automode&v=keep" }, { label: "今日の投稿", data: "m=posts" }],
  };
}
