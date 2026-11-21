/**
 * ランキング型の試し（2026-11-21 三上様「試して」）。
 *
 * 経緯：よく読まれている外部のアカウントを調べると、当たり外れが小さいのは「BEST5 を順位の途中で切って、続きを返信に書く」型だった
 *   （1本あたり6万〜12万表示）。一方こちらのツリーの試し（shared/treeTrial.ts・11/3〜11/16）は、ふつうの本文を
 *   「最初の1文／残り」に機械的に分けただけで、店舗の2アカウントでは1本目の表示が2割ほど下がった（玉島0.81倍・金光0.76倍）。
 *   つまり「分ければ伸びる」ではない。続きを読む理由（順位）がある文章を、その切れ目で分けたときにどうなるかは、まだ測っていない。
 *
 * そこで：
 *  - 学習用の自社3アカウントだけ、期間中は1日1本（契約の本数のすぐ後ろ＝上乗せの1本目の枠）をランキング型（BEST3）で書く。
 *    書くのは既存の「試し」の仕組み（学習の枠と同じ・検査はすべて通常どおり）。書けなければ、その枠は今までどおりの作り方に戻る。
 *  - 公開のとき、予約の投稿の id の偶奇で「順位の切れ目で3本に分ける（ツリー）／1本のまま」を交互にする（奇数＝ツリー）。
 *    文章は足さない・変えない。足すのは、次の順位を予告する1行（「第2位は、」）だけ。
 *  - お客様のアカウントは変えない。広げるかは結果を見て三上様が決める。
 *  - 集計 scripts/ops/ranking-tree-report.mts（1本目の表示を、同じ期間のそのアカウントのふつうの投稿の中央値と比べる）。
 */
import type { LearningTrial } from "./learningAccounts";

export const RANKING_TREE = {
  accountIds: [10, 12, 36] as readonly number[],
  /** JSTの日付。この日から until の日まで（両端を含む） */
  start: "2026-11-22",
  until: "2026-12-12",
} as const;

export const RANKING_TRIAL_KEY = "ranking3";

export const RANKING_TRIAL: LearningTrial = {
  key: RANKING_TRIAL_KEY,
  label: "ランキング（BEST3）",
  note: [
    "この投稿は「BEST3」の形で書く。全体で120〜200字。",
    "1行目は題名：「（読む人の身近な場面や悩み）＋（順位の基準）BEST3」。順位の基準は、書き手の考えだと分かるもの（手軽な順・続けやすい順・気づきにくい順 など）にする。人数・割合・調査・人気の順位のように、数えた結果に見える基準にしない。",
    "題名のあとに空行を1つ入れ、「第3位　〇〇」「第2位　〇〇」「第1位　〇〇」の順に書く（必ずこの表記・この順・行の先頭）。それぞれ、名前のあとに改行して理由を1〜2文（各40字以内）で添える。順位と順位のあいだは空行を1つ。",
    "順位にするのは、読む人が今日できる身近なこと、または日常のよくある場面。「やってはいけないこと」「効かないこと」「まちがい」の順位にしない。湿布・薬・温める／冷やす・マッサージ・他の施術や他店のやり方の良し悪しは言わない。「根本」「原因に届く」「整える」のように、効果をにおわせる言葉は使わない。",
    "挙げる3つは、登録情報から言えること・だれでも確かめられる身近なことだけ。商品名・他店・研究や成分の話・数字のデータは書かない。お店が提供していないメニューや道具は書かない。",
    "第1位の理由のあとに、短い一言（20字以内）で終える。宣伝・予約の案内・問いかけにはしない。",
    "「。」のたびに改行する決まりはそのまま。順位の行に絵文字や記号（★・①など）は付けない。",
  ].join(""),
};

const JST = 9 * 3600_000;
const jstYmd = (now: number) => new Date(now + JST).toISOString().slice(0, 10);

export function inRankingTree(threadsAccountId: number, now = Date.now()): boolean {
  const ymd = jstYmd(now);
  return RANKING_TREE.accountIds.includes(Number(threadsAccountId)) && ymd >= RANKING_TREE.start && ymd <= RANKING_TREE.until;
}

/** ランキング型で書く枠：契約の本数のすぐ後ろ（上乗せの1本目）だけ。上乗せが無い日は対象なし */
export function isRankingSlot(threadsAccountId: number, slotIndex: number, contractCount: number, postCount: number, now = Date.now()): boolean {
  return inRankingTree(threadsAccountId, now) && slotIndex === contractCount && slotIndex < postCount;
}

/** 交互の割り当て：予約の投稿の id が奇数＝ツリー／偶数＝1本のまま */
export function rankingArm(postId: number): "tree" | "single" {
  return Number(postId) % 2 === 1 ? "tree" : "single";
}

const RANK_LINE = (n: 1 | 2 | 3) => new RegExp(`^[ \\t　]*第\\s*${n === 1 ? "[1１一]" : n === 2 ? "[2２二]" : "[3３三]"}\\s*位`);

/** 行の先頭の「第3位」「第2位」「第1位」が、この順で1回ずつ出てくる本文か。出てくる行の番号を返す */
export function rankingLines(text: string | null | undefined): { l3: number; l2: number; l1: number; lines: string[] } | null {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const find = (n: 1 | 2 | 3) => lines.map((l, i) => (RANK_LINE(n).test(l) ? i : -1)).filter((i) => i >= 0);
  const a3 = find(3), a2 = find(2), a1 = find(1);
  if (a3.length !== 1 || a2.length !== 1 || a1.length !== 1) return null;
  if (!(a3[0] < a2[0] && a2[0] < a1[0])) return null;
  return { l3: a3[0], l2: a2[0], l1: a1[0], lines };
}

export const RANKING_PART_MIN = 12;
export const RANKING_PART_MAX = 220;

/**
 * ランキング型の本文を3本に分ける。分けられなければ null（そのまま1本で出す）。
 *   1本目＝題名＋第3位＋「第2位は、」／2本目＝第2位＋「第1位は、」／3本目＝第1位＋結び
 * 元の文は1字も変えない。足すのは次の順位を予告する1行だけ。
 */
export function rankingSplit(text: string | null | undefined): [string, string, string] | null {
  const r = rankingLines(text);
  if (!r) return null;
  const join = (from: number, to: number) => r.lines.slice(from, to).join("\n").trim();
  const head = join(0, r.l2);
  const mid = join(r.l2, r.l1);
  const tail = join(r.l1, r.lines.length);
  if (r.l3 === 0) return null; // 題名が無い
  const parts: [string, string, string] = [`${head}\n\n第2位は、`, `${mid}\n\n第1位は、`, tail];
  for (const p of parts) {
    const n = Array.from(p).length;
    if (n < RANKING_PART_MIN || n > RANKING_PART_MAX) return null;
  }
  return parts;
}

/**
 * 順位の表記だけを消した本文（数字の検査用）。行の先頭の「第N位」と「BEST3」「ベスト3」以外の数字には触らない。
 * 本文の途中の「3位」や、人数・割合・回数はそのまま残る（＝検査で止まる）。
 */
export function maskRankLabels(text: string | null | undefined): string {
  return String(text || "")
    .replace(/^([ \t　]*)第\s*[1-3１-３一二三]\s*位/gm, "$1")
    .replace(/(BEST|ＢＥＳＴ|ベスト)\s*[3３]/gi, "$1");
}
