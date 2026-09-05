/**
 * 「Meta AIに聞く」返信（2026-09-05 三上様指示）。
 *
 * 2026-09-03 から、Threadsの投稿やコメント欄で @meta.ai をメンションすると、
 * Meta AIが「@meta.ai」アカウントから公開の返信で答えるようになった（日本でも利用可）。
 *
 * これを投稿に使う：本文を公開した直後、自分の投稿へ
 *   「@meta.ai ＋ 本文の話題に関する一般的な質問」
 * を1件返信する。Meta AIがその場で答え、スレッドに会話（返信2件）ができる。
 * Threadsの表示順は返信の多さと速さを強く見るため、公開直後の会話は届きやすさに効く。
 *
 * 守ること（AIの回答は制御できないので、質問の側で事故を防ぐ）:
 *   - お店のこと・実績・効果を聞かない（Meta AIが店の事実を勝手に語る形にしない）
 *   - 「治る」「効く」など効能の断定を求めない。一般論の「なぜ」「仕組み」「目安」を聞く
 *   - 固有名詞（店名・人名・URL・電話）を入れない
 *   - 1日1アカウント1回まで。固定投稿・追い投稿・イベント告知には付けない
 *   - 既定ON（2026-09-06〜）。止めたい方は設定でOFF
 */

/** この切り口の投稿にだけ付ける（知識・豆知識系。共感・お店紹介・予約導線には付けない） */
export const META_AI_ASK_ANGLES: ReadonlySet<string> = new Set([
  'misconception', 'qa', 'surprise_fact', 'pro_tip', 'seasonal', 'lesson', 'reassurance',
]);

export const META_AI_HANDLE = '@meta.ai';
export const META_AI_ASK_MAX_CHARS = 60;

/** 生成プロンプト（本文を渡して、質問1つを返してもらう） */
export function buildMetaAiAskPrompt(postText: string, businessType: string | null | undefined): string {
  return [
    'あなたはThreadsの投稿の運用担当です。次の投稿の「返信欄」に、Meta AI（@meta.ai）へ聞く質問を1つ作ってください。',
    'Meta AIはこの質問に公開で答えます。読者がその答えを読んで「なるほど」と思える、一般的な知識の質問にしてください。',
    '',
    '【投稿本文】',
    postText,
    '',
    `【業種】${businessType || '不明'}`,
    '',
    '【条件・厳守】',
    `- 先頭は必ず「${META_AI_HANDLE} 」（半角スペース1つ）。その後に質問文。全体で${META_AI_ASK_MAX_CHARS}文字以内`,
    '- 本文の話題に関する「一般的な仕組み・理由・目安」を聞く（例：「ふくらはぎがつりやすいのはなぜ？」「コーヒーの焙煎で味が変わる理由は？」）',
    '- お店・施術・商品・実績・効果については聞かない。「このお店は」「うちの」などの語を使わない',
    '- 「治る」「効く」「痩せる」など効能の断定を求める聞き方をしない',
    '- 固有名詞（店名・人名・地名・URL・電話番号）を入れない',
    '- 絵文字・ハッシュタグ・記号の装飾を入れない。文末は「？」',
    '- 出力は質問文だけ。前置き・説明・引用符は不要',
  ].join('\n');
}

export interface MetaAiAskCheck {
  ok: boolean;
  text: string;
  reason?: string;
}

/**
 * 生成された質問を機械的に検査する。通らなければ返信しない（無理に直さない）。
 * @param forbidden お店固有の語（店名・地域名など）。含まれていたら不合格
 */
export function validateMetaAiAsk(raw: string, forbidden: Array<string | null | undefined> = []): MetaAiAskCheck {
  let t = String(raw || '').trim().replace(/^["「『]|["」』]$/g, '').trim();
  if (!t) return { ok: false, text: '', reason: 'empty' };
  if (!t.startsWith(META_AI_HANDLE + ' ')) {
    // 先頭に付け忘れたときだけ補う（他の場所にあるのは不合格）
    if (t.includes(META_AI_HANDLE)) return { ok: false, text: t, reason: 'handle_position' };
    t = `${META_AI_HANDLE} ${t}`;
  }
  const body = t.slice(META_AI_HANDLE.length + 1);
  if (Array.from(t).length > META_AI_ASK_MAX_CHARS) return { ok: false, text: t, reason: 'too_long' };
  if (!/[？?]$/.test(body)) return { ok: false, text: t, reason: 'not_question' };
  if (/https?:\/\/|www\.|#|\d{2,4}-\d{2,4}-\d{3,4}/.test(body)) return { ok: false, text: t, reason: 'url_or_tag' };
  if (/このお店|うちの|当院|当店|弊社|私たちの|施術を受け|来店|予約/.test(body)) return { ok: false, text: t, reason: 'store_reference' };
  if (/治る|治り|効く|効き|痩せる|完治|改善する/.test(body)) return { ok: false, text: t, reason: 'efficacy_claim' };
  if (/[\uD83C-\uD83E][\uDC00-\uDFFF]|[\u2600-\u27BF]/.test(body)) return { ok: false, text: t, reason: 'emoji' };
  for (const f of forbidden) {
    const w = String(f || '').trim();
    if (w.length >= 2 && body.includes(w)) return { ok: false, text: t, reason: `forbidden:${w}` };
  }
  return { ok: true, text: t };
}
