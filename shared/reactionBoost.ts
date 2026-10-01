/**
 * 1か月動かしても反応（いいね・再投稿）が取れていないアカウントの改善（2026-10-02 三上様指示）。
 *
 * > 「明らかに1ヵ月動いたりして、反応が取れていないアカウントに関しては改善を行うようにしてください。
 * >  改善が行われないと、リピートや継続もないと思うので」
 *
 * 実測（2026-10-02・直近30日・自動投稿と本人投稿 1,507本。いいねはアカウント内の平均を1とした比）:
 *   - アプリが作った投稿 0.76 ／ ご本人の投稿 1.72
 *   - 切り口：地元 1.51・数字/実績 1.65・裏側 1.19・人柄 1.03 ／ 小ワザ 0.33・悩みの深掘り 0.31・変化の話 0.41
 *   - 長さ：50字以下 いいね1.59・表示2.00 ／ 101〜150字 0.66・0.59
 *   - 宣伝の言葉（予約・LINE・ご来院・お問い合わせ）が入る投稿 いいね0.79・表示0.71
 * それまでの学習は「表示回数」だけを見ていて、反応は学習に入っていなかった。
 * また1アカウント分のデータだけで判断していたため、本数の少ない切り口には学習が効かなかった。
 *
 * やること：
 *   1. 全アカウントについて、切り口の重みに「反応」も掛ける（自分のデータが貯まるほど効く・穏やか）
 *   2. 反応が取れていないアカウントには、全アカウントの実測（他店で反応が取れている切り口）を先に効かせ、
 *      幅も強くする。あわせて、短く・宣伝の言葉を入れず・地域名を入れる指示を足す
 */

/** 反応が取れていないアカウントの判定（判断基準台帳 docs/scaling-thresholds.md にも記載） */
export const LOW_REACTION = {
  /** 連携からこの日数を過ぎたら判定する（立ち上がりの3週間は見ない） */
  minDays: 21,
  /** 直近30日でこの本数以上出ていること（本数が少ないうちは偶然のブレが大きい） */
  minPosts: 20,
  /** 1投稿あたりの反応（いいね＋再投稿）がこれ未満なら「反応が取れていない」。
   *  2026-10-02 実測：反応が取れている店 0.47〜3.6 ／ 取れていない店 0.08〜0.30 */
  maxReactionsPerPost: 0.35,
} as const;

export interface ReactionStatus {
  linkedDays: number;
  posts: number;
  reactions: number;
}

export function isLowReaction(s: ReactionStatus | null | undefined): boolean {
  if (!s) return false;
  if (s.linkedDays < LOW_REACTION.minDays || s.posts < LOW_REACTION.minPosts) return false;
  return s.reactions / s.posts < LOW_REACTION.maxReactionsPerPost;
}

/** 全アカウントの実測：切り口ごとの反応（アカウント内平均を1とした比）と本数 */
export type PooledReactions = Record<string, { ratio: number; count: number }>;

export interface PostReactionRow {
  accountId: number;
  angle: string | null;
  reactions: number;
}

/**
 * 全アカウントの投稿から、切り口ごとの反応の比を出す。
 * アカウントごとに平均を1にそろえてから平均する（反応の多い店に引っ張られないように）。
 * 平均が0のアカウント（まだ1件も反応が無い）は比が出せないので除く。
 */
export function computePooledReactions(rows: readonly PostReactionRow[]): PooledReactions {
  const byAcc = new Map<number, PostReactionRow[]>();
  for (const r of rows) {
    if (!r.angle) continue;
    const xs = byAcc.get(r.accountId) ?? [];
    xs.push(r);
    byAcc.set(r.accountId, xs);
  }
  const sums: Record<string, { total: number; count: number }> = {};
  for (const xs of Array.from(byAcc.values())) {
    const mean = xs.reduce((s, r) => s + (Number(r.reactions) || 0), 0) / xs.length;
    if (!(mean > 0)) continue;
    for (const r of xs) {
      const k = String(r.angle);
      (sums[k] ??= { total: 0, count: 0 });
      sums[k].total += (Number(r.reactions) || 0) / mean;
      sums[k].count += 1;
    }
  }
  const out: PooledReactions = {};
  for (const [k, v] of Object.entries(sums)) out[k] = { ratio: v.total / v.count, count: v.count };
  return out;
}

/** 全アカウントの実測を使うのに要る本数（これ未満の切り口は1として扱う） */
export const POOLED_MIN_COUNT = 20;

/**
 * 切り口の重みに掛ける「反応」の倍率。
 *   own：このお店の切り口ごとの平均反応と全体平均（3件で効き始め8件で満額）
 *   pooled：全アカウントの実測（反応が取れていないアカウントだけ使う）
 * 反応が取れていないアカウントは 0.35〜2.0、それ以外は 0.6〜1.5 の幅に収める。
 */
export function reactionMultiplier(
  angleId: string,
  own: { avgReactions?: number; count: number } | undefined,
  ownOverallAvg: number | undefined,
  pooled: PooledReactions | undefined,
  low: boolean,
): number {
  const conf = own && own.count >= 3 && (ownOverallAvg ?? 0) > 0 && own.avgReactions != null
    ? Math.min(1, (own.count - 2) / 6)
    : 0;
  const ownRatio = conf > 0 ? (own!.avgReactions as number) / (ownOverallAvg as number) : 1;
  const p = low ? pooled?.[angleId] : undefined;
  const prior = p && p.count >= POOLED_MIN_COUNT ? p.ratio : 1;
  const blended = conf * ownRatio + (1 - conf) * prior;
  const [lo, hi] = low ? [0.35, 2.0] : [0.6, 1.5];
  return Math.min(hi, Math.max(lo, blended));
}

/** 宣伝の言葉を避けない切り口（予約への案内そのものが目的の回） */
const PROMO_ALLOWED_ANGLES = new Set(["reservation_funnel", "pinned"]);

/** 登録の地域（住所のこともある）から、投稿に入れる地域名を取り出す（「茨城県土浦市神立中央1丁目」→「土浦市」） */
export function shortArea(raw: string | null | undefined): string {
  const t = String(raw ?? "").split(/[\n、,／/]/)[0].trim();
  if (!t) return "";
  const m = t.match(/^(?:.{2,3}?[都道府県])?(.+?[市区町村])/);
  if (m) return m[1];
  return t.slice(0, 12);
}

/**
 * 「ひとこと」の回（2026-10-02 三上様共有の @renkinlabo01 の公開投稿から：
 *  いちばん反応を取っていたのは、読み手を肯定する短い一言だった。自社の実測でも50字以下は表示2.00倍・いいね1.59倍）。
 * 反応が取れていないアカウントの「地元」「人柄」の回を、1日おきに20〜40字の一言にする。
 */
export const ONE_LINER_ANGLES: ReadonlySet<string> = new Set(["local", "personality"]);

export function isOneLinerTurn(angleId: string | null | undefined, slot: number, now: Date = new Date()): boolean {
  if (!ONE_LINER_ANGLES.has(String(angleId ?? ""))) return false;
  const jstDay = Math.floor((now.getTime() + 9 * 3600_000) / 86400_000);
  return (jstDay + Math.max(0, Math.floor(slot) || 0)) % 2 === 0;
}

/** 反応が取れていないアカウントの生成に足す指示（短め・宣伝の言葉なし・地域名） */
export function lowReactionNote(opts: { angleId?: string | null; area?: string | null; shortLength: boolean; oneLiner?: boolean }): string {
  const lines = ["", "", "【反応を取りにいく回（このアカウントは1か月動かして反応が少ないため・厳守）】"];
  if (opts.shortLength && opts.oneLiner) {
    lines.push("- 今回は「ひとこと」の回。本文は20〜40字・1〜2行だけ。読んだ地元の人が「自分のことだ」「ちょっと得した」と思える一言にする。説明・理由・締めの挨拶は足さない。");
  } else if (opts.shortLength) {
    lines.push("- 本文は60字前後（長くても80字）。言いたいことを1つだけにして、説明を足さない。");
  }
  if (!PROMO_ALLOWED_ANGLES.has(String(opts.angleId ?? ""))) {
    lines.push("- 「予約」「LINE」「ご来院」「お問い合わせ」など、来てもらうための言葉は入れない（入ると反応が下がる）。");
  }
  const area = shortArea(opts.area);
  if (area) lines.push(`- 地域名（${area.slice(0, 20)}）を、自然な形で1回入れる（地元の人に向けた話だと分かると反応が上がる）。`);
  lines.push("- 先生・スタッフ本人の目線で、今日あったこと・思ったことのように書く。教科書の説明口調にしない。");
  return lines.join("\n");
}
