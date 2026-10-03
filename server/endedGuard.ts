/**
 * ご契約が終わった方の有料機能を止める（2026-10-03 三上様「解約後は有料機能が全て使えないように徹底」）。
 *
 * 判定は db.isEndedCustomer（解約ずみ、または解約の予約の期限を過ぎ、使える契約が1つも無い方）。
 * 一度も契約していない方（お試し・はじめの設定の途中）は対象外＝今までどおり。
 * お申し込み前の方も含めて止めるときは assertSubscribed／isSubscribed を使う（2026-10-03 フリープラン廃止）。
 */
import { TRPCError } from "@trpc/server";
import * as db from "./db";

export const ENDED_MESSAGE =
  "ご契約が終了しているため、この機能はお使いいただけません。再開をご希望の場合は、公式LINEでお知らせください。";

/** 画面（tRPC）用：契約が終わった方なら止める */
export async function assertNotEnded(userId: number | null | undefined): Promise<void> {
  if (!userId) return;
  if (await db.isEndedCustomer(Number(userId))) {
    throw new TRPCError({ code: "FORBIDDEN", message: ENDED_MESSAGE });
  }
}

export const NOT_SUBSCRIBED_MESSAGE =
  "この機能は、お申し込みのあとにお使いいただけます。最初の7日間は無料です（料金プランからお申し込みください）。";

/**
 * 画面（tRPC）用：使える契約（有料・7日間体験・代理店・期限なしクーポン）が無ければ止める。
 * ★2026-10-03 三上様「フリープランは不要」：お申し込み前の方は、はじめの設定と連携だけ。
 */
export async function assertSubscribed(userId: number | null | undefined): Promise<void> {
  if (!userId) throw new TRPCError({ code: "UNAUTHORIZED", message: "ログインしてください" });
  if (await db.hasUsableSubscription(Number(userId))) return;
  const ended = await db.isEndedCustomer(Number(userId));
  throw new TRPCError({ code: "FORBIDDEN", message: ended ? ENDED_MESSAGE : NOT_SUBSCRIBED_MESSAGE });
}

/** 定期処理・LINE用：使える契約があるか（判定に失敗したら止めない） */
export async function isSubscribed(userId: number | null | undefined): Promise<boolean> {
  if (!userId) return false;
  try { return await db.hasUsableSubscription(Number(userId)); } catch { return true; }
}

/** 定期処理・LINE用：契約が終わった方か（例外を投げない） */
export async function isEnded(userId: number | null | undefined): Promise<boolean> {
  if (!userId) return false;
  try { return await db.isEndedCustomer(Number(userId)); } catch { return false; }
}
