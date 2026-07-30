/**
 * 投稿別の流入計測に使う「合言葉」。
 * 自動投稿の公開直後、コメント欄に「公式LINEから『◯◯』とメッセージしてください」と
 * 案内する際のキーワード。post.id % length で投稿ごとにローテーションするため、
 * どの合言葉でLINEに問い合わせが来たかを見れば、どの投稿からの流入か推定できる。
 *
 * 集計側（stats.inquiryStats）も同じ配列・同じ割当て規則を使うこと。
 * 並び順を変えると過去投稿との対応がずれるため、追加は末尾のみ・削除禁止。
 */
export const INQUIRY_KEYWORDS = ['体験', 'ピラティス', '姿勢', '猫背', 'グループ'] as const;

/** scheduledPosts.id から、その投稿のコメントで案内した合言葉を返す（決定的）。 */
export function inquiryKeywordForPost(postId: number): string {
  return INQUIRY_KEYWORDS[postId % INQUIRY_KEYWORDS.length];
}
