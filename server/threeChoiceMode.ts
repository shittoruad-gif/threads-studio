/**
 * 3案からお選びいただく形の「発動するか」の判定（DB側）。
 * 判断そのものは shared/threeChoice.ts に置いてある（DBに触れないので試験しやすい）。
 *
 * 2026-09-22 三上様指示。最初の対象は香取様（3500・acc21・神立宏友会シン接骨院）。
 */
import { shouldOfferChoices, CHOICE_TRIGGER_DAYS, type DayOutcome } from "@shared/threeChoice";
import * as db from "./db";

export interface ChoiceDecision {
  /** 3案にするか */
  on: boolean;
  /** 判定に使った直近の実績（ログ・報告用） */
  days: DayOutcome[];
  /** なぜそう判断したか（ログ用の一言） */
  note: string;
}

/**
 * このアカウントを3案に切り替えるか。
 *
 * ★公開前確認（承認）が入っていないアカウントでは発動しない。
 *   承認カードが出ない設定なので、3案を作っても選んでいただく画面がない。
 *   「確認なしでそのまま公開」のままで3案を作れば、3件とも公開されてしまう。
 */
export async function decideChoiceMode(
  accountId: number,
  requireApproval: boolean,
): Promise<ChoiceDecision> {
  if (!requireApproval) {
    return { on: false, days: [], note: "公開前確認が入っていないため対象外" };
  }
  let days: DayOutcome[] = [];
  try {
    days = await db.getAccountRecentDayOutcomes(accountId, CHOICE_TRIGGER_DAYS + 1);
  } catch (e) {
    // 判定できないときは今までどおり1案。黙って3案にしない。
    console.warn(`[ThreeChoice] 実績を読めませんでした account=${accountId}: ${(e as Error)?.message}`);
    return { on: false, days: [], note: "実績を読めなかったため今までどおり1案" };
  }
  // ★きょうの分は判定に入れない。朝6時の生成の時点では、その日はまだ何も起きていない。
  const todayJst = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const past = days.filter((d) => d.date < todayJst);
  const on = shouldOfferChoices(past);
  const shown = past.slice(0, CHOICE_TRIGGER_DAYS)
    .map((d) => `${d.date}:作${d.created}/公開${d.published}`).join(" ");
  return {
    on,
    days: past,
    note: on
      ? `${CHOICE_TRIGGER_DAYS}日続けて公開に至らなかったため3案（${shown}）`
      : `3案の対象外（${shown || "実績なし"}）`,
  };
}
