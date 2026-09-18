/**
 * 列だけを直す操作を、「はじめの設定」の答え（counselingResult）にも反映する。
 *
 * ★2026-09-18 森様の実データで起きていたこと：
 *   AI投稿画面の「プロジェクト情報」から業種・お客さん像・強みなどを直すと、
 *   projects の列だけが新しくなり、counselingResult.rawAnswers と要旨（brief）は
 *   前のままだった。要旨は毎日の投稿の最優先の材料なので、
 *   交通事故専門のアカウントに「産後骨盤矯正」の投稿が作られていた
 *   （scheduledPosts 1631・見送り）。
 *   お客様から見ると「直せる項目と直せない項目がある」「AIの理解が直らない」になる。
 *
 *   列と答えは同じものを指しているので、列を直したらここで答えも合わせる。
 *   逆向き（はじめの設定の保存）は counselingSave.ts が列まで書くので、両方向そろう。
 */
import * as db from "./db";

/** 列 → はじめの設定の質問id（同じ内容を指しているものだけ） */
const COLUMN_TO_ANSWER: Record<string, string> = {
  storeName: "storeNameRaw",
  businessType: "businessTypeRaw",
  area: "areaRaw",
  target: "targetRaw",
  mainProblem: "mainProblemRaw",
  strength: "strengthRaw",
  usp: "uspRaw",
  proof: "realProofsRaw",
  n1Customer: "realEpisodesRaw",
  belief: "industryMythsRaw",
  ngWords: "ngListRaw",
};

/**
 * @param projectId 直したプロジェクト
 * @param changed  今回書き換えた列（updateProject に渡したもの）
 *
 * counselingResult がまだ無いプロジェクトは何もしない
 * （その場合は列がそのまま答えとして読まれるので、食い違いは起きない）。
 */
export async function syncCounselingFromColumns(
  projectId: string,
  changed: Record<string, unknown>,
): Promise<void> {
  try {
    const project: any = await db.getProjectById(projectId);
    if (!project?.counselingResult) return;

    let prev: any;
    try { prev = JSON.parse(project.counselingResult); } catch { return; }
    if (!prev || typeof prev !== "object") return;

    const answers: Record<string, string> = { ...(prev.rawAnswers ?? {}) };
    // ★答えが1つも残っていない古い登録は触らない。
    //   ここで作り直すと、メニュー・営業時間・実績など「答え以外の場所にだけ
    //   残っている内容」が空になってしまう（例：Moveact玉島店の登録）。
    //   そういう登録は列がそのまま投稿の材料になるので、食い違いも起きない。
    if (Object.keys(answers).length === 0) return;
    let touched = false;
    for (const [column, answerId] of Object.entries(COLUMN_TO_ANSWER)) {
      if (!(column in changed)) continue;
      const v = changed[column];
      if (typeof v !== "string") continue;
      const next = v.trim();
      if ((answers[answerId] ?? "") === next) continue;
      answers[answerId] = next;
      touched = true;
    }
    if (!touched) return;

    const { buildCounselingResult } = await import("../shared/counseling");
    const result: any = buildCounselingResult(
      answers as any,
      prev.freeFormSummary ?? "",
      // お客様が書き換えた「一言でいうと」は、そのまま引き継ぐ
      prev.brief?.oneLine ?? "",
    );
    // 「いつ設定を終えたか」は変えない（案内の出し分けに使っているため）
    if (prev.counseledAt) result.counseledAt = prev.counseledAt;
    // 答えとして持っていない項目（ノウハウの使用など）は前の値を残す
    result.useThreadsKnowhow = prev.useThreadsKnowhow ?? result.useThreadsKnowhow;

    await db.updateProject(projectId, { counselingResult: JSON.stringify(result) } as any);
    console.log(`[Counseling] 列の修正を答えにも反映しました project=${projectId} 項目=${Object.keys(changed).filter((k) => k in COLUMN_TO_ANSWER).join(",")}`);
  } catch (e) {
    // 反映に失敗しても、列の修正そのものは成立している。保存を止めない。
    console.error("[Counseling] 列の修正を答えへ反映できませんでした:", e);
  }
}
