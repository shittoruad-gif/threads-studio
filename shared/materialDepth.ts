/**
 * 「お店の情報」の材料の厚み＝投稿の切り口がいくつ作れるかを測り、
 * 少ないときに「どうしても似た投稿が続きます」とお客様へお伝えする。
 *
 * 2026-09-18 三上様指示。岩根様（㈱津の国や本店・account 25）で、契約3件のうち1件が
 * 9/14・9/16・9/18 と届かなかった。落ちた理由はほぼ全部「直近の投稿と同じ言い回し」で、
 * 自然さの採点は 5/5 が並ぶ。文章が下手なのではなく、書く材料が尽きていた。
 *   強み  ＝「本物の正絹の着物を扱っている。」
 *   選ぶ理由＝「本物の正絹にこだわりぬいている。」← 強みと同じことを言っている
 *   実績  ＝「今年で創業130年を迎える。」
 *   大切にしている考え・決め台詞・お客様の言葉・地元の言葉 ＝ すべて空欄
 * その結果、自動投稿24件のうち「130年」が11件・「正絹」が8件に入り、
 * 何を書いても重複検査に当たって枠が消えていた。
 *
 * 追記をお願いするだけでは動いていただけない。「なぜ追記が要るのか」を
 * 実データ（直近の投稿の何件に同じ言葉が入っているか）で見せる。
 *
 * ここは判定だけを持ち、AIは使わない（数えられる事実だけで話す）。
 */

/** 見る項目（お店の情報の列名 → お客様向けの呼び名と、追記のお願い文） */
export interface MaterialField {
  key: string;
  label: string;
  /** 空欄のときにお願いする一文（お客様がそのまま答えられる聞き方にする） */
  ask: string;
  /** 1行ずつが別の切り口になる項目か（お客様像の場面など） */
  multi: boolean;
  /** 空欄だと投稿が痩せる度合い（大きいほど効く） */
  weight: number;
}

export const MATERIAL_FIELDS: MaterialField[] = [
  { key: 'strength', label: '強み', ask: 'ほかのお店では言えない強みを、もう1つ2つ教えてください。', multi: true, weight: 2 },
  { key: 'usp', label: '選ばれる理由', ask: '「強み」とは別の角度で、お客様に選ばれている理由を教えてください。', multi: true, weight: 2 },
  { key: 'n1Customer', label: 'お客様の場面', ask: '実際にあったお客様の場面を、あと3つほど教えてください。1行1場面で構いません。', multi: true, weight: 3 },
  { key: 'mainProblem', label: 'お客様のお困りごと', ask: 'よく相談されるお困りごとを、あと2つ3つ教えてください。', multi: true, weight: 2 },
  { key: 'customerWords', label: 'お客様から言われた言葉', ask: 'お客様から実際に言われた言葉を、そのまま2つ3つ教えてください。ここがいちばん効きます。', multi: true, weight: 3 },
  { key: 'belief', label: '大切にしている考え', ask: '仕事で大切にされている考えを、ご自身の言葉で1つ2つ教えてください。', multi: true, weight: 3 },
  { key: 'localTerms', label: '地元の言葉・場所', ask: '地元でよく出る地名やお店・行事があれば教えてください。', multi: true, weight: 1 },
  { key: 'catchphrase', label: '決め台詞', ask: 'いつもお客様にお伝えしている一言があれば教えてください。', multi: false, weight: 1 },
  { key: 'proof', label: '実績', ask: '年数のほかに、数で言える実績があれば教えてください。', multi: true, weight: 1 },
  { key: 'target', label: 'お客さん像', ask: 'どんな方に来ていただきたいか、もう少し細かく教えてください。', multi: true, weight: 1 },
];

/** 材料が十分と言える数（1日3件＝月90投稿を、似せずに書ける目安） */
export const RICH_MATERIAL_COUNT = 18;
export const OK_MATERIAL_COUNT = 12;

/** 直近の投稿の何割に同じ言葉が入っていたら「偏っている」と見るか */
export const REPEAT_RATIO_WARN = 0.3;

export type MaterialLevel = 'thin' | 'ok' | 'rich';

export interface MaterialGap {
  key: string;
  label: string;
  ask: string;
  /** 空欄か、1つしか書かれていないか */
  state: 'empty' | 'thin';
}

export interface MaterialDepth {
  level: MaterialLevel;
  /** 数えられた材料の数（各項目の独立した行の合計） */
  count: number;
  /** 追記していただきたい項目（効く順） */
  gaps: MaterialGap[];
  /** 「強み」と「選ばれる理由」が同じことを言っている場合の一文 */
  samePair: string | null;
}

/** 1つの欄を「独立した材料の行」に割る */
export function materialLines(raw: unknown): string[] {
  const t = String(raw ?? '').trim();
  if (!t) return [];
  return t
    .split(/[\n。、･・]+/)
    .map((s) => s.replace(/^[-・◦\s]+/, '').trim())
    // 4文字以上、または「玉島」「商店街」のように漢字・カタカナ・数字を含む短い言葉（地元の言葉は短い）。
    // 「はい」のようなひらがなだけの相づちは数えない。
    .filter((s) => {
      const n = Array.from(s).length;
      if (n >= 4) return true;
      return n >= 2 && /[一-鿿゠-ヿ0-9０-９]/.test(s);
    });
}

/** ひらがな・記号を落として比べる（「本物の正絹を扱っている」と「本物の正絹にこだわる」を同じと見る） */
function coreOf(t: string): string {
  return String(t ?? '').replace(/[ぁ-ん\s、。・！？!?…「」（）()]/g, '');
}

/** 2つの文が「同じことを言っている」か（片方の中身がもう片方にほぼ含まれる） */
function saysTheSame(a: string, b: string): boolean {
  const x = coreOf(a);
  const y = coreOf(b);
  if (Array.from(x).length < 4 || Array.from(y).length < 4) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (long.includes(short)) return true;
  // 主要な語がどれだけ重なるか（3文字のかたまりで見る）
  const grams: string[] = [];
  for (let i = 0; i + 3 <= short.length; i++) {
    const g = short.slice(i, i + 3);
    if (grams.indexOf(g) === -1) grams.push(g);
  }
  if (grams.length === 0) return false;
  let hit = 0;
  for (const g of grams) if (long.includes(g)) hit++;
  return hit / grams.length >= 0.6;
}

/** お店の情報から、材料の厚みを測る */
export function assessMaterialDepth(project: any): MaterialDepth {
  const gaps: MaterialGap[] = [];
  let count = 0;

  for (const f of MATERIAL_FIELDS) {
    const lines = materialLines(project?.[f.key]);
    count += f.multi ? lines.length : Math.min(1, lines.length);
    if (lines.length === 0) gaps.push({ key: f.key, label: f.label, ask: f.ask, state: 'empty' });
    else if (f.multi && lines.length === 1) gaps.push({ key: f.key, label: f.label, ask: f.ask, state: 'thin' });
  }

  // 「強み」と「選ばれる理由」が同じことを言っていると、材料は2つあるように見えて実は1つ
  let samePair: string | null = null;
  const st = materialLines(project?.strength);
  const up = materialLines(project?.usp);
  outer: for (const a of st) {
    for (const b of up) {
      if (saysTheSame(a, b)) {
        samePair = `「強み」と「選ばれる理由」が同じことを言っています（${a.slice(0, 20)} ／ ${b.slice(0, 20)}）。どちらか一方を別の角度に書き替えると、投稿の幅が広がります。`;
        count = Math.max(0, count - Math.min(st.length, up.length));
        break outer;
      }
    }
  }

  // 効く順（空欄 → 1行だけ、そのうえで weight の大きい順）
  const weightOf = (k: string) => MATERIAL_FIELDS.find((f) => f.key === k)?.weight ?? 0;
  gaps.sort((a, b) => (a.state === b.state ? weightOf(b.key) - weightOf(a.key) : a.state === 'empty' ? -1 : 1));

  const level: MaterialLevel = count >= RICH_MATERIAL_COUNT ? 'rich' : count >= OK_MATERIAL_COUNT ? 'ok' : 'thin';
  return { level, count, gaps, samePair };
}

/* ------------------------------------------------------------------ */
/* 直近の投稿に同じ言葉がどれだけ出ているか（お願いする理由を実データで見せる） */
/* ------------------------------------------------------------------ */

/**
 * どの投稿にも出てよい言葉。店名・地名・業種は繰り返して当たり前なので数えない。
 * （呉服店の「着物」、ピラティス教室の「ピラティス」、滑川市の整体院の「滑川市」を
 *  「同じ言葉の繰り返し」として見せると、お客様には言いがかりに聞こえる。2026-09-18）
 */
function identityWords(project: any): string[] {
  const out = new Set<string>();
  for (const k of ['storeName', 'title', 'area', 'businessType']) {
    const v = String(project?.[k] ?? '').trim();
    if (!v) continue;
    out.add(v);
    for (const piece of v.split(/[\s、,・／/（）()【】「」]+/)) {
      const p = piece.trim();
      if (Array.from(p).length < 2) continue;
      out.add(p);
      // 「富山県滑川市」→「富山県」「滑川市」
      const m = p.match(/^(.+?[都道府県])(.+)$/);
      if (m) { out.add(m[1]); out.add(m[2]); }
      // 「呉服小売店」→「呉服」／「整体院」→「整体」（業種そのものの言い換えを拾う）
      const s = p.replace(/(小売店|専門店|サロン|教室|院|店|屋)$/, '');
      if (Array.from(s).length >= 2) out.add(s);
    }
  }
  return Array.from(out).sort((a, b) => b.length - a.length);
}

const GENERIC_GRAMS = [
  'ありがとう', 'お願いし', 'ください', 'いらっしゃ', 'ございます', 'させていただ',
  'お気軽に', 'ご相談', 'お問い合わせ', 'こんにちは', 'よろしく',
];

function normalizeForCount(t: string, strip: string[]): string {
  let s = String(t ?? '');
  for (const w of strip) if (w) s = s.split(w).join(' ');
  // 空白・記号・絵文字を落とし、文字のつながりだけを残す。
  // （\p{...} は tsconfig の target では使えないので、記号の範囲を直に書く）
  s = s.replace(/[\s「」『』（）()！？!?、。・…％%〜~♪]/g, '');
  // サロゲートペアの絵文字（👘🍁など）と、記号・矢印・異体字セレクタ
  return s.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[←-⯿☀-➿️‍〰〽]/g, '');
}

export interface RepeatedTopic {
  /** 繰り返されている言葉 */
  phrase: string;
  /** 何件の投稿に入っているか */
  posts: number;
}

export interface RepeatStats {
  total: number;
  topics: RepeatedTopic[];
  /** いちばん多い言葉が全体の何割に入っているか */
  topRatio: number;
}

/**
 * 直近の投稿に繰り返し出てくる言葉を数える。
 * 形態素解析は使わず、3〜8文字のかたまりが「何件の投稿に入っているか」で数える。
 * 漢字・カタカナ・数字を1つも含まないかたまり（助詞だけの並び）は捨てる。
 */
export function repeatedTopics(posts: string[], project: any, limit = 3): RepeatStats {
  const strip = identityWords(project);
  const texts = (posts || []).map((p) => normalizeForCount(p, strip)).filter((t) => t.length >= 10);
  const total = texts.length;
  if (total < 4) return { total, topics: [], topRatio: 0 };

  const hasContentChar = (g: string) => /[一-鿿゠-ヿ0-9０-９]/.test(g);
  const counts = new Map<string, number>();
  for (let n = 8; n >= 3; n--) {
    for (const t of texts) {
      const seen = new Set<string>();
      for (let i = 0; i + n <= t.length; i++) {
        const g = t.slice(i, i + n);
        if (seen.has(g)) continue;
        if (!hasContentChar(g)) continue;
        if (GENERIC_GRAMS.some((w) => g.includes(w) || w.includes(g))) continue;
        seen.add(g);
        counts.set(g, (counts.get(g) ?? 0) + 1);
      }
    }
  }

  const min = Math.max(3, Math.ceil(total * REPEAT_RATIO_WARN));
  const ranked = Array.from(counts.entries())
    .filter(([, c]) => c >= min)
    // 出現件数が同じなら長い言葉を優先（「正絹」より「本物の正絹」を見せる）
    .sort((a, b) => (b[1] - a[1]) || (Array.from(b[0]).length - Array.from(a[0]).length));

  const topics: RepeatedTopic[] = [];
  for (const [phrase, c] of ranked) {
    if (topics.length >= limit) break;
    // すでに採った言葉と重なるもの（部分文字列）は出さない
    if (topics.some((t) => t.phrase.includes(phrase) || phrase.includes(t.phrase))) continue;
    topics.push({ phrase, posts: c });
  }

  return { total, topics, topRatio: topics.length > 0 ? topics[0].posts / total : 0 };
}

/* ------------------------------------------------------------------ */
/* お客様にお見せする文                                                 */
/* ------------------------------------------------------------------ */

export interface MaterialNotice {
  /** 出すべきか */
  show: boolean;
  /** 見出し */
  title: string;
  /** 実データの一文（無いこともある） */
  evidence: string | null;
  /** なぜ似てくるのかの説明 */
  reason: string;
  /** 追記のお願い（上位3つ） */
  asks: string[];
  /** 「強み」と「選ばれる理由」が同じ場合の一文 */
  samePair: string | null;
  /** どれくらい差し迫っているか（banner の色分けに使う） */
  severity: 'info' | 'warn';
}

/** 投稿を作ったときに実際に起きたこと（数えた事実だけ） */
export interface GenerationFacts {
  /** その日、同じ言い回しへ戻って書き直した回数 */
  dupRejects?: number;
  /** その日、最後まで書けずお届けできなかった件数 */
  shortfall?: number;
  /** その日、材料が尽きたため「似ていてもお届けした」件数（保証パス） */
  guaranteed?: number;
}

/** 書き直しがこの回数を超えたら、材料が尽きていると見てお伝えする */
export const DUP_REJECT_WARN = 3;

/**
 * お客様の画面に出す注意書きを作る。
 * 「追記してください」だけでは伝わらないので、
 *   ① 実際に何件の投稿に同じ言葉が入っているか（数えた事実）
 *   ② だから登録内容が少ないと似た投稿が続く（理由）
 *   ③ ここを足してください（お願い）
 * の順に並べる。
 */
export function materialDepthNotice(
  project: any,
  recentPosts: string[] = [],
  facts: GenerationFacts = {},
): MaterialNotice {
  const depth = assessMaterialDepth(project);
  const stats = repeatedTopics(recentPosts, project);
  const dup = Math.max(0, facts.dupRejects ?? 0);
  const short = Math.max(0, facts.shortfall ?? 0);
  const guaranteed = Math.max(0, facts.guaranteed ?? 0);

  // ★出す条件は、推測ではなく「実際に起きたこと」を先に見る（2026-09-18 三上様指示）。
  //   同じ言葉が並ぶこと自体は、業種や地名なら当たり前。材料が足りているお店に
  //   「似ています」と出すと、直しようのない小言になる。
  //   投稿を作るときに実際に詰まった（書き直した・届かなかった）ときだけお伝えする。
  const struggled = dup >= DUP_REJECT_WARN || short > 0 || guaranteed > 0;
  const show = struggled || depth.level === 'thin' || (depth.level === 'ok' && !!depth.samePair);
  const severity: 'info' | 'warn' = short > 0 || guaranteed > 0 ? 'warn' : 'info';

  // ① 何が起きたか（数えた事実）
  const happened: string[] = [];
  if (dup > 0) happened.push(`本日は、前と同じ言い回しに戻ってしまい${dup}回書き直しました`);
  if (short > 0) happened.push(`${short}件は最後まで書けず、お届けできませんでした`);
  if (guaranteed > 0) happened.push(`${guaranteed}件は、前の投稿と似ていますが本数を守るためお届けしています`);
  if (happened.length === 0 && stats.topics.length > 0) {
    happened.push(`直近の投稿${stats.total}件のうち、${stats.topics.map((t) => `「${t.phrase}」が${t.posts}件`).join('・')}に入っています`);
  }
  const evidence = happened.length > 0 ? `${happened.join('。')}。` : null;

  // ② なぜそうなるのか（お願いする理由）
  const oneRound = Math.max(1, Math.ceil(depth.count / 3));
  const reason = depth.level === 'thin'
    ? `いま投稿の材料にできる内容は${depth.count}個です。1日3件で書き続けると${oneRound}日ほどで一巡してしまい、そのあとは同じ話に戻るしかなくなります。`
      + `お店の情報を足していただかないかぎり、どうしても似た投稿が続きます。`
      + `似た投稿が続くと、読む方に飽きられるだけでなく、Threads側から「同じ内容の繰り返し」と見られることがあります。`
    : `書ける角度が少ないと、AIは同じ言葉に戻るしかなくなります。`
      + `お店の情報を足していただかないかぎり、どうしても似た投稿が続きます。`
      + `下の項目を1つ足していただくだけでも、書ける角度がはっきり増えます。`;

  return {
    show,
    title: short > 0
      ? 'お店の情報を足してください（本日、投稿をお届けできませんでした）'
      : '投稿が似てきています。お店の情報を足していただけませんか',
    evidence,
    reason,
    asks: depth.gaps.slice(0, 3).map((g) => `${g.label}：${g.ask}`),
    samePair: depth.samePair,
    severity,
  };
}

/**
 * 投稿を作るときにAIへ渡す「まだ使っていない材料」。
 * 材料が尽きたアカウントで、同じ言い回しへ戻るのを防ぐために使う。
 */
export function unusedMaterials(project: any, recentPosts: string[], limit = 4): string[] {
  const strip = identityWords(project);
  // ★比べる前に、どちらも同じ形にそろえる（ひらがな・記号を落とす）。
  //   そろえずに比べていたため「本物の正絹にこだわりぬいている」が
  //   「本物の正絹にこだわりぬいています」と書いた直後でも「未使用」に見えていた。
  const used = (recentPosts || []).map((p) => coreOf(normalizeForCount(p, strip)));
  const out: string[] = [];
  for (const f of MATERIAL_FIELDS) {
    for (const line of materialLines(project?.[f.key])) {
      const core = coreOf(line).slice(0, 6);
      if (core.length < 3) continue;
      if (used.some((u) => u.includes(core))) continue;
      out.push(`${f.label}：${line}`);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 2日続けて投稿が1本も届かなかったときの、お詫びと追加情報のお願い      */
/* ------------------------------------------------------------------ */

/**
 * 2026-09-21 三上様指示：
 *   「2日連続でスキップされてしまった場合は、こちらから『追加情報でこれを送ってください』と
 *     提案し、それを送ってもらって、その内容が反映できるようにしてください。
 *     お詫びで補填するようにしてください」
 *
 * 香取様（acc21・1日1件）は 9/20・9/21 と2日続けて投稿が作れなかった。
 * 材料が尽きて毎回同じ言い回しに戻り、重複検査で差し戻され続けたため。
 * 黙って翌日へ回していたので、お客様からは「投稿が来ていません」という
 * お問い合わせになっていた（9/10 に続き2度目）。
 *
 * お伝えすることは4つだけにする。
 *   ① お詫び（何日、何件届かなかったか）
 *   ② なぜそうなったか（責任はこちらにある、という書き方にする）
 *   ③ 何を送っていただきたいか（項目名ではなく、そのまま答えられる聞き方で）
 *   ④ 届かなかった分は必ずお返しすること
 */
export interface ZeroPostApology {
  text: string;
  /** お願いした項目（あとで「送っていただいた内容をどこへ入れるか」の判断に使う） */
  askedKeys: string[];
}

export function zeroPostApologyNotice(
  username: string,
  project: any,
  days: number,
  missed: number,
  /**
   * 補填を始められる日のラベル（例「9月26日」）。
   * ★投稿が消されて1日1件に抑えている期間（冷却中）は補填が乗らないため、
   *   「これから」と書くと実際の動きと食い違う（2026-09-21 香取様で判明）。
   *   冷却中のときだけ渡す。ふだんは省略する。
   */
  makeupFromLabel?: string | null,
): ZeroPostApology {
  const depth = assessMaterialDepth(project);
  // 空欄を優先し、そのうえで効く順。3つまで（多く並べると1つも返ってこない）
  const asks = depth.gaps.slice(0, 3);

  const head =
    `@${username} の自動投稿が、${days}日続けてお届けできていません。` +
    `本日ぶんを含めて${missed}件です。申し訳ございません。\n\n`;

  const why =
    `原因は、登録いただいているお店の情報で書ける角度を使い切ってしまい、` +
    `AIが前と同じ言い回しに戻ってしまうことです。似た投稿をそのまま出すと` +
    `Threads側から「同じ内容の繰り返し」と見られるため、こちらで止めています。\n\n`;

  // ★LINEは装飾が使えないので、記号で強調しない（素のまま読める文にする）
  const askHead = `そこで、次のことを教えていただけないでしょうか。このトークに、そのまま文章で送っていただくだけで大丈夫です。\n`;
  const askBody = asks.map((g, i) => `${i + 1}. ${g.ask}`).join('\n');
  const askFoot =
    `\n\n1つだけでも構いません。いただいた内容は、その日のうちにお店の情報へ反映し、` +
    `翌朝の投稿からすぐ使います。「はじめの設定」をやり直していただく必要はありません。\n\n`;

  const makeup = makeupFromLabel
    ? `お届けできなかった${missed}件は、お詫びとして、${makeupFromLabel}以降に1日1件ずつ通常の本数に足してお届けします`
      + `（それまでは、アカウントを守るため投稿を1日1件に抑えている期間のためです）。`
    : `お届けできなかった${missed}件は、お詫びとして、これから1日1件ずつ通常の本数に足してお届けします。`;

  const same = depth.samePair ? `\n\n※ ${depth.samePair}` : '';

  return {
    text: head + why + askHead + askBody + askFoot + makeup + same,
    askedKeys: asks.map((g) => g.key),
  };
}
