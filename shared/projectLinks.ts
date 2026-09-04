/**
 * Project link types and helpers.
 *
 * Users register their important URLs (LINE official account, web
 * reservation page, official site, etc.) once on a project and we reuse
 * them across pinned posts and auto-generated posts. Each link is tagged
 * with a `type` so the UI can show a clear icon/label and the AI can
 * choose the right one based on context (e.g. pinned post → LINE).
 */

export type ProjectLinkType =
  | 'line'         // LINE公式アカウント（CV直結度最高）
  | 'reservation'  // Web予約ページ（HotPepper Beauty / オリジナル予約フォーム等）
  | 'website'      // 公式ホームページ
  | 'instagram'    // Instagramプロフィール
  | 'youtube'      // YouTubeチャンネル
  | 'other';       // その他（ECサイト、地図、Form等）

export interface ProjectLink {
  /** Stable client-generated id (uuid-ish). */
  id: string;
  type: ProjectLinkType;
  /** User-facing short label. e.g. "LINE登録" "予約はこちら" "公式HP". */
  label: string;
  url: string;
  /**
   * Marks this link as the default for its `type`. Only one link per type
   * can be default at once (enforced by helpers below).
   */
  isDefault?: boolean;
  /**
   * お客様ご自身が選んだ「いちばん来てほしい案内先」。
   *
   * ★これが付いているリンクが、固定投稿のコメント欄と毎日の投稿のCTAに
   *   使われる。付いていないときだけ、下の PINNED_PRIORITY で自動判定する。
   *   自動判定だと、公式LINEに集めたいお客様でも予約ページが選ばれてしまう
   *   ことがあり、お客様に選んでいただく形にした（2026-09-04 三上様指示）。
   *
   * 全リンクを通して1つだけ（setPrimaryLink で担保）。
   */
  isPrimary?: boolean;
}

export interface ProjectLinkTypeConfig {
  type: ProjectLinkType;
  /** Display name in UI dropdowns / labels. */
  name: string;
  /** Single emoji that visually identifies this link type at a glance. */
  emoji: string;
  /** Short hint shown next to the input field. */
  hint: string;
  /** When true, the AI prefers this type for CV-focused posts (pinned, offer). */
  preferForCv?: boolean;
}

export const LINK_TYPES: Record<ProjectLinkType, ProjectLinkTypeConfig> = {
  line: {
    type: 'line',
    name: 'LINE公式',
    emoji: '💬',
    hint: '例: https://lin.ee/xxxxx',
    preferForCv: true,
  },
  reservation: {
    type: 'reservation',
    name: 'Web予約',
    emoji: '📅',
    hint: '例: https://beauty.hotpepper.jp/...',
    preferForCv: true,
  },
  website: {
    type: 'website',
    name: '公式HP',
    emoji: '🌐',
    hint: '例: https://your-shop.com',
  },
  instagram: {
    type: 'instagram',
    name: 'Instagram',
    emoji: '📷',
    hint: '例: https://instagram.com/your_handle',
  },
  youtube: {
    type: 'youtube',
    name: 'YouTube',
    emoji: '🎬',
    hint: '例: https://youtube.com/@your_channel',
  },
  other: {
    type: 'other',
    name: 'その他',
    emoji: '🔗',
    hint: '地図・フォーム・ECサイト など',
  },
};

export const LINK_TYPES_LIST = Object.values(LINK_TYPES);

/**
 * Parse the `links` column (stored as JSON text) into a typed array.
 * Returns [] for null / empty / malformed input so callers don't need to
 * defensively check.
 */
export function parseProjectLinks(raw: string | null | undefined): ProjectLink[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((l): l is ProjectLink =>
      l && typeof l === 'object'
      && typeof l.id === 'string'
      && typeof l.type === 'string'
      && typeof l.label === 'string'
      && typeof l.url === 'string'
    );
  } catch {
    return [];
  }
}

/**
 * Pick the best link to use for a given context.
 *  - Prefers the default-marked link for the requested type.
 *  - Falls back to the first link of that type.
 *  - Falls back to any default-marked link of any type.
 *  - Returns undefined if there are no links at all.
 */
export function pickLinkForContext(
  links: ProjectLink[],
  preferType: ProjectLinkType,
): ProjectLink | undefined {
  if (links.length === 0) return undefined;
  const sameType = links.filter(l => l.type === preferType);
  return (
    sameType.find(l => l.isDefault)
    ?? sameType[0]
    ?? links.find(l => l.isDefault)
    ?? links[0]
  );
}

/**
 * After mutating `links`, normalise so at most one link per type carries
 * `isDefault: true`.
 */
export function normaliseDefaults(links: ProjectLink[]): ProjectLink[] {
  const seenDefaultByType = new Set<ProjectLinkType>();
  return links.map(l => {
    if (l.isDefault) {
      if (seenDefaultByType.has(l.type)) {
        return { ...l, isDefault: false };
      }
      seenDefaultByType.add(l.type);
    }
    return l;
  });
}

/**
 * 固定投稿の「案内先」を決める。
 *
 * ★以前は公式LINE（type='line'）だけを見ていたため、公式LINEを登録していない
 *   お客様や、ホームページ・予約ページへ流したいお客様でも、
 *   固定投稿の締めが必ず「公式LINEから」になっていた（2026-09-04 三上様指摘）。
 *   登録されているリンクの種類を読み取り、その行き先に合った言い回しを返す。
 *
 * 優先順位: 予約・LINE（申し込みに直結）→ その他 → HP・SNS。
 * 同じ種類が複数あれば「既定」に印が付いたものを優先する。
 */
export interface PinnedDestination {
  link: ProjectLink;
  /** コメント欄に添える1行（この下にURLが続く） */
  commentLead: string;
  /** 本文の締めに使う言い回し（20字前後） */
  ctaLine: string;
  /** プロンプトに渡す誘導先の呼び名 */
  channelName: string;
}

const PINNED_WORDING: Record<ProjectLinkType, { comment: string; cta: string; channel: string }> = {
  line: {
    comment: 'ご登録・ご相談はこちらから↓',
    cta: 'ご相談はコメント欄のリンクからどうぞ。',
    channel: '公式LINE',
  },
  reservation: {
    comment: 'ご予約はこちらから↓',
    cta: 'ご予約はコメント欄のリンクからどうぞ。',
    channel: 'Web予約ページ',
  },
  website: {
    comment: 'くわしくはこちらをご覧ください↓',
    cta: 'くわしくはコメント欄のリンクをご覧ください。',
    channel: '公式ホームページ',
  },
  instagram: {
    comment: 'ふだんの様子はこちらから↓',
    cta: 'ふだんの様子はコメント欄のリンクから。',
    channel: 'Instagram',
  },
  youtube: {
    comment: '動画はこちらから↓',
    cta: '動画はコメント欄のリンクからご覧ください。',
    channel: 'YouTubeチャンネル',
  },
  other: {
    comment: 'くわしくはこちらから↓',
    cta: 'くわしくはコメント欄のリンクからどうぞ。',
    channel: 'ご案内ページ',
  },
};

/** 固定投稿の案内先として使う優先順（申し込みに近い順） */
const PINNED_PRIORITY: ProjectLinkType[] = ['reservation', 'line', 'other', 'website', 'instagram', 'youtube'];

/**
 * お客様が明示的に選んだ案内先を返す。選ばれていなければ undefined。
 * 「自動で決まっている」のか「ご自身で選ばれた」のかを画面で出し分けるため、
 * 自動判定へのフォールバックはここでは行わない。
 */
export function getPrimaryLink(links: ProjectLink[]): ProjectLink | undefined {
  return links.find((l) => l.isPrimary && !!l.url);
}

/**
 * 案内先を1つだけ選び直す。指定IDが無ければ全解除（＝自動判定に戻す）。
 */
export function setPrimaryLink(links: ProjectLink[], id: string | null): ProjectLink[] {
  return links.map((l) => ({ ...l, isPrimary: id !== null && l.id === id }));
}

/** 自動判定だとどれが選ばれるか（お客様の明示選択は見ない） */
export function autoPinnedLink(links: ProjectLink[]): ProjectLink | undefined {
  const usable = links.filter((l) => !!l.url);
  if (usable.length === 0) return undefined;
  for (const t of PINNED_PRIORITY) {
    const same = usable.filter((l) => l.type === t);
    if (same.length > 0) return same.find((l) => l.isDefault) ?? same[0];
  }
  return usable.find((l) => l.isDefault) ?? usable[0];
}

export function pickPinnedDestination(links: ProjectLink[]): PinnedDestination | undefined {
  const usable = links.filter((l) => !!l.url);
  if (usable.length === 0) return undefined;
  // ★お客様がお選びになった先を最優先。無いときだけ自動判定。
  const link: ProjectLink | undefined = getPrimaryLink(usable) ?? autoPinnedLink(usable);
  if (!link) return undefined;
  const w = PINNED_WORDING[link.type] ?? PINNED_WORDING.other;
  // 「その他」はお客様が付けたラベル（例:「初回ご相談フォーム」）をそのまま活かす
  const labeled = link.type === 'other' && link.label && link.label.length <= 14;
  return {
    link,
    commentLead: labeled ? `${link.label}はこちらから↓` : w.comment,
    ctaLine: labeled ? `${link.label}はコメント欄のリンクからどうぞ。` : w.cta,
    channelName: labeled ? link.label : w.channel,
  };
}
