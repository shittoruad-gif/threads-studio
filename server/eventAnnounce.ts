/**
 * イベント告知の投稿生成（shared/eventCountdown.ts のスケジュールに沿って
 * 段階別の告知文をAIで作り、予約投稿として積む）。
 *
 * 事実のルール: 本文に使ってよいのは登録されたイベント情報（名称・日付・時刻・
 * 場所・内容・参加方法）と店舗プロジェクトの情報だけ。数字や特典を勝手に作らない。
 * 生成文は jpQualityGuard の絶対条件（決まり文句・ひらがな率・んです過多）で検査し、
 * 不合格やAI失敗時は事実だけの安全なテンプレ文に落とす（イベント告知は事実が主役なので成立する）。
 */

import { invokeLLM } from "./_core/llm";
import { checkNaturalized, polishPunctuation } from "../shared/jpQualityGuard";
import { CountdownSlot, formatEventDateJst } from "../shared/eventCountdown";
import * as db from "./db";

export interface EventInput {
  id: number;
  title: string;
  eventDate: string; // YYYY-MM-DD (JST)
  eventTime?: string | null;
  venue?: string | null;
  description?: string | null;
  offer?: string | null;
}

interface ProjectContext {
  businessType?: string | null;
  area?: string | null;
  storeName?: string | null;
}

/** AI失敗・品質不合格時の安全なフォールバック（事実のみ・生成なし） */
export function buildFallbackPost(event: EventInput, daysBefore: number): string {
  const date = formatEventDateJst(event.eventDate);
  const when = daysBefore === 0 ? "本日開催です。" : daysBefore === 1 ? "いよいよ明日です。" : `${date}に開催します。`;
  const lines = [
    `【${event.title}】`,
    when,
    event.eventTime ? `時間：${event.eventTime}` : "",
    event.venue ? `場所：${event.venue}` : "",
    event.offer ? event.offer : "",
  ].filter(Boolean);
  return lines.join("\n");
}

function buildPrompt(event: EventInput, project: ProjectContext, slot: CountdownSlot): string {
  const date = formatEventDateJst(event.eventDate);
  const facts = [
    `イベント名: ${event.title}`,
    `開催日: ${date}${event.eventTime ? `（${event.eventTime}）` : ""}`,
    event.venue ? `場所: ${event.venue}` : "",
    event.description ? `内容: ${event.description}` : "",
    event.offer ? `参加方法・特典: ${event.offer}` : "",
    project.storeName ? `店舗名: ${project.storeName}` : "",
    project.businessType ? `業種: ${project.businessType}` : "",
    project.area ? `地域: ${project.area}` : "",
  ].filter(Boolean).join("\n");

  return `あなたは店舗のオーナーです。自分のお店のイベント告知をThreadsに投稿します。

【今回の投稿の役割（${slot.stage.label}）】
${slot.stage.aim}

【使ってよい事実（これ以外の数字・特典・実績を作らない）】
${facts}

【書き方のルール】
- 合計50〜100文字。1文は30文字以内。改行は文末の直後だけ。1〜2文ごとに空行。
- 「〜んです」系は最大1回。「〜ですよね」「〜いませんか」等の同意を求める疑問は禁止。
- 絵文字は使わない。ハッシュタグは使わない。煽り表現（急いで・残りわずか等、事実にないもの）は禁止。
- 宣伝臭くしない。お店の人が普段のトーンで知らせる感じ。

投稿本文だけを出力してください。`;
}

/**
 * スロットごとに告知文を生成して予約投稿を作る。
 * 戻り値は作成できた件数（生成失敗はフォールバック文で必ず作る）。
 */
export async function createEventPosts(params: {
  userId: number;
  event: EventInput;
  projectId: string;
  threadsAccountId: number;
  project: ProjectContext;
  slots: CountdownSlot[];
  requireApproval: boolean;
}): Promise<number> {
  const { userId, event, projectId, threadsAccountId, project, slots, requireApproval } = params;
  let created = 0;
  for (const slot of slots) {
    let content = "";
    try {
      const res = await invokeLLM({ messages: [{ role: "user", content: buildPrompt(event, project, slot) }] });
      const raw = (res.choices[0]?.message?.content ?? "").toString().trim();
      const polished = polishPunctuation(raw);
      const verdict = checkNaturalized(polished, polished, { allowQuestionEnding: false });
      if (polished.length >= 20 && polished.length <= 200 && verdict.ok) {
        content = polished;
      } else {
        console.warn(`[EventAnnounce] 品質不合格→テンプレ採用 event=${event.id} stage=${slot.stage.daysBefore}日前: ${verdict.reason ?? "長さ"}`);
      }
    } catch (e) {
      console.warn(`[EventAnnounce] 生成失敗→テンプレ採用 event=${event.id}:`, (e as any)?.message);
    }
    if (!content) content = buildFallbackPost(event, slot.stage.daysBefore);

    await db.createScheduledPost({
      userId,
      projectId,
      threadsAccountId,
      scheduledAt: slot.scheduledAt,
      postContent: content,
      status: requireApproval ? "awaiting_approval" : "pending",
      source: "manual",
      eventId: event.id,
    } as any);
    created++;
  }
  return created;
}
