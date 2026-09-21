/**
 * 2日続けて投稿が1本も届かなかったときに、お詫びして追加情報をお願いする（2026-09-21 三上様指示）。
 *
 *   「2日連続でスキップされてしまった場合は、こちらから『追加情報でこれを送ってください』と
 *     提案し、それを送ってもらって、その内容が反映できるようにしてください。
 *     お詫びで補填するようにしてください」
 *
 * きっかけ：香取様（acc21・light_campaign・1日1件）は、材料が尽きて毎回同じ言い回しに戻り、
 * 9/20・9/21 と2日続けて投稿が1本も作れなかった。仕組みは黙って翌日へ回すだけだったので、
 * お客様からは「投稿が来ていません」というお問い合わせになっていた（9/10 に続き2度目）。
 *
 * ここでやること：
 *   1. その日、そのアカウントで自動投稿が1件も作られなかったかを数える
 *   2. 連続日数を threadsAccounts.zeroPostDays に記録する（1件でも作れたら0に戻す）
 *   3. 2日続いたら、お詫び＋「これを送ってください」をLINEへ1通（LINE未連携ならメール）
 *   4. 届かなかった本数を apologyShortfall に積み、1日＋1件で必ずお返しする
 *
 * お願いは7日に1度まで。毎朝くり返すと、督促になって逆効果になる。
 */
import * as db from "./db";
import { zeroPostApologyNotice } from "../shared/materialDepth";
import { jstDateString, dateColToJst } from "../shared/accountRamp";

/** 同じお願いを繰り返さない間隔（日） */
export const MATERIAL_ASK_INTERVAL_DAYS = 7;
/** 何日続いたらお願いするか */
export const ZERO_POST_DAYS_TO_ASK = 2;

/** 連続日数を更新して、新しい値を返す（1件でも作れていれば0に戻す） */
export function nextZeroPostDays(
  account: { zeroPostDays?: number | null; zeroPostDate?: Date | string | null },
  madeToday: number,
  today: string,
  yesterday: string,
): number {
  if (madeToday > 0) return 0;
  const prevDate = dateColToJst(account?.zeroPostDate);
  // 今日ぶんをすでに数えていたら、二重に足さない（当日補充などで2回通っても増やさない）
  if (prevDate === today) return Math.max(1, Number(account?.zeroPostDays ?? 0));
  const prev = prevDate === yesterday ? Number(account?.zeroPostDays ?? 0) : 0;
  return prev + 1;
}

/** お願いを送ってよいか（7日に1度まで） */
export function canAskForMaterial(
  account: { materialAskedAt?: Date | string | null },
  now: number = Date.now(),
): boolean {
  const at = account?.materialAskedAt ? new Date(account.materialAskedAt as any).getTime() : 0;
  if (!at) return true;
  return now - at >= MATERIAL_ASK_INTERVAL_DAYS * 86400000;
}

/**
 * 補填を始められる日のラベル（例「9月26日」）。冷却中でなければ null。
 *
 * ★冷却中（投稿が消されて1日1件に抑えている期間）は rampForAccount が先に返すため、
 *   補填が乗らない。「これから1日1件ずつ」と書くと実際の動きと食い違う
 *   （2026-09-21 香取様。冷却が 9/25 までで、補填が始まるのは 9/26 から）。
 */
export async function makeupFromLabelFor(account: any): Promise<string | null> {
  try {
    const { inCooldown } = await import("../shared/accountRamp");
    if (!inCooldown(account)) return null;
    const until = dateColToJst(account?.cooldownUntil);
    if (!until) return null;
    // 冷却が明けた翌日から補填が乗る
    const next = new Date(Date.parse(until + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);
    const { dateJstLabel } = await import("../shared/dailyCap");
    return dateJstLabel(next) || null;
  } catch {
    return null;
  }
}

export async function runZeroPostCheck(
  accountId: number,
  userId: number,
  project: any,
  contractCount: number,
): Promise<void> {
  const acct: any = await db.getThreadsAccountById(accountId);
  if (!acct) return;

  const madeToday = await db.countAccountAutoPostsScheduledToday(accountId).catch(() => 1);
  const today = jstDateString(0);
  const yesterday = jstDateString(-1);
  const days = nextZeroPostDays(acct, madeToday, today, yesterday);

  await db.updateThreadsAccount(accountId, { zeroPostDays: days, zeroPostDate: today } as any);

  if (madeToday > 0) {
    if (Number(acct.zeroPostDays ?? 0) > 0) console.log(`[ZeroPost] account ${accountId} 投稿が戻ったので連続ゼロを解除`);
    return;
  }
  console.warn(`[ZeroPost] account ${accountId} 本日は1件も作れませんでした（${days}日連続）`);

  // ★お詫びの補填を積む（届かなかった契約本数ぶん）。お願いを送るかどうかとは別に、必ず積む。
  const missedToday = Math.max(1, contractCount);
  try { await db.addApologyShortfall(accountId, missedToday); } catch (e) { console.warn(`[ZeroPost] 補填の記録に失敗: ${(e as Error)?.message}`); }

  if (days < ZERO_POST_DAYS_TO_ASK) return;
  if (!canAskForMaterial(acct)) {
    console.log(`[ZeroPost] account ${accountId} は${MATERIAL_ASK_INTERVAL_DAYS}日以内にお願いずみのため、今回は送りません`);
    return;
  }

  const fresh: any = await db.getThreadsAccountById(accountId);
  const missedTotal = Math.max(missedToday, Number(fresh?.apologyShortfall ?? 0));
  // ★投稿が消されて1日1件に抑えている期間（冷却中）は補填が乗らない。
  //   「これから1日1件ずつ」と書くと実際の動きと食い違うので、始められる日をお伝えする。
  const makeupFrom = await makeupFromLabelFor(fresh ?? acct);
  const notice = zeroPostApologyNotice(String(acct.threadsUsername ?? ''), project, days, missedTotal, makeupFrom);

  // ★送ったあとに記録すると、送信に失敗したときに二度と送れなくなる。
  //   逆に先に記録すると、失敗したとき7日間お願いできない。ここでは「送れたときだけ」記録する。
  let sent = false;
  try {
    const { pushMessages } = await import("./lineNotify");
    const { textWithQuick } = await import("./lineChat");
    const targets = await db.getLineUserIdsForUser(userId);
    for (const to of targets) {
      const ok = await pushMessages(to, [textWithQuick(notice.text, [
        { label: "お店の情報", data: "m=profile" },
        { label: "担当者に聞く", data: "m=staff" },
      ])]);
      if (ok) sent = true;
    }
    if (targets.length === 0) {
      const user: any = await db.getUserById(userId);
      if (user?.email) {
        const { sendEmail } = await import("./_core/notification");
        const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        sent = await sendEmail({
          to: user.email,
          subject: "自動投稿がお届けできていません（お詫びと、お願いしたいこと）",
          html: `<div style="font-family:sans-serif;line-height:1.8;white-space:pre-wrap">${esc(notice.text)}</div>`,
        });
      }
    }
  } catch (e) {
    console.error(`[ZeroPost] お願いの送信に失敗 account=${accountId}: ${(e as Error)?.message}`);
  }

  if (sent) {
    await db.updateThreadsAccount(accountId, { materialAskedAt: new Date() } as any).catch(() => undefined);
    console.log(`[ZeroPost] account ${accountId} へお詫びと追加情報のお願いを送りました（${notice.askedKeys.join('・')}）`);
  }

  // 運営にも知らせる（朝の報告に出す）
  try {
    const { notifyOwner } = await import("./_core/notification");
    await notifyOwner({
      title: `${days}日続けて投稿が作れていません（@${acct.threadsUsername}）`,
      content:
        `@${acct.threadsUsername}（user ${userId}）で、自動投稿が${days}日続けて1件も作れていません。`
        + `材料が尽きて同じ言い回しに戻るのが原因です。`
        + `${sent ? 'お客様へお詫びと追加情報のお願いをお送りしました。' : '※お客様への連絡は送れていません（LINE未連携・メールなし）。'}`
        + `届かなかった${missedTotal}件は、お詫びの補填として1日＋1件でお返しします。`,
    });
  } catch { /* 通知できなくても処理は続ける */ }
}
