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
import { buildCounselingBrief } from './counselingBrief';
import { isEmptyAnswer, splitToList } from './answerText';

// 既存の呼び出し元のために、これまでどおりここからも使えるようにしておく
export { isEmptyAnswer, splitToList };
import { BUSINESS_TYPE_SUGGESTIONS } from './industryProfiles';

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
  /**
   * ★答えをまとめた「要旨」（2026-09-04）。お客様が確認・修正したもの。
   * 生成時はこれを最優先で参照する。古いデータには入っていないので任意。
   */
  brief?: import('./counselingBrief').CounselingBrief;
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
  // ★書き方のきまり（2026-09-06・三上様指示「クライアントが答えやすい表現で」）
  //   - 1行目は「お店の人が記憶から答えられる」短い問いにする（確認画面の見出しにもなる）
  //   - 2行目以降は、何に使うか・どう答えればいいかを、ふだんの言葉で
  //   - 「常識を覆す型」「CTA」「心理トリガー」など内部の言葉は出さない
  //   - 「施術」「患者さん」「自院」「来店」は業種に合わせて置き換わる語（industryProfiles）
  //   - 答えに困ったら「なし」で進めることを、任意の質問では毎回伝える

  // ══════════════ 基本情報（最初に聞く。これでプロジェクトを作成）══════════════
  {
    id: 'businessTypeRaw',
    prompt:
      'はじめに、どんなお店（お仕事）か教えてください。',
    helper: '近いものをタップしてください。ぴったりのものが無ければ、そのまま言葉で送ってください。',
    required: true,
    ui: 'textarea',
    // ★候補は特定の業種に寄せない（治療院ばかり並べない）。
    //   ここで答えていただいた内容で、以降の質問の候補・例文が切り替わる。
    suggestions: BUSINESS_TYPE_SUGGESTIONS,
    examples: ['例：「産後ケア専門の整体院」「駅前の小さなカフェ」「創業130年の呉服店」'],
  },
  {
    id: 'areaRaw',
    prompt:
      'お店はどこにありますか？\n（町名まで入れると、近所の方に届きやすくなります）',
    helper: '市区町村のあとに町名まで。最寄り駅は後から足せます。',
    required: true,
    ui: 'textarea',
    examples: ['例：「岡山市北区京橋町」「東京都渋谷区道玄坂」'],
  },
  {
    id: 'storeNameRaw',
    prompt:
      'お店の名前を教えてください。\n（後から変えられます。まだ決まっていなければ「なし」でOK）',
    helper: '自己紹介や固定投稿に、そのまま使います。',
    required: false,
    ui: 'textarea',
    examples: ['例：「○○整体院」「○○珈琲店」「㈱○○本店」'],
    allowEmptyShortcut: true,
  },
  {
    id: 'targetRaw',
    prompt:
      'いちばん来てほしいのは、どんなお客さんですか？',
    helper: 'よく来てくださる方を1人思い浮かべて、年代・性別・どんな方かを。近いものをタップして、足してもOK。',
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
      'そのお客さんは、どんなことで困っていますか？\n（お店に来る前に、悩んでいたこと）',
    helper: 'お客さんがよく口にする言葉そのままでOK。具体的なほど、読んだ人が「自分のことだ」と思う投稿になります。',
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
      'お客さんに「ここにして良かった」と言われるのは、どんなところですか？',
    helper: '技術・人柄・品ぞろえ・場所・営業時間、なんでもOK。お客さんに言われた言葉そのままでも。',
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
      'お客さんと話すとき、ふだんはどんな口調ですか？',
    helper: '近いものをタップ。いくつか組み合わせてもOK。投稿の文章をこの口調に合わせます。',
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
      '例：「○○さん、こんにちは。先日のあれ、どうでした？」（丁寧＋親しみ）',
      '例：「正直に言いますね。それはやめたほうがいいです」（はっきり言う）',
    ],
  },

  // ────────────────────── Q2. USP ──────────────────────
  {
    id: 'uspRaw',
    prompt:
      '他のお店ではなく、あなたのお店を選ぶ理由を、ひとことで言うと？',
    helper: '「うちだけ」「この辺りでは珍しい」と言えることがあれば、それが一番です。近いものをタップして、一言足してください。',
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
      '実際にやっているメニュー・商品を教えてください。\n（ここに書いたものだけを、AIは施術の内容として投稿に書きます。やっていないことを勝手に書きません）',
    helper: '近いものをタップして、自院での呼び方に直してください。',
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
      '営業時間・お休み・予約や注文のしかたを教えてください。',
    helper: '固定投稿や案内文に、そのまま事実として使います。書いていないことをAIが勝手に書くことはありません。書きたくなければ「なし」でOK。',
    required: true,
    ui: 'multiline-list',
    suggestions: [
      '平日 10:00〜19:00',
      '土日祝も営業',
      '定休日：水曜',
      '定休日：不定休',
      '予約制',
      '予約なしでもOK',
      'LINEで予約・注文できます',
      '電話で予約できます',
      '駐車場あり',
    ],
    examples: [
      '例：「平日10時〜19時／土曜は17時まで」「定休日：水曜・祝日」「LINEか電話で予約（当日OK）」',
    ],
    allowEmptyShortcut: true,
  },

  // ────────────────── Q4. 実績(realProofs) ──────────────────
  {
    id: 'realProofsRaw',
    prompt:
      '数字で言える「実績」はありますか？\n（創業〇年、お客さん のべ〇人、口コミ★〇 など）',
    helper:
      '思いつくだけ、いくつでも。ここに書いた数字だけをAIが使います。無ければ「なし」でOK（数字を出さない投稿にします）。',
    required: true,
    ui: 'multiline-list',
    suggestions: [
      '創業・営業〇年',
      'これまでのお客さん のべ〇〇人',
      'Google口コミ ★4.〇',
      'リピートのお客さん 〇割',
      '〇代目',
      'メディア掲載：〇〇',
      '資格：〇〇',
      '受賞：〇〇賞',
    ],
    examples: [
      '例：「創業130年」「のべ4000名」「Google口コミ4.8」',
      '例：「4代目」「地元の新聞で紹介」',
    ],
    allowEmptyShortcut: true,
  },

  // ──────────────── Q5. 顧客エピソード(realEpisodes) ────────────────
  {
    id: 'realEpisodesRaw',
    prompt:
      '印象に残っている患者さんの話を、ひとつ教えてください。\n（どんな方が・どんなことで・どうなったか）',
    helper:
      '名前は仮名でOK。ここに書いた話だけをAIが投稿に使います。実際にいない方の話を作ることはありません。思いつかなければ「なし」でOK。',
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
      'お客さんから「来てよかった」「助かった」と言われるのは、どんなときですか？',
    helper: '暮らしの中の場面で。近いものをタップして、直してもOK。思いつかなければ「なし」でOK。',
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
      '初めての方に用意している特典やサービスはありますか？\n（無料相談・お試し・LINE登録のプレゼント など）',
    helper: 'ここに書いたものだけを、投稿の最後のご案内に使います。無ければ「なし」でOK。',
    required: true,
    ui: 'multiline-list',
    suggestions: [
      '初回のご相談 無料',
      'お試し・体験 〇〇円',
      'LINE登録で〇〇をプレゼント',
      '初回限定の割引',
      '来店時の〇〇サービス',
      '資料・冊子のお渡し',
    ],
    examples: [
      '例：「初回30分の相談無料」',
      '例：「LINE登録でお手入れガイドをプレゼント」',
    ],
    allowEmptyShortcut: true,
  },

  // ──────────────── Q8. よくある質問(faq) ────────────────
  {
    id: 'faqRaw',
    prompt:
      'お客さんによく聞かれることや、来る前に不安に思われることは何ですか？',
    helper: 'そのまま「よくいただくご質問」の投稿にします。近いものをタップして直してもOK。無ければ「なし」でOK。',
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
      '同業のやり方で「それは違う」と思うこと、または昔の自分の失敗はありますか？',
    helper: '「実は…」と本音を語る投稿の材料になります。近いものをタップして直してもOK。無ければ「なし」でOK。',
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
      'この仕事を始めたきっかけや、大切にしている想いを教えてください。',
    helper: 'あなたにしか書けない投稿になります。少し長くなってもOK。無ければ「なし」でOK。',
    required: false,
    ui: 'textarea',
    suggestions: [
      '自分や家族の体験がきっかけ',
      '前の職場で「もっとこうしたい」と感じた',
      '親・先代から受け継いだ',
      '恩師との出会い',
      'お客さんの一言が忘れられない',
      '地元に恩返ししたい',
    ],
    examples: [
      '例：「4代目として、着物を日常で楽しむ人を増やしたくて続けています」',
    ],
    allowEmptyShortcut: true,
  },

  // ──────────────── Q11. NGリスト(ngList) ────────────────
  {
    id: 'ngListRaw',
    prompt:
      '投稿に「絶対に書きたくないこと」はありますか？\n（言いすぎになる表現・事実と違うこと・出したくない情報）',
    helper: 'ここに書いたことは、AIが投稿に入れません。近いものをタップして、自分の言葉で足してもOK。無ければ「なし」でOK。',
    required: false,
    ui: 'multiline-list',
    suggestions: [
      '「必ず」「絶対」など言い切りは使わない',
      '「先着〇名」「残り〇席」など事実でない急がせ方はしない',
      '「予約が取れない」など盛った表現はしない',
      '具体的な料金は載せない',
      'お客さんの名前・写真は出さない',
      '他店の悪口は書かない',
      '専門用語を並べない',
    ],
    examples: [
      '例：「“必ず良くなる”とは書かない」「他店の悪口は書かない」',
    ],
    allowEmptyShortcut: true,
  },

  // ──────────────── Q12. 好み投稿タイプ ────────────────
  {
    id: 'preferredTypesRaw',
    prompt:
      'どんな投稿を多めに作りましょうか？\n（いくつでも。後から変えられます）',
    helper: '迷ったら「地元ネタ」と「実績・体験談」がおすすめです。',
    required: false,
    ui: 'multi-choice',
    choices: [
      { value: 'local', label: '📍 地元ネタ型', description: '地域名+お悩みで集客直結（おすすめ）' },
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
      '最後の質問です。\n投稿の文章は、どちらの感じが好みですか？',
    helper: '後から設定で切り替えられます。',
    required: true,
    ui: 'choice',
    choices: [
      {
        value: 'on',
        label: '🔥 目を引く書き方（集客重視）',
        description:
          '強めの1行目や「〇選」など、Threadsで反応が出やすい書き方を使います。少し尖った文章になります。',
      },
      {
        value: 'off',
        label: '🌿 落ち着いた書き方（自然な言葉）',
        description:
          'ふだんの言葉で書きます。売り込み感を抑えたい方、士業・医療・上品な雰囲気のお店向け。',
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

/**
 * 自由記入の生回答を、改行/読点で分割してリスト化する。
 * AI抽出が失敗したときのフォールバック整形にも使う。
 */

/**
 * 生回答 → 構造化結果に変換。
 * AI抽出を使わずローカル整形だけでも実用上十分にする。
 */
export function buildCounselingResult(
  answers: Partial<CounselingAnswers>,
  freeFormSummary = '',
  /** お客様が書き換えた一言化。無ければ答えから下書きする */
  oneLine = '',
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
    brief: buildCounselingBrief(answers, oneLine),
    counseledAt: Date.now(),
    rawAnswers: answers,
  };
}
