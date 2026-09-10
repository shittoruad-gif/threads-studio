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
