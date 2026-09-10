/**
 * 朝のまとめ通知（毎朝 7:40 JST・1人1通）。2026-09-10 三上様指示「朝のLINEを2通にまとめる」。
 *
 * それまで朝に別々に届いていた
 *   7:40 昨日の投稿結果（dailyPostCountReport）／8:30 次にやること（nextActionJob）／
 *   8:35 自動にしませんか（autoModeNudgeJob）／その日のお知らせ（announcements）
 * を、この1通にまとめる。承認カード（6:00）と Meta AI 呼びかけ（10:00）はそのまま。
 *
 * 構成：①昨日の結果 ②お知らせ（あれば） ③きょうやること1つ（次にやること ＞ 自動にしませんか）④承認待ちの件数
 * ボタンは③のもの＋「今日の投稿」「設定」「使い方」。
 * ★③のボタンはオーナー（最初に連携したLINE）にだけ出す。スタッフのLINEには①②④だけ。
 */
import * as db from "./db";
import { textWithQuick } from "./lineChat";
import { detectNextAction } from "./nextAction";
import { buildDailyCountTextForUser, yesterdayLabelJst } from "./dailyPostCountReport";
import { autoModeNudgePart } from "./autoModeNudgeJob";
import { announcementForToday } from "../shared/announcements";

const RESEND_AFTER_DAYS = 1; // 同じ「次にやること」は1日1回まで

export async function runMorningDigestJob(): Promise<void> {
  const stats = await db.getYesterdayAutoPostStatsByAccount();
  const byUser = new Map<number, typeof stats>();
  for (const r of stats) { const a = byUser.get(r.userId) ?? []; a.push(r); byUser.set(r.userId, a); }
  const dateLabel = yesterdayLabelJst();

  // 案内の対象（LINE連携・案内ON）と、自動にしませんかの対象
  const notifyTargets = await db.listUsersForNextActionNotify();
  const notifyMap = new Map(notifyTargets.map((t) => [t.userId, t]));
  const nudgeMap = new Map((await db.listUsersForAutoModeNudge()).map((t) => [t.userId, t]));
  const ann = announcementForToday();

  // 送る相手＝昨日の結果がある人 ∪ 案内の対象
  const userIds = new Set<number>([...Array.from(byUser.keys()), ...notifyTargets.map((t) => t.userId)]);
  const { pushMessages } = await import("./lineNotify");
  let sent = 0;
  let withAction = 0;

  for (const userId of Array.from(userIds)) {
    try {
      const lineIds = await db.getLineUserIdsForUser(userId);
      if (lineIds.length === 0) continue;
      const user: any = await db.getUserById(userId);
      if (!user || user.isDemoMode) continue;

      const parts: string[] = [];
      const buttons: Array<{ label: string; data: string }> = [];
      let after: (() => Promise<void>) | null = null;

      // ① 昨日の結果
      const rows = byUser.get(userId);
      const count = rows ? await buildDailyCountTextForUser(userId, rows, dateLabel) : null;
      if (count) parts.push(count.text);

      // ② その日のお知らせ（1人1回）
      const t = notifyMap.get(userId);
      let annText: string | null = null;
      if (ann && t && (t as any).lastAnnouncementKey !== ann.key) annText = ann.text;

      // ③ きょうやること1つ（次にやること ＞ 自動にしませんか）
      let actionText: string | null = null;
      if (t) {
        const action = await detectNextAction(userId);
        const tooSoon = action && t.lastKey === action.key && t.lastSentAt && (Date.now() - t.lastSentAt.getTime()) / 86400000 < RESEND_AFTER_DAYS;
        if (action && !tooSoon) {
          actionText = action.text;
          buttons.push(...action.buttons, { label: "この案内は不要", data: "n=off" });
          after = async () => { await db.recordNextActionSent(userId, action.key); };
        } else if (!action) {
          const n = nudgeMap.get(userId);
          if (n) {
            const part = await autoModeNudgePart(userId, n.nudgeCount, n.lastNudgeAt);
            if (part) {
              actionText = part.text;
              buttons.push(...part.buttons);
              after = async () => { await db.recordAutoModeNudge(userId); console.log(`[MorningDigest] 自動にしませんか user=${userId}（${part.reason}）`); };
            }
          }
        }
      }

      // ④ 承認待ち（きょう以降の予定で、まだ承認されていないもの）
      const awaiting = await db.getRecentAwaitingApprovalPosts(userId, 30).catch(() => [] as any[]);
      const awaitingText = awaiting.length > 0 ? `承認をお待ちしている投稿が ${awaiting.length}件 あります。「今日の投稿」から公開できます。` : null;

      // ★お知らせがある日は、お知らせを先頭に（「この1通にまとめました」を先に読んでもらう）
      const ownerText = [annText, count?.text, actionText, awaitingText].filter(Boolean).join("\n\n");
      const staffText = [annText, count?.text, awaitingText].filter(Boolean).join("\n\n");
      if (!ownerText) continue;

      const common = [
        { label: "今日の投稿", data: "m=posts" },
        { label: "設定", data: "m=settings" },
        { label: "使い方", data: "m=help" },
      ];
      let ok = false;
      for (let i = 0; i < lineIds.length; i++) {
        const isOwner = i === 0;
        const text = isOwner ? ownerText : staffText;
        if (!text) continue;
        const msg = textWithQuick(text, isOwner ? [...buttons, ...common] : common);
        const r = await pushMessages(lineIds[i], [msg]);
        if (isOwner) ok = r;
      }
      if (ok) {
        sent++;
        if (annText && ann) await db.recordAnnouncementSent(userId, ann.key).catch(() => {});
        if (after) { await after().catch(() => {}); withAction++; }
      }
    } catch (e) {
      console.error(`[MorningDigest] user=${userId} に失敗:`, e);
    }
  }
  console.log(`[MorningDigest] 送信 ${sent}件（やること付き ${withAction}件）/ 対象 ${userIds.size}人`);
}
