/**
 * 案の◯✕アンケートを週1回の定例にする（2026-09-29 三上様指示「まずは型Bを定期的に行うように」）。
 * 判断だけを置く（DB・LINEは server/draftSurveyWeekly.ts）。
 *
 * 型B＝投稿は出ているが、特定の話題で見送りが続く方（例：プレステージ様 見送り13回／公開19件）。
 *   直近7日に3回以上見送り、かつ自動投稿の公開が1件以上ある方だけを対象にする。
 *   公開0件の方（型A：ご自分で書いている方・香取様）は対象にしない（別の手当てを三上様が検討中）。
 *
 * ★お客様へは自動で送らない。毎週案を作って三上様のLINEへ下見を送り、「この8案を送る」を押したものだけ届く。
 */
import { OUTCOME_RISK_ANGLES } from "./postAngles";

export const WEEKLY_SURVEY = {
  /** 1回にお送りする案の数 */
  size: 8,
  /** 同じアカウントに、この日数以内に案を作っていれば作らない（毎週1回） */
  cooldownDays: 6,
  /** 型Bの条件：直近7日の公開がこの件数以上 */
  minPublished: 1,
};

/**
 * 案に使う切り口の候補（上から優先）。結果を語る切り口（お客様の声・変化の物語）は健康系で危ないので入れない。
 * 数が多めなのは、検査で作れなかった切り口を飛ばしても8つそろえるため。
 */
export const SURVEY_ANGLE_POOL: readonly string[] = [
  "behind_scenes", "reassurance", "misconception", "qa", "personality", "pro_tip", "aruaru",
  "local", "opinion", "insider", "lesson", "seasonal", "deep_worry", "contrast",
].filter((id) => !OUTCOME_RISK_ANGLES.includes(id));

/** 型Bかどうか */
export function isWeeklySurveyTarget(t: { declines: number; published: number }, minDeclines: number): boolean {
  return t.declines >= minDeclines && t.published >= WEEKLY_SURVEY.minPublished;
}

/**
 * 今週の切り口の並び。これまでの案で✕が付いた切り口は後ろへ回し、週ごとに先頭をずらして毎回同じ8つにしない。
 */
export function surveyAngleOrder(badAngles: readonly string[], weekIndex: number): string[] {
  const bad = new Set(badAngles);
  const n = SURVEY_ANGLE_POOL.length;
  const shift = ((weekIndex % n) + n) % n;
  const rotated = [...SURVEY_ANGLE_POOL.slice(shift), ...SURVEY_ANGLE_POOL.slice(0, shift)];
  return [...rotated.filter((a) => !bad.has(a)), ...rotated.filter((a) => bad.has(a))];
}

/** お客様へお送りする前置き */
export function surveyIntro(storeName: string | null | undefined, count: number): string {
  const who = String(storeName ?? "").trim();
  return "いつもありがとうございます。今週の投稿の方向性を確かめるため、書き方の違う" + count + "つの案をお送りします。\n" +
    "1つずつ「◯ この方向」「✕ 違う」を押してください。押しても投稿はされません。\n" +
    `◯が付いた案を中心に、これからの投稿を${who ? `${who}様` : "お店"}らしく作ってまいります。`;
}

/** 三上様への下見（押す前に中身をすべて読めるように、本文は全文） */
export function adminPreviewText(p: {
  userName: string; username: string; declines: number; published: number;
  drafts: Array<{ label: string; content: string }>;
}): string {
  const head =
    `【◯✕の${p.drafts.length}案・お送りする前の確認】\n` +
    `${p.userName || "お客様"}（@${p.username}）　直近7日：見送り${p.declines}回／公開${p.published}件\n` +
    `「この${p.drafts.length}案を送る」を押すと、お客様のLINEに届きます（押しても投稿はされません）。\n`;
  const body = p.drafts.map((d, i) => `\n―― 案${i + 1}（${d.label}）\n${d.content.slice(0, 400)}`).join("\n");
  return (head + body).slice(0, 4900);
}
