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
  const pref = raw.match(/^(.+?[都道府県])/)?.[1] ?? '';
  const rest = raw.replace(/^(.+?[都道府県])/, '');
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
  const pf = pref.replace(/[都道府県]$/, '');
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

export function buildMetaAiCallPost(src: MetaAiCallSource, dayIndex: number): string | null {
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

  // 実測で表示が多かった順に近い並び。要素が無い型は候補から外す。
  const candidates: Array<string | null> = [
    area ? `${META_AI_HANDLE} ${area}周辺${f ? `で${f}に興味がある人` : 'の人'}に、うちの${storeOk ? `お店（${store}）` : 'お店'}を届けて` : null,
    area && svc ? `${META_AI_HANDLE} ${area}で${svc}のおすすめを教えて` : null,
    // 「通う」が自然な業種（院・サロン・スタジオ・ジム・教室）以外は「利用する」（呉服店に通う、は不自然）
    area && who && svc ? `${META_AI_HANDLE} ${area}で${who}に、${svc}${/(院|サロン|スタジオ|ジム|教室|クリニック|整体|整骨|接骨|鍼灸|ピラティス|ヨガ|塾)/.test(svc) ? 'に通う' : 'を利用する'}メリットを伝えて` : null,
    `${META_AI_HANDLE} うちのお店${storeOk ? `（${store}）` : ''}の${f ? `${f}の` : ''}強みを、来店されたことのない人に伝えて`,
    storeOk && (f || service) ? `${META_AI_HANDLE} ${store}の${f || service}は、他のお店と何が違う？` : null,
  ];
  const list = candidates.filter((c): c is string => !!c);
  if (list.length === 0) return null;
  const text = list[Math.abs(dayIndex) % list.length];
  return Array.from(text).length <= 120 ? text : null;
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
