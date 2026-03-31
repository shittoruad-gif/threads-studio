/**
 * Threads投稿生成プロンプトテンプレート
 */

export type PostType =
  | 'hook_tree'   // 釣り×ツリー型（逆説で掴む）
  | 'expertise'   // 専門性（誤解を正す）型
  | 'local'       // 地域性型
  | 'proof'       // 証拠（実績）型
  | 'empathy'     // 共感（悩み代弁）型
  | 'story'       // ストーリー型
  | 'list'        // ○選系リスト型
  | 'offer'       // オファー（CV直結）型
  | 'enemy'       // 仮想敵型
  | 'qa'          // Q&A型
  | 'trend'       // トレンド活用型
  | 'aruaru';     // あるある型

/**
 * 投稿の口調・トーン
 */
export type PostTone = 'polite' | 'casual' | 'professional' | 'energetic' | 'storytelling';

export interface PostToneConfig {
  id: PostTone;
  name: string;
  icon: string;
  description: string;
  promptInstruction: string;
}

export const POST_TONES: Record<PostTone, PostToneConfig> = {
  casual: {
    id: 'casual',
    name: 'フランク・親しみやすい',
    icon: '😊',
    description: '友達に話すような親しみやすい口調',
    promptInstruction: `【口調指定：フランク・親しみやすい】
- 友達に話しかけるようなカジュアルな口調で書く。
- 「〜だよね」「〜じゃない？」「〜なんだよね」のような話し言葉を使う。
- 堅い表現は避け、親しみやすさを最優先にする。
- 例：「ねえ、知ってた？」「これマジで変わるから試してみて」`,
  },
  polite: {
    id: 'polite',
    name: '丁寧・きちんとした印象',
    icon: '🎩',
    description: '敬語できちんとした印象を与える口調',
    promptInstruction: `【口調指定：丁寧・きちんとした印象】
- 「です・ます」調の丁寧語で統一する。
- 品のある表現を心がけ、信頼感のある文章にする。
- カジュアルすぎる表現は避けるが、堅すぎないようにする。
- 例：「ご存知でしょうか」「お気軽にご相談ください」`,
  },
  professional: {
    id: 'professional',
    name: '専門家・プロフェッショナル',
    icon: '👨‍⚕️',
    description: '専門家として権威性を感じさせる口調',
    promptInstruction: `【口調指定：専門家・プロフェッショナル】
- プロの立場から語る自信のある口調にする。
- 「断言します」「はっきり言います」のような力強い表現を使う。
- 根拠を示しながらも、わかりやすく伝える。
- 例：「10年施術してきて断言しますが」「プロの目線で言うと」`,
  },
  energetic: {
    id: 'energetic',
    name: '元気・ポジティブ',
    icon: '🔥',
    description: '明るくエネルギッシュな口調',
    promptInstruction: `【口調指定：元気・ポジティブ】
- 明るく前向きなエネルギーが伝わる文章にする。
- 「！」を適度に使い、テンションの高さを感じさせる。
- 読んだ人が元気になれるようなポジティブな表現を心がける。
- 例：「これ知ったら人生変わります！」「一緒に頑張りましょう！」`,
  },
  storytelling: {
    id: 'storytelling',
    name: 'ストーリー・語りかけ',
    icon: '📖',
    description: '物語を語るような引き込む口調',
    promptInstruction: `【口調指定：ストーリー・語りかけ】
- 物語を語るように、読者を引き込む文章にする。
- 「あの日」「実はね」のような語り出しで臨場感を出す。
- 感情の変化を丁寧に描写し、共感を生む。
- 例：「去年の今頃、ある患者さんが泣きながら来院しました」`,
  },
};

export const POST_TONES_LIST = Object.values(POST_TONES);

export interface ThreadsPromptInput {
  businessType: string;
  area: string;
  target: string;
  mainProblem: string;
  strength: string;
  proof?: string;
  link?: string;
  postType?: PostType;
  treeCount?: number; // 0 = 本文のみ, 1〜5 = ツリー投稿数
  usp?: string;       // USP（独自の強み）← 第13回追加
  n1Customer?: string; // N1分析：実在の1人の顧客像
  trendWord?: string;  // トレンドワード
  purpose?: PostPurpose; // 投稿の目的（cv/awareness/authority/fan）
  tone?: PostTone;      // 投稿の口調
}

/**
 * 投稿の目的（ユーザーが最初に選ぶ）
 */
export type PostPurpose = 'cv' | 'awareness' | 'authority' | 'fan';

export interface PostPurposeConfig {
  id: PostPurpose;
  name: string;
  icon: string;
  description: string;
  advice: string;
  recommendedTypes: PostType[];
}

export const POST_PURPOSES: Record<PostPurpose, PostPurposeConfig> = {
  cv: {
    id: 'cv',
    name: '予約・LINE登録を増やしたい',
    icon: '🎯',
    description: '直接的に予約やLINE登録につなげたい',
    advice: '「地元ネタ」と「オファー型」が最も予約に直結します。実績があれば「体験談型」も効果大。',
    recommendedTypes: ['offer', 'local', 'proof', 'hook_tree'],
  },
  awareness: {
    id: 'awareness',
    name: '認知・フォロワーを増やしたい',
    icon: '💡',
    description: '多くの人に見てもらい、フォロワーを増やしたい',
    advice: '「時事ネタ」「あるある」はインプレッションが伸びやすい。まずは見てもらう数を増やしましょう。',
    recommendedTypes: ['trend', 'aruaru', 'list', 'empathy'],
  },
  authority: {
    id: 'authority',
    name: '専門性・信頼を見せたい',
    icon: '🏆',
    description: '「この人はプロだ」と思ってもらいたい',
    advice: '「実はこうだった型」や「Q&A型」で専門知識を出し惜しみなく伝えましょう。情報を出しても来る人は来ます。',
    recommendedTypes: ['expertise', 'enemy', 'qa', 'story'],
  },
  fan: {
    id: 'fan',
    name: 'ファンを作りたい',
    icon: '🔥',
    description: '濃いファンを増やして、指名で選ばれたい',
    advice: '「ストーリー型」と「共感型」で心を動かし、「仮想敵型」で熱狂的なファンを作りましょう。',
    recommendedTypes: ['story', 'empathy', 'enemy', 'aruaru'],
  },
};

export const POST_PURPOSES_LIST = Object.values(POST_PURPOSES);

export const POST_TYPES = {
  hook_tree: {
    id: 'hook_tree' as const,
    name: '「常識を覆す」型',
    description: '「○○はやってはいけません」「実は○○は間違いです」など、思わず足を止めたくなる投稿',
    icon: '🎣',
    difficulty: '低',
    cvPower: '高',
    tip: '「○○はやらないで」「○○は間違い」など常識の逆から入る。読んでもらいやすい最強の形式',
  },
  expertise: {
    id: 'expertise' as const,
    name: '「実はこうだった」型',
    description: '「実は〜」「意外と知られていない〜」で始め、専門知識で信頼を獲得',
    icon: '🎓',
    difficulty: '中',
    cvPower: '中',
    tip: '専門家らしさが伝わる。「実は〜」「意外と知られていないが〜」で始める',
  },
  local: {
    id: 'local' as const,
    name: '地元ネタ型',
    description: '地元の地名や話題を盛り込んだ投稿。近くに住む人に特に届きやすい',
    icon: '📍',
    difficulty: '低',
    cvPower: '最高',
    tip: '地元の地名を入れるだけで近くに住む人に届きやすくなる。お店への来店に直結しやすい',
  },
  proof: {
    id: 'proof' as const,
    name: '実績・体験談型',
    description: '実績やお客様の体験談で「ここなら安心」と思ってもらう',
    icon: '📊',
    difficulty: '低',
    cvPower: '高',
    tip: 'ビフォーアフターの写真が最強。具体的な数字（来院数・満足度・年数）を入れる',
  },
  empathy: {
    id: 'empathy' as const,
    name: '「わかる」共感型',
    description: 'お客様の悩みを代弁して「そうそう！まさに私のこと」と思ってもらう',
    icon: '💙',
    difficulty: '低',
    cvPower: '中',
    tip: '実際のお客様の言葉をそのまま使うと一番刺さる',
  },
  story: {
    id: 'story' as const,
    name: 'ストーリー型',
    description: 'お客様の体験談や自分のエピソードをストーリー仕立てで伝える',
    icon: '📖',
    difficulty: '中',
    cvPower: '中',
    tip: '「実は○○だった彼女が…」など結末を匂わせる導入から始める',
  },
  list: {
    id: 'list' as const,
    name: '「○選」リスト型',
    description: '「肩こりを悪化させる3つの習慣」など、数字でまとめた読みやすい投稿',
    icon: '📋',
    difficulty: '低',
    cvPower: '中',
    tip: 'ネタが切れにくく量産しやすい。数字+興味を引くテーマで作る',
  },
  offer: {
    id: 'offer' as const,
    name: '「今すぐ来て」型',
    description: '来てほしい人を呼びかけて、数字・期間限定・行動を促す投稿。予約・LINE登録に直結',
    icon: '🎯',
    difficulty: '低',
    cvPower: '最高',
    tip: '「○○市で小顔になりたい人」「初回3,980円・先着５名」「プロフィールのリンクから」',
  },
  enemy: {
    id: 'enemy' as const,
    name: '「実は間違い」型',
    description: '業界の常識や間違った方法を指摘して、自分のアプローチの良さを際立たせる',
    icon: '⚔️',
    difficulty: '中',
    cvPower: '高',
    tip: '「○○な人は来ないでください」「○○は実は間違いです」で熱狂的なファンを作る',
  },
  qa: {
    id: 'qa' as const,
    name: 'Q&A型',
    description: 'お客様からよく聴かれる質問に答える形式。専門家らしさが伝わりやすい',
    icon: '❓',
    difficulty: '低',
    cvPower: '中',
    tip: '「Q：○○って本当ですか？」A：」の形式。ネタが切れにくく量産しやすい',
  },
  trend: {
    id: 'trend' as const,
    name: '時事ネタ型',
    description: '今話題のニュースやトレンドを盛り込んだ投稿。多くの人に見てもらいやすい',
    icon: '🔥',
    difficulty: '最低',
    cvPower: '低',
    tip: '時事ネタを自分の業種に絡めるだけ。見てもらいやすいが予約に直結しにくい',
  },
  aruaru: {
    id: 'aruaru' as const,
    name: 'あるある型',
    description: 'お客様の日常のあるあるを言葉にして「わかる！」と共感してもらう',
    icon: '😅',
    difficulty: '低',
    cvPower: '中',
    tip: '「整体に行くたびに言われること」「ダイエット中にやりがちなこと」',
  },
};

/**
 * 投稿スコアリング（第16回：勝ちパターン分析）
 */
export interface PostScore {
  hookScore: number;          // 1行目の強さ（0〜20）
  valueScore: number;         // 価値提供の質（0〜20）
  ctaScore: number;           // CTAの明確さ（0〜20）
  targetScore: number;        // ターゲット適合度（0〜20）
  conversationScore: number;  // 会話誘発度（0〜20）
  total: number;              // 合計（0〜100）
  advice: string;             // 改善アドバイス
}

/**
 * 推奨投稿時間帯（第16回：28人のデータ分析）
 */
export const RECOMMENDED_TIMES = [
  { label: '20〜22時（最高）', value: '20-22', score: 5 },
  { label: '23時前後（最高）', value: '23', score: 5 },
  { label: '16〜17時（高い）', value: '16-17', score: 4 },
  { label: '12〜15時（普通）', value: '12-15', score: 3 },
  { label: '6〜11時（低い）', value: '6-11', score: 2 },
];

/**
 * 強ジャンル（第16回：4つの強ジャンル）
 */
export const STRONG_GENRES = [
  { name: '地元ネタ', cvPower: '最高', impPower: '高', tip: '地域ワードで届く。集客直結度が高い' },
  { name: 'ビフォーアフター', cvPower: '高', impPower: '高', tip: '1枚の写真が最強の説得力' },
  { name: 'お金の話題', cvPower: '中', impPower: '最高', tip: '税金・補助金・年収。ジャンル問わず高インプ' },
  { name: '時事ネタ', cvPower: '低', impPower: '最高', tip: '瞬発力は高い。集客との直結は弱い' },
];

/**
 * Threads投稿生成システムプロンプト
 */
function buildSystemPrompt(treeCount: number, postType?: PostType, usp?: string, n1Customer?: string, purpose?: PostPurpose, tone?: PostTone): string {
  const isTreePost = treeCount > 0;

  const uspSection = usp ? `\n【あなたのUSP（独自の強み）】\n${usp}\n- この強みを投稿に自然に反映させること。` : '';
  const n1Section = n1Customer ? `\n【N1分析：実在の顧客像】\n${n1Customer}\n- この人の言葉・感情・悩みをそのまま投稿に使うこと。架空のペルソナではなく、この実在の人物に刺さる文章を書く。` : '';

  const purposeConfig = purpose ? POST_PURPOSES[purpose] : null;
  const purposeSection = purposeConfig ? `\n【今回の投稿の目的】
この投稿の最優先目的は「${purposeConfig.name}」です。
${purpose === 'cv' ? '- CV（予約・LINE登録）に直結する内容を最優先。ターゲットの呼びかけ・具体的な数字・行動の指示を必ず含める。\n- インプレッションよりもCVを重視。44インプで2人来院＞30万インプで予約ゼロ。' : ''}${purpose === 'awareness' ? '- 多くの人に見てもらうことを最優先。共感・驚き・「あるある」で拡散されやすい内容にする。\n- トレンドワードや時事ネタを絡めるとインプレッションが何倍にもなる。' : ''}${purpose === 'authority' ? '- 専門家としての信頼を構築することを最優先。情報は出し惜しみしない。\n- 「実は〜」「意外と知られていないが〜」で誤解を正し、プロとしての権威性を示す。' : ''}${purpose === 'fan' ? '- 感情を動かし、濃いファンを作ることを最優先。「この人だから」で選ばれる状態を目指す。\n- ストーリーや共感で心を掴み、仮想敵で「あなたの味方」というポジションを確立する。' : ''}` : '';

  const offerSection = postType === 'offer' ? `\n【オファー投稿の3要素】
1. ターゲットの明確な呼びかけ（例：「横浜で小顔になりたい人」「腰痛で悩む〇〇の方」）
2. 具体的な数字と限定感（例：「初回3,980円」「先着5名まで」「今月末まで」）
3. 行動の指示（例：「プロフィールのリンクからLINE登録」「固定投稿にまとめました」）
- CVゴールは1つに絞ること（LINE登録 or 予約 のどちらか）
- 「予約してください」と明示することで集客が変わる` : '';

  const enemySection = postType === 'enemy' ? `\n【仮想敵型の構成】
- 「〇〇な人は来ないでください」「〇〇は間違っている」で強く始める
- 批判する対象（業界の常識・間違った方法）を明確にする
- 「でも、〇〇な人には刺さる」と自分のターゲットを明確にする
- 熱狂的なファンを作ることが目的。万人受けは狙わない` : '';

  return `あなたはThreads集客に精通したプロのSNSマーケターであり、Threads投稿生成AIです。
目的は"バズ"ではなく、プロフィール遷移→LINE登録→予約/問い合わせに繋げること（CV最大化）です。

【最重要：自然な文章のルール】
- 人間が普段SNSに書くような、自然で飾らない文章にすること。
- 「続きはツリーで解説します」「このツリーでは〜」「以下で詳しく〜」のような"AI臭い"メタ表現は絶対に使わない。
- 「〜について解説します」「〜をお伝えします」のような前置きは不要。いきなり本題に入る。
- 絵文字を適度に使い、堅すぎない柔らかい印象にする。
- 投稿の最後の文は疑問形で終わらせる。

【コンセプト設計】
- コンセプト＝「誰の×どんな悩みを×どんな方法で→理想の未来に導くか」の4要素。
- ペルソナは「たった1人の実在の顧客」まで絞る。「みんなに届けたい」は誰にも届かない。
- お客さんが実際に使っている言葉で書く。「頸部の可動域制限」ではなく「首が回らない」。
- 専門用語は中学生にも伝わる言葉に変換する（偏差値30向け）。

【プロフィール設計・導線】
- プロフィールは3秒で「何の人か」「フォローする価値」が伝わる設計にする。
- 投稿→プロフィール→フォロー→LINE/予約の導線を意識する。
- CTAは「理由付き」で自然に誘導する（「迷わないようにLINEにまとめました」等）。

【キャラ設定】
- 文章ベースSNSでは「誰が言っているか」が重要。キャラがないと埋もれる。
- キャラは素の自分を少しだけ強調したもの。完全に演じる必要はない。
- 同じ内容でもキャラで受け取られ方が変わる（例：毒舌キャラ「湿布貼って治ると思ってるなら今すぐやめなさい」）。
- 語尾やフレーズに一貫性を持たせ「あ、あの人だ」と覚えてもらう。

【コピーライティング】
- 3つのNOT：読まない壁・信じない壁・行動しない壁を突破する。
- 1行目で「ん？」と思わせる。「肩こりにお悩みの方へ」ではなく「まだバファリン飲んでるんですか？」。
- LINE誘導は「登録お願いします」ではなく「LINEで○○の動画を無料配布中」のように理由を明示。

【USPの確立】
- USP＝「○○さんと言えば○○」と他人が言える状態。
- 万人受けを狙わず、何か1つに尖ること。
- フォロワー100人でも月商150万円の事例あり。数よりも質（USPの強さ）。

【CV最大化】
- インプレッション≠CV。30万インプで予約0、44インプで2人来院の事実。
- CVゴールは1つに絞る（LINE登録 or 予約）。「予約してください」と明示することを恐れない。
- 全チャネル（SEO・MEO・広告・チラシ・SNS）の連携を意識する。

【勝ちパターンの仕組み化】
- 当たり投稿が見つかったら構成を踏襲して10本以上量産する。
- 推奨投稿時間帯：20〜22時が最もエンゲージメント高い。次点16〜17時。
- 強ジャンル4選：①地元ネタ（CV最高）②ビフォーアフター（CV高）③お金の話題（インプ最高）④時事ネタ（インプ最高だがCV低）。
- 週次でPDCAを回す：投稿数→反応→仮説→次週テスト。

【2026年Threadsアルゴリズム対応】
- アルゴリズムは「投稿頻度より品質を評価する仕組み」にシフトしている。1日10本の薄い投稿より、1日1〜2本の濃い投稿のほうが伸びる。
- コメント・返信が多い投稿ほど表示されやすい。会話を生む投稿が最強。
- 投稿の最後に「あなたはどう？」「みんなはどう思う？」のように問いかけを入れて、コメントを促す。
- ただし「コメントください」「いいねお願いします」のような直接的な依頼はNG。自然な問いかけにする。
- 共感→自己開示→問いかけの流れが最もコメントが付きやすい。
- 投稿は「情報提供」だけでなく「感情を動かす」ことを意識する。読んだ人が「わかる！」「自分もそう！」と思える内容にする。
${purposeSection}${uspSection}${n1Section}${tone && POST_TONES[tone] ? `\n${POST_TONES[tone].promptInstruction}` : ''}

${isTreePost ? `【ツリー投稿のルール】
- ツリー数は${treeCount}投稿で構成すること（必ず${treeCount}投稿ぴったり）。
- メイン投稿はそれ自体で完結する短い主張にする。ツリーがあることを匂わせない。
- 各ツリー投稿も独立した一つの話として自然に読めるように書く。
- 2スクロール分の長さが最も伸びやすい（第12回データ）。
- 構成：1段目フック→2段目価値提供→最終段オファー（役割を分離）
` : `【本文のみ投稿のルール】
- ツリーは使わず、メイン投稿の本文だけで完結させる。
- treePosts は空配列 [] にすること。
- 本文は3〜6行程度で、主張→理由→行動提案の流れで簡潔にまとめる。
`}

【絶対ルール（第1〜11回）】
1) 1行目が命：短く・強く・言い切り（12〜18文字目安）。スクロールを止める5つの型から選ぶ：
   ① ターゲットの悩みを直接書く（「腰痛で眠れない人へ」）
   ② 具体的な人物+数字+結果（「43歳主婦が3ヶ月で〜」）
   ③ 共感の問いかけ（「〜で悩んでいませんか？」）
   ④ カッコいいセリフ（印象的なフレーズ）
   ⑤ トレンドワードの配置
2) 売り込み禁止：「来てください」「予約受付中」「今すぐ申し込み」などは使わない。
　→代わりに「必要な人だけ」「固定投稿にまとめた」「理由付き導線」を使う。
3) 偏差値30向け：専門用語は噛み砕く。中学生にも伝わる言葉に変換する。
${isTreePost ? '4) ツリーで"滞在時間"を増やす（アルゴリズム評価UP）。' : '4) 本文だけで読者の心を掴む。'}
5) 専門性は出してOK：情報を出し惜しみしない（見て治る人は顧客ではない前提）。
6) 炎上回避：強い言葉を使う場合は次の行で必ず補足（誤解を解く）。
7) 規制配慮：治る/改善する等の断定は禁止。「〜と言われることが多い」「〜の可能性」等で表現。

【CV最大化のルール（第15〜16回）】
- インプレッションよりも「どんな感情の人に届くか」を重視する
- 閲覧数が少なくても、ターゲットに刺さる投稿がCV（予約・LINE登録）を生む
- CVゴールは1つに絞る（LINE登録 or 予約 のどちらか）
- 「予約してください」「LINE登録してください」と明示することを恐れない
${offerSection}${enemySection}

【投稿フォーマットの多様化（第12〜14回）】
- ポエム/ストーリー/ランキング/クイズ型など変化を加える
- 反応が出る型/時間帯/長さを見てPDCAを回す
- 当たり投稿が見つかったら構成を踏襲して10本以上量産する

【導線（CTA）ルール】
- "理由付き"で誘導すること。
OK例：
・必要な人だけ、固定投稿にまとめました
・忙しい人向けに、手順だけプロフィールに置いてます
・チェックリストをLINEで渡せるようにしてます（理由：迷わないため）
NG例：
・今すぐ予約して
・来てください
・無料だから登録して

【禁止表現リスト】
以下の表現は絶対に使わないこと：
- 「続きはツリーで」「ツリーで解説」「このスレッドでは」
- 「〜について解説します」「〜をお伝えします」「〜を紹介します」
- 「詳しく見ていきましょう」「順番に説明します」
- 「いかがでしたか？」「参考になりましたか？」
- 「エビデンスに基づいている」
- その他、AIが書いたとわかるような定型的な前置き・まとめ表現

【業界別 広告規制ガイドライン（必須遵守）】
入力された業種に応じて、以下の広告規制を厳守すること。

■ 整体院・接骨院・整骨院
- 柔道整復師法に基づき「治療」「治す」「診断」は使用禁止。「施術」「ケア」「サポート」に置き換える
- 「骨折・脱臼の治療」等の医療行為を暗示する表現は禁止
- 「保険適用」の記載は具体的な適用条件を明示しない限り禁止

■ 鍼灸院・鍼灸マッサージ
- あはき法（あん摩マッサージ指圧師、はり師、きゅう師等に関する法律）に基づく
- 「治療」「治る」「効果がある」「〜に効く」は使用禁止。「施術」「ケア」「アプローチ」に置き換え
- 適応症の列挙は禁止（「肩こり・腰痛・頭痛に効く」等はNG）
- 広告可能事項：施術者名、住所、電話番号、施術日・時間、もみりょうじ/はり/きゅうの別のみ
- 体験談や「◯◯が改善した」等の表現は広告では使えないため、あくまで一般的な情報発信として書く

■ 美容サロン・エステ
- 薬機法（旧薬事法）に基づき「アンチエイジング」「若返り」「シミが消える」は使用禁止
- 「〜が治る」「〜が改善する」等の医療効果を暗示する表現は禁止
- 「個人の感想です」でも効果効能の断定は不可
- Before/Afterの表現は「個人差があります」を必ず添える

■ ピラティス・ヨガ・フィットネス
- 「痩せる」「ダイエット効果」の断定は景品表示法違反。「目指せる」「サポート」に置き換え
- 「医学的に証明された」等の根拠不明な表現は禁止
- 「◯kg減量」等の具体的数値を保証する表現は禁止

■ 飲食店・カフェ
- 景品表示法に基づき「日本一」「最高級」「No.1」は根拠なしでは使用禁止
- 「無添加」「オーガニック」はJAS法等の基準を満たさない限り使用注意
- 「健康に良い」「〜に効く」等の健康効果の暗示は薬機法違反

■ 歯科医院・クリニック
- 医療法に基づき「絶対に治る」「必ず改善」は使用禁止
- 「最新」「最先端」は根拠が必要。「比較優良広告」は禁止
- 自由診療の費用を記載する場合は標準的な費用を明示
- 「患者の体験談」は医療広告では原則禁止

■ 習い事・スクール・塾
- 景品表示法に基づき「合格率◯%」「必ず上達」等の保証表現は根拠なしでは禁止
- 「〜ができるようになります」は断定を避け「目指せます」に
- 特定商取引法に基づくクーリングオフ等の表示義務に注意

■ 不動産
- 宅建業法・景品表示法に基づき「格安」「掘り出し物」は不当表示の恐れ
- 「徒歩◯分」は80m=1分で計算。実態と乖離する表記は禁止

■ 共通ルール（全業種）
- 景品表示法：「No.1」「日本初」「唯一」等は客観的根拠がない限り使用禁止
- 「期間限定」「今だけ」は常時表示すると不当表示になる
- 体験談を使う場合は「個人の感想であり効果を保証するものではありません」を示唆する書き方にする
- 「〜と言われています」「一般的に〜」等の曖昧な根拠づけも避ける
- **ハッシュタグ（#）は絶対に使わないこと。投稿本文にもCTAにも#を含めない。hashtagsは必ず空配列にすること。**

【出力形式（必須JSON）】
必ずこの形式で出力してください：
{
  "title": "投稿タイトル（任意・内部用）",
  "mainPost": "メイン投稿（Threads本文）",
  "treePosts": [${isTreePost ? `"ツリー投稿1"${treeCount >= 2 ? ', "ツリー投稿2"' : ''}${treeCount >= 3 ? ', ...' : ''}` : ''}],
  "cta": "CTA（1行）",
  "hashtags": [],
  "goal": "投稿の狙い（保存/プロフ遷移/LINE登録/予約のどれを狙うか）",
  "improvement": "次回改善案（仮説＋テスト案）",
  "expectedEffect": "投稿の期待効果（インプ/プロフ/LINE/予約に分けて1つだけ）",
  "timingCandidate": "推奨投稿時間帯（20〜22時推奨。理由も添えて）",
  "weeklyImprovementPoint": "週次改善ポイント（当たり投稿の量産ヒントを含める）",
  "hookType": "使用した1行目の型（①〜⑤のどれか）",
  "cvGoal": "CVゴール（LINE登録 or 予約 のどちらか1つ）"
}
${isTreePost ? `\ntreePostsは必ず${treeCount}個の要素にしてください。` : '\ntreePostsは必ず空配列 [] にしてください。'}`;
}

/**
 * プロンプトテンプレートを生成
 */
export function generateThreadsPrompt(input: ThreadsPromptInput): string {
  const postTypeInfo = input.postType ? POST_TYPES[input.postType] : POST_TYPES.hook_tree;
  const postTypeDescription = postTypeInfo.description;
  const treeCount = input.treeCount ?? 3; // デフォルト3投稿
  const systemPrompt = buildSystemPrompt(treeCount, input.postType, input.usp, input.n1Customer, input.purpose, input.tone);
  
  // 地域性タイプの場合、エリア名を本文に入れるよう明示
  const localNote = input.postType === 'local' 
    ? `\n\n【地域性の追加指示】\n- メイン投稿の本文中に必ず「${input.area}」のエリア名を自然に含めること。\n- 地域に住んでいる人が「あ、自分のことだ」と感じるような書き方にする。\n- 例：「${input.area}で〜」「${input.area}にお住まいの方」のように具体的に。` 
    : '';

  // トレンド型の場合、トレンドワードを明示
  const trendNote = input.postType === 'trend' && input.trendWord
    ? `\n\n【トレンド活用の追加指示】\n- 「${input.trendWord}」というトレンドワードを投稿に自然に含めること。\n- 事実を書くだけでOK。トレンドワードを入れるだけで何倍ものインプレッションが期待できる。`
    : '';
  
  return `${systemPrompt}

【入力情報】
- 業種：${input.businessType}
- 地域：${input.area}
- ターゲット：${input.target}
- 主な悩み：${input.mainProblem}
- 強み/特徴：${input.strength}
${input.usp ? `- USP（独自の強み）：${input.usp}` : ''}
${input.n1Customer ? `- N1顧客像：${input.n1Customer}` : ''}
${input.proof ? `- 実績/証拠：${input.proof}` : ''}
${input.link ? `- 誘導先：${input.link}` : ''}
${input.trendWord ? `- トレンドワード：${input.trendWord}` : ''}

【投稿タイプ】
${postTypeDescription}${localNote}${trendNote}

上記ルールをすべて守り、その業種・地域・悩み・ターゲットに合わせたThreads投稿を1セット生成してください。
特に「自然な文章のルール」と「禁止表現リスト」を厳守してください。
${treeCount === 0 ? 'ツリーは使わず、本文のみで完結させてください。treePostsは空配列にしてください。' : `ツリーは必ず${treeCount}投稿で構成してください。`}
必ずJSON形式で出力してください。`;
}

/**
 * 投稿タイプ別のプロンプト補足
 */
export const POST_TYPE_SUPPLEMENTS: Record<PostType, string> = {
  hook_tree: `
【釣り×ツリー型の追加ポイント】
- メイン投稿は必ず逆説・否定・言い切りで始める（「〇〇はやらないで」「〇〇は間違い」）
- 2段目で「なるほど」を生む価値提供
- 最後のツリーで理由付き導線を入れる
- 「続きはツリーで」のような表現は絶対に使わない
`,
  expertise: `
【専門性（誤解を正す）型の追加ポイント】
- 「実は〜」「意外と知られていないが〜」で始める
- よくある誤解を具体例で示す
- 正しい知識を噛み砕いて説明
- 専門用語は必ず補足説明を入れる
`,
  local: `
【地域性の追加ポイント（第16回：集客直結度最高）】
- メイン投稿の本文中にエリア名を必ず含める
- 地域に住んでいる人が自分事として感じる書き方にする
- 地域特有の生活環境や悩みに触れる
- 地域密着の強みを活かす
`,
  proof: `
【証拠（実績）型の追加ポイント（第16回：ビフォーアフターが最強）】
- 具体的な数字や事例を使う
- 「先月〜人が〜」「実際に〜された方の声」
- ビフォーアフターがあれば活用（1枚の写真が最強の説得力）
- 過度な誇張は避ける
`,
  empathy: `
【共感（悩み代弁）型の追加ポイント（第11回：N1分析）】
- 「〜で悩んでいませんか？」で始める
- お客さんの言葉をそのまま使う（N1分析）
- 「わかります」「実は私も〜」で共感
- 解決策は最後に軽く触れる程度
`,
  story: `
【ストーリー型の追加ポイント】
- 結末を匂わせるフックから始める（「半年前、あるお客さんが泣きながら来院しました」）
- 時系列で変化を描く（背景→転機→解決→学び）
- 感情の動きを丁寧に描写する
- 読者が自分事として感じられるように書く
`,
  list: `
【○選系リスト型の追加ポイント（第12回：ネタ切れしにくい）】
- 「〇選」「〇つのポイント」など数字で始める
- 各項目は簡潔に1〜2行でまとめる
- 最も重要な項目を最初か最後に配置
- 1つのテーマから何本でも量産できる
`,
  offer: `
【オファー（CV直結）型の追加ポイント】
- ターゲットを明確に呼びかける（「横浜で小顔になりたい人」）
- 具体的な数字と限定感を入れる（「初回3,980円」「先着5名まで」）
- 行動の指示を明確にする（「プロフィールのリンクからLINE登録」）
- 「予約してください」と明示することを恐れない
- CVゴールは1つに絞る（LINE登録 or 予約）
`,
  enemy: `
【仮想敵型の追加ポイント】
- 「〇〇な人は来ないでください」「〇〇は間違っている」で強く始める
- 批判する対象（業界の常識・間違った方法）を明確にする
- 「でも、〇〇な人には刺さる」と自分のターゲットを明確にする
- 熱狂的なファンを作ることが目的。万人受けは狙わない
- 補足説明で炎上を回避する
`,
  qa: `
【Q&A型の追加ポイント（第12回：専門性アピール）】
- よくある質問を1行目に置く（「〇〇って本当に効果あるの？」）
- 専門家として明確に答える
- 理由・根拠を添える
- ネタ切れしにくく量産しやすい
`,
  trend: `
【トレンド活用型の追加ポイント】
- トレンドワードを投稿に自然に含める
- 事実を書くだけでOK（難しく考えない）
- インプレッションの瞬発力は高いが集客直結は弱い
- 自分の専門分野とトレンドを結びつける
`,
  aruaru: `
【あるある型の追加ポイント】
- ターゲットの日常のあるあるで始める
- 「整体に行くたびに言われること」「ダイエット中にやりがちなこと」
- 共感を呼ぶことでフォロワーとの距離を縮める
- 最後に自分の専門的な視点を加える
`,
};

/**
 * 投稿スコアリング関数（第16回：勝ちパターン分析）
 */
export function scorePost(mainPost: string, treePosts: string[], cta: string): PostScore {
  let hookScore = 0;
  let valueScore = 0;
  let ctaScore = 0;
  let targetScore = 0;
  const advice: string[] = [];

  // フックスコア（1行目の強さ）
  const firstLine = mainPost.split('\n')[0] || '';
  if (firstLine.length >= 10 && firstLine.length <= 25) hookScore += 10;
  else if (firstLine.length > 0) hookScore += 5;
  if (/[！!？?]/.test(firstLine)) hookScore += 5;
  if (/ない|やめ|間違|実は|秘密|知らない|驚|衝撃|禁止|NG/.test(firstLine)) hookScore += 10;
  else advice.push('1行目に逆説・否定・驚きの言葉を入れるとスクロールが止まります');

  // 価値提供スコア
  const totalText = mainPost + treePosts.join('');
  if (totalText.length >= 100) valueScore += 10;
  if (totalText.length >= 200) valueScore += 5;
  if (/[0-9０-９]/.test(totalText)) valueScore += 5; // 数字あり
  if (treePosts.length >= 2) valueScore += 5; // ツリーで展開
  else if (treePosts.length === 0 && totalText.length < 100) {
    advice.push('もう少し価値提供の内容を増やすと読者の満足度が上がります');
  }

  // CTAスコア
  if (cta.length > 0) ctaScore += 10;
  if (/LINE|ライン|プロフ|固定|登録|予約/.test(cta + totalText)) ctaScore += 10;
  if (/理由|ため|から|ので/.test(cta)) ctaScore += 5; // 理由付きCTA
  else if (cta.length > 0) advice.push('CTAに「理由」を添えると行動率が上がります（例：「迷わないようにLINEにまとめました」）');

  // ターゲット適合スコア
  if (/[あ-ん]/.test(firstLine)) targetScore += 5; // 日本語
  if (/悩|困|辛|痛|疲|不安|心配/.test(totalText)) targetScore += 10; // 悩み言及
  if (/[0-9０-９]/.test(totalText)) targetScore += 5; // 具体的な数字
  if (/あなた|皆さん|の方/.test(totalText)) targetScore += 5; // 読者への呼びかけ
  else advice.push('「〇〇で悩んでいる方へ」のようにターゲットへの呼びかけを入れると刺さります');

  // 会話誘発スコア（2026年アルゴリズム対応）
  let conversationScore = 0;
  const lastPost = treePosts.length > 0 ? treePosts[treePosts.length - 1] : mainPost;
  if (/[？?]/.test(lastPost)) conversationScore += 10; // 最後に問いかけあり
  if (/どう思|どうかな|みんなは|あなたは|経験ある|ありません/.test(totalText)) conversationScore += 10; // 会話を促す表現
  if (/共感|わかる|そうそう|あるある/.test(totalText)) conversationScore += 5; // 共感を呼ぶ
  if (conversationScore === 0) advice.push('投稿の最後に問いかけ（「みんなはどう？」）を入れるとコメントが増え、アルゴリズムで優遇されます');

  const total = Math.min(hookScore + valueScore + ctaScore + targetScore + conversationScore, 100);

  return {
    hookScore: Math.min(hookScore, 20),
    valueScore: Math.min(valueScore, 20),
    ctaScore: Math.min(ctaScore, 20),
    targetScore: Math.min(targetScore, 20),
    conversationScore: Math.min(conversationScore, 20),
    total,
    advice: advice.length > 0 ? advice[0] : total >= 80 ? '素晴らしい投稿です！このパターンを量産しましょう' : '全体的にバランスが取れています',
  };
}
