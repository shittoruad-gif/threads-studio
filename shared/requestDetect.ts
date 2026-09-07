/**
 * お客様のメッセージが「ご要望（機能の追加・変更）」かを見分ける（2026-09-07 三上様指示：
 * 要望は自動で受け付け、夜間の更新で反映し、翌日から使えると分かるように伝える）。
 */
const REQUEST_RE = /(してほしい|して欲しい|できるように|できるといい|できたら|欲しい|ほしい|追加して|付けて|つけて|変えて|直して|改善|要望|できませんか|できないですか|できないでしょうか|対応して|機能)/;
const QUESTION_ONLY_RE = /(どうやって|やり方|方法|とは|ですか？$|ますか？$|でしょうか？$)/;

export function isFeatureRequest(text: string): boolean {
  const t = String(text || "").trim();
  if (!t) return false;
  if (!REQUEST_RE.test(t)) return false;
  // 「やり方を教えてほしい」のような使い方の質問は要望にしない
  if (/(教えて|やり方|方法|どうやって)/.test(t) && !/(機能|追加|変えて|直して|できるように)/.test(t)) return false;
  void QUESTION_ONLY_RE;
  return true;
}

export const REQUEST_ACK_TEXT =
  "ご要望として承りました。ありがとうございます。\n" +
  "対応できるものは、その日の夜の更新で反映し、翌日からお使いいただけます（反映は夜間にまとめて行っています）。\n" +
  "反映しましたら、このトークでお知らせします。すぐには難しい場合も、その旨をお返事します。";
