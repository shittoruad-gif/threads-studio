/**
 * 店舗が複数あるお店で、1本ごとに書く店舗を順番に決める（2026-10-19 夜間整備）。
 *
 * プレステージ様 acc33（地域「横浜・川崎・横須賀」・横浜店／川崎店／横須賀中央店）：
 * 10/16 ごろから生成が毎回「横浜にあるプレステージ」と先頭の1店だけを書き、
 * ご本人が「横須賀中央にある」「川崎にある」へ手直ししていた（10/18 に2本）。
 * 地域欄は3つ並べて渡すだけなので、AIは毎回いちばん上を選ぶ。
 *
 * ★地域欄が並んでいても「店舗が複数」とは限らない（1店で周りの地域からも来られる方がいる）。
 *   地域の語の**すべて**に、はじめの設定の答えで「〇〇店」が書かれているときだけ複数店舗とみなす。
 *   どれか1つでも店が見つからなければ何もしない（今までどおり）。
 */

/** 地域欄を語に分ける（「横浜・川崎・横須賀」→ 3語）。1語なら空 */
function areaParts(area: string | null | undefined): string[] {
  const parts = String(area ?? "")
    .split(/[・、,，\/／]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length >= 2 ? parts : [];
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 店舗の呼び名の一覧（「横浜」「川崎」「横須賀中央」）。複数店舗と言えなければ空。
 * @param counselingTexts はじめの設定の答え（営業時間・アクセスなど）の文
 */
export function multiStoreLabels(area: string | null | undefined, counselingTexts: string[]): string[] {
  const parts = areaParts(area);
  if (parts.length === 0) return [];
  const text = counselingTexts.filter(Boolean).join("\n");
  const labels: string[] = [];
  for (const part of parts) {
    // 「横須賀」→「横須賀中央店」のように、地域の語のあとに数文字続く店名も拾う
    const m = text.match(new RegExp(`(${escapeRe(part)}[一-龠ぁ-んァ-ヶー]{0,4}?)店`));
    if (!m) return [];
    labels.push(m[1]);
  }
  return Array.from(new Set(labels)).length === labels.length ? labels : [];
}

/**
 * この1本で書く店舗。直近の投稿でいちばん出ていない店（同じなら地域欄の順）。
 * 3つ並べた投稿（「横浜・川崎・横須賀にある」）は、どの店にも1回ずつ数える。
 */
export function pickStoreForPost(labels: string[], recentContents: string[]): string | null {
  if (labels.length < 2) return null;
  let best: string | null = null;
  let bestN = Infinity;
  for (const label of labels) {
    // 「横須賀中央」は「横須賀」でも書かれるので、頭の2字以上の地域の語で数える
    const n = recentContents.filter((c) => String(c ?? "").includes(label) || String(c ?? "").includes(label.slice(0, Math.max(2, label.length - 2)))).length;
    if (n < bestN) { best = label; bestN = n; }
  }
  return best;
}

/** はじめの設定の答え（JSON）から、店舗名を探す文を取り出す */
export function counselingStoreTexts(counseling: any): string[] {
  if (!counseling || typeof counseling !== "object") return [];
  const out: string[] = [];
  for (const k of ["hoursInfo", "accessInfo", "access", "storeInfo"]) {
    const v = counseling[k];
    if (Array.isArray(v)) for (const x of v) out.push(String(x ?? ""));
    else if (typeof v === "string") out.push(v);
  }
  return out;
}
