/**
 * 「次にやること」を公式LINEでお伝えする日次ジョブ。
 *
 * しつこくならないための決まり:
 *  - 一度に1つだけ。お一人につき1通まで。
 *  - 同じ案内は3日おき（直したくても今日は手が空かない、という場合があるため）。
 *  - 案内が変わったときは、その日のうちにお伝えする（前に進んだ合図なので）。
 *  - 「もう不要」と言われた方には送らない。
 */
import * as db from "./db";
import { detectNextAction } from "./nextAction";
import { textWithQuick, MENU_ITEMS } from "./lineChat";

/** 同じ案内を送り直すまでの間隔 */
const RESEND_AFTER_DAYS = 1; // ★2026-09-06 三上様指示：進んでいない方には毎朝お知らせする（「この案内は不要」で止められる）

export async function runNextActionNotifyJob(): Promise<void> {
  const targets = await db.listUsersForNextActionNotify();
  if (targets.length === 0) {
    console.log("[NextAction] 対象なし");
    return;
  }

  const { pushMessages } = await import("./lineNotify");
  let sent = 0;
  let skipped = 0;

  // ★その日だけ全員に送る「お知らせ」（shared/announcements.ts）。1人1回。
  //   次にやることが無い（設定が済んでいる）方にも届くよう、案内の判定より前に送る
  //   （2026-09-09 三上様指示：何がどう簡単になったかを、案内と一緒に届ける）。
  const { announcementForToday } = await import("../shared/announcements");
  const ann = announcementForToday();
  let announced = 0;

  for (const t of targets) {
    try {
      if (ann && (t as any).lastAnnouncementKey !== ann.key) {
        const okA = await pushMessages(t.lineUserId, [
          textWithQuick(ann.text, [{ label: "次にやること", data: "m=next" }, ...MENU_ITEMS.filter((m) => m.data !== "m=next")]),
        ]);
        if (okA) { await db.recordAnnouncementSent(t.userId, ann.key); announced++; }
      }
      const action = await detectNextAction(t.userId);
      if (!action) { skipped++; continue; }

      // 同じ案内を短い間隔で繰り返さない
      if (t.lastKey === action.key && t.lastSentAt) {
        const days = (Date.now() - t.lastSentAt.getTime()) / 86400000;
        if (days < RESEND_AFTER_DAYS) { skipped++; continue; }
      }

      const ok = await pushMessages(t.lineUserId, [
        textWithQuick(action.text, [
          ...action.buttons,
          // ★止められるようにしておく（押すだけで止まる）
          { label: "この案内は不要", data: "n=off" },
          ...MENU_ITEMS,
        ]),
      ]);
      if (ok) {
        await db.recordNextActionSent(t.userId, action.key);
        sent++;
      }
    } catch (e) {
      console.error(`[NextAction] user=${t.userId} の案内に失敗:`, e);
    }
  }

  console.log(`[NextAction] 送信 ${sent}件 / 対象外 ${skipped}件 / 全 ${targets.length}人${ann ? ` / お知らせ「${ann.key}」${announced}件` : ""}`);
}
