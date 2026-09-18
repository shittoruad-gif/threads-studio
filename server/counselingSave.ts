/**
 * カウンセリング回答の保存（アプリ画面とLINEチャットの共通処理）。
 * routers.ts の saveCounseling から切り出し、LINEトーク内での聞き取りでも
 * まったく同じ保存結果になるようにする（2026-09-01）。
 */
import * as db from "./db";
import { isEmptyAnswer } from "../shared/answerText";

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
  /**
   * ★今回お客様にお見せして、直せる状態にしていた質問のid（2026-09-18）。
   *   ここに入っている項目は「空にした・なしと答えた」も答えとして扱い、登録から消す。
   *   お見せしていない項目（トークの「きょうの1問」など）は、いまの登録に触らない。
   *   これが無いと、消したはずの内容が列に残り、投稿に出続ける
   *   （＝直せる項目と直せない項目が生まれる・森様のお問い合わせ）。
   */
  askedFields?: string[];
}): Promise<
  | { ok: true; projectId: string; /** 業種と答えのズレ（あれば本人にも伝える） */ mismatchSummary?: string; mismatchFields?: string[] }
  | { ok: false; reason: string }
> {
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
  const asked = new Set(params.askedFields ?? []);
  /**
   * 答えを列に反映する。
   *  ・中身のある答え　　　　　　　　→ そのまま入れる
   *  ・「なし」と答えた／空にした答え → その項目をお見せしていたなら、登録も消す
   *  ・お聞きしていない項目　　　　　→ いまの登録に触らない
   * ★「なし」をそのまま列に書かない。以前は projects.strength に「なし」の3文字が入り、
   *   それが事実としてプロンプトに流れていた。
   */
  const put = (column: string, answerId: string, value?: string) => {
    const v = trimmed(value ?? (a as any)[answerId]);
    if (v && !isEmptyAnswer(v)) { patch[column] = v; return; }
    if (asked.has(answerId)) patch[column] = "";
  };
  put("businessType", "businessTypeRaw");
  put("area", "areaRaw");
  put("target", "targetRaw");
  put("mainProblem", "mainProblemRaw");
  put("strength", "strengthRaw");
  const storeName = isEmptyAnswer(trimmed(a.storeNameRaw)) ? "" : trimmed(a.storeNameRaw);
  put("storeName", "storeNameRaw");
  if (!project.title || project.title === "マイプロジェクト") patch.title = deriveTitle();
  // ★お客様は確認画面でこの内容を見たうえで「登録する」を押している。
  //   空のときだけ書く作りだと、実績や強みを直したくて設定をやり直しても
  //   画面には新しい内容が出たまま保存されず、案内と中身が食い違う。
  //   いただいた答えが空でなければ、そのまま反映する。
  put("usp", "uspRaw");
  put("n1Customer", "realEpisodesRaw", result.realEpisodes.join("\n"));
  put("proof", "realProofsRaw", result.realProofs.join("\n"));
  put("belief", "industryMythsRaw", result.industryMyths.join("\n"));
  // ★「絶対に書きたくないこと」（Q18）は projects.ngWords に入れないと効かない。
  //   投稿を機械的に検査する enforceNgWords がこの列だけを見ているため、
  //   ここに入れ忘れると「絶対に入れません」という案内が実際には守られない。
  //   お見せしていない（askedFields に無い）ときは、トークで後から足した言葉を
  //   消さないよう既存とあわせて残す。お見せしたときは、いまの全部を見たうえで
  //   直していただいているので、そのまま入れ替える（1語だけ消す、ができるように）。
  if (asked.has("ngListRaw")) {
    patch.ngWords = result.ngList.join("、");
  } else if (result.ngList.length > 0) {
    const cur = String((project as any).ngWords || "").split(/[、,\n]/).map((w) => w.trim()).filter(Boolean);
    patch.ngWords = Array.from(new Set([...cur, ...result.ngList])).join("、");
  }

  await db.updateProject(params.projectId, patch);
  // ★業種と答えがずれていたら運営に知らせる（呉服店に整体の選択肢が入っていた・2026-09-06）。
  //   保存は止めない。通知が失敗しても保存には影響させない。
  let mismatchSummary: string | undefined;
  let mismatchFields: string[] = [];
  try {
    const { detectIndustryMismatch } = await import("../shared/industryMismatch");
    const check = detectIndustryMismatch(a.businessTypeRaw, a);
    // ★同じ内容のズレを保存のたびに通知しない（2026-09-08 三上様「ひたすら来ています」）。
    //   ズレの指紋（どの答えに何が入っているか）が前回通知と同じなら送らない。直れば指紋は空になる。
    const crypto = await import("crypto");
    const key = check.mismatch
      ? crypto.createHash("sha1").update(check.hits.map((h) => `${h.field}:${h.term}`).sort().join("|")).digest("hex").slice(0, 40)
      : null;
    const prevKey = (project as any).industryMismatchNoticeKey ?? null;
    if (key !== prevKey) {
      await db.updateProject(params.projectId, { industryMismatchNoticeKey: key } as any).catch(() => undefined);
    }
    if (check.mismatch) {
      mismatchSummary = check.summary;
      mismatchFields = Array.from(new Set(check.hits.map((h) => h.fieldLabel)));
      console.warn(`[Counseling] 業種と答えのズレ user=${params.userId} project=${params.projectId}: ${check.summary}`);
      if (key !== prevKey) {
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
      } else {
        console.log(`[Counseling] 業種ズレは前回通知と同じ内容のため運営へは送らない project=${params.projectId}`);
      }
    }
  } catch (e) {
    console.error("[Counseling] 業種ズレの判定に失敗:", e);
  }
  // お店の情報がそろった瞬間に、今日の分の投稿を作る（朝6時を待たない）。
  // 条件が足りなければ中で何もしない。保存の応答は待たせない。
  import("./autoPostScheduler")
    .then(({ runAutoPostCatchUpForUser }) => runAutoPostCatchUpForUser(params.userId, "お店の情報の登録完了"))
    .catch(() => { /* 補充は付加機能。失敗しても保存には影響させない */ });
  return { ok: true, projectId: params.projectId, mismatchSummary, mismatchFields };
}
