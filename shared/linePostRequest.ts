/**
 * 公式LINEに送っていただいた文章を、そのまま投稿にする（2026-11-01 三上様指示「そのまま出す基本で、全員に付けて」）。
 *
 * 以前は「お送りいただいた文章がそのまま投稿されることはありません」と返すだけで、
 * 投稿したい告知はグループLINEなど別の経路で担当者が手で予約していた。
 * Threadsアプリから直接出すと、慣らし運転中は自動の投稿が翌日に回ってしまう。
 * このトークに送れば、空いている日と時間を選んで、文章は変えずに予約する。
 */
import { isPastedContent } from "./requestKind";

/** 1行目（または最後の行）が「これを投稿してください」のようなご依頼か */
// ★「こちら投稿したい内容です。お願いします」のように、1行の中に「。」が入る書き方も多い
const ASK_LINE_RE = /(投稿|告知|ポスト|アップ|載せ|出し)[^\n]{0,14}(ください|下さい|ほしい|欲しい|お願い|おねがい|頼みます|してもらえ|していただけ|したい|します)|^(投稿|告知)(文|内容|用|したい)/;

function isAskLine(line: string): boolean {
  const s = line.trim();
  return Array.from(s).length > 0 && Array.from(s).length <= 40 && !/[?？]/.test(s) && ASK_LINE_RE.test(s);
}

/**
 * 投稿にする本文を取り出す。投稿の文章でなければ null。
 *  - 1行目か最後の行が「投稿してください」などのご依頼で、残りが15字以上 → 残りが本文
 *  - 投稿文をそのまま貼ったもの（isPastedContent） → 全文が本文
 */
export function postBodyFromMessage(t: string): string | null {
  const s = String(t || "").trim();
  if (!s) return null;
  const rows = s.split(/\r?\n/);
  const nonEmpty = rows.filter((r) => r.trim());
  if (nonEmpty.length >= 2) {
    if (isAskLine(nonEmpty[0])) {
      const body = s.slice(s.indexOf(nonEmpty[0]) + nonEmpty[0].length).trim();
      if (Array.from(body).length >= 15) return body;
    }
    const last = nonEmpty[nonEmpty.length - 1];
    if (isAskLine(last)) {
      const body = s.slice(0, s.lastIndexOf(last)).trim();
      if (Array.from(body).length >= 15) return body;
    }
  }
  if (isPastedContent(s)) return s;
  return null;
}

/** 候補の時刻（JST）。昼→夕方→午後→夜→朝の順に、ふだん見られやすい時間から */
export const POST_REQUEST_HOURS = [12, 18, 15, 20, 10, 21, 9] as const;
/** ほかの投稿とあける間隔 */
export const POST_REQUEST_GAP_MS = 90 * 60 * 1000;
/** 今からいちばん早く出せる時刻（すぐには出さない。送り直しや取り消しの余裕） */
export const POST_REQUEST_LEAD_MS = 30 * 60 * 1000;

/**
 * その日のうち、ほかの投稿と90分以上あけられる時刻を選ぶ。無ければ null。
 * dayJst は YYYY-MM-DD（JST）、existing はその日の投稿の時刻（ms）。
 */
export function pickPostTime(p: { dayJst: string; now: number; existing: number[] }): Date | null {
  for (const h of POST_REQUEST_HOURS) {
    const at = Date.parse(`${p.dayJst}T${String(h).padStart(2, "0")}:00:00+09:00`);
    if (!Number.isFinite(at) || at < p.now + POST_REQUEST_LEAD_MS) continue;
    if (p.existing.some((e) => Math.abs(e - at) < POST_REQUEST_GAP_MS)) continue;
    return new Date(at);
  }
  return null;
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** 「11/3（火）」 */
export function dayButtonLabel(dayJst: string): string {
  const d = new Date(`${dayJst}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${WEEKDAYS[d.getUTCDay()]}）`;
}

/** 予約したときのお返事 */
export function postRequestBookedText(at: Date): string {
  const j = new Date(at.getTime() + 9 * 3600_000);
  const day = j.toISOString().slice(0, 10);
  const hm = `${String(j.getUTCHours()).padStart(2, "0")}:${String(j.getUTCMinutes()).padStart(2, "0")}`;
  return (
    `${dayButtonLabel(day)} ${hm} に、お送りいただいた文章で投稿します。\n` +
    "文章は変えずに出します。Threadsのアプリには書かずに、このままお待ちください。\n" +
    "やめたいときは、下の「取り消す」を押してください。"
  );
}
