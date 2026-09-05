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
 *   - 店名・人名・URL・電話は入れない。★地域名（市区町村）は入れる
 *     （2026-09-06 三上様指示。地域名＋話題の型は地元の人に届きやすい）
 *   - 1日1アカウント1回まで。固定投稿・追い投稿・イベント告知には付けない
 *   - 既定ON（2026-09-06〜）。止めたい方は設定でOFF
 */

/** この切り口の投稿にだけ付ける（知識・豆知識系。共感・お店紹介・予約導線には付けない） */
export const META_AI_ASK_ANGLES: ReadonlySet<string> = new Set([
  'misconception', 'qa', 'surprise_fact', 'pro_tip', 'seasonal', 'lesson', 'reassurance',
]);

export const META_AI_HANDLE = '@meta.ai';
export const META_AI_ASK_MAX_CHARS = 60;

/** 「岡山県倉敷市中央」→「倉敷市」。質問に入れる地域名は市区町村までにする */
export function shortAreaName(area: string | null | undefined): string {
  const a = String(area || '').trim();
  if (!a) return '';
  const m = a.match(/([^\s都道府県]+?[市区町村])/);
  return m ? m[1] : a.slice(0, 8);
}

/** 生成プロンプト（本文を渡して、質問1つを返してもらう） */
export function buildMetaAiAskPrompt(postText: string, businessType: string | null | undefined, area?: string | null): string {
  const areaName = shortAreaName(area);
  return [
    'あなたはThreadsの投稿の運用担当です。次の投稿の「返信欄」に、Meta AI（@meta.ai）へ聞く質問を1つ作ってください。',
    'Meta AIはこの質問に公開で答えます。読者がその答えを読んで「なるほど」と思える、一般的な知識の質問にしてください。',
    '',
    '【投稿本文】',
    postText,
    '',
    `【業種】${businessType || '不明'}`,
    `【地域】${areaName || '不明'}`,
    '',
    '【条件・厳守】',
    `- 先頭は必ず「${META_AI_HANDLE} 」（半角スペース1つ）。その後に質問文。全体で${META_AI_ASK_MAX_CHARS}文字以内`,
    '- 本文の話題に関する「一般的な仕組み・理由・目安」を聞く（例：「ふくらはぎがつりやすいのはなぜ？」「コーヒーの焙煎で味が変わる理由は？」）',
    ...(areaName
      ? [`- 質問の中に地域名「${areaName}」を自然に入れる（例：「${areaName}で秋に肩こりが増えるのはなぜ？」「${areaName}のパン屋で朝が混むのはなぜ？」）。地域の気候・生活・通勤などに絡めると自然`]
      : []),
    '- お店・施術・商品・実績・効果については聞かない。「このお店は」「うちの」などの語を使わない',
    '- 「治る」「効く」「痩せる」など効能の断定を求める聞き方をしない',
    '- 店名・人名・URL・電話番号を入れない（地域名は入れる）',
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
 * @param forbidden お店固有の語（店名など）。含まれていたら不合格
 * @param requiredArea 地域名（市区町村）。指定があれば、含まれていないと不合格
 */
export function validateMetaAiAsk(
  raw: string,
  forbidden: Array<string | null | undefined> = [],
  requiredArea?: string | null,
): MetaAiAskCheck {
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
  const area = shortAreaName(requiredArea);
  if (area && !body.includes(area)) return { ok: false, text: t, reason: 'missing_area' };
  return { ok: true, text: t };
}

// ─────────────────────────────────────────────────────────────────────────────
// ★「Meta AI 呼びかけ投稿」（2026-09-06 三上様指示・実データに合わせて方式変更）
//
//   三上様が 9/5 に Moveact の2アカウントで手動で試した結果：
//     通常の投稿           …  1〜161 回表示
//     @meta.ai への呼びかけ投稿 … 333〜2,037 回表示（最大は「浅口市金光、鴨方周辺の人に届けて」）
//   本文が「@meta.ai ＋ 依頼文」だけの投稿を出すと、Meta AI がお店の名前を出して
//   長い回答をコメントに書き、地元の人の反応も付いた。
//
//   そこで「本文に @meta.ai を書いた投稿」を 1日1件、通常の投稿とは別に追加する。
//   依頼文は お店の登録内容（地域・届けたい方・悩み・サービス・店名）から
//   決まった型で組み立てる（AIに書かせない＝事実が混ざらない）。
// ─────────────────────────────────────────────────────────────────────────────

export const META_AI_CALL_ANGLE = 'meta_ai_call';

export interface MetaAiCallSource {
  storeName?: string | null;
  businessType?: string | null;
  area?: string | null;
  target?: string | null;
  mainProblem?: string | null;
  /** 主なメニュー（先頭を使う） */
  menu?: string[] | null;
}

/** 「30〜50代の女性」「デスクワークの会社員」のような短い呼び名に整える */
function shortTarget(t: string | null | undefined): string {
  const s = String(t || '').replace(/[。．]/g, '').trim();
  if (!s) return '';
  return s.length <= 22 ? s : '';
}

/**
 * 「慢性的な肩こり」のような名詞で終わる短い悩みだけ使う。
 * 「体型が戻らない」「痩せたい」のように動詞・形容詞で終わるものは
 * 「〜に悩む人」につなぐと日本語が壊れるので使わない（その場合は届けたい方を使う）。
 */
function shortProblem(p: string | null | undefined): string {
  const s = String(p || '').replace(/[。．]/g, '').trim();
  if (!s) return '';
  const head = s.split(/[、,・／/]/)[0].trim();
  if (head.length > 20) return '';
  if (/(ない|たい|らない|れない|くる|する|なる|える|ある|いる|う|く|す|つ|む|る)$/.test(head)) return '';
  return head;
}

/**
 * 業種名を「マシンピラティス」「整体」「カフェ」のような呼び名に。
 * 括弧書きを落とし、「スタジオ」「院」など場所を表す語尾を外す（「整体院ができるところ」を防ぐ）。
 * メニュー名は使わない（登録のばらつきが大きく、「予約制」のような語が混ざるため）。
 */
function serviceWord(src: MetaAiCallSource): string {
  let bt = String(src.businessType || '').replace(/[（(][^）)]*[）)]/g, '').trim();
  bt = bt.replace(/(スタジオ|教室|サロン|院|店|事務所)$/, '').trim() || bt;
  return bt.length > 0 && bt.length <= 14 ? bt : '';
}

export function buildMetaAiCallPost(src: MetaAiCallSource, dayIndex: number): string | null {
  const area = shortAreaName(src.area);
  const store = String(src.storeName || '').trim();
  const storeOk = store.length > 0 && store.length <= 16;
  const target = shortTarget(src.target);
  const problem = shortProblem(src.mainProblem);
  const service = serviceWord(src);
  const who = problem ? `${problem}に悩む人` : target;

  // 実測で表示が多かった順に近い並び。要素が無い型は候補から外す。
  const candidates: Array<string | null> = [
    area ? `${META_AI_HANDLE} ${area}周辺の人に、うちの${storeOk ? `お店（${store}）` : 'お店'}を届けて` : null,
    area && service ? `${META_AI_HANDLE} ${area}で${service}のおすすめを教えて` : null,
    area && who && service ? `${META_AI_HANDLE} ${area}で${who}に、${service}に通うメリットを伝えて` : null,
    `${META_AI_HANDLE} うちのお店${storeOk ? `（${store}）` : ''}の強みを、来店されたことのない人に伝えて`,
    storeOk && service ? `${META_AI_HANDLE} ${store}の${service}は、他のお店と何が違う？` : null,
  ];
  const list = candidates.filter((c): c is string => !!c);
  if (list.length === 0) return null;
  const text = list[Math.abs(dayIndex) % list.length];
  return Array.from(text).length <= 120 ? text : null;
}
