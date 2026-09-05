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
  // ★お客様は確認画面でこの内容を見たうえで「登録する」を押している。
  //   空のときだけ書く作りだと、実績や強みを直したくて設定をやり直しても
  //   画面には新しい内容が出たまま保存されず、案内と中身が食い違う。
  //   いただいた答えが空でなければ、そのまま反映する。
  if (trimmed(a.uspRaw)) patch.usp = trimmed(a.uspRaw);
  if (result.realEpisodes.length > 0) patch.n1Customer = result.realEpisodes.join("\n");
  if (result.realProofs.length > 0) patch.proof = result.realProofs.join("\n");
  if (result.industryMyths.length > 0) patch.belief = result.industryMyths.join("\n");
  // ★「絶対に書きたくないこと」（Q18）は projects.ngWords に入れないと効かない。
  //   投稿を機械的に検査する enforceNgWords がこの列だけを見ているため、
  //   ここに入れ忘れると「絶対に入れません」という案内が実際には守られない。
  //   トークで後から足した言葉を消さないよう、既存とあわせて残す。
  if (result.ngList.length > 0) {
    const cur = String((project as any).ngWords || "").split(/[、,\n]/).map((w) => w.trim()).filter(Boolean);
    patch.ngWords = Array.from(new Set([...cur, ...result.ngList])).join("、");
  }

  await db.updateProject(params.projectId, patch);
  // ★業種と答えがずれていたら運営に知らせる（呉服店に整体の選択肢が入っていた・2026-09-06）。
  //   保存は止めない。通知が失敗しても保存には影響させない。
  try {
    const { detectIndustryMismatch } = await import("../shared/industryMismatch");
    const check = detectIndustryMismatch(a.businessTypeRaw, a);
    if (check.mismatch) {
      console.warn(`[Counseling] 業種と答えのズレ user=${params.userId} project=${params.projectId}: ${check.summary}`);
      const user: any = await db.getUserById(params.userId).catch(() => null);
      import("./supportNotify")
        .then(({ notifyStaffOfIndustryMismatch }) => notifyStaffOfIndustryMismatch({
          userId: params.userId,
          userName: user?.name ?? null,
          userEmail: user?.email ?? null,
          storeName: storeName || null,
          projectId: params.projectId,
          summary: check.summary,
          hits: check.hits,
        }))
        .catch((e) => console.error("[Counseling] 業種ズレの通知に失敗:", e));
    }
  } catch (e) {
    console.error("[Counseling] 業種ズレの判定に失敗:", e);
  }
  // お店の情報がそろった瞬間に、今日の分の投稿を作る（朝6時を待たない）。
  // 条件が足りなければ中で何もしない。保存の応答は待たせない。
  import("./autoPostScheduler")
    .then(({ runAutoPostCatchUpForUser }) => runAutoPostCatchUpForUser(params.userId, "お店の情報の登録完了"))
    .catch(() => { /* 補充は付加機能。失敗しても保存には影響させない */ });
  return { ok: true, projectId: params.projectId };
}
