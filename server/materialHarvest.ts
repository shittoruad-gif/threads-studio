/**
 * ネタの自動の補充（決まりは shared/materialHarvest.ts）。
 *
 * 2026-11-19 三上様「ネタ切れで同じような投稿ばかりというのが増えてくると思うので、
 * このようなことにならないようにできる仕組みを早急に作って」。
 *
 *   毎朝 5:20（朝の生成の前）に、次のどちらかに当たるアカウントだけを見る：
 *     ・直近14日の投稿どうしが似てきている（shared/sameness.ts M4）
 *     ・ネタ帳があって、今日使えるネタが残り少ない
 *   当たったら、ご本人が手直しして公開した投稿から「お店の事実」を拾い、ネタ帳に足す（足すだけ・今ある行は変えない）。
 *   足した内容と、拾える物が無かったアカウント（＝先生に材料をお願いする段階）を、運営にだけ知らせる。お客様には何も送らない。
 *
 *   手で見る・手で回すとき：scripts/ops/material-harvest.mts（--dry は読むだけ）
 */
import { sql } from "drizzle-orm";
import * as db from "./db";
import { HARVEST, HARVEST_SCHEMA, filterHarvested, harvestPrompt, type HarvestCandidate } from "../shared/materialHarvest";
import type { MaterialKind } from "../shared/materialLedger";

const rowsOf = (r: any): any[] => ((r as any)?.[0] ?? []) as any[];

export interface HarvestResult {
  accountId: number;
  username: string;
  reason: string;
  /** 読んだ手直し投稿の本数 */
  sources: number;
  added: Array<{ kind: MaterialKind; content: string }>;
  /** skipped＝前回の補充から日が浅い／dry＝拾える物が無かった */
  state: "added" | "skipped" | "dry";
}

/** 1つのお店について、手直し投稿から拾ってネタ帳に足す。dry=true は足さずに結果だけ返す */
export async function harvestForProject(userId: number, projectId: string, opts: { dry?: boolean; force?: boolean } = {}): Promise<{ sources: number; added: Array<{ kind: MaterialKind; content: string }>; state: HarvestResult["state"] }> {
  const database = await db.getDb();
  if (!database) return { sources: 0, added: [], state: "dry" };
  if (!opts.force) {
    const last = rowsOf(await database.execute(sql`
      SELECT COUNT(*) c FROM materialItems
      WHERE projectId = ${projectId} AND source = 'edits' AND createdAt >= UTC_TIMESTAMP() - INTERVAL ${HARVEST.everyDays} DAY`));
    if (Number(last[0]?.c ?? 0) > 0) return { sources: 0, added: [], state: "skipped" };
  }
  const srcRows = rowsOf(await database.execute(sql`
    SELECT postContent FROM scheduledPosts
    WHERE userId = ${userId} AND projectId = ${projectId} AND status = 'posted'
      AND editedByUserAt IS NOT NULL AND postContent IS NOT NULL
      AND scheduledAt >= UTC_TIMESTAMP() - INTERVAL ${HARVEST.sourceDays} DAY
    ORDER BY CHAR_LENGTH(postContent) DESC LIMIT ${HARVEST.maxSources}`));
  const sources = srcRows.map((r) => String(r.postContent)).filter((t) => t.trim().length >= 30);
  if (sources.length < 3) return { sources: sources.length, added: [], state: "dry" };
  const existing = rowsOf(await database.execute(sql`SELECT content FROM materialItems WHERE projectId = ${projectId}`)).map((r) => String(r.content));
  const project: any = await db.getProjectById(projectId);
  const { parseNgWords } = await import("../shared/ngwords");
  const ngWords = parseNgWords(project?.ngWords || null);
  let cands: HarvestCandidate[] = [];
  try {
    const { invokeLLM } = await import("./_core/llm");
    const res: any = await invokeLLM({ purpose: "material_harvest", reasoningEffort: "low", messages: [{ role: "user", content: harvestPrompt(sources, existing) }], outputSchema: HARVEST_SCHEMA as any } as any);
    const content = res?.choices?.[0]?.message?.content;
    if (typeof content === "string" && content.trim()) cands = (JSON.parse(content).items ?? []) as HarvestCandidate[];
  } catch (e) {
    console.warn(`[MaterialHarvest] 拾えませんでした project=${projectId}: ${(e as Error)?.message}`);
    return { sources: sources.length, added: [], state: "dry" };
  }
  const added = filterHarvested(cands, sources, existing, ngWords);
  if (added.length === 0) return { sources: sources.length, added: [], state: "dry" };
  if (!opts.dry) {
    const { addItems } = await import("./materialLedger");
    await addItems(userId, projectId, added, "edits");
  }
  return { sources: sources.length, added, state: "added" };
}

/** 補充の対象を選んで回す。dry=true は読むだけ */
export async function runMaterialHarvest(opts: { dry?: boolean } = {}): Promise<HarvestResult[]> {
  const { measureAllAccounts } = await import("./repetitionMonitor");
  const { getLedgerStatus, listActiveItems } = await import("./materialLedger");
  const list = await measureAllAccounts();
  const out: HarvestResult[] = [];
  const done = new Set<string>();
  for (const a of list) {
    if (!a.projectId || done.has(a.projectId)) continue;
    try {
      let reason = a.metrics.similarFlagged ? `似た投稿 ${Math.round(a.metrics.similarShare * 100)}%` : "";
      if (!reason) {
        const items = await listActiveItems(a.projectId);
        if (items.length > 0) {
          const usable = (await getLedgerStatus(a.projectId)).available;
          if (usable <= HARVEST.lowUsable) reason = `ネタ帳の残り ${usable}件`;
        }
      }
      if (!reason) continue;
      done.add(a.projectId);
      const r = await harvestForProject(a.userId, a.projectId, { dry: opts.dry });
      out.push({ accountId: a.accountId, username: a.username, reason, sources: r.sources, added: r.added, state: r.state });
    } catch (e) {
      console.warn(`[MaterialHarvest] account ${a.accountId} を見られませんでした: ${(e as Error)?.message}`);
    }
  }
  return out;
}

export function harvestReportText(list: readonly HarvestResult[]): string {
  const added = list.filter((x) => x.state === "added");
  const dry = list.filter((x) => x.state === "dry");
  const lines: string[] = [];
  for (const x of added) {
    lines.push(`・account ${x.accountId}（@${x.username}）${x.reason} → ネタ帳に${x.added.length}件足しました（手直し投稿${x.sources}本から）`);
    for (const it of x.added) lines.push(`　- ${it.kind === "faq" ? "質問" : "話"}：${it.content.slice(0, 60)}`);
  }
  for (const x of dry) lines.push(`・account ${x.accountId}（@${x.username}）${x.reason} → 拾える材料がありません（手直し投稿${x.sources}本）。先生に材料をお願いする段階です（ご連絡は三上様の承諾後）`);
  return `ネタの補充（毎朝・似た投稿が続く／ネタ帳が残り少ないアカウントだけ）\n${lines.join("\n")}`;
}

export async function runMaterialHarvestJob(): Promise<void> {
  const list = await runMaterialHarvest();
  const added = list.filter((x) => x.state === "added");
  const dry = list.filter((x) => x.state === "dry");
  console.log(`[MaterialHarvest] 対象 ${list.length}件／足した ${added.length}件／材料なし ${dry.length}件`);
  // 足した日は毎回、材料なしは月曜だけ知らせる（毎朝同じ知らせを繰り返さない）
  const monday = new Date(Date.now() + 9 * 3600e3).getUTCDay() === 1;
  const report = [...added, ...(monday ? dry : [])];
  if (report.length === 0) return;
  try {
    const { notifyOwner } = await import("./_core/notification");
    await notifyOwner({ title: "ネタの補充：ネタ帳に足した／材料が足りないアカウントがあります", content: harvestReportText(report) });
  } catch (e) {
    console.warn(`[MaterialHarvest] 運営への通知に失敗: ${(e as Error)?.message}`);
  }
}
