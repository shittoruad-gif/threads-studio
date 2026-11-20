/**
 * 解約の前に、理由に合う提案を1画面だけ出す（2026-11-20 三上様「クライアントが解約申請をしたときに、引き止めるための施策を考えて」「進めて」）。
 *
 * 11/20 時点：理由のアンケートのあと、そのまま解約が実行されていた。運営への知らせ
 * 「引き止められる可能性があれば早めのご連絡を」が届く時点で、解約は終わっていた。
 *
 * 決まり：
 *  - 提案は1画面だけ。断れば、その画面のボタン1つで解約できる（解約をしにくくしない）。
 *  - 理由ごとに提案を変える。料金の数字はここに書かない（料金の画面が唯一の正）。
 *  - 値引きでの引き止めはしない。
 *  - 選ばれた提案は cancellationFeedback に1行足して数える（detail の頭に RETENTION_MARK）。
 */

export type CancelReason = 'price' | 'no_effect' | 'hard_to_use' | 'pause' | 'other';
/** review＝担当者が投稿を見直す／downgrade＝下のプランへ／auto＝確認なしの自動投稿へ／consult＝担当者に相談 */
export type RetentionOfferKey = 'review' | 'downgrade' | 'auto' | 'consult';

export interface RetentionOffer {
  key: RetentionOfferKey;
  title: string;
  body: string;
  actionLabel: string;
}

export const RETENTION_MARK = '【解約の前の提案を選択】';

export const RETENTION_OFFER_LABEL: Record<RetentionOfferKey, string> = {
  review: '担当者が投稿を見直す',
  downgrade: '下のプランに変える',
  auto: '確認なしの自動投稿に切り替える',
  consult: '担当者に相談する',
};

/** 上のプランか（下のプランへの変更を提案できるか） */
export function isUpperPlan(planId: string | null | undefined): boolean {
  return /^pro/.test(String(planId || ''));
}

/**
 * 理由に合う提案を1つ返す。
 *   planId … いまのプラン（下のプランの方には、プラン変更を出さない）
 *   requireApproval … 投稿のたびに確認する設定か（確認なしの方には、切り替えを出さない）
 */
export function retentionOfferFor(reason: CancelReason, ctx: { planId?: string | null; requireApproval?: boolean } = {}): RetentionOffer {
  if (reason === 'no_effect') {
    return {
      key: 'review',
      title: '担当者が投稿を見直します',
      body: 'これまでの投稿と反応を担当者が確かめ、お店の材料を入れ直して、投稿の内容を変えます。費用はかかりません。公式LINEでご連絡します。',
      actionLabel: '見直してもらう（解約しない）',
    };
  }
  if (reason === 'price' && isUpperPlan(ctx.planId)) {
    return {
      key: 'downgrade',
      title: '下のプランで続けられます',
      body: '投稿の本数を減らした下のプランがあります。料金の画面で、金額と内容を確かめてから変更できます。',
      actionLabel: '料金の画面で確かめる（解約しない）',
    };
  }
  if (reason === 'hard_to_use' && ctx.requireApproval) {
    return {
      key: 'auto',
      title: '確認なしの自動投稿にできます',
      body: 'いまは投稿のたびに確認をお願いしています。切り替えると、確認の操作なしで毎日自動で投稿されます。あとから元に戻せます。',
      actionLabel: '自動投稿に切り替える（解約しない）',
    };
  }
  if (reason === 'pause') {
    return {
      key: 'consult',
      title: 'お休みは担当者にご相談ください',
      body: 'しばらく止めたい期間と理由を伺い、できる形を担当者からご案内します。公式LINEでご連絡します。',
      actionLabel: '相談する（解約しない）',
    };
  }
  return {
    key: 'consult',
    title: '担当者にご相談いただけます',
    body: 'お困りの点を伺い、こちらで直せることがあればすぐに対応します。公式LINEでご連絡します。',
    actionLabel: '相談する（解約しない）',
  };
}

/** 選ばれた提案を記録する1行（数えるときは RETENTION_MARK で始まる行を見る） */
export function retentionDetail(key: RetentionOfferKey, detail?: string | null): string {
  const d = String(detail ?? '').trim();
  return `${RETENTION_MARK}${RETENTION_OFFER_LABEL[key]}${d ? `／${d}` : ''}`;
}
