/**
 * カウンセリング回答の保存（アプリ画面とLINEチャットの共通処理）。
 * routers.ts の saveCounseling から切り出し、LINEトーク内での聞き取りでも
 * まったく同じ保存結果になるようにする（2026-09-01）。
 */
import * as db from "./db";

export interface CounselingAnswersInput {
  storeNameRaw?: string; businessTypeRaw?: string; areaRaw?: string; targetRaw?: string;
  mainProblemRaw?: string; strengthRaw?: string; brandVoiceRaw?: string; uspRaw?: string;
  menuRaw?: string; hoursInfoRaw?: string; realProofsRaw?: string; realEpisodesRaw?: string;
  benefitsDailyRaw?: string; ctaAssetsRaw?: string; faqRaw?: string; industryMythsRaw?: string;
  originStoryRaw?: string; ngListRaw?: string; preferredTypesRaw?: string;
  useThreadsKnowhow?: "on" | "off";
}

/** 未入力を空文字で埋めて buildCounselingResult に渡せる形にする */
function normalize(a: CounselingAnswersInput) {
  const keys = [
    "storeNameRaw", "businessTypeRaw", "areaRaw", "targetRaw", "mainProblemRaw", "strengthRaw",
    "brandVoiceRaw", "uspRaw", "menuRaw", "hoursInfoRaw", "realProofsRaw", "realEpisodesRaw",
    "benefitsDailyRaw", "ctaAssetsRaw", "faqRaw", "industryMythsRaw", "originStoryRaw",
    "ngListRaw", "preferredTypesRaw",
  ] as const;
  const out: any = {};
  for (const k of keys) out[k] = (a as any)[k] ?? "";
  out.useThreadsKnowhow = a.useThreadsKnowhow ?? "on";
  return out;
}

/**
 * 回答を保存する。プロジェクトが無ければ作成し、あれば所有者を検証して更新する。
 * 戻り値の projectId は呼び出し側の案内文で使う。
 */
export async function saveCounselingAnswers(params: {
  userId: number;
  projectId: string;
  mode: "store" | "personal";
  answers: CounselingAnswersInput;
  /** お客様が書き換えた「一言でいうと」。無ければ回答から下書きする */
  oneLine?: string;
}): Promise<{ ok: true; projectId: string } | { ok: false; reason: string }> {
  const a = normalize(params.answers);
  const trimmed = (s: string) => (s ?? "").trim();
  const deriveTitle = () => {
    const store = trimmed(a.storeNameRaw);
    if (store && !/^(なし|無し|特になし)$/i.test(store)) return store.slice(0, 60);
    const bt = trimmed(a.businessTypeRaw);
    const ar = trimmed(a.areaRaw);
    if (bt || ar) return `${bt}${ar ? `（${ar}）` : ""}`.slice(0, 60);
    return "マイプロジェクト";
  };

  let project = await db.getProjectById(params.projectId);
  if (!project) {
    await db.createProject({
      id: params.projectId,
      userId: params.userId,
      title: deriveTitle(),
      mode: params.mode,
    } as any);
    project = await db.getProjectById(params.projectId);
    if (!project) return { ok: false, reason: "create_failed" };
  } else if (project.userId !== params.userId) {
    return { ok: false, reason: "not_found" };
  }

  const { buildCounselingResult } = await import("../shared/counseling");
  const result = buildCounselingResult(a, '', params.oneLine ?? '');

  const patch: any = {
    counselingResult: JSON.stringify(result),
    useThreadsKnowhow: result.useThreadsKnowhow,
    mode: params.mode,
  };
  if (trimmed(a.businessTypeRaw)) patch.businessType = trimmed(a.businessTypeRaw);
  if (trimmed(a.areaRaw)) patch.area = trimmed(a.areaRaw);
  if (trimmed(a.targetRaw)) patch.target = trimmed(a.targetRaw);
  if (trimmed(a.mainProblemRaw)) patch.mainProblem = trimmed(a.mainProblemRaw);
  if (trimmed(a.strengthRaw)) patch.strength = trimmed(a.strengthRaw);
  const storeName = trimmed(a.storeNameRaw);
  if (storeName && !/^(なし|無し|特になし)$/i.test(storeName)) patch.storeName = storeName;
  if (!project.title || project.title === "マイプロジェクト") patch.title = deriveTitle();
  if (!project.usp && trimmed(a.uspRaw)) patch.usp = trimmed(a.uspRaw);
  if (!project.n1Customer && result.realEpisodes.length > 0) patch.n1Customer = result.realEpisodes.join("\n");
  if (!project.proof && result.realProofs.length > 0) patch.proof = result.realProofs.join("\n");
  if (!(project as any).belief && result.industryMyths.length > 0) patch.belief = result.industryMyths.join("\n");

  await db.updateProject(params.projectId, patch);
  // お店の情報がそろった瞬間に、今日の分の投稿を作る（朝6時を待たない）。
  // 条件が足りなければ中で何もしない。保存の応答は待たせない。
  import("./autoPostScheduler")
    .then(({ runAutoPostCatchUpForUser }) => runAutoPostCatchUpForUser(params.userId, "お店の情報の登録完了"))
    .catch(() => { /* 補充は付加機能。失敗しても保存には影響させない */ });
  return { ok: true, projectId: params.projectId };
}
