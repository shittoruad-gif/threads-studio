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
import { buildCtaText } from "../shared/autoPostCta";
import { charBudgetFor, resolveWithAlternation, POST_LENGTHS } from "../shared/postLength";
import { checkNaturalized } from "../shared/jpQualityGuard";
import { generateThreadsPrompt } from "../shared/threadsPrompts";
import { SEASONAL_TOPICS } from "../shared/seasonalTopics";
import { pickAngle } from "../shared/postAngles";
import { stripRawUrls } from "../shared/sanitize";
import { invokeLLM } from "./_core/llm";
import { nanoid } from "nanoid";
import { approvedLocalTerms } from './localGeo';

// 自動投稿のローテーション。Threads講座の実測知見に合わせ、
// 「共感・会話を生む短文型」を主力にし、売り込み色の強い型は頻度を絞る。
// （実測: 短い共感/質問投稿ほど閲覧・返信が伸び、毎回オファー付きの長文は
//   広告として流し読みされ到達が落ちる。オファーは5〜6投稿に1回で十分）
const POST_TYPES = [
  'aruaru', 'empathy', 'qa', 'local', 'list', 'offer'
] as const;

// CTA（LINE誘導文）を本文に連結する投稿タイプ。
// それ以外の型の誘導はプロフィール・固定投稿に任せる
// （毎回CTAを付けると全投稿が広告になり評価が落ちる）。
// 締め方は型で分ける: リーチ型は言い切り、会話型（aruaru/empathy/qa）のみ
// 答えやすい小さい問いかけ可（実測: 漠然とした問いかけ締めは0.89倍で負け）。
const CTA_POST_TYPES = new Set<string>(['offer', 'local']);
const CONVERSATION_POST_TYPES = new Set<string>(['aruaru', 'empathy', 'qa', 'deep_worry']);

const PURPOSES = ['cv', 'awareness', 'authority', 'fan'] as const;

// 自動投稿の読みやすさ上限（スマホ前提）。
// 実測（114アカウント・3.2万投稿）: 100字を超えた瞬間に閲覧が3〜4割落ちる。
// プロンプトでは50〜100字を指示し、AIが超過した場合は段落単位で機械的に削る。
// （バッファ込みの機械カット上限。指示上限100字＋多少の超過を許容）
const AUTO_POST_CHAR_BUDGET = 140;

// 生成プロンプトの末尾に付ける自動投稿専用の最終指示。
// LLMは末尾の指示に最も従いやすいため、文字数と1行目のルールをここで再強調する。
const AUTO_POST_STYLE_ADDENDUM = `

【自動投稿モードの最終指示（これまでの全指示より優先・厳守）】
★スマホの画面で読まれる前提。「短い文・文ごとの改行・適度な余白」が正解。
★実測データ（114アカウント・3.2万投稿の分析）: 50字までの投稿は1.19倍見られ、100字を超えると3〜4割落ちる。冒頭に数字を置く型だけが唯一の勝ち型（1.17倍）。
- mainPost は合計 **50〜100文字**。理想は50字前後で言い切る。これを超えたら情報を削る。長い説明は書かない。
- **1行目に「数字」を置くのを最優先**。「◯◯が治らない人の共通点3つ」「9ヶ月で20.8キロ」のような、個数・期間・実績の数字。
- 数字が使えないときだけ「悩みの言語化」「意外な事実」で始める。
- **「〜だと思いませんか？」「皆さんはどうしていますか？」のような漠然とした問いかけで締めない**（実測0.89倍で負け筋）。基本は言い切って終わる。
- **「〜な人へ」という呼びかけで始めない**（実測0.88倍で負け筋）。
- **改行は必ず文末（。！？）の直後だけ。文の途中で改行するのは絶対禁止**（途中で切ると逆に読みにくい）。
- **1文＝1行**。1つの文は改行せず1行で書き切る。
- **1〜2文ごとに空行**を入れて段落を分ける。画面が文字で埋まったら失敗。
- 1文は30文字以内を目安に短く。
- 1投稿1メッセージ。伝えることを1つに絞る。
- 宣伝口調・案内文口調（「ご案内します」「ぜひご利用ください」）は使わない。友達に話す口調で。

【AIっぽさの禁止（最重要）】次の「AI文の癖」が1つでもあると読者はスルーする。全て禁止：
- 定型フレーズ：「〜してみませんか」「〜がおすすめです」「〜はいかがですか」「安心してください」「ぜひ」「〜と思われがちですが」「実は〜なんです」の乱用
- 全部説明しようとする（原因→理由→解決→行動まで1投稿に詰める）。人間は言い切って終わる。
- です・ます の機械的な連続。「〜なんです」「〜ですよね」を混ぜ、体言止めも使う。
- 主語と述語がねじれた文（「Moveactは、体って変わらないですよね」等）は絶対に書かない。
- 教科書のようにきれいに整いすぎた文。人間の投稿には少しの脱線・言い直し・つぶやきが混ざる。

【炎上・信用低下の禁止（実際のThreads調査より・厳守）】
反応が大きくても、お店の信用を落とす書き方は使わない。次はすべて禁止：
- **他人・同業・他院・特定の方法や商品を批判する**（「〇〇は間違い」「〇〇な人は来ないでください」「知らないのは日本人だけ」等）。悪者を作らない。
- **同情を引く経営の弱音**（「潰れそう」「赤字です」「応援してください」）。集客の投稿で店の不安を見せない。
- **自虐・体型や容姿を貶す表現**（自分にも他人にも）。
- 恐怖で煽る断定（「放置すると危険」「一生治りません」）。不安を煽らず、安心を渡す。
- 「絶対」「必ず治る」など効果の断定（景表法・薬機法の観点でも危険）。

【伸びているポジティブ型（実測・積極的に使う）】
- 専門家として知っている**小さな方法を1つ、無料で出し惜しみせず渡す**（「1日5分」「10秒」など所要時間つき）。
- 「〜と教わって、試したらこう変わった」のように、**押し付けず体験として語る**。
- お客様の思い込みを「実は逆なんです」と**やさしく解いて安心させる**。

【人のぬくもり（毎回必ず入れる）】AI感を消す最重要ルール：
- **絵文字を1〜3個**、感情が動く場所に自然に入れる（😊💦✨🙌😅など。文末に機械的に並べない・毎回同じ絵文字にしない・3個を超えない）。
- **「！」を1〜2箇所**、本当に気持ちが動くところで使う（全部の文に付けない）。
- **自分の実感をひとこと**入れる：「正直」「個人的には」「これは本当に多いです」のような、書き手の体温が伝わる一言。
- 冷たく事務的なトーンで終わらせない。最後の一文はやわらかく（絵文字か「！」か話し言葉で）。

【お手本の形（冒頭に数字・短く言い切る・1文ずつ改行・ぬくもりあり）】
運動が続かない人の共通点、3つあります。

頑張りすぎ・完璧主義・ひとりでやる。
正直、これ全部当てはまる方すごく多いです😅

マシンが支えてくれるピラティスは、この3つ全部いらないんです！`;

// 会話型（あるある・共感・Q&A）にだけ許可する締めの追加指示。
// リーチ型は言い切りで終わるが、会話型は返信をもらうのが目的なので
// 「具体的で答えやすい小さい問いかけ」1つで締めてよい。
const CONVERSATION_ENDING_ADDENDUM = `

【この投稿は会話型】この投稿だけは、最後を「具体的で答えやすい小さい問いかけ」1行で締めてよい。
例:「クーラー26度は暑いし25度は寒い。この1度、どうしてますか」のように、読者が一言で答えられる具体的な質問。
「〜だと思いませんか？」のような漠然とした同意求めは禁止。やわらかい敬語で。`;

// 季節ズレ防止：LLMは「今日がいつか」を知らないため、8月に梅雨ネタを書く事故が
// 実際に起きた（2026-08-14 三上さん指摘）。JSTの今日の日付と今月の季節ネタを
// 明示し、時期外れの季節話題を禁止する。
function seasonContextJST(): string {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth() + 1;
  const d = jst.getUTCDate();
  const season = (m === 12 || m <= 2) ? '冬' : m <= 5 ? '春' : m <= 8 ? '夏' : '秋';
  const offSeason =
    season === '夏' ? '梅雨・花粉・年末年始・冬の冷え'
    : season === '春' ? '猛暑・お盆・年末年始・雪'
    : season === '秋' ? '梅雨・猛暑・花粉・年始'
    : '梅雨・猛暑・お盆・花粉';
  const topics = (SEASONAL_TOPICS[m] ?? []).map((t) => t.label).join('・');
  return `

【今日の日付と季節（厳守）】
- 今日は${y}年${m}月${d}日（季節：${season}）。投稿は必ず「今の季節」に合わせること。
- 今の時期に合わない季節の話題（例：${offSeason}）は絶対に書かない。
- 季節に触れる場合は、今月の一般的な話題（${topics}）の範囲から選ぶ。具体的なイベント名・日付・数値を推測で足さない。`;
}

// 人間化リライト（2パス目）で除去したいAI定型表現。
// 機械チェック用：リライト後もこれらが残っていたらログに残す（品質モニタリング）。
const AI_PHRASE_PATTERNS = [
  /してみませんか/, /がおすすめです/, /はいかがですか/, /安心してください/,
  /と思われがちですが/, /ぜひ一度/, /してみてください/,
];

// ★地域ガード：都道府県・主要都市の地名リスト。
//   プロジェクト自身の店舗情報（area/localTerms等）に含まれない地名が本文に
//   混入していたら「別地域の投稿」として公開せずスキップする。
//   デモデータ混入・AIの幻覚による「渋谷区」事故の最終防衛線。
const REGION_WORDS = [
  '北海道','青森','岩手','宮城','秋田','山形','福島','茨城','栃木','群馬',
  '埼玉','千葉','東京','神奈川','新潟','富山','石川','福井','山梨','長野',
  '岐阜','静岡','愛知','三重','滋賀','京都','大阪','兵庫','奈良','和歌山',
  '鳥取','島根','広島','山口','徳島','香川','愛媛','高知','福岡','佐賀',
  '長崎','熊本','大分','宮崎','鹿児島','沖縄',
  '渋谷','新宿','池袋','銀座','横浜','川崎','名古屋','札幌','仙台','神戸','梅田','難波',
];

/**
 * 本文に「このプロジェクトの地域ではない地名」が含まれていればその地名を返す。
 * allowedSources（店舗のエリア・地元呼称・店名・強み等）に登場する地名は許可。
 */
function findForeignRegionWords(
  text: string,
  allowedSources: Array<string | null | undefined>,
): string[] {
  const allowed = allowedSources.filter(Boolean).join('\n');
  return REGION_WORDS.filter((w) => text.includes(w) && !allowed.includes(w));
}

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
    const prompt = `あなたはSNS投稿の編集者です。次のThreads投稿を「スマホで読みやすい、自然な話し言葉の投稿」に書き直してください。

【最優先：スマホでの見た目】
- 合計 **50〜100文字** に収める。長い場合は情報を削る（一番大事な1メッセージだけ残す）。
- **改行は必ず文末（。！？）の直後だけ。文の途中で改行するのは絶対禁止**。1文＝1行で書き切る。
- **1〜2文ごとに空行**を入れて段落を分ける。行間の余白で読ませる。
- 1文は30文字以内を目安に短く。

【話し言葉のルール】
- 事実・情報を足さない。数字・店名・地名・意味を変えない。削るのはOK。
- ベースはやわらかい です・ます 調。ただし同じ語尾（「〜なんです」「〜ですよね」）を2回以上続けない。
- タメ口（「〜でさ」「〜じゃん」「〜だよね」「〜してる？」）は使わない。お店の公式アカウントとして、親しみやすいけど礼儀のある距離感。
- 禁止フレーズ：「してみませんか」「がおすすめです」「いかがですか」「安心してください」「ぜひ」「と思われがちですが」「正直、」「同じ悩みの方、いませんか」
- **締めの形は元の文に従う**。元が言い切りなら言い切りのまま。元が問いかけなら問いかけのまま。締めを問いかけに書き換えることは絶対にしない。
- 主語と述語がねじれた文を書かない。書き直した文は必ず声に出して自然か確認する。

【漢字とひらがなのバランス（重要）】
- 常用漢字で書ける言葉は漢字で書く（体・原因・続く・整える 等）。ひらがなに開きすぎると幼い文になる。
- ただし補助動詞・形式名詞はひらがなのまま（〜してみる・〜すること・〜のとき 等）。
- 元の文の漢字を、意味が同じままひらがなに開かない。

【ぬくもりのルール（冷たくしない）】
- **元の文にある絵文字は消さない**。無い場合も、足すのは最大1個まで。無理に足さなくてよい。
- 「！」は元の文にある分だけ。機械的に足さない。
- 事務的・教科書的なトーンに直しすぎない。整いすぎた文はAIっぽく見える。
- どの投稿にも入れられる汎用フレーズ（「同じ悩みの方、いませんか？」等）で締めない。締めはこの投稿の内容に固有の言葉にする。

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
  const assemble = (blocks: string[], withCta: boolean) =>
    [...blocks, ...(withCta && ctaPart ? [ctaPart] : [])].join('\n\n');

  let blocks = parts;
  while (blocks.length > 1 && len(assemble(blocks, true)) > budget) {
    blocks = blocks.slice(0, -1);
  }

  // ★本文の保護：CTAを守るために本文が1段落（フックだけ）まで削られたら、
  //   CTAを落として本文を優先する。「9割が知らないこと。」とだけ書いて
  //   中身が無い投稿が実際に配信された（2026-08-26 検出・投稿725）。
  //   フックは中身の予告なので、中身が無いならフック＋CTAは成立しない。
  if (ctaPart && blocks.length === 1 && parts.length > 1) {
    let bodyOnly = parts;
    while (bodyOnly.length > 1 && len(assemble(bodyOnly, false)) > budget) {
      bodyOnly = bodyOnly.slice(0, -1);
    }
    if (bodyOnly.length > 1) return assemble(bodyOnly, false);
  }

  return assemble(blocks, true);
}

// Optimal posting times (JST hours)
// 2026-08 実測分析（114アカウント・3.2万投稿）の結果で全面更新:
//   伸び倍率: 15時=1.25 / 21時=1.24 / 22〜23時=1.19
//   朝7〜8時=0.84 / 10時=0.79 / 昼12時=0.87（投稿が集中して埋もれる）
// → 朝・昼を廃止。21時は「人が多いのに伸びる」唯一の時間帯なので1本目に。
const POSTING_HOURS = [21, 15, 22];

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
  postLength: string | null = null,
): Promise<boolean> {
  const postType = POST_TYPES[postTypeIndex % POST_TYPES.length];
  const purpose = PURPOSES[purposeIndex % PURPOSES.length];

  // ★切り口の多様化：◯✕フィードバックで重み付けした切り口をランダムに1つ選ぶ。
  //   ◯が付いた切り口は出やすく、✕が付いた切り口は出にくくなる（完全にゼロにはしない）。
  let angle: ReturnType<typeof pickAngle> | null = null;
  let preferenceNote = '';
  try {
    // ★店舗（project）単位で学習：複数店舗ユーザーで別店舗の好みを混ぜない
    const stats = await db.getAngleFeedbackStats(userId, project.id);
    // ★実績学習：実際に見られた回数（インプレッション）でも重みを補正する。
    //   クライアントが◯✕を押さなくても、結果そのものから伸びる型が増えていく。
    const perf = await db.getAnglePerformanceStats(userId, project.id);
    angle = pickAngle(stats, Math.random, perf);
    // ◯✕が付いた実例をプロンプトに注入して「このお店の好み」を学習させる
    const [liked, disliked] = await Promise.all([
      db.getRatedPostSamples(userId, 'good', 2, project.id),
      db.getRatedPostSamples(userId, 'bad', 2, project.id),
    ]);
    if (liked.length > 0 || disliked.length > 0) {
      preferenceNote = '\n\n【このお店の好み（オーナーの◯✕評価より・厳守）】';
      if (liked.length > 0) {
        preferenceNote += '\n- オーナーが「いい」と評価した投稿の方向性（雰囲気・切り口を参考にする。丸写しはしない）:\n' +
          liked.map((s) => `  「${String(s).replace(/\s+/g, ' ').slice(0, 120)}」`).join('\n');
      }
      if (disliked.length > 0) {
        preferenceNote += '\n- オーナーが「違う」と評価した投稿の方向性（この系統の書き方・切り口を避ける）:\n' +
          disliked.map((s) => `  「${String(s).replace(/\s+/g, ' ').slice(0, 120)}」`).join('\n');
      }
    }
  } catch (e) {
    console.error('[AutoPost] angle selection failed (fallback to none):', e);
  }
  const angleNote = angle
    ? `\n\n【今回の切り口（厳守）】\n- 今回は「${angle.label}」の切り口で書くこと：${angle.hint}\n- 毎回同じ書き出し・同じ構成にならないよう、この切り口らしい入り方にする。`
    : '';

  // 投稿の長さ指示（既定は短め。長めは本人が選んだときだけ）
  // 'alternate' のときは、日と枠の両方で短め/長めを交互にする（A/Bテスト）。
  const effectiveLength = resolveWithAlternation(postLength, postingTimeIndex);
  const lengthNote = `\n\n【今回の長さ（厳守）】\n- ${POST_LENGTHS[effectiveLength].guide}`;

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
      localTerms: approvedLocalTerms(project),
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
      messages: [{
        role: 'user',
        content: prompt + AUTO_POST_STYLE_ADDENDUM
          + seasonContextJST()
          + angleNote
          + lengthNote
          + preferenceNote
          + (CONVERSATION_POST_TYPES.has(postType) ? CONVERSATION_ENDING_ADDENDUM : ''),
      }],
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
    const beforeNaturalize = stripRawUrls(result.mainPost);
    let naturalMain = await naturalizeContent(beforeNaturalize);

    // ★日本語品質ガード（shared/jpQualityGuard.ts）。
    //   リライトが口癖（「正直、」）・お手本コピー・ひらがな開きすぎ・
    //   勝手な問いかけ締めを混入させた事故（2026-08-26 三上さん指摘）の再発防止。
    //   不合格なら、機械で直さずリライト前の文に戻す（安全な代替が常にあるため）。
    const verdict = checkNaturalized(naturalMain, beforeNaturalize, {
      allowQuestionEnding: CONVERSATION_POST_TYPES.has(postType),
    });
    if (!verdict.ok) {
      console.warn(`[AutoPost] naturalize rejected (${verdict.reason}) — リライト前の文を使用 userId=${userId}`);
      naturalMain = beforeNaturalize;
    }

    try {
      const guarded = await enforceNgWords({ mainPost: naturalMain } as any, ngWords);
      naturalMain = (guarded as any).mainPost || naturalMain;
    } catch { /* ガード失敗時はリライト文をそのまま使う（生成時ガードは通過済み） */ }

    const mainText = naturalMain;
    // CTAはLLM出力を使わず、**登録済みリンクから機械的に**決める（shared/autoPostCta.ts）。
    // 固定文にしていた頃、公式LINEを持たない店舗が「LINEへどうぞ」と
    // 案内してしまう事故が起きた（2026-08-22 検出）。
    // 案内先が1つも登録されていなければ null が返り、CTAを付けない。
    const ctaText = includeCta ? (buildCtaText(project as any) ?? '') : '';

    // ★読みやすさ予算（300字）を機械的に強制する。
    //   プロンプト指示をAIが超過した場合、文の途中でぶつ切りにせず
    //   段落単位で後ろから削る（CTAを付ける投稿ではCTA段落は保持）。
    // 上限は利用者の「投稿の長さ」設定で決まる（既定=短め140字 / 長め300字）。
    const charBudget = charBudgetFor(effectiveLength);
    let fullContent = trimToBudget(mainText, ctaText || null, charBudget);
    if (Array.from(fullContent).length < Array.from([mainText, ctaText].filter(Boolean).join('\n\n')).length) {
      console.warn(
        `[AutoPost] Content trimmed to budget (${charBudget} chars) userId=${userId} projectId=${project.id}`,
      );
    }

    // Threads API の1投稿500文字制限に対する最終安全網（通常は届かない）。
    const SAFETY_LIMIT = 480;
    if (Array.from(fullContent).length > SAFETY_LIMIT) {
      fullContent = Array.from(fullContent).slice(0, SAFETY_LIMIT - 1).join('') + '…';
    }

    // ★地域ガード：店舗の地域と無関係な地名が混入していたら公開せずスキップ。
    //   （例：デモデータ由来の「渋谷区」。1枠失うより誤地域の投稿が出る方が害が大きい）
    const foreignRegions = findForeignRegionWords(fullContent, [
      project.area, (project as any).localTerms, (project as any).storeName,
      project.strength, project.proof, (project as any).usp, project.target,
    ]);
    if (foreignRegions.length > 0) {
      console.warn(
        `[AutoPost] ★地域ガード発動: 別地域の地名(${foreignRegions.join(',')})を検出したため投稿をスキップ ` +
        `userId=${userId} projectId=${project.id}`,
      );
      return false;
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
      // 使った切り口を記録（◯✕評価と組み合わせて好み学習に使う）
      angle: angle?.id ?? null,
      // 使った長さ条件を記録（A/Bテストの集計に使う。設定は後から変わるため投稿側に残す）
      postLength: effectiveLength,
    } as any);

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
        // ★デモプロジェクト（idが demo_ で始まる架空店舗データ。例:「東京都渋谷区の整体院」）は
        //   自動投稿の対象から除外する。過去にMeta審査用デモユーザーの自動投稿が
        //   本物のThreadsアカウントへ「渋谷区」の投稿を公開してしまった事故の再発防止。
        const eligibleProjects = allProjects.filter((p) =>
          !String(p.id).startsWith('demo_') &&
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
              (user as any).postLength ?? null,
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

        // ★承認モードONのユーザーには、作成した直後に1通だけまとめて案内する。
        //   予定時刻を過ぎるまで気づけず投稿がゼロになる、という事故を防ぐため。
        //   メール内で本文を読み、そのまま承認できる（ログイン不要）。
        if (user.autoPostRequireApproval) {
          try {
            const fresh = await db.getRecentAwaitingApprovalPosts(user.id, 30);
            const owner = fresh.length > 0 ? await db.getUserById(user.id) : null;
            if (fresh.length > 0 && owner?.email) {
              const { sendApprovalDigestEmail } = await import('./approvalEmail');
              await sendApprovalDigestEmail({
                to: owner.email,
                userId: user.id,
                posts: fresh.map((p) => ({ id: p.id, postContent: p.postContent, scheduledAt: p.scheduledAt })),
              });
              console.log(`[AutoPost] 承認依頼メール送信: user=${user.id} ${fresh.length}件`);
            }
          } catch (e) {
            console.error(`[AutoPost] 承認依頼メール送信失敗 user=${user.id}:`, e);
          }
        }

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
