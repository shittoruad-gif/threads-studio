/**
 * 動いていないお客様のフォロー（2026-09-25 三上様指示「クライアントが数日間動いていなければ、
 * そこに対してフォローできるような仕組みも作ってください」）。判断と文面だけを持つ（DB・LINEは server/clientFollowup.ts）。
 *
 * 「止まっている」とみなすのは2つだけ（事実で判定する）:
 *   setup  … 投稿が出ない工程（お店の情報・Threads連携・自動投稿OFF など）で、同じ工程のまま STALL_DAYS 日
 *   silent … 設定は終わっているのに、SILENT_DAYS 日公開ゼロ（承認待ちのまま流れている等）
 * 「理想の投稿が未登録」「ご案内先URLが未登録」「ピン留め未確認」などは、投稿が出ていれば止まっているとは言わない
 * （2026-09-25 の朝の報告では、毎日投稿が出ている方まで「止まっている」に並んでいた）。
 *
 * お客様へは自動で送らない。三上様のLINEに「事実＋送る文の案」を届け、「この文で送る」を押したものだけ送る。
 */

/**
 * 朝の報告と、動いていないお客様のフォローに出さない方（三上様のご判断）。
 *   6518 比嘉美和様 … 2026-09-25 三上様「これはスルーで大丈夫です」
 */
export const OPS_IGNORE_USER_IDS: ReadonlySet<number> = new Set([6518]);

export const STALL_DAYS = 3;
export const SILENT_DAYS = 3;
/** 同じお客様への案は、この日数あける */
export const REPROPOSE_DAYS = 3;

/** 工程キー → 社内向けの短い日本語（朝の報告と共通） */
export const STEP_LABEL: Record<string, string> = {
  no_project: "お店の情報が未登録",
  project_almost: "お店の情報があと少し（一部の項目が空）",
  no_account: "Threads未連携",
  account_without_project: "アカウントに店舗情報が未紐づけ",
  account_unpinned: "どの店舗情報を使うか未設定",
  no_style_samples: "理想の投稿（お手本）が未登録",
  no_link: "ご案内先URLが未登録",
  profile_bio: "Threadsの自己紹介が空・短い",
  no_pinned: "固定投稿が未作成",
  not_posted: "固定投稿がThreads未公開",
  pin_not_confirmed: "固定投稿のピン留めが未確認",
  auto_off: "自動投稿がOFF",
  approval_off: "公開前の確認がOFF",
  acct_project: "使うお店の情報が未設定",
  acct_pinned: "固定投稿が未作成",
  acct_posted: "固定投稿がThreads未公開",
  acct_pin: "固定投稿のピン留めが未確認",
  acct_auto: "自動投稿がOFF",
};

/** これが終わらないと投稿が1件も出ない工程 */
export const BLOCKING_STEPS: ReadonlySet<string> = new Set([
  "no_project", "project_almost", "no_account", "account_without_project", "account_unpinned",
  "acct_project", "auto_off", "acct_auto",
]);

export function stepBase(key: string | null | undefined): string {
  return String(key || "").split(":")[0];
}

export function stepLabel(key: string, accountName?: string | null): string {
  const label = STEP_LABEL[stepBase(key)] ?? key;
  return accountName ? `${accountName}：${label}` : label;
}

export function isBlockingStep(key: string | null | undefined): boolean {
  return BLOCKING_STEPS.has(stepBase(key));
}

export type StallReason = "setup" | "silent";
export type SilentCause = "approval" | "cooldown" | "failed" | "unknown";

export interface StallInput {
  /** いまの工程（detectNextAction の key。何も無ければ null） */
  stepKey: string | null;
  /** その工程のままの日数 */
  stepDays: number;
  /** Threadsアカウントがつながっているか */
  hasAccount: boolean;
  /** 直近 SILENT_DAYS 日に公開できた件数 */
  postedRecent: number;
  /** 最後に公開できた日からの日数（1件も無ければ null） */
  daysSinceLastPost: number | null;
  /** 連携からの日数（連携したばかりの方を「止まっている」と言わない） */
  daysSinceConnect: number | null;
}

export interface StallDecision {
  reason: StallReason;
  days: number;
}

export function decideStall(i: StallInput): StallDecision | null {
  if (i.stepKey && isBlockingStep(i.stepKey)) {
    return i.stepDays >= STALL_DAYS ? { reason: "setup", days: i.stepDays } : null;
  }
  if (!i.hasAccount) return null;
  if (i.postedRecent > 0) return null;
  if (i.daysSinceConnect !== null && i.daysSinceConnect < SILENT_DAYS) return null;
  const days = i.daysSinceLastPost ?? (i.daysSinceConnect ?? SILENT_DAYS);
  return days >= SILENT_DAYS ? { reason: "silent", days } : null;
}

export interface DraftInput {
  userName: string;
  reason: StallReason;
  stepKey: string | null;
  accountName?: string | null;
  days: number;
  /** 何回目のご連絡か（1〜） */
  level: number;
  /** プロプラン以上（運営が一緒に進める・Zoomの案内ができる） */
  proSupport: boolean;
  silentCause?: SilentCause;
}

/** お客様へ送る文が作れない（運営側で対応する）ケース */
export function needsInternalFixOnly(i: Pick<DraftInput, "reason" | "silentCause">): boolean {
  return i.reason === "silent" && (i.silentCause === "failed" || i.silentCause === "cooldown" || i.silentCause === "unknown");
}

function stepBody(key: string, acct: string): string {
  const who = acct ? `${acct} の` : "";
  switch (stepBase(key)) {
    case "no_project":
      return "お店の情報の登録が、まだ始まっていないようでしたのでご連絡しました。\nお店のホームページ（ホットペッパー・Instagram・Googleマップでも大丈夫です）のURLを、このトークにそのまま貼っていただければ、こちらで読み取って先に入れておきます。残りは数問・2分ほどで終わります。";
    case "project_almost":
      return "お店の情報が、あと少しのところで止まっているようでしたのでご連絡しました。\n空いている項目に答えていただくと、翌朝から投稿が届きます（30秒ほどです）。";
    case "no_account":
      return "Threadsとの連携がまだのようでしたので、ご連絡しました。\n連携が済むと、翌朝から投稿が始まります。下のボタンから進められます（パソコンからの操作がおすすめです）。";
    case "account_without_project":
    case "account_unpinned":
    case "acct_project":
      return `${who}アカウントに、どのお店の情報を使うかが決まっていないため、投稿を作れない状態になっていました。\n下のボタンから選んでいただくと、翌朝から投稿が届きます。`;
    case "auto_off":
    case "acct_auto":
      return `${who}毎日の自動投稿がOFFのままになっていたため、ご連絡しました。\n下のボタンで、いつでも再開できます。お休みしたい場合は、このままで大丈夫です。`;
    default:
      return "設定が途中で止まっているようでしたので、ご連絡しました。下のボタンから続きを進められます。";
  }
}

/** お客様へ送る文の案（三上様が「この文で送る」を押したときだけ送る） */
export function draftMessage(i: DraftInput): string {
  const acct = i.accountName ?? "";
  const head = `${i.userName ? `${i.userName}様\n` : ""}Threads Studio運営です。\n\n`;
  let body: string;
  if (i.reason === "setup" && i.stepKey) {
    body = stepBody(i.stepKey, acct);
  } else {
    // silent（承認待ちのまま流れている）
    body = `ここ${i.days}日ほど、投稿が公開されていない状態でしたのでご連絡しました。\n` +
      "届いた投稿の確認がまだのまま、日付が変わって見送りになっていました。\n" +
      "「今日の投稿」から確認して、そのまま公開できます。確認なしで自動で公開する設定に切り替えることもできます。";
  }
  const help = i.level >= 2
    ? (i.proSupport
      ? "\n\n文字だけでは進めにくい場合は、Zoomで画面を一緒に見ながら進めることもできます（初回30分）。「Zoom希望」とお送りください。ご自身でやるのが大変なときは、運営が代わりに進めることもできます。"
      : "\n\nお困りのときは、その画面のスクリーンショットをこのトークに送ってください。こちらで確認してお返しします。")
    : "\n\nお困りのことがあれば、このトークにそのままお送りください（画面のスクリーンショットでも大丈夫です）。";
  return head + body + help;
}

export interface AdminCardInput {
  userName: string;
  planName: string;
  reason: StallReason;
  stepKey: string | null;
  accountName?: string | null;
  days: number;
  stepSince?: string | null;      // YYYY-MM-DD
  lastPostedAt?: string | null;   // YYYY-MM-DD
  lastLineActiveDays?: number | null;
  level: number;
  lastSentAt?: string | null;     // YYYY-MM-DD
  silentCause?: SilentCause;
  silentDetail?: string | null;
}

const CAUSE_LABEL: Record<SilentCause, string> = {
  approval: "承認待ちのまま見送りになっている",
  cooldown: "Threadsに投稿を消されたため冷却期間中（1日1件）",
  failed: "投稿の公開に失敗している",
  unknown: "原因をまだ特定できていない",
};

/** 三上様へお送りする事実のまとめ */
export function adminCard(i: AdminCardInput): string {
  const what = i.reason === "setup" && i.stepKey
    ? `${stepLabel(i.stepKey, i.accountName)}（${i.days}日前から${i.stepSince ? `・${i.stepSince.slice(5).replace("-", "/")}〜` : ""}）`
    : `${i.days}日間、公開ゼロ（${CAUSE_LABEL[i.silentCause ?? "unknown"]}）`;
  const lines = [
    `【動いていないお客様】${i.userName} 様（${i.planName}）`,
    `・止まっていること：${what}`,
    ...(i.silentDetail ? [`・詳しく：${i.silentDetail}`] : []),
    `・最後の公開：${i.lastPostedAt ? i.lastPostedAt.slice(5).replace("-", "/") : "まだ1件もありません"}`,
    `・最後にLINEを操作：${i.lastLineActiveDays === null || i.lastLineActiveDays === undefined ? "記録なし" : i.lastLineActiveDays === 0 ? "今日" : `${i.lastLineActiveDays}日前`}`,
    `・フォロー：${i.level}回目${i.lastSentAt ? `（前回 ${i.lastSentAt.slice(5).replace("-", "/")} に送信）` : ""}`,
  ];
  return lines.join("\n");
}
