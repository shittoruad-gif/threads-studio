/**
 * 朝のまとめ通知（毎朝 7:40 JST・1人1通）。2026-09-10 三上様指示「朝のLINEを2通にまとめる」。
 *
 * それまで朝に別々に届いていた
 *   7:40 昨日の投稿結果（dailyPostCountReport）／8:30 次にやること（旧 nextActionJob・2026-09-19 に削除）／
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
import { announcementApplies, announcementForToday, renderAnnouncement } from "../shared/announcements";
import { accountAgeDays } from "../shared/accountRamp";
import { getPlan, resolveEffectivePlanId } from "../shared/plans";
import { personalNoticesFor, personalNoticeUserIds } from "../shared/personalNotices";

const RESEND_AFTER_DAYS = 1; // 同じ「次にやること」は1日1回まで

/**
 * いちばん新しく連携したThreadsアカウントの、連携からの経過日数（連携した日＝0）。連携が無ければ null。
 * 慣らし運転のお知らせのように「連携したばかりの方だけ」へ出す判定に使う（2026-09-18）。
 */
async function newestAccountAgeDays(userId: number): Promise<number | null> {
  try {
    const accounts = await db.getThreadsAccountsByUserId(userId);
    const ages = accounts.map((a: any) => accountAgeDays(a?.createdAt)).filter((n) => Number.isFinite(n));
    return ages.length === 0 ? null : Math.min(...ages);
  } catch {
    return null;
  }
}

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
  // ★仕組みの変更のお知らせは、案内OFF・LINE未連携の方にも届ける（2026-09-13 三上様決定 R3。岩根様が案内OFFで9/13のお知らせ未着だった）
  const annTargets: number[] = ann ? await db.listUserIdsForAnnouncement().catch(() => [] as number[]) : [];
  const buildAnnText = async (userId: number, user: any): Promise<string | null> => {
    if (!ann || !user || user.lastAnnouncementKey === ann.key) return null;
    // その方に当てはまる段落だけを出す（プラン・公開前の確認・Meta AIの設定で出し分け）
    const sub = await db.getSubscriptionByUserId(userId).catch(() => null);
    const plan = getPlan(resolveEffectivePlanId(sub?.planId, sub?.status));
    const ctx = {
      maxPerDay: Number(plan?.features?.maxAutoPostsPerDay ?? 0),
      requireApproval: user.autoPostRequireApproval !== false,
      metaAiEnabled: user.metaAiAskEnabled !== false,
      newestAccountAgeDays: await newestAccountAgeDays(userId),
    };
    // ★送る相手が絞られているお知らせは、当てはまらない方には出さない
    //   （例：慣らし運転の説明は連携から30日以内の方だけ。2026-09-18）
    if (!announcementApplies(ann, ctx)) return null;
    return renderAnnouncement(ann, ctx);
  };

  // 送る相手＝昨日の結果がある人 ∪ 案内の対象 ∪ お知らせの対象（お知らせがある日だけ）
  const userIds = new Set<number>([...Array.from(byUser.keys()), ...notifyTargets.map((t) => t.userId), ...personalNoticeUserIds(), ...annTargets]);
  const { pushMessages } = await import("./lineNotify");
  let sent = 0;
  let withAction = 0;

  for (const userId of Array.from(userIds)) {
    try {
      const user: any = await db.getUserById(userId);
      if (!user || user.isDemoMode) continue;
      const lineIds = await db.getLineUserIdsForUser(userId);
      if (lineIds.length === 0) {
        // ★LINE未連携の方には、お知らせだけメールで（R3。小林様が9/13のお知らせ未着だった）
        const mailText = await buildAnnText(userId, user);
        if (mailText && user.email && user.emailVerified && !user.emailOptOut) {
          try {
            const { sendEmail } = await import("./_core/notification");
            const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans','Noto Sans JP',sans-serif;font-size:15px;line-height:1.9;color:#222;max-width:640px;margin:0 auto;padding:8px 4px">` +
              mailText.split("\n").map((l) => (l.trim() === "" ? `<div style="height:8px"></div>` : `<p style="margin:0${l.startsWith("■") ? ";font-weight:700;margin-top:18px" : ""}">${esc(l)}</p>`)).join("") + `</div>`;
            const subject = `【Threads Studio】${mailText.split("\n")[0].replace(/^【お知らせ】/, "")}`;
            const ok = await sendEmail({ to: user.email, subject, html });
            if (ok && ann) await db.recordAnnouncementSent(userId, ann.key).catch(() => {});
            console.log(`[MorningDigest] お知らせをメールで user=${userId} ${ok ? "送信" : "失敗"}`);
          } catch (e) { console.warn(`[MorningDigest] お知らせメール失敗 user=${userId}: ${(e as Error)?.message}`); }
        }
        continue;
      }

      const parts: string[] = [];
      const buttons: Array<{ label: string; data: string }> = [];
      let after: (() => Promise<void>) | null = null;

      // ① 昨日の結果
      const rows = byUser.get(userId);
      const count = rows ? await buildDailyCountTextForUser(userId, rows, dateLabel) : null;
      if (count) parts.push(count.text);
      // ★昨日、承認待ちのまま1件も公開されなかった方には「承認がないと投稿されない」ことをはっきり伝え、
      //   承認が手間なら「自動（確認なし）」に切り替えられることを案内する（2026-09-11 三上様指示）
      const stuck = !!(rows && rows.some((r) => r.posted === 0 && r.awaiting > 0) && !rows.some((r) => r.posted > 0));
      let stuckText: string | null = null;
      if (stuck && user.autoPostRequireApproval !== false && user.autoPublishIfNoResponse === false) {
        stuckText =
          "★昨日は、承認待ちのまま1件も公開されませんでした。\n" +
          "いまの設定では、承認カードで「OK」を押していただかないと投稿は公開されません。お手すきのときに「今日の投稿」から承認をお願いします。\n" +
          "押す時間がない日が多い場合は、「見送りしなければ公開」を押してください。カードは今までどおり届き、「見送る」を押さない限り予定時刻にそのまま公開されます。\n" +
          "確認そのものが不要なら「自動にする（確認なし）」です。どちらも「設定」からいつでも戻せます。";
        buttons.unshift(
          { label: "今日の投稿", data: "m=posts" },
          { label: "すべて承認する", data: "a=okall" },
          { label: "見送りしなければ公開", data: "s=softappr&v=on" },
          { label: "自動にする（確認なし）", data: "c=automode&v=on" },
        );
      }

      // ② その日のお知らせ（1人1回）。案内OFFの方にも出す（R3）。案内OFFで止めるのは③の「次にやること」「自動にしませんか」だけ
      const t = notifyMap.get(userId);
      const annText: string | null = await buildAnnText(userId, user);

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
      const ownerText = [annText, count?.text, stuckText, actionText, awaitingText].filter(Boolean).join("\n\n");
      const staffText = [annText, count?.text, awaitingText].filter(Boolean).join("\n\n");
      // ★特定の方だけへの「もう1通」（shared/personalNotices.ts）。まとめの直後にオーナーLINEへ
      const notices = personalNoticesFor(userId);
      if (!ownerText && notices.length === 0) continue;

      const common = [
        { label: "今日の投稿", data: "m=posts" },
        { label: "設定", data: "m=settings" },
        { label: "使い方", data: "m=help" },
      ];
      let ok = false;
      for (let i = 0; i < lineIds.length; i++) {
        const isOwner = i === 0;
        const text = isOwner ? ownerText : staffText;
        if (!text) { if (isOwner) ok = true; continue; }
        const msg = textWithQuick(text, isOwner ? [...buttons, ...common] : common);
        const r = await pushMessages(lineIds[i], [msg]);
        if (isOwner) ok = r;
      }
      if (ok) {
        if (ownerText) sent++;
        if (annText && ann) await db.recordAnnouncementSent(userId, ann.key).catch(() => {});
        if (after) { await after().catch(() => {}); withAction++; }
      }
      // ★もう1通（個別のお知らせ）。約束した本数が今朝作られていなければ送らず、運営に知らせる
      for (const n of notices) {
        try {
          if (n.requireAccountPostsToday) {
            const made = await db.countAccountPostsScheduledToday(n.requireAccountPostsToday.accountId).catch(() => 0);
            if (made < n.requireAccountPostsToday.min) {
              console.warn(`[MorningDigest] 個別通知 ${n.key} user=${userId} は見送り（今朝の生成 ${made}件 < ${n.requireAccountPostsToday.min}件）`);
              try { const { notifyOwner } = await import("./_core/notification"); await notifyOwner({ title: `個別のお知らせを送れませんでした（user ${userId}）`, content: `${n.key}：今朝の生成が${made}件で、文面の約束（${n.requireAccountPostsToday.min}件）と食い違うため送っていません。` }); } catch { /* 通知失敗は無視 */ }
              continue;
            }
          }
          const r = await pushMessages(lineIds[0], [{ type: "text", text: n.text }]);
          console.log(`[MorningDigest] 個別通知 ${n.key} user=${userId} ${r ? "送信" : "失敗"}`);
        } catch (e) {
          console.error(`[MorningDigest] 個別通知 user=${userId} に失敗:`, e);
        }
      }
    } catch (e) {
      console.error(`[MorningDigest] user=${userId} に失敗:`, e);
    }
  }
  console.log(`[MorningDigest] 送信 ${sent}件（やること付き ${withAction}件）/ 対象 ${userIds.size}人`);
}
