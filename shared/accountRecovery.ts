/**
 * 閲覧の回復期間（自社の学習用アカウントだけ・お客様のアカウントには入れない）。
 *
 * 2026-11-23 実測：acc10 は 1本あたりの表示が 10月 200〜350 → 11/04 から急落 → 11/11〜 15前後 → 11/18〜 5前後。
 * 同じ仕組みで動いている acc12 は 100〜250 のまま＝投稿の仕組み全体ではなく、そのアカウントへの配信が絞られている。
 * 1日30本の学習（10/14〜11/10）を続けたあとに急落し、11/17 には投稿が1件 Threads 側で消された。
 * 1日1本に落としても戻っていない（11/18〜11/22）＝本数だけでなく「機械的に見える動き」と「似た投稿の続き」も止める。
 * 11/10〜11/22 の本文別：地元への問いかけ（冬の味覚・秋といえば・朝食のパン）が 55〜129 で上位、
 * 「〇〇店では、国家資格者が…」の宣伝の文が 1〜13 で最下位。消された1件は地名＋問いかけ＋絵文字。
 *
 * 回復期間中は：
 *  - 1日の本数を perDay まで（冷却の1日1件が先に効く）。学習・当たり型の上乗せも乗せない
 *  - アンケート・クイズ・自分の投稿の再投稿・1か所だけ変えた投稿・ツリーの試し・トピックタグの試しを入れない
 *  - 本文の書き方を変える（RECOVERY_NOTE）
 * 期間が過ぎたら自動で元に戻る。延ばす・縮めるときは until を直す。
 */

export interface RecoveryPlan {
  from: string; // JST の日付（含む）
  until: string; // JST の日付（含む）
  perDay: number;
}

export const ACCOUNT_RECOVERY: Readonly<Record<number, RecoveryPlan>> = {
  10: { from: "2026-11-23", until: "2026-12-07", perDay: 2 },
};

const JST = 9 * 3600_000;
const jstYmd = (now: number) => new Date(now + JST).toISOString().slice(0, 10);

export function recoveryPlanFor(accountId: number, now: number = Date.now()): RecoveryPlan | null {
  const p = ACCOUNT_RECOVERY[Number(accountId)];
  if (!p) return null;
  const ymd = jstYmd(now);
  return ymd >= p.from && ymd <= p.until ? p : null;
}

export function inRecovery(accountId: number, now: number = Date.now()): boolean {
  return recoveryPlanFor(accountId, now) !== null;
}

/** 回復期間中の本文の指示（生成の指示の後ろに足す） */
export const RECOVERY_NOTE = `

【このアカウントは今、閲覧の回復期間です。次を必ず守ってください】
- 似た投稿が続いて届きにくくなっています。最近の投稿と「書き出し・締め・話題」が重ならないようにする
- 店の宣伝の文（「〇〇店では」「国家資格者が」「一人ひとりに合わせて」など）を入れない。このアカウントでいちばん読まれなかった形です
- 絵文字は使わない
- 朝晩の冷え込み・季節の変わり目・秋の夜長の書き出しは使わない（何度も使っています）
- 地域名は本文に1回まで
- 地元の人に話しかける話題1つ（食べ物・お店・場所・暮らし）か、体の使い方の具体的なコツ1つを、ふつうの言葉で短く書く。登録に無い出来事・お客様の声・数字は作らない`;
