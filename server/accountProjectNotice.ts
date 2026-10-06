/**
 * 「このアカウントのお店の情報が決まっていません」のご案内（2026-09-19）。
 *
 * ★新しくアカウントを連携した直後は、そのアカウントにお店の情報が紐づいていない。
 *   アカウントが2つ以上ある方でここを放っておくと、もう一方のお店の情報で
 *   文章が作られてしまう（プレステージ様：新しいサロン用のアカウントに、
 *   先に登録してあった求人の投稿が回っていた）。
 *   自動投稿はそのアカウントだけ止めて、この案内で設定へお連れする。
 *
 * 毎朝くり返さないよう、同じアカウントには1日1回までにする。
 */
import * as db from "./db";

/** 前回のご案内から24時間たっているか */
function shouldSend(sentAt: unknown): boolean {
  if (!sentAt) return true;
  const t = new Date(String(sentAt)).getTime();
  if (!Number.isFinite(t)) return true;
  return Date.now() - t >= 24 * 60 * 60 * 1000;
}

export async function notifyProjectMissing(user: { id: number }, account: { id: number; threadsUsername?: string | null; projectMissingNoticeAt?: unknown; createdAt?: unknown }): Promise<boolean> {
  if (!shouldSend(account.projectMissingNoticeAt)) return false;
  // ★連携から2日たっても決まっていなければ、運営にも知らせる（2026-10-06：プレステージ様は約1週間だれも気づかなかった）
  try {
    const created = account.createdAt ? new Date(String(account.createdAt)).getTime() : NaN;
    if (Number.isFinite(created) && Date.now() - created >= 48 * 60 * 60 * 1000) {
      const days = Math.floor((Date.now() - created) / 86400000);
      const { notifyOwner } = await import("./_core/notification");
      await notifyOwner({
        title: "お店の情報が決まらず、投稿が止まっているアカウントがあります",
        content: `user ${user.id} の @${account.threadsUsername ?? account.id}（account ${account.id}）は、連携から${days}日たってもお店の情報が結び付いていないため、自動投稿を止めています。お客様にはLINEで毎日1回ご案内しています。必要ならフォローをお願いします。`,
      });
    }
  } catch (e) { console.warn("[AccountProjectNotice] 運営への通知に失敗:", String(e)); }
  const name = account.threadsUsername ? `@${account.threadsUsername}` : "新しく連携されたアカウント";
  const lineIds = await db.getLineUserIdsForUser(user.id).catch(() => [] as string[]);
  if (lineIds.length > 0) {
    const { textWithQuick } = await import("./lineChat");
    const { pushMessages } = await import("./lineNotify");
    const msg = textWithQuick(
      `${name} で、どのお店の情報を使って投稿するかが、まだ決まっていません。\n` +
      "もう一方のアカウントの内容が混ざらないよう、決まるまで " + `${name} の投稿づくりは止めています。\n\n` +
      "下のボタンから選ぶと、その場で今日の分の投稿づくりを始めます。登録ずみの情報をそのまま使うことも、このアカウント用に新しく登録することもできます（もう一方の登録内容は変わりません）。",
      [{ label: "使う情報を選ぶ", data: `c=acct&a=${account.id}` }],
    );
    for (const lineId of lineIds) await pushMessages(lineId, [msg]).catch(() => undefined);
  }
  await db.updateThreadsAccount(account.id, { projectMissingNoticeAt: new Date() } as any).catch(() => undefined);
  return true;
}
