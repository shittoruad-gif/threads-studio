/**
 * 毎朝8:35 JST：公開前の確認を続けている方に「自動（確認なし）にしませんか」とお声がけする。
 * 判定は shared/autoModeNudge.ts。ボタンは c=automode&v=on|keep（lineChatHandler）。
 */
import * as db from "./db";
import { textWithQuick, MENU_ITEMS } from "./lineChat";
import { shouldNudgeAutoMode, autoModeNudgeText } from "../shared/autoModeNudge";

export async function runAutoModeNudgeJob(): Promise<void> {
  const targets = await db.listUsersForAutoModeNudge();
  if (targets.length === 0) { console.log("[AutoModeNudge] 対象なし"); return; }
  const { pushMessages } = await import("./lineNotify");
  let sent = 0;
  for (const t of targets) {
    try {
      const stats = await db.approvalStatsForUser(t.userId);
      const s = { ...stats, nudgeCount: t.nudgeCount, lastNudgeAt: t.lastNudgeAt };
      const v = shouldNudgeAutoMode(s);
      if (!v.ok) continue;
      const ok = await pushMessages(t.lineUserId, [
        textWithQuick(autoModeNudgeText(s), [
          { label: "自動にする（確認なし）", data: "c=automode&v=on" },
          { label: "このまま確認する", data: "c=automode&v=keep" },
          ...MENU_ITEMS,
        ]),
      ]);
      if (ok) { await db.recordAutoModeNudge(t.userId); sent++; console.log(`[AutoModeNudge] 送信 user=${t.userId}（${v.reason}）`); }
    } catch (e) {
      console.error(`[AutoModeNudge] user=${t.userId} に失敗:`, e);
    }
  }
  console.log(`[AutoModeNudge] 送信 ${sent}件 / 対象 ${targets.length}人`);
}
