import { LOCAL_TALK, LOCAL_TALK_ANGLE_ID } from "./localTalk";

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
  accountIds: [10, 12, 36] as readonly number[],
  /** 10/10 まで（1日7本の時期）の上乗せ本数。Moveact 2店だけ */
  extraSlots: 2,
  legacyAccountIds: [10, 12] as readonly number[],
  start: "2026-10-08",
  until: "2026-11-30",
  /** 学習の枠とほかの枠との最小の間隔（分）。これより狭くしか置けない日は置ける分だけ */
  minGapMinutes: 60,
} as const;

/**
 * ★1日30本へ（2026-10-10 三上様「ムーブアクトと株式会社しっとるのアカウントは1日30投稿を目安に、最速でリーチを取れる投稿を
 *   早急に調べ上げてください。それをもとに投稿の傾向を掴むようにしたい」）。
 *   対象：Moveact 玉島(10)・金光(12)・株式会社しっとる公式(36)。1日の合計本数（契約・試しを含む）を30本。
 *   ★当初は4日で段を踏む設計だったが、10/11 00:46 三上様「今日から30本にして」で初日から30本（段なし）。
 *   - 段を踏む設計にしていた理由（守りは25分の間隔と冷却で残す）：Threadsの多すぎる投稿の判定は本数ではなく「動き方」（短い間隔の連投）で決まり、
 *     9/12 には同じ日に8〜10本出たアカウントで投稿が消された。段を踏み、投稿どうしは25分以上あける。
 *   - APIの上限は1プロフィール24時間で250本（Meta）。30本はその内側。
 *   - 投稿が1件でも消されたら冷却（1日1件・7日）が先に効き、上乗せは0になる（再開は三上様の判断）。
 *   学習の枠は朝の生成ではなく、毎時の生成（server/learningBurstJob.ts）が次の1時間分ずつ作る。
 */
export const LEARNING_BURST = {
  // ★10/11 三上様「学習用アカウントは今日から30本にして」→ 段（12→18→24→30）をやめ、初日から30本
  ramp: [
    { from: "2026-10-11", total: 30 },
  ] as const,
  /** 1日のうち学習の投稿を置く範囲（JST・分） */
  firstMinute: 7 * 60,
  lastMinute: 23 * 60 + 20,
  /** ほかの投稿との最小の間隔（分） */
  minGapMinutes: 25,
};

const JST = 9 * 3600_000;
const jstYmd = (now: number) => new Date(now + JST).toISOString().slice(0, 10);

/** その日の1日の合計本数の目安（段の前は null） */
export function burstTotalFor(ymd: string): number | null {
  let total: number | null = null;
  for (const r of LEARNING_BURST.ramp) if (ymd >= r.from) total = r.total;
  return total;
}

export function inLearning(accountId: number, now: number = Date.now()): boolean {
  if (!LEARNING_ACCOUNTS.accountIds.includes(accountId)) return false;
  const d = jstYmd(now);
  return d >= LEARNING_ACCOUNTS.start && d <= LEARNING_ACCOUNTS.until;
}

/**
 * 今日この口座に上乗せする学習の枠の数（冷却中・慣らし中は0）。
 * baseCount はその日の契約＋補填の本数（rampForAccount の結果）。段の日は「合計の目安 − baseCount」。
 */
/**
 * 冷却が明けた直後の学習の本数（2026-10-25 三上様「金光がほとんど投稿できていない、見直して」）。
 *   acc12 は 10/18 に1日28本の日に1本消され、冷却（1日1本）に入った。明けた瞬間に1日30本へ戻すと、消されたときと同じ状態に戻る。
 *   冷却が明けた日を0日目として、少しずつ戻す。8日目からいつもの本数。
 */
export const AFTER_COOLDOWN_LEARNING = [3, 5, 8, 12, 16, 20, 25] as const;

export function afterCooldownLearningCap(cooldownUntil: Date | string | null | undefined, now: number = Date.now()): number | null {
  if (!cooldownUntil) return null;
  const until = cooldownUntil instanceof Date ? cooldownUntil.getTime() : Date.parse(String(cooldownUntil).replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(cooldownUntil)) ? "" : "Z"));
  if (!Number.isFinite(until) || now < until) return null;
  const day = Math.floor((Date.parse(jstYmd(now) + "T00:00:00Z") - Date.parse(jstYmd(until) + "T00:00:00Z")) / 86_400_000);
  return day >= 0 && day < AFTER_COOLDOWN_LEARNING.length ? AFTER_COOLDOWN_LEARNING[day]! : null;
}

export function learningExtra(accountId: number, opts: { capped: boolean; baseCount?: number; cooldownUntil?: Date | string | null }, now: number = Date.now()): number {
  if (opts.capped || !inLearning(accountId, now)) return 0;
  const total0 = burstTotalFor(jstYmd(now));
  const cap = afterCooldownLearningCap(opts.cooldownUntil, now);
  const total = total0 == null ? total0 : cap == null ? total0 : Math.min(total0, cap);
  if (total == null) return LEARNING_ACCOUNTS.legacyAccountIds.includes(accountId) ? LEARNING_ACCOUNTS.extraSlots : 0;
  return Math.max(0, total - Math.max(0, Math.floor(opts.baseCount ?? 0)));
}

/** 毎時の生成が使う、その日の学習の投稿の候補時刻（JST・目安の本数で7:00〜23:20を等間隔に割る） */
export function burstGrid(ymd: string, total: number): Date[] {
  const base = Date.parse(`${ymd}T00:00:00+09:00`);
  const n = Math.max(1, Math.floor(total));
  const span = LEARNING_BURST.lastMinute - LEARNING_BURST.firstMinute;
  const step = span / n;
  return Array.from({ length: n }, (_, i) => new Date(base + Math.round(LEARNING_BURST.firstMinute + i * step) * 60_000));
}

/**
 * 候補時刻のうち、今から作るもの（from〜to の間・ほかの投稿と minGapMinutes 以上あく）。
 * occupied は今日すでに予定・公開されている投稿の時刻（学習の投稿を含む＝何度動かしても二重に作らない）。
 */
export function burstSlotsToMake(grid: readonly Date[], occupied: readonly Date[], from: number, to: number): Date[] {
  const gap = LEARNING_BURST.minGapMinutes * 60_000;
  const taken = occupied.map((d) => d.getTime());
  const out: Date[] = [];
  for (const g of grid) {
    const t = g.getTime();
    if (t < from || t > to) continue;
    if (taken.some((o) => Math.abs(o - t) < gap)) continue;
    out.push(g);
    taken.push(t);
  }
  return out;
}

/**
 * 学習の試し（1回に1つの条件だけを変える）。指示はほかの指示より優先させるが、作り話・効果の断定の禁止はそのまま。
 * 選んだ理由：10/2 実測で差が出ていたもの（長さ・地域名・数字）と、まだ測れていないもの（問いかけ・箇条書き・共感・裏側・季節）。
 * ★10/8 初日：「1行目に数字」は例の「30秒」「1日5分」に引かれて「60分間」「待ち時間0分」「9割」を書き作り話の点検で、
 *   「1行目が問いかけ」は禁止の「〜いませんか？」で、どちらも3回とも落ちて枠ごと見送りになった → 指示で避ける形を示す。
 * ★10/9 朝：「箇条書き3つ」が「マンツーマンピラティス、選ばれる理由3つ。」「3つの強み。」の宣伝の見出しになり、
 *   自然さの採点で2回とも2/5に落ちて枠ごと見送り → 宣伝の見出し・締めを避け、読む人の側の3つにする指示を足した（採点は緩めない）。
 * ★10/10 朝（acc10 玉島）：「ひとこと」が「運動が続かない人、倉敷市玉島で3人に1人。」のように名詞と割合で切れて
 *   自然さ2/5、3回目は「私もそうでした」で作り話の点検に落ちた。「長め」も「私だけじゃないはず」で落ちた（2枠とも見送り）。
 *   → ひとことは「です・ます」で言い切る一文に、割合・人数を作らない。書き手の体験・心の声は全部の試しで書かない（TRIAL_COMMON_RULES）。
 */
export interface LearningTrial { key: string; label: string; note: string }

/**
 * どの試しでも守ること（試しの指示の後ろに必ず付ける）。試しは切り口なしで書くため、書き手の体験談で間を埋めやすい。
 * 「私もそうでした」「私だけじゃないはず」は作り話の点検（history）で止まり、外すと文が成り立たず枠ごと見送りになる（10/10 acc10）。
 */
export const TRIAL_COMMON_RULES: readonly string[] = [
  "書き手（店主・スタッフ）自身の体験・過去・心の声は書かない（「私もそうでした」「私だけじゃないはず」「昔の私は」など）。読む人の側の話として書く。",
  "割合・人数・統計（「3人に1人」「9割」など）は、登録情報にそのまま書かれているものだけ。無ければ書かない。",
  "作り話・効果の断定・登録に無い事実・価格の禁止は変わらない。",
  "締めを「〜が解決します」「サポートします」「お任せください」「ご相談ください」や、店名・社名を主語にした「〇〇は〜します」のような、どの店でも言える宣伝の一文にしない。最後の文は、この投稿の中身にしか当てはまらない言葉にする。",
];

/**
 * 試しの指示の後ろに付ける決まり（TRIAL_COMMON_RULES ＋ 絵文字）。
 * ★10/11 acc36（しっとる公式・お手本なし・落ち着いた口調）：試しは短く崩すリライト（naturalizeContent）を通さないため、
 *   共通の最終指示「絵文字を1〜3個、毎回必ず」の😊🙌😅がそのまま残り、採点で「落ち着いた口調と合わない」と落ちていた
 *   （24時間で acc36 13枠・acc12 10枠が見送り。リライトを通る普段の枠では、ここで絵文字が消えていた）。
 *   絵文字を使わない方には、試しの決まりで明示する（採点は緩めない）。
 */
export function trialRules(allowEmoji: boolean): string[] {
  return [
    ...TRIAL_COMMON_RULES,
    ...(allowEmoji ? [] : ["絵文字は使わない（上の「絵文字を1〜3個」の指示より、こちらを優先）。"]),
  ];
}

export const LEARNING_TRIALS: readonly LearningTrial[] = [
  { key: "len_oneliner", label: "ひとこと（20〜40字）", note: "本文は20〜40字・1〜2行だけ。説明・理由・締めの挨拶は足さない。読んだ人が「自分のことだ」と思える一言にする。お店のふだんの口調（です・ます）で言い切る文にし、名詞や数字で途中で切ったような終わり方（「〜な人、玉島で3人に1人。」）にしない。割合・人数・統計は書かない。" },
  { key: "len_long", label: "長め（200〜300字）", note: "本文は200〜300字。1つの話だけを深く書く（なぜそうなるのか・どうすればいいか）。2〜3文ごとに空行を入れ、話を詰め込まない。" },
  { key: "hook_question", label: "1行目が問いかけ", note: "1行目は、読む人が思わず自分に当てはめる短い問いかけにする（20字以内）。「〜いませんか？」「〜ですよね？」の形は使わず、「〜のはなぜ？」「〜どっち？」のように中身を問う。最後は問いで終わらせず、言い切って終える。" },
  { key: "hook_number", label: "1行目に数字", note: "1行目に、数え言葉の数字を1つ入れる（「3つ」「2つの理由」「1つだけ」のように、本文で挙げる数と合うもの）。時間・期間・割合・人数・回数は、登録情報にそのまま書かれているものだけ使い、無ければ使わない（作り話の点検で止まる）。" },
  { key: "hook_local", label: "1行目に地域名", note: "1行目に登録された地域名を入れ、地元の人に向けた話だと最初に分かるようにする。地域のお店・出来事は作らない。" },
  { key: "list3", label: "箇条書き3つ", note: "要点を「・」で始まる短い3行にまとめ、前後に一言ずつ添える。3行はお店の強み・選ばれる理由の宣伝にせず、読む人がよく思い当たること・自分で気をつけられることを、話し言葉で書く。「〇〇、選ばれる理由3つ。」「3つの強み。」のような見出しの書き出しや、「理想の体づくりをサポート」「一歩！」のような宣伝の締めは使わない。" },
  { key: "aruaru", label: "地元のあるある・共感", note: "読む人がよく経験する場面（登録情報から言える範囲）を「〜ってありますよね」のように共感で書く。架空の個人の出来事は作らない。" },
  { key: "behind", label: "お店の裏側", note: "スタッフ目線で、お店の準備・こだわり・考えていることを話す（登録情報にあることだけ）。教科書の説明口調にしない。" },
  { key: "season", label: "今の季節の体", note: "今の季節（日本時間の月）に、このお店のお客さんが困りやすいこと・過ごし方の話にする（体のお店なら体の悩み、それ以外はその業種の話。業種と関係のない体調の話にしない）。気候の一般的な話だけで、効果は言い切らない。" },
  // ★10/10 追加（1日30本の試し）。Threadsは閲覧の約半分が返信から生まれるとされ（Meta日本法人の登壇のまとめ）、
  //   冒頭3行で結論を置く・主張を言い切る（スレッズ勉強会の宿題「主張を決めて叫ぶ」）も、まだ測れていない。
  { key: "ask_reader", label: "最後に読者へ質問", note: "最後の1文を、読む人が答えやすい具体的な質問にする。主語と述語のそろった丁寧な1文で書く（例「朝と夜、腰が重く感じるのはどちらが多いですか？」）。「〜派？」のように一語で切る質問、「〜いませんか？」「〜ですよね？」の形は使わない（口調の点検で止まる）。質問は最後の1つだけ。" },
  { key: "opinion", label: "主張を言い切る", note: "お店の考え（登録された信条・こだわりにあること）を1つだけ選び、1行目で言い切る。理由を短く添えて終える。誰か・他店を否定しない。効果は約束しない。" },
  { key: "conclusion_first", label: "1行目で結論", note: "1行目に、この投稿でいちばん伝えたい結論を書く。2行目以降で理由を短く。結論を最後まで引っ張らない。" },
  { key: "compare", label: "2つを比べる", note: "読む人がよく迷う2つ（例：温めるか冷やすか、朝と夜、立ち仕事と座り仕事）を並べて、違いを短く書く。登録情報や一般的な知識から言えることだけ。効果は言い切らない。" },
  // ★10/18 追加（三上様「普段の投稿やスレッドスタジオにもこれを活かして」・shared/localTalk.ts）。
  //   手で書いた地元の人への問いかけ（4,000〜5,700表示・返信10〜25）を、学習の枠の約半分で試して測る。
  //   ほかの試しと違い、学習の枠の LOCAL_TALK.learningEvery 枠に1枠をこれにする（trialFor）。
  { key: LOCAL_TALK_ANGLE_ID, label: "地元の会話", note: "地元に住む人へ、町のこと（地元の食べ物・身近な場所・この季節の地元のこと・方言・暮らしのあるある）を話しかける短いつぶやきにする。決まりは上の【今回は「地元の会話」の回】のとおり（20〜60字・地名を1回・一言で答えられる小さな質問で終える・お店の宣伝や効果の話は書かない）。" },
];

/** 地元の会話の試し（学習の枠の約半分） */
export const LOCAL_TALK_TRIAL: LearningTrial = LEARNING_TRIALS.find((t) => t.key === LOCAL_TALK_ANGLE_ID)!;
/** 地元の会話以外の試し（残りの枠で順に回す） */
export const OTHER_TRIALS: readonly LearningTrial[] = LEARNING_TRIALS.filter((t) => t.key !== LOCAL_TALK_ANGLE_ID);

/**
 * 今日のこの枠の試し。条件ごとの本数がそろうよう、日付・枠・アカウントで決めた順に回す（同じ日の2店で同じ条件にならない）。
 * learningIndex は学習の枠の中で何番目か（0 始まり）。
 */
export function trialFor(accountId: number, learningIndex: number, now: number = Date.now()): LearningTrial {
  const day = Math.floor((now + JST) / 86400_000);
  const pos = Math.max(0, LEARNING_ACCOUNTS.accountIds.indexOf(accountId));
  const idx = Math.max(0, Math.floor(learningIndex));
  // ★地元の会話（10/18）：学習の枠の LOCAL_TALK.learningEvery 枠に1枠（2 なら偶数番目＝約半分）
  const every = Math.floor(LOCAL_TALK.learningEvery);
  let k = idx;
  if (every > 0) {
    if (idx % every === 0) return LOCAL_TALK_TRIAL;
    k = idx - Math.floor(idx / every) - 1; // 地元の会話以外の枠の中で何番目か
  }
  const n = OTHER_TRIALS.length;
  // 日ごと・アカウントごとに出発点をずらし、枠の順に1つずつ進める（1日にどの条件も同じくらい出る）
  const i = (day * 5 + pos * 4 + k) % n;
  return OTHER_TRIALS[i];
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
