/**
 * 投稿別の流入計測に使う「合言葉」。
 * 自動投稿の公開直後、コメント欄に「公式LINEから『◯◯』とメッセージしてください」と
 * 案内する際のキーワード。post.id % length で投稿ごとにローテーションするため、
 * どの合言葉でLINEに問い合わせが来たかを見れば、どの投稿からの流入か推定できる。
 *
 * ★合言葉は「どの業種・どの店舗でも必ず当てはまる言葉」だけを使う。
 *   以前は「ピラティス」「猫背」など“メニュー名・症状名”が混ざっており、
 *   そのメニューを提供していない店舗（例：鍼灸院）のコメントで
 *   「『ピラティス』とメッセージしてください」と案内してしまっていた（2026-08-17修正）。
 *   店舗が扱っていないサービス名をお客様に入力させるのは誤案内なので、
 *   ACTIVE_INQUIRY_KEYWORDS には施術メニュー・症状・コース名を絶対に入れないこと。
 */

/**
 * 2026-08-17より前に公開した投稿で案内していた合言葉。
 * 過去の集計（どの投稿から問い合わせが来たか）を壊さないため保持する。変更禁止。
 */
export const LEGACY_INQUIRY_KEYWORDS = ['体験', 'ピラティス', '姿勢', '猫背', 'グループ'] as const;

/**
 * 現行の合言葉。業種を問わず成立する言葉のみ。
 * 追加は末尾のみ・削除禁止（並び順を変えると過去投稿との対応がずれる）。
 */
export const ACTIVE_INQUIRY_KEYWORDS = ['相談', '予約', '空き状況', '料金', 'アクセス'] as const;

/**
 * 合言葉を切り替えた境界。このID以上の投稿は ACTIVE_INQUIRY_KEYWORDS を使う。
 * 切替時点の scheduledPosts の最大IDは536だったため537を境界にしている。
 */
export const KEYWORD_SWITCH_POST_ID = 537;

/**
 * 集計時にKeiroへ渡す検索対象＝これまでに案内した全合言葉（新旧すべて）。
 * 切替をまたいだ期間でも過去投稿の問い合わせを取りこぼさないため。
 */
export const INQUIRY_KEYWORDS: readonly string[] = Array.from(
  new Set<string>([...ACTIVE_INQUIRY_KEYWORDS, ...LEGACY_INQUIRY_KEYWORDS]),
);

/** scheduledPosts.id から、その投稿のコメントで案内した合言葉を返す（決定的）。 */
export function inquiryKeywordForPost(postId: number): string {
  if (postId >= KEYWORD_SWITCH_POST_ID) {
    return ACTIVE_INQUIRY_KEYWORDS[postId % ACTIVE_INQUIRY_KEYWORDS.length];
  }
  return LEGACY_INQUIRY_KEYWORDS[postId % LEGACY_INQUIRY_KEYWORDS.length];
}
