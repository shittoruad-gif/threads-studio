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
};

const JSON_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "pinned_post",
    schema: {
      type: "object",
      properties: {
        mainPost: { type: "string", description: "固定投稿の本文" },
        cta: { type: "string", description: "最後に添える一言（予約・LINE登録への案内）" },
      },
      required: ["mainPost", "cta"],
      additionalProperties: false,
    },
    strict: true,
  },
} as const;

/** 480文字を超えないように切る（Threadsの1投稿上限に対する安全網） */
function capLength(s: string): string {
  const LIMIT = 460;
  const chars = Array.from(s);
  return chars.length > LIMIT ? chars.slice(0, LIMIT - 1).join("") + "…" : s;
}

/**
 * 固定投稿を1件つくり、承認待ちとして保存する。
 * まだThreadsには出ない（お客様が内容を見て「これで投稿する」を押してから公開する）。
 */
export async function createPinnedDraft(userId: number): Promise<PinnedDraft | { error: string }> {
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

  // 紐づけがあればその店舗、なければ最初の店舗を使う
  const account: any = active[0];
  const project: any =
    (account.defaultProjectId && usable.find((p: any) => p.id === account.defaultProjectId)) || usable[0];

  // ★links はDBにJSON文字列で入っている。配列に直してから渡す。
  //   文字列のまま渡すと、プロンプト組み立ての中で links.find が呼べず
  //   「投稿をうまく作れませんでした」になる（お客様の固定投稿が全部これで失敗していた）。
  //   他の生成経路（自動投稿・予約投稿・アプリ）は、いずれもここで parse している。
  const { parseProjectLinks } = await import("../shared/projectLinks");
  const projectLinks = parseProjectLinks(project.links || null);

  let content = "";
  try {
    const prompt = generateThreadsPrompt({
      postType: "pinned",
      purpose: "cv",  // 予約・LINE登録につなげる型
      storeName: project.storeName,
      businessType: project.businessType,
      area: project.area,
      localTerms: project.localTerms,
      target: project.target,
      mainProblem: project.mainProblem,
      strength: project.strength,
      proof: project.proof,
      usp: project.usp,
      n1Customer: project.n1Customer,
      belief: project.belief,
      catchphrase: project.catchphrase,
      customerWords: project.customerWords,
      ctaLink: project.ctaLink,
      links: projectLinks.map((l) => ({ type: l.type, label: l.label, url: l.url })),
      useThreadsKnowhow: project.useThreadsKnowhow,
      stylePreference: project.stylePreference,
      ngWords: project.ngWords,
    } as any);

    const res: any = await invokeLLM({
      messages: [{ role: "user", content: prompt }],
      response_format: JSON_SCHEMA as any,
    });
    const raw = res?.choices?.[0]?.message?.content;
    if (typeof raw !== "string" || !raw.trim()) throw new Error("AI応答が空です");
    const parsed = JSON.parse(raw);
    const main = String(parsed.mainPost || "").trim();
    const cta = String(parsed.cta || "").trim();
    if (!main) throw new Error("本文が空です");
    content = capLength(cta ? `${main}\n\n${cta}` : main);
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
    if (mine[0]) return { postId: Number(mine[0].id), content };
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
  const { parseProjectLinks } = await import("../shared/projectLinks");
  const links = parseProjectLinks(opts.project?.links || null);
  const lineLink = links.find((l) => l.type === "line" && !!l.url);
  if (!lineLink) return null;
  const { createAndPublishPost } = await import("./threadsPost");
  const reply = await createAndPublishPost({
    accessToken: opts.accessToken,
    threadsUserId: opts.threadsUserId,
    text: `LINEのご登録・ご相談はこちらから↓\n${lineLink.url}`,
    mediaType: "TEXT",
    replyToId: opts.rootThreadsPostId,
  });
  return reply.id;
}
