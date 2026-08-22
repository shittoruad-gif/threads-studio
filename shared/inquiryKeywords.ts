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

/**
 * 来店を伴わない業種（Web制作・広告運用・オンライン等）の合言葉。
 *
 * ACTIVE_INQUIRY_KEYWORDS には「予約」「空き状況」「アクセス」が含まれるが、
 * これらは来店型の店舗にしか成立しない。B2Bの事業者アカウントで
 * 「『予約』とメッセージしてください」と案内してしまう誤りが実際に起きた
 * （2026-08-22 検出。株式会社しっとるのコメントで「予約」「空き状況」を案内）。
 *
 * 追加は末尾のみ・削除禁止（順番を変えると過去投稿との対応がずれる）。
 */
export const NON_LOCAL_INQUIRY_KEYWORDS = ['相談', '料金', '事例', '資料', '見積'] as const;

/**
 * scheduledPosts.id から、その投稿のコメントで案内した合言葉を返す（決定的）。
 *
 * @param postId  scheduledPosts.id
 * @param isLocalBusiness 来店型の業種か。false なら来店前提の語を使わない
 */
export function inquiryKeywordForPost(postId: number, isLocalBusiness = true): string {
  if (postId >= KEYWORD_SWITCH_POST_ID) {
    const list = isLocalBusiness ? ACTIVE_INQUIRY_KEYWORDS : NON_LOCAL_INQUIRY_KEYWORDS;
    return list[postId % list.length];
  }
  return LEGACY_INQUIRY_KEYWORDS[postId % LEGACY_INQUIRY_KEYWORDS.length];
}

/**
 * 流入計測コメントの本文を作る。案内できる公式LINEが無ければ null（コメントしない）。
 *
 * 以前は「プロフィールの固定投稿にある公式LINEから」という固定文だった。
 * 固定投稿にLINEが無い店舗や、そもそもLINEを持たない店舗でも同じ案内が出てしまい、
 * 読んだ人がどこにも辿り着けない状態になっていた（2026-08-22 検出）。
 *
 * @param postId scheduledPosts.id
 * @param opts.hasLineLink 公式LINEのリンクが登録されているか
 * @param opts.isLocalBusiness 来店型の業種か
 */
export function inquiryCommentText(
  postId: number,
  opts: { hasLineLink: boolean; isLocalBusiness?: boolean },
): string | null {
  if (!opts.hasLineLink) return null;
  const keyword = inquiryKeywordForPost(postId, opts.isLocalBusiness ?? true);
  return (
    `気になった方は、プロフィールのリンクにある公式LINEから「${keyword}」とメッセージしてください😊\n` +
    `そのままトークでご質問にお答えします。`
  );
}
