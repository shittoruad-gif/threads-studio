/**
 * 学習の集計（2026-10-07 三上様「リーチが取れる投稿の傾向を早く取れるように」）。通信しない（計算だけ）。
 *
 * 表示回数はアカウントごとに中央値で割ってそろえる（店の大きさ・フォロワー数に引っ張られないように）。
 * 「傾向あり」と書くのは、本数が minCount 以上で、中央値の比が up 以上／down 以下のときだけ（偶然のブレを結論にしない）。
 */
import { LEARNING_TRIALS } from "./learningAccounts";

export const LEARNING_REPORT = {
  /** 公開からこの時間たった投稿だけ数える（伸びきっていない数字で判断しない） */
  minAgeHours: 48,
  minCount: 6,
  up: 1.3,
  down: 0.75,
} as const;

export interface LearningRow {
  accountId: number;
  impressions: number;
  postedAt: Date;
  text: string;
  experimentKey: string | null;
  angle: string | null;
  /** 地域名（1行目に地域名が入っているかを見る） */
  area?: string | null;
}

export interface GroupStat { key: string; label: string; n: number; medianRatio: number; meanRatio: number; verdict: "伸びる" | "伸びない" | "まだ分からない" }

const median = (xs: number[]) => {
  if (xs.length === 0) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const JST = 9 * 3600_000;

export function lengthBucket(text: string): string {
  const n = Array.from(String(text || "").replace(/\s/g, "")).length;
  return n <= 50 ? "〜50字" : n <= 100 ? "51〜100字" : n <= 150 ? "101〜150字" : n <= 250 ? "151〜250字" : "251字〜";
}

export function firstLineTraits(text: string, area?: string | null): string[] {
  const first = String(text || "").split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
  const out: string[] = [];
  if (/[？?]/.test(first)) out.push("1行目が問いかけ");
  if (/[0-9０-９一二三四五六七八九十百]+\s*(つ|分|秒|日|回|年|歳|割|%|％|人|個|cm|kg)/.test(first)) out.push("1行目に数字");
  const a = String(area || "").match(/([^\s都道府県]{1,6}?[市区町村])/)?.[1];
  if (a && first.includes(a)) out.push("1行目に地域名");
  if (out.length === 0) out.push("1行目にどれも無し");
  return out;
}

function verdictOf(n: number, med: number): GroupStat["verdict"] {
  if (n < LEARNING_REPORT.minCount) return "まだ分からない";
  if (med >= LEARNING_REPORT.up) return "伸びる";
  if (med <= LEARNING_REPORT.down) return "伸びない";
  return "まだ分からない";
}

/** rows を「アカウントの中央値に対する比」にそろえて、keyOf ごとにまとめる */
export function groupByRatio(rows: readonly LearningRow[], keyOf: (r: LearningRow) => string[] | string | null, labelOf: (k: string) => string = (k) => k, now: number = Date.now()): GroupStat[] {
  const ok = rows.filter((r) => now - r.postedAt.getTime() >= LEARNING_REPORT.minAgeHours * 3600_000);
  const med = new Map<number, number>();
  for (const id of Array.from(new Set(ok.map((r) => r.accountId)))) med.set(id, median(ok.filter((r) => r.accountId === id).map((r) => r.impressions)));
  const groups = new Map<string, number[]>();
  for (const r of ok) {
    const m = med.get(r.accountId) ?? 0;
    if (!(m > 0)) continue;
    const ks = keyOf(r);
    for (const k of Array.isArray(ks) ? ks : ks ? [ks] : []) {
      const xs = groups.get(k) ?? [];
      xs.push(r.impressions / m);
      groups.set(k, xs);
    }
  }
  return Array.from(groups.entries()).map(([key, xs]) => {
    const md = median(xs);
    return { key, label: labelOf(key), n: xs.length, medianRatio: +md.toFixed(2), meanRatio: +(xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(2), verdict: verdictOf(xs.length, md) };
  }).sort((a, b) => b.medianRatio - a.medianRatio);
}

export const trialLabel = (k: string) => k === "control" ? "ふだんの投稿（比べる元）" : (LEARNING_TRIALS.find((t) => t.key === k)?.label ?? k);

export function jstHour(d: Date): number {
  return new Date(d.getTime() + JST).getUTCHours();
}

function lines(title: string, stats: GroupStat[], max = 12): string {
  if (stats.length === 0) return `■${title}\n（まだ数えられる投稿がありません）`;
  return `■${title}\n` + stats.slice(0, max).map((s) => `・${s.label}：${s.medianRatio}倍（${s.n}本）${s.verdict === "まだ分からない" ? "" : `→ ${s.verdict}`}`).join("\n");
}

/** 運営向けのまとめ（お客様には送らない） */
export function learningReportText(opts: { learning: readonly LearningRow[]; all: readonly LearningRow[]; days: number; now?: number }): string {
  const now = opts.now ?? Date.now();
  const trials = groupByRatio(opts.learning, (r) => r.experimentKey ?? "control", trialLabel, now);
  const lenAll = groupByRatio(opts.all, (r) => lengthBucket(r.text), undefined, now);
  const firstAll = groupByRatio(opts.all, (r) => firstLineTraits(r.text, r.area), undefined, now);
  const hourL = groupByRatio(opts.learning, (r) => `${jstHour(r.postedAt)}時台`, undefined, now);
  const angleAll = groupByRatio(opts.all, (r) => r.angle, undefined, now);
  const sure = [...trials, ...lenAll, ...firstAll].filter((s) => s.verdict !== "まだ分からない");
  const head = `リーチの傾向（直近${opts.days}日・公開から${LEARNING_REPORT.minAgeHours}時間たった投稿）\n` +
    `数字は各アカウントの中央値を1とした比。${LEARNING_REPORT.minCount}本以上で${LEARNING_REPORT.up}倍以上を「伸びる」、${LEARNING_REPORT.down}倍以下を「伸びない」とする。\n` +
    (sure.length > 0 ? `\nはっきりしてきたこと：\n${sure.slice(0, 6).map((s) => `・${s.label} ${s.medianRatio}倍（${s.n}本）→ ${s.verdict}`).join("\n")}` : "\nはっきりしてきたことは、まだありません。");
  return [
    head,
    lines("Moveact 2店の試し（1つの条件だけ変えた投稿）", trials),
    lines("Moveact 2店の時間帯", hourL),
    lines("全アカウントの長さ", lenAll),
    lines("全アカウントの1行目", firstAll),
    lines("全アカウントの切り口", angleAll, 10),
    "お客様全体の作り方に広げるのは、三上様の承諾後（shared/learningAccounts.ts）。",
  ].join("\n\n");
}
