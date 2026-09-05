/**
 * 固定投稿を、公式LINEのトークの中だけで「作る → 公開する」ための処理。
 *
 * なぜ要るか:
 *   固定投稿はプロフィールの入口になる最重要の投稿だが、
 *   ・アプリを開いて作る
 *   ・「今すぐThreadsに投稿」を押して公開する
 *   ・Threadsアプリでピン留めする
 *   の3段階があり、途中で止まりやすい。
 *   実際に「3件作ったが1件も公開していない」お客様がいた。
 *
 *   毎日の投稿はLINEだけで終わるのに、ここだけアプリを開く必要があるのは
 *   一貫していないので、同じようにトークの中で終わるようにする。
 */
import * as db from "./db";
import { invokeLLM } from "./_core/llm";
import { generateThreadsPrompt } from "@shared/threadsPrompts";

/** 生成した固定投稿の下書き */
export type PinnedDraft = {
  postId: number;
  content: string;
  /** どのアカウント用の案か（複数アカウント運用で取り違えないための表示用） */
  accountUsername: string;
  /** 「作り直す」で同じアカウントに作り直すためのID */
  accountId: number;
};

/**
 * 締めの一言の指示。
 * ★ご案内先URLが未登録のときに「コメント欄のリンクから」と書かせてはいけない。
 *   公開後にURLを添えるのは attachPinnedComment だけで、URLが無ければ何も付かない。
 *   それでも本文だけが「コメント欄をご覧ください」と言うと、読んだ方が
 *   存在しないリンクを探すことになる（お店の信用を落とす）。
 */
function pinnedJsonSchema(hasDestination: boolean) {
  return {
    type: "json_schema",
    json_schema: {
      name: "pinned_post",
      schema: {
        type: "object",
        properties: {
          mainPost: { type: "string", description: "固定投稿の本文（400〜470文字。住所・営業時間・免責の羅列は書かない）" },
          cta: {
            type: "string",
            description: hasDestination
              ? "コメント欄のリンクへ誘導する一言だけ（20文字前後・1行。住所や注意書きは書かない）"
              : "ご相談を促す一言だけ（20文字前後・1行）。リンク・コメント欄・プロフィールなど、行き先の案内は書かない。住所や注意書きも書かない",
          },
        },
        required: ["mainPost", "cta"],
        additionalProperties: false,
      },
      strict: true,
    },
  } as const;
}

/** 締めの一言を作れなかったときの控え */
const FALLBACK_CTA_WITH_LINK = "くわしくはコメント欄のリンクからどうぞ。";
const FALLBACK_CTA_NO_LINK = "気になることがあれば、お気軽にご相談ください。";

/** 行き先の案内が入っているか（ご案内先URLが無いときに落とす目印） */
const LINK_MENTION = /コメント欄|プロフィール(のリンク|欄)?|リンク|ＵＲＬ|URL|下記のリンク/;

/**
 * ご案内先URLが未登録のときに、プロンプトへ足す注意書き。
 * 誘導先が1つも登録されていないと、プロンプトの「誘導ルール」自体が出ないため、
 * 何も言わないとAIが自前で「コメント欄のリンクから」と書いてしまう。
 */
const NO_DESTINATION_OVERRIDE = `

【重要・この投稿には案内先のリンクがありません】
- このお店はご案内先URLをまだ登録していません。公開後にコメント欄へ付くリンクはありません。
- 本文・締めの一言のどこにも「コメント欄のリンク」「プロフィールのリンク」「詳しくはこちら」などの
  リンクへの誘導を書かないこと。読んだ方が存在しないリンクを探すことになります。
- 締めは「気軽にご相談ください」「お気軽にお声がけください」のように、リンクに触れない言い方にすること。
`;

/**
 * ご案内先URLが無いのに、本文にリンクへの誘導が残ってしまった場合に落とす。
 * 段落（改行区切り）単位で見て、行き先の案内を含む行を取り除く。
 *
 * ★落とした結果が短すぎるときは、元の本文を返さずに空を返す。
 *   元に戻すと「付かないリンクへの誘導」が復活してしまい、
 *   本来ふせぎたかったことがそのまま起きるため。空のときは作り直しになる。
 */
export function stripLinkMentions(mainPost: string): string {
  const kept = mainPost.split("\n").filter((line) => {
    const t = line.trim();
    if (!t) return true;              // 空行は段落の区切りとして残す
    return !LINK_MENTION.test(t);
  });
  const joined = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  // 本文の半分以上が「リンクの話」だった＝AIの出力が壊れている。作り直したほうが早い。
  return Array.from(joined).length >= Math.floor(Array.from(mainPost).length * 0.5) ? joined : "";
}

/**
 * Threadsの1投稿上限（500文字）への収め方。
 * 「…」で機械的に切ると文の途中で終わった投稿がそのまま公開される
 * （実際に多発・2026-09-02指摘）。段落単位で後ろから落とし、
 * 締めの一言（コメント欄への誘導）は必ず残す。
 */
const PINNED_CHAR_BUDGET = 495;

/**
 * 固定投稿を1件つくり、承認待ちとして保存する。
 * まだThreadsには出ない（お客様が内容を見て「これで投稿する」を押してから公開する）。
 *
 * @param accountId どのアカウント用に作るか。複数アカウント運用では呼び出し側で
 *   選んでもらってから渡す（省略時は1つ目＝単一アカウント運用向け）。
 */
export async function createPinnedDraft(userId: number, accountId?: number | null): Promise<PinnedDraft | { error: string }> {
  const accounts = (await db.getThreadsAccountsByUserId(userId).catch(() => [])) || [];
  const active = accounts.filter((a: any) => a.isActive !== false);
  if (active.length === 0) {
    return { error: "まだThreadsのアカウントとつながっていないため、投稿を作れません。先に「アカウント連携」をお願いします。" };
  }

  const projects = (await db.getUserProjects(userId).catch(() => [])) || [];
  const usable = projects.filter((p: any) =>
    !String(p.id).startsWith("demo_") &&
    p.businessType && p.area && p.target && p.mainProblem && p.strength,
  );
  if (usable.length === 0) {
    return { error: "まだ「お店の情報」が登録されていないため、投稿を作れません。先に「はじめの設定」をお願いします。" };
  }

  // 指定されたアカウント（本人のもの限定）。指定が無ければ1つ目。
  const account: any = accountId
    ? active.find((a: any) => Number(a.id) === Number(accountId))
    : active[0];
  if (!account) {
    return { error: "そのアカウントが見つかりませんでした。「固定投稿」からやり直してください。" };
  }
  const project: any =
    (account.defaultProjectId && usable.find((p: any) => p.id === account.defaultProjectId)) || usable[0];

  // ★links はDBにJSON文字列で入っている。配列に直してから渡す。
  //   文字列のまま渡すと、プロンプト組み立ての中で links.find が呼べず
  //   「投稿をうまく作れませんでした」になる（お客様の固定投稿が全部これで失敗していた）。
  //   他の生成経路（自動投稿・予約投稿・アプリ）は、いずれもここで parse している。
  const { parseProjectLinks, pickPinnedDestination } = await import("../shared/projectLinks");
  const projectLinks = parseProjectLinks(project.links || null);
  // ★案内先はお客様が登録したリンクで決まる。公式LINEとは限らない
  //   （公式LINEが無いお店の固定投稿が全部「公式LINEから」で終わっていた・2026-09-04）
  const destination = pickPinnedDestination(projectLinks);

  // ★アプリの生成経路（project.generatePost）と同じ材料をそろえる。
  //   ここが欠けると、固定投稿のノウハウ（カウンセリング結果・口調の好み・
  //   NGワード・地域語の承認済みリスト）が反映されず、劣化版の固定投稿になる。
  const { parseNgWords } = await import("../shared/ngwords");
  const { approvedLocalTerms } = await import("./localGeo");
  const ngWords = parseNgWords(project.ngWords || null);
  let counselingResult: any = null;
  if (project.counselingResult) {
    try { counselingResult = JSON.parse(project.counselingResult); } catch { /* 壊れていれば無し扱い */ }
  }
  let stylePreference: any = null;
  if (project.stylePreference) {
    try { stylePreference = JSON.parse(project.stylePreference); } catch { /* 同上 */ }
  }

  let content = "";
  try {
    const prompt = generateThreadsPrompt({
      postType: "pinned",
      purpose: "cv",  // 予約・LINE登録につなげる型
      storeName: project.storeName,
      businessType: project.businessType,
      area: project.area,
      localTerms: approvedLocalTerms(project),
      target: project.target,
      mainProblem: project.mainProblem,
      strength: project.strength,
      proof: project.proof,
      styleSamples: project.styleSamples || undefined,
      usp: project.usp,
      n1Customer: project.n1Customer,
      belief: project.belief,
      catchphrase: project.catchphrase,
      customerWords: project.customerWords,
      ctaLink: project.ctaLink,
      links: projectLinks.map((l) => ({ type: l.type, label: l.label, url: l.url })),
      counseling: counselingResult,
      useThreadsKnowhow: project.useThreadsKnowhow !== false,
      stylePreference,
      ngWords,
      pinnedChannel: destination?.channelName,
    } as any);

    // 個人ブランディングモードの店舗は、発信者設定を最優先で上書き（アプリ経路と同じ）
    const { isPersonalMode, personalModePromptOverride } = await import("../shared/personalBrand");
    const personalOverride = isPersonalMode(project.mode) ? personalModePromptOverride() : "";

    const res: any = await invokeLLM({
      messages: [{ role: "user", content: prompt + personalOverride + (destination ? "" : NO_DESTINATION_OVERRIDE) }],
      response_format: pinnedJsonSchema(!!destination) as any,
    });
    const raw = res?.choices?.[0]?.message?.content;
    if (typeof raw !== "string" || !raw.trim()) throw new Error("AI応答が空です");
    const parsed = JSON.parse(raw);
    const main = String(parsed.mainPost || "").trim();
    const cta = String(parsed.cta || "").trim();
    if (!main) throw new Error("本文が空です");
    // ★ctaの暴走ガード：指示しても住所・免責の羅列を詰め込むことがある
    //   （氷見様データで528字のctaが出た・2026-09-02）。1行目だけを使い、
    //   長すぎる場合は既定の誘導文に差し替える。
    const ctaLine = cta.split("\n").map((s) => s.trim()).filter(Boolean)[0] || "";
    const fallbackCta = destination
      ? (destination.ctaLine ?? FALLBACK_CTA_WITH_LINK)
      : FALLBACK_CTA_NO_LINK;
    // ★ご案内先が無いのに「コメント欄／プロフィールのリンク」と書かれていたら、
    //   その一言は使わない（付かないリンクへ誘導しないため）。
    const safeCta = ctaLine && Array.from(ctaLine).length <= 60 && (destination || !LINK_MENTION.test(ctaLine))
      ? ctaLine
      : fallbackCta;
    // 案内先が無いときは、本文に残ったリンクへの誘導も落とす（指示だけでは残ることがある）
    const safeMain = destination ? main : stripLinkMentions(main);
    if (!safeMain) throw new Error("案内先が無いのに、本文がリンクへの誘導ばかりでした");
    const { trimToBudget } = await import("../shared/postLength");
    content = trimToBudget(safeMain, safeCta, PINNED_CHAR_BUDGET);
  } catch (e) {
    console.error("[PinnedFlow] 固定投稿の生成に失敗:", e);
    return { error: "投稿をうまく作れませんでした。少し時間をおいて、もう一度お試しください。" };
  }

  try {
    // 承認待ちで保存する。お客様が内容を見て「これで投稿する」を押すまで公開しない。
    await db.createScheduledPost({
      userId,
      projectId: project.id,
      threadsAccountId: account.id,
      scheduledAt: new Date(),
      postContent: content,
      status: "awaiting_approval",
      source: "manual",
      // 固定投稿の印。公開時に、コメント欄へ公式LINEのURLを自動で添付するために使う
      // （本文にURLを貼るとThreadsで到達が落ちるため、URLはコメント欄に置く方式）。
      angle: "pinned",
    } as any);
  } catch (e) {
    console.error("[PinnedFlow] 固定投稿の保存に失敗:", e);
    return { error: "投稿を保存できませんでした。少し時間をおいて、もう一度お試しください。" };
  }

  // いま保存したものを取り出す（承認ボタンにIDが要るため）
  try {
    const all = (await db.getScheduledPostsByUserId(userId)) || [];
    const mine = all
      .filter((p: any) => p.status === "awaiting_approval" && p.postContent === content)
      .sort((a: any, b: any) => Number(b.id) - Number(a.id));
    if (mine[0]) return { postId: Number(mine[0].id), content, accountUsername: String(account.threadsUsername || ""), accountId: Number(account.id) };
  } catch (e) {
    console.error("[PinnedFlow] 保存した投稿の取得に失敗:", e);
  }
  return { error: "投稿は作成しましたが、うまく表示できませんでした。「今日の投稿」からご確認ください。" };
}

/**
 * 固定投稿の公開直後に、公式LINEのURLを1件目のコメントとして添付する。
 *
 * 本文にURLを貼るとThreadsで到達が落ちるため、本文は「コメント欄から」へ誘導し、
 * 実際のURLはここで付ける（固定投稿の集客導線の要）。
 * 公式LINEが未登録なら何もしない（辿り着けない窓口へ誘導しない）。
 *
 * 呼び出し元: scheduledPostExecutor（LINE経由の固定投稿）/ threads.post（アプリのウィザード）。
 * コメントは付加機能なので、失敗しても本体投稿の成否には影響させないこと（呼び出し側でcatch）。
 *
 * @returns 添付したら reply の Threads 投稿ID、添付しなかったら null
 */
export async function attachLineUrlComment(opts: {
  accessToken: string;
  threadsUserId: string;
  /** 公開できたメイン投稿（固定投稿）の Threads 投稿ID */
  rootThreadsPostId: string;
  /** links列（JSON文字列）を持つプロジェクト */
  project: { links?: string | null } | null | undefined;
}): Promise<string | null> {
  const { parseProjectLinks, pickPinnedDestination } = await import("../shared/projectLinks");
  const links = parseProjectLinks(opts.project?.links || null);
  // ★公式LINEに限らず、登録されている案内先（予約ページ・HP等）を使う
  const dest = pickPinnedDestination(links);
  if (!dest) return null;
  const { createAndPublishPost } = await import("./threadsPost");
  const reply = await createAndPublishPost({
    accessToken: opts.accessToken,
    threadsUserId: opts.threadsUserId,
    text: `${dest.commentLead}\n${dest.link.url}`,
    mediaType: "TEXT",
    replyToId: opts.rootThreadsPostId,
  });
  return reply.id;
}
