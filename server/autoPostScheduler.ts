/**
 * Auto Post Scheduler
 *
 * Automatically generates AI posts and schedules them for Threads publishing.
 * Runs daily via cron. For each eligible user (paid + Threads connected + autoPostEnabled),
 * generates posts and adds them to the scheduled post queue.
 */

import cron from "node-cron";
import * as db from "./db";
import { getPlan } from "../shared/plans";
import { generateThreadsPrompt } from "../shared/threadsPrompts";
import { stripRawUrls } from "../shared/sanitize";
import { invokeLLM } from "./_core/llm";
import { nanoid } from "nanoid";

// Post types and purposes for rotation
const POST_TYPES = [
  'hook_tree', 'expertise', 'local', 'proof', 'empathy', 'story',
  'list', 'offer', 'enemy', 'qa', 'trend', 'aruaru'
] as const;

const PURPOSES = ['cv', 'awareness', 'authority', 'fan'] as const;

// Optimal posting times (JST hours)
// Based on Threads engagement data: 20-22時 is the highest-engagement window,
// followed by 16-17時. Morning (9時) catches the start-of-day check-in,
// lunch (12時) catches the break check-in. We avoid 18時 (commute) which
// performs worse than 17時 or 21時.
const POSTING_HOURS = [9, 12, 17, 21];

const JSON_SCHEMA = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'threads_post',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '投稿タイトル' },
        mainPost: { type: 'string', description: 'メイン投稿' },
        treePosts: { type: 'array', items: { type: 'string' }, description: 'ツリー投稿配列' },
        cta: { type: 'string', description: 'CTA' },
        hashtags: { type: 'array', items: { type: 'string' }, description: 'ハッシュタグ配列' },
        goal: { type: 'string', description: '投稿の狙い' },
        improvement: { type: 'string', description: '次回改善案' },
        expectedEffect: { type: 'string', description: '投稿の期待効果' },
        timingCandidate: { type: 'string', description: '投稿設置タイミング候補' },
        weeklyImprovementPoint: { type: 'string', description: '週次改善ポイント' },
        hookType: { type: 'string', description: '使用した1行目の型' },
        cvGoal: { type: 'string', description: 'CVゴール' },
      },
      required: ['title', 'mainPost', 'treePosts', 'cta', 'hashtags', 'goal', 'improvement', 'expectedEffect', 'timingCandidate', 'weeklyImprovementPoint', 'hookType', 'cvGoal'],
      additionalProperties: false,
    },
  },
};

// 日本標準時(JST)はUTC+9固定（サマータイムなし）。
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * Get the next posting time for today (JST基準)
 *
 * ★重要: 本番コンテナのタイムゾーンは UTC（TZ未設定）。以前は postTime.setHours(hour)
 *   をサーバーローカル(=UTC)で行っていたため、「JST最適時間」のつもりが実際には
 *   9時間ズレて深夜に投稿されていた（例: 21時指定→翌6時JST、17時指定→翌2時JST）。
 *   サーバーのTZに依存せず、必ず「その日のJSTの hour 時」を表す絶対時刻(UTC instant)を返す。
 */
function getNextPostingTime(index: number): Date {
  const now = new Date();
  const hour = POSTING_HOURS[index % POSTING_HOURS.length];
  const randMinute = Math.floor(Math.random() * 30); // 自然さのためのランダム分

  // 現在時刻を「JSTの壁時計」に変換し、UTCゲッターで年月日を取り出す
  const nowJst = new Date(now.getTime() + JST_OFFSET_MS);
  const y = nowJst.getUTCFullYear();
  const m = nowJst.getUTCMonth();
  const d = nowJst.getUTCDate();

  // 「その日のJST hour:randMinute」を表す絶対時刻(UTC instant)を作る
  let postTime = new Date(Date.UTC(y, m, d, hour, randMinute, 0) - JST_OFFSET_MS);

  // 既に過ぎていれば翌日に
  if (postTime <= now) {
    postTime = new Date(postTime.getTime() + 24 * 60 * 60 * 1000);
  }

  return postTime;
}

/**
 * Generate a single auto-post for a user
 */
async function generateAutoPost(
  userId: number,
  project: any,
  postTypeIndex: number,
  purposeIndex: number,
  threadsAccountId: number,
  postingTimeIndex: number,
  requireApproval: boolean = false,
): Promise<boolean> {
  const postType = POST_TYPES[postTypeIndex % POST_TYPES.length];
  const purpose = PURPOSES[purposeIndex % PURPOSES.length];

  try {
    // Auto-posts also reuse the user's registered URL set so LINE/予約 links
    // appear in the right slots automatically.
    const { parseProjectLinks } = await import('../shared/projectLinks');
    const { parseNgWords } = await import('../shared/ngwords');
    const { enforceNgWords } = await import('./ngwordGuard');
    const projectLinks = parseProjectLinks(project.links || null);
    const ngWords = parseNgWords((project as any).ngWords || null);

    // カウンセリング結果（あれば）と Threadsノウハウ使用フラグを取得。
    // 自動投稿でもユーザーの「事実だけ書く」設定を尊重する（捏造防止）。
    let counselingResult: any = null;
    if (project.counselingResult) {
      try { counselingResult = JSON.parse(project.counselingResult); } catch {}
    }
    const useThreadsKnowhow = project.useThreadsKnowhow !== false;

    // スタイル校正結果（あれば）— サンプル投稿選択でユーザが好きな雰囲気を学習済み。
    // 自動投稿でもユーザの好みの口調・長さに寄せる。
    let stylePreference: any = null;
    if ((project as any).stylePreference) {
      try { stylePreference = JSON.parse((project as any).stylePreference); } catch {}
    }

    // Generate prompt
    //
    // ★treeCount=0（本文のみ）に固定する理由:
    //   以前は treeCount=3 だったが、autoPostScheduler は生成したツリー投稿を
    //   全部 \n\n で連結して **1つの巨大なThreads投稿** として送っていた。
    //   結果、毎日の自動投稿が「全部 固定投稿サイズの長文」になっていた。
    //   Threads は1投稿500文字制限なので、連結時に上限超過で切り詰められる
    //   リスクもあった。
    //   本来「毎日自動」のユースケースは短く読みやすい単発投稿の連投なので、
    //   ここを treeCount=0 に固定する。ツリーで深く語りたいときは
    //   AIGenerate の手動生成で treeCount を選んでもらう。
    const prompt = generateThreadsPrompt({
      storeName: (project as any).storeName || undefined,
      businessType: project.businessType,
      area: project.area,
      localTerms: (project as any).localTerms || undefined,
      styleSamples: (project as any).styleSamples || undefined,
      target: project.target,
      mainProblem: project.mainProblem,
      strength: project.strength,
      proof: project.proof || undefined,
      link: project.ctaLink || undefined,
      links: projectLinks.map(l => ({ type: l.type, label: l.label, url: l.url })),
      postType,
      treeCount: 0,
      usp: project.usp || undefined,
      n1Customer: project.n1Customer || undefined,
      belief: (project as any).belief || undefined,
      catchphrase: (project as any).catchphrase || undefined,
      customerWords: (project as any).customerWords || undefined,
      purpose,
      counseling: counselingResult,
      useThreadsKnowhow,
      stylePreference,
      ngWords,
    });

    // Call LLM
    const response = await invokeLLM({
      messages: [{ role: 'user', content: prompt }],
      response_format: JSON_SCHEMA,
    });

    const content = response.choices[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      console.error(`[AutoPost] Empty LLM response for user ${userId}`);
      return false;
    }

    const result = await enforceNgWords(JSON.parse(content), ngWords);

    // ★事実ガード：裏付けの無い捏造（先着/受賞/メディア掲載/満足度◯%等）を機械的に除去。
    //   自動投稿は人の確認を挟まず公開されるため特に重要。
    try {
      const { scrubPost, buildSupportedFacts } = await import('../shared/factGuard');
      const supportedFacts = buildSupportedFacts(
        project.businessType, project.area, (project as any).localTerms,
        project.strength, project.proof, (project as any).usp,
        (project as any).n1Customer, (project as any).belief, (project as any).customerWords,
        counselingResult?.realProofs, counselingResult?.menu, counselingResult?.realEpisodes,
        counselingResult?.benefitsDaily, counselingResult?.ctaAssets, counselingResult?.faq,
        counselingResult?.hoursInfo,
        counselingResult?.industryMyths, counselingResult?.originStory,
      );
      const g = scrubPost(result, supportedFacts);
      if (g.removed.length > 0) {
        console.warn(`[AutoPost] factGuard removed ${g.removed.length} unsupported claim(s) userId=${userId} projectId=${project.id}: ${g.removed.join(' / ')}`);
      }
      Object.assign(result, g.post);
    } catch (e) {
      console.warn('[AutoPost] factGuard skipped:', (e as Error).message);
    }

    // Combine main post + tree posts + CTA into full post content。
    // treeCount=0 を指定しているので通常 treePosts は空配列。
    // ハッシュタグ（#）は使わない方針のため、AIが誤って返しても本文には連結しない。
    // ★treeCount=0 固定なので treePosts は使わない（AIが誤って返しても本文に混ぜない）。
    //   本文に生URLが混入していたら除去（方針A）。
    const rawContent = [
      stripRawUrls(result.mainPost),
      stripRawUrls(result.cta || ''),
    ].filter(Boolean).join('\n\n');

    // Threads API は1投稿500文字制限。長すぎると API 側で拒否されるか
    // 切り詰められて無音失敗する。安全側に倒して 480 文字で切る。
    // （通常は treeCount=0 + プロンプト文字数予算で十分短いはずだが、
    //   AIが指示を無視した時のための最後の安全網）
    const THREADS_MAX_CHARS = 500;
    const SAFETY_LIMIT = 480;
    let fullContent = rawContent;
    if (Array.from(rawContent).length > SAFETY_LIMIT) {
      console.warn(
        `[AutoPost] Generated content exceeds safety limit ` +
        `(${Array.from(rawContent).length} chars > ${SAFETY_LIMIT}). Truncating. userId=${userId} projectId=${project.id}`,
      );
      // コードポイント単位で切る（絵文字でサロゲートペア破壊を防ぐ）
      fullContent = Array.from(rawContent).slice(0, SAFETY_LIMIT - 1).join('') + '…';
    }
    void THREADS_MAX_CHARS;

    // Schedule the post
    const scheduledAt = getNextPostingTime(postingTimeIndex);

    await db.createScheduledPost({
      userId,
      projectId: project.id,
      threadsAccountId,
      scheduledAt,
      postContent: fullContent,
      // ★承認モードON時は awaiting_approval で作成し、ユーザーが承認するまで投稿しない
      status: requireApproval ? 'awaiting_approval' : 'pending',
      source: 'auto',
    });

    // ★#3 自動投稿は手動AI生成の月間枠(maxAiGenerations)を消費しない。
    //   料金表記「AI投稿生成 ◯回/月」は手動生成の回数を指す。自動投稿でこれを
    //   消費すると、(a)手動生成が月途中で枠切れになり、(b)自動投稿は枠を超えても
    //   止まらず表記と矛盾する（=以前指摘の「プロ100件」と同種の問題）。
    //   自動投稿の本数は maxAutoPostsPerDay とアカウント別の月間上限で別途制限済み。
    //   そのため incrementAiGenerationUsage はここでは呼ばない。

    // Save to history
    await db.saveAiGenerationHistory({
      userId,
      projectId: project.id,
      postType,
      content: JSON.stringify(result),
      metadata: JSON.stringify({ autoGenerated: true, purpose }),
    });

    console.log(`[AutoPost] Generated ${postType} post for user ${userId}, scheduled at ${scheduledAt.toISOString()}`);
    return true;
  } catch (error) {
    console.error(`[AutoPost] Failed to generate post for user ${userId}:`, error);
    return false;
  }
}

/**
 * Get number of posts to generate based on frequency setting
 */
function getPostCount(frequency: string): number {
  switch (frequency) {
    case 'three_daily': return 3;
    case 'twice_daily': return 2;
    case 'daily':
    default: return 1;
  }
}

/**
 * Process all eligible users and generate auto-posts
 */
export async function processAutoPostGeneration(): Promise<{ processed: number; generated: number; failed: number }> {
  let processed = 0;
  let generated = 0;
  let failed = 0;

  try {
    // Get all users eligible for auto-posting
    const users = await db.getAutoPostEligibleUsers();

    if (!users || users.length === 0) {
      console.log('[AutoPost] No eligible users found');
      return { processed: 0, generated: 0, failed: 0 };
    }

    console.log(`[AutoPost] Processing ${users.length} eligible users`);

    for (const user of users) {
      processed++;

      try {
        // ★#7 すべてのプロジェクトを対象に。複数店舗運営ユーザに対応。
        //   完成済みプロジェクト（必須項目埋まっている）だけを対象にし、
        //   日替わりでローテーションして1つ選ぶ（postCount のぶんだけ）。
        const allProjects = await db.getUserProjects(user.id);
        if (!allProjects || allProjects.length === 0) continue;
        const eligibleProjects = allProjects.filter((p) =>
          p.businessType && p.area && p.target && p.mainProblem && p.strength,
        );
        if (eligibleProjects.length === 0) {
          console.log(`[AutoPost] Skipping user ${user.id} - no project with required fields`);
          continue;
        }

        // ★複数店舗対応：連携している「すべての有効アカウント」に自動投稿する
        const accounts = await db.getActiveThreadsAccounts(user.id);
        if (!accounts || accounts.length === 0) continue;

        // ★プラン別の「1日あたり自動投稿上限」を適用（料金表示と実態を一致させる）。
        //   フリー等 maxAutoPostsPerDay=0 のプランは自動投稿しない。
        const subscription = await db.getSubscriptionByUserId(user.id);
        const plan = getPlan(subscription?.planId || 'free');
        const maxPerDay = plan?.features.maxAutoPostsPerDay ?? 0;
        if (maxPerDay <= 0) {
          console.log(`[AutoPost] Skipping user ${user.id} - plan does not allow auto-posting`);
          continue;
        }
        const monthlyCap = plan?.features.maxScheduledPosts ?? -1;

        // Determine how many posts to generate（ユーザー設定の頻度をプラン上限で頭打ち）
        const postCount = Math.min(getPostCount(user.autoPostFrequency), maxPerDay);

        // Generate posts with rotation
        let typeIdx = user.lastAutoPostTypeIndex;
        let purposeIdx = user.lastAutoPurposeIndex;

        // 日替わりでプロジェクトを巡回するためのオフセット
        const dayOffset = Math.floor(Date.now() / (24 * 60 * 60 * 1000));

        // 各アカウントごとに postCount 本ずつ自動投稿（月間上限はアカウント単位で判定）
        for (const account of accounts) {
          if (monthlyCap !== -1) {
            // B-5: 当月公開済み＋当月予約済みの合計で判定（自動投稿の予約で枠超過を防ぐ）。
            const used = await db.countAccountMonthlyUsage(account.id);
            if (used >= monthlyCap) {
              console.log(`[AutoPost] account ${account.id} reached monthly cap (${used}/${monthlyCap}) - skip`);
              continue;
            }
          }

          // ★#2 このアカウントに「店舗(プロジェクト)」が紐付いていれば、その店舗の
          //   内容だけを投稿する（複数店舗で「店舗Aのアカウントに店舗Bの内容」を防ぐ）。
          //   紐付けが無い／対象外なら従来どおり全店舗を日替わりローテーション。
          const pinnedProject = (account as any).defaultProjectId
            ? eligibleProjects.find((p) => p.id === (account as any).defaultProjectId)
            : undefined;
          if ((account as any).defaultProjectId && !pinnedProject) {
            console.log(`[AutoPost] account ${account.id} の紐付け店舗が対象外のためスキップ`);
            continue;
          }

          for (let i = 0; i < postCount; i++) {
            const project = pinnedProject || eligibleProjects[(dayOffset + i) % eligibleProjects.length];

            const success = await generateAutoPost(
              user.id,
              project,
              typeIdx,
              purposeIdx,
              account.id,
              i,
              user.autoPostRequireApproval ?? false,
            );

            if (success) {
              generated++;
              typeIdx = (typeIdx + 1) % POST_TYPES.length;
              purposeIdx = (purposeIdx + 1) % PURPOSES.length;
            } else {
              failed++;
            }

            // Small delay between generations to avoid API rate limits
            await new Promise(r => setTimeout(r, 2000));
          }
        }

        // Update rotation indices
        await db.updateUserAutoPostIndices(user.id, typeIdx, purposeIdx);

      } catch (error) {
        console.error(`[AutoPost] Error processing user ${user.id}:`, error);
        failed++;
      }
    }

    console.log(`[AutoPost] Complete: ${processed} processed, ${generated} generated, ${failed} failed`);
  } catch (error) {
    console.error('[AutoPost] Fatal error:', error);
  }

  return { processed, generated, failed };
}

/**
 * Start the auto-post scheduler
 * Runs daily at 6:00 AM JST
 */
export function startAutoPostScheduler() {
  console.log('[AutoPost Scheduler] Starting...');

  // Run daily at 6:00 AM (JST = UTC+9, so 21:00 UTC previous day)
  cron.schedule('0 6 * * *', async () => {
    console.log('[AutoPost Scheduler] Running daily auto-post generation...');
    // 実行記録＋失敗時の運営通報は runTrackedJob に一元化（起動時キャッチアップ対応）
    const { runTrackedJob } = await import('./jobRunner');
    await runTrackedJob('auto_post_generation', async () => {
      const result = await processAutoPostGeneration();
      console.log(`[AutoPost Scheduler] Complete: ${result.generated} generated, ${result.failed} failed out of ${result.processed} users`);
    });
  }, {
    timezone: 'Asia/Tokyo',
  });

  console.log('[AutoPost Scheduler] Scheduled for 6:00 AM JST daily');
}
