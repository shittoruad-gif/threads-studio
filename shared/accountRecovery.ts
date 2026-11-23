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
  /** 1日の本数の上限。null＝本数は抑えない（試しから外す・書き方を変えるだけ） */
  perDay: number | null;
}

export const ACCOUNT_RECOVERY: Readonly<Record<number, RecoveryPlan>> = {
  // 11/23 三上様「一旦玉島店も増やしてみて、そこから考えて」→本数は抑えず、下の ACCOUNT_STEP_UP で増やす。試しから外す・書き方の指示は残す
  10: { from: "2026-11-23", until: "2026-12-07", perDay: null },
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

/**
 * 本数を段階的に戻す（自社の学習用アカウントだけ・お客様のアカウントには入れない）。
 * 2026-11-23 三上様「金光は8本から増やして進めて」：acc12 は配信が絞られていない（1本あたり100〜250）ので、
 * 1日5本→8本（11/24〜）→10本（12/01〜）と1週間ずつ上げる。
 * ★一度でも冷却に入ったら（Threads側で投稿が消されたら）段階はやめて元の本数へ戻す（冷却明けも戻さない）。
 *   続けるかどうかは三上様に決めていただく。
 */
export interface StepUpPlan {
  steps: ReadonlyArray<{ from: string; perDay: number }>;
}

export const ACCOUNT_STEP_UP: Readonly<Record<number, StepUpPlan>> = {
  12: { steps: [{ from: "2026-11-24", perDay: 8 }, { from: "2026-12-01", perDay: 10 }] },
  // 玉島：冷却（投稿が消された・〜11/25 は1日1件）が明けてから。冷却明けにいきなり大きく増やすと消されやすい（acc22 10/16）ので3段で
  10: { steps: [{ from: "2026-11-26", perDay: 5 }, { from: "2026-11-29", perDay: 8 }, { from: "2026-12-06", perDay: 10 }] },
};

/** 今日の目標本数（段階の対象外・開始前・冷却が入ったあとは null） */
export function stepUpPerDay(accountId: number, cooldownUntilJst: string | null | undefined, now: number = Date.now()): number | null {
  const plan = ACCOUNT_STEP_UP[Number(accountId)];
  if (!plan || plan.steps.length === 0) return null;
  const first = plan.steps[0]!.from;
  if (cooldownUntilJst && cooldownUntilJst >= first) return null;
  const ymd = jstYmd(now);
  let n: number | null = null;
  for (const s of plan.steps) if (ymd >= s.from) n = s.perDay;
  return n;
}
