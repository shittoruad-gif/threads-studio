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

/**
 * Zoomの話の続き（2026-10-01 川邊様 #51）。
 * 日程が決まって担当者がURLをお送りした後、当日に「本日のzoomのURL教えていただきたいです」と届いた。
 * 文が40字を超えていたので「Zoom希望」の受け取り口に入らず自動応答に回り、
 * 「この画面からはお伝えすることができません。『Zoom希望』とお送りください」と、約束済みの方に的外れな返事をしていた。
 * Zoomの言葉が入っていて、直近にZoomのやりとりがある方は、長さに関わらず担当者へお渡しする。
 */
export const ZOOM_WORD_RE = /(zoom|ズーム|ずーむ)/i;

export function mentionsZoom(text: string): boolean {
  return ZOOM_WORD_RE.test(String(text || ""));
}

/** 担当者がお送りしたZoomのURL（いちばん新しいもの）。rows は新しい順。 */
export function latestZoomUrl(rows: Array<{ staffReply?: string | null }> | null | undefined): string | null {
  for (const r of rows || []) {
    const m = String(r?.staffReply || "").match(/https:\/\/[\w.-]*zoom\.us\/[^\s　]+/);
    if (m) return m[0];
  }
  return null;
}

/** URL・参加のしかたを尋ねている文か（URLをその場でお返ししてよいのはこの時だけ。もう一度のZoom希望に古いURLを返さない） */
export function asksZoomUrl(text: string): boolean {
  return /(url|ＵＲＬ|リンク|参加|入れ|入り方|入室|ミーティングID|パスコード|本日|今日|きょう)/i.test(String(text || ""));
}

export function zoomFollowUpAckText(url: string | null, text = ""): string {
  if (url && asksZoomUrl(text)) {
    return (
      "担当者から先にお送りしたZoomのURLはこちらです。\n" + url + "\n\n" +
      "担当者にもお伝えしました。日時やURLが変わる場合は、担当者からこのトークでご連絡します。"
    );
  }
  return (
    "担当者にお伝えしました。ZoomのURL・日時は、担当者からこのトークにお送りします。\n" +
    "少しお待ちください。"
  );
}
