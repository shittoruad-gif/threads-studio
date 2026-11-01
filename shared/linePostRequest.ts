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

/** 「————」「ーーー」「＝＝＝」などの区切りの線 */
function isSeparatorLine(line: string): boolean {
  return /^[\s\-ー―－—–_＿=＝~〜・.]{3,}$/.test(line.trim());
}

/** 「明日3日の18時頃」「5日の18時頃」「今日のお昼12時ごろ」のような、いつ出すかの行（投稿の本文ではない） */
const WHEN_LINE_RE = /^(今日|本日|明日|あした|明後日|あさって|\d{1,2}\s*[\/月]\s*\d{1,2}\s*日?|\d{1,2}\s*日)[^\n]{0,20}$|^[^\n]{0,8}\d{1,2}\s*(時|:\d{2})[^\n]{0,12}$/;
function isWhenLine(line: string): boolean {
  const s = line.trim();
  return Array.from(s).length <= 30 && !/[?？]/.test(s) && WHEN_LINE_RE.test(s);
}

export type PostRequest = {
  body: string;
  /** 「投稿してください」などのご依頼の行があったか（無ければ、投稿文を貼っただけ） */
  asked: boolean;
  /** 日時の指定（「3日の18時頃」）。日だけ・時刻だけのこともある */
  want?: { day?: string; hour?: number; minute?: number };
};

/** いつ出すかの行から、日付（YYYY-MM-DD・JST）と時刻を読む。now から見て過ぎた日は来月とみなす */
export function parseWhen(line: string, now: number = Date.now()): PostRequest["want"] | undefined {
  const s = line.normalize("NFKC");
  const j = new Date(now + 9 * 3600_000);
  const y = j.getUTCFullYear(), m = j.getUTCMonth(), d = j.getUTCDate();
  const iso = (yy: number, mm: number, dd: number) => new Date(Date.UTC(yy, mm, dd)).toISOString().slice(0, 10);
  let day: string | undefined;
  const md = s.match(/(\d{1,2})\s*[\/月]\s*(\d{1,2})/);
  const dOnly = s.match(/(\d{1,2})\s*日/);
  if (md) {
    const mm = Number(md[1]) - 1, dd = Number(md[2]);
    day = iso(mm < m - 6 ? y + 1 : y, mm, dd);
  } else if (dOnly) {
    const dd = Number(dOnly[1]);
    day = dd >= d ? iso(y, m, dd) : iso(y, m + 1, dd);
  } else if (/明後日|あさって/.test(s)) day = iso(y, m, d + 2);
  else if (/明日|あした/.test(s)) day = iso(y, m, d + 1);
  else if (/今日|本日/.test(s)) day = iso(y, m, d);
  let hour: number | undefined, minute: number | undefined;
  const hm = s.replace(/(\d{1,2})\s*[\/月]\s*(\d{1,2})\s*日?/, "").replace(/\d{1,2}\s*日/, "").match(/(\d{1,2})\s*(?:時\s*(半|(\d{1,2})\s*分)?|:(\d{2}))/);
  if (hm) {
    hour = Number(hm[1]);
    minute = hm[2] === "半" ? 30 : hm[3] ? Number(hm[3]) : hm[4] ? Number(hm[4]) : 0;
    if (hour < 12 && /(午後|夕方|夜)/.test(s)) hour += 12;
    if (hour > 23 || minute > 59) { hour = undefined; minute = undefined; }
  } else if (/(お昼|昼)/.test(s)) { hour = 12; minute = 0; }
  if (!day && hour === undefined) return undefined;
  return { day, hour, minute };
}

/**
 * 投稿にする本文と、ご依頼・日時の指定を取り出す。投稿の文章でなければ null。
 *  - 頭か終わりの数行が「投稿してください」などのご依頼（「明日3日の18時頃」のような日時の行や区切りの線を含んでよい）で、
 *    残りが15字以上 → 残りが本文
 *  - 投稿文をそのまま貼ったもの（isPastedContent） → 全文が本文
 * ★2026-11-02 お客様の書き方「明日3日の18時頃／この投稿をお願いします／————／本文」で、日時の行と線まで本文に入っていた。
 */
export function parsePostRequest(t: string, now: number = Date.now()): PostRequest | null {
  const s = String(t || "").trim();
  if (!s) return null;
  const rows = s.split(/\r?\n/);
  const idx = rows.map((r, i) => (r.trim() ? i : -1)).filter((i) => i >= 0);
  if (idx.length >= 2) {
    const tryEdge = (order: number[]): PostRequest | null => {
      // 端から最大4行（空行を除く）：ご依頼の行・日時の行・区切りの線だけで、ご依頼の行を1つ含むこと
      let asked = false, when: string | null = null, used = 0;
      for (const i of order.slice(0, 4)) {
        const line = rows[i];
        if (isAskLine(line)) { asked = true; if (!when && isWhenLine(line)) when = line; }
        else if (isWhenLine(line)) when = when ?? line;
        else if (isSeparatorLine(line)) { /* 線は本文に入れない */ }
        else break;
        used++;
      }
      if (!asked) return null;
      const rest = order[0] === idx[0]
        ? rows.slice(order[used - 1] + 1)
        : rows.slice(0, order[used - 1]);
      const body = rest.filter((r, k, a) => !(isSeparatorLine(r) && (k === 0 || k === a.length - 1))).join("\n").trim();
      if (Array.from(body).length < 15) return null;
      return { body, asked: true, want: when ? parseWhen(when, now) : undefined };
    };
    const head = tryEdge(idx);
    if (head) return head;
    const tail = tryEdge([...idx].reverse());
    if (tail) return tail;
  }
  if (isPastedContent(s)) return { body: s, asked: false };
  return null;
}

/** 本文だけ（以前の呼び出し口） */
export function postBodyFromMessage(t: string): string | null {
  return parsePostRequest(t)?.body ?? null;
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
