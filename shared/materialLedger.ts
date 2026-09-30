/**
 * ネタ帳（2026-09-30 三上様指示「解決できる仕組みを考えて作って」）。
 *
 * > 「フォームで聞く際に、クライアントから何度も同じ情報が投稿されてしまうという問題は、きちんと解決できますか？」
 *
 * ★なぜ今までの作りでは繰り返したか（9/30 コードで確認）
 *   はじめの設定の体験談・よくある質問は、毎回の生成に「全部まとめて」渡していた。どれを使うかはAI任せで、
 *   どの話を何日に使ったかは記録していない。使ったかどうかは直近10本との言葉の重なりで推し量るだけなので、
 *   10本より前に流れる・言い換えられると、同じ話がまた選ばれる（プレステージ様の「先輩・未経験」が何十回も出た形）。
 *
 * ★この仕組み
 *   1. お客様に教えていただいた話を1件ずつ「ネタ」として持つ（materialItems）
 *   2. 1本の投稿には、使える状態のネタを1件だけ渡す（全部は渡さない）
 *   3. どのネタから作ったかを投稿に記録する（scheduledPosts.materialItemId）＝推し量らない
 *   4. 使ったネタは休ませる（話30日・質問14日・話題21日）。見送られたネタは60日使わない
 *   5. 使えるネタが無くなったら、朝の点検に「ネタ切れ」と出す（お客様への連絡は三上様の承諾で）
 *
 * ここは判断だけ（DBに触らない）。DBは server/materialLedger.ts。
 */

export type MaterialKind = "episode" | "faq" | "topic";

export const MATERIAL_KIND_LABEL: Record<MaterialKind, string> = {
  episode: "実際にあった話",
  faq: "よくある質問",
  topic: "書いてほしい話題",
};

/** 一度使ったネタを休ませる日数 */
export const COOLDOWN_DAYS: Record<MaterialKind, number> = { episode: 30, faq: 14, topic: 21 };
/** 見送られたネタを使わない日数 */
export const DECLINE_PAUSE_DAYS = 60;

export interface LedgerItem {
  id: number;
  kind: MaterialKind | string;
  content: string;
  source?: string | null;
  createdAt: Date | string;
}

export interface ItemUsage {
  itemId: number;
  /** 公開済み・公開待ち・承認待ちの投稿に使った最後の予定時刻 */
  lastUsedAt: Date | string | null;
  /** 見送られた（✕）最後の日時 */
  lastDeclinedAt: Date | string | null;
}

const DAY = 86400000;
const t = (d: Date | string | null | undefined) => (d ? new Date(d).getTime() : NaN);

function cooldownOf(kind: string): number {
  return COOLDOWN_DAYS[(kind as MaterialKind)] ?? COOLDOWN_DAYS.topic;
}

/** そのネタが今使えるか。使えないなら、いつから使えるか */
export function availability(item: LedgerItem, usage: ItemUsage | undefined, now: Date = new Date()): { ok: boolean; freeAt: number | null; reason: "new" | "rested" | "cooling" | "declined" } {
  const declined = t(usage?.lastDeclinedAt);
  if (Number.isFinite(declined) && now.getTime() - declined < DECLINE_PAUSE_DAYS * DAY) {
    return { ok: false, freeAt: declined + DECLINE_PAUSE_DAYS * DAY, reason: "declined" };
  }
  const used = t(usage?.lastUsedAt);
  if (!Number.isFinite(used)) return { ok: true, freeAt: null, reason: "new" };
  const free = used + cooldownOf(String(item.kind)) * DAY;
  // 予定時刻が先（公開待ち）でも「使った」に数える
  if (now.getTime() < free) return { ok: false, freeAt: free, reason: "cooling" };
  return { ok: true, freeAt: null, reason: "rested" };
}

/**
 * 次に使うネタを1件選ぶ。
 *   まだ一度も使っていないネタ（フォームで教えていただいたものを先に・古い順）→ 休みが明けたネタ（最後に使ったのが古い順）。
 * @param skipIds 同じ回の生成ですでに選んだネタ（3案などで同じネタが重ならないように）
 */
export function pickNextItem(
  items: readonly LedgerItem[],
  usage: readonly ItemUsage[],
  now: Date = new Date(),
  skipIds: readonly number[] = [],
): LedgerItem | null {
  const byId = new Map(usage.map((u) => [u.itemId, u]));
  const cands = items
    .filter((i) => !skipIds.includes(i.id))
    .map((i) => ({ i, a: availability(i, byId.get(i.id), now), used: t(byId.get(i.id)?.lastUsedAt) }))
    .filter((x) => x.a.ok);
  if (cands.length === 0) return null;
  const fresh = cands.filter((x) => x.a.reason === "new");
  if (fresh.length > 0) {
    fresh.sort((a, b) =>
      (a.i.source === "form" ? 0 : 1) - (b.i.source === "form" ? 0 : 1) ||
      t(a.i.createdAt) - t(b.i.createdAt) || a.i.id - b.i.id);
    return fresh[0].i;
  }
  cands.sort((a, b) => a.used - b.used || a.i.id - b.i.id);
  return cands[0].i;
}

export interface LedgerStatus {
  total: number;
  available: number;
  cooling: number;
  declined: number;
  /** 使えるネタが0件のとき、次に使えるようになる日時 */
  nextFreeAt: Date | null;
}

/** ネタ帳の残り（朝の点検・フォームの画面で使う） */
export function ledgerStatus(items: readonly LedgerItem[], usage: readonly ItemUsage[], now: Date = new Date()): LedgerStatus {
  const byId = new Map(usage.map((u) => [u.itemId, u]));
  let available = 0, cooling = 0, declined = 0; let next = Infinity;
  for (const i of items) {
    const a = availability(i, byId.get(i.id), now);
    if (a.ok) available++;
    else if (a.reason === "declined") declined++;
    else cooling++;
    if (!a.ok && a.freeAt != null) next = Math.min(next, a.freeAt);
  }
  return { total: items.length, available, cooling, declined, nextFreeAt: available === 0 && Number.isFinite(next) ? new Date(next) : null };
}

/** 生成に足す指示（今日のネタ1件） */
export function buildMaterialNote(item: LedgerItem): string {
  const label = MATERIAL_KIND_LABEL[item.kind as MaterialKind] ?? "話題";
  return `\n\n【★今日のネタ（必須・オーナーご本人が教えてくださったこと）】\n` +
    `- 種類：${label}\n- 内容：「${item.content}」\n` +
    `- この1件だけを主役にして書く。ほかの体験談・よくある質問・実績は使わない。\n` +
    `- 書いてある事実だけを使い、足さない・言い換えで意味を変えない。答えがある話は、答えまで本文に書く。`;
}

// ==================== フォームの答え → ネタ ====================

export type ClosingStyle = "question" | "statement" | "any";

export interface MaterialFormInput {
  /** 最近の案で合わなかったところ（same / claim / tone / length） */
  dislikes?: string[];
  dislikeText?: string;
  episodes?: string[];
  faqs?: Array<{ q: string; a?: string }>;
  topics?: string[];
  ngWords?: string;
  styleSample?: string;
  closing?: ClosingStyle;
}

export const MATERIAL_MAX_LEN = 300;

/** 比べるための正規化（空白・句読点・記号を落とす） */
export function normalizeMaterial(s: string): string {
  return String(s ?? "")
    .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[\s　、。，．,.!！?？「」『』（）()・:：\-ー〜~]/g, "")
    .toLowerCase();
}

/** フォームの答えから新しいネタを作る（空欄・短すぎるもの・すでにあるものは作らない） */
export function itemsFromForm(input: MaterialFormInput, existing: readonly { content: string }[] = []): Array<{ kind: MaterialKind; content: string }> {
  const seen = new Set(existing.map((e) => normalizeMaterial(e.content)));
  const out: Array<{ kind: MaterialKind; content: string }> = [];
  const add = (kind: MaterialKind, raw: string) => {
    const content = String(raw ?? "").replace(/\r\n/g, "\n").trim().slice(0, MATERIAL_MAX_LEN);
    const key = normalizeMaterial(content);
    if (key.length < 6 || seen.has(key)) return;
    seen.add(key);
    out.push({ kind, content });
  };
  for (const e of input.episodes ?? []) add("episode", e);
  for (const f of input.faqs ?? []) {
    const q = String(f?.q ?? "").trim();
    const a = String(f?.a ?? "").trim();
    if (!q) continue;
    add("faq", a ? `Q：${q}\nA：${a}` : `Q：${q}`);
  }
  for (const tp of input.topics ?? []) add("topic", tp);
  return out;
}

/** NGワードの欄に足す（改行区切り・重複なし） */
export function mergeNgWords(current: string | null | undefined, added: string | null | undefined): string {
  const split = (s: string | null | undefined) => String(s ?? "").split(/[\n、,，]/).map((x) => x.trim()).filter(Boolean);
  const out: string[] = [];
  for (const w of [...split(current), ...split(added)]) if (!out.includes(w)) out.push(w.slice(0, 40));
  return out.join("\n");
}

/** 文体のお手本の先頭に足す（お手本は `---` 区切り。同じものは足さない） */
export function prependStyleSample(current: string | null | undefined, sample: string | null | undefined): string {
  const s = String(sample ?? "").trim();
  const cur = String(current ?? "").trim();
  if (!s) return cur;
  if (normalizeMaterial(cur).includes(normalizeMaterial(s))) return cur;
  return cur ? `${s}\n---\n${cur}` : s;
}
