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
export function jstMonthDayLabel(d: Date | string | number): string {
  const j = new Date(new Date(d).getTime() + 9 * 3600_000);
  return `${j.getUTCMonth() + 1}月${j.getUTCDate()}日`;
}

/** 「21:13」 */
export function jstTimeLabel(d: Date | string | number): string {
  const j = new Date(new Date(d).getTime() + 9 * 3600_000);
  return `${String(j.getUTCHours()).padStart(2, "0")}:${String(j.getUTCMinutes()).padStart(2, "0")}`;
}

/** 1日の数を抑えているときに添える一文（直接の投稿も数に入ることを先に伝える） */
export function capLine(p: { reason: "ramp" | "cooldown"; cap: number; untilLabel?: string }): string {
  const head = p.reason === "cooldown"
    ? `投稿が消えたあとのため、アカウントを守るために${p.untilLabel ? `${p.untilLabel}まで` : "しばらく"}1日${p.cap}件にしています。`
    : `連携して間もないアカウントを守るため、いまは1日${p.cap}件までにしています。`;
  return `※${head}Threadsのアプリから直接投稿した分も、この数に入ります。`;
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
  moved: Array<{ head: string; from: Date | string; to: Date | string }>;
}): string {
  const lines: string[] = [`@${p.username} の投稿のお知らせです。`];
  lines.push(p.direct > 0
    ? `今日はThreadsのアプリから直接の投稿が${p.direct}件ありました。`
    : `今日はすでに${p.todayCount}件の投稿が出ています。`);
  lines.push(capLine({ reason: p.reason, cap: p.cap, untilLabel: p.untilLabel }));
  lines.push("");
  lines.push("そのため、次の投稿を明日に回しました。消えたわけではありません。");
  for (const m of p.moved) {
    const head = m.head.replace(/\s+/g, " ").trim().slice(0, 24);
    lines.push(`・「${head}…」 今日 ${jstTimeLabel(m.from)} → ${jstMonthDayLabel(m.to)} ${jstTimeLabel(m.to)}`);
  }
  if (p.direct > 0) {
    lines.push("");
    // ★このトークは自動でお返事するだけで、送られた文章は担当者に届かない（「担当者に聞く」を押した分だけ届く）。
    //   「このLINEに送ってください」と書くと、届かない約束になる（2026-11-01 お客様から「そちらで確認していますか」）。
    lines.push("お知らせしたいことがあるときは、Threadsのアプリに直接書かずに、担当者にお送りください。日にちを合わせてお出しします。");
  }
  return lines.join("\n");
}
