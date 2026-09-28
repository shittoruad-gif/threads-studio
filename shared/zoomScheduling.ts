/**
 * Zoomの日程のお返事かどうか（2026-09-28 川邊様 #47・#48）。
 *
 * 「Zoom希望」を受けたとき「ご都合のよい曜日・時間帯があれば、続けてお送りください」とご案内している。
 * ところが続けて届いた「平日12:30ごろが希望です」は自動応答に回り、投稿の時間のご質問と取り違えて
 * 「投稿時刻は指定できません」と自信ありで返していた（#47）。「10/1の12:30にお願いします！」（#48）も同じ経路。
 *
 * 直近にZoomのやりとりがある方の、短い「日時だけ」の文は担当者へそのままお渡しする。
 * 投稿の話（「投稿」「公開」など）が入っている文はここでは拾わない。
 */

const TIME_RE = /(\d{1,2}\s*[:：]\s*\d{2}|\d{1,2}\s*時(半|\d{1,2}分)?|\d{1,2}\s*[\/／月]\s*\d{1,2}\s*日?|[月火水木金土日](曜|よう)|平日|土日|週末|午前|午後|お昼|昼(頃|ごろ|過ぎ)?|夕方|朝|夜|今日|明日|あした|あさって|来週|今週)/;
const SCHEDULE_WORD_RE = /(希望|お願い|都合|大丈夫|可能|いけ|空いて|あいて|なら|ごろ|頃|以降|から|で)/;
const POST_TOPIC_RE = /(投稿|公開|予約投稿|スレッズ|Threads|自動)/i;

export function looksLikeScheduleReply(text: string): boolean {
  const t = String(text || "").trim();
  if (!t || Array.from(t).length > 60) return false;
  if (POST_TOPIC_RE.test(t)) return false;
  return TIME_RE.test(t) && SCHEDULE_WORD_RE.test(t);
}

/** 直近のやりとりが「Zoomの日程」か（ご質問の記録から見る） */
export function isZoomThread(row: { question?: string | null; staffReply?: string | null } | null | undefined): boolean {
  if (!row) return false;
  return /【Zoom(希望|日程)】/.test(String(row.question || "")) || /zoom|ズーム/i.test(String(row.staffReply || ""));
}

export const ZOOM_SCHEDULE_ACK_TEXT =
  "ご都合をありがとうございます。担当者にお伝えしました。\n" +
  "日時が決まりましたら、このトークにZoomのURLをお送りします。";
