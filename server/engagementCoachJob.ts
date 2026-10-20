/**
 * 毎日5分の「交流」の案内を、毎朝 公式LINEへ1通（shared/engagementCoach.ts・2026-10-20）。
 *  - 対象は ENGAGEMENT_COACH.mode に従う（最初は運営の学習用アカウントの持ち主だけ）
 *  - 1日1つ。「やった」で次へ・「いらない」で止まる。3日続けて「やった」が無ければ3日おきに減らす
 *  - 押す作業はお客様自身（いいね・フォロー・「興味なし」はAPIでも自動でもやらない）
 */
import * as db from "./db";

const ymdJst = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);

export async function buildCoachMessage(userId: number, step: number): Promise<unknown[] | null> {
  const { stepForDay, fill, searchUrl, worryWordFor, bizWordFor, cityWordFor, COACH_NG, ROTATION } = await import("../shared/engagementCoach");
  const { textWithQuick } = await import("./lineChat");
  const projects = ((await db.getUserProjects(userId)) || []).filter((p: any) => !String(p.id).startsWith("demo_") && p.businessType);
  const p: any = projects[0];
  if (!p) return null;
  const v = { area: cityWordFor(p.area), worry: worryWordFor(p.businessType), biz: bizWordFor(p.businessType) };
  const s = stepForDay(step);
  const text =
    `今日の交流（5分）　${(step % ROTATION.length) + 1}/${ROTATION.length}\n` +
    `「${fill(s.title, v)}」\n\n${fill(s.body, v)}\n\n${COACH_NG}`;
  const items: { label: string; data?: string; uri?: string }[] = [];
  if (s.link === "search") items.push({ label: "Threadsで探す", uri: searchUrl(v.area, v.worry) });
  if (s.link === "home") items.push({ label: "Threadsを開く", uri: "https://www.threads.com/?openExternalBrowser=1" });
  items.push({ label: "やった", data: "ec=done" }, { label: "今日はとばす", data: "ec=skip" }, { label: "この案内はいらない", data: "ec=off" });
  // URIのボタンは textWithQuick が扱えないため、URIだけ別の形で足す
  const msg: any = textWithQuick(text, items.filter((i) => i.data).map((i) => ({ label: i.label, data: i.data! })));
  const uri = items.find((i) => i.uri);
  if (uri && msg?.quickReply?.items) {
    msg.quickReply.items.unshift({ type: "action", action: { type: "uri", label: uri.label, uri: uri.uri } });
  }
  return [msg];
}

export async function runEngagementCoachJob(now: Date = new Date()): Promise<{ sent: number; skipped: number }> {
  if (process.env.QA_SAFE_MODE === "1") return { sent: 0, skipped: 0 };
  const { isCoachTarget, shouldSendToday } = await import("../shared/engagementCoach");
  const { pushMessages } = await import("./lineNotify");
  const d: any = await db.getDb();
  if (!d) return { sent: 0, skipped: 0 };
  const { sql } = await import("drizzle-orm");
  // LINE連携があり、自動投稿が使える契約の会員。最初の連携日はアカウントの作成日の最小
  const rows: any[] = ((await d.execute(sql`
    SELECT u.id uid, l.lineUserId lid, u.engagementCoachEnabled en, u.engagementCoachLastAt lastAt, u.engagementCoachMiss miss, u.engagementCoachStep step,
           (SELECT MIN(a.createdAt) FROM threadsAccounts a WHERE a.userId=u.id AND a.isActive=1) firstAt
    FROM users u JOIN userLineLinks l ON l.userId=u.id`)) as any)[0];
  const today = ymdJst(now);
  let sent = 0, skipped = 0;
  for (const r of rows) {
    const uid = Number(r.uid);
    if (!isCoachTarget(uid, r.firstAt ? new Date(r.firstAt) : null, now.getTime())) continue;
    if (!(await db.hasServiceAccess(uid).catch(() => false))) continue;
    const lastYmd = r.lastAt ? ymdJst(new Date(r.lastAt)) : null;
    if (!shouldSendToday({ enabled: Number(r.en) === 1, lastSentYmd: lastYmd, missStreak: Number(r.miss) }, today)) { skipped++; continue; }
    const msgs = await buildCoachMessage(uid, Number(r.step));
    if (!msgs) { skipped++; continue; }
    const ok = await pushMessages(String(r.lid), msgs);
    if (!ok) { skipped++; continue; }
    // 送った時点で「やった」が無い回数を1つ増やす（「やった」を押すと0に戻る）
    await d.execute(sql`UPDATE users SET engagementCoachLastAt=${now}, engagementCoachMiss=engagementCoachMiss+1 WHERE id=${uid}`);
    sent++;
  }
  console.log(`[EngagementCoach] 交流の案内：${sent}件送信・${skipped}件とばし`);
  return { sent, skipped };
}

/** 公式LINEのボタン（ec=done/skip/off/on）の処理 */
export async function handleCoachPostback(userId: number, action: string): Promise<string> {
  const d: any = await db.getDb();
  const { sql } = await import("drizzle-orm");
  if (action === "done") {
    await d.execute(sql`UPDATE users SET engagementCoachMiss=0, engagementCoachStep=engagementCoachStep+1 WHERE id=${userId}`);
    return "おつかれさまです。明日は別の1つをお送りします。\n続けるほど、Threadsが「何のアカウントか」を覚えて、同じ話題の人に届きやすくなります。";
  }
  if (action === "skip") {
    await d.execute(sql`UPDATE users SET engagementCoachStep=engagementCoachStep+1 WHERE id=${userId}`);
    return "わかりました。明日は別の1つをお送りします。";
  }
  if (action === "off") {
    await d.execute(sql`UPDATE users SET engagementCoachEnabled=0 WHERE id=${userId}`);
    return "交流の案内を止めました。また受け取りたいときは「設定」の「交流の案内を受け取る」を押してください。";
  }
  if (action === "on") {
    await d.execute(sql`UPDATE users SET engagementCoachEnabled=1, engagementCoachMiss=0 WHERE id=${userId}`);
    return "交流の案内を再開しました。明日の朝から、毎日5分でできることを1つお送りします。";
  }
  return "操作を読み取れませんでした。";
}
