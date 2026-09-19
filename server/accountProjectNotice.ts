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

export async function notifyProjectMissing(user: { id: number }, account: { id: number; threadsUsername?: string | null; projectMissingNoticeAt?: unknown }): Promise<boolean> {
  if (!shouldSend(account.projectMissingNoticeAt)) return false;
  const name = account.threadsUsername ? `@${account.threadsUsername}` : "新しく連携されたアカウント";
  const lineIds = await db.getLineUserIdsForUser(user.id).catch(() => [] as string[]);
  if (lineIds.length > 0) {
    const { textWithQuick } = await import("./lineChat");
    const { pushMessages } = await import("./lineNotify");
    const msg = textWithQuick(
      `${name} のお店の情報がまだ登録されていません。\n` +
      "この状態では、もう一方のアカウントの情報で文章が作られてしまうため、" +
      `${name} の投稿づくりはいったん止めています。\n\n` +
      "下のボタンから、このアカウント用の情報を登録してください。" +
      "アカウントごとに別々の情報を持てますので、もう一方の登録内容は変わりません。",
      [{ label: "このアカウントの設定をする", data: `c=acct&a=${account.id}` }],
    );
    for (const lineId of lineIds) await pushMessages(lineId, [msg]).catch(() => undefined);
  }
  await db.updateThreadsAccount(account.id, { projectMissingNoticeAt: new Date() } as any).catch(() => undefined);
  return true;
}
