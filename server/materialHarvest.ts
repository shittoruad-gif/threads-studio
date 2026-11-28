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
import {
  HARVEST, HARVEST_SCHEMA, HARVEST_ALL_ACCOUNTS, HARVEST_SKIP_NEW_LEDGER_ACCOUNT_IDS, SITE_HARVEST, REPLY_HARVEST, REPLY_PICK_SCHEMA,
  filterHarvested, harvestPrompt, filterSiteHarvested, siteHarvestPrompt, isOwnSiteUrl,
  eligibleReplies, replyPickPrompt, buildReplyItems, type HarvestCandidate, type ReplyCandidate,
} from "../shared/materialHarvest";
import type { MaterialKind } from "../shared/materialLedger";

const rowsOf = (r: any): any[] => ((r as any)?.[0] ?? []) as any[];

export interface HarvestResult {
  accountId: number;
  username: string;
  reason: string;
  /** 読んだ手直し投稿の本数 */
  sources: number;
  added: Array<{ kind: MaterialKind; content: string }>;
  /** skipped＝前回の補充から日が浅い／dry＝拾える物が無かった／held＝候補はあるが足していない（運営の確認待ち） */
  state: "added" | "skipped" | "dry" | "held";
  /** 出どころ（無ければ手直し投稿） */
  from?: "edits" | "site" | "replies";
  /** ホームページのURL（from=site のとき） */
  url?: string;
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

/**
 * ② ご本人のホームページから拾ってネタ帳に足す（2026-11-28 三上様「そういうのも他のアカウントにも入れて」）。
 *   読むのは、お店の情報の「ご案内先URL」に登録されたホームページ／予約ページだけ（まとめ・順位のサイトは読まない）。
 *   hold=true は足さずに候補だけ返す（毎朝の自動はいつも hold。運営が中身を見てから --site-add で足す）。
 */
export async function harvestSiteForProject(userId: number, projectId: string, opts: { dry?: boolean; force?: boolean; hold?: boolean; url?: string } = {}): Promise<{ url: string | null; added: Array<{ kind: MaterialKind; content: string }>; state: HarvestResult["state"]; note?: string }> {
  const database = await db.getDb();
  if (!database) return { url: null, added: [], state: "dry" };
  const project: any = await db.getProjectById(projectId);
  if (!project) return { url: null, added: [], state: "dry" };
  const { websiteUrlOf } = await import("./declineFollowup");
  const url = opts.url ?? websiteUrlOf(project);
  if (!url || !isOwnSiteUrl(url)) return { url: url ?? null, added: [], state: "dry", note: url ? "ご本人のページではないため読まない" : "ホームページの登録なし" };
  if (!opts.force) {
    const last = rowsOf(await database.execute(sql`
      SELECT COUNT(*) c FROM materialItems
      WHERE projectId = ${projectId} AND source = 'site' AND createdAt >= UTC_TIMESTAMP() - INTERVAL ${SITE_HARVEST.everyDays} DAY`));
    if (Number(last[0]?.c ?? 0) > 0) return { url, added: [], state: "skipped" };
  }
  const { fetchWebsite, htmlToText } = await import("./websitePrefill");
  const fetched = await fetchWebsite(url);
  if (!fetched.ok) return { url, added: [], state: "dry", note: `読めませんでした（${fetched.reason}）` };
  const { title, description, text } = htmlToText(fetched.html);
  const page = [title, description, text].filter(Boolean).join("\n");
  if (page.replace(/\s/g, "").length < 80) return { url, added: [], state: "dry", note: "ページの文章が読み取れませんでした" };
  // ご本人のページか：店名（記号・「株式会社」などを外した3字以上）がページに出ていること
  const nameKey = String(project.storeName || project.title || "").replace(/[㈱㈲\s　・\-‐－()（）]|株式会社|有限会社|合同会社|本店|支店/g, "");
  if (nameKey.length >= 3 && !page.replace(/\s/g, "").includes(nameKey)) {
    return { url, added: [], state: "dry", note: "ページに店名が見当たらないため読まない" };
  }
  let cr: any = {};
  try { cr = project.counselingResult ? JSON.parse(project.counselingResult) : {}; } catch { cr = {}; }
  const registered = [
    `強み：${project.strength ?? ""}`, `実績：${project.proof ?? ""}`, `信条：${project.belief ?? ""}`, `独自性：${project.usp ?? ""}`,
    `メニュー：${(cr.menu ?? []).join("／")}`, `実例：${(cr.realEpisodes ?? []).join("／")}`, `よくある質問：${(cr.faq ?? []).join("／")}`,
  ].join("\n");
  const existing = rowsOf(await database.execute(sql`SELECT content FROM materialItems WHERE projectId = ${projectId}`)).map((r) => String(r.content));
  const { parseNgWords } = await import("../shared/ngwords");
  const ngWords = parseNgWords(project?.ngWords || null);
  let cands: HarvestCandidate[] = [];
  try {
    const { invokeLLM } = await import("./_core/llm");
    const res: any = await invokeLLM({ purpose: "material_harvest", reasoningEffort: "low", messages: [{ role: "user", content: siteHarvestPrompt(page, String(project.storeName || project.title || ""), registered, existing) }], outputSchema: HARVEST_SCHEMA as any } as any);
    const content = res?.choices?.[0]?.message?.content;
    if (typeof content === "string" && content.trim()) cands = (JSON.parse(content).items ?? []) as HarvestCandidate[];
  } catch (e) {
    console.warn(`[MaterialHarvest] ホームページから拾えませんでした project=${projectId}: ${(e as Error)?.message}`);
    return { url, added: [], state: "dry", note: "読み取りに失敗" };
  }
  // 登録ずみの内容と同じ話も足さない（existing と同じ扱い）
  const registeredLines = registered.split(/\n|／/).map((x) => x.replace(/^[^：]*：/, "")).filter((x) => x.trim().length >= 8);
  const added = filterSiteHarvested(cands, page, [...existing, ...registeredLines], ngWords);
  if (added.length === 0) return { url, added: [], state: "dry", note: "新しく拾える事実なし" };
  if (opts.hold) return { url, added, state: "held" };
  if (!opts.dry) {
    const { addItems } = await import("./materialLedger");
    await addItems(userId, projectId, added, "site");
  }
  return { url, added, state: "added" };
}

/**
 * ③ 投稿に付いた返信から拾ってネタ帳に足す（2026-11-28）。
 *   地元の会話には、地元の方から食べ物・場所・暮らしの工夫の返信が付く（11/28 実測：acc35 に22件、acc34 に7件、acc15 に3件）。
 *   返信の言葉はそのまま持ち（文は作らない）、選ぶのだけを LLM に任せる。営業・値段・質問・きつい言葉は先に外す。
 */
export async function harvestRepliesForAccount(accountId: number, userId: number, projectId: string, opts: { dry?: boolean } = {}): Promise<{ sources: number; added: Array<{ kind: MaterialKind; content: string }>; state: HarvestResult["state"] }> {
  const database = await db.getDb();
  if (!database) return { sources: 0, added: [], state: "dry" };
  const acct: any = await db.getThreadsAccountById(accountId);
  if (!acct?.accessToken || !acct?.threadsUserId) return { sources: 0, added: [], state: "dry" };
  const { getThreadsComments } = await import("./threadsApi");
  const { looksLikeSpamComment } = await import("../shared/commentSpam");
  const raw = await getThreadsComments(acct.accessToken, String(acct.threadsUserId), 60).catch(() => [] as any[]);
  const list: ReplyCandidate[] = (raw as any[]).map((c) => ({ text: String(c.text ?? ""), username: c.username ?? null, parentText: c.parent_post_text ?? null, timestamp: c.timestamp ?? null }));
  const eligible = eligibleReplies(list, acct.threadsUsername, looksLikeSpamComment);
  if (eligible.length === 0) return { sources: 0, added: [], state: "dry" };
  const existing = rowsOf(await database.execute(sql`SELECT content FROM materialItems WHERE projectId = ${projectId}`)).map((r) => String(r.content));
  const project: any = await db.getProjectById(projectId);
  const { parseNgWords } = await import("../shared/ngwords");
  const ngWords = parseNgWords(project?.ngWords || null);
  let picks: number[] = [];
  try {
    const { invokeLLM } = await import("./_core/llm");
    const res: any = await invokeLLM({ purpose: "material_harvest", reasoningEffort: "low", messages: [{ role: "user", content: replyPickPrompt(eligible) }], outputSchema: REPLY_PICK_SCHEMA as any } as any);
    const content = res?.choices?.[0]?.message?.content;
    if (typeof content === "string" && content.trim()) picks = ((JSON.parse(content).picks ?? []) as any[]).map(Number).filter((n) => Number.isInteger(n) && n >= 1);
  } catch (e) {
    console.warn(`[MaterialHarvest] 返信を選べませんでした account=${accountId}: ${(e as Error)?.message}`);
    return { sources: eligible.length, added: [], state: "dry" };
  }
  const added = buildReplyItems(eligible, picks, existing, ngWords);
  if (added.length === 0) return { sources: eligible.length, added: [], state: "dry" };
  if (!opts.dry) {
    const { addItems } = await import("./materialLedger");
    await addItems(userId, projectId, added, "replies");
  }
  return { sources: eligible.length, added, state: "added" };
}

/** 補充の対象を選んで回す。dry=true は読むだけ */
export async function runMaterialHarvest(opts: { dry?: boolean; /** 返信を読むか（省くと月・木だけ） */ repliesToday?: boolean } = {}): Promise<HarvestResult[]> {
  const { measureAllAccounts } = await import("./repetitionMonitor");
  const { getLedgerStatus, listActiveItems } = await import("./materialLedger");
  const list = await measureAllAccounts();
  const out: HarvestResult[] = [];
  const done = new Set<string>();
  const doneReplies = new Set<number>();
  for (const a of list) {
    if (!a.projectId) continue;
    try {
      let reason = a.metrics.similarFlagged ? `似た投稿 ${Math.round(a.metrics.similarShare * 100)}%` : "";
      if (!reason) {
        const items = await listActiveItems(a.projectId);
        if (items.length > 0) {
          const usable = (await getLedgerStatus(a.projectId)).available;
          if (usable <= HARVEST.lowUsable) reason = `ネタ帳の残り ${usable}件`;
        }
      }
      // ★ネタ帳がまだ無いアカウントにも広げる（2026-11-28 三上様「そういうのも他のアカウントにも入れて」）。
      //   11/28 実測：手直し投稿が10本以上あるのにネタ帳が無いアカウントが6つあった。
      let noLedger = false;
      if (!reason && HARVEST_ALL_ACCOUNTS) {
        const items = await listActiveItems(a.projectId);
        if (items.length === 0 && !HARVEST_SKIP_NEW_LEDGER_ACCOUNT_IDS.includes(a.accountId)) { reason = "ネタ帳がまだ無い"; noLedger = true; }
      }
      // ③ 返信は、材料が足りているアカウントでも読む（地元の方の声は新しい話題になる）。週2回だけ。
      const jstDay = new Date(Date.now() + 9 * 3600e3).getUTCDay();
      if ((opts.repliesToday ?? REPLY_HARVEST.weekdays.includes(jstDay)) && !doneReplies.has(a.accountId)) {
        doneReplies.add(a.accountId);
        try {
          const rr = await harvestRepliesForAccount(a.accountId, a.userId, a.projectId, { dry: opts.dry });
          if (rr.state === "added") out.push({ accountId: a.accountId, username: a.username, reason: `返信 ${rr.sources}件`, sources: rr.sources, added: rr.added, state: rr.state, from: "replies" });
        } catch (e) { console.warn(`[MaterialHarvest] account ${a.accountId} の返信を読めませんでした: ${(e as Error)?.message}`); }
      }
      if (!reason || done.has(a.projectId)) continue;
      done.add(a.projectId);
      const r = await harvestForProject(a.userId, a.projectId, { dry: opts.dry });
      // ネタ帳がまだ無く、手直し投稿も少ない方は「材料なし」の知らせに出さない（毎週同じ知らせが並ぶだけになる）
      if (!(noLedger && r.state === "dry")) out.push({ accountId: a.accountId, username: a.username, reason, sources: r.sources, added: r.added, state: r.state, from: "edits" });
      // ② ホームページ。自動では足さず、候補だけを運営に知らせる（足すのは運営が見てから：--site-add）。
      //   11/28 の下見：採用ページから「不安から一歩踏み出した先に、あなたの居場所があります」のような
      //   宣伝の文が8件拾われた。事実かどうかを人が見てから足す
      //   （9/24 三上様の決まり「ホームページから足すのは、押したものだけ」と同じ考え方）。
      try {
        const sr = await harvestSiteForProject(a.userId, a.projectId, { dry: opts.dry, hold: true });
        if (sr.state === "held") out.push({ accountId: a.accountId, username: a.username, reason, sources: 1, added: sr.added, state: sr.state, from: "site", url: sr.url ?? undefined });
      } catch (e) { console.warn(`[MaterialHarvest] account ${a.accountId} のホームページを読めませんでした: ${(e as Error)?.message}`); }
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
  const fromLabel = (x: HarvestResult) => x.from === "site" ? `ホームページ ${x.url ?? ""} から` : x.from === "replies" ? `投稿に付いた返信${x.sources}件から` : `手直し投稿${x.sources}本から`;
  for (const x of added) {
    lines.push(`・account ${x.accountId}（@${x.username}）${x.reason} → ネタ帳に${x.added.length}件足しました（${fromLabel(x)}）`);
    for (const it of x.added) lines.push(`　- ${it.kind === "faq" ? "質問" : "話"}：${it.content.slice(0, 80)}`);
  }
  for (const x of list.filter((r) => r.state === "held")) {
    lines.push(`・account ${x.accountId}（@${x.username}）${x.reason} → ${fromLabel(x)}${x.added.length}件の候補（まだ足していません。中身を見て、足すときは scripts/ops/material-harvest.mts --site-add ${x.accountId}）`);
    for (const it of x.added) lines.push(`　- ${it.kind === "faq" ? "質問" : "話"}：${it.content.slice(0, 80)}`);
  }
  for (const x of dry) lines.push(`・account ${x.accountId}（@${x.username}）${x.reason} → 拾える材料がありません（手直し投稿${x.sources}本）。先生に材料をお願いする段階です（ご連絡は三上様の承諾後）`);
  return `ネタの補充（毎朝・似た投稿が続く／ネタ帳が残り少ない／ネタ帳がまだ無いアカウント。返信は月・木）\n${lines.join("\n")}`;
}

export async function runMaterialHarvestJob(): Promise<void> {
  const list = await runMaterialHarvest();
  const added = list.filter((x) => x.state === "added");
  const dry = list.filter((x) => x.state === "dry");
  console.log(`[MaterialHarvest] 対象 ${list.length}件／足した ${added.length}件／材料なし ${dry.length}件`);
  // 足した日は毎回、材料なしは月曜だけ知らせる（毎朝同じ知らせを繰り返さない）
  const monday = new Date(Date.now() + 9 * 3600e3).getUTCDay() === 1;
  // ホームページの候補（まだ足していない）は、同じ知らせを毎朝繰り返さないよう月曜だけ
  const held = list.filter((x) => x.state === "held");
  const report = [...added, ...(monday ? [...dry, ...held] : [])];
  if (report.length === 0) return;
  try {
    const { notifyOwner } = await import("./_core/notification");
    await notifyOwner({ title: "ネタの補充：ネタ帳に足した／材料が足りないアカウントがあります", content: harvestReportText(report) });
  } catch (e) {
    console.warn(`[MaterialHarvest] 運営への通知に失敗: ${(e as Error)?.message}`);
  }
}
