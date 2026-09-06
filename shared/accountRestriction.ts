/**
 * Threads/Meta側の「制限・停止・本人確認」をAPIエラー文から見分ける（2026-09-06 梅原様の停止を受けて）。
 * 見分けたら自動投稿を自動で止め、本人と運営に知らせる（止まらずに投稿し続けると判定が悪化する）。
 */
export type RestrictionKind = "restricted" | "token" | "rate" | "none";

const RESTRICTED_RE = /(restrict|suspend|disabled|checkpoint|challenge|not\s+allowed|blocked|spam|integrity|community\s+standards|account\s+has\s+been|\(#10\)|\(#368\)|\(#3\)|code\s*[:=]?\s*(10|368|3)\b)/i;
const TOKEN_RE = /(invalid\s+oauth\s+access\s+token|access\s+token|session\s+has\s+expired|\(#190\)|code\s*[:=]?\s*190\b|error\s+validating)/i;
const RATE_RE = /(rate\s*limit|too\s+many|\(#4\)|\(#17\)|\(#32\)|\(#613\)|code\s*[:=]?\s*(4|17|32|613)\b|temporarily\s+blocked)/i;

export function classifyThreadsError(message: string | null | undefined): RestrictionKind {
  const m = String(message || "");
  if (!m) return "none";
  if (RESTRICTED_RE.test(m)) return "restricted";
  if (RATE_RE.test(m)) return "rate";
  if (TOKEN_RE.test(m)) return "token";
  return "none";
}

export function restrictionNoticeForUser(username: string): string {
  return (
    `@${username} のThreadsアカウントに、Meta側の制限（本人確認・一時停止など）が出ているようです。\n` +
    "判定が悪化しないよう、このアカウントの自動投稿をいったん止めました。\n\n" +
    "お願い\n" +
    "1. Threadsアプリを開き、本人確認（電話番号・顔写真）や異議申立の案内が出ていれば正直に完了してください\n" +
    "2. 結果が出るまで、ご自身の投稿・フォロー・いいねも控えてください\n" +
    "3. 使えるようになったら、このLINEで「設定」→「自動投稿を始める」を押してください。最初の2週間は1日1〜2件で様子を見ます\n\n" +
    "分からないことは、このままここに送ってください。"
  );
}
