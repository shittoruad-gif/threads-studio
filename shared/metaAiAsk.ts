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
/**
 * ★呼びかけ投稿をAPIで自動公開するか。2026-09-06 実測で「APIからの投稿は @meta.ai がメンションにならず
 *   Meta AIが返事しない」と分かったため false。代わりに毎朝10時、LINEで「Threadsアプリで投稿する」
 *   ボタン（投稿インテント）を届ける（server/metaAiCallPrompt.ts）。
 */
export const META_AI_CALL_AUTO_PUBLISH = false;

export interface MetaAiCallSource {
  storeName?: string | null;
  businessType?: string | null;
  area?: string | null;
  /** 最寄り駅など（はじめの設定の地域補足）。「新倉敷駅から車で7分」のような行 */
  localTerms?: string | null;
  target?: string | null;
  mainProblem?: string | null;
  /** 主なメニュー（先頭を使う） */
  menu?: string[] | null;
  /** アカウント別の得意分野（threadsAccounts.callFocus）。例：ダイエット → 「ダイエットに強い整体院」 */
  focus?: string | null;
}


/**
 * 呼びかけ投稿に入れる地域の呼び名。★市より細かくする（2026-09-06 三上様指示「倉敷だと広すぎる」）。
 *   「岡山県倉敷市玉島」＋「JR新倉敷駅から車で約7分」 → 「新倉敷・玉島」
 *   「浅口市金光町占見新田283-1」＋「金光駅…鴨方駅…」   → 「金光町・鴨方」
 *   「埼玉県川口市戸塚安行駅、東川口駅」                 → 「戸塚安行・東川口」
 *   町名も駅も無ければ市区町村（「倉敷市」）、それも無ければ都道府県。
 */
export function callAreaLabel(area: string | null | undefined, localTerms?: string | null): string {
  const raw = String(area || '').trim();
  // 「なし」「未定」「オンライン」などは地域として使わない（2026-09-24「なしの名産品と言えば？」が作られていた）
  if (/^(なし|無し|未定|特になし|-|ー|―|オンライン.*|全国.*)$/.test(raw)) return '';
  // 都道府県。「京都府」を「京都＋府」と切って「京」になっていた（東京都・大阪府・北海道も同じ形に）
  const PREF_RE = /^(東京都|北海道|京都府|大阪府|[^都道府県\s]{2,3}県)/;
  const pref = raw.match(PREF_RE)?.[1] ?? '';
  const rest = raw.replace(PREF_RE, '');
  // 市区町村。「廿日市市」「市川市」のように名前に「市」を含む市に対応（2文字以上＋市、直後が市でない）
  const cityM = rest.match(/^(.{1,}?[市郡])(?![市])((?:[^\s]{1,4}?区)?)/);
  const city = cityM ? cityM[1] + (cityM[2] || '') : (rest.match(/^(.+?[区町村])/)?.[1] ?? '');
  let town = city ? rest.slice(city.length) : rest;
  // 地域欄に駅が列挙されていれば駅として扱う
  const stationsFromArea: string[] = [];
  const reA = /([^\s、,・／/]+?)駅/g;
  let ma: RegExpExecArray | null;
  while ((ma = reA.exec(town)) !== null) stationsFromArea.push(ma[1]);
  if (stationsFromArea.length > 0) town = '';
  // 丁目・番地・数字・建物名を落とす
  town = town.replace(/[0-9０-９]+.*$/, '').replace(/(丁目|番地|番|号).*$/, '').replace(/[\s、,・／/].*$/, '').trim();
  // 「金光町占見新田」のような二段の町名は先頭の町だけ
  const tm = town.match(/^(.+?[町村])(.*)$/);
  if (tm && tm[1].length >= 2 && tm[1].length <= 5) town = tm[1];
  if (town.length > 6) town = town.slice(0, 6);
  // 最寄り駅（地域補足から）
  const stations: string[] = [];
  const reS = /(?:JR|ＪＲ)?\s*([^\s、,・／/（(]+?)駅/g;
  const lt = String(localTerms || '');
  let ms: RegExpExecArray | null;
  while ((ms = reS.exec(lt)) !== null) {
    const name = ms[1].replace(/^(JR|ＪＲ)/, '').trim();
    if (name && name.length <= 6 && !stations.includes(name)) stations.push(name);
  }
  for (const sname of stationsFromArea) if (!stations.includes(sname)) stations.push(sname);
  const townCore = town.replace(/[町村]$/, '');
  const useStations = stations
    .filter((st) => !(town && (town.includes(st) || (townCore && st.includes(townCore)))))
    .slice(0, town ? 1 : 2);
  const bad = (x: string) => /[。、．]|です|ます|修正|回答/.test(x) || x.length > 10;
  if (useStations.length > 0) { const lbl = [...useStations, ...(town ? [town] : [])].join('・'); return bad(lbl) ? '' : lbl; }
  // 駅が無いときは、短い町名だけだと分かりにくいので市区名を前に付ける（倉敷市玉島／倉敷市中央）
  if (town) { const lbl = town.length <= 3 && city ? `${city}${town}` : town; return bad(lbl) ? '' : lbl; }
  if (city) return bad(city) ? '' : city;
  const pf = pref === '北海道' ? pref : pref.replace(/[都道府県]$/, '');
  return pf && !bad(pf) ? pf : '';
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
  const head = s.split(/[、,・／/\r\n]/)[0].trim();
  if (head.length > 20) return '';
  // 疑問文・かぎ括弧・文らしいもの（「敷居が高いと思われている？」）は名詞扱いしない
  if (/[？?！!「」『』]/.test(head) || /(ている|れている|です|ます)$/.test(head)) return '';
  if (/(ない|たい|らない|れない|くる|する|なる|える|ある|いる|う|く|す|つ|む|る)$/.test(head)) return '';
  // 「入りづらい」「続けにくい」のような形容詞で終わるものも「〜に悩む人」につなげない（2026-09-24 スナック様で「入りづらいに悩む人」）
  if (/(づらい|にくい|やすい|しい|らい|たい|さい|かい)$/.test(head)) return '';
  return head;
}

/**
 * 業種名を「マシンピラティススタジオ」「整体院」「カフェ」のように。括弧書きを落とし、
 * 「整骨院・接骨院」のような列挙は先頭だけ。メニュー名は使わない（「予約制」のような語が混ざるため）。
 */
function serviceWord(src: MetaAiCallSource): string {
  let bt = String(src.businessType || '').replace(/[（(][^）)]*[）)]/g, '').trim();
  bt = bt.split(/[・／/、,]/)[0].trim();
  if (/[。．]|です|ます/.test(bt)) return '';
  return bt.length > 0 && bt.length <= 14 ? bt : '';
}

/**
 * ★呼びかけ文の種類（2026-09-24 三上様「同じパターンのものばかりになっていて気になる。
 *   投稿することで集客につながったり、ユーザーにとってプラスになったりするものを採用して」
 *   → 同日「うちのアカウントだけではなく、他のものからリサーチして」）。
 *
 * 調べたこと（2026-09-24）：
 *   A. 連携中12アカウントの @meta.ai 投稿101件（Threads API・通常投稿の中央値に対する倍率）
 *        おすすめ 3.3倍／メリット 3.1倍／届けて 2.7倍／強み 1.7倍／違い 1.5倍。同じ型は4回目から落ちる（2.9→1.6→1.0倍）
 *   B. その投稿に Meta AI が実際に付けた答え（読む人が目にするもの）
 *        - 「届けて」：答えは店主向けの宣伝のコツ（ハッシュタグ・Googleマップ）。読む人の役に立たない。
 *          店がしていない「初回チェック無料」を勝手に書いた例もあった（9/24 廿日市）
 *        - 「おすすめを教えて」：自店の投稿の下に他店の名前と料金を並べた（9/15 金光「コスパ重視なら楽兆」）
 *        - 「強み」「違い」：店の投稿を元に「根本改善」「その場しのぎではない」等、NGワードにしている言い切りを書く
 *        - 「名産品と言えば？」：地元の正しい情報が返り、地元の人が返信した（「良寛餅」）。表示は通常の5〜6倍
 *        - 「〇〇はどういう場所？」「うちでできること」：店名を出して中立に紹介（金光 2,053回）→ about_store
 *   C. 先行して使われている台湾・東南アジアの記事：返信が表示の約半分を占める。
 *      「AIに聞いて、読む人にも答えてもらう」使い方が反応を広げる。AIの答えには誤りがある前提で使う。
 *
 * → 読む人の役に立ち、店の名前が中立に出て、他店や言い切りを呼ばない質問だけを回す。
 *   地元の話題には「地元の方の声も聞きたい」の一言を添えて、返信を呼ぶ。
 *   「届けて」「おすすめを教えて」「他と何が違う？」は回さない（recommend は種類指定でだけ使える）。
 *   依頼文は今までどおり登録内容から決まった型で組み立てる（AIに書かせない＝事実が混ざらない）。
 *   効果・結果を言い切る聞き方（治る・改善する 等）はしない。
 */
export type MetaAiCallKind =
  | 'local_specialty' | 'about_store' | 'body_season' | 'first_visit' | 'local_season'
  | 'merit' | 'choose' | 'local_family' | 'body_daily' | 'local_event'
  | 'local_gourmet' | 'local_souvenir' | 'local_scenery' | 'local_rainy' | 'local_history'
  | 'store_cando' | 'body_stretch' | 'body_sleep'
  | 'recommend' | 'strength';

/** 並び順＝日替わりの順番。地元の話題・お店の紹介・来店前・体の質問が交互になるように並べる */
export const META_AI_CALL_ROTATION: readonly MetaAiCallKind[] = [
  'local_specialty', 'about_store', 'body_season', 'first_visit', 'local_season',
  'merit', 'choose', 'local_family', 'body_daily', 'local_event',
];

/**
 * ★日替わりで回す種類の全部（2026-10-07 三上様「Meta AIに関しても、もっと様々な内容をあげるようにし、
 *   リーチを広げる最大限のできることを行ってください」）。META_AI_CALL_ROTATION の10種類に8種類を足した18種類。
 *   足したものも、読む人の役に立ち・店の名前が中立に出て・他店や効果の言い切りを呼ばないものだけ。
 *   どれを出すかは chooseMetaAiCall（そのアカウントで実際に見られた種類を多めに・同じ文は60日出さない）。
 */
export const META_AI_CALL_ALL_KINDS: readonly MetaAiCallKind[] = [
  ...META_AI_CALL_ROTATION,
  'local_gourmet', 'local_souvenir', 'local_scenery', 'local_rainy', 'local_history',
  'store_cando', 'body_stretch', 'body_sleep',
];

/** 地元の話題の種類（実測でいちばん見られ、返信も付く：名産品 4,217回・返信25件／秋のおすすめ 5,766回・返信14件） */
export const META_AI_LOCAL_KINDS: ReadonlySet<MetaAiCallKind> = new Set<MetaAiCallKind>([
  'local_specialty', 'local_season', 'local_family', 'local_event',
  'local_gourmet', 'local_souvenir', 'local_scenery', 'local_rainy', 'local_history',
]);

/** 1つの種類で使える言い回しの数（同じ種類でも文を変えて、まったく同じ文が続かないようにする） */
export const META_AI_CALL_VARIANTS: Partial<Record<MetaAiCallKind, number>> = {
  local_specialty: 2, local_season: 2, local_family: 2, local_event: 2, about_store: 2,
  first_visit: 2, choose: 2, body_season: 2, body_daily: 2, merit: 2,
};

/** 地元の話題に添える一言（返信を呼ぶ。返信が表示の約半分を占めるため） */
const LOCAL_INVITE = '\n地元の方のおすすめも、よかったら教えてください';
const LOCAL_INVITE_MEMORY = '\n地元の方の思い出も、よかったら教えてください';

/** 体の不調を扱う業種か（季節の体・日常の注意の質問はこの業種だけ） */
function isBodyBusiness(service: string, businessType: string | null | undefined): boolean {
  return /(院|整体|整骨|接骨|鍼灸|ピラティス|ヨガ|ジム|スタジオ|サロン|クリニック|マッサージ|リラク|エステ)/.test(`${service} ${businessType ?? ''}`);
}

function jstMonth(now: Date): number {
  return new Date(now.getTime() + 9 * 3600_000).getUTCMonth() + 1;
}

function seasonWord(month: number): string {
  return month >= 3 && month <= 5 ? '春' : month >= 6 && month <= 8 ? '夏' : month >= 9 && month <= 11 ? '秋' : '冬';
}

/** 季節の体の話題（一般的な気候の話だけ。数字・固有名詞・効果は入れない） */
const SEASON_BODY: Record<number, string> = {
  1: '寒さが厳しいこの時期', 2: '寒さが続くこの時期', 3: '季節の変わり目のこの時期',
  4: '新生活が始まるこの時期', 5: '季節の変わり目のこの時期', 6: '梅雨どきのこの時期',
  7: '暑さが続くこの時期', 8: '暑さと冷房の差が大きいこの時期', 9: '朝晩の寒暖差が大きいこの時期',
  10: '朝晩が冷え込むこの時期', 11: '冷えを感じやすいこの時期', 12: '寒さが厳しくなるこの時期',
};

/** 種類を指定して1つ作る。材料が足りない種類は null */
export function buildMetaAiCallPostOfKind(src: MetaAiCallSource, kind: MetaAiCallKind, now: Date = new Date(), variant = 0): string | null {
  const area = callAreaLabel(src.area, src.localTerms);
  const store = String(src.storeName || '').trim();
  const storeOk = store.length > 0 && store.length <= 16;
  const target = shortTarget(src.target);
  const problem = shortProblem(src.mainProblem);
  const service = serviceWord(src);
  const who = problem ? `${problem}に悩む人` : target;
  // ★得意分野（アカウント別）。「ダイエットに強い整体院」のように業種の前に付ける
  //   （2026-09-06 三上様指示：同じお店でメニュー別にアカウントがある場合に変える）
  const focus = String(src.focus || '').replace(/[。．\s]/g, '').trim();
  const f = focus.length > 0 && focus.length <= 12 ? focus : '';
  const svc = f && service ? `${f}に強い${service}` : service;
  // 「通う」が自然な業種（院・サロン・スタジオ・ジム・教室）以外は「利用する」（呉服店に通う、は不自然）
  const visitable = /(院|サロン|スタジオ|ジム|教室|クリニック|整体|整骨|接骨|鍼灸|ピラティス|ヨガ|塾)/.test(svc);
  const body = isBodyBusiness(service, src.businessType);
  // オンラインだけのお店に地元の話題は合わない。大人向けのお店（スナック等）に子ども連れの話題は合わない
  const online = /オンライン|リモート|全国対応/.test(String(src.businessType || ''));
  const local = area && !online ? area : '';
  const adultsOnly = /(スナック|バー|パブ|居酒屋|キャバ|ラウンジ|クラブ)/.test(String(src.businessType || ''));
  const month = jstMonth(now);
  const H = META_AI_HANDLE;
  const v = Math.max(0, Math.floor(variant)) % (META_AI_CALL_VARIANTS[kind] ?? 1);

  let text: string | null = null;
  switch (kind) {
    case 'local_specialty':
      text = !local ? null : v === 0
        ? `${H} ${local}の名産品と言えば？${LOCAL_INVITE}`
        : `${H} ${local}で、地元の人が自慢したくなる名物は？${LOCAL_INVITE}`; break;
    case 'local_season':
      text = !local ? null : v === 0
        ? `${H} ${local}周辺で、${seasonWord(month)}に出かけるならおすすめの場所は？${LOCAL_INVITE}`
        : `${H} ${local}周辺で、${seasonWord(month)}を感じられるおすすめのスポットは？${LOCAL_INVITE}`; break;
    case 'local_family':
      text = !local || adultsOnly ? null : v === 0
        ? `${H} ${local}周辺で、子どもと一緒に楽しめる場所を教えて${LOCAL_INVITE}`
        : `${H} ${local}周辺で、休みの日に家族で出かけるならどこがおすすめ？${LOCAL_INVITE}`; break;
    case 'local_event':
      text = !local ? null : v === 0
        ? `${H} ${local}周辺で、${seasonWord(month)}にある行事やお祭りを教えて${LOCAL_INVITE}`
        : `${H} ${local}周辺で、${seasonWord(month)}の楽しみといえば？${LOCAL_INVITE}`; break;
    case 'local_gourmet':
      text = local ? `${H} ${local}で、地元の人に愛されているご当地の味は？${LOCAL_INVITE}` : null; break;
    case 'local_souvenir':
      text = local ? `${H} ${local}で手土産を選ぶなら、何がおすすめ？${LOCAL_INVITE}` : null; break;
    case 'local_scenery':
      text = local ? `${H} ${local}周辺で、景色がきれいな場所はどこ？${LOCAL_INVITE}` : null; break;
    case 'local_rainy':
      text = local && !adultsOnly ? `${H} ${local}周辺で、雨の日でも楽しめる場所は？${LOCAL_INVITE}` : null; break;
    case 'local_history':
      text = local ? `${H} ${local}の地名の由来や、昔の様子を教えて${LOCAL_INVITE_MEMORY}` : null; break;
    case 'about_store':
      // 会社・教室・オンラインにも合うよう「お店」ではなく「ところ」（9/8 はいさい整骨院「どういう場所？」が中立の紹介になった）
      text = !storeOk ? null : v === 0
        ? `${H} ${store}はどんなところ？初めての人にも分かるように教えて`
        : `${H} ${store}のことを、初めての人向けに分かりやすく紹介して`; break;
    case 'store_cando':
      // 9/5 金光「うちでできること」が 2,053回（店名を出して中立に紹介した）
      text = storeOk ? `${H} ${store}では、どんなことができる？初めての人にも分かるように教えて` : null; break;
    case 'merit':
      text = !(area && who && svc) ? null : v === 0
        ? `${H} ${area}で${who}に、${svc}${visitable ? 'に通う' : 'を利用する'}メリットを伝えて`
        : `${H} ${area}で${who}に、${svc}${visitable ? 'に行く' : 'を利用する'}前に知っておいてほしいことを伝えて`; break;
    case 'first_visit':
      text = !service ? null : v === 0
        ? `${H} 初めて${service}${visitable ? 'に行く' : 'を利用する'}とき、知っておくと安心なことは？`
        : `${H} 初めて${service}${visitable ? 'に行く' : 'を利用する'}前に、準備しておくといいことは？`; break;
    case 'choose':
      text = !service ? null : v === 0
        ? `${H} ${service}を選ぶときに、確認しておくといいポイントは？`
        : `${H} 自分に合う${service}を見つけるコツは？`; break;
    case 'body_season':
      text = !body ? null : v === 0
        ? `${H} ${SEASON_BODY[month]}、体がだるいと感じるときに自分でできる工夫は？`
        : `${H} ${SEASON_BODY[month]}、肩や腰が重く感じるときに気をつけたいことは？`; break;
    case 'body_daily':
      text = !(body && problem) ? null : v === 0
        ? `${H} ${problem}が気になる人が、毎日の生活で気をつけるといいことは？`
        : `${H} ${problem}が気になる人が、仕事や家事の合間にできる工夫は？`; break;
    case 'body_stretch':
      text = body ? `${H} 座りっぱなしが続いた日に、自分でできる簡単な体のほぐし方は？` : null; break;
    case 'body_sleep':
      text = body ? `${H} ${SEASON_BODY[month]}、ぐっすり眠るために寝る前にできることは？` : null; break;
    // ↓ 日替わりには入れない（種類指定でだけ使う）
    case 'recommend':
      text = area && svc ? `${H} ${area}で${svc}のおすすめを教えて` : null; break;
    case 'strength':
      text = `${H} うちのお店${storeOk ? `（${store}）` : ''}の${f ? `${f}の` : ''}強みを、来店されたことのない人に伝えて`; break;
  }
  return text && Array.from(text).length <= 120 ? text : null;
}

/**
 * 日替わりの呼びかけ文。seed は日付の番号（＋アカウントごとのずらし）。
 * 作れる種類だけを並び順どおりに回すので、材料が揃っていれば10日間同じ種類は出ない
 * （同じ型は4回目から表示が落ちるので、1つの型は月3回程度に収まる）。
 */
export function buildMetaAiCallPost(src: MetaAiCallSource, seed: number, now: Date = new Date()): string | null {
  const list = META_AI_CALL_ROTATION
    .map((k) => buildMetaAiCallPostOfKind(src, k, now))
    .filter((c): c is string => !!c);
  // 材料がほとんど無いときだけ「強み」を使う（何も送れないよりは良い）
  if (list.length === 0) { const fb = buildMetaAiCallPostOfKind(src, 'strength', now); return fb; }
  return list[Math.abs(seed) % list.length];
}

/**
 * ★今日の呼びかけ文の選び方（2026-10-07 三上様「もっと様々な内容をあげるようにし、リーチを広げる最大限のできることを」）。
 *
 * 10/7 実測（連携中25アカウント・直近45日の @meta.ai 投稿）：
 *   - ほとんどのアカウントで、呼びかけは通常の投稿の 1.6〜6倍 見られている（中央値どうし）
 *   - 例外の1アカウントは21本出して中央値13回（通常85回）。同じ文（「整体院を選ぶときに…」）を4回、
 *     ほかの文も2回ずつ出していた。材料で作れる文が8本ほどしか無く、8日ごとにまったく同じ文に戻っていたため
 *   - いちばん見られたのは地元の話題（秋のおすすめ 5,766回・名産品 4,217回）。「地元の方のおすすめも」の一言で返信も付く
 *   - 同じ種類でも、アカウントによって 13回〜5,766回 と差が大きい → そのアカウントで見られた種類を多めに出す
 *
 * 決まり：
 *   1. まったく同じ文は60日出さない（言い回し違いに回す）
 *   2. 直近4本で使った種類は出さない（作れる種類が足りないときは緩める）
 *   3. 種類の重み＝ 下地（地元の話題 1.3・お店の紹介 1.0・体 0.9・来店前 0.8）
 *        × そのアカウントでの実績（その種類の平均表示 ÷ 呼びかけ全体の中央値、0.4〜2.5倍。2本で効き始め4本で満額）
 *   4. 重みに沿って、日付で決まる乱数で1つ選ぶ（毎回いちばん良い種類だけにならない）。もう1つ別の種類を「別の質問」として添える
 */
export const META_AI_CALL_CHOICE = {
  repeatTextDays: 60,
  recentKindWindow: 4,
  prior: { local: 1.3, store: 1.0, body: 0.9, visit: 0.8 },
  ownClamp: [0.4, 2.5] as const,
  ownFullAt: 4,
} as const;

export interface MetaAiCallHistoryItem {
  text: string;
  /** 表示回数（取れなければ null） */
  views: number | null;
  at: Date;
}

const squashCall = (t: string) => String(t || '').replace(/[\s　]/g, '');

function priorOf(kind: MetaAiCallKind): number {
  const P = META_AI_CALL_CHOICE.prior;
  // 地名の由来は答えに誤りが混ざりやすく、まだ実績も無いので、地元の話題の中では控えめにする
  if (kind === 'local_history') return P.store;
  if (META_AI_LOCAL_KINDS.has(kind)) return P.local;
  if (kind === 'about_store' || kind === 'store_cando' || kind === 'merit') return P.store;
  if (kind.startsWith('body_')) return P.body;
  return P.visit;
}

/**
 * 過去の呼びかけ文が、どの種類だったか。今の型（全種類×言い回し×12か月）と同じ文なら、その種類。
 * 昔の型（「届けて」「強み」「おすすめを教えて」「何が違う」）は種類だけ分かればよいので形で見る。
 */
export function detectCallKind(text: string, src: MetaAiCallSource): MetaAiCallKind | null {
  const t = squashCall(text);
  if (!t.startsWith(META_AI_HANDLE)) return null;
  for (let m = 1; m <= 12; m++) {
    const at = new Date(Date.UTC(2026, m - 1, 15, 3));
    for (const k of META_AI_CALL_ALL_KINDS) {
      for (let v = 0; v < (META_AI_CALL_VARIANTS[k] ?? 1); v++) {
        const c = buildMetaAiCallPostOfKind(src, k, at, v);
        if (c && squashCall(c) === t) return k;
      }
    }
  }
  // 地元の一言が付く前の昔の型（「〇〇の名産品と言えば？」だけ）も同じ種類として数える
  for (let m = 1; m <= 12; m++) {
    const at = new Date(Date.UTC(2026, m - 1, 15, 3));
    for (const k of META_AI_CALL_ALL_KINDS) {
      if (!META_AI_LOCAL_KINDS.has(k)) continue;
      for (let v = 0; v < (META_AI_CALL_VARIANTS[k] ?? 1); v++) {
        const c = buildMetaAiCallPostOfKind(src, k, at, v);
        const head = c ? squashCall(c.split('\n')[0]) : '';
        if (head && head === t) return k;
      }
    }
  }
  if (/強みを/.test(t)) return 'strength';
  if (/おすすめを教えて$/.test(t)) return 'recommend';
  return null;
}

/** 日付から決まる乱数（同じ日・同じアカウントなら同じ結果） */
function seededRandom(seed: number): () => number {
  let a = (Math.abs(Math.floor(seed)) * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export interface MetaAiCallChoice {
  text: string;
  kind: MetaAiCallKind;
  /** 「別の質問で投稿する」に出す2つ目（別の種類）。作れなければ null */
  alt: { text: string; kind: MetaAiCallKind } | null;
  /** 選んだ理由（ログ用） */
  why: string;
}

/**
 * 今日の呼びかけ文を選ぶ。history は新しい順でなくてよい（このアカウントの @meta.ai 投稿）。
 */
export function chooseMetaAiCall(
  src: MetaAiCallSource,
  history: readonly MetaAiCallHistoryItem[],
  seed: number,
  now: Date = new Date(),
  /** 同じお客様の別のアカウントで今日すでに選んだ種類（同じお店の2アカウントが同じ日に同じ質問にならないように） */
  avoidKinds: ReadonlySet<MetaAiCallKind> = new Set(),
): MetaAiCallChoice | null {
  const C = META_AI_CALL_CHOICE;
  const hist = history.slice().sort((a, b) => b.at.getTime() - a.at.getTime())
    .map((h) => ({ ...h, kind: detectCallKind(h.text, src), sq: squashCall(h.text) }));
  // 候補：作れる種類×言い回し
  const cands: Array<{ text: string; kind: MetaAiCallKind }> = [];
  for (const k of META_AI_CALL_ALL_KINDS) {
    for (let v = 0; v < (META_AI_CALL_VARIANTS[k] ?? 1); v++) {
      const t = buildMetaAiCallPostOfKind(src, k, now, v);
      if (t && !cands.some((c) => c.text === t)) cands.push({ text: t, kind: k });
    }
  }
  if (cands.length === 0) {
    const fb = buildMetaAiCallPostOfKind(src, 'strength', now);
    return fb ? { text: fb, kind: 'strength', alt: null, why: '材料が少ないため強みの型' } : null;
  }
  // 1. 同じ文は60日出さない（全部使い切っていたら、いちばん前に使った文から戻す）
  const usedAt = new Map<string, number>();
  for (const h of hist) if (!usedAt.has(h.sq)) usedAt.set(h.sq, h.at.getTime());
  const since = now.getTime() - C.repeatTextDays * 86400_000;
  let pool = cands.filter((c) => (usedAt.get(squashCall(c.text)) ?? 0) < since);
  if (pool.length === 0) {
    const oldest = Math.min(...cands.map((c) => usedAt.get(squashCall(c.text)) ?? 0));
    pool = cands.filter((c) => (usedAt.get(squashCall(c.text)) ?? 0) === oldest);
  }
  // 2. 直近4本で使った種類は出さない
  const recentKinds = new Set([
    ...(hist.slice(0, C.recentKindWindow).map((h) => h.kind).filter(Boolean) as MetaAiCallKind[]),
    ...Array.from(avoidKinds),
  ]);
  const fresh = pool.filter((c) => !recentKinds.has(c.kind));
  if (fresh.length > 0) pool = fresh;
  // 3. 種類の重み（下地 × このアカウントでの実績）
  const viewed = hist.filter((h) => typeof h.views === 'number' && h.views >= 0) as Array<typeof hist[number] & { views: number }>;
  const sorted = viewed.map((h) => h.views).sort((a, b) => a - b);
  const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;
  const weightOf = (k: MetaAiCallKind): { w: number; own: number | null } => {
    const xs = viewed.filter((h) => h.kind === k).map((h) => h.views);
    let own: number | null = null;
    let factor = 1;
    if (xs.length >= 2 && median > 0) {
      own = xs.reduce((s, x) => s + x, 0) / xs.length / median;
      const conf = Math.min(1, (xs.length - 1) / (C.ownFullAt - 1));
      const clamped = Math.min(C.ownClamp[1], Math.max(C.ownClamp[0], own));
      factor = 1 + (clamped - 1) * conf;
    }
    return { w: priorOf(k) * factor, own };
  };
  const rnd = seededRandom(seed);
  const pickFrom = (list: typeof pool) => {
    // 種類ごとに重みを1回だけ数える（言い回しが2つある種類が2倍出ないように）
    const kinds = Array.from(new Set(list.map((c) => c.kind)));
    const ws = kinds.map((k) => weightOf(k).w);
    const total = ws.reduce((s, w) => s + w, 0);
    let r = rnd() * total;
    let kind = kinds[kinds.length - 1];
    for (let i = 0; i < kinds.length; i++) { r -= ws[i]; if (r <= 0) { kind = kinds[i]; break; } }
    const opts = list.filter((c) => c.kind === kind);
    return opts[Math.floor(rnd() * opts.length) % opts.length];
  };
  const main = pickFrom(pool);
  const altPool = pool.filter((c) => c.kind !== main.kind);
  const altFallback = cands.filter((c) => c.kind !== main.kind && !recentKinds.has(c.kind));
  const alt = altPool.length > 0 ? pickFrom(altPool) : altFallback.length > 0 ? pickFrom(altFallback) : null;
  const w = weightOf(main.kind);
  const why = `${main.kind}${w.own != null ? `（このアカウントでの実績 ${w.own.toFixed(2)}倍）` : ''}／候補${pool.length}・除外した種類${Array.from(recentKinds).join(',') || 'なし'}`;
  return { text: main.text, kind: main.kind, alt, why };
}

/**
 * 1日の投稿枠の分け方（2026-09-06 三上様指示）。
 *   呼びかけ投稿は「追加」ではなく、契約本数のうちの1件にする。
 *   1日1件のプラン（ライト）では通常投稿だけ（呼びかけ投稿は出さない）。
 *   例：3件 → 呼びかけ1件＋通常2件、2件 → 呼びかけ1件＋通常1件、1件 → 通常1件
 */
export function splitDailyQuota(postCount: number, metaAiEnabled: boolean): { regular: number; call: number } {
  const n = Math.max(0, Math.floor(postCount));
  if (!metaAiEnabled || n < 2) return { regular: n, call: 0 };
  return { regular: n - 1, call: 1 };
}
