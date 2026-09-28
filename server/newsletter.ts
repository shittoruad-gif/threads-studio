/**
 * 有料会員向けの読み物（週1回）（2026-09-29 三上様指示）。判断と文面は shared/newsletter.ts。
 *
 * 毎週火曜11:00（JST）：まだ送っていない次の回を、三上様の公式LINEへ下見として送る
 *   （2026-09-29 三上様「今日を起点として1週間おきに」。第1回は同日8:41に手で下見を出した）
 *   （「有料会員◯名に送る／この回は送らない」ボタン付き）。
 * 三上様が「送る」を押した時点で、あらためて配信先を数え直してから送る
 *   （下見のあとに解約・無料へ変わった方には届かない）。
 * 配信先：有料で、いまご契約中の方（isNewsletterRecipient）。解約の予約があっても期間が残っていれば送る（9/29 三上様）。
 *   公式LINEがつながっている方はLINE、無い方はメール。
 * 同じ回が同じ方へ2回届かないよう、送る前に配信記録（一意）を入れる。
 * 「読み物は不要」とおっしゃった方は newsletterOptOuts に入れる（担当者の作業）。入っている方には送らない。
 */
import { sql } from "drizzle-orm";
import * as db from "./db";
import { NEWSLETTER_ISSUES, isNewsletterRecipient, personalNote, renderIssue, type NewsletterIssue, type RecipientSub } from "@shared/newsletter";

export interface Recipient { userId: number; name: string; email: string | null }

/** いまの配信先（送る直前にも呼び直す） */
export async function listNewsletterRecipients(): Promise<Recipient[]> {
  const database = await db.getDb();
  if (!database) return [];
  const rows: any = await database.execute(sql`
    SELECT u.id AS userId, u.name, u.email, u.role, s.planId, s.status, s.univapaySubscriptionId, s.cancelAtPeriodEnd, s.currentPeriodEnd
    FROM users u JOIN subscriptions s ON s.userId = u.id`);
  const byUser = new Map<number, { user: any; subs: RecipientSub[] }>();
  for (const r of ((rows as any)[0] ?? []) as any[]) {
    const id = Number(r.userId);
    const cur = byUser.get(id) ?? { user: r, subs: [] };
    cur.subs.push({ planId: r.planId, status: r.status, univapaySubscriptionId: r.univapaySubscriptionId, cancelAtPeriodEnd: r.cancelAtPeriodEnd, currentPeriodEnd: r.currentPeriodEnd });
    byUser.set(id, cur);
  }
  // 「読み物は不要」とおっしゃった方は外す（担当者が newsletterOptOuts に入れる）
  const optRows: any = await database.execute(sql`SELECT userId FROM newsletterOptOuts`).catch(() => [[]]);
  const optedOut = new Set((((optRows as any)[0] ?? []) as any[]).map((r) => Number(r.userId)));
  const out: Recipient[] = [];
  for (const [userId, v] of Array.from(byUser.entries())) {
    if (optedOut.has(userId)) continue;
    if (isNewsletterRecipient(v.user, v.subs)) out.push({ userId, name: String(v.user.name ?? ""), email: v.user.email ? String(v.user.email) : null });
  }
  return out;
}

/** 第5回の「あなたのお店の数字」：直近30日の自動投稿を、書き方（切り口）ごとの平均表示回数で比べる */
export async function personalNoteFor(userId: number): Promise<string> {
  const database = await db.getDb();
  let storeName: string | null = null;
  try {
    const pjs: any[] = ((await db.getUserProjects(userId)) || []).filter((p: any) => !String(p.id).startsWith("demo_"));
    storeName = pjs[0]?.storeName ?? null;
  } catch { /* 店名なしで書く */ }
  if (!database) return personalNote({ storeName, total: 0 });
  const rows: any = await database.execute(sql`
    SELECT sp.angle, pa.impressions FROM scheduledPosts sp
    JOIN postAnalytics pa ON pa.threadsPostId = sp.publishedThreadsPostId AND pa.userId = sp.userId
    WHERE sp.userId = ${userId} AND sp.status = 'posted' AND sp.source = 'auto'
      AND sp.angle IS NOT NULL AND sp.angle NOT IN ('pinned','meta_ai_call','hit_pattern')
      AND sp.postedAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)`);
  const list = (((rows as any)[0] ?? []) as any[]).map((r) => ({ angle: String(r.angle), views: Number(r.impressions ?? 0) }));
  const total = list.length;
  if (total === 0) return personalNote({ storeName, total: 0 });
  const overallAvg = list.reduce((a, b) => a + b.views, 0) / total;
  const groups = new Map<string, number[]>();
  for (const x of list) groups.set(x.angle, [...(groups.get(x.angle) ?? []), x.views]);
  let best: { angle: string; avg: number } | null = null;
  for (const [angle, vs] of Array.from(groups.entries())) {
    if (vs.length < 2) continue; // 1本だけの書き方は偶然が大きいので比べない
    const avg = vs.reduce((a, b) => a + b, 0) / vs.length;
    if (!best || avg > best.avg) best = { angle, avg };
  }
  const { getAngle } = await import("@shared/postAngles");
  return personalNote({ storeName, total, overallAvg, bestAvg: best?.avg, bestLabel: best ? (getAngle(best.angle)?.label ?? null) : null });
}

async function adminLineIds(): Promise<string[]> {
  const database = await db.getDb();
  if (!database) return [];
  const rows: any = await database.execute(sql`SELECT id FROM users WHERE role = 'admin'`);
  const ids: string[] = [];
  for (const r of ((rows as any)[0] ?? []) as any[]) ids.push(...(await db.getLineUserIdsForUser(Number(r.id)).catch(() => [])));
  return Array.from(new Set(ids));
}

/** まだ送っていない（送ることも見送ることも決まっていない）次の回 */
export async function nextIssue(): Promise<{ issue: NewsletterIssue; state: string | null; previewedAt: Date | null } | null> {
  const database = await db.getDb();
  if (!database) return null;
  const rows: any = await database.execute(sql`SELECT issueNo, status, previewedAt FROM newsletterIssues`);
  const state = new Map<number, any>((((rows as any)[0] ?? []) as any[]).map((r) => [Number(r.issueNo), r]));
  for (const issue of NEWSLETTER_ISSUES) {
    const s = state.get(issue.no);
    if (!s || s.status === "pending") return { issue, state: s?.status ?? null, previewedAt: s?.previewedAt ? new Date(s.previewedAt) : null };
  }
  return null;
}

/** 週の定例：次の回の下見を三上様へ（判断待ちの回がまだ新しければ出し直さない） */
export async function runNewsletterPreview(opts: { dryRun?: boolean } = {}): Promise<{ issueNo: number | null; recipients: number; preview: string }> {
  const database = await db.getDb();
  const next = await nextIssue();
  if (!database || !next) return { issueNo: null, recipients: 0, preview: "" };
  const { issue } = next;
  if (next.previewedAt && Date.now() - next.previewedAt.getTime() < 6 * 86400_000) {
    console.log(`[Newsletter] 第${issue.no}回は判断待ち（下見ずみ）`);
    return { issueNo: issue.no, recipients: 0, preview: "" };
  }
  const recipients = await listNewsletterRecipients();
  const sample = issue.body.includes("{PERSONAL}")
    ? "（ここに、お一人ずつのお店の数字が入ります。例：「〇〇様のアカウントの直近30日で、いちばん見られていたのは「あるある」の書き方でした。…」）"
    : "";
  const preview =
    `【有料会員向けの読み物・お送りする前の確認】第${issue.no}回\n` +
    `配信先：有料会員${recipients.length}名（無料・解約ずみの方には送りません。解約の予約がある方も、期間が残っていれば送ります）\n` +
    `「送る」を押すと、公式LINE（LINEが無い方はメール）で届きます。\n\n` +
    renderIssue(issue, sample);
  if (opts.dryRun) return { issueNo: issue.no, recipients: recipients.length, preview };

  await database.execute(sql`
    INSERT INTO newsletterIssues (issueNo, status, previewedAt, recipients) VALUES (${issue.no}, 'pending', NOW(), ${recipients.length})
    ON DUPLICATE KEY UPDATE previewedAt = NOW(), recipients = ${recipients.length}`);
  const { pushMessages } = await import("./lineNotify");
  const { textWithQuick } = await import("./lineChat");
  const buttons = [
    { label: `有料会員${recipients.length}名に送る`.slice(0, 20), data: `adm=nl&n=${issue.no}&v=send` },
    { label: "この回は送らない", data: `adm=nl&n=${issue.no}&v=skip` },
  ];
  for (const id of await adminLineIds()) await pushMessages(id, [textWithQuick(preview.slice(0, 4900), buttons)]);
  console.log(`[Newsletter] 第${issue.no}回の下見を三上様へ（配信先${recipients.length}名）`);
  return { issueNo: issue.no, recipients: recipients.length, preview };
}

function toHtml(text: string): string {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<div style="font-size:15px;line-height:1.8;white-space:pre-wrap">${esc}</div>` +
    `<p style="font-size:12px;color:#888">Threads Studio（株式会社しっとる）からの、ご契約中の方へのお知らせです。</p>`;
}

/**
 * 三上様の「送る／この回は送らない」。二度押しでも1回しか送らない。
 * 返り値は三上様のLINEへお返しする文。
 */
export async function decideNewsletter(issueNo: number, action: "send" | "skip", adminUserId: number): Promise<string> {
  const database = await db.getDb();
  if (!database) return "いまは処理できませんでした。";
  const issue = NEWSLETTER_ISSUES.find((x) => x.no === Number(issueNo));
  if (!issue) return "その回が見つかりませんでした。";
  if (action === "skip") {
    const r: any = await database.execute(sql`UPDATE newsletterIssues SET status = 'skipped', decidedAt = NOW(), decidedBy = ${adminUserId} WHERE issueNo = ${issue.no} AND status = 'pending'`);
    return Number((r as any)[0]?.affectedRows ?? 0) > 0
      ? `第${issue.no}回はお送りしません。来週は第${issue.no + 1}回の下見をお送りします。`
      : "この回はすでに処理ずみです。";
  }
  // ★先に pending → sending（同時に2回押されても、2回目はここで0件になり送らない）
  const upd: any = await database.execute(sql`UPDATE newsletterIssues SET status = 'sending', decidedAt = NOW(), decidedBy = ${adminUserId} WHERE issueNo = ${issue.no} AND status = 'pending'`);
  if (Number((upd as any)[0]?.affectedRows ?? 0) === 0) return "この回はすでに処理ずみです。";

  // ★押した時点で配信先を数え直す（下見のあとに解約・無料へ変わった方を外す）
  const recipients = await listNewsletterRecipients();
  const { pushMessages } = await import("./lineNotify");
  const { textWithQuick } = await import("./lineChat");
  const { sendEmail } = await import("./_core/notification");
  let line = 0, mail = 0, failed = 0, already = 0;
  for (const r of recipients) {
    const lineIds = await db.getLineUserIdsForUser(r.userId).catch(() => [] as string[]);
    const channel = lineIds.length > 0 ? "line" : r.email ? "email" : null;
    if (!channel) { failed++; continue; }
    // 送る前に記録を入れる（一意なので、すでに届いている方には入らない＝送らない）
    const ins: any = await database.execute(sql`INSERT IGNORE INTO newsletterDeliveries (issueNo, userId, channel) VALUES (${issue.no}, ${r.userId}, ${channel})`);
    if (Number((ins as any)[0]?.affectedRows ?? 0) === 0) { already++; continue; }
    const personal = issue.body.includes("{PERSONAL}") ? await personalNoteFor(r.userId).catch(() => "") : "";
    const text = renderIssue(issue, personal);
    let ok = false;
    if (channel === "line") {
      for (const id of lineIds) {
        const msg = issue.buttons?.length ? textWithQuick(text, issue.buttons) : { type: "text", text };
        if (await pushMessages(id, [msg])) ok = true;
      }
    } else {
      ok = await sendEmail({ to: r.email!, subject: `【Threadsを伸ばすコツ 第${issue.no}回】${issue.title}`, html: toHtml(text) }).catch(() => false);
    }
    await database.execute(sql`UPDATE newsletterDeliveries SET ok = ${ok ? 1 : 0} WHERE issueNo = ${issue.no} AND userId = ${r.userId}`);
    if (!ok) failed++; else if (channel === "line") line++; else mail++;
  }
  await database.execute(sql`UPDATE newsletterIssues SET status = 'sent', recipients = ${line + mail} WHERE issueNo = ${issue.no}`);
  console.log(`[Newsletter] 第${issue.no}回を送信 LINE${line}・メール${mail}・失敗${failed}・送信ずみ${already}`);
  return `第${issue.no}回をお送りしました（LINE ${line}名・メール ${mail}名${failed ? `・届かなかった方 ${failed}名` : ""}）。`;
}

/** 週の定例（火曜11:00 JST） */
export async function runNewsletterJob(): Promise<void> {
  const r = await runNewsletterPreview();
  console.log(`[Newsletter] 下見 第${r.issueNo ?? "-"}回・配信先${r.recipients}名`);
}
