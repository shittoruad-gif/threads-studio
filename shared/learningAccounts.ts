/**
 * 学習用アカウント（2026-10-07 三上様「Moveactの店舗をもっと投稿数を増やして、リーチが取れる投稿の傾向を取れるように。
 * 早くその傾向が取れないと、今契約しているユーザが離脱する原因となります」）。
 *
 * 自社の2店（Moveact 玉島・金光）だけ、1日の本数を増やし、増やした枠で「1つの条件だけを変えた投稿」を回す。
 * 条件ごとの表示（そのアカウントの中央値に対する比）を集計して、お客様全体の生成に広げる根拠にする
 * （広げるのは三上様の承諾後。集計 scripts/ops/learning-report.mts・週2回運営へ server/learningReportJob.ts）。
 *
 * 本数（10/7 時点で 1日5本＝契約3＋当たり型の試し2）→ 1日7本。
 *  - 8本以上にしない理由：7時〜23時に、ほかの枠と1時間以上あけて置けるのが7本まで（投稿時間の試験の5枠は約3時間おき）。
 *    短い間隔の連投は到達が落ち、9/12 には同じ日に多く出したアカウントで投稿が消された。
 *  - 学習の枠の時刻は、その日の枠のあいだで「いちばん空いている時間の真ん中」（learningSlotTimes）。
 *  - 投稿が1件でも消されたら、冷却（1日1件・7日）が先に効き、学習の枠も止まる（shared/accountRamp.ts inCooldown）。
 *  - 自社アカウントだけ。お客様のアカウントには入れない（三上様の承諾なく契約本数を超えて出さない）。
 */

export const LEARNING_ACCOUNTS = {
  accountIds: [10, 12] as readonly number[],
  /** 契約本数＋既存の補填に上乗せする本数 */
  extraSlots: 2,
  start: "2026-10-08",
  until: "2026-11-30",
  /** 学習の枠とほかの枠との最小の間隔（分）。これより狭くしか置けない日は置ける分だけ */
  minGapMinutes: 60,
} as const;

const JST = 9 * 3600_000;
const jstYmd = (now: number) => new Date(now + JST).toISOString().slice(0, 10);

export function inLearning(accountId: number, now: number = Date.now()): boolean {
  if (!LEARNING_ACCOUNTS.accountIds.includes(accountId)) return false;
  const d = jstYmd(now);
  return d >= LEARNING_ACCOUNTS.start && d <= LEARNING_ACCOUNTS.until;
}

/** 今日この口座に上乗せする学習の枠の数（冷却中・慣らし中は0。呼び出し側で capped を見る） */
export function learningExtra(accountId: number, opts: { capped: boolean }, now: number = Date.now()): number {
  if (opts.capped || !inLearning(accountId, now)) return 0;
  return LEARNING_ACCOUNTS.extraSlots;
}

/**
 * 学習の試し（1回に1つの条件だけを変える）。指示はほかの指示より優先させるが、作り話・効果の断定の禁止はそのまま。
 * 選んだ理由：10/2 実測で差が出ていたもの（長さ・地域名・数字）と、まだ測れていないもの（問いかけ・箇条書き・共感・裏側・季節）。
 * ★10/8 初日：「1行目に数字」は例の「30秒」「1日5分」に引かれて「60分間」「待ち時間0分」「9割」を書き作り話の点検で、
 *   「1行目が問いかけ」は禁止の「〜いませんか？」で、どちらも3回とも落ちて枠ごと見送りになった → 指示で避ける形を示す。
 */
export interface LearningTrial { key: string; label: string; note: string }

export const LEARNING_TRIALS: readonly LearningTrial[] = [
  { key: "len_oneliner", label: "ひとこと（20〜40字）", note: "本文は20〜40字・1〜2行だけ。説明・理由・締めの挨拶は足さない。読んだ人が「自分のことだ」と思える一言にする。" },
  { key: "len_long", label: "長め（200〜300字）", note: "本文は200〜300字。1つの話だけを深く書く（なぜそうなるのか・どうすればいいか）。2〜3文ごとに空行を入れ、話を詰め込まない。" },
  { key: "hook_question", label: "1行目が問いかけ", note: "1行目は、読む人が思わず自分に当てはめる短い問いかけにする（20字以内）。「〜いませんか？」「〜ですよね？」の形は使わず、「〜のはなぜ？」「〜どっち？」のように中身を問う。最後は問いで終わらせず、言い切って終える。" },
  { key: "hook_number", label: "1行目に数字", note: "1行目に、数え言葉の数字を1つ入れる（「3つ」「2つの理由」「1つだけ」のように、本文で挙げる数と合うもの）。時間・期間・割合・人数・回数は、登録情報にそのまま書かれているものだけ使い、無ければ使わない（作り話の点検で止まる）。" },
  { key: "hook_local", label: "1行目に地域名", note: "1行目に登録された地域名を入れ、地元の人に向けた話だと最初に分かるようにする。地域のお店・出来事は作らない。" },
  { key: "list3", label: "箇条書き3つ", note: "要点を「・」で始まる短い3行にまとめ、前後に一言ずつ添える。" },
  { key: "aruaru", label: "地元のあるある・共感", note: "読む人がよく経験する場面（登録情報から言える範囲）を「〜ってありますよね」のように共感で書く。架空の個人の出来事は作らない。" },
  { key: "behind", label: "お店の裏側", note: "スタッフ目線で、お店の準備・こだわり・考えていることを話す（登録情報にあることだけ）。教科書の説明口調にしない。" },
  { key: "season", label: "今の季節の体", note: "今の季節（日本時間の月）に多い体の悩みや過ごし方の話にする。気候の一般的な話だけで、効果は言い切らない。" },
];

/**
 * 今日のこの枠の試し。条件ごとの本数がそろうよう、日付・枠・アカウントで決めた順に回す（同じ日の2店で同じ条件にならない）。
 * learningIndex は学習の枠の中で何番目か（0 始まり）。
 */
export function trialFor(accountId: number, learningIndex: number, now: number = Date.now()): LearningTrial {
  const day = Math.floor((now + JST) / 86400_000);
  const pos = Math.max(0, LEARNING_ACCOUNTS.accountIds.indexOf(accountId));
  const n = LEARNING_TRIALS.length;
  const i = (day * LEARNING_ACCOUNTS.extraSlots * LEARNING_ACCOUNTS.accountIds.length + pos * LEARNING_ACCOUNTS.extraSlots + learningIndex) % n;
  return LEARNING_TRIALS[i];
}

/**
 * 学習の枠の時刻（JST）。ほかの枠は「その時の00〜29分」に出るので、各枠を [h:00, h:30) の幅として扱い、
 * 7:00〜23:00 のうち枠と枠のあいだがいちばん広い所の真ん中に1本ずつ置く（置いた所は次の計算で枠として扱う）。
 * ほかの枠と minGapMinutes 以上あけられなければ、それ以上は置かない。
 * ymd は投稿する日（JST・YYYY-MM-DD）。
 */
export function learningSlotTimes(slotHours: readonly number[], extra: number, ymd: string): Date[] {
  const base = Date.parse(`${ymd}T00:00:00+09:00`);
  const min = (h: number, m = 0) => h * 60 + m;
  // 埋まっている幅（分・0時起点）
  const busy: Array<[number, number]> = slotHours.map((h) => [min(h), min(h, 30)]);
  const out: Date[] = [];
  for (let n = 0; n < extra; n++) {
    const pts = busy.slice().sort((a, b) => a[0] - b[0]);
    // あいだの候補：7:00 の前の端・枠と枠のあいだ・23:00 の後ろの端（日付をまたいで翌日の枠に数えられないように23時まで）
    const gaps: Array<{ from: number; to: number; edge: "start" | "mid" | "end" }> = [];
    const first = min(7), last = min(23);
    if (pts.length === 0) gaps.push({ from: first, to: last, edge: "mid" });
    else {
      gaps.push({ from: first, to: pts[0][0], edge: "start" });
      for (let i = 0; i + 1 < pts.length; i++) gaps.push({ from: pts[i][1], to: pts[i + 1][0], edge: "mid" });
      gaps.push({ from: pts[pts.length - 1][1], to: last, edge: "end" });
    }
    // 置ける時刻と、ほかの枠との距離。端は端に寄せて置く（7:00 ちょうど・23:00 ちょうど）
    let best: { at: number; dist: number } | null = null;
    for (const g of gaps) {
      if (g.to <= g.from) continue;
      const at = g.edge === "start" ? g.from : g.edge === "end" ? g.to : Math.round((g.from + g.to) / 2);
      const dist = g.edge === "start" ? g.to - at : g.edge === "end" ? at - g.from : Math.min(at - g.from, g.to - at);
      if (!best || dist > best.dist) best = { at, dist };
    }
    if (!best || best.dist < LEARNING_ACCOUNTS.minGapMinutes) break;
    out.push(new Date(base + best.at * 60_000));
    busy.push([best.at, best.at + 1]);
  }
  return out.sort((a, b) => a.getTime() - b.getTime());
}
