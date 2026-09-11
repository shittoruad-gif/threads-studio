/**
 * 毎日の自動投稿が始まるために、お店の情報でそろっている必要がある項目。
 *
 * ★ここが「唯一の正」。自動投稿の対象を決める側（server/autoPostScheduler.ts の
 *   eligibleProjects）と、お客様への案内（server/lineChatHandler.ts の設定完了・
 *   次にやること）で別々に条件を書くと、片方だけ直したときに
 *   「案内では始まると書いてあるのに1本も作られない」という食い違いになる。
 *
 * ★「まず5問」の設定では「お客さん像」と「強み」が空のまま終わる。
 *   そのため新しくご登録いただいた方は、ここが埋まるまで投稿が1本も作られない
 *   （2026-09-12 夜間整備でローカルQAの通し確認により再現）。
 *   必須条件そのものを減らすかどうかは仕様のご判断のため、ここでは変えていない。
 */

export interface AutoPostField {
  /** 「はじめの設定」の質問ID（c=more&f=... でその1問から聞くために使う） */
  id: string;
  /** お客様にお見せする呼び名 */
  label: string;
  /** projects テーブルの列名 */
  column: "businessType" | "area" | "mainProblem" | "target" | "strength";
}

/** 自動投稿に要る項目（お聞きする順） */
export const AUTO_POST_FIELDS: AutoPostField[] = [
  { id: "businessTypeRaw", label: "どんなお店か", column: "businessType" },
  { id: "areaRaw", label: "お店のある場所", column: "area" },
  { id: "mainProblemRaw", label: "お客さんのお悩み", column: "mainProblem" },
  { id: "targetRaw", label: "お客さん像", column: "target" },
  { id: "strengthRaw", label: "お店の強み", column: "strength" },
];

/** まだ埋まっていない項目（空なら投稿は作られない） */
export function missingAutoPostFields(project: unknown): AutoPostField[] {
  const p = (project ?? {}) as Record<string, unknown>;
  return AUTO_POST_FIELDS.filter((f) => !String(p[f.column] ?? "").trim());
}

/** そのお店の情報で自動投稿を作れるか */
export function canAutoPost(project: unknown): boolean {
  return missingAutoPostFields(project).length === 0;
}
