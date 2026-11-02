/**
 * 「できるようになったこと」の週1回のお知らせ（2026-11-02 三上様）。判断と文面は shared/featureUpdates.ts。
 *
 * 毎週水曜11:30（JST）：
 *   1. 台帳のうち、本番で動いたことを確かめた（verifiedAt あり）・まだ送っていない項目を集める。0件の週は何もしない
 *   2. 三上様の公式LINEへ下見（項目の一覧・配信先の人数・お客様に届く文の見え方ごとの全文）を送る
 *      ボタン：「この内容で送る」／「今週は送らない」（来週に持ち越す）／「この項目は出さない」（今後も出さない）
 *   3. 三上様が「この内容で送る」を押した時だけ、配信先を数え直して送る
 * ★お客様へは自動で送らない（相手に届く送信は毎回三上様の承諾を得る）。押されなければ、来週の下見にもう一度入る。
 * 配信先は読み物と同じ（listNewsletterRecipients：有料・ご契約中・「不要」の方を除く）。LINEがあればLINE、無ければメール。
 * お一人ずつ、当てはまる項目（when）だけ。同じ項目を同じ方へ2回送らない（featureUpdateDeliveries が一意）。
 */
import { sql } from "drizzle-orm";
import * as db from "./db";
import {
  FEATURE_UPDATES, adminPreviewHead, contextLabel, pendingUpdates, renderFeatureUpdates, updatesFor,
  type FeatureUpdate, type FeatureUpdateContext, type PreviewVariant,
} from "@shared/featureUpdates";

const rowsOf = (r: any): any[] => ((r as any)?.[0] ?? []) as any[];
const affected = (r: any): number => Number((r as any)?.[0]?.affectedRows ?? 0);

async function adminLineIds(): Promise<string[]> {
  const database = await db.getDb();
  if (!database) return [];
  const rows: any = await database.execute(sql`SELECT id FROM users WHERE role = 'admin'`);
  const ids: string[] = [];
  for (const r of rowsOf(rows)) ids.push(...(await db.getLineUserIdsForUser(Number(r.id)).catch(() => [])));
  return Array.from(new Set(ids));
}

/** 週の印（下見を出した日・JST の YYYYMMDD）。古い下見のボタンを見分けるのに使う */
export function batchKeyFor(now = Date.now()): string {
  return new Date(now + 9 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "");
}

/** 項目ごとの状態（行が無い項目は、まだ一度も下見に出していない） */
async function itemStates(): Promise<Map<string, { status: string; batchKey: string | null; previewedAt: Date | null }>> {
  const database = await db.getDb();
  const out = new Map<string, { status: string; batchKey: string | null; previewedAt: Date | null }>();
  if (!database) return out;
  const rows: any = await database.execute(sql`SELECT itemId, status, batchKey, previewedAt FROM featureUpdateItems`);
  for (const r of rowsOf(rows)) out.set(String(r.itemId), { status: String(r.status), batchKey: r.batchKey ? String(r.batchKey) : null, previewedAt: r.previewedAt ? new Date(r.previewedAt) : null });
  return out;
}

interface Target { userId: number; email: string | null; lineIds: string[]; ctx: FeatureUpdateContext; delivered: Set<string> }

/** 配信先と、お一人ずつの状況（送る直前にも呼び直す） */
async function listTargets(): Promise<Target[]> {
  const database = await db.getDb();
  if (!database) return [];
  const { listNewsletterRecipients } = await import("./newsletter");
  const { getPlan, resolveEffectivePlanId } = await import("@shared/plans");
  const recipients = await listNewsletterRecipients();
  const dRows: any = await database.execute(sql`SELECT itemId, userId FROM featureUpdateDeliveries`).catch(() => [[]]);
  const delivered = new Map<number, Set<string>>();
  for (const r of rowsOf(dRows)) {
    const id = Number(r.userId);
    delivered.set(id, (delivered.get(id) ?? new Set<string>()).add(String(r.itemId)));
  }
  const out: Target[] = [];
  for (const r of recipients) {
    const user: any = await db.getUserById(r.userId).catch(() => null);
    const sub: any = await db.getSubscriptionByUserId(r.userId).catch(() => null);
    const planId = resolveEffectivePlanId(sub?.planId, sub?.status);
    const lineIds = await db.getLineUserIdsForUser(r.userId).catch(() => [] as string[]);
    out.push({
      userId: r.userId,
      email: r.email,
      lineIds,
      ctx: {
        planId,
        maxPerDay: Number(getPlan(planId)?.features?.maxAutoPostsPerDay ?? 0),
        requireApproval: user?.autoPostRequireApproval !== false,
        hasLine: lineIds.length > 0,
      },
      delivered: delivered.get(r.userId) ?? new Set<string>(),
    });
  }
  return out;
}

/** 見え方ごとにまとめる（同じ文になる方を1つに数える） */
function variantsOf(items: readonly FeatureUpdate[], targets: readonly Target[]): { variants: PreviewVariant[]; nothingFor: number } {
  const byText = new Map<string, { labels: Set<string>; count: number }>();
  let nothingFor = 0;
  for (const t of targets) {
    const mine = updatesFor(items, t.ctx, t.delivered);
    const text = renderFeatureUpdates(mine, t.ctx.hasLine ? "line" : "email");
    if (!text) { nothingFor++; continue; }
    const v = byText.get(text) ?? { labels: new Set<string>(), count: 0 };
    v.labels.add(contextLabel(t.ctx));
    v.count++;
    byText.set(text, v);
  }
  const variants = Array.from(byText.entries())
    .map(([text, v]) => ({ label: Array.from(v.labels).join("／"), count: v.count, text }))
    .sort((a, b) => b.count - a.count);
  return { variants, nothingFor };
}

/**
 * 週の定例：まだ送っていない確かめずみの項目の下見を三上様へ。
 * 0件の週は何もしない。判断待ちの下見がまだ新しければ（6日以内）出し直さない。
 */
export async function runFeatureUpdatesPreview(opts: { dryRun?: boolean; now?: number } = {}): Promise<{ batchKey: string | null; items: string[]; recipients: number; messages: string[] }> {
  const database = await db.getDb();
  const none = { batchKey: null, items: [] as string[], recipients: 0, messages: [] as string[] };
  if (!database) return none;
  const now = opts.now ?? Date.now();
  const states = await itemStates();
  const closed = new Set(Array.from(states.entries()).filter(([, s]) => s.status === "sent" || s.status === "sending" || s.status === "dropped").map(([id]) => id));
  const items = pendingUpdates(closed, FEATURE_UPDATES);
  if (items.length === 0) {
    console.log("[FeatureUpdates] 今週お知らせする項目なし（下見は出さない）");
    return none;
  }
  const fresh = items.filter((u) => {
    const s = states.get(u.id);
    return s?.status === "pending" && s.previewedAt && now - s.previewedAt.getTime() < 6 * 86400_000;
  });
  if (fresh.length > 0 && !opts.dryRun) {
    console.log(`[FeatureUpdates] 判断待ちの下見あり（${fresh.map((u) => u.id).join(",")}）`);
    return { ...none, items: fresh.map((u) => u.id) };
  }

  const targets = await listTargets();
  const { variants, nothingFor } = variantsOf(items, targets);
  if (variants.length === 0) {
    console.log(`[FeatureUpdates] 項目はあるが、当てはまる配信先が0名（下見は出さない）：${items.map((u) => u.id).join(",")}`);
    return { ...none, items: items.map((u) => u.id) };
  }
  const key = batchKeyFor(now);
  const head = adminPreviewHead(items, targets.length - nothingFor, variants, nothingFor);
  // 吹き出しは1回に5つまで：1つ目＝まとめ、2〜4つ目＝多い順に3通りの全文、5つ目＝ボタン
  const shown = variants.slice(0, 3);
  const bodies = shown.map((v, i) => `【届く文 ${i + 1}／${variants.length}】${v.label}（${v.count}名）\n\n${v.text}`);
  const rest = variants.length > shown.length ? `\n（ほかに${variants.length - shown.length}通りあります。項目の組み合わせが違うだけで、文の書き方は同じです）` : "";
  const ask = `この内容で、${targets.length - nothingFor}名にお送りしてよいですか？${rest}\n\n「今週は送らない」は来週の下見に持ち越します。「この項目は出さない」は、今週の項目を今後も出しません。`;
  const messages = [head, ...bodies, ask];
  if (opts.dryRun) return { batchKey: key, items: items.map((u) => u.id), recipients: targets.length - nothingFor, messages };

  for (const u of items) {
    await database.execute(sql`
      INSERT INTO featureUpdateItems (itemId, status, batchKey, previewedAt) VALUES (${u.id}, 'pending', ${key}, NOW())
      ON DUPLICATE KEY UPDATE status = 'pending', batchKey = ${key}, previewedAt = NOW()`);
  }
  const { pushMessages } = await import("./lineNotify");
  const { textWithQuick } = await import("./lineChat");
  const buttons = [
    { label: "この内容で送る", data: `adm=fu&k=${key}&v=send` },
    { label: "今週は送らない", data: `adm=fu&k=${key}&v=skip` },
    { label: "この項目は出さない", data: `adm=fu&k=${key}&v=drop` },
  ];
  const msgs = [...messages.slice(0, -1).map((t) => ({ type: "text", text: t.slice(0, 4900) })), textWithQuick(ask.slice(0, 4900), buttons)];
  for (const id of await adminLineIds()) await pushMessages(id, msgs);
  console.log(`[FeatureUpdates] 下見 ${key}：${items.length}件（${items.map((u) => u.id).join(",")}）・配信先${targets.length - nothingFor}名・${variants.length}通り`);
  return { batchKey: key, items: items.map((u) => u.id), recipients: targets.length - nothingFor, messages };
}

function toHtml(text: string): string {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<div style="font-size:15px;line-height:1.8;white-space:pre-wrap">${esc}</div>` +
    `<p style="font-size:12px;color:#888">Threads Studio（株式会社しっとる）からの、ご契約中の方へのお知らせです。</p>`;
}

/**
 * 三上様の「この内容で送る／今週は送らない／この項目は出さない」。二度押しでも1回しか送らない。
 * 返り値は三上様のLINEへお返しする文。
 */
export async function decideFeatureUpdates(batchKey: string, action: "send" | "skip" | "drop", adminUserId: number): Promise<string> {
  const database = await db.getDb();
  if (!database) return "いまは処理できませんでした。";
  const key = String(batchKey).replace(/[^0-9]/g, "").slice(0, 20);
  if (!key) return "うまく受け取れませんでした。";
  const known = new Set(FEATURE_UPDATES.map((u) => u.id));

  if (action === "skip" || action === "drop") {
    const next = action === "skip" ? "held" : "dropped";
    const r: any = await database.execute(sql`
      UPDATE featureUpdateItems SET status = ${next}, decidedAt = NOW(), decidedBy = ${adminUserId}
      WHERE batchKey = ${key} AND status = 'pending'`);
    if (affected(r) === 0) return "この下見はすでに処理ずみか、新しい下見に置き換わっています。";
    return action === "skip"
      ? "今週はお送りしません。この項目は、来週の下見にもう一度入れます。"
      : "この項目は、今後のお知らせに出しません。";
  }

  // ★先に pending → sending（同時に2回押されても、2回目はここで0件になり送らない）
  const upd: any = await database.execute(sql`
    UPDATE featureUpdateItems SET status = 'sending', decidedAt = NOW(), decidedBy = ${adminUserId}
    WHERE batchKey = ${key} AND status = 'pending'`);
  if (affected(upd) === 0) return "この下見はすでに処理ずみか、新しい下見に置き換わっています。";
  const rows: any = await database.execute(sql`SELECT itemId FROM featureUpdateItems WHERE batchKey = ${key} AND status = 'sending'`);
  const ids = new Set(rowsOf(rows).map((r) => String(r.itemId)).filter((id) => known.has(id)));
  const items = FEATURE_UPDATES.filter((u) => ids.has(u.id));

  // ★押した時点で配信先を数え直す（下見のあとに解約・無料へ変わった方を外す）
  const targets = await listTargets();
  const { pushMessages } = await import("./lineNotify");
  const { sendEmail } = await import("./_core/notification");
  let line = 0, mail = 0, failed = 0, nothing = 0;
  for (const t of targets) {
    const channel = t.lineIds.length > 0 ? "line" : t.email ? "email" : null;
    if (!channel) { failed++; continue; }
    const candidates = updatesFor(items, t.ctx, t.delivered);
    // 送る前に記録を入れる（一意なので、すでに届いている項目は入らない＝送らない）
    const mine: FeatureUpdate[] = [];
    for (const u of candidates) {
      const ins: any = await database.execute(sql`
        INSERT IGNORE INTO featureUpdateDeliveries (itemId, userId, batchKey, channel) VALUES (${u.id}, ${t.userId}, ${key}, ${channel})`);
      if (affected(ins) > 0) mine.push(u);
    }
    const text = renderFeatureUpdates(mine, channel);
    if (!text) { nothing++; continue; }
    let ok = false;
    if (channel === "line") {
      for (const id of t.lineIds) if (await pushMessages(id, [{ type: "text", text }])) ok = true;
    } else {
      ok = await sendEmail({ to: t.email!, subject: "【Threads Studio】できるようになったこと", html: toHtml(text) }).catch(() => false);
    }
    for (const u of mine) {
      await database.execute(sql`UPDATE featureUpdateDeliveries SET ok = ${ok ? 1 : 0} WHERE itemId = ${u.id} AND userId = ${t.userId}`);
    }
    if (!ok) failed++; else if (channel === "line") line++; else mail++;
  }
  await database.execute(sql`UPDATE featureUpdateItems SET status = 'sent' WHERE batchKey = ${key} AND status = 'sending'`);
  console.log(`[FeatureUpdates] ${key} を送信 LINE${line}・メール${mail}・失敗${failed}・該当なし${nothing}`);
  return `「できるようになったこと」をお送りしました（LINE ${line}名・メール ${mail}名${failed ? `・届かなかった方 ${failed}名` : ""}）。`;
}

/** 週の定例（水曜11:30 JST） */
export async function runFeatureUpdatesJob(): Promise<void> {
  const r = await runFeatureUpdatesPreview();
  console.log(`[FeatureUpdates] 下見 ${r.batchKey ?? "-"}・${r.items.length}件・配信先${r.recipients}名`);
}
