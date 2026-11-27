/**
 * プロフィールのリンクへ軽く誘う一文を、10本に1本だけ付ける（2026-11-27 三上様「進めて」）。
 *
 * それまでの経緯：
 *   2026-09-11 三上様「通常の投稿にリンク先へ促す文を入れない」→ 案内の一文は固定投稿だけ。
 *   2026-11-26「これだと解約が続出します。リーチを伸ばして集客につながる施策を」→ 閲覧を戻す直し（55a205c）。
 *   閲覧だけでは集客につながらない（講座 第15回「認知投稿 → 5投稿に1回のオファー → LINE」）。
 *   ただし直近45日の実測で、宣伝の言葉が入った投稿は普段の0.8倍。なので5本に1本ではなく10本に1本、
 *   文は shared/autoPostCta.ts の登録済みリンクから機械的に決める一文だけ（煽り・催促は書かない）。
 *
 * 付けない：慣らし運転中（連携14日未満）・アンケート等の機能の投稿・3案・学習の枠・地元の会話（問いかけで終える回）・
 *   求人のアカウント・自社の手動の回復期間（玉島〜12/07）・プロフィールにリンクが無いと分かっているアカウント。
 */
export const PROFILE_CTA = {
  /** 直近 every-1 本に案内の一文が無ければ、この1本に付ける＝およそ every 本に1本 */
  every: 10,
  /**
   * 2026-11-27 公開ページで、プロフィールにリンクが無かったアカウント（リンクが無いのに「リンクから」と書くと信用を落とす）。
   * 11/27 にリンクを入れるお願いを送った。入ったら外す（11/30 に確かめる）。
   */
  noProfileLink: [22, 25, 28, 33, 38, 43] as readonly number[],
  /** 実測の集計に使う印（scheduledPosts.experimentKey） */
  key: "profile_cta",
} as const;

/** 案内の一文がすでに入っている投稿か */
export function hasProfileCta(text: string | null | undefined): boolean {
  return /プロフィールのリンク/.test(String(text ?? ""));
}

/** この1本に案内の一文を付けるか（条件の判断だけ。文そのものは buildCtaText） */
export function wantsProfileCta(accountId: number, recentTexts: readonly string[]): boolean {
  if (PROFILE_CTA.noProfileLink.includes(Number(accountId))) return false;
  return !recentTexts.slice(0, PROFILE_CTA.every - 1).some(hasProfileCta);
}
