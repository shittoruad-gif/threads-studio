/**
 * 担当者が「〜をこのトークで一言お知らせください」とお願いした後の、お客様のお返事かどうか（2026-09-29 川邊様 #49・#50）。
 *
 * #49 で担当者が「患者様にお伝えしている『もう一つ』を一言お知らせください。答えまで入った投稿に作り直してお届けします」と返し、
 * 川邊様が「もう一つが『骨盤底筋などのインナーマッスル』でお願いいたします」（#50）と答えた。
 * ところが自動応答に回り、「はじめの設定から登録してください」と自信ありで返して終わっていた（担当者に届かない）。
 *
 * 直近48時間の担当者の返信に「具体的なことを教えてほしい」というお願いがあれば、次のお返事は担当者へそのまま渡す。
 * 「何かあればお気軽に」のような結びの定型は、お願いに数えない（数えると自動応答がほぼ止まる）。
 */

const ASK_RE = /(お知らせ|お送り|お教え|教えて|お聞かせ|ご返信|ご連絡)(いただけ(ますか|ますでしょうか|れば)|ください)/;
const GENERIC_RE = /(何か|なにか|ご不明|お困り|いつでも|お気軽|ほかに|他に|その他)/;
export const AWAIT_WINDOW_HOURS = 48;

/** 担当者の返信に、お客様への具体的なお願いがあるか */
export function staffReplyAsksCustomer(staffReply: string | null | undefined): boolean {
  const sentences = String(staffReply || "").split(/(?<=[。！!？?\n])/).map((s) => s.trim()).filter(Boolean);
  return sentences.some((s) => ASK_RE.test(s) && !GENERIC_RE.test(s));
}

/** 直近のご質問の記録から、担当者のお願いへのお返事を待っているか */
export function isAwaitingStaffAnswer(
  rows: Array<{ staffReply?: string | null; repliedAt?: Date | string | null }> | null | undefined,
  now: Date = new Date(),
): boolean {
  const since = now.getTime() - AWAIT_WINDOW_HOURS * 3600 * 1000;
  const latestReplied = (rows || [])
    .filter((r) => r.staffReply && r.repliedAt)
    .sort((a, b) => new Date(b.repliedAt as any).getTime() - new Date(a.repliedAt as any).getTime())[0];
  if (!latestReplied) return false;
  if (new Date(latestReplied.repliedAt as any).getTime() < since) return false;
  return staffReplyAsksCustomer(latestReplied.staffReply);
}

export const STAFF_ANSWER_ACK_TEXT =
  "お知らせいただきありがとうございます。担当者にお伝えしました。\n" +
  "確認のうえ、このトークでお返事します。";
