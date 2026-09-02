/**
 * プランが上がったときに、自動投稿の回数をそのプランの上限まで引き上げる。
 *
 * なぜ必要か:
 *   自動投稿の本数は「ご本人の設定（autoPostFrequency）」を「プランの上限」で
 *   頭打ちにして決めている（server/autoPostScheduler.ts）。
 *   フリープランの間は上限が0なので、回数の設定を触る理由がなく、
 *   ほとんどの方は初期値の daily（1日1回）のまま有料プランに切り替えます。
 *   すると上限は3になっても設定が1のままで、1日1回しか投稿されません。
 *   お金を払っているのに3分の1しか動いていない状態になるため、
 *   切り替えた時点で上限まで引き上げます。
 *
 * 引き上げる条件（ご本人の意思を上書きしないための線引き）:
 *   ・新しいプランの上限が、前のプランの上限より大きいときだけ。
 *     毎月の課金でもWebhookは届くので、無条件に上げると
 *     「1日1回でいい」と自分で下げた方の設定を毎月戻してしまう。
 *   ・すでに上限いっぱいの設定なら何もしない。
 *   ・自動投稿をご自分でOFFにしている方は、OFFのままにする。
 *     回数だけ上げておき、ONにした時点で3回になる。
 */
import { getPlan } from "../shared/plans";
import * as db from "./db";

/** 1日あたりの本数 → 設定値 */
function frequencyForCount(count: number): "daily" | "twice_daily" | "three_daily" {
  if (count >= 3) return "three_daily";
  if (count === 2) return "twice_daily";
  return "daily";
}

/** 設定値 → 1日あたりの本数 */
function countForFrequency(frequency: string | null | undefined): number {
  if (frequency === "three_daily") return 3;
  if (frequency === "twice_daily") return 2;
  return 1;
}

/**
 * プラン変更後に呼ぶ。上位プランに変わっていれば自動投稿の回数を上限まで上げる。
 * 失敗しても課金処理は止めない（呼び出し側で握りつぶしてよい）。
 *
 * @param prevPlanId 変更前のプランID。初めての有料化なら 'free' を渡す。
 * @returns 実際に引き上げたときだけ true
 */
export async function raiseAutoPostFrequencyOnUpgrade(
  userId: number,
  prevPlanId: string | null | undefined,
  nextPlanId: string,
): Promise<boolean> {
  const prevMax = getPlan(prevPlanId || "free")?.features.maxAutoPostsPerDay ?? 0;
  const nextMax = getPlan(nextPlanId)?.features.maxAutoPostsPerDay ?? 0;
  // 上限が増えていないなら触らない（同じプランでの再課金・ダウングレード）
  if (nextMax <= prevMax || nextMax <= 0) return false;

  const settings = await db.getAutoPostSettings(userId);
  const current = countForFrequency(settings?.autoPostFrequency);
  if (current >= nextMax) return false;

  await db.updateAutoPostSettings(userId, { autoPostFrequency: frequencyForCount(nextMax) });
  console.log(
    `[PlanUpgrade] 自動投稿の回数を引き上げ: user=${userId} ${prevPlanId || "free"}→${nextPlanId} ${current}回→${nextMax}回`,
  );
  return true;
}
