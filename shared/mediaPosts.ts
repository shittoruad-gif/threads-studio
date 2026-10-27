/**
 * 写真・動画を使った自動投稿（2026-10-26 三上様）。
 *  - 写真：Threads Studio のプロ以上（プロ・ビジネス。特別価格・モニター価格も含む）の方だけ
 *  - 動画：Threads Studio のプロ以上で、マカセルを契約している方（マカセル側の判定はマカセルが行ってから送る）
 *  - まずは試し（mode=trial：運営の会員だけ）。数字を見てからお客様に広げる
 *  - 2026-10-28 三上様：新しい契約はプロ以上だけになるため mode=on にした。プロ以上の方は全員が対象。
 *    写真・動画を預けていない方は、これまでと何も変わらない（付ける物が無ければ普段どおりの投稿）。
 *    trialUserIds はプランに関係なく使える運営の会員として残す。
 *
 * 1日のうち1本だけ、預かった写真・動画を付けて出す。同じものは MEDIA_POSTS.reuseDays 日あける。
 * 写真・動画の中身に合った短い文を書く（説明しすぎない・効果の話をしない・写っている人のことを書かない）。
 * 実測の根拠：Threads 運用者114アカウントの分析で、動画は1.6倍見られ反応7倍・使っている投稿は0.8%だけ。
 */
export const MEDIA_POSTS = {
  /** trial＝trialUserIds だけ／on＝プロ以上の全員＋trialUserIds（2026-10-28〜 on） */
  mode: "on" as "trial" | "on",
  trialUserIds: [78] as readonly number[],
  /** 1日に写真・動画を付ける本数 */
  perDay: 1,
  /** 同じ写真・動画を使ったあと、あける日数 */
  reuseDays: 14,
  /** 1人が預けられる数（古いものから使わなくなる） */
  maxItemsPerUser: 200,
  /** 写真の大きさの上限（バイト・LINEの写真は多くが1MB以下） */
  maxImageBytes: 8 * 1024 * 1024,
} as const;

/** プロ以上のプラン（写真・動画の自動投稿が使える） */
export function isProOrAbove(planId: string | null | undefined): boolean {
  const p = String(planId ?? "");
  return /^(pro|business)(_|$)/.test(p);
}

export function mediaPostsEnabledFor(userId: number, planId: string | null | undefined): boolean {
  if (MEDIA_POSTS.trialUserIds.includes(userId)) return true;
  if (MEDIA_POSTS.mode !== "on") return false;
  return isProOrAbove(planId);
}

export interface MediaCandidate { id: number; kind: string; usedCount: number; lastUsedAt: Date | null; createdAt: Date; enabled: number }

/** 次に使う写真・動画（使える・あけた日数を過ぎた・使った回数が少ない・古い順） */
export function pickMedia<T extends MediaCandidate>(items: readonly T[], now: number = Date.now()): T | null {
  const gap = MEDIA_POSTS.reuseDays * 86_400_000;
  const ok = items.filter((m) => m.enabled === 1 && (!m.lastUsedAt || now - new Date(m.lastUsedAt).getTime() >= gap));
  if (ok.length === 0) return null;
  // 動画を先に（伸びやすい）・次に使った回数が少ないもの・同じなら古いもの
  return [...ok].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "video" ? -1 : 1) || a.usedCount - b.usedCount || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0]!;
}

/** 生成プロンプトの末尾に足す文 */
export function mediaPostNote(kind: string, description: string | null | undefined): string {
  const what = kind === "video" ? "動画" : "写真";
  const desc = String(description ?? "").trim();
  return [
    "",
    "",
    `【★今回は${what}を1つ付けて出す回（ここまでの長さ・切り口の指示より優先）】`,
    desc ? `- 付ける${what}の中身：${desc.slice(0, 300)}` : `- 付ける${what}は、お店の${what}です（中身の説明はありません）。`,
    `- ${what}を見た人が一言返したくなる、短い文（20〜80字・1〜3行）にする。${what}の説明を全部書かない（見れば分かることは書かない）。`,
    `- ${what}に写っていることだけを手がかりにする。写っていない物・人・数字・効果は書かない。写っている人の名前・様子・体のことは書かない。`,
    "- 宣伝の言葉・予約の案内・URL・ハッシュタグは書かない。最後は小さな問いかけか、ひとことの感想で終える。",
  ].join("\n");
}

/** 写真の中身をAIに一言で説明させるときの指示（投稿文ではなく、選ぶ・書くための材料） */
export const DESCRIBE_PROMPT =
  "この写真に写っているものを、日本語で1〜2文・60字以内で説明してください。お店の中・外・道具・料理・季節の物など、見えるものだけを書く。人が写っていれば「人が写っている」とだけ書き、顔・年齢・体のことは書かない。推測で場所や店名を書かない。";
