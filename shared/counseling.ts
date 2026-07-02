/**
 * AIカウンセリング機能 — ユーザから「事実」を引き出して
 * AI投稿生成の捏造を防ぐための前段プロセス。
 *
 * フロー:
 *   1. プロジェクト作成後、/ai-counseling/:projectId へ誘導
 *   2. 全13問にチャット形式で答える（選択肢・例文・候補チップで答えやすく）
 *   3. 結果がprojects.counselingResult (JSON) に保存される
 *   4. AI生成時、必ずこのカウンセリング結果を最優先プロンプトに差し込む
 */

import type { PostType } from './threadsPrompts';

/**
 * カウンセリング1問あたりの定義
 */
export interface CounselingQuestion {
  id: keyof CounselingAnswers;
  prompt: string;          // ユーザに表示する質問本文
  helper?: string;         // 補足ヘルプ（プレースホルダ等）
  required: boolean;       // 必須かどうか
  /** 入力UIの種類 */
  ui: 'textarea' | 'multiline-list' | 'choice' | 'multi-choice';
  /** ui が 'choice' / 'multi-choice' のときの選択肢 */
  choices?: { value: string; label: string; description?: string }[];
  /**
   * textarea / multiline-list 用の候補チップ。タップで自動挿入。
   * ユーザに「こういう答えでOK」のヒントになり、空欄で詰まるのを防ぐ。
   */
  suggestions?: string[];
  /** 例文（プレースホルダの上に小さく表示） */
  examples?: string[];
  /** 「なし/思いつかない」をワンタップで答えられるようにするか */
  allowEmptyShortcut?: boolean;
}

/**
 * 回答収集の生データ（自由記入文字列 or 選択値）
 */
export interface CounselingAnswers {
  // ── 基本情報（最初に聞く。プロジェクト作成に使う）──
  storeNameRaw: string;       // 店名・屋号（任意）
  businessTypeRaw: string;    // 業種
  areaRaw: string;            // 地域（市区町村・町名）
  targetRaw: string;          // ターゲット
  mainProblemRaw: string;     // 主な悩み
  strengthRaw: string;        // 強み・特徴
  // ── 深掘り ──
  brandVoiceRaw: string;
  uspRaw: string;
  menuRaw: string;                 // 主なメニュー・コース（実在のサービスだけ投稿に使う）
  hoursInfoRaw: string;            // 営業時間・定休日・予約方法（固定投稿/Q&A/CTAの事実素材）
  realProofsRaw: string;
  realEpisodesRaw: string;
  benefitsDailyRaw: string;        // 来店後の「日常の変化」（ベネフィット変換の素材）
  ctaAssetsRaw: string;
  faqRaw: string;                  // よく聞かれる質問・来店前の不安（Q&A型の素材）
  industryMythsRaw: string;        // 業界で「これは違う」/昔の自分の失敗（仮想敵・常識を覆す型の素材）
  originStoryRaw: string;          // 原体験・なぜこの仕事を始めたか（理念/Why me型の素材）
  ngListRaw: string;
  preferredTypesRaw: string;       // CSV ("local,proof,empathy")
  useThreadsKnowhow: 'on' | 'off';
}

/**
 * AI抽出後の構造化結果（プロンプトに差し込まれる）
 */
export interface CounselingResult {
  brandVoice: string;
  menu: string[];
  hoursInfo: string[];
  realProofs: string[];
  realEpisodes: string[];
  benefitsDaily: string[];
  ctaAssets: string[];
  faq: string[];
  industryMyths: string[];
  originStory: string;
  ngList: string[];
  preferredTypes: PostType[];
  useThreadsKnowhow: boolean;
  freeFormSummary: string;
  counseledAt: number;
  rawAnswers: Partial<CounselingAnswers>;
}

/**
 * カウンセリング質問の固定リスト（MVP）
 *
 * 設計方針:
 *  - できるだけ「選ぶ」だけで進められるように choice / suggestions を多用
 *  - 自由記入が必要な箇所は例文と候補チップを必ず添える
 *  - 「なし」を1タップで返せる allowEmptyShortcut を捏造防止に活用
 */
export const COUNSELING_QUESTIONS: CounselingQuestion[] = [
  // ══════════════ 基本情報（最初に聞く。これでプロジェクトを作成）══════════════
  {
    id: 'businessTypeRaw',
    prompt:
      'はじめに、お店のことを少し教えてください。\n\nどんな業種ですか？',
    helper: '近いものをタップ。違う場合は自由に入力してOK。',
    required: true,
    ui: 'textarea',
    suggestions: [
      '整体院', '整骨院・接骨院', '鍼灸院', 'カイロプラクティック',
      '美容サロン（エステ）', 'リラクゼーション・もみほぐし',
      '小顔・美容矯正', 'パーソナルジム', 'ヨガ・ピラティス',
    ],
    examples: ['例：「産後ケア専門の整体院」「女性専用の小顔矯正サロン」'],
  },
  {
    id: 'areaRaw',
    prompt:
      'お店がある場所を、できるだけ詳しく教えてください。\n（市区町村だけでなく町名まで入れると、地元の人に届きやすくなります）',
    helper: '例のように町名まで入れるのがおすすめ。後から地図で最寄り駅も追加できます。',
    required: true,
    ui: 'textarea',
    examples: ['例：「岡山県岡山市北区下中野」「東京都渋谷区道玄坂」'],
  },
  {
    id: 'storeNameRaw',
    prompt:
      'お店の名前（屋号）を教えてください。\n※ 後から変更できます。決まっていなければ「なし」でOK。',
    helper: '自己紹介・固定投稿などで使います。',
    required: false,
    ui: 'textarea',
    examples: ['例：「○○整体院」「サロン○○」'],
    allowEmptyShortcut: true,
  },
  {
    id: 'targetRaw',
    prompt:
      '一番来てほしいのは、どんなお客さんですか？\n（年代・性別・状況など、思い浮かぶ1人を具体的に）',
    helper: '近いものをタップ→具体的に足してください。',
    required: true,
    ui: 'textarea',
    suggestions: [
      '30〜50代の女性', '40〜60代の男性', '産後のママ', 'デスクワークの会社員',
      '高齢で体の不調がある方', 'スポーツをする学生・社会人', '美容・見た目を気にする女性',
    ],
    examples: ['例：「デスクワークで慢性的な肩こり・腰痛に悩む30〜50代の女性」'],
  },
  {
    id: 'mainProblemRaw',
    prompt:
      'そのお客さんは、どんなことで困っていますか？（主な悩み）',
    helper: '具体的なほどAIが刺さる投稿を作れます。',
    required: true,
    ui: 'textarea',
    suggestions: [
      '慢性的な肩こり', '繰り返す腰痛', '頭痛', '産後の骨盤の歪み',
      '猫背・姿勢', '膝の痛み', '自律神経の乱れ・不眠', '冷え・むくみ',
    ],
    examples: ['例：「何度マッサージしてもすぐ戻る肩こり、朝起きた時の腰の痛み」'],
  },
  {
    id: 'strengthRaw',
    prompt:
      '他のお店ではなく「あなたのお店」を選ぶ理由・強みは何ですか？',
    helper: '技術・人柄・立地・営業時間・設備など何でもOK。',
    required: true,
    ui: 'textarea',
    suggestions: [
      '国家資格者による施術', '根本改善にこだわる', '完全予約制でゆったり',
      '駅近・通いやすい', '女性専用で安心', '夜遅くまで営業', '専門特化（〇〇専門）',
    ],
    examples: ['例：「国家資格者による根本改善施術。完全予約制で夜20時まで営業」'],
  },

  // ────────────────────── Q1. 口調 ──────────────────────
  {
    id: 'brandVoiceRaw',
    prompt:
      'まず「いつもの話し方」を教えてください。\nお客さんに普段どんな口調で話していますか？',
    helper: '近いものをタップ。複数を組み合わせて自由に追加してもOK。',
    required: true,
    ui: 'textarea',
    suggestions: [
      '丁寧な敬語＋少しフレンドリー',
      'ですます調できちんと',
      'フランクでタメ口寄り',
      '専門家っぽく落ち着いた口調',
      '元気で明るく親しみやすい',
      '関西弁/方言を混ぜる',
      '少し毒舌・はっきり言うタイプ',
    ],
    examples: [
      '例：「○○さん、最近肩はどうですか？前より動かしやすくなったって聞いて嬉しかったです」',
      '例：「正直、湿布貼ってるだけじゃ良くならんよ。原因はそこじゃないから」',
    ],
  },

  // ────────────────────── Q2. USP ──────────────────────
  {
    id: 'uspRaw',
    prompt:
      '他のお店ではなく「あなた」を選ぶ理由を、3秒で言うとしたら何ですか？\n技術・人柄・場所・価格・サービス、なんでもOKです。',
    helper: '近い軸をタップ→具体例を1〜2文足してください。',
    required: true,
    ui: 'textarea',
    suggestions: [
      '技術力・経験年数の長さ',
      '駅近・通いやすい立地',
      '完全予約制でゆったり',
      '女性専用/男性専用などの安心感',
      '価格の安さ・コスパ',
      '夜遅く/早朝など営業時間の柔軟さ',
      '専門特化（〇〇専門）',
      '他にない併設サービス',
    ],
    examples: [
      '例：「整体院だけど栄養指導までセットで見てくれるのは市内でうちだけ」',
      '例：「20時まで開いてる小顔矯正サロンは駅周辺でうちしかない」',
    ],
  },

  // ────────────────── Q3. 主なメニュー(menu) ──────────────────
  {
    id: 'menuRaw',
    prompt:
      '実際に提供している「主なメニュー・コース」を教えてください。\n\nここで挙げたものだけを AI は施術内容として投稿に使います（やっていないメニューを勝手に作りません）。',
    helper: '近いものをタップ→自院の呼び方に直してください。なければ「なし」でOK。',
    required: true,
    ui: 'multiline-list',
    suggestions: [
      '骨盤矯正',
      '猫背・姿勢改善',
      '産後骨盤矯正',
      '肩こり/頭痛専門コース',
      '腰痛集中ケア',
      '小顔矯正',
      'スポーツ整体・コンディショニング',
      '自律神経・睡眠ケア',
      '鍼灸',
      'もみほぐし/リラクゼーション',
    ],
    examples: [
      '例：「産後骨盤矯正コース」「猫背改善プログラム（全8回）」「肩こり頭痛専門コース」',
    ],
    allowEmptyShortcut: true,
  },

  // ──────────── Q3.5 営業時間・定休日・予約方法(hoursInfo) ────────────
  {
    id: 'hoursInfoRaw',
    prompt:
      '営業時間・定休日・予約方法を教えてください。\n\n固定投稿やQ&A、投稿の締めの案内で「事実として」使います（ここに書いていない時間・予約方法をAIが勝手に書くことはありません）。',
    helper: '近いものをタップ→自店の内容に直してください。書きたくない場合は「なし」でOK。',
    required: true,
    ui: 'multiline-list',
    suggestions: [
      '平日 9:00〜20:00',
      '土日祝も営業',
      '定休日：日曜',
      '定休日：不定休',
      '完全予約制',
      '当日予約OK',
      'LINEで予約できます',
      '電話・Webから予約できます',
      '駐車場あり',
    ],
    examples: [
      '例：「平日9時〜20時／土曜は17時まで」「定休日：日曜・祝日」「LINEか電話で予約（当日OK）」',
    ],
    allowEmptyShortcut: true,
  },

  // ────────────────── Q4. 実績(realProofs) ──────────────────
  {
    id: 'realProofsRaw',
    prompt:
      '★最重要：数字で出せる「実績」を、思いつくだけ書いてください。\n\nここで書いたものだけを AI は実績として使います。書いていない数字を AI が勝手に作ることはありません。',
    helper:
      'よくある実績カテゴリをタップ→数字を入れて完成させてください。なければ「なし」でOK（その場合 AI は数字を出さない投稿を作ります）。',
    required: true,
    ui: 'multiline-list',
    suggestions: [
      '営業〇年',
      'のべ担当〇〇〇〇名',
      'Google口コミ★4.〇',
      'リピート率〇%',
      '〇〇県内〇位',
      'メディア掲載：〇〇',
      '資格：〇〇認定',
      'スポーツ選手担当歴あり',
      '受賞歴：〇〇賞',
    ],
    examples: [
      '例：「12年営業」「のべ4000名担当」「Google口コミ4.8」',
      '例：「某Jリーガー担当歴あり」「テレビ〇〇局で紹介」',
    ],
    allowEmptyShortcut: true,
  },

  // ──────────────── Q5. 顧客エピソード(realEpisodes) ────────────────
  {
    id: 'realEpisodesRaw',
    prompt:
      '実際にあった「印象的なお客様のエピソード」を、思い出せる範囲で書いてください。\n\nここで書いたエピソードだけを AI はストーリー型投稿で使います。書いていない架空の患者さんを AI が作ることはありません。',
    helper:
      '「誰が／どんな悩みで／どう変わったか」の3点を1セットで。個人名は仮名でOK。思いつかない/書きたくない場合は「なし」を押してください。',
    required: true,
    ui: 'multiline-list',
    suggestions: [
      '40代女性／長年の腰痛／旅行に行けるようになった',
      '50代男性／五十肩／趣味のゴルフが再開できた',
      '30代主婦／産後の不調／抱っこが痛くなくなった',
      '高校生／部活復帰／3週間でグラウンドに戻れた',
      '60代女性／膝の痛み／孫を抱けるようになった',
    ],
    examples: [
      '例：「田中さん（仮名・50代女性）。半年通って孫を抱けるようになった。本人が泣いて喜んでくれた」',
    ],
    allowEmptyShortcut: true,
  },

  // ──────────────── Q6. 来店後の変化(benefitsDaily) ────────────────
  {
    id: 'benefitsDailyRaw',
    prompt:
      '施術・サービスのあと、お客さんの「毎日の生活」はどう変わりますか？\n\nできるだけ具体的な“場面”で書いてください（症状名より、生活シーンの方が刺さります）。',
    helper: '近いものをタップ→自院のお客さん像に合わせて直してください。なければ「なし」でOK。',
    required: false,
    ui: 'multiline-list',
    suggestions: [
      '朝、痛みでこわばらずスッと起き上がれる',
      '子どもを抱っこ／一緒に走れる',
      '長時間のデスクワークが楽になる',
      '趣味（ゴルフ・登山など）を再開できた',
      '靴下を立ったまま履ける',
      '夜ぐっすり眠れて朝スッキリ',
      '旅行や外出が怖くなくなる',
      '猫背が直って写真うつりが良くなる',
    ],
    examples: [
      '例：「朝起きた瞬間の腰の痛みがなくなって、二度寝しなくなった」「子どもと公園で全力で走れるようになった」',
    ],
    allowEmptyShortcut: true,
  },

  // ──────────────── Q7. CTA特典(ctaAssets) ────────────────
  {
    id: 'ctaAssetsRaw',
    prompt:
      'LINE登録時に渡せるもの・無料相談・冊子など、「実際に提供できる特典」はありますか？\n\nここで書いたものだけを AI は CTA で約束します。',
    helper: '近いものをタップ→具体名を埋めてください。何もなければ「なし」でOK。',
    required: true,
    ui: 'multiline-list',
    suggestions: [
      'LINE登録で〇〇を無料配布（PDF/動画/音声）',
      '初回〇〇分カウンセリング無料',
      'セルフケア動画〇本プレゼント',
      'チェックリストPDF配布',
      '初回限定割引',
      'お試し体験〇〇円',
    ],
    examples: [
      '例：「LINE登録で姿勢セルフチェック動画3本」',
      '例：「初回30分カウンセリング無料」',
    ],
    allowEmptyShortcut: true,
  },

  // ──────────────── Q8. よくある質問(faq) ────────────────
  {
    id: 'faqRaw',
    prompt:
      'お客さんから「よく聞かれる質問」や「来店前に不安に思われること」を、思いつくだけ挙げてください。\n\nここで挙げた質問を AI が Q&A型・不安解消の投稿ネタにします。',
    helper: '近いものをタップ→自院でよく聞かれる内容に直してください。なければ「なし」でOK。',
    required: false,
    ui: 'multiline-list',
    suggestions: [
      '痛い施術ですか？',
      '何回くらい通えば良くなりますか？',
      '保険は使えますか？',
      '服装・着替えは必要ですか？',
      '子ども連れでも大丈夫ですか？',
      '予約は必要ですか？当日でもOK？',
      '妊娠中／産後すぐでも受けられますか？',
      'どんな支払い方法がありますか？',
      '他院と何が違うんですか？',
    ],
    examples: [
      '例：「ボキボキされるか不安」「何回で良くなる？」「子連れOK？」「保険きく？」',
    ],
    allowEmptyShortcut: true,
  },

  // ──────────────── Q9. 業界の常識・失敗(industryMyths) ────────────────
  {
    id: 'industryMythsRaw',
    prompt:
      'この業界で「これは違う」と感じていること、または昔のあなた自身がやっていた失敗・遠回りがあれば教えてください。\n\n「常識を覆す型」「仮想敵型」の強いネタになります。',
    helper: '近いものをタップ→自分の考えに直してください。なければ「なし」でOK。',
    required: false,
    ui: 'multiline-list',
    suggestions: [
      '回数券をたくさん売るだけのお店が多い',
      'その場だけ気持ちいい“揉みほぐし”では根本改善しない',
      '「とりあえず安静」はかえって長引くことがある',
      '湿布や痛み止めで“ごまかす”だけになりがち',
      '痛い施術ほど効く、は誤解だと思う',
      '昔は技術さえあれば人は来ると思っていた（来なかった）',
      '昔は何でも「とりあえず様子見」と言ってしまっていた',
    ],
    examples: [
      '例：「回数券を売るだけの整体が多いと思う」「昔の自分は“揉めば治る”と思っていた」',
    ],
    allowEmptyShortcut: true,
  },

  // ──────────────── Q10. 原体験・理念(originStory) ────────────────
  {
    id: 'originStoryRaw',
    prompt:
      'なぜこの仕事を始めたのですか？ きっかけになった出来事や、大切にしている想いを教えてください。\n\n「理念・Why me型」の投稿で、あなたにしか書けないストーリーになります。',
    helper: '近いものをタップ→あなたの言葉に直してください。なければ「なし」でOK。',
    required: false,
    ui: 'textarea',
    suggestions: [
      '自分や家族のケガ・不調がきっかけ',
      '前職（病院/サロン等）で「もっとこうしたい」と感じた',
      '恩師・師匠との出会い',
      'お客さんの「人生が変わった」の一言が忘れられない',
      '地元に貢献したい気持ちから',
      'スポーツでの経験を活かしたい',
    ],
    examples: [
      '例：「自分が腰を痛めて何院も回って治らず、最後に救われた経験から、同じ人を助けたくて開業しました」',
    ],
    allowEmptyShortcut: true,
  },

  // ──────────────── Q11. NGリスト(ngList) ────────────────
  {
    id: 'ngListRaw',
    prompt:
      '★重要：「絶対に書きたくない・嘘になるから書けないこと」を書いてください。\nここに書いたことを AI は絶対に投稿に入れません。',
    helper: '業界でよくある NG をタップ→必要なら自分の言葉で追加してください。',
    required: false,
    ui: 'multiline-list',
    suggestions: [
      '「治る」「効く」など断定表現は使わない（薬機法/あはき法）',
      '「先着〇名」のような捏造はしない',
      '「予約パンパン」「キャンセル待ち」など事実でない盛り表現はしない',
      'お客様の顔写真は載せない方針',
      '業界批判・他店批判はしない',
      '〇〇円という具体的な料金は載せない',
      '個人名は出さない（仮名のみ）',
      '医療行為を暗示する表現は使わない',
    ],
    examples: [
      '例：「治る・改善するは薬機法でNG」「他店をディスらない」',
    ],
    allowEmptyShortcut: true,
  },

  // ──────────────── Q12. 好み投稿タイプ ────────────────
  {
    id: 'preferredTypesRaw',
    prompt:
      'よく作りたい投稿のスタイルを選んでください（複数選択OK・後から変更できます）。',
    helper: '迷ったら「地元ネタ＋実績」が集客に直結しやすいです。',
    required: false,
    ui: 'multi-choice',
    choices: [
      { value: 'local', label: '📍 地元ネタ型', description: '地域名+症状で集客直結（おすすめ）' },
      { value: 'proof', label: '📊 実績・体験談型', description: '数字や事例で信頼を作る（おすすめ）' },
      { value: 'empathy', label: '💙 共感型', description: '悩みを代弁して刺す' },
      { value: 'story', label: '📖 ストーリー型', description: '実話を語って心を動かす' },
      { value: 'expertise', label: '🎓 専門性型', description: '「実は〜」で誤解を正す' },
      { value: 'qa', label: '❓ Q&A型', description: 'よくある質問に答える（量産しやすい）' },
      { value: 'hook_tree', label: '🎣 常識を覆す型', description: '逆説で足を止める' },
      { value: 'list', label: '📋 〇選リスト型', description: '「3つの〜」で読みやすく' },
      { value: 'aruaru', label: '😅 あるある型', description: '日常あるあるで親近感' },
      { value: 'pinned', label: '📌 固定投稿型', description: 'プロフィール上部用' },
    ],
  },

  // ──────────────── Q13. Threadsノウハウ使用 ────────────────
  {
    id: 'useThreadsKnowhow',
    prompt:
      '最後の質問です。\n\nこのプロジェクトでは、Threads特有の集客ノウハウ（強い1行目・心理トリガー・〇選リスト・煽り表現など）をどこまで使いますか？',
    helper: '後からプロジェクト設定で切り替えできます。',
    required: true,
    ui: 'choice',
    choices: [
      {
        value: 'on',
        label: '🔥 Threadsノウハウをフル活用する',
        description:
          '強いフック・心理トリガー・型10種をフル投入。CV最優先。普段の業界では尖って見える文章になります。',
      },
      {
        value: 'off',
        label: '🌿 自然な投稿スタイルにする',
        description:
          'ノウハウは控えめ、普段の言葉で書きます。売り込み感を抑えたい人・士業や医療系・上品なブランディング向け。',
      },
    ],
  },
];

/**
 * 質問のID順を保ったキーリスト
 */
export const COUNSELING_QUESTION_IDS = COUNSELING_QUESTIONS.map((q) => q.id);

/**
 * 「なし」「ありません」「無し」などの空回答を判定
 */
export function isEmptyAnswer(value: string): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  return /^(なし|ありません|無し|無|none|n\/a|na|特になし|思いつかない)$/i.test(trimmed);
}

/**
 * 自由記入の生回答を、改行/読点で分割してリスト化する。
 * AI抽出が失敗したときのフォールバック整形にも使う。
 */
export function splitToList(value: string): string[] {
  if (isEmptyAnswer(value)) return [];
  return value
    .split(/\r?\n|、|・|;|；/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => s.replace(/^[-・*•\d]+\.?\s*/, ''))
    .filter((s) => s.length > 0);
}

/**
 * 生回答 → 構造化結果に変換。
 * AI抽出を使わずローカル整形だけでも実用上十分にする。
 */
export function buildCounselingResult(
  answers: Partial<CounselingAnswers>,
  freeFormSummary = '',
): CounselingResult {
  const preferredTypesCsv = answers.preferredTypesRaw ?? '';
  const preferredTypes = preferredTypesCsv
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0) as PostType[];

  return {
    brandVoice: (answers.brandVoiceRaw ?? '').trim(),
    menu: splitToList(answers.menuRaw ?? ''),
    hoursInfo: splitToList(answers.hoursInfoRaw ?? ''),
    realProofs: splitToList(answers.realProofsRaw ?? ''),
    realEpisodes: splitToList(answers.realEpisodesRaw ?? ''),
    benefitsDaily: splitToList(answers.benefitsDailyRaw ?? ''),
    ctaAssets: splitToList(answers.ctaAssetsRaw ?? ''),
    faq: splitToList(answers.faqRaw ?? ''),
    industryMyths: splitToList(answers.industryMythsRaw ?? ''),
    originStory: isEmptyAnswer(answers.originStoryRaw ?? '') ? '' : (answers.originStoryRaw ?? '').trim(),
    ngList: splitToList(answers.ngListRaw ?? ''),
    preferredTypes,
    useThreadsKnowhow: answers.useThreadsKnowhow !== 'off',
    freeFormSummary,
    counseledAt: Date.now(),
    rawAnswers: answers,
  };
}
