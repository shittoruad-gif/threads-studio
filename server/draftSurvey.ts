/**
 * 案の◯✕アンケート（2026-09-24 三上様指示）。
 *
 * > 「8案を1回送って、丸かバツかで選ぶような形で、残ったものを中心に作っていくのはどうですか？」
 *
 * 見送りが続くお客様（最初はプレステージ様・香取様）に、切り口の違う案をまとめて1回お送りし、
 * 「◯ この方向でよい／✕ 違う」だけを押していただく。
 *   ◯ … 文体のお手本（projects.styleSamples）に足す。生成の「好み」にも最優先で入る（db.getRatedPostSamples）
 *   ✕ … 生成の「避ける方向性」に入る
 *   どちらも切り口の選び方に効く（db.getAngleFeedbackStats・2倍で数える）
 *
 * ★投稿（scheduledPosts）にはしない。押しても公開されず、✕も「見送り」には数えない。
 *   数えると「見送りが続いている」と判定され、翌朝3案が出てしまう。
 * ★送信は scripts/ops/send-draft-survey.mts から、三上様の承諾を得て1回だけ行う（自動では送らない）。
 */
import { sql } from "drizzle-orm";
import * as db from "./db";

export interface SurveyDraft {
  angle: string;
  label: string;
  content: string;
}

export interface SurveyItem extends SurveyDraft {
  id: number;
}

/** 案を記録する（送る前に1回だけ） */
export async function createSurvey(threadsAccountId: number, drafts: SurveyDraft[]): Promise<{ surveyKey: string; items: SurveyItem[] }> {
  const database = await db.getDb();
  if (!database) throw new Error("DBに接続できません");
  const acc: any = await db.getThreadsAccountById(threadsAccountId);
  if (!acc) throw new Error(`アカウント ${threadsAccountId} が見つかりません`);
  let projectId = String(acc.defaultProjectId ?? "");
  // 紐づけが無くても、お店の情報が1件だけの方はそれを使う（生成側と同じ扱い・2026-09-26 香取様）
  if (!projectId) {
    const pjs: any[] = ((await db.getUserProjects(Number(acc.userId))) || []).filter((p: any) => !String(p.id).startsWith("demo_"));
    if (pjs.length === 1) projectId = String(pjs[0].id);
  }
  if (!projectId) throw new Error(`アカウント ${threadsAccountId} にお店の情報が紐づいていません`);
  const surveyKey = `sv-${threadsAccountId}-${Date.now().toString(36)}`;
  const items: SurveyItem[] = [];
  for (const d of drafts) {
    const ins: any = await database.execute(sql`
      INSERT INTO draftSurveyItems (surveyKey, userId, threadsAccountId, projectId, angle, label, content)
      VALUES (${surveyKey}, ${acc.userId}, ${threadsAccountId}, ${projectId}, ${d.angle}, ${d.label.slice(0, 60)}, ${d.content})`);
    items.push({ ...d, id: Number((ins as any)[0]?.insertId ?? 0) });
  }
  return { surveyKey, items };
}

/** お送りするLINEのメッセージ（前置き＋カルーセル1通） */
export function buildSurveyMessages(items: SurveyItem[], intro: string): unknown[] {
  const bubbles = items.slice(0, 12).map((it, i) => ({
    type: "bubble",
    size: "kilo",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        { type: "text", text: `案${i + 1}　${it.label}`, size: "xs", color: "#888888", wrap: true },
        { type: "text", text: it.content.slice(0, 400), wrap: true, size: "sm" },
      ],
    },
    footer: {
      type: "box",
      layout: "horizontal",
      spacing: "sm",
      contents: [
        { type: "button", style: "primary", color: "#059669", height: "sm", action: { type: "postback", label: "◯ この方向", data: `sv=1&id=${it.id}&v=good`, displayText: `案${i + 1}：◯` } },
        { type: "button", style: "secondary", height: "sm", action: { type: "postback", label: "✕ 違う", data: `sv=1&id=${it.id}&v=bad`, displayText: `案${i + 1}：✕` } },
      ],
    },
  }));
  return [
    { type: "text", text: intro },
    { type: "flex", altText: `投稿の案が${items.length}つ届いています（◯✕を押してください）`, contents: { type: "carousel", contents: bubbles } },
  ];
}

/** 本文をお手本から外す（✕に押し直されたとき） */
async function removeStyleSample(projectId: string, content: string): Promise<void> {
  const database = await db.getDb();
  if (!database) return;
  const rows: any = await database.execute(sql`SELECT styleSamples FROM projects WHERE id = ${projectId} LIMIT 1`);
  const cur = String((rows as any)[0]?.[0]?.styleSamples ?? "");
  const kept = cur.split(/\n---\n/).map((s) => s.trim()).filter((s) => s && s !== content.trim());
  await database.execute(sql`UPDATE projects SET styleSamples = ${kept.join("\n---\n")} WHERE id = ${projectId}`);
}

/**
 * ◯✕を受け取る。押し直しもできる（最後に押した方が有効）。
 * 返り値はLINEでお返しする文。
 */
export async function rateSurveyItem(userId: number, id: number, rating: "good" | "bad"): Promise<string> {
  const database = await db.getDb();
  if (!database) return "いまは受け付けられませんでした。少し時間をおいてもう一度押してください。";
  const rows: any = await database.execute(sql`SELECT * FROM draftSurveyItems WHERE id = ${id} LIMIT 1`);
  const item: any = (rows as any)[0]?.[0];
  if (!item || Number(item.userId) !== Number(userId)) return "その案が見つかりませんでした。";
  const before = item.rating ? String(item.rating) : null;
  await database.execute(sql`UPDATE draftSurveyItems SET rating = ${rating}, ratedAt = NOW() WHERE id = ${id}`);
  if (rating === "good" && before !== "good") await db.appendStyleSamples(String(item.projectId), [String(item.content)]);
  if (rating === "bad" && before === "good") await removeStyleSample(String(item.projectId), String(item.content));

  const all: any = await database.execute(sql`
    SELECT COUNT(*) AS n, SUM(rating IS NOT NULL) AS done, SUM(rating = 'good') AS good
    FROM draftSurveyItems WHERE surveyKey = ${item.surveyKey}`);
  const r: any = (all as any)[0]?.[0] ?? {};
  const n = Number(r.n ?? 0), done = Number(r.done ?? 0), good = Number(r.good ?? 0);
  if (done < n) return `ありがとうございます（${done}／${n}）。残りの案も◯か✕を押してください。`;
  if (good === 0) {
    return "すべてにお答えいただき、ありがとうございます。\n" +
      "今回の案はどれも方向が違ったようです。✕を付けていただいた書き方は、これからの投稿では避けます。\n" +
      "「こういう投稿がいい」というものがあれば、このトークにそのまま文章でお送りください。";
  }
  return `すべてにお答えいただき、ありがとうございます。\n` +
    `◯を付けていただいた${good}つの案を、これからの投稿のお手本にします。明日の朝の投稿から、この方向を中心にお作りします。\n` +
    `押し直したいときは、同じカードのボタンをもう一度押してください。`;
}
