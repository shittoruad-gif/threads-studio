/**
 * 承認カードに添える頭の文と、上限で翌日へ回したときの文（2026-11-01 三上様指示「つまずくところが多すぎる」）。
 *
 * 事実（11/1・慣らし運転中のお客様）
 *  - 「OKした分だけ公開」の設定なのに、カードの文が全員「見送るを押さない限り、予定時刻にそのまま公開」だった。
 *  - 夜9時に届く「明日の分」がいつ出るのか、夜中に押してよいのかが分からなかった。
 *  - Threadsアプリから直接投稿した分も1日の数に入ることを、回ってから初めて知らされた。
 * 専門の言葉（承認期限・予定時刻・慣らし運転）を使わず、「届く → 押す → いつ出る」で書く。
 */

/** 予定日の「11月2日」 */
import { RAMP_DAYS_1, RAMP_DAYS_2, COMPENSATION_EXTRA_PER_DAY } from "./accountRamp";

export function jstMonthDayLabel(d: Date | string | number): string {
  const j = new Date(new Date(d).getTime() + 9 * 3600_000);
  return `${j.getUTCMonth() + 1}月${j.getUTCDate()}日`;
}

/** 「21:13」 */
export function jstTimeLabel(d: Date | string | number): string {
  const j = new Date(new Date(d).getTime() + 9 * 3600_000);
  return `${String(j.getUTCHours()).padStart(2, "0")}:${String(j.getUTCMinutes()).padStart(2, "0")}`;
}

const WD = ["日", "月", "火", "水", "木", "金", "土"];
/** 「11/4（水）」（時刻 ms → JSTの日付） */
function mdw(ms: number): string {
  const j = new Date(ms + 9 * 3600_000);
  return `${j.getUTCMonth() + 1}/${j.getUTCDate()}（${WD[j.getUTCDay()]}）`;
}

/**
 * 慣らし運転の日程（2026-11-01 三上様指示「どのようなスケジュールで進んでいくのかが相手にわかるように」）。
 * 段階は shared/accountRamp.ts と同じ（連携から5日未満＝1件、10日未満＝2件、そのあと契約どおり＋減った分の補填）。
 * 切り替わりは連携した時刻から24時間単位なので、日付には「ごろ」を付ける。過ぎた段階は出さない。
 */
export function rampScheduleLines(p: { createdAt: Date | string; contract: number; now?: number }): string[] {
  const created = new Date(p.createdAt).getTime();
  const now = p.now ?? Date.now();
  if (!Number.isFinite(created)) return [];
  const DAY = 86400_000;
  const to2 = created + RAMP_DAYS_1 * DAY;
  const toFull = created + RAMP_DAYS_2 * DAY;
  const lines: string[] = [];
  if (now < to2) lines.push(`・${mdw(to2 - DAY)}ごろまで：1日1件`);
  if (now < toFull && p.contract >= 2) lines.push(`・${now < to2 ? `${mdw(to2)}ごろから` : `${mdw(toFull - DAY)}ごろまで`}：1日2件`);
  if (p.contract >= 2) lines.push(`・${mdw(toFull)}ごろから：1日${p.contract}件（減った分を補うため、しばらく1日${p.contract + COMPENSATION_EXTRA_PER_DAY}件）`);
  return lines;
}

/**
 * 1日の数を抑えているときに添える文（直接の投稿も数に入ることを先に伝える）。
 * 慣らし運転は createdAt と contract を渡すと、この先の日程も添える。冷却は明ける日と戻る本数。
 */
export function capLine(p: { reason: "ramp" | "cooldown"; cap: number; untilLabel?: string; createdAt?: Date | string | null; contract?: number; untilJst?: string; now?: number }): string {
  const tail = "Threadsのアプリから直接投稿した分も、この数に入ります。";
  if (p.reason === "cooldown") {
    const back = p.untilJst && p.contract && p.contract > 1
      ? `${mdw(Date.parse(`${p.untilJst}T12:00:00+09:00`) + 86400_000)}からは1日${p.contract}件に戻ります。`
      : "";
    return `※投稿が消えたあとのため、アカウントを守るために${p.untilLabel ? `${p.untilLabel}まで` : "しばらく"}1日${p.cap}件にしています。${back}${tail}`;
  }
  const schedule = p.createdAt && p.contract ? rampScheduleLines({ createdAt: p.createdAt, contract: p.contract, now: p.now }) : [];
  if (schedule.length === 0) return `※連携して間もないアカウントを守るため、いまは1日${p.cap}件までにしています。${tail}`;
  return ["※連携して間もないアカウントを守るため、投稿の数を少しずつ増やしています。", ...schedule, tail].join("\n");
}

export function approvalLeadText(p: {
  label: "今日" | "明日";
  /** 予定日（例：11月2日） */
  dateLabel: string;
  count: number;
  /** 「見送りしなければ公開」の設定か（users.autoPublishIfNoResponse） */
  softPublish: boolean;
  /** 直した内容をもとに作っている旨（あれば改行つき） */
  editNote?: string;
  /** capLine() の文 */
  capNote?: string;
}): string {
  const head = p.label === "明日"
    ? `明日（${p.dateLabel}）の投稿が${p.count}件できました。`
    : `今日の投稿が${p.count}件できました。`;
  const body = p.softPublish
    ? (p.count > 1
      ? "内容をご確認ください。「見送る」を押さない限り、予定時刻にそのまま公開されます。直したいときは「書き直す」、出したくないときだけ「見送る」を押してください。"
      : "内容をご確認ください。「見送る」を押さない限り、予定時刻にそのまま公開されます。直したいときは「書き直す」を押してください。")
    : [
      "よければ「これで投稿する」を押してください。",
      p.label === "明日"
        ? "押した投稿だけが、明日の予定の時間に出ます。今夜のうちでも、明日になってからでも押せます。"
        : "押した投稿だけが出ます。予定の時間を過ぎてから押したときは、押したあとに出ます。",
      "押さなかった投稿は出ません。出したくないものは、そのままで大丈夫です。",
    ].join("\n");
  return [head, `${p.editNote ?? ""}${body}`, p.capNote].filter(Boolean).join("\n");
}

/** 1日の数に届いたため、今日の投稿を明日へ回したときの文 */
export function deferredNoticeText(p: {
  username: string;
  reason: "ramp" | "cooldown";
  cap: number;
  /** 今日Threadsに出ている数（直接の投稿を含む） */
  todayCount: number;
  /** そのうちThreadsアプリから直接の投稿 */
  direct: number;
  untilLabel?: string;
  /** 日程を添えるため（慣らし：連携した時刻と契約本数・冷却：明ける日） */
  createdAt?: Date | string | null;
  contract?: number;
  untilJst?: string;
  moved: Array<{ head: string; from: Date | string; to: Date | string }>;
}): string {
  const lines: string[] = [`@${p.username} の投稿のお知らせです。`];
  lines.push(p.direct > 0
    ? `今日はThreadsのアプリから直接の投稿が${p.direct}件ありました。`
    : `今日はすでに${p.todayCount}件の投稿が出ています。`);
  lines.push(capLine({ reason: p.reason, cap: p.cap, untilLabel: p.untilLabel, createdAt: p.createdAt, contract: p.contract, untilJst: p.untilJst }));
  lines.push("");
  lines.push("そのため、次の投稿を明日に回しました。消えたわけではありません。");
  for (const m of p.moved) {
    const head = m.head.replace(/\s+/g, " ").trim().slice(0, 24);
    lines.push(`・「${head}…」 今日 ${jstTimeLabel(m.from)} → ${jstMonthDayLabel(m.to)} ${jstTimeLabel(m.to)}`);
  }
  if (p.direct > 0) {
    lines.push("");
    // ★このトークに文章を送ると、空いている日と時間にそのまま予約できる（2026-11-01・shared/linePostRequest.ts）
    lines.push("投稿したいことがあるときは、Threadsのアプリに直接書かずに、このLINEに文章を送ってください。空いている日と時間を選んで、そのまま投稿します。");
  }
  return lines.join("\n");
}
