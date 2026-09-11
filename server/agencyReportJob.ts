/**
 * 代理店向け：配下クライアントの週次まとめ（月曜 9:05 JST）と、クライアントに異常が出たときの即時連絡。
 * 2026-09-11 三上様「代理店から見える情報がほとんどない」→ 代理店が自分のお客様に説明できる材料を届ける。
 *
 * 送り先：代理店のオーナーLINE（連携済みなら）。無ければ代理店の登録メール。
 */
import * as db from "./db";

type ClientRow = {
  id: number; name: string | null; storeName: string | null; email: string;
  autoPostEnabled: boolean; threadsAccounts: number; lineLinks: number;
  posted7: number; awaiting: number; stoppedAccounts: number; rampNote: string;
};

async function agencyUsers(): Promise<Array<{ id: number; name: string | null; email: string | null }>> {
  const d = await db.getDb();
  if (!d) return [];
  const { sql } = await import("drizzle-orm");
  const rows: any = ((await d.execute(sql`
    SELECT u.id, u.name, u.email FROM users u JOIN subscriptions s ON s.userId = u.id
    WHERE s.planId = 'agency' AND s.status IN ('active','trialing')`)) as any)[0] ?? [];
  return rows.map((r: any) => ({ id: Number(r.id), name: r.name ?? null, email: r.email ?? null }));
}

export async function buildAgencyClientRows(agencyUserId: number): Promise<ClientRow[]> {
  const d = await db.getDb();
  if (!d) return [];
  const { sql } = await import("drizzle-orm");
  const clients = await db.listAgencyClients(agencyUserId);
  const out: ClientRow[] = [];
  for (const c of clients as any[]) {
    const uid = Number(c.id);
    const st: any = ((await d.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM threadsAccounts ta WHERE ta.userId = ${uid} AND ta.isActive = 1) threadsAccounts,
        (SELECT COUNT(*) FROM threadsAccounts ta WHERE ta.userId = ${uid} AND ta.isActive = 1 AND ta.autoPostEnabled = 0) stoppedAccounts,
        (SELECT COUNT(*) FROM userLineLinks l WHERE l.userId = ${uid}) lineLinks,
        (SELECT COUNT(*) FROM scheduledPosts sp WHERE sp.userId = ${uid} AND sp.status = 'posted' AND sp.scheduledAt >= DATE_SUB(NOW(), INTERVAL 7 DAY)) posted7,
        (SELECT COUNT(*) FROM scheduledPosts sp WHERE sp.userId = ${uid} AND sp.status = 'awaiting_approval' AND (sp.angle IS NULL OR sp.angle <> 'pinned')) awaiting`)) as any)[0]?.[0] ?? {};
    let rampNote = "";
    try {
      const accts: any[] = await db.getThreadsAccountsByUserId(uid);
      const first = accts.find((a: any) => a.isActive !== false);
      if (first) {
        const { rampForAccount } = await import("./accountRampCheck");
        const full: any = await db.getThreadsAccountById(Number(first.id));
        const r = full ? await rampForAccount(full, 3) : null;
        if (r?.capped) rampNote = `慣らし運転中（1日${r.count}件）`;
      }
    } catch { rampNote = ""; }
    out.push({
      id: uid, name: c.name ?? null, storeName: c.storeName ?? null, email: String(c.email || ""),
      autoPostEnabled: !!c.autoPostEnabled, threadsAccounts: Number(st.threadsAccounts ?? 0), lineLinks: Number(st.lineLinks ?? 0),
      posted7: Number(st.posted7 ?? 0), awaiting: Number(st.awaiting ?? 0), stoppedAccounts: Number(st.stoppedAccounts ?? 0), rampNote,
    });
  }
  return out;
}

/** 週次まとめの文面（LINE1通に収まる長さ。クライアント20件まで、残りは件数） */
export function renderAgencyWeekly(rows: ClientRow[], dateLabel: string): string {
  const lines: string[] = [`【代理店向け 週次まとめ】${dateLabel}`, `発行済み ${rows.length}件`, ""];
  const shown = rows.slice(0, 20);
  for (const r of shown) {
    const label = r.storeName || r.name || r.email;
    const state = r.threadsAccounts === 0 ? "Threads未連携"
      : r.stoppedAccounts > 0 ? "★自動投稿が止まっています（制限の兆候）"
      : !r.autoPostEnabled ? "自動投稿OFF"
      : r.rampNote || "稼働中";
    const extra = [
      r.lineLinks === 0 ? "LINE未連携" : null,
      r.awaiting > 0 ? `承認待ち${r.awaiting}件` : null,
    ].filter(Boolean).join("・");
    lines.push(`・${label}：この7日 公開${r.posted7}件／${state}${extra ? `／${extra}` : ""}`);
  }
  if (rows.length > shown.length) lines.push(`…ほか${rows.length - shown.length}件`);
  const attention = rows.filter((r) => r.threadsAccounts === 0 || r.stoppedAccounts > 0 || r.lineLinks === 0 || (r.autoPostEnabled && r.posted7 === 0 && r.threadsAccounts > 0));
  lines.push("");
  lines.push(attention.length === 0
    ? "気になる点はありません。全件、投稿が動いています。"
    : `お声がけをおすすめする先：${attention.length}件（Threads未連携・LINE未連携・公開0件・停止のいずれか）。クライアント管理画面からご確認ください。`);
  return lines.join("\n");
}

/** 代理店へ届ける（LINE→メールの順） */
export async function notifyAgency(agencyUserId: number, title: string, text: string): Promise<boolean> {
  try {
    const lineIds = await db.getLineUserIdsForUser(agencyUserId);
    if (lineIds.length > 0) {
      const { pushMessages } = await import("./lineNotify");
      return await pushMessages(lineIds[0], [{ type: "text", text }]);
    }
    const u: any = await db.getUserById(agencyUserId);
    if (u?.email) {
      const { sendEmail } = await import("./_core/notification");
      return await sendEmail({ to: u.email, subject: title, text } as any);
    }
  } catch (e) {
    console.error(`[AgencyReport] 代理店 ${agencyUserId} への連絡に失敗:`, e);
  }
  return false;
}

/** クライアントに異常が出たとき、その代理店へ即時に一言（accountHealthJob から呼ぶ） */
export async function notifyAgencyOfClientIssue(clientUserId: number, text: string): Promise<void> {
  try {
    const client: any = await db.getUserById(clientUserId);
    const agencyId = Number(client?.parentAgencyUserId ?? 0);
    if (!agencyId) return;
    const label = client?.storeName || client?.name || client?.email || `user ${clientUserId}`;
    await notifyAgency(agencyId, `【Threads Studio】クライアント「${label}」について`, `【クライアント「${label}」について】\n${text}`);
  } catch { /* 代理店への連絡失敗で本処理を止めない */ }
}

export async function runAgencyWeeklyReportJob(): Promise<void> {
  const agencies = await agencyUsers();
  if (agencies.length === 0) { console.log("[AgencyReport] 代理店契約なし"); return; }
  const jst = new Date(Date.now() + 9 * 3600 * 1000);
  const dateLabel = `${jst.getUTCMonth() + 1}月${jst.getUTCDate()}日`;
  let sent = 0;
  for (const a of agencies) {
    try {
      const rows = await buildAgencyClientRows(a.id);
      if (rows.length === 0) continue;
      const ok = await notifyAgency(a.id, `【Threads Studio】クライアント週次まとめ ${dateLabel}`, renderAgencyWeekly(rows, dateLabel));
      if (ok) sent++;
    } catch (e) {
      console.error(`[AgencyReport] agency=${a.id} に失敗:`, e);
    }
  }
  console.log(`[AgencyReport] 送信 ${sent}/${agencies.length}`);
}
