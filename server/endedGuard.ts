/**
 * ご契約が終わった方の有料機能を止める（2026-10-03 三上様「解約後は有料機能が全て使えないように徹底」）。
 *
 * 判定は db.isEndedCustomer（解約ずみ、または解約の予約の期限を過ぎ、使える契約が1つも無い方）。
 * 一度も契約していない方（お試し・はじめの設定の途中）は対象外＝今までどおり。
 * 無料プランに含まれる機能（手動の投稿・月3回のAI生成・お問い合わせへの返事）は、ここでは止めない。
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

/** 定期処理・LINE用：契約が終わった方か（例外を投げない） */
export async function isEnded(userId: number | null | undefined): Promise<boolean> {
  if (!userId) return false;
  try { return await db.isEndedCustomer(Number(userId)); } catch { return false; }
}
