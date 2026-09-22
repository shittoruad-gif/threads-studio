/**
 * 3案からお選びいただく形（2026-09-22 三上様指示）。
 *
 * > 「こういうクライアントには、削除が2日連続で続いた場合は、3案提示して好きなものを
 * >   選んでもらう形をとってください。謝罪文などは入れずに、AIで自動応答したかのように
 * >   『本日の投稿が却下されたので、この3案を提示します。その中から好きなものをお選びいただくか、
 * >   見送るを押してください』という形に」
 *
 * ★この仕組みで、いちばん気をつけること
 *
 * 承認カードは元々「複数件＝それぞれ公開する」前提で組まれている。3案をそのまま
 * 既存のカードで送ると **3件とも公開される**（9/12 の追い投稿事故と同じ筋）。
 * そこで3案は「1つの枠に対する選択肢」として扱い、次を必ず守る。
 *
 *   1. 先頭の文面は「見送らなければ公開されます」ではなく「お選びください」にする
 *   2. 「すべて承認する（3件）」を出さない
 *   3. ボタンは「これで投稿する」ではなく「この案にする」
 *   4. 押されなければ **1件も公開しない**（見送りしなければ公開＝autoPublishIfNoResponse の対象外）
 *   5. 1案が選ばれたら、残りは即 canceled にする
 *   6. 1日の本数の計算では、3案を **1件** として数える
 *
 * ここ（shared）にはDBに触れない判断だけを置く。DB側は server/threeChoiceMode.ts。
 */

/** 3案が同じ枠のものだと分かる印（scheduledPosts.choiceGroupId） */
export const CHOICE_GROUP_PREFIX = "ch";

/** 1つの枠に出す案の数 */
export const CHOICE_COUNT = 3;

/** 何日続けて公開に至らなければ3案に切り替えるか */
export const CHOICE_TRIGGER_DAYS = 2;

/**
 * 3案の切り口。同じ材料から3本作ると「材料が同じところへ戻る」既知の問題
 * （プレステージ様・香取様）が出るため、切り口を3つ別々に指定して作る。
 *
 * ★健康系のお店で外される切り口（change_story / customer_voice＝結果を語る型）は
 *   意図的に入れていない。外されると3案が2案に減ってしまうため。
 */
export const CHOICE_ANGLE_IDS: readonly string[] = ["misconception", "behind_scenes", "reservation_funnel"];

/** その日の「公開に至ったか」を判定するための、1日ぶんの実績 */
export interface DayOutcome {
  /** JSTの日付（YYYY-MM-DD） */
  date: string;
  /** その日に作られた自動投稿の数 */
  created: number;
  /** その日にThreadsへ公開でき、いまも残っている投稿の数 */
  published: number;
}

/**
 * 3案に切り替えるか。
 *
 * 「公開に至らなかった日」＝ 投稿は作られたのに、公開されたものが0件の日。
 *   ・ご本人が見送った（canceled／✕）
 *   ・承認されないまま日をまたいで自動見送り
 *   ・公開したがThreads上から消えた（failed／健全性点検の検知）
 * のいずれでも、結果として published が 0 になる。
 *
 * ★投稿が1本も作られなかった日は対象にしない。それは「材料が足りない」問題で、
 *   既にお詫びと追記のお願い（zeroPostApology）が受け持っている。
 *   3案を出しても、作れない材料からは作れない。
 */
export function shouldOfferChoices(recentDays: DayOutcome[]): boolean {
  if (recentDays.length < CHOICE_TRIGGER_DAYS) return false;
  // 新しい日から順に、続けて「作られたのに公開ゼロ」が CHOICE_TRIGGER_DAYS 日あるか
  const sorted = [...recentDays].sort((a, b) => (a.date < b.date ? 1 : -1));
  for (let i = 0; i < CHOICE_TRIGGER_DAYS; i++) {
    const d = sorted[i];
    if (!d) return false;
    if (d.created <= 0) return false;   // 作られていない日は対象外
    if (d.published > 0) return false;  // 1件でも公開できていれば切れる
  }
  return true;
}

/** 3案の先頭に送る文面（お詫びを入れない・自動応答の体裁） */
export const CHOICE_LEAD_TEXT =
  "本日の投稿が却下されましたので、あらためて3案をご用意しました。\n" +
  "この中からお好きなものをお選びいただくか、「見送る」を押してください。\n" +
  "お選びいただいた1案だけを公開します（選ばれなかった案は公開しません）。";

/** 1案を選んでいただいたときのお返事 */
export function choiceChosenText(remaining: number): string {
  return remaining > 0
    ? `承知しました。この案を公開の予定に入れました。\n選ばれなかった${remaining}件は公開しません。`
    : "承知しました。この案を公開の予定に入れました。";
}

/** 3案すべて見送られたときのお返事 */
export const CHOICE_ALL_SKIPPED_TEXT =
  "承知しました。本日は公開を見送ります。\n" +
  "次の投稿は明日の朝にお届けします。ご希望の内容があれば、このトークにそのままお送りください。";

/** この投稿は3案のうちの1つか */
export function isChoicePost(post: { choiceGroupId?: string | null } | null | undefined): boolean {
  return Boolean(post && post.choiceGroupId);
}

/** 3案の印を作る（枠ごとに1つ） */
export function newChoiceGroupId(accountId: number, jstDate: string, rand: () => number = Math.random): string {
  const suffix = Math.floor(rand() * 1e6).toString(36);
  return `${CHOICE_GROUP_PREFIX}-${accountId}-${jstDate.replace(/-/g, "")}-${suffix}`.slice(0, 40);
}
