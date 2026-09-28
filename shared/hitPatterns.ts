/**
 * 他店の当たり型（2026-09-28 三上様指示）。
 *
 *   「伸びた投稿は、他のクライアントの伸びた投稿も含めてブラッシュアップしていくと良い」
 *   「一度ムーブアクトの店舗で何個か試してみて、1日5投稿とかになってもいいので」
 *   「そら先生と株式会社しっとるのアカウントもそれで」
 *
 * 決まり
 *  - 当たり＝そのアカウントの普段（中央値）の2倍以上読まれた投稿。店の大きさで偏らないよう、閲覧数の絶対値では選ばない
 *  - 取り出すのは「型」（1行目の形・構成・締め・長さ）だけ。本文・店名・地名・数字・体験談は生成に渡さない
 *    （他のお客様の文がそのまま出る／他店の事実を自店のことのように書く、を防ぐ）
 *  - 「今日の地元の出来事」「空き枠」など、その場の事実が要る型は使わない（アプリはその事実を知らないため作り話になる）
 *  - 同じ業種のまとまり（health／beauty／recruit／other）の型だけを使う
 *  - 試しは下の4アカウントだけ。契約の3本はそのまま（投稿時間の試験中）で、4本目・5本目をこの型で作る
 */

export const HIT_PATTERN_ANGLE_ID = "hit_pattern";
export const HIT_RATIO = 2;
export const HIT_MIN_CHARS = 30;

/** 試しの対象：Moveact 玉島・金光、そら先生（滝本様）、しっとる公式。期限はJSTの終日まで */
export const HIT_PATTERN_TRIAL = {
  accountIds: [10, 12, 11, 36] as readonly number[],
  until: "2026-10-27",
  extraSlots: 2,
};

export type BusinessGroup = "health" | "beauty" | "recruit" | "other";

export function businessGroupOf(businessType: string | null | undefined, opts: { recruiting?: boolean } = {}): BusinessGroup {
  if (opts.recruiting) return "recruit";
  const t = String(businessType ?? "");
  if (/(整体|整骨|接骨|鍼|灸|はり|きゅう|カイロ|治療|リハビリ|ピラティス|マッサージ|トレーニング|ジム|ヨガ)/.test(t)) return "health";
  if (/(エステ|美容|脱毛|ネイル|まつ|まつげ|小顔|ヘア|美容室|サロン)/.test(t)) return "beauty";
  return "other";
}

export function inHitPatternTrial(accountId: number, now: number = Date.now()): boolean {
  if (!HIT_PATTERN_TRIAL.accountIds.includes(accountId)) return false;
  const until = Date.parse(HIT_PATTERN_TRIAL.until + "T23:59:59+09:00");
  return Number.isFinite(until) && now <= until;
}

/** この枠を当たり型で作るか。契約の本数（contractCount）より後ろの枠だけ */
export function isHitPatternSlot(accountId: number, slotIndex: number, contractCount: number, now: number = Date.now()): boolean {
  return inHitPatternTrial(accountId, now) && slotIndex >= contractCount && slotIndex < contractCount + HIT_PATTERN_TRIAL.extraSlots;
}

export type HitCandidate = { threadsPostId: string; accountId: number; impressions: number; ratio: number; text: string };

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** その場の事実が要る投稿（今日の出来事・空き枠・日付・天気・イベント）。型にしない */
export const LIVE_FACT_RE = /(今日|本日|明日|今週|今夜|今朝|空き|空いて|残り\d|先着|募集|まつり|祭り|大会|台風|雨|雪|連休|シルバーウィーク|お盆|年末|\d{1,2}\s*[\/月]\s*\d{1,2}|\d{1,2}時)/;

/**
 * アカウントごとに中央値を出し、2倍以上読まれた投稿を当たりとして返す。
 * Meta AI への呼びかけ・短すぎる投稿・その場の事実が要る投稿は外す。
 */
export function selectHitCandidates(
  posts: ReadonlyArray<{ threadsPostId: string; accountId: number; impressions: number; text: string | null }>,
  opts: { minPostsPerAccount?: number } = {},
): HitCandidate[] {
  const minPosts = opts.minPostsPerAccount ?? 8;
  const byAcc = new Map<number, typeof posts[number][]>();
  for (const p of posts) {
    const text = String(p.text ?? "");
    if (!text.trim() || /@meta\.ai/i.test(text)) continue;
    const list = byAcc.get(p.accountId) ?? [];
    list.push(p);
    byAcc.set(p.accountId, list);
  }
  const out: HitCandidate[] = [];
  for (const [accountId, list] of Array.from(byAcc.entries())) {
    if (list.length < minPosts) continue;
    const med = median(list.map((p) => Number(p.impressions) || 0));
    if (med <= 0) continue;
    for (const p of list) {
      const text = String(p.text ?? "").trim();
      const imp = Number(p.impressions) || 0;
      if (imp < med * HIT_RATIO) continue;
      if (Array.from(text).length < HIT_MIN_CHARS) continue;
      if (LIVE_FACT_RE.test(text)) continue;
      out.push({ threadsPostId: p.threadsPostId, accountId, impressions: imp, ratio: Math.round(imp / med), text });
    }
  }
  return out.sort((a, b) => b.ratio - a.ratio);
}

/**
 * 型に元の本文が漏れていないか。元の本文の連続した8文字（空白・記号を除く）が型に入っていたら漏れとみなす。
 */
export function leaksSource(pattern: string, source: string, n: number = 8): boolean {
  const norm = (s: string) => String(s).replace(/[\s「」『』（）()、。！？!?…・\-—:：]/g, "");
  const p = norm(pattern);
  const src = Array.from(norm(source));
  for (let i = 0; i + n <= src.length; i++) {
    if (p.includes(src.slice(i, i + n).join(""))) return true;
  }
  return false;
}

export const BANNED_DIRECTION_RE = /(否定|根本|改善|治る|治す|治療効果|効果|逆効果|批判|意味がない|意味ない|無駄|ビフォー|アフター|劇的)/;

/** 型として使えるか（漏れ・固有の事実・その場の事実が無いこと） */
/** 健康系のお店では、結果・体験談を語る型は使わない（切り口 change_story／customer_voice を外しているのと同じ理由・2026-09-08 の削除） */
export const HEALTH_OUTCOME_RE = /(事例|体験|結果|復帰|回復|良くなっ|改善例|お客様の声|患者さんの声|変化を)/;

export function validatePattern(pattern: string, source: string, group?: BusinessGroup): { ok: true } | { ok: false; reason: string } {
  const t = String(pattern ?? "").trim();
  if (Array.from(t).length < 40) return { ok: false, reason: "型が短すぎる" };
  if (Array.from(t).length > 600) return { ok: false, reason: "型が長すぎる" };
  if (leaksSource(t, source)) return { ok: false, reason: "元の本文が型に残っている" };
  if (/(市|町|村|区|駅|県)[^\s]{0,3}(で|の|に)/.test(t) && /[一-龠]{2,}(市|町|村|区|駅)/.test(t)) return { ok: false, reason: "地名が入っている" };
  if (/\d{2,}/.test(t)) return { ok: false, reason: "具体的な数字が入っている" };
  // 効果の言い切り・他の方法の否定に向かう型は使わない（健康表現のガードで落ちる方向・2026-09-28 試しの表示で見つけた）
  if (group === "health" && HEALTH_OUTCOME_RE.test(t)) return { ok: false, reason: `健康系のお店で結果・体験談を語る型（${t.match(HEALTH_OUTCOME_RE)?.[0]}）` };
  if (BANNED_DIRECTION_RE.test(t)) return { ok: false, reason: `言い切り・否定に向かう型（${t.match(BANNED_DIRECTION_RE)?.[0]}）` };
  return { ok: true };
}

/** 生成に渡す切り口（本文の例は渡さない。型だけ） */
export function buildHitPatternAngle(pattern: string): { id: string; label: string; hint: string } {
  return {
    id: HIT_PATTERN_ANGLE_ID,
    label: "他店で読まれた型",
    hint:
      "同じ業種の別のお店で、そのお店の普段の2倍以上読まれた投稿の「型」で書く。型（1行目の形・段の順番・締め方・長さ）だけを真似し、"
      + "中身はこの店の入力情報だけで書く。型に合う事実が入力情報に無い段は、無理に埋めずに省く。\n【型】\n" + String(pattern).trim(),
  };
}
