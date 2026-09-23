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
import { charBudgetFor, resolveWithAlternation, POST_LENGTHS, trimToBudget } from "../shared/postLength";
import { checkNaturalized, findBannedTic, findRepeatedHookNumber, findRepeatedPhrase, polishPunctuation } from "../shared/jpQualityGuard";
import { generateThreadsPrompt } from "../shared/threadsPrompts";
import { SEASONAL_TOPICS } from "../shared/seasonalTopics";
import { pickAngle, getAngle } from "../shared/postAngles";
import { looksLikeRecruiting, RECRUITING_POST_ADDENDUM } from "../shared/recruitingPost";
import { isPersonalMode, personalModePromptOverride } from "../shared/personalBrand";
import { stripRawUrls } from "../shared/sanitize";
import { pickRotatingTopic, usedInRecentPosts } from "../shared/topicRotation";
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
- です・ます の機械的な連続。体言止め・「〜って」の引用・「…」の余韻でリズムを作る（「〜ですよね」は下の【問いかけのルール】どおり禁止なので使わない）。
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
- **自分の実感をひとこと**入れる：「個人的には」「これは本当に多いです」「毎日聞きます」のような、書き手の体温が伝わる一言。
  ただし「正直」「実は」「ぶっちゃけ」「ちなみに」は使わない（下の【足してはいけない言葉】と同じ。人間の投稿にはほぼ出ない常套句）。
- 冷たく事務的なトーンで終わらせない。最後の一文はやわらかく（絵文字か「！」か話し言葉で）。

【お手本の形（冒頭に数字・短く言い切る・1文ずつ改行・ぬくもりあり）】
運動が続かない人の共通点、3つあります。

頑張りすぎ・完璧主義・ひとりでやる。
これ全部当てはまる方、本当に多いです😅

マシンが支えてくれるピラティスは、この3つ全部いらないんです！`;

// 会話型（あるある・共感・Q&A）にだけ許可する締めの追加指示。
// リーチ型は言い切りで終わるが、会話型は返信をもらうのが目的なので
// 「具体的で答えやすい小さい問いかけ」1つで締めてよい。
const CONVERSATION_ENDING_ADDENDUM = `

【この投稿は会話型】この投稿だけは、最後を「具体的で答えやすい小さい問いかけ」1行で締めてよい。
- 読者が一言で答えられる、実際に答えを知りたい質問にする（人間の投稿の問いかけは全部これ）。
- 「〜いませんか？」「〜だと思いませんか？」「気になりませんか？」のような**同意を求める確認疑問は禁止**。機械だけが書く形で、読者は答えようがない。
- この指示文の中の言い回しをそのまま投稿に使わない。やわらかい敬語で。`;

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
/**
 * 品質ガードで落ちた理由を、同じ枠の作り直しに渡すための一時置き場（プロセス内・その場限り）。
 * キー＝ユーザー:アカウント:枠。作り直しループが読んで generateAutoPost の retryHint に渡す。
 */
const lastRejectReason = new Map<string, string>();
const rejectKey = (userId: number, accountId: number, slot: number) => `${userId}:${accountId}:${slot}`;

/**
 * 作り直しの理由を、次の作り直しへ渡すと同時にDBへ残す（2026-09-22）。
 *
 * ★ログだけでは数えられない。本番のコンテナは再デプロイのたびに作り直され、
 *   それ以前のログが全部消える（9/19 20時・9/21 01:16 に実際に起きている）。
 *   9/22 未明の夜間整備では、6時の生成のログが 09:52 の再デプロイで消えており、
 *   「同じ理由で3回落ちて投稿ゼロになった人」を1件も数えられなかった。
 *
 * 記録に失敗しても投稿の生成は止めない（待たない・例外を投げない）。
 *
 * @param guard   どの検査か（数えるときの見出しになる）
 * @param hint    次の作り直しへ渡す文（これまでどおり lastRejectReason に入る）
 * @param detail  数えるための短い中身（省略時は hint を丸めて使う）
 * @param gaveUp  この作り直しで枠を捨てたか（＝お届けが1本減った）
 */
function noteReject(
  guard: string,
  userId: number,
  accountId: number,
  slot: number,
  hint: string,
  opts: { detail?: string; gaveUp?: boolean } = {},
): void {
  lastRejectReason.set(rejectKey(userId, accountId, slot), hint);
  void db
    .recordPostReject({ userId, threadsAccountId: accountId, guard, detail: opts.detail ?? hint, gaveUp: opts.gaveUp })
    .catch(() => undefined);
}

export async function naturalizeContent(
  text: string,
  personal: boolean = false,
  brandVoice?: string | null,
  /** 下書きに入っている「この店を指す言葉」（店名・地名・実績の数字）。消させない。 */
  keepWords: string[] = [],
  /** 文体のお手本（projects.styleSamples）。絵文字を消してよいかの判断に使う。 */
  styleSamples?: string | null,
): Promise<string> {
  try {
    const persona = personal ? 'あなたは自分の名前で発信している個人事業主です' : 'あなたはお店のオーナーです';
    // ★「削るのはOK」の指示に従って店名・地名まで削られ、あとの identityGuard で
    //   枠ごと作り直しになっていた（2026-09-10）。下書きに実在する言葉だけを明示して守る。
    const keepNote = keepWords.length > 0
      ? `\n【消してはいけない言葉（最優先。文字を変えずそのまま残す）】\n- ${keepWords.map((w) => `「${w}」`).join('／')}\n- 短くするために他を削っても、この言葉だけは必ず本文に残す。言い換え・省略・ふりがな化も禁止。\n`
      : '';
    // ★登録された口調を最優先にする（2026-09-08）。
    //   このリライトは一律に「友達に送る口語」へ崩していたため、「敬語で落ち着いた口調」と
    //   登録したお店に「〜など、心当たり？」「〜していますよ😊」が出ていた。
    const voice = String(brandVoice || '').trim();
    // ★絵文字を消すのは「落ち着いた口調だけを登録し、お手本も絵文字を使っていない方」に限る（2026-09-11）。
    //   生成の最終指示は「絵文字を1〜3個、毎回必ず入れる」なのに、ここが敬語登録の全員から一律に消していた。
    //   そのあとのAI採点はお手本（絵文字あり）と比べて「絵文字が無い」と落とすため、
    //   「丁寧な敬語＋少しフレンドリー」で登録した4名は、作り直しても同じ理由で落ち続けていた
    //   （9/10は岩根様の3枠すべてが3回とも 2/5 で落ち、その日の投稿がゼロ）。
    const { emojiAllowed } = await import('../shared/styleTraits');
    const { isFriendlyVoice } = await import('../shared/voiceGuard');
    const keepEmoji = emojiAllowed(voice, styleSamples ?? null);
    const politeOnly = /(敬語|丁寧|落ち着|上品|誠実|真面目)/.test(voice) && !isFriendlyVoice(voice);
    const voiceNote = voice
      ? `\n【登録された口調（最優先・ここに合わせる）】\n- 店主が登録した口調：「${voice}」。この口調に合わない言い方には直さない。\n- 敬語・丁寧・落ち着いた口調の登録なら、です・ます調のまま崩さない。「〜だね」「〜だよ」「〜かな」のような砕けた語尾にしない。\n${politeOnly ? '- 「〜ますよ」「〜ですよ」で崩さない。言い切りで締める。\n' : ''}${keepEmoji ? '- 絵文字は消さない（元の文にある絵文字はそのまま残す。増やすのは禁止）。\n' : '- 絵文字は使わない（元の文にあっても消す）。落ち着いた口調の店主は絵文字で締めない。\n'}${/(敬語|丁寧|落ち着|上品|誠実|真面目)/.test(voice) ? '- 「〜が大切です」「〜楽になります」「〜の一歩です」「お手伝いしています」のような、どの店でも言える締めは削る。最後の文は、この投稿の内容にしか当てはまらない言葉にする。\n' : ''}`
      : '';
    const prompt = `${persona}。次のThreads投稿の下書きを、自分のスマホで打ち直すつもりで自然な投稿に直してください。

【最優先：スマホでの見た目】
- 合計 **50〜100文字** に収める。長い場合は情報を削る（一番大事な1メッセージだけ残す）。
- **改行は必ず文末（。！？）の直後だけ。文の途中で改行するのは絶対禁止**。1文＝1行で書き切る。
- **1〜2文ごとに空行**を入れて段落を分ける。行間の余白で読ませる。
- 1文は30文字以内を目安に短く。

【事実のルール】
- 事実・情報を足さない。数字・店名・地名・意味を変えない。削るのはOK（ただし下の「消してはいけない言葉」は除く）。
${keepNote}
【語尾のルール（最重要。実際の投稿分析で人間との差が一番大きかった）】
- 「〜んです」「〜なんです」「〜んですよ」「〜んですよね」は投稿全体で**最大1回**。2回以上は書き直す。普通の「〜です」「〜ます」言い切りに変える。
- 「〜ですよね」「〜ますね」で同意を求めない。自分の感想は「〜と思う」「〜でした」と言い切る。
- 連続する2つの文を同じ語尾にしない。
- 体言止め（名詞で終わる文）や「〜って」の引用、「…」の余韻は使ってよい。文のリズムが人間らしくなる。

${voiceNote}
【問いかけのルール】
- 名詞や一語で切る問いかけは禁止（「〜など、心当たり？」「本当？」）。問いかけるなら、相手が答えられる形の文にする（「朝起きたとき、首は重くないですか？」）。
- 「〜や〜、〜など」と並べてから問いかけない。並べるだけの文は1つに絞る。
- 「〜いませんか？」「〜と思いませんか？」「気になりませんか？」のような**同意を求める確認疑問は禁止**。実際の人間の投稿にはひとつも出てこない、機械だけが書く形。
- 締めの形は元の文に従う。元が言い切りなら言い切りのまま。締めを問いかけに書き換えることは絶対にしない。

【足してはいけない言葉】
- 「実は」「正直」「ぶっちゃけ」「ちなみに」を元の文に無いのに足さない。
- 「してみませんか」「がおすすめです」「いかがですか」「安心してください」「ぜひ」は使わない。
- 接続詞（さらに・また・そのため・だからこそ）で文をつながない。接続詞を消して文を並べるだけのほうが自然。

【絵文字と記号】
- 元の文にある絵文字は消してよいが、**新しく足すのは最大1個まで**。
- ✨と💦は装飾にしか見えないので新たに足さない。感情が動く場面に😊😅など1個で十分。
- 「。」の直後に絵文字を置かない（絵文字で終わる文に句点は不要）。
- 「！」は元の文にある分だけ。機械的に足さない。

【漢字とひらがなのバランス】
- 常用漢字で書ける言葉は漢字で書く（体・原因・続く・整える・大切・気持ち 等）。ひらがなに開きすぎると幼い文になる。
- ただし補助動詞・形式名詞はひらがなのまま（〜してみる・〜すること・〜のとき・ください 等）。
- 元の文の漢字を、意味が同じままひらがなに開かない。

【最後に】
- 書き直した文を声に出して読んで、店のオーナーが自分のスマホで打った文に見えるか確認する。整いすぎた説明文になっていたら崩す。
- どの投稿にも入れられる汎用フレーズで締めない。締めはこの投稿の内容に固有の言葉にする。

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
  // ★補填で4件目があるときは、既定の3枠と重ねず昼12時台に出す
  const list = index >= hours.length && hours.length < 4 ? [...hours, 12] : hours;
  const hour = list[index % list.length];
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
 * ★当日分の補充（登録したその日に、その日の本数ぶん投稿するための時刻決め）
 *
 * なぜ要るか:
 *   毎日の生成は朝6時にしか走らない。夜21時にお申し込みいただいた方は、
 *   その日は1本も投稿されず、翌朝まで何も起きなかった（1日3投稿のプランなのに）。
 *   お申し込み直後に「今日はあと何本出せるか」を数えて、残り時間に配置する。
 *
 * 時刻の決め方:
 *   1. 実測で伸びる時間帯（15/21/22時＋22〜23時も1.19倍なので23時）のうち、
 *      今日まだ来ていないものを優先して使う。
 *   2. それでも本数が足りなければ、今から23:50までを等間隔に割る。
 *      ただし投稿同士は最低 MIN_GAP_MINUTES あける（短時間の連投は
 *      スパム扱いで到達が落ちる。Moveact IGで連投分だけ消された実例あり）。
 *   3. 間隔を守ると入りきらない場合（深夜のお申し込み）は、入る本数だけにする。
 *      無理に詰め込んで投稿を消されるより、翌朝から満額のほうが良い。
 */
const SAME_DAY_EXTRA_HOURS = [23];
const MIN_GAP_MINUTES = 25;

export function buildSameDaySlots(count: number, preferred: number[] | null | undefined, now: Date = new Date()): Date[] {
  if (count <= 0) return [];
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  const y = jst.getUTCFullYear(), m = jst.getUTCMonth(), d = jst.getUTCDate();
  const at = (h: number, mi: number) => Date.UTC(y, m, d, h, mi, 0) - JST_OFFSET_MS;
  const earliest = now.getTime() + 10 * 60_000;   // 生成直後すぐは避ける（承認の余地を残す）
  const latest = at(23, 50);
  if (latest <= earliest) return [];
  const gap = MIN_GAP_MINUTES * 60_000;

  // 1. 勝ち時間帯のうち今日まだ来ていないもの
  const base = preferred && preferred.length > 0 ? preferred : POSTING_HOURS;
  const pool = Array.from(new Set([...base, ...SAME_DAY_EXTRA_HOURS])).sort((a, b) => a - b);
  const preferredSlots: number[] = [];
  for (const h of pool) {
    const t = at(h, Math.floor(Math.random() * 30));
    if (t >= earliest && t <= latest) preferredSlots.push(t);
  }
  preferredSlots.sort((a, b) => a - b);
  const spaced: number[] = [];
  for (const t of preferredSlots) {
    if (spaced.length === 0 || t - spaced[spaced.length - 1] >= gap) spaced.push(t);
    if (spaced.length >= count) break;
  }
  if (spaced.length >= count) return spaced.slice(0, count).map((t) => new Date(t));

  // 2. 足りない分は残り時間を等間隔に割る（最低間隔は守る）
  const span = latest - earliest;
  const maxFit = Math.floor(span / gap) + 1;
  const n = Math.max(1, Math.min(count, maxFit));
  const step = n > 1 ? span / (n - 1) : 0;
  const even: Date[] = [];
  for (let i = 0; i < n; i++) even.push(new Date(Math.round(earliest + step * i)));
  return even;
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
  // 当日補充のときは時刻を外で決めて渡す（null なら従来どおり翌回の勝ち時間帯）
  fixedScheduledAt: Date | null = null,
  // ★前回の下書きが品質ガードで落ちた理由。作り直しのときに渡して、同じ失敗を繰り返させない
  //   （2026-09-08 比嘉先生：3回とも「〜楽になります😊」型の汎用の締めで落ち、投稿ゼロになった）
  retryHint: string | null = null,
  // ★最後の作り直し。ここで落とすとその枠は投稿ゼロで終わるので、
  //   「使い回し」のような程度の問題では止めず、記録だけ残して公開する。
  lastAttempt: boolean = false,
  // ★保証パス（2026-09-18 三上様指示「プロプランであれば必ず3投稿できるように」）。
  //   3回作り直しても重複で落ちた枠を捨てないための最後の1回。
  //   ここでは「同じ言い回し」では止めない（止めると枠がゼロになり、契約本数を割る）。
  //   ただし似た投稿を黙って公開はしない。必ず承認カードにして、お客様が見送れるようにする。
  guarantee: boolean = false,
  // ★3案からお選びいただく形（2026-09-22 三上様指示・shared/threeChoice.ts）。
  //   choiceGroupId を渡すと「1つの枠に対する選択肢」として作る（必ず承認カード）。
  //   forcedAngleId は3案の切り口を散らすため（同じ材料から3本作ると同じ所へ戻るため）。
  opts: { choiceGroupId?: string | null; forcedAngleId?: string | null } = {},
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
    // ★同じ切り口に偏らない（2026-09-18）。このアカウントの直近12本で使った切り口を渡し、
    //   まだ出ていない切り口を出やすく・3回以上出た切り口を出にくくする（◯✕の学習はそのまま）。
    const recentAngles = await db.getRecentAngles(threadsAccountId, 12).catch(() => [] as string[]);
    // ★実績学習：実際に見られた回数（インプレッション）でも重みを補正する。
    //   クライアントが◯✕を押さなくても、結果そのものから伸びる型が増えていく。
    const perf = await db.getAnglePerformanceStats(userId, project.id);
    // ★健康系のお店には、ビフォーアフター・お客様の声を書かせない。
    //   2026-09-08 @haisaiseikotsuin（整骨院・連携2日目）の公開3件がThreads側で削除された。
    //   消された投稿も承認待ちの投稿も change_story / customer_voice で作られていた。
    //   下流の言い換えで直すより、最初から結果を語らせないほうが安全。
    //   ★2026-09-15 三上様指示：連携からの日数で外していた（10日目まで）のをやめ、
    //     健康系のお店は日数にかかわらず常に外す。Threads側の健康の誤情報の判定は
    //     アカウントが古くなっても消えず、11日目に戻したとたんに結果表現が出ていた。
    let excludeOutcomeAngles = false;
    try {
      const { isHealthBusiness } = await import('../shared/healthClaimGuard');
      excludeOutcomeAngles = isHealthBusiness(project.businessType);
    } catch { /* 判定できなければ従来どおり */ }
    // ★はじめの設定「どんな投稿を多めに作りましょうか」を切り口の重みに反映（2026-09-08）。
    //   登録してもらっているのに、これまで切り口選びに一切使われていなかった。
    let preferredAngles: string[] = [];
    try {
      const { preferredAngleIds } = await import('../shared/preferredAngles');
      const cr = project.counselingResult ? JSON.parse(project.counselingResult) : null;
      preferredAngles = preferredAngleIds(cr?.preferredTypes ?? cr?.rawAnswers?.preferredTypesRaw ?? null, { excludeOutcomeAngles });
    } catch { preferredAngles = []; }
    // ★3案では切り口をこちらで指定する（散らさないと、同じ材料から同じ所へ戻る）。
    //   見つからなければ今までどおり重み付き選択に落とす。
    const forced = opts.forcedAngleId ? getAngle(opts.forcedAngleId) : undefined;
    // ★三上様のアカウント（Moveact 2店・株式会社しっとる）だけ、勉強会の型を試す（2026-09-24）
    const { isStudyExperimentUser } = await import('../shared/postAngles');
    const studyExperiment = isStudyExperimentUser(userId);
    angle = forced
      ?? pickAngle(stats, Math.random, perf, Date.now(), (project as any).mode ?? 'store', { excludeOutcomeAngles, preferredAngles, recentAngles, studyExperiment });
    if (studyExperiment && angle) console.log(`[AutoPost] 試験中（勉強会の型） userId=${userId} account=${threadsAccountId} → ${angle.id}`);
    if (forced) console.log(`[AutoPost] 3案：切り口を指定 account=${threadsAccountId} → ${forced.id}`);
    if (preferredAngles.length) console.log(`[AutoPost] 希望の型を優先 userId=${userId} ${preferredAngles.join('/')} → ${angle.id}`);
    if (excludeOutcomeAngles) console.log(`[AutoPost] 健康系のお店のため結果を語る切り口を除外 userId=${userId}`);
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
  // ★2026-09-18：切り口の指示を「最優先」にし、位置も好みの指示のあと（末尾側）へ移した。
  //   末尾の共通指示（AUTO_POST_STYLE_ADDENDUM）が「全指示より優先・1行目に数字・伝えることは1つ」と
  //   宣言していたため、切り口の要件（日常の一場面／学びの話／小ワザの手順）が入る余地が無く、
  //   モデルは切り口を捨てて「悩み一言→店名→整えます」の定型に逃げていた。
  //   長さの決まりはそのまま。その枠の中で、切り口の要件を「1行目に数字」より優先させる。
  const angleNote = angle
    ? `\n\n【今回の切り口（最優先・厳守）】\n- 今回は「${angle.label}」の切り口で書くこと：${angle.hint}\n- ★上の「1行目に数字を置く」は「数字・実績」の回だけの決まり。${angle.id === 'number_result' ? '今回はその回なので、1行目は必ず数字から始める。' : '今回はこの切り口の要件を優先し、数字で始めなくてよい。'}\n- ★「悩みを一言→店名→国家資格者が整えます／来てください」の定型は禁止。この切り口の要件が本文に入っていなければ不合格として作り直しになる。\n- 毎回同じ書き出し・同じ構成にならないよう、この切り口らしい入り方にする。\n- ★切り口の説明に出てくる例（業種・症状・文言）はこの店とは無関係の説明用サンプル。**例の文言をそのまま投稿に使うことは禁止**。この店の入力情報だけで書く。`
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
    // ★お客様がご自分で手直しした投稿から「好み」を作り、翌日以降の投稿を寄せていく。
    //   材料が無ければ空文字になるので、これまでと同じ生成になる（2026-09-08 三上様指示）。
    // ★名前を preferenceNote にすると、上で作った◯✕評価の好み（line 391）を隠してしまい、
    //   評価による学習がプロンプトから消える。別の名前にして両方を渡す。
    let editPreferenceNote = '';
    try {
      const { buildPreferenceNote } = await import('../shared/postPreference');
      const edits = await db.getUserEditedPosts(userId, 5);
      editPreferenceNote = buildPreferenceNote(edits);
      if (editPreferenceNote) console.log(`[AutoPost] 手直しの好みを反映 userId=${userId} edits=${edits.length}`);
    } catch (e) { console.warn(`[AutoPost] 手直しの好みの反映をとばしました: ${(e as Error)?.message}`); }

    // ★生成のときにも「この店を指す言葉」を渡す（2026-09-10）。
    //   渡していなかったため、生成側は「毎回・1行目に無理に入れない」と指示され、
    //   生成後の identityGuard は「1つ必須」を求める矛盾になっていた。
    //   9/10朝の自動投稿では、この理由の作り直しが19件で失敗の最大要因だった。
    let identityWords: string[] = [];
    try {
      const { identityTokens } = await import('../shared/identityGuard');
      identityWords = identityTokens(project).slice(0, 8);
    } catch { identityWords = []; }

    // ★直近の自分の投稿を、プロンプトを組み立てる前に取る（2026-09-21）。
    //   信条（belief）・実績（proof）を「今日渡すかどうか」の判断に使うため、
    //   以前より前へ移した（取り方は変えていない）。
    let recentPosts: string[] = [];
    try { recentPosts = await db.getRecentPostContents(threadsAccountId, 10); } catch { recentPosts = []; }
    // ★ご本人がThreadsアプリから投稿した分も見る（2026-09-11 香取様「同じ内容だったので自分で投稿していた」）。
    //   こちらの下書きだけでなく、ご本人の直近の投稿とも話題・言い回しを重ねない。1日1回だけ取りに行く。
    try {
      const own = await recentOwnThreadsPosts(threadsAccountId);
      for (const t of own) if (!recentPosts.includes(t)) recentPosts.push(t);
    } catch { /* 取れなくてもこちらの下書きだけで続ける */ }

    // ★信条と実績が、毎回そのまま投稿に出てしまうのを止める（2026-09-21）。
    //
    //   香取様（acc21）の「信条」には「痛い場所をマッサージするだけでは良くなりません。」、
    //   「実績」には「整形外科で11年勤務」が登録されている。悩み・強み・N1は日替わりで
    //   回しているのに、この2つだけは回しもせず、しかも信条には
    //   「投稿に一貫してにじませる」という強い指示が付いていた。
    //   その結果、毎回この2つが本文に出て、重複ガードに弾かれ続け、
    //   9/21は4回とも差し戻されて公開ゼロになった（1日1件のご契約のため）。
    //
    //   ここでは2つのことをする。ガードは一切緩めない。
    //    1. 複数行あるときは日替わりで1つだけにする（悩み・強みと同じ扱い）
    //    2. 直近の投稿がすでにその言い回しを使っているなら、今日は渡さない
    //       （渡さなければ、AIはN1顧客像や強みなど別の材料から書くしかなくなる）
    const dropIfRecentlyUsed = (text: string | null | undefined, label: string): string | undefined => {
      const v = String(text ?? '').trim();
      if (!v) return undefined;
      const picked = pickRotatingTopic(v, postTypeIndex + purposeIndex) || v;
      if (recentPosts.length > 0 && usedInRecentPosts(picked, recentPosts)) {
        console.log(`[AutoPost] ${label}「${picked.replace(/\s+/g, ' ').slice(0, 30)}」は直近の投稿で使われているため今日は渡さない userId=${userId} projectId=${project.id}`);
        return undefined;
      }
      return picked;
    };
    const beliefForToday = dropIfRecentlyUsed((project as any).belief, '信条');
    const proofForToday = dropIfRecentlyUsed(project.proof, '実績');

    const prompt = generateThreadsPrompt({
      storeName: (project as any).storeName || undefined,
      identityTokens: identityWords,
      businessType: project.businessType,
      area: project.area,
      localTerms: approvedLocalTerms(project),
      styleSamples: (project as any).styleSamples || undefined,
      preferenceNote: editPreferenceNote || undefined,
      target: project.target,
      mainProblem: project.mainProblem,
      strength: project.strength,
      // ★登録された悩み・強みが複数あるときは、今日の1本で取り上げるものを日替わりで指定する。
      //   これが無いと、材料を全部渡していても毎回いちばん上の1つだけが使われる（shared/topicRotation.ts）。
      focusProblem: pickRotatingTopic(project.mainProblem, postTypeIndex + purposeIndex) || undefined,
      focusStrength: pickRotatingTopic(project.strength, postTypeIndex) || undefined,
      // ★悩み・強みが1行しか無い方でも、N1顧客像に複数行の材料があることがある
      //   （岩根様＝悩み1行・強みは文の折り返しで取り出せず・N1顧客像に7行。2026-09-18）
      //   指数は postTypeIndex * PURPOSES.length + purposeIndex（0〜23）にする。
      //   purposeIndex だけだと 0〜3 しか取らず、7行のうち4行しか回らなかった
      //   （2026-09-18 昼に本番データで実測）。
      focusN1: pickRotatingTopic(project.n1Customer, postTypeIndex * PURPOSES.length + purposeIndex) || undefined,
      // ★健康系のお店では、はじめの設定に書かれた結果表現を渡す前に落とす（2026-09-15 三上様指示）。
      //   落としたことはログに残す（誰の設定を洗ったかが分からないと、材料の足りない方に
      //   気づけない。岩根様のように登録内容そのものが薄い方は朝の報告に載せる）。
      onProfileScrub: (hits) =>
        console.log(`[AutoPost] はじめの設定から健康の断定を除外 userId=${userId} projectId=${project.id} ${Array.from(new Set(hits)).join('・')}`),
      proof: proofForToday,
      link: project.ctaLink || undefined,
      links: projectLinks.map(l => ({ type: l.type, label: l.label, url: l.url })),
      postType,
      treeCount: 0,
      usp: project.usp || undefined,
      n1Customer: project.n1Customer || undefined,
      belief: beliefForToday,
      catchphrase: (project as any).catchphrase || undefined,
      customerWords: (project as any).customerWords || undefined,
      purpose,
      counseling: counselingResult,
      useThreadsKnowhow,
      stylePreference,
      ngWords,
    });
    // 個人ブランディングモード: 発信者設定を最優先で上書き（店舗前提の表現を止める）
    const personal = isPersonalMode((project as any).mode);
    const promptWithMode = prompt;

    // ★直近の自分の投稿を見せて、決め台詞の使い回しを止める（2026-09-10）。
    //   切り口は毎回変わっていたのに書き出しの一節だけが同じ投稿が5本続き、
    //   香取様が5本とも「✕ 違う」を付けて4本を見送られた。
    //   お客様が見送られた下書きも含む（断られた切り口をもう一度出さない・2026-09-11）。
    //   ★2026-09-21：recentPosts の取得は、信条・実績の判断に使うため上へ移した。
    const recentNote = recentPosts.length > 0
      ? `\n\n【直近の投稿（同じ言い回しを繰り返さない）】\n${recentPosts.slice(0, 6).map((p, i) => `${i + 1}. ${String(p).replace(/\s+/g, ' ').slice(0, 90)}`).join('\n')}\n- 上の投稿で使った書き出し・決め台詞・たとえを、そのまま使い回さない。同じことを言うなら、別の入り方・別の言葉にする。\n- 読んだ人が「この前と同じ投稿だ」と感じたら失敗。\n- 実績の数字（「◯年」「のべ◯人」など）から書き出さない。上の投稿と同じ数字で入ると、言い回しを変えても同じ投稿に見える。`
      : '';

    // ★お手本の癖を「数えた事実」として渡す（2026-09-11）。
    //   お手本の文言は上の【文体のお手本】で渡しているが、「読み取って再現して」だけでは
    //   絵文字・ハッシュタグ・自分の体験談が毎回落ちていた。AI採点はお手本と比べて落とすため、
    //   同じ理由で3回とも落ちて投稿ゼロになる枠が出ていた（9/10 岩根様の3枠）。
    let traitsNote = '';
    let allowEmoji = true;
    try {
      const { extractStyleTraits, styleTraitsNote, emojiAllowed } = await import('../shared/styleTraits');
      const samples = (project as any).styleSamples || null;
      traitsNote = styleTraitsNote(extractStyleTraits(samples));
      allowEmoji = emojiAllowed(
        (counselingResult?.brandVoice ?? (stylePreference as any)?.voice ?? null) as string | null,
        samples,
      );
    } catch (e) { console.warn(`[AutoPost] お手本の癖の反映をとばしました: ${(e as Error)?.message}`); }

    // Call LLM
    // ★自動投稿は人の目を通らず公開されるため、短文・会話調の最終指示を
    //   プロンプト末尾に追加する（末尾の指示が最も遵守されやすい）。
    const response = await invokeLLM({
      messages: [{
        role: 'user',
        content: promptWithMode + AUTO_POST_STYLE_ADDENDUM
          + seasonContextJST()
          + recentNote
          + lengthNote
          + traitsNote
          + (retryHint ? `\n\n【前回の下書きが不合格だった理由（厳守・同じ形にしない）】\n${retryHint}\n- 上の型の締めは書かない。締めは${allowEmoji ? '' : '絵文字なしで、'}この投稿の内容に固有の1文にする。` : '')
          + preferenceNote
          // ★切り口の指示は好みの指示のあと（末尾に近いほど守られる。2026-09-18）
          + angleNote
          + (CONVERSATION_POST_TYPES.has(postType) ? CONVERSATION_ENDING_ADDENDUM : '')
          // ★求人（採用）の投稿を、集客と同じ型で書かせない（shared/recruitingPost.ts・2026-09-23）。
          //   プレステージ様は2晩続けて naturalnessReview で3回落ち、枠を捨てていた。
          + (looksLikeRecruiting(project) ? RECRUITING_POST_ADDENDUM : '')
          // ★個人モードの上書きは最末尾（末尾の指示が最も遵守されやすい）
          + (personal ? personalModePromptOverride() : ''),
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
    // ★2026-09-11 三上様指示「通常の投稿にリンク先へ促す文を入れない」。
    //   誘導文（ご相談はLINEから等）は固定投稿だけに置き、通常の自動投稿には付けない。
    //   （CTA_POST_TYPES は固定投稿側の判定に残す）
    let includeCta = false;
    void CTA_POST_TYPES;
    // ★慣らし運転中（連携14日未満）は投稿にリンク（CTA）を付けない。
    //   新規アカウントで毎回リンク付き投稿＝スパム判定の典型（入口はプロフィールのリンクと固定投稿）。
    try {
      const { rampForAccount } = await import('./accountRampCheck');
      const acc: any = await db.getThreadsAccountById(threadsAccountId);
      if (acc && (await rampForAccount(acc, 99)).capped) includeCta = false;
    } catch { /* 取れなければ従来どおり */ }

    // ★人間化リライト（2パス目）：factGuard通過後の本文を口語に書き直す。
    //   事実の追加は禁止プロンプトで担保（削るのみ可）。CTAは定型で良いので対象外。
    //   リライト後にNGワードガードを再適用する（言い換えで規制語が混入した場合の保険）。
    const beforeNaturalize = stripRawUrls(result.mainPost);
    // ★口調が未登録（「まず5問」で始めた方は「きょうの1問」で聞くまで空）のあいだは、
    //   お店の発信として無難な「丁寧で落ち着いた口調」を既定にする。空のままだと
    //   砕けた締め（〜ますよ😊）の検査が効かず、初日から不自然な投稿が出うる（2026-09-09）。
    const registeredVoice = (counselingResult?.brandVoice ?? (stylePreference as any)?.voice ?? null) as string | null;
    const brandVoice: string | null = String(registeredVoice || '').trim() ? registeredVoice : (personal ? null : '丁寧で落ち着いた口調（未登録のため既定）');
    // ★リライトに「この店を指す言葉」を消させない（2026-09-10）。
    //   このリライトは「50〜100文字に収める／情報は削ってよい」と指示しているため、
    //   下書きに入っていた店名・地名を真っ先に削っていた。その結果あとの identityGuard に
    //   落ちて枠ごと作り直しになり、3回で諦めて投稿ゼロになる枠が出ていた（2026-09-09の実測）。
    //   下書きに実際に入っている言葉だけを「消さないで」と渡す（無い言葉は渡さない）。
    let keepIdentityWords: string[] = [];
    try {
      const { checkIdentity } = await import('../shared/identityGuard');
      keepIdentityWords = checkIdentity(beforeNaturalize, project).found.slice(0, 3);
    } catch { keepIdentityWords = []; }
    let naturalMain = await naturalizeContent(
      beforeNaturalize, personal, brandVoice, keepIdentityWords, (project as any).styleSamples || null,
    );

    // ★日本語品質ガード（shared/jpQualityGuard.ts）。
    //   リライトが口癖（「正直、」）・お手本コピー・ひらがな開きすぎ・
    //   勝手な問いかけ締めを混入させた事故（2026-08-26 三上さん指摘）の再発防止。
    //   不合格なら、機械で直さずリライト前の文に戻す（安全な代替が常にあるため）。
    const verdict = checkNaturalized(naturalMain, beforeNaturalize, {
      allowQuestionEnding: CONVERSATION_POST_TYPES.has(postType),
    });
    if (!verdict.ok) {
      // ★差し戻し先（＝生成そのままの文）も決まり文句を検査する。
      //   checkNaturalized はリライト後しか見ないため、生成本文に
      //   「思っていませんか？」等が入っていると素通りしていた
      //   （2026-09-03の週次リサーチで実際に2本の公開を検出: id 745 / 753）。
      //   決まり文句は絶対条件、差し戻し理由は相対条件なので、
      //   「差し戻し先に決まり文句があり、リライト後には無い」ときだけリライトを残す。
      const ticInOriginal = findBannedTic(beforeNaturalize);
      if (ticInOriginal && !findBannedTic(naturalMain)) {
        console.warn(
          `[AutoPost] naturalize rejected (${verdict.reason}) が、差し戻し先に決まり文句「${ticInOriginal}」— リライト後の文を採用 userId=${userId}`,
        );
      } else {
        console.warn(`[AutoPost] naturalize rejected (${verdict.reason}) — リライト前の文を使用 userId=${userId}`);
        naturalMain = beforeNaturalize;
      }
    }

    // 両方の候補に決まり文句が残った場合は、機械で削ると新しい不自然を作るので
    // 公開はするが必ず記録に残す（週次リサーチがこのログで検出しプロンプトを直す）。
    const ticLeft = findBannedTic(naturalMain);
    if (ticLeft) {
      console.warn(
        `[AutoPost] bannedTic「${ticLeft}」が残存（生成側の要修正） userId=${userId} projectId=${project.id}`,
      );
    }

    try {
      const guarded = await enforceNgWords({ mainPost: naturalMain } as any, ngWords);
      naturalMain = (guarded as any).mainPost || naturalMain;
    } catch { /* ガード失敗時はリライト文をそのまま使う（生成時ガードは通過済み） */ }

    // ★登録された口調との矛盾（shared/voiceGuard.ts）。2026-09-08 三上様「二度と不自然な日本語を出さない」。
    //   リライト後が矛盾していてリライト前が大丈夫なら前に戻す。両方ダメなら作り直す（呼び出し側で最大3回）。
    try {
      const { checkVoice } = await import('../shared/voiceGuard');
      const vAfter = checkVoice(naturalMain, brandVoice);
      if (!vAfter.ok) {
        const vBefore = checkVoice(beforeNaturalize, brandVoice);
        if (vBefore.ok && !findBannedTic(beforeNaturalize)) {
          console.warn(`[AutoPost] voiceGuard: ${vAfter.reasons.join('・')} → リライト前に戻す userId=${userId}`);
          naturalMain = beforeNaturalize;
        } else {
          console.warn(`[AutoPost] voiceGuard: ${vAfter.reasons.join('・')}（前も ${vBefore.reasons.join('・') || '決まり文句'}）→ 作り直し userId=${userId}`);
          noteReject('voiceGuard', userId, threadsAccountId, postingTimeIndex,
            `- 登録した口調と矛盾：${vAfter.reasons.join('／')}`, { detail: vAfter.reasons.join('／'), gaveUp: lastAttempt });
          return false;
        }
      }
    } catch (e) { console.warn(`[AutoPost] voiceGuard skipped: ${(e as Error)?.message}`); }

    // ★この店らしさ（shared/identityGuard.ts）。地名・店名・実績の数字・出身地など、
    //   「この店を指す言葉」が1つも無い投稿は、安全で自然でも「どこの店でも出せる文」なので作り直す。
    let identityHint = '';
    try {
      const { checkIdentity, identityTokens } = await import('../shared/identityGuard');
      identityHint = identityTokens(project).slice(0, 6).join('／');
      const idv = checkIdentity(naturalMain, project);
      if (!idv.ok) {
        // ★リライトが店名・地名を削っただけで、下書きには入っている場合は、
        //   枠を捨てずにリライト前の文へ戻す（voiceGuard と同じ扱い・2026-09-10）。
        //   ガードは緩めていない：戻した文も同じ検査を通っている。
        const idBefore = checkIdentity(beforeNaturalize, project);
        const { checkVoice } = await import('../shared/voiceGuard');
        if (idBefore.ok && checkVoice(beforeNaturalize, brandVoice).ok && !findBannedTic(beforeNaturalize)) {
          console.warn(`[AutoPost] identityGuard: リライトが「${idBefore.found[0]}」を削ったため、リライト前の文に戻す userId=${userId} projectId=${project.id}`);
          naturalMain = beforeNaturalize;
          try {
            const guarded = await enforceNgWords({ mainPost: naturalMain } as any, ngWords);
            naturalMain = (guarded as any).mainPost || naturalMain;
          } catch { /* 生成時ガードは通過済みなのでそのまま使う */ }
        } else if (lastAttempt && (project.storeName || project.area)) {
          // ★最後の作り直しでも店名・地名が入らなかったら、枠を捨てずに署名の1行を足す（2026-09-10）。
          //   9/10 香取様（ライト・1日1件）は3回とも「この店を指す言葉が無い」で落ち、その日の投稿がゼロになった。
          //   足すのは登録どおりの地名と店名だけ（事実以外は足さない）。
          const areaShort = String(project.area || '').replace(/^(東京都|北海道|(?:京都|大阪)府|[一-龠]{2,3}県)/, '').trim();
          const sig = [areaShort, project.storeName].filter(Boolean).join('の');
          naturalMain = `${naturalMain.trim()}\n\n${sig}より。`;
          console.warn(`[AutoPost] identityGuard: 最後の作り直しのため署名「${sig}」を足して公開へ userId=${userId} projectId=${project.id}`);
        } else {
          console.warn(`[AutoPost] identityGuard: この店を指す言葉が無い → 作り直し userId=${userId} projectId=${project.id}`);
          noteReject('identityGuard', userId, threadsAccountId, postingTimeIndex, idv.hint,
            { detail: 'この店を指す言葉が無い', gaveUp: lastAttempt });
          return false;
        }
      }
    } catch (e) { console.warn(`[AutoPost] identityGuard skipped: ${(e as Error)?.message}`); }

    // ★自然さの採点（server/naturalnessReview.ts）。正規表現で取れない不自然さの最終関門。
    //   基準未満は公開せず作り直す。採点できないとき（API障害）は止めない。
    try {
      const { reviewNaturalness, NATURALNESS_MIN_SCORE } = await import('./naturalnessReview');
      const rv = await reviewNaturalness(naturalMain, {
        brandVoice, businessType: project.businessType, storeName: (project as any).storeName,
        styleSamples: (project as any).styleSamples || null, identityHint: identityHint || null,
      });
      // ★最後の作り直しでは3点を通す（2026-09-11）。9/11朝は35枠中19枠が失敗し、その3回目の理由の
      //   半分以上が「3/5」だった（例：「土浦で11年。／早期回復をサポートしています。」）。
      //   2点以下（明らかに不自然）は最後でも落として翌朝の自動補填に回す。
      const minScore = lastAttempt ? NATURALNESS_MIN_SCORE - 1 : NATURALNESS_MIN_SCORE;
      if (rv && rv.score < NATURALNESS_MIN_SCORE && rv.score >= minScore) {
        console.log(`[AutoPost] naturalnessReview: ${rv.score}/5 だが最後の作り直しのため公開へ（${rv.problems.join(' / ')}） userId=${userId}`);
      }
      if (rv && rv.score < minScore) {
        console.warn(`[AutoPost] naturalnessReview: ${rv.score}/5 ${rv.problems.join(' / ')} → 作り直し userId=${userId} projectId=${project.id}`);
        noteReject('naturalnessReview', userId, threadsAccountId, postingTimeIndex,
          rv.problems.length ? rv.problems.map((p) => `- 不自然と判定された箇所：「${p}」`).join('\n') : '- 店主が自分で打った文に見えない（説明文・汎用の締め）',
          { detail: `${rv.score}/5 ${rv.problems.join(' / ')}`, gaveUp: lastAttempt });
        return false;
      }
      if (rv) console.log(`[AutoPost] naturalnessReview: ${rv.score}/5 userId=${userId}`);
    } catch (e) { console.warn(`[AutoPost] naturalnessReview skipped: ${(e as Error)?.message}`); }

    // ★健康系の断定・治療結果の体験談・価格連呼のガード（shared/healthClaimGuard.ts）。
    //   2026-09-06 停止されたアカウントの投稿に「杖なしで歩ける」「痛みなく」「初回1980円」が並んでいた。
    //   言い換え表で機械的に和らげ、価格は1文ごと落とす。空になったら公開しない。
    try {
      const { checkHealthClaims, isHealthBusiness, healthClaimRetryHint } = await import('../shared/healthClaimGuard');
      if (isHealthBusiness(project.businessType)) {
        const v = checkHealthClaims(naturalMain, { allowPrice: false });
        if (!v.ok) {
          console.warn(`[AutoPost] healthClaimGuard: ${v.hits.join('・')} を落とした userId=${userId} projectId=${project.id}`);
          // ★2か所以上引っかかった投稿は、残りを繋いでも中身が薄い（体験談のオチだけ消えた形になる）。
          //   繕って出すより作り直すほうが安全なので、その日は公開しない（翌朝また作られる）。
          //   2026-09-08 @haisaiseikotsuin：公開3件がThreads側で消され、承認待ちの1件も
          //   「症状から解放」「眠りが変わった」「睡眠の質の向上」の3か所が引っかかっていた。
          // ★2026-09-15：止めた理由を次の作り直しへ渡す。渡していなかったので同じ言い回しが
          //   何度も作られ、userId=2907 は24時間で「短時間で楽になる約束」に5回・
          //   「本文が短くなりすぎた」で3枠を落としていた。ガードは緩めない。
          if (v.hits.length >= 2) {
            console.warn(`[AutoPost] healthClaimGuard: 引っかかりが多いため公開しない userId=${userId}`);
            noteReject('healthClaimGuard', userId, threadsAccountId, postingTimeIndex,
              healthClaimRetryHint(v.hits, 'many'), { detail: `引っかかりが多い：${v.hits.join('・')}`, gaveUp: lastAttempt });
            return false;
          }
          if (Array.from(v.text).length < 60) {
            console.warn(`[AutoPost] healthClaimGuard: 本文が短くなりすぎたため公開しない userId=${userId}`);
            noteReject('healthClaimGuard', userId, threadsAccountId, postingTimeIndex,
              healthClaimRetryHint(v.hits, 'short'), { detail: `本文が短くなりすぎた：${v.hits.join('・')}`, gaveUp: lastAttempt });
            return false;
          }
          naturalMain = v.text;
        }
      }
    } catch { /* ガード失敗時はそのまま */ }

    // ★「診断」「治療」の語を置き換える（健康系のみ・文は落とさない。2026-09-19）。
    //   医師法・あはき法の観点で避ける言葉。旧テンプレート経路にはあった置き換えが、この経路には無かった。
    try {
      const { isHealthBusiness, softenMedicalWords } = await import('../shared/healthClaimGuard');
      if (isHealthBusiness(project.businessType)) {
        const softened = softenMedicalWords(naturalMain);
        if (softened !== naturalMain) { console.log(`[AutoPost] 「診断」「治療」を言い換え userId=${userId}`); naturalMain = softened; }
      }
    } catch { /* 置き換えに失敗してもそのまま */ }

    // ★登録情報に無い数字（割合・順位・人数など）が入っていたら公開しない。
    //   2026-09-08 比嘉先生の当日補充で「3人に1人が知らないこと」が出た。実績は
    //   「開業11年・業界歴20年・のべ20万人以上」だけで、根拠の無い数字だった。
    //   「書いていない数字をAIが作らない」はお客様へのお約束なので、機械的に止める。
    try {
      const { findFabricatedNumbers, registeredFactsOf, fabricatedNumberRetryHint } = await import('../shared/fabricatedNumberGuard');
      const fab = findFabricatedNumbers(naturalMain, registeredFactsOf(project));
      if (fab.length > 0) {
        console.warn(`[AutoPost] fabricatedNumberGuard: 登録に無い数字 ${fab.map((x) => x.text).join('・')} のため公開しない userId=${userId} projectId=${project.id}`);
        // ★2026-09-15：健康ガードと同じく、止めた理由を次の作り直しへ渡す。
        noteReject('fabricatedNumberGuard', userId, threadsAccountId, postingTimeIndex,
          fabricatedNumberRetryHint(fab), { detail: fab.map((x) => x.text).join('・'), gaveUp: lastAttempt });
        return false;
      }
    } catch { /* ガード失敗時はそのまま */ }

    // ★切り口が守られたか（shared/angleGuard.ts）。2026-09-18 三上様
    //   「いろいろなパターンを試せるのが売りなのに、最近の投稿は無難なものばかり」。
    //   切り口の選択は分散している（週12〜19種類）のに、出来上がりは同じ型に潰れていた
    //   （三上様のアカウントの直近6本が、切り口が違っても全部「悩み一言→店名→国家資格者が整えます」）。
    //   ラベルだけ付いて中身が伴っていなかったので、その切り口なら必ず入る印が無ければ作り直す。
    //   最後の作り直しでは枠を捨てず公開する（既存方針）。ガードは事実を増やさない・緩めない。
    if (angle) {
      try {
        const { checkAngle, angleRetryHint } = await import('../shared/angleGuard');
        const ac = checkAngle(angle.id, naturalMain);
        if (!ac.ok) {
          // ★効果・結果の言い切り（逆効果・意味ない・体は変わる 等）は、最後の作り直しでも公開しない。
          //   型が崩れた程度なら枠を守って公開するが、健康系で誤情報と判定される表現は
          //   枠が空く方がまし（2026-09-24 試験用の切り口の見本で出たため）。
          const riskyClaim = /効果・結果の言い切り/.test(ac.reason ?? '');
          if (lastAttempt && !riskyClaim) {
            console.log(`[AutoPost] angleGuard: ${ac.reason} だが最後の作り直しのため公開へ userId=${userId}`);
          } else if (lastAttempt && riskyClaim) {
            console.warn(`[AutoPost] angleGuard: ${ac.reason} → 最後の作り直しでも公開しない（枠は空ける） userId=${userId}`);
            noteReject('angleGuard', userId, threadsAccountId, postingTimeIndex,
              angleRetryHint(ac, angle.label), { detail: `${angle.label}：${ac.reason}` });
            return false;
          } else {
            console.warn(`[AutoPost] angleGuard: ${ac.reason} → 作り直し userId=${userId} projectId=${project.id}`);
            noteReject('angleGuard', userId, threadsAccountId, postingTimeIndex,
              angleRetryHint(ac, angle.label), { detail: `${angle.label}：${ac.reason}` });
            return false;
          }
        }
      } catch (e) { console.warn(`[AutoPost] angleGuard skipped: ${(e as Error)?.message}`); }
    }

    // ★直近の投稿の使い回し（shared/jpQualityGuard.ts の findRepeatedPhrase）。
    //   2026-09-09 香取様が5本続けて「✕ 違う」を付けられた5本すべてに
    //   「痛い場所だけ揉んでも」が入っていた。切り口は毎回違うのに決め台詞が同じ。
    //   ただしこれは程度の問題なので、最後の作り直しでは止めない（枠を捨てない）。
    if (recentPosts.length > 0) {
      // ★店名・地名・実績の数字は毎回入ってよい言葉なので、比較の前に外す（2026-09-11）。
      //   みらい整体院様で「金沢市のみらい整体院接骨院」が使い回し扱いになり、5枠すべて落ちた。
      let idWords: string[] = [];
      try { const { identityTokens } = await import('../shared/identityGuard'); idWords = identityTokens(project).filter((w) => Array.from(w).length >= 2); } catch { idWords = []; }
      const strip = (t: string) => idWords.reduce((acc, w) => acc.split(w).join(' '), String(t));
      const dup = findRepeatedPhrase(strip(naturalMain), recentPosts.map(strip));
      // ★書き直した回数を残す（2026-09-18）。お客様に追記をお願いするとき、
      //   「なぜ必要か」を数えた事実で示すために使う（shared/materialDepth.ts）。
      if (dup) { try { await db.bumpDupReject(threadsAccountId); } catch { /* 記録できなくても続ける */ } }
      // ★保証パスでは「同じ言い回し」で落とさない（落とすと契約本数を割る）。
      //   代わりに materialGuarantee の印を付け、必ず承認カードにしてお客様が見送れるようにする。
      if (dup && guarantee) {
        console.warn(`[AutoPost] 保証パス：同じ言い回し「${dup}」が残るが、契約本数を守るためお届けする（承認カードにする） userId=${userId} projectId=${project.id}`);
      }
      // ★最後の作り直しでは、長い一致（14文字以上＝文ごと同じ）だけ落とし、短い決め台詞の重なりは記録して通す。
      //   落とした枠は翌朝の自動補填で足される。
      if (dup && !guarantee && (!lastAttempt || Array.from(dup).length >= 14)) {
        console.warn(`[AutoPost] 直近の投稿と同じ言い回し「${dup}」→ ${lastAttempt ? '最後の作り直しでも見送り（明日の生成で補填）' : '作り直し'} userId=${userId} projectId=${project.id}`);
        noteReject('duplicatePhrase', userId, threadsAccountId, postingTimeIndex,
          `- 直近の投稿と同じ言い回し「${dup}」を使っている。同じことを言うなら、別の入り方・別の言葉にする。`,
          { detail: dup, gaveUp: lastAttempt });
        return false;
      }
      if (dup) console.log(`[AutoPost] 使い回し「${dup}」が残るが短いため、最後の作り直しは公開へ userId=${userId}`);

      // ★書き出しが毎回同じ実績の数字（「11年」など）で始まると、言い回しが違っても同じ投稿に見える。
      //   2026-09-13 香取様の直近5本は findRepeatedPhrase では1件も拾えないのに、3本が「11年」で始まっていた。
      //   実績の数字は identityTokens で strip されるので、ここでは strip 前の本文を見る。
      //   枠を捨てないため、最後の作り直しでは止めない（作り直しのヒントとしてだけ使う）。
      if (!lastAttempt && !guarantee) {
        const num = findRepeatedHookNumber(naturalMain, recentPosts);
        if (num) {
          console.warn(`[AutoPost] 書き出しが直近の投稿と同じ実績の数字「${num}」→ 作り直し userId=${userId} projectId=${project.id}`);
          noteReject('duplicateHookNumber', userId, threadsAccountId, postingTimeIndex,
            `- 書き出しを直近の投稿と同じ「${num}」で始めている。実績の数字から入らず、別の入り方（お客さんの場面・季節・よくある質問など）にする。`,
            { detail: num });
          return false;
        }
      }
    }

    // 「。」の直後に絵文字が続く形（「〜しますね。✨」）は人間の投稿に無い機械の癖。
    // 誤爆しない決定的な整形なので、どちらの経路（リライト採用/差し戻し）にも適用する。
    const mainText = polishPunctuation(naturalMain);
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

    // ★長い段落はスマホで読める長さに（文末でだけ切る）。2026-09-06 点検で167字の段落が1件あった
    {
      const { softWrapLongLines } = await import('../shared/postFormat');
      fullContent = softWrapLongLines(fullContent, 90);
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
    const scheduledAt = fixedScheduledAt ?? getNextPostingTime(postingTimeIndex, bestHours);

    // （「Meta AIに聞く」セルフ返信は 2026-09-06 に「呼びかけ投稿」方式へ変更。下の scheduleMetaAiCallPost）
    const metaAiAskText: string | null = null;

    // ★新規のお客様の最初の3本には印を付け、運営が管理画面で読めるようにする（参考）。
    //   2026-09-10 三上様指示「ユーザーがOKを出したら、そのまま投稿される形に」＝運営の操作は要らない。
    //   承認カードはふつうに送り、お客様の承認だけで公開される。
    let adminReviewRequired = false;
    try { adminReviewRequired = (await db.countAccountPublishedAutoPosts(threadsAccountId)) < 3; } catch { adminReviewRequired = false; }

    // ★保証パスで作った投稿は、承認モードOFFのお客様でも必ず承認カードにする（2026-09-18）。
    //   契約本数は守るが、前と似た投稿を黙って公開はしない。見送るかどうかはお客様が決める。
    // ★3案は必ず承認カード。押されなければ1件も公開しない（shared/threeChoice.ts）。
    const needsApproval = requireApproval || guarantee || Boolean(opts.choiceGroupId);

    await db.createScheduledPost({
      userId,
      projectId: project.id,
      threadsAccountId,
      scheduledAt,
      postContent: fullContent,
      // ★承認モードON時は awaiting_approval で作成し、ユーザーが承認するまで投稿しない
      status: needsApproval ? 'awaiting_approval' : 'pending',
      // 3案の印（同じ枠の選択肢。選ばれた1件以外は公開しない）
      choiceGroupId: opts.choiceGroupId ?? null,
      materialGuarantee: guarantee ? 1 : 0,
      adminReviewRequired: adminReviewRequired ? 1 : 0,
      source: 'auto',
      // 使った切り口を記録（◯✕評価と組み合わせて好み学習に使う）
      angle: angle?.id ?? null,
      // 使った長さ条件を記録（A/Bテストの集計に使う。設定は後から変わるため投稿側に残す）
      postLength: effectiveLength,
      metaAiAskText,
    } as any);

    if (adminReviewRequired) {
      try {
        const { notifyOwner } = await import('./_core/notification');
        const base = process.env.APP_BASE_URL || 'https://threads-studio.com';
        await notifyOwner({
          title: '新規のお客様の最初の投稿（参考）',
          content: `${(project as any).storeName || ''}（user ${userId}）の投稿を作りました。お客様の承認で公開されます（運営の操作は不要）。気になる点があれば管理画面で取り下げられます。\n${base}/admin/questions\n\n${fullContent}`,
        });
      } catch (e) { console.warn(`[AutoPost] 運営への確認依頼に失敗: ${(e as Error)?.message}`); }
    }

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
export type AutoPostRunOptions = {
  /** この1人だけを対象にする（「今すぐ作る」ボタン・お申し込み直後の当日補充） */
  onlyUserId?: number;
  /**
   * 当日分の補充モード。今日すでに予約・公開済みの本数を数え、足りない分だけを
   * 今日の残り時間に配置する。朝6時の定例では false（翌回の勝ち時間帯に置く）。
   */
  fillToday?: boolean;
};

export async function processAutoPostGeneration(opts: AutoPostRunOptions = {}): Promise<{ processed: number; generated: number; failed: number }> {
  let processed = 0;
  let generated = 0;
  let failed = 0;

  try {
    // Get all users eligible for auto-posting
    const users = await db.getAutoPostEligibleUsers(opts.onlyUserId);

    if (!users || users.length === 0) {
      console.log('[AutoPost] No eligible users found');
      return { processed: 0, generated: 0, failed: 0 };
    }

    console.log(`[AutoPost] Processing ${users.length} eligible users`);

    // ★2026-09-12 三上様指示：生成を並列化（それまでは1人ずつ順番＝14人40枠で75分）。
    //   ユーザー単位で並列に走らせ、1人の中では従来どおり順番に作る（同じ日の投稿の重複を避けるため）。
    //   並列数は AUTO_POST_CONCURRENCY（既定4）。当日補充（onlyUserId）は1。開始を3秒ずつずらしてAPIの瞬間集中を避ける。
    const processUser = async (user: any): Promise<void> => {
      processed++;

      try {
        // ★#7 すべてのプロジェクトを対象に。複数店舗運営ユーザに対応。
        //   完成済みプロジェクト（必須項目埋まっている）だけを対象にし、
        //   日替わりでローテーションして1つ選ぶ（postCount のぶんだけ）。
        const allProjects = await db.getUserProjects(user.id);
        if (!allProjects || allProjects.length === 0) return;
        // ★デモプロジェクト（idが demo_ で始まる架空店舗データ。例:「東京都渋谷区の整体院」）は
        //   自動投稿の対象から除外する。過去にMeta審査用デモユーザーの自動投稿が
        //   本物のThreadsアカウントへ「渋谷区」の投稿を公開してしまった事故の再発防止。
        // ★必要な項目は shared/autoPostRequirements.ts に一本化してある。
        //   こことお客様への案内で条件が別々に書かれていると、
        //   「案内では始まると書いてあるのに1本も作られない」という食い違いが起きる。
        const { canAutoPost } = await import('../shared/autoPostRequirements');
        const eligibleProjects = allProjects.filter((p) =>
          !String(p.id).startsWith('demo_') && canAutoPost(p),
        );
        if (eligibleProjects.length === 0) {
          console.log(`[AutoPost] Skipping user ${user.id} - no project with required fields`);
          return;
        }

        // ★複数店舗対応：連携している「すべての有効アカウント」に自動投稿する
        const accounts = await db.getActiveThreadsAccounts(user.id);
        if (!accounts || accounts.length === 0) return;

        // ★プラン別の「1日あたり自動投稿上限」を適用（料金表示と実態を一致させる）。
        //   フリー等 maxAutoPostsPerDay=0 のプランは自動投稿しない。
        const subscription = await db.getSubscriptionByUserId(user.id);
        // ★契約が生きているかどうかまで見る（2026-09-22）。
        //   以前は planId だけを見ていたため、解約したあとも・決済が失敗したあとも
        //   投稿が作られ続けていた。解約は「お支払いずみの期間の終わりまで使える」に
        //   したので、期間が終われば status が canceled になり、ここで止まる。
        const { resolveEffectivePlanId } = await import('@shared/plans');
        const plan = getPlan(resolveEffectivePlanId(subscription?.planId, subscription?.status));
        const maxPerDay = plan?.features.maxAutoPostsPerDay ?? 0;
        if (maxPerDay <= 0) {
          console.log(`[AutoPost] Skipping user ${user.id} - plan does not allow auto-posting`);
          return;
        }
        const monthlyCap = plan?.features.maxScheduledPosts ?? -1;

        // ★投稿設定はアカウント別の上書きを合成して使う（shared/accountSettings.ts）。
        //   各アカウントのループで上書きを反映する。
        const { effectiveAccountSettings } = await import('../shared/accountSettings');
        let anyApproval = false;
        // ★この回で作った分だけを承認カードにする目印（2026-09-12）。
        //   当日補充を続けて実行した日に、直前の回の分まで混ざって同じカードが何度も届いた。
        const postIdBefore = await db.getMaxScheduledPostId().catch(() => 0);

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
          // ★アカウントが2つ以上あるのに、このアカウントのお店の情報が決まっていない。
          //   ここで下の日替わりローテーションに落ちると、もう一方のお店の情報で
          //   文章を作ってしまう（2026-09-19 プレステージ様：新しく作ったサロン用の
          //   アカウントに、先に登録してあった求人の投稿が回っていた）。
          //   勝手に別の情報で作らず、止めてLINEでご案内する。
          if (!(account as any).defaultProjectId && accounts.length >= 2) {
            console.log(`[AutoPost] account ${account.id} はお店の情報が未設定のためスキップ（ご案内を送る）`);
            try {
              const { notifyProjectMissing } = await import('./accountProjectNotice');
              await notifyProjectMissing(user as any, account as any);
            } catch (e) { console.warn('[AutoPost] 未設定のご案内を送れませんでした', String(e)); }
            continue;
          }

          // ★このアカウントの実効設定（アカウント別 → 無ければ共通）
          const eff = effectiveAccountSettings(user as any, account as any);
          if (!eff.autoPostEnabled) {
            console.log(`[AutoPost] account ${account.id} は自動投稿OFF（${eff.overridden.autoPostEnabled ? 'アカウント別設定' : '共通設定'}）のためスキップ`);
            continue;
          }
          if (eff.autoPostRequireApproval) anyApproval = true;
          // 1日の回数（アカウント別の設定をプラン上限で頭打ち）
          let postCount = Math.min(getPostCount(eff.autoPostFrequency), maxPerDay);
          // ★新しいアカウントの慣らし運転（shared/accountRamp.ts）。連携7日未満は1件、14日未満は2件。
          //   2026-09-06 連携4日目・フォロワー0のアカウントが本人確認→停止になった再発防止。
          {
            const { rampForAccount } = await import('./accountRampCheck');
            const r = await rampForAccount(account as any, postCount);
            if (r.capped) { console.log(`[AutoPost] account ${account.id} ${r.note}（契約${postCount}→${r.count}）`); postCount = r.count; }
            else if (r.extra) {
              console.log(`[AutoPost] account ${account.id} 補填: ${r.note}（契約${postCount}→${r.count}）`); postCount = r.count;
              // ★消えた投稿の補填（R6）は朝の生成で1日1件ずつ消化する
              if (r.reason === 'deleted' && !opts.fillToday) await db.decrementDeletedShortfall(account.id).catch(() => undefined);
              // ★お詫びの補填（2026-09-21）も同じく1日1件ずつ消化する
              if (r.reason === 'apology' && !opts.fillToday) await db.decrementApologyShortfall(account.id).catch(() => undefined);
            }
            else if (r.established) console.log(`[AutoPost] account ${account.id} はThreads歴が長いため慣らし運転なし`);
          }

          // ★昨日届かなかった分を今日に足す（自動補填・2026-09-10 三上様指示）。
          //   品質チェックで3回落ちて枠ごと消えた分は、翌朝の生成で＋1〜2件にして届ける。
          //   手動の補填（extraPosts*）と合わせて1日＋2件まで。当日補充のときは足さない（朝に足した分と二重になる）。
          const contractCount = Math.min(getPostCount(eff.autoPostFrequency), maxPerDay);
          let carried = 0;
          if (!opts.fillToday) {
            try {
              const { carryOverCount, jstDateString, inCooldown } = await import('../shared/accountRamp');
              const fullAcct: any = await db.getThreadsAccountById(account.id);
              const alreadyExtra = Math.max(0, postCount - contractCount);
              // ★冷却中は足さない（2026-09-19）。冷却の頭打ち（1日1件）を見ずに後から足していたため、
              //   9/19 朝に香取様（acc21・冷却〜9/25）と しっとる公式（acc14）が2件になった。
              //   docs/safe-operation-rules.md の「冷却中は補填も乗せない」が守られていなかった。
              carried = inCooldown(fullAcct) ? 0 : carryOverCount(fullAcct, alreadyExtra);
              if (carried > 0) {
                postCount += carried;
                await db.updateThreadsAccount(account.id, { carryDate: jstDateString(0), carryCount: carried } as any);
                console.log(`[AutoPost] account ${account.id} 自動補填: 昨日届かなかった${fullAcct?.shortfallCount}件のうち${carried}件を今日に足す（→${postCount}件）`);
              }
            } catch (e) { console.warn(`[AutoPost] 自動補填の判定に失敗 account=${account.id}: ${(e as Error)?.message}`); }
          }
          void contractCount;

          // ★R1（2026-09-13）：今日すでに予定・公開されている自動投稿（前日に上限で翌日へ送られた分など）を先に数え、
          //   新規はその差だけ作る。これが無いと翌日へ送った分と新規が重なって、また上限超えになる。
          if (!opts.fillToday) {
            const alreadyToday = await db.countAccountAutoPostsScheduledToday(account.id).catch(() => 0);
            if (alreadyToday > 0) {
              const before = postCount;
              postCount = Math.max(0, postCount - alreadyToday);
              console.log(`[AutoPost] account ${account.id} 今日すでに${alreadyToday}件（翌日へ送られた分など）→ 新規は${before}→${postCount}件`);
              if (postCount === 0) continue;
            }
          }

          // ★当日補充: 今日すでにある分を引いて、残り時間に入る本数だけ作る
          let todayCount = postCount;
          let sameDaySlots: Date[] | null = null;
          if (opts.fillToday) {
            // ★自動投稿だけを数える（手動の固定投稿の下書きを「既存」に数えない。2026-09-11 廿日市様）
            const already = await db.countAccountAutoPostsScheduledToday(account.id).catch(() => 0);
            const shortfall = Math.max(0, postCount - already);
            sameDaySlots = buildSameDaySlots(shortfall, bestHours);
            todayCount = sameDaySlots.length;
            console.log(
              `[AutoPost] 当日補充 user=${user.id} account=${account.id} 上限${postCount} 既存${already} ` +
              `→ ${todayCount}本を配置 (${sameDaySlots.map((t) => new Date(t.getTime() + JST_OFFSET_MS).toISOString().slice(11, 16)).join(' / ') || 'なし'})`,
            );
            if (todayCount === 0) continue;
          }

          // ★Meta AI 呼びかけ投稿は「追加」ではなく契約本数のうちの1件（2026-09-06 三上様指示）。
          //   1日1件のプランでは出さない。当日補充のときは不足分の中で1件を充てる。
          let regularCount = todayCount;
          try {
            const { splitDailyQuota, META_AI_CALL_AUTO_PUBLISH } = await import('../shared/metaAiAsk');
            if (!META_AI_CALL_AUTO_PUBLISH) throw new Error('__skip__'); // ★呼びかけ投稿はAPIで公開しない（下の catch で静かに抜ける）
            const already = await db.countMetaAiAskToday(account.id).catch(() => 0);
            const q = splitDailyQuota(postCount, (user as any).metaAiAskEnabled !== false);
            if (q.call > 0 && already === 0 && todayCount > 0) {
              const project = pinnedProject || eligibleProjects[dayOffset % eligibleProjects.length];
              const made = await scheduleMetaAiCallPost(user.id, project, account.id, eff.autoPostRequireApproval, dayOffset);
              if (made) regularCount = todayCount - 1;
            }
          } catch (e) {
            if (!(e instanceof Error && e.message === '__skip__')) console.error(`[AutoPost] Meta AI呼びかけ投稿の作成に失敗 user=${user.id} account=${account.id}:`, e);
          }

          let accFailed = 0;
          // ★保証パスでお届けした件数（お客様への説明に使う。materialDepth の facts.guaranteed）
          let guaranteedHere = 0;

          // ★3案からお選びいただく形（2026-09-22 三上様指示・shared/threeChoice.ts）。
          //   2日続けて公開に至らなかったアカウントは、最初の枠だけ1案ではなく3案を作る。
          //   3案は「1つの枠に対する選択肢」で、公開されるのは選ばれた1件だけ。契約本数は増やさない。
          let startIndex = 0;
          if (!opts.fillToday && regularCount > 0) {
            try {
              const { decideChoiceMode } = await import('./threeChoiceMode');
              const decision = await decideChoiceMode(account.id, eff.autoPostRequireApproval);
              console.log(`[AutoPost] 3案の判定 account=${account.id}: ${decision.note}`);
              if (decision.on) {
                const { newChoiceGroupId, CHOICE_ANGLE_IDS, CHOICE_COUNT } = await import('../shared/threeChoice');
                const { jstDateString } = await import('../shared/accountRamp');
                const groupId = newChoiceGroupId(account.id, jstDateString(0));
                const project = pinnedProject || eligibleProjects[dayOffset % eligibleProjects.length];
                let made = 0;
                for (let k = 0; k < CHOICE_COUNT; k++) {
                  // 枠は1つなので作り直しは2回まで（時間を掛けすぎない）
                  let ok = false;
                  const rk = rejectKey(user.id, account.id, 100 + k);
                  lastRejectReason.delete(rk);
                  for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
                    ok = await generateAutoPost(
                      user.id, project, typeIdx, purposeIdx, account.id, 0,
                      true, bestHours, eff.postLength, null,
                      lastRejectReason.get(rk) ?? null, attempt === 2, false,
                      { choiceGroupId: groupId, forcedAngleId: CHOICE_ANGLE_IDS[k] },
                    );
                  }
                  lastRejectReason.delete(rk);
                  if (ok) { made++; generated++; }
                  await new Promise((r) => setTimeout(r, 2000));
                }
                if (made >= 2) {
                  startIndex = 1;               // 最初の枠は3案で埋まった
                  anyApproval = true;           // 承認カードを必ずお送りする
                  console.log(`[AutoPost] 3案をご用意 account=${account.id} ${made}案（group=${groupId}）`);
                } else {
                  // ★1案しか作れなかったときは印を外し、今までどおりの1件として扱う。
                  //   印が残ったままだと「選択肢」とみなされ、自動公開の対象から外れたまま
                  //   誰にも選ばれずに消える（「見送らなければ公開」の方で起きる）。
                  const cleared = await db.clearChoiceGroup(groupId).catch(() => 0);
                  if (made === 1) { startIndex = 1; anyApproval = true; }
                  console.warn(`[AutoPost] 3案を作れず account=${account.id}（${made}案・印を${cleared}件外した）→ 通常の1件として扱う`);
                }
              }
            } catch (e) {
              console.warn(`[AutoPost] 3案の判定・作成に失敗 account=${account.id}: ${(e as Error)?.message}`);
            }
          }

          for (let i = startIndex; i < regularCount; i++) {
            const project = pinnedProject || eligibleProjects[(dayOffset + i) % eligibleProjects.length];

            // ★品質ガードで落ちた日に「投稿ゼロ」で終わらせない（2026-09-08 比嘉先生の当日補充で
            //   1回目が健康表現ガードに落ち、generated=0 のまま終わっていた）。最大3回まで作り直す。
            let success = false;
            const rk = rejectKey(user.id, account.id, i);
            lastRejectReason.delete(rk);
            for (let attempt = 1; attempt <= 3 && !success; attempt++) {
              const hint = lastRejectReason.get(rk) ?? null;
              success = await generateAutoPost(
                user.id,
                project,
                typeIdx,
                purposeIdx,
                account.id,
                i,
                eff.autoPostRequireApproval,
                bestHours,
                eff.postLength,
                sameDaySlots ? sameDaySlots[i] : null,
                hint,
                attempt === 3,
              );
              if (!success && attempt < 3) console.log(`[AutoPost] user=${user.id} account=${account.id} slot=${i} 作り直し ${attempt + 1}回目${hint ? '（前回の理由を渡す）' : ''}`);
            }

            // ★契約本数の保証（2026-09-18 三上様指示「プロプランであれば必ず3投稿できるように」）。
            //   3回作り直しても書けなかった枠を捨てない。材料が尽きて同じ言い回しへ戻るのが原因なので、
            //   まだ投稿に使っていない材料を名指しで渡して、もう1回だけ書かせる。
            //   ここで作った投稿は必ず承認カードになる（黙って似た投稿を公開しない）。
            if (!success) {
              try {
                const { unusedMaterials } = await import('../shared/materialDepth');
                const recent = await db.getRecentPostContents(account.id, 10).catch(() => [] as string[]);
                const unused = unusedMaterials(project, recent, 4);
                const guaranteeHint = [
                  lastRejectReason.get(rk) ?? '',
                  unused.length > 0
                    ? `- まだ投稿に使っていない材料がある。次のどれか1つだけを主役にして書く：\n${unused.map((u) => `  ・${u}`).join('\n')}`
                      // ★2026-09-21：材料を渡しても「寝る前5分で翌日が変わるワザ」のような
                      //   どの店でも書ける一般論に逃げ、自然さ2/5で落ちて枠ゼロになっていた（香取様 acc21）。
                      //   実際にあった一件を、その場面のまま書かせる。
                      + '\n- ★一般論・豆知識・「〜のコツ」にしない。上の材料に書かれている'
                      + '「誰が・どうなって・どうしたか」を、その順番のまま短く書くこと。'
                      + '材料に無い効果や結果は足さない。'
                    : '- これまでと違う入り方（季節・お客様との会話・よくある質問）から書く。',
                  '- 直近の投稿に出てきた言葉・決め台詞・実績の数字は使わない。信条（主張）もそのまま書かない。',
                ].filter(Boolean).join('\n');
                console.log(`[AutoPost] 保証パス user=${user.id} account=${account.id} slot=${i}（未使用の材料 ${unused.length}件）`);
                success = await generateAutoPost(
                  user.id, project, typeIdx, purposeIdx, account.id, i,
                  eff.autoPostRequireApproval, bestHours, eff.postLength,
                  sameDaySlots ? sameDaySlots[i] : null,
                  guaranteeHint, true, true,
                );
                if (success) {
                  guaranteedHere++;
                  anyApproval = true; // 承認カードを作ったので、まとめの案内を必ず送る
                  console.log(`[AutoPost] 保証パスでお届け user=${user.id} account=${account.id} slot=${i}（承認カード）`);
                } else {
                  console.warn(`[AutoPost] 保証パスでも書けず user=${user.id} account=${account.id} slot=${i} → 明日の生成で補填`);
                }
              } catch (e) {
                console.warn(`[AutoPost] 保証パスに失敗 user=${user.id} account=${account.id} slot=${i}: ${(e as Error)?.message}`);
              }
            }
            lastRejectReason.delete(rk);

            if (success) {
              generated++;
              typeIdx = (typeIdx + 1) % POST_TYPES.length;
              purposeIdx = (purposeIdx + 1) % PURPOSES.length;
            } else {
              failed++;
              accFailed++;
            }

            // Small delay between generations to avoid API rate limits
            await new Promise(r => setTimeout(r, 2000));
          }

          // ★落ちた枠の数を記録（翌朝の自動補填に使う）。朝の生成は上書き、当日補充は同じ日なら足す
          try {
            const { jstDateString, dateColToJst } = await import('../shared/accountRamp');
            const today = jstDateString(0);
            if (!opts.fillToday) {
              await db.updateThreadsAccount(account.id, { shortfallDate: today, shortfallCount: accFailed } as any);
            } else {
              // 当日補充のあとは「今日まだ足りない数」に置き換える（回数の累計にしない。翌朝の自動補填の元になる）
              const have = await db.countAccountAutoPostsScheduledToday(account.id).catch(() => 0);
              await db.updateThreadsAccount(account.id, { shortfallDate: today, shortfallCount: Math.max(0, postCount - have) } as any);
            }
            void dateColToJst;
            if (accFailed > 0) console.log(`[AutoPost] account ${account.id} 届かなかった枠 ${accFailed}件 → 明日の生成で自動補填`);
            if (guaranteedHere > 0) console.log(`[AutoPost] account ${account.id} 保証パスでお届け ${guaranteedHere}件（承認カード・お店の情報の追記をお願いする対象）`);
          } catch (e) { console.warn(`[AutoPost] 不足分の記録に失敗 account=${account.id}: ${(e as Error)?.message}`); }

          // ★2日続けて1本も届かなかったら、お詫びして「これを送ってください」とお願いする
          //   （2026-09-21 三上様指示）。黙って翌日へ回すと、お客様からは
          //   「投稿が来ていません」というお問い合わせになる（香取様・9/10 と 9/21 の2度）。
          if (!opts.fillToday) {
            try {
              const { runZeroPostCheck } = await import('./zeroPostApology');
              // 追記のお願いは、そのアカウントが実際に使う「お店の情報」に対して出す
              const projectForAccount = pinnedProject || eligibleProjects[dayOffset % eligibleProjects.length];
              await runZeroPostCheck(account.id, user.id, projectForAccount, contractCount);
            } catch (e) { console.warn(`[AutoPost] 連続ゼロの確認に失敗 account=${account.id}: ${(e as Error)?.message}`); }
          }

        }

        // Update rotation indices
        await db.updateUserAutoPostIndices(user.id, typeIdx, purposeIdx);

        // ★承認モードONのユーザーには、作成した直後に1通だけまとめて案内する。
        //   予定時刻を過ぎるまで気づけず投稿がゼロになる、という事故を防ぐため。
        //   メール内で本文を読み、そのまま承認できる（ログイン不要）。
        if (anyApproval) {
          try {
            const fresh = await db.getRecentAwaitingApprovalPosts(user.id, 30, postIdBefore);
            const owner = fresh.length > 0 ? await db.getUserById(user.id) : null;
            if (fresh.length > 0 && owner?.email) {
              const { sendApprovalDigestEmail } = await import('./approvalEmail');
              await sendApprovalDigestEmail({
                to: owner.email,
                userId: user.id,
                posts: fresh.map((p) => ({ id: p.id, postContent: p.postContent, scheduledAt: p.scheduledAt, choiceGroupId: (p as any).choiceGroupId ?? null })),
              });
              console.log(`[AutoPost] 承認依頼メール送信: user=${user.id} ${fresh.length}件`);
            }
            // LINE連携済みなら連携者全員にLINEでも通知（複数人管理対応。
            // 承認ボタンは既存のワンタップ承認URLを開くだけ）
            if (fresh.length > 0) {
              try {
                const { getLineUserIdsForUser } = await import('./db');
                const lineIds = await getLineUserIdsForUser(user.id);
                if (lineIds.length > 0) {
                  const { sendApprovalPush } = await import('./lineNotify');
                  const { createApprovalToken } = await import('./approvalToken');
                  const base = process.env.APP_BASE_URL || 'https://threads-studio.com';
                  const posts = fresh.map((p) => ({ id: p.id, postContent: p.postContent, scheduledAt: p.scheduledAt, threadsAccountId: (p as any).threadsAccountId, choiceGroupId: (p as any).choiceGroupId ?? null }));
                  const urlFor = (postId: number) => `${base}/api/post-approval?token=${createApprovalToken(postId, user.id, 'approve')}`;
                  let sentCount = 0;
                  for (const lineId of lineIds) {
                    const sent = await sendApprovalPush(lineId, posts, urlFor);
                    if (sent) sentCount++;
                  }
                  if (sentCount > 0) console.log(`[AutoPost] 承認依頼LINE送信: user=${user.id} ${fresh.length}件×${sentCount}人`);
                }
              } catch (e) {
                console.error(`[AutoPost] 承認依頼LINE送信失敗 user=${user.id}:`, e);
              }
            }
          } catch (e) {
            console.error(`[AutoPost] 承認依頼メール送信失敗 user=${user.id}:`, e);
          }
        }

      } catch (error) {
        console.error(`[AutoPost] Error processing user ${user.id}:`, error);
        failed++;
      }
    };
    const concurrency = opts.onlyUserId ? 1 : Math.max(1, Math.min(8, Number(process.env.AUTO_POST_CONCURRENCY || 4)));
    const queue = [...users];
    const startedAt = Date.now();
    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, async (_, w) => {
      await new Promise((r) => setTimeout(r, w * 3000));
      while (queue.length > 0) {
        const u = queue.shift();
        if (u) await processUser(u);
      }
    }));
    console.log(`[AutoPost] 並列${concurrency}で${users.length}人を処理（${Math.round((Date.now() - startedAt) / 60000)}分）`);

    console.log(`[AutoPost] Complete: ${processed} processed, ${generated} generated, ${failed} failed`);
  } catch (error) {
    console.error('[AutoPost] Fatal error:', error);
  }

  return { processed, generated, failed };
}

/**
 * ★お申し込み・連携・自動投稿ONの直後に呼ぶ「今日の分をいま作る」。
 *
 * 呼び出し元（どれか1つで条件がそろった瞬間に動く。何度呼んでも今日の不足分しか作らない）:
 *   ・決済完了（UnivaPay webhook）
 *   ・Threadsアカウント連携
 *   ・お店の情報の登録完了
 *   ・設定で自動投稿をON／回数を増やした
 * 条件がそろっていなければ何もしない（getAutoPostEligibleUsers が0件を返す）。
 * 本体の処理を待たせないよう、呼び出し側は await せず投げっぱなしにしてよい。
 */
/**
 * ★Meta AI 呼びかけ投稿を1日1件つくる（shared/metaAiAsk.ts の buildMetaAiCallPost）。
 *   本文は「@meta.ai ＋ 依頼文」だけ。10:00〜11:00 JST に出す（実測で朝〜昼の投稿が伸びた）。
 *   その日すでにあれば作らない。当日補充で時間を過ぎていれば、いまから30分後（21時まで）。
 */
async function scheduleMetaAiCallPost(
  userId: number,
  project: any,
  threadsAccountId: number,
  requireApproval: boolean,
  dayIndex: number,
): Promise<boolean> {
  const already = await db.countMetaAiAskToday(threadsAccountId).catch(() => 0);
  if (already > 0) return false;
  const { buildMetaAiCallPost, META_AI_CALL_ANGLE } = await import('../shared/metaAiAsk');
  let menu: string[] | null = null;
  try {
    const cr = (project as any).counselingResult ? JSON.parse((project as any).counselingResult) : null;
    menu = Array.isArray(cr?.menu) ? cr.menu : null;
  } catch { menu = null; }
  const text = buildMetaAiCallPost({
    storeName: (project as any).storeName, businessType: project.businessType, area: project.area,
    localTerms: (project as any).localTerms,
    target: project.target, mainProblem: project.mainProblem, menu,
  }, dayIndex);
  if (!text) { console.log(`[AutoPost] Meta AI呼びかけ投稿: 材料不足のため見送り project=${project.id}`); return false; }
  // 10:00〜11:00 JST のどこか
  const nowJst = new Date(Date.now() + JST_OFFSET_MS);
  const slot = new Date(Date.UTC(nowJst.getUTCFullYear(), nowJst.getUTCMonth(), nowJst.getUTCDate(), 10, 0) - JST_OFFSET_MS + Math.floor(Math.random() * 60) * 60 * 1000);
  let scheduledAt = slot;
  if (scheduledAt.getTime() < Date.now() + 5 * 60 * 1000) {
    const later = new Date(Date.now() + 30 * 60 * 1000);
    const limit = new Date(Date.UTC(nowJst.getUTCFullYear(), nowJst.getUTCMonth(), nowJst.getUTCDate(), 21, 0) - JST_OFFSET_MS);
    if (later.getTime() > limit.getTime()) { console.log('[AutoPost] Meta AI呼びかけ投稿: 本日は時間切れ'); return false; }
    scheduledAt = later;
  }
  await db.createScheduledPost({
    userId, projectId: project.id, threadsAccountId, scheduledAt,
    postContent: text,
    status: requireApproval ? 'awaiting_approval' : 'pending',
    source: 'auto',
    angle: META_AI_CALL_ANGLE,
  } as any);
  console.log(`[AutoPost] Meta AI呼びかけ投稿を予約 user=${userId} account=${threadsAccountId} at=${new Date(scheduledAt.getTime() + JST_OFFSET_MS).toISOString().slice(11, 16)}JST 「${text}」`);
  return true;
}

export async function runAutoPostCatchUpForUser(userId: number, reason: string): Promise<void> {
  // ★ローカルQA（本番スナップショットのDBを使う）では走らせない。
  //   はじめの設定を保存した瞬間にここが動くため、QA_SAFE_MODE でも
  //   実在のお客様あてに投稿の生成・ご案内が動いてしまう（2026-09-18）。
  if (process.env.QA_SAFE_MODE === '1') {
    console.log(`[AutoPost] QA_SAFE_MODE のため当日補充は動かしません user=${userId} (${reason})`);
    return;
  }
  try {
    const r = await processAutoPostGeneration({ onlyUserId: userId, fillToday: true });
    if (r.processed > 0) {
      console.log(`[AutoPost] 当日補充完了 user=${userId} (${reason}) generated=${r.generated} failed=${r.failed}`);
    }
  } catch (e) {
    console.error(`[AutoPost] 当日補充に失敗 user=${userId} (${reason}):`, e);
  }
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

/** ご本人のThreads直近投稿（返信を除く・本文のみ）。アカウントごとに1日1回だけ取得してキャッシュ */
const ownPostsCache = new Map<number, { day: string; posts: string[] }>();
async function recentOwnThreadsPosts(accountId: number): Promise<string[]> {
  if (process.env.QA_SAFE_MODE === '1') return [];
  const day = new Date().toISOString().slice(0, 10);
  const c = ownPostsCache.get(accountId);
  if (c && c.day === day) return c.posts;
  let posts: string[] = [];
  try {
    const acct: any = await db.getThreadsAccountById(accountId);
    if (acct?.accessToken) {
      const r: any = await (await fetch(`https://graph.threads.net/v1.0/me/threads?fields=id,text,is_reply&limit=12&access_token=${acct.accessToken}`, { signal: AbortSignal.timeout(8000) })).json();
      posts = (r?.data ?? []).filter((p: any) => !p.is_reply && String(p.text || '').trim()).map((p: any) => String(p.text)).slice(0, 10);
    }
  } catch { posts = []; }
  ownPostsCache.set(accountId, { day, posts });
  return posts;
}

/**
 * 見送りにした投稿の「代わり」を1本作る（LINEの「代わりを作る」ボタン。2026-09-10 三上様指示）。
 * 同じアカウント・同じ店舗で、見送った下書きと同じ切り口・言い回しを避けて作り、
 * 元の予定時刻がまだ先ならその時刻に、過ぎていれば今日の次の時間帯（21時以降は翌朝10時台）に置く。
 * @returns 作れたら true（承認カードは呼び出し側が出す）
 */
export async function generateReplacementPost(userId: number, canceledPostId: number): Promise<boolean> {
  const post: any = await db.getScheduledPostById(canceledPostId);
  if (!post || Number(post.userId) !== Number(userId)) return false;
  const user: any = await db.getUserById(userId);
  if (!user) return false;
  const projects = await db.getUserProjects(userId);
  const project = (projects || []).find((p: any) => String(p.id) === String(post.projectId)) || (projects || [])[0];
  if (!project) return false;
  const accountId = Number(post.threadsAccountId);
  const account: any = await db.getThreadsAccountById(accountId);
  if (!account || Number(account.userId) !== Number(userId)) return false;
  const common = await db.getAutoPostSettings(userId);
  const { effectiveAccountSettings } = await import('../shared/accountSettings');
  const eff = effectiveAccountSettings(common as any, account);

  // 予定時刻：元の時刻が15分より先ならそのまま。過ぎていれば今日の次の正時（21時まで）、それ以降は翌朝10時台
  const now = Date.now();
  let at = new Date(post.scheduledAt);
  if (at.getTime() < now + 15 * 60 * 1000) {
    const nowJst = new Date(now + JST_OFFSET_MS);
    const h = nowJst.getUTCHours();
    const minute = Math.floor(Math.random() * 30);
    if (h < 21) {
      at = new Date(Date.UTC(nowJst.getUTCFullYear(), nowJst.getUTCMonth(), nowJst.getUTCDate(), h + 1, minute) - JST_OFFSET_MS);
    } else {
      at = new Date(Date.UTC(nowJst.getUTCFullYear(), nowJst.getUTCMonth(), nowJst.getUTCDate() + 1, 10, minute) - JST_OFFSET_MS);
    }
  }
  const hint = `お客様が見送った下書き：「${String(post.postContent || '').replace(/\s+/g, ' ').slice(0, 160)}」。同じ切り口・同じ言い回し・同じ書き出しを避け、別の話題で書く`;
  const typeIdx = Math.floor(Math.random() * POST_TYPES.length);
  const purposeIdx = Math.floor(Math.random() * PURPOSES.length);
  const rk = rejectKey(userId, accountId, 99);
  lastRejectReason.delete(rk);
  let ok = false;
  for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
    const h = attempt === 1 ? hint : `${hint}。${lastRejectReason.get(rk) ?? ''}`;
    ok = await generateAutoPost(userId, project, typeIdx, purposeIdx, accountId, 99, true, null, eff.postLength, at, h, attempt === 3);
  }
  lastRejectReason.delete(rk);
  if (ok) console.log(`[AutoPost] 代わりの投稿を作成 user=${userId} account=${accountId} 元=${canceledPostId}`);
  return ok;
}


/** 運用スクリプト用（試験用の切り口の見本を、公開せずに作って確かめる）。本番の処理からは使わない */
export { generateAutoPost as _generateAutoPostForOps };
