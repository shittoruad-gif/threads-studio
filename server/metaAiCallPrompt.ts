/**
 * Meta AI 呼びかけ投稿を「Threadsアプリから1タップで投稿してもらう」ためのLINE案内。
 *
 * ★背景（2026-09-06 実測）：APIから投稿した「@meta.ai …」は、Threads側でメンション（リンク）に
 *   ならず、Meta AIは返事をしない（自動投稿8件すべて返事ゼロ／アプリからの手動投稿16件は全件返事あり）。
 *   Threads公式の「投稿インテント」（https://www.threads.com/intent/post?text=…）を開くと、
 *   Threadsアプリの投稿画面が文章入りで開き、@meta.ai がメンションとして認識される
 *   （三上様が実機で確認）。よって呼びかけ投稿は自動公開せず、毎朝10時にLINEでボタンを届ける。
 *
 * - 対象：公式LINEがつながっていて、Meta AI呼びかけ投稿がON、プロ・ビジネス（1日2件以上）の方
 * - アカウントごとに1通（店舗名・アカウント名を明記。ログイン中のアカウントに投稿されるため）
 * - ライトの方には送らない（設定画面・LINE設定で「プロ・ビジネスで使えます」と案内）
 */
import * as db from "./db";
import { buildMetaAiCallPost, splitDailyQuota } from "../shared/metaAiAsk";
import { effectiveAccountSettings } from "../shared/accountSettings";
import { getPlan, resolveEffectivePlanId } from "../shared/plans";

const JST = 9 * 3600 * 1000;

/** Threadsアプリの投稿画面を文章入りで開くURL（LINEからは外部ブラウザ経由でアプリが起動する） */
export function buildThreadsIntentUrl(text: string): string {
  return `https://www.threads.com/intent/post?text=${encodeURIComponent(text)}&openExternalBrowser=1`;
}

export interface MetaAiCallMessageInput {
  username: string;
  storeName?: string | null;
  text: string;
  /** 今朝の自動投稿がメンションにならなかった方への「やり直し」案内 */
  redo?: boolean;
}

/** LINEに送る2通（説明の文章＋「Threadsアプリで投稿する」ボタン） */
export function buildMetaAiCallMessages(p: MetaAiCallMessageInput): unknown[] {
  const store = String(p.storeName ?? "").replace(/\s*[\r\n]+\s*/g, "／").trim(); // 店名の改行は「／」に
  const acct = `@${p.username}${store ? `（${store}）` : ""}`;
  const url = buildThreadsIntentUrl(p.text);
  const head = p.redo
    ? "【Meta AI呼びかけ投稿の、やり直しのお願い】\n" +
      "今朝の自動投稿「@meta.ai …」は、Threadsの仕様で自動投稿（API）からだと@meta.aiがメンションにならず、Meta AIの返事が付きませんでした。申し訳ありません。\n" +
      "お手数ですが、下の手順で1回だけ投稿してください。今朝の投稿は消さなくて大丈夫です。"
    : "【今日のMeta AI呼びかけ投稿】\n" +
      "Threadsアプリから投稿すると、Meta AIが店名入りで返事をくれて、届く人が増えます。ボタン1つで投稿画面が開きます。";
  const text =
    `${head}\n\n` +
    `■ 投稿するアカウント\n${acct}\n\n` +
    `■ 投稿する文章\n${p.text}\n\n` +
    `手順\n` +
    `1. Threadsアプリで ${acct} にログインしていることを確認する\n` +
    `2. 下の「Threadsアプリで投稿する」を押す（文章が入った投稿画面が開きます）\n` +
    `3. 「@meta.ai」が青いメンションになっているのを確認して「投稿」を押す\n\n` +
    `※ 別のアカウントでログイン中だと、そちらに投稿されてしまいます。\n` +
    `※ Meta AIの返事が付くかは、Threads側の段階提供によります。`;
  const flex = {
    type: "flex",
    altText: `Threadsアプリで投稿する：${acct}`,
    contents: {
      type: "bubble",
      size: "kilo",
      body: {
        type: "box", layout: "vertical", spacing: "sm",
        contents: [
          { type: "text", text: acct, size: "xs", color: "#0E8388", weight: "bold", wrap: true },
          { type: "text", text: p.text.slice(0, 300), size: "sm", color: "#13343B", wrap: true },
        ],
      },
      footer: {
        type: "box", layout: "vertical",
        contents: [
          { type: "button", style: "primary", color: "#0E8388", height: "sm",
            action: { type: "uri", label: "Threadsアプリで投稿する", uri: url } },
        ],
      },
    },
  };
  return [{ type: "text", text }, flex];
}

function eligibleProjectsOf(projects: any[]): any[] {
  return (projects || []).filter((p) =>
    !String(p.id).startsWith("demo_") && p.businessType && p.area && p.target && p.mainProblem && p.strength,
  );
}

function callSourceOf(project: any) {
  let menu: string[] | null = null;
  try {
    const cr = project.counselingResult ? JSON.parse(project.counselingResult) : null;
    menu = Array.isArray(cr?.menu) ? cr.menu : null;
  } catch { menu = null; }
  return {
    storeName: project.storeName, businessType: project.businessType, area: project.area,
    localTerms: project.localTerms, target: project.target, mainProblem: project.mainProblem, menu,
  };
}

/** その方の、アカウントごとの「今日の呼びかけ文」を組み立てる（送らない） */
export async function buildTodayCallsForUser(userId: number, dayIndex: number): Promise<Array<{ accountId: number; username: string; storeName: string | null; text: string }>> {
  const user: any = await db.getUserById(userId);
  if (!user || user.isDemoMode) return [];
  if (user.metaAiAskEnabled === false) return [];
  const sub = await db.getSubscriptionByUserId(userId);
  const plan = getPlan(resolveEffectivePlanId(sub?.planId, sub?.status));
  const maxPerDay = Number(plan?.features?.maxAutoPostsPerDay ?? 0);
  if (splitDailyQuota(maxPerDay, true).call <= 0) return []; // ライト・自動投稿なしは対象外
  const projects = eligibleProjectsOf(await db.getProjectsByUserId(userId));
  if (projects.length === 0) return [];
  const accounts: any[] = await db.getActiveThreadsAccounts(userId);
  const common = await db.getAutoPostSettings(userId);
  const out: Array<{ accountId: number; username: string; storeName: string | null; text: string }> = [];
  for (const acct of accounts) {
    const eff = effectiveAccountSettings(common as any, acct);
    if (!eff.autoPostEnabled) continue;
    const pinned = acct.defaultProjectId ? projects.find((p) => p.id === acct.defaultProjectId) : null;
    const project = pinned || projects[dayIndex % projects.length];
    const text = buildMetaAiCallPost({ ...callSourceOf(project), focus: acct.callFocus ?? null }, dayIndex);
    if (!text) continue;
    out.push({ accountId: Number(acct.id), username: String(acct.threadsUsername), storeName: project.storeName ?? null, text });
  }
  return out;
}

export function todayIndexJst(): number {
  return Math.floor((Date.now() + JST) / 86400000);
}

/** 毎朝10:00 JST：対象の方全員に「今日の呼びかけ文」＋ボタンを送る */
export async function runMetaAiCallPromptJob(): Promise<void> {
  const d = await db.getDb();
  if (!d) return;
  const { sql } = await import("drizzle-orm");
  const rows: any = await d.execute(sql`SELECT DISTINCT userId FROM userLineLinks`);
  const userIds: number[] = ((rows as any)[0] ?? []).map((r: any) => Number(r.userId));
  const dayIndex = todayIndexJst();
  let sent = 0;
  for (const userId of userIds) {
    try {
      const calls = await buildTodayCallsForUser(userId, dayIndex);
      if (calls.length === 0) continue;
      const targets = await db.getLineUserIdsForUser(userId);
      if (targets.length === 0) continue;
      const { pushMessages } = await import("./lineNotify");
      for (const c of calls) {
        const msgs = buildMetaAiCallMessages({ username: c.username, storeName: c.storeName, text: c.text });
        for (const to of targets) await pushMessages(to, msgs);
        sent++;
        console.log(`[MetaAiCall] 送信 user=${userId} @${c.username} 「${c.text}」`);
      }
    } catch (e) {
      console.error(`[MetaAiCall] 失敗 user=${userId}:`, e);
    }
  }
  console.log(`[MetaAiCall] 完了 送信=${sent}通`);
}

/**
 * 今朝の自動投稿がメンションにならなかった方へ、やり直し案内を送る（運営が手で実行）。
 * 今日の呼びかけ投稿（angle=meta_ai_call）の本文が「@meta.ai」で始まっていればそれを、
 * 書き直されて消えていれば同じ材料から作り直した文を使う。
 */
export async function buildRedoForUsernames(usernames: string[], focusOverride: Record<string, string> = {}): Promise<Array<{ userId: number; username: string; storeName: string | null; text: string; targets: string[] }>> {
  const d = await db.getDb();
  if (!d) return [];
  const { sql } = await import("drizzle-orm");
  const dayIndex = todayIndexJst();
  const out: Array<{ userId: number; username: string; storeName: string | null; text: string; targets: string[] }> = [];
  for (const username of usernames) {
    const ar: any = await d.execute(sql`SELECT id, userId, defaultProjectId FROM threadsAccounts WHERE threadsUsername = ${username} AND isActive = 1 LIMIT 1`);
    const focus = focusOverride[username] ?? null; // 列が本番に入る前でも、得意分野を手で指定できる
    const acct = ((ar as any)[0] ?? [])[0];
    if (!acct) { console.log(`@${username}: アカウントが見つかりません`); continue; }
    const pr: any = await d.execute(sql`SELECT postContent FROM scheduledPosts WHERE threadsAccountId = ${acct.id} AND angle = 'meta_ai_call' AND DATE(CONVERT_TZ(scheduledAt,'+00:00','+09:00')) = DATE(CONVERT_TZ(NOW(),'+00:00','+09:00')) ORDER BY id LIMIT 1`);
    const today = ((pr as any)[0] ?? [])[0]?.postContent as string | undefined;
    const projects = eligibleProjectsOf(await db.getProjectsByUserId(Number(acct.userId)));
    const pinned = acct.defaultProjectId ? projects.find((p) => p.id === acct.defaultProjectId) : null;
    const project = pinned || projects[0];
    let text = !focus && today && today.trim().startsWith("@meta.ai") ? today.trim() : null;
    // 得意分野を指定したやり直しは②型（「〇〇でダイエットに強い整体院のおすすめを教えて」）に固定
    if (!text && project) text = buildMetaAiCallPost({ ...callSourceOf(project), focus }, focus ? 1 : dayIndex);
    if (!text) { console.log(`@${username}: 呼びかけ文を作れません（材料不足）`); continue; }
    const targets = await db.getLineUserIdsForUser(Number(acct.userId));
    out.push({ userId: Number(acct.userId), username, storeName: project?.storeName ?? null, text, targets });
  }
  return out;
}
