/**
 * ツリー投稿の試し（2026-11-02 三上様「学習用の3アカウントで、ツリーとふつうの投稿を2週間交互に出して比べる」）。
 *
 * 経緯：外部のThreads講座は「短い書き出し＋続きを返信（ツリー）」を勧め、社内の講座の知見も同じ3段（書き出し／中身／案内）を勧める。
 * 一方こちらの実測（114アカウント・12.9万投稿）では100字を超えると表示が3〜4割減るが、測ったのは1投稿で完結する投稿だけで、
 * ツリーは測っていない。自動の投稿は treeCount=0（本文だけ）で作っている（server/autoPostScheduler.ts）。
 *
 * そこで：
 *  - 学習用の3アカウントだけ、期間中は予約の投稿の id の偶奇で「ツリー／ふつう」を交互にする（奇数＝ツリー）。
 *    ツリー側は、出来上がった本文の最初の1文（50字以内）を1本目に、残りを2本目（1本目への返信）にする。文章は足さない・変えない。
 *    1文目が短すぎる・長すぎる、残りが短い投稿は分けられないので、ふつうのまま出す（集計でもツリーに数えない）。
 *  - お客様のアカウントは比べ終わるまで変えない。広げるかは結果を見て三上様が決める。
 *  - 集計 scripts/ops/tree-trial-report.mts（1本目の表示で比べる）。
 */
export const TREE_TRIAL = {
  accountIds: [10, 12, 36] as readonly number[],
  /** JSTの日付。この日から until の日まで（両端を含む） */
  start: "2026-11-03",
  until: "2026-11-16",
} as const;

const JST = 9 * 3600_000;
const jstYmd = (now: number) => new Date(now + JST).toISOString().slice(0, 10);

export function inTreeTrial(threadsAccountId: number, now = Date.now()): boolean {
  const ymd = jstYmd(now);
  return TREE_TRIAL.accountIds.includes(Number(threadsAccountId)) && ymd >= TREE_TRIAL.start && ymd <= TREE_TRIAL.until;
}

/** 交互の割り当て：予約の投稿の id が奇数＝ツリー／偶数＝ふつう */
export function treeArm(postId: number): "tree" | "single" {
  return Number(postId) % 2 === 1 ? "tree" : "single";
}

export const TREE_ROOT_MIN = 8;
export const TREE_ROOT_MAX = 50;
export const TREE_REST_MIN = 20;

/**
 * 本文を「1本目（最初の1文・50字以内）」と「2本目（残り）」に分ける。分けられなければ null。
 * 区切りは改行か文末（。！？!?）。1文目が8字未満なら次の区切りまで含める（50字以内に収まる間だけ）。
 */
export function treeSplit(text: string | null | undefined): [string, string] | null {
  const s = String(text || "").trim();
  if (!s) return null;
  const chars = Array.from(s);
  for (let i = 0; i < chars.length && i < TREE_ROOT_MAX + 1; i++) {
    const ch = chars[i];
    const isBreak = ch === "\n" || /[。！？!?]/.test(ch);
    if (!isBreak) continue;
    // 「！？」「。」」のように続く記号・閉じかっこは1本目に含める
    let end = ch === "\n" ? i : i + 1;
    while (end < chars.length && /[！？!?。」』）)]/.test(chars[end])) end++;
    const root = chars.slice(0, end).join("").trim();
    const rest = chars.slice(end).join("").trim();
    const rl = Array.from(root).length;
    if (rl > TREE_ROOT_MAX) return null;
    if (rl < TREE_ROOT_MIN) continue;
    if (Array.from(rest).length < TREE_REST_MIN) return null;
    return [root, rest];
  }
  return null;
}
