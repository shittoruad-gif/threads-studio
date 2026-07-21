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

// 自動投稿のローテーション。Threads講座の実測知見に合わせ、
// 「共感・会話を生む短文型」を主力にし、売り込み色の強い型は頻度を絞る。
// （実測: 短い共感/質問投稿ほど閲覧・返信が伸び、毎回オファー付きの長文は
//   広告として流し読みされ到達が落ちる。オファーは5〜6投稿に1回で十分）
const POST_TYPES = [
  'aruaru', 'empathy', 'qa', 'local', 'list', 'offer'
] as const;

// CTA（LINE誘導文）を本文に連結する投稿タイプ。
// それ以外の型は問いかけで終わらせて会話を誘発し、誘導はプロフィール・
// 固定投稿に任せる（毎回CTAを付けると全投稿が広告になり評価が落ちる）。
const CTA_POST_TYPES = new Set<string>(['offer', 'local']);

const PURPOSES = ['cv', 'awareness', 'authority', 'fan'] as const;

// 自動投稿の読みやすさ上限。Threadsで最も読まれるのは150〜250文字レンジで、
// 300文字を超える自動投稿は「長い広告」として流し読みされる。
// プロンプトでも指示するが、AIが超過した場合は段落単位で機械的に削る。
const AUTO_POST_CHAR_BUDGET = 300;

// 生成プロンプトの末尾に付ける自動投稿専用の最終指示。
// LLMは末尾の指示に最も従いやすいため、文字数と1行目のルールをここで再強調する。
const AUTO_POST_STYLE_ADDENDUM = `

【自動投稿モードの最終指示（これまでの全指示より優先・厳守）】
- mainPost は最大250文字。**150〜220文字が理想**。短いほど読まれる。長い説明は書かない。
- 1行目は20文字以内で止める。「悩みの言語化」「共感の問いかけ」「意外な事実」のどれかで始める。
- 空行で2〜4ブロックに分ける。1ブロックは1〜2行まで。
- 1投稿1メッセージ。あれもこれも詰め込まない。伝えることを1つに絞る。
- 締めは読者が答えたくなる短い問いかけ1行。ただし型通りの「あなたは〜ありますか？」ではなく、本当に聞きたいから聞く感じのやわらかい敬語の一言（「みなさんはどうやって続けていますか？」「同じ方いらっしゃいますか？」）。タメ口の問いかけ（「どうしてる？」「いる？」）は使わない。
- 宣伝口調・案内文口調（「ご案内します」「ぜひご利用ください」）は使わない。友達に話す口調で。

【AIっぽさの禁止（最重要）】次の「AI文の癖」が1つでもあると読者はスルーする。全て禁止：
- 定型フレーズ：「〜してみませんか」「〜がおすすめです」「〜はいかがですか」「安心してください」「ぜひ」「〜と思われがちですが」「実は〜なんです」の乱用
- 全部説明しようとする（原因→理由→解決→行動まで1投稿に詰める）。人間は言い切って終わる。
- 文の長さが均一（すべて20〜30字の整った文）。人間は短い文と長い文が混ざる。「それ、うちのことです。」のような5〜15字の文を混ぜる。
- です・ます の機械的な連続。「〜なんです」「〜だったりします」「〜ですよね」を混ぜ、体言止めも使う。
- 完璧な構成。少し砕けて、少し余白があるくらいが人間の文章。`;

// 人間化リライト（2パス目）で除去したいAI定型表現。
// 機械チェック用：リライト後もこれらが残っていたらログに残す（品質モニタリング）。
const AI_PHRASE_PATTERNS = [
  /してみませんか/, /がおすすめです/, /はいかがですか/, /安心してください/,
  /と思われがちですが/, /ぜひ一度/, /してみてください/,
];

/**
 * 人間化リライト（2パス目）。
 * 1パス目の生成結果を「友達に送るメッセージ」の口語に書き直す。
 * モデル・APIは同じものを使い、編集専用の短いプロンプトで役割を絞ることで
 * 「構成が整いすぎたAI文」を崩す。事実の追加は禁止（削るのは可）なので
 * factGuard通過後に実行しても捏造は発生しない。
 * 失敗時は元のテキストをそのまま返す（リライトはベストエフォート）。
 */
async function naturalizeContent(text: string): Promise<string> {
  try {
    const prompt = `あなたはSNS投稿の編集者です。次のThreads投稿を、内容はそのままに「友達に送るLINEメッセージ」のような自然な話し言葉に書き直してください。

【絶対ルール】
- 事実・情報を足さない。数字・店名・地名・意味を変えない。削って短くするのはOK。
- 文の長さをバラつかせる。5〜15字の短い文を1つは入れてリズムを作る。
- です・ます の連続を崩す。「〜なんです」「〜ですよね」「〜だったり」など口語に。体言止めもOK。
- ただしタメ口にしない。ベースはやわらかい です・ます 調（丁寧語）で、口語表現（「〜なんです」「〜ですよね」「〜だったり」・体言止め）を3割ほど混ぜる。
  「〜でさ」「〜じゃん」「〜だよね」「〜してる？」「〜いる？」のようなタメ口は使わない
  （お店の公式アカウント。親しみやすいけど、礼儀のある距離感を保つ）。
- 禁止フレーズ：「してみませんか」「がおすすめです」「いかがですか」「安心してください」「ぜひ」「と思われがちですが」
- 締めの問いかけは、本当に聞きたいから聞く感じのやわらかい敬語の一言に
  （良い例「みなさんはどうやって運動を続けていますか？」「同じ方いらっしゃいますか？」／悪い例「みんなどうしてる？」）。
- 絵文字は最大1個。無くてもいい。
- 完璧に整えない。少し砕けているくらいがちょうどいい。
- 全体は元の文字数以下にする。

【出力】書き直した本文だけを出力。前置き・説明・引用符は不要。

---
${text}
---`;
    const res = await invokeLLM({ messages: [{ role: 'user', content: prompt }] });
    const out = (res.choices[0]?.message?.content ?? '').toString().trim();
    // 空・異常長（増えた/極端に短い）は失敗扱いで元文を使う
    const inLen = Array.from(text).length;
    const outLen = Array.from(out).length;
    if (!out || outLen > inLen * 1.2 || outLen < 30) return text;
    const remaining = AI_PHRASE_PATTERNS.filter((re) => re.test(out));
    if (remaining.length > 0) {
      console.warn(`[AutoPost] naturalize left AI-phrases: ${remaining.map(String).join(',')}`);
    }
    return out;
  } catch (e) {
    console.warn('[AutoPost] naturalize skipped:', (e as Error).message);
    return text;
  }
}

/**
 * 本文を段落単位で文字数予算内に収める。
 * 文の途中でぶつ切りにせず、後ろの段落から丸ごと落とす（最低1段落は残す）。
 * CTA付きの場合はCTA段落を保持し、本文側の段落を削る。
 */
function trimToBudget(mainPost: string, cta: string | null, budget: number): string {
  const parts = mainPost.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  const ctaPart = (cta || '').trim();
  const len = (s: string) => Array.from(s).length;
  const assemble = (blocks: string[]) =>
    [...blocks, ...(ctaPart ? [ctaPart] : [])].join('\n\n');

  let blocks = parts;
  while (blocks.length > 1 && len(assemble(blocks)) > budget) {
    blocks = blocks.slice(0, -1);
  }
  return assemble(blocks);
}

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
function getNextPostingTime(index: number, customHours?: number[] | null): Date {
  const now = new Date();
  // 本人の実績で「反応が高い時間帯」が分かっていればそれを優先。
  // データ不足（null）のときは従来のデフォルト時刻を使う。
  const hours = customHours && customHours.length > 0 ? customHours : POSTING_HOURS;
  const hour = hours[index % hours.length];
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
  bestHours: number[] | null = null,
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
    // ★自動投稿は人の目を通らず公開されるため、短文・会話調の最終指示を
    //   プロンプト末尾に追加する（末尾の指示が最も遵守されやすい）。
    const response = await invokeLLM({
      messages: [{ role: 'user', content: prompt + AUTO_POST_STYLE_ADDENDUM }],
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

    // 本文の組み立て。treeCount=0 固定なので treePosts は使わない。
    // 本文に生URLが混入していたら除去（方針A）。
    //
    // ★CTAは投稿タイプで出し分ける：オファー系・地域CV系の投稿だけに連結し、
    //   共感・会話系の投稿は問いかけで終わらせる。全投稿にCTAを付けると
    //   アカウント全体が「広告の羅列」になり、Threadsの評価も読者の反応も落ちる。
    const includeCta = CTA_POST_TYPES.has(postType);

    // ★人間化リライト（2パス目）：factGuard通過後の本文を口語に書き直す。
    //   事実の追加は禁止プロンプトで担保（削るのみ可）。CTAは定型で良いので対象外。
    //   リライト後にNGワードガードを再適用する（言い換えで規制語が混入した場合の保険）。
    let naturalMain = await naturalizeContent(stripRawUrls(result.mainPost));
    try {
      const guarded = await enforceNgWords({ mainPost: naturalMain } as any, ngWords);
      naturalMain = (guarded as any).mainPost || naturalMain;
    } catch { /* ガード失敗時はリライト文をそのまま使う（生成時ガードは通過済み） */ }

    const mainText = naturalMain;
    const ctaText = includeCta ? stripRawUrls(result.cta || '') : '';

    // ★読みやすさ予算（300字）を機械的に強制する。
    //   プロンプト指示をAIが超過した場合、文の途中でぶつ切りにせず
    //   段落単位で後ろから削る（CTAを付ける投稿ではCTA段落は保持）。
    let fullContent = trimToBudget(mainText, ctaText || null, AUTO_POST_CHAR_BUDGET);
    if (Array.from(fullContent).length < Array.from([mainText, ctaText].filter(Boolean).join('\n\n')).length) {
      console.warn(
        `[AutoPost] Content trimmed to budget (${AUTO_POST_CHAR_BUDGET} chars) userId=${userId} projectId=${project.id}`,
      );
    }

    // Threads API の1投稿500文字制限に対する最終安全網（通常は届かない）。
    const SAFETY_LIMIT = 480;
    if (Array.from(fullContent).length > SAFETY_LIMIT) {
      fullContent = Array.from(fullContent).slice(0, SAFETY_LIMIT - 1).join('') + '…';
    }

    // Schedule the post
    const scheduledAt = getNextPostingTime(postingTimeIndex, bestHours);

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

        // ★本人の実績から「反応が高い時間帯」を取得（データ8件未満はnull＝デフォルト時刻）。
        //   使うほど、その先生の当たり時間に自動で寄っていく。
        let bestHours: number[] | null = null;
        try {
          bestHours = await db.getUserBestPostingHours(user.id);
          if (bestHours) console.log(`[AutoPost] user ${user.id} best hours(JST): ${bestHours.join(',')}`);
        } catch { /* データ取得失敗時はデフォルト時刻で続行 */ }

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
              bestHours,
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
