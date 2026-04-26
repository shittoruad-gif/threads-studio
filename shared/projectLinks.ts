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
