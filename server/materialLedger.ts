/**
 * ネタ帳のDB側（2026-09-30 三上様指示）。判断は shared/materialLedger.ts。
 *
 *  - 生成：pickLedgerItem で使える状態のネタを1件選ぶ → 投稿に materialItemId を記録
 *  - 使った記録：scheduledPosts.materialItemId だけで持つ（回数の列は持たない＝ずれない）
 *  - フォーム：署名つきリンク（ログイン不要）で、お客様ご本人がネタ・NGワード・お手本・締め方を入れる
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import * as db from "./db";
import {
  pickNextItem, ledgerStatus, itemsFromForm, mergeNgWords, prependStyleSample, normalizeMaterial,
  type LedgerItem, type ItemUsage, type MaterialFormInput, type LedgerStatus, type MaterialKind,
} from "../shared/materialLedger";

const rowsOf = (r: any): any[] => ((r as any)?.[0] ?? []) as any[];

export async function listActiveItems(projectId: string): Promise<LedgerItem[]> {
  const database = await db.getDb();
  if (!database) return [];
  const rows = rowsOf(await database.execute(sql`
    SELECT id, kind, content, source, createdAt FROM materialItems
    WHERE projectId = ${projectId} AND status = 'active' ORDER BY id`));
  return rows.map((r) => ({ id: Number(r.id), kind: String(r.kind), content: String(r.content), source: r.source, createdAt: r.createdAt }));
}

export async function getItemUsage(itemIds: readonly number[]): Promise<ItemUsage[]> {
  if (itemIds.length === 0) return [];
  const database = await db.getDb();
  if (!database) return [];
  const rows = rowsOf(await database.execute(sql`
    SELECT materialItemId AS itemId,
      MAX(CASE WHEN status IN ('posted','pending','awaiting_approval','processing') THEN scheduledAt END) AS lastUsedAt,
      MAX(CASE WHEN clientRating = 'bad' THEN COALESCE(ratedAt, updatedAt) END) AS lastDeclinedAt
    FROM scheduledPosts
    WHERE materialItemId IN (${sql.join(itemIds.map((i) => sql`${i}`), sql`, `)})
    GROUP BY materialItemId`));
  return rows.map((r) => ({ itemId: Number(r.itemId), lastUsedAt: r.lastUsedAt ?? null, lastDeclinedAt: r.lastDeclinedAt ?? null }));
}

/**
 * 今日の1本に使うネタを選ぶ。ネタ帳が無い方は null（今までどおりの生成）。
 * @returns item＝使うネタ（無ければ null）／ledgerContents＝ネタ帳にある全ネタの本文（はじめの設定の答えから外すため）
 */
export async function pickLedgerItem(projectId: string, avoidWords: readonly string[] = []): Promise<{ item: LedgerItem | null; ledgerContents: string[] } | null> {
  const items = await listActiveItems(projectId);
  if (items.length === 0) return null;
  const usage = await getItemUsage(items.map((i) => i.id));
  // NGワード・見送られた主役の言葉を含むネタは今日は選ばない（書けば作り直しになるだけ）
  const avoid = avoidWords.map(normalizeMaterial).filter((w) => w.length >= 2);
  const skipIds = items.filter((i) => avoid.some((w) => normalizeMaterial(i.content).includes(w))).map((i) => i.id);
  return { item: pickNextItem(items, usage, new Date(), skipIds), ledgerContents: items.map((i) => i.content) };
}

export async function getLedgerStatus(projectId: string): Promise<LedgerStatus> {
  const items = await listActiveItems(projectId);
  const usage = await getItemUsage(items.map((i) => i.id));
  return ledgerStatus(items, usage);
}

export async function addItems(userId: number, projectId: string, items: Array<{ kind: MaterialKind; content: string }>, source: string): Promise<number> {
  const database = await db.getDb();
  if (!database || items.length === 0) return 0;
  for (const it of items) {
    await database.execute(sql`
      INSERT INTO materialItems (userId, projectId, kind, content, source, status)
      VALUES (${userId}, ${projectId}, ${it.kind}, ${it.content}, ${source}, 'active')`);
  }
  return items.length;
}

/** はじめの設定の体験談・よくある質問を、ネタ帳へ移す（ネタ帳が空のときだけ・初回のフォーム送信時） */
export function counselingItems(counselingResult: any): Array<{ kind: MaterialKind; content: string }> {
  const cr = counselingResult || {};
  const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean) : []);
  return itemsFromForm({ episodes: list(cr.realEpisodes), faqs: list(cr.faq).map((q) => ({ q })) });
}

// ==================== フォームのリンク（ログイン不要・署名つき） ====================

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is not configured");
  return s;
}

export function createMaterialFormToken(projectId: string, now: number = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ p: projectId, t: now, k: "neta" }), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/** リンクの有効期限は90日（何度でも送り直せる） */
export function verifyMaterialFormToken(token: string, maxAgeMs: number = 90 * 86400000): string | null {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  const expect = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(expect), b = Buffer.from(sig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (p?.k !== "neta" || !p?.p || !p?.t || Date.now() - Number(p.t) > maxAgeMs) return null;
    return String(p.p);
  } catch { return null; }
}

export function materialFormUrl(projectId: string): string {
  const base = process.env.APP_BASE_URL || "https://threads-studio.com";
  return `${base}/neta?t=${createMaterialFormToken(projectId)}`;
}

// ==================== フォームの送信 ====================

export interface FormResult {
  added: number;
  moved: number;
  ngAdded: boolean;
  styleAdded: boolean;
  closing: string | null;
  status: LedgerStatus;
}

const SKIP_CODES = new Set(["same", "claim", "tone", "length"]);

export async function submitMaterialForm(projectId: string, input: MaterialFormInput): Promise<FormResult> {
  const project: any = await db.getProjectById(projectId);
  if (!project) throw new Error("project not found");
  const userId = Number(project.userId);

  // 1. はじめの設定の体験談・よくある質問を、初回だけネタ帳へ移す（フォームの答えと同じ扱いで回すため）
  let moved = 0;
  const existing = await listActiveItems(projectId);
  if (existing.length === 0) {
    let cr: any = null;
    try { cr = project.counselingResult ? JSON.parse(project.counselingResult) : null; } catch { cr = null; }
    moved = await addItems(userId, projectId, counselingItems(cr), "counseling");
  }
  // 2. フォームの答え（すでにあるものは足さない）
  const all = moved > 0 ? await listActiveItems(projectId) : existing;
  const added = await addItems(userId, projectId, itemsFromForm(input, all), "form");

  // 3. NGワード・お手本・締め方
  const patch: any = {};
  const ng = mergeNgWords(project.ngWords, input.ngWords);
  const ngAdded = Boolean(String(input.ngWords ?? "").trim()) && ng !== mergeNgWords(project.ngWords, "");
  if (ngAdded) patch.ngWords = ng;
  const style = prependStyleSample(project.styleSamples, input.styleSample);
  const styleAdded = style !== String(project.styleSamples ?? "").trim();
  if (styleAdded) patch.styleSamples = style;
  let closing: string | null = null;
  if (input.closing === "statement" || input.closing === "question" || input.closing === "any") {
    let cr: any = {};
    try { cr = project.counselingResult ? JSON.parse(project.counselingResult) : {}; } catch { cr = {}; }
    cr.closingStyle = input.closing;
    patch.counselingResult = JSON.stringify(cr);
    closing = input.closing;
  }
  if (Object.keys(patch).length > 0) await db.updateProject(projectId, patch);

  // 4. 合わなかったところ（見送りの理由と同じ扱いで、翌朝の生成の最優先の指示に入る）
  const reasons = (input.dislikes ?? []).filter((r) => SKIP_CODES.has(r));
  const text = String(input.dislikeText ?? "").trim().slice(0, 500);
  if (reasons.length > 0 || text) {
    const database = await db.getDb();
    const accounts: any[] = await db.getThreadsAccountsByUserId(userId).catch(() => []);
    const targets = accounts.filter((a) => a.isActive && (!a.defaultProjectId || String(a.defaultProjectId) === projectId));
    if (database) for (const a of targets) {
      for (const r of reasons) await database.execute(sql`INSERT INTO postSkipFeedback (userId, threadsAccountId, reason) VALUES (${userId}, ${a.id}, ${r})`);
      if (text) await database.execute(sql`INSERT INTO postSkipFeedback (userId, threadsAccountId, reason, reasonText) VALUES (${userId}, ${a.id}, 'text', ${text})`);
    }
  }

  const status = await getLedgerStatus(projectId);
  // 5. 三上様へ（何が変わったか）
  try {
    const { notifyOwner } = await import("./_core/notification");
    await notifyOwner({
      title: `ネタ帳フォームの回答：${project.storeName || projectId}`,
      content: [
        `ネタを${added}件追加（はじめの設定から${moved}件を移した）`,
        ngAdded ? `NGワードを追加：${String(input.ngWords ?? "").trim()}` : "",
        styleAdded ? "文体のお手本を先頭に追加" : "",
        closing ? `締め方：${closing === "statement" ? "言い切る" : closing === "question" ? "問いかけ" : "どちらでも"}` : "",
        reasons.length || text ? `合わなかったところ：${reasons.join(",")}${text ? ` 「${text.slice(0, 80)}」` : ""}` : "",
        `いま使えるネタ ${status.available}件／休み中 ${status.cooling}件／見送り ${status.declined}件`,
      ].filter(Boolean).join("\n"),
    });
  } catch (e) { console.warn("[MaterialForm] 運営への通知に失敗:", (e as Error)?.message); }
  console.log(`[MaterialForm] project=${projectId} 追加${added} 移動${moved} ng=${ngAdded} style=${styleAdded} closing=${closing ?? "-"}`);
  return { added, moved, ngAdded, styleAdded, closing, status };
}
