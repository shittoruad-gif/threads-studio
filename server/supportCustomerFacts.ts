/**
 * ご質問くださった方ご自身の「いまの状態」を、自動応答に渡せる形にまとめる。
 *
 * ★なぜ要るか（2026-09-22 のご質問3件がきっかけ）
 *
 *   #42「今月のこり何通？」                       → 担当者送り（aiConfident=0）
 *   #43「聞かなくて大丈夫！！24件と書いてあった！！」 ← ご自分で画面を探して解決された
 *   #44「月に1通のプランは月額いくらだった？？」      → 担当者送り（aiConfident=0）
 *
 * 自動応答は `shared/productKnowledge.ts`（＝誰にでも同じ説明）しか持っておらず、
 * システムプロンプトでも「個別のご契約状況は confident を false に」と決めてあった。
 * そのため **答えが社内のDBに確かに在るご質問まで**、担当者送りになっていた。
 *
 * ここでは推測をしない。DBから読めた事実だけを並べ、読めなかった項目は書かない
 * （書かなければ、プロンプトの「ここに無いことは推測しない」でそのまま伏せられる）。
 */
import { contractSummary, formatJpDate, type ContractInfo } from "@shared/contractSummary";

async function nextPaymentInfo(userId: number): Promise<{ nextPaymentDate: string | null; nextPaymentAmount: number | null }> {
  try {
    const { nextPaymentForUser } = await import("./nextPayment");
    const np = await nextPaymentForUser(userId);
    return { nextPaymentDate: np?.dueDate ?? null, nextPaymentAmount: np?.amount ?? null };
  } catch { return { nextPaymentDate: null, nextPaymentAmount: null }; }
}
import { effectiveAccountSettings, FREQ_LABEL } from "@shared/accountSettings";
import * as db from "./db";

/** 1日の本数（設定の enum を数にする） */
export function postsPerDayOf(freq: string | null | undefined): number {
  return freq === "three_daily" ? 3 : freq === "twice_daily" ? 2 : 1;
}

/**
 * JST での「今日」と「今月の残り日数（今日を含む）」。
 * AIは今日が何日かを知らないため、これを渡さないと「今月あと何件？」に答えられない。
 */
export function jstMonthPosition(now: Date = new Date()): { today: string; month: number; daysLeft: number } {
  const j = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = j.getUTCFullYear();
  const m = j.getUTCMonth();
  const d = j.getUTCDate();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return { today: `${y}年${m + 1}月${d}日`, month: m + 1, daysLeft: lastDay - d + 1 };
}

async function contractOf(userId: number): Promise<{ info: ContractInfo; sub: any; plan: any } | null> {
  const sub = await db.getSubscriptionByUserId(userId);
  const { getPlan, resolveEffectivePlanId } = await import("@shared/plans");
  const plan = getPlan(resolveEffectivePlanId(sub?.planId, sub?.status));
  if (!plan) return null;
  return {
    sub,
    plan,
    info: {
      planName: plan.name,
      priceMonthly: plan.priceMonthly,
      status: sub?.status ?? null,
      trialEndsAt: sub?.trialEndsAt ?? null,
      currentPeriodEnd: sub?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? null,
      isCampaign: Boolean(plan.isCampaign),
      // ★次回の決済日は UnivaPay が正（currentPeriodEnd は1日遅い・2026-09-25）
      ...(await nextPaymentInfo(userId)),
    },
  };
}

/**
 * 自動応答のプロンプトに差し込む「このお客様の状況」。
 * 何ひとつ読めなければ null（そのときは今までどおり、個別の話は担当者へおつなぎする）。
 */
export async function customerFacts(userId: number | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const lines: string[] = [];

  // ── ご契約（プラン名・月額・次回の請求日） ──
  let user: any = null;
  try { user = await db.getUserById(userId); } catch { user = null; }

  let perDay = 0;
  try {
    const c = await contractOf(userId);
    if (c) {
      lines.push(contractSummary(c.info));
      perDay = c.plan?.features?.maxAutoPostsPerDay ?? 0;
      if (perDay > 0) {
        lines.push(`このプランで作れる自動投稿の上限：1日 ${perDay} 件`);
      }
      // 次回から切り替わるプラン変更のご予約（0092_pending_plan_change）
      if (c.sub?.pendingPlanId) {
        const { getPlan } = await import("@shared/plans");
        const next = getPlan(c.sub.pendingPlanId);
        const when = formatJpDate(c.sub.pendingPlanEffectiveAt);
        if (next) {
          lines.push(
            `プラン変更のご予約：${next.name}（月額 ${next.priceMonthly.toLocaleString("ja-JP")}円・税込）へ` +
            `${when ? `${when}のご請求から` : "次回のご請求から"}切り替わります。それまでは今のプランのままお使いいただけます。`,
          );
        }
      }
    }
  } catch { /* 読めなければ書かない */ }

  // ── 連携しているThreadsアカウントと、いま効いている設定 ──
  try {
    const accounts = (await db.getThreadsAccountsByUserId(userId)).filter((a: any) => a.isActive !== false);
    if (accounts.length === 0) {
      lines.push("連携しているThreadsアカウント：まだありません（連携すると投稿が動き出します）");
    } else {
      lines.push(`連携しているThreadsアカウント：${accounts.length}件`);
      for (const a of accounts.slice(0, 5)) {
        const s = effectiveAccountSettings(user, a);
        const auto = s.autoPostEnabled ? `自動投稿 ${FREQ_LABEL[s.autoPostFrequency]}` : "自動投稿は止めています";
        const review = s.autoPostRequireApproval ? "公開前にご確認いただく設定" : "ご確認なしでそのまま公開";
        lines.push(`・@${a.threadsUsername}：${auto} ／ ${review}`);
      }
    }
  } catch { /* 読めなければ書かない */ }

  // ── 今月の実績と、残りの見込み ──
  //   ★「今月のこり何通？」（2026-09-22 比嘉様 #42）は、件数を渡すだけでは答えられなかった。
  //     AIは今日が何日かを知らないため「現在の日付が不明」で止まる。日付と残り日数も渡す。
  try {
    const posted = await db.countUserMonthlyPosts(userId);
    const { today, month, daysLeft } = jstMonthPosition();
    lines.push(`今日の日付：${today}（今月の残りは、今日を入れて ${daysLeft} 日）`);
    lines.push(`今月（${month}月1日から今日まで）にThreadsへ公開できた投稿：${posted}件`);
    if (perDay > 0) {
      lines.push(
        `今月これから作れる自動投稿の上限：${daysLeft * perDay}件（残り ${daysLeft} 日 × 1日 ${perDay} 件）。` +
        `※ 上限であって、お約束の本数ではありません（見送られた分は公開されません）`,
      );
    }
  } catch { /* 読めなければ書かない */ }

  if (lines.length === 0) return null;
  return lines.join("\n");
}
