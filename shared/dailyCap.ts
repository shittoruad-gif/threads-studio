/**
 * 1日の公開上限（2026-09-13 三上様決定 R1・R5・R8）。
 *
 * 事実：9/12 に Moveact 10件・しっとる公式 8件・滝本様 8件・岩根様 8件が公開された。
 * 公開時の上限チェックが慣らし運転中・冷却中のアカウントにしか無く、歴の長いアカウントには上限が存在しなかった。
 *
 * 決まり
 *  - 上限＝契約本数＋補填分（手動の補填と自動の繰り越しを合わせて MAX_EXTRA_PER_DAY まで）
 *  - 慣らし運転中・冷却中は、その上限（1件／2件）が優先。ご本人の手動投稿も数える（Threads の実測）
 *  - 上限を超えた分は見送りにせず、翌日の同じ時刻へ送る（翌朝の生成は「翌日へ送られた分」を先に数える）
 *  - 冷却中に止めたときの文言は「投稿が消されたため◯/◯まで1日1件」（「連携1日目の慣らし運転」は誤り・9/13 しっとる公式）
 */
import { rampDayLabel } from "./accountRamp";

const JST = 9 * 3600 * 1000;

export interface DailyCapInput {
  /** 契約本数（プラン上限で頭打ち済み） */
  contract: number;
  /** rampForAccount が返した今日の本数（慣らし／冷却／補填を反映） */
  rampCount: number;
  /** 慣らし運転中・冷却中（契約より少なく抑えている） */
  rampCapped: boolean;
  /** 自動の繰り越し（昨日届かなかった分を今日に足した数） */
  carry: number;
  /** 1日に足せる本数の上限（shared/accountRamp.ts MAX_EXTRA_PER_DAY） */
  maxExtra: number;
}

/** 今日この口座で公開してよい自動投稿の本数 */
export function computeDailyCap(i: DailyCapInput): number {
  if (i.rampCapped) return Math.max(1, i.rampCount);
  const ceiling = i.contract + Math.max(0, i.maxExtra);
  return Math.max(1, Math.min(i.rampCount + Math.max(0, i.carry), ceiling));
}

/**
 * 翌日の同じ時刻（JST）。7時より前なら 10:00 に寄せる（深夜に出さない）。
 * ★時刻は予定していた時刻（その方の bestHours）をそのまま使う。日付だけを翌日にする。
 *   公開が遅れたぶん時刻をずらすと、毎日少しずつ後ろへ流れて、いつもの時間帯から外れてしまう。
 */
export function nextDaySameTime(scheduledAt: Date | string | number, now: number = Date.now()): Date {
  const base = new Date(scheduledAt).getTime();
  const valid = Number.isFinite(base);
  // 日付は「予定日と今日の遅い方」の翌日（何日も前の予定でも過去に戻さない）
  const dateSrc = new Date((valid ? Math.max(base, now) : now) + JST);
  // 時刻は予定していた時刻（無効なら今の時刻）
  const timeSrc = new Date((valid ? base : now) + JST);
  let hour = timeSrc.getUTCHours(), minute = timeSrc.getUTCMinutes();
  if (hour < 7) { hour = 10; minute = 0; }
  return new Date(Date.UTC(dateSrc.getUTCFullYear(), dateSrc.getUTCMonth(), dateSrc.getUTCDate() + 1, hour, minute) - JST);
}

/** YYYY-MM-DD → M月D日 */
export function dateJstLabel(ymd: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(String(ymd || ""));
  if (!m) return "";
  return `${Number(m[1])}月${Number(m[2])}日`;
}

/** 冷却中に上限で止めたときの LINE 文面（R8） */
export function cooldownCapNotice(username: string, untilLabel: string, todayCount: number): string {
  return (
    `@${username} は投稿が消されたため、${untilLabel || "しばらく"}まで自動投稿を1日1件に抑えています（アカウントを守るためです）。\n` +
    `今日はすでに${todayCount}件公開しているので、この投稿は翌日に回しました。減った分はあとで1日1件ずつ足してお届けします。`
  );
}

/** 慣らし運転中に上限で止めたときの LINE 文面 */
export function rampCapNotice(username: string, days: number, todayCount: number, cap: number): string {
  return (
    `@${username} は連携から${rampDayLabel(days)}日目の「慣らし運転」中です。今日はご自身の投稿を含めて${todayCount}件になったため、` +
    `自動投稿1件を翌日に回しました（上限は1日${cap}件）。新しいアカウントで多く投稿すると停止されやすいための安全策です。`
  );
}

/**
 * 「消していません」とお答えいただいたときに送る文。
 * 2026-11-20 三上様「投稿数を勝手に減らす仕組みをやめて」：本数は変えない。お伺い（1件消えたときにLINEで伺う）も、
 * 消えたときの定型のお知らせも、いまは送らない。以前に届いたお伺いのボタンを押された方への返事だけ残す。
 */
export function singleDeleteConfirmedNotice(username: string): string {
  return (
    `お答えありがとうございます。\n` +
    `@${username} の投稿は、本数を変えずにこれまでどおりお届けします。\n` +
    `Threads側で消された可能性があるため、担当者が状況を確認します。`
  );
}

/** 「自分で消しました」とお答えいただいたときに送る文（2026-09-19） */
export function singleDeleteByOwnerNotice(username: string): string {
  return (
    `承知しました。ご自身で消された分ですので、こちらは何もしません。\n` +
    `@${username} の投稿は、これまでどおりの本数でお届けします。`
  );
}
