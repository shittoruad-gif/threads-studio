/**
 * 個人ブランディングモード（2026-08-31 三上さん指示）。
 *
 * 従来のThreads Studioは「お店に来てもらう」ゴールに最適化されていた。
 * このモードは、経営者・専門家・コーチ・フリーランスなど
 * 「ビジネスをやっている個人」が自分にファンをつけるための発信に切り替える。
 *
 * 変わるもの（すべて project.mode === 'personal' で分岐）:
 *   1. カウンセリングの聞き方（店舗前提→個人前提。回答の保存先キーは共通）
 *   2. 投稿の切り口プール（来店導線・商圏ネタを外し、持論・失敗談・過程を足す）
 *   3. 生成プロンプトの発信者設定（店舗オーナー→個人。来店・予約への誘導をしない）
 *   4. CTA（ご来店・ご予約→フォロー・プロフィール・LINE登録のトーン）
 *
 * 変わらないもの:
 *   事実だけを使う大原則・日本語品質ガード・投稿時間の実測知見・承認モード。
 */

import type { CounselingQuestion } from './counseling';

export type ProjectMode = 'store' | 'personal';

export function isPersonalMode(mode: string | null | undefined): boolean {
  return mode === 'personal';
}

/**
 * 個人モードでのカウンセリング質問の言い換え。
 * 保存先（CounselingAnswers のキー）は店舗モードと共通にして、
 * 生成側は同じフィールドを「個人の事実」として読む。
 */
export const PERSONAL_QUESTION_OVERRIDES: Partial<Record<string, Partial<CounselingQuestion>>> = {
  businessTypeRaw: {
    prompt: 'はじめに、あなたの活動について教えてください。\n\nどんな仕事・活動をしていますか？',
    helper: '近いものをタップ。違う場合は自由に入力してOK。',
    suggestions: [
      '経営者・オーナー', 'コーチ', 'コンサルタント', '講師・先生',
      'デザイナー', 'ライター', '動画クリエイター', '士業（税理士・行政書士など）',
      'セラピスト', 'フリーランス',
    ],
    examples: ['例：「小さなサロンを経営しながら開業支援もしている」「子育て中ママ向けのオンラインコーチ」'],
  },
  areaRaw: {
    prompt: '主な活動エリアを教えてください。\n（オンライン中心なら「オンライン」でOK。地域は必須ではありません）',
    helper: '対面の活動があるときだけ、市区町村まで書いてください。',
    required: false,
    examples: ['例：「オンライン」「岡山市＋オンライン」'],
    allowEmptyShortcut: true,
  },
  storeNameRaw: {
    prompt: '発信で名乗る名前（活動名・屋号）を教えてください。\n※ 本名でもニックネームでもOK。後から変更できます。',
    helper: '固定投稿・自己紹介で使います。',
    examples: ['例：「たなか まさし」「デザイナーのユキ」'],
  },
  targetRaw: {
    prompt: 'どんな人にファンになってほしいですか？\n（届けたい相手を、顔が浮かぶくらい具体的に）',
    examples: ['例：「集客に悩む30〜40代の店舗オーナー」「独立を考えている会社員」'],
  },
  mainProblemRaw: {
    prompt: 'その人たちは、どんなことに悩んだり、モヤモヤしたりしていますか？',
    examples: ['例：「何から手をつければいいか分からない」「頑張っているのに結果が出ない」'],
  },
  strengthRaw: {
    prompt: 'あなたの強み・選ばれる理由を教えてください。\n（経歴・専門性・実体験など、事実ベースで）',
    examples: ['例：「自分も同じ失敗をして、そこから立て直した経験がある」「この分野に10年関わってきた」'],
  },
  uspRaw: {
    prompt: 'あなたを一言で表すと？\n（肩書き＋誰の何を助ける人か）',
    examples: ['例：「小さなお店専門の集客コーチ」「ズボラさんのための片づけの先生」'],
  },
  menuRaw: {
    prompt: '提供しているサービス・商品があれば教えてください。\n（なければ「なし」でOK。実在するものだけが投稿に使われます）',
    required: false,
    examples: ['例：「個別コンサル」「オンライン講座」「電子書籍」'],
    allowEmptyShortcut: true,
  },
  hoursInfoRaw: {
    prompt: '受付・活動に関する情報があれば教えてください。\n（相談の受け方・稼働時間など。なければ「なし」でOK）',
    required: false,
    examples: ['例：「相談は公式LINEから」「平日夜と土日に活動」'],
    allowEmptyShortcut: true,
  },
  realProofsRaw: {
    prompt: '数字で言える実績・経歴があれば教えてください。\n（発信に使ってよいものだけ。なければ「なし」でOK）',
    examples: ['例：「支援した店舗は30店」「この仕事を始めて8年」「講座受講生100人」'],
  },
  realEpisodesRaw: {
    prompt: 'お客様・受講生・関わった人との実際のエピソードがあれば教えてください。',
    examples: ['例：「初売上の報告をもらって一緒に泣いた」「『考え方が変わった』と言われた」'],
  },
  benefitsDailyRaw: {
    prompt: 'あなたと関わった人には、日常でどんな変化がありますか？',
    examples: ['例：「数字を見るのが怖くなくなる」「自分の意見を言えるようになる」'],
  },
  ctaAssetsRaw: {
    prompt: 'ファンになってくれた人を、どこに案内したいですか？\n（公式LINE・メルマガ・商品ページなど。なければ「なし」でOK）',
    examples: ['例：「公式LINE」「noteのメンバーシップ」「無料相談フォーム」'],
  },
  industryMythsRaw: {
    prompt: 'あなたの業界・分野で「それは違うと思う」という常識や、あなたの持論はありますか？\n（意見・スタンスの投稿の素材になります）',
    examples: ['例：「フォロワー数より濃さだと思う」「値下げで集めたお客様は残らない」'],
  },
  originStoryRaw: {
    prompt: 'いまの活動を始めたきっかけ・原体験を教えてください。\n（ファンづくりでいちばん効く質問です。少し長くなってもOK）',
    examples: ['例：「自分の店を潰した経験から、同じ思いをする人を減らしたくて」'],
  },
};

/** 個人モードの質問リストを作る（idと保存先は店舗モードと共通） */
export function applyPersonalOverrides(base: CounselingQuestion[]): CounselingQuestion[] {
  return base.map((q) => {
    const o = PERSONAL_QUESTION_OVERRIDES[q.id as string];
    return o ? ({ ...q, ...o } as CounselingQuestion) : q;
  });
}

/** 個人モードで使わない切り口（来店・商圏前提のもの） */
export const PERSONAL_EXCLUDED_ANGLE_IDS: readonly string[] = ['local', 'reservation_funnel'];

/**
 * 生成プロンプトに追記する「発信者の設定」上書き（個人モード時のみ）。
 * プロンプト全体は店舗前提で書かれているため、末尾で最優先指示として上書きする
 * （末尾の指示が最も遵守されやすい）。
 */
export function personalModePromptOverride(): string {
  return `

【発信者の設定（最優先・ここまでの指示より優先する）】
- あなたは「お店」ではなく、ひとりの人間として発信する個人（経営者・専門家・フリーランス）。
- 目的は来店や予約ではなく、読み手に「この人の考え方が好きだ」「もっと読みたい」と思ってもらうこと（ファンづくり）。
- 「当店」「ご来店」「ご予約」「お店」という言葉を使わない。一人称は「私」。
- 売り込みはしない。役に立つこと・本音・過程・失敗も含めて、人として信頼される発信にする。
- 駅名・徒歩分数などの商圏表現は書かない（活動エリアの言及は入力にある場合のみ自然に）。`;
}
