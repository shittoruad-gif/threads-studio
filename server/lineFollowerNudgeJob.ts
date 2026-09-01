/**
 * 公式LINEに友だち追加したまま、アプリのアカウントとつないでいない方へのご案内。
 *
 * この方たちは users にも行が無く、メールアドレスも分からない。
 * 追いかけられる手段はLINEのトークだけなので、ここで拾う。
 *
 * しつこくしない:
 *   ・2通で打ち止め（3日後・10日後）。
 *   ・「この案内は不要」で止められる。
 *   ・ブロックされたら記録ごと消える（webhook の unfollow）。
 */
import * as db from "./db";
import { textWithQuick } from "./lineChat";

const FIRST_AFTER_DAYS = 3;
const SECOND_AFTER_DAYS = 10;

export async function runLineFollowerNudgeJob(): Promise<void> {
  const targets = await db.listUnlinkedLineFollowers();
  if (targets.length === 0) {
    console.log("[LineFollowerNudge] 対象なし");
    return;
  }
  const base = process.env.APP_BASE_URL || "https://threads-studio.com";
  const { pushMessages } = await import("./lineNotify");
  let sent = 0;
  let skipped = 0;

  for (const t of targets) {
    try {
      const ageDays = (Date.now() - t.followedAt.getTime()) / 86400000;
      const needDays = t.stage === 0 ? FIRST_AFTER_DAYS : SECOND_AFTER_DAYS;
      if (ageDays < needDays) { skipped++; continue; }
      if (t.lastSentAt && (Date.now() - t.lastSentAt.getTime()) / 86400000 < 5) { skipped++; continue; }

      const second = t.stage >= 1;
      const text = second
        ? "友だち追加ありがとうございます。\n\n" +
          "まだアカウントとつながっていないため、投稿の確認や設定がご利用いただけない状態です。\n" +
          "すでにアカウントをお持ちの方は「連携する」、これからの方は「アカウントを作る」を押してください。\n\n" +
          "ご案内は今回で最後にいたします。"
        : "友だち追加ありがとうございます。\n\n" +
          "このトークの中で、毎日の投稿の確認・書き直し・設定まで終わります。\n" +
          "ご利用には、アカウントとつなぐ操作が1回だけ必要です。\n\n" +
          "すでにアカウントをお持ちの方は「連携する」、これからの方は「アカウントを作る」を押してください。\n" +
          `（ご登録はこちらからでも進められます：${base}/register）`;

      const ok = await pushMessages(t.lineUserId, [
        textWithQuick(text, [
          { label: "連携する", data: "m=link" },
          { label: "アカウントを作る", data: "m=signup" },
          { label: "この案内は不要", data: "f=off" },
        ]),
      ]);
      if (ok) {
        await db.recordLineFollowerNudge(t.lineUserId, t.stage + 1);
        sent++;
      }
    } catch (e) {
      console.error(`[LineFollowerNudge] ${t.lineUserId} の案内に失敗:`, e);
    }
  }

  console.log(`[LineFollowerNudge] 送信 ${sent}件 / 対象外 ${skipped}件 / 全 ${targets.length}人`);
}
