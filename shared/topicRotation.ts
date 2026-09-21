/**
 * 登録された「お悩み」「強み」を日替わりで1つずつ取り上げる（2026-09-14）。
 *
 * 事実：直近30日で ✕（この方向性は違う）が付いた24本のうち17本が、たった2名に集中していた。
 *  - 香取様（userId 3500・8本すべて✕）：お悩みは3行（スポーツのケガ／慢性の腰痛膝痛／交通事故）
 *    登録されているのに、8本とも「整形外科で11年」＋「痛む場所だけ触っても根本は変わらない」だった。
 *    ご本人からも「ここ数日は同じ内容でした」とご指摘をいただいている（supportQuestions #30）。
 *  - 岩根様（userId 5443・9本すべて✕）：強みに「お茶・お琴・踊りをされている方に」と書かれているのに、
 *    9本とも「敷居が高い」＋「本物の正絹」だった。
 *
 * 材料はプロンプトに全部渡っているのに、毎回いちばん上の1つだけが使われていた。
 * そこで「今日はこれを取り上げる」を日替わりで1つ選んで、はっきり渡す。
 * 1つしか登録が無い方には何もしない（今までどおり）。
 */

/**
 * 文の途中で改行されただけの行か（箇条書きの1項目ではない）。
 *
 * ★岩根様の「強み」は
 *     本物の正絹の着物を扱っている。／お茶をされている方に、／お琴をされている方に、／購入して頂いて
 *   のように1つの文が改行で折り返されている。これを項目として取り出すと
 *   「今日使う強みは『購入して頂いて』」という無茶な指示になる。
 */
function looksLikeFragment(s: string): boolean {
  // ★末尾の読点だけでは「文の途中」と決めない。
  //   氷見様の悩みの1行目「…手術を勧められた方、」は、読点で終わっているが1項目として完結している。
  //   見るのは、読点を取り除いたあとに助詞・接続で終わっているか（「〜方に」「〜ので」「〜して」）。
  const body = s.replace(/[、,，]+$/, "");
  if (!body) return true;
  if (/(て|で|に|が|は|を|と|も|や|ば|し|から|ので|けど|けれど)$/.test(body)) return true;
  // 開いたままの括弧
  if ((body.match(/[（(]/g) || []).length !== (body.match(/[）)]/g) || []).length) return true;
  return false;
}

/**
 * 箇条書き・改行で区切られた項目に分ける。
 * 1つでも「文の途中」の行が混ざっていたら、箇条書きではなく文章とみなして空を返す
 * （＝日替わりの指定はせず、今までどおり全体をそのまま使わせる）。
 *
 * ★分けるのは改行だけ。読点「、」や中黒「・」では分けない。
 *   「腰痛や膝の痛み、ケガ（捻挫、肉離れ、突き指）」「自律神経の乱れ・不眠」のように、
 *   1項目の中で使われていることの方が多く、切ると意味が欠ける。
 *   行頭の「・」は箇条書きの印なので、下で取り除く。
 */
export function splitTopics(text: string | null | undefined): string[] {
  const raw = String(text ?? "");
  if (!raw.trim()) return [];
  const items = raw
    .split(/\r?\n/)
    .map((s) => s.replace(/^\s*[-–—*●○◯□■▪️✓✔・･]\s*/, "").replace(/^\s*\d+[.)．）]\s*/, "").trim())
    .filter((s) => s.length >= 4)
    // 同じものは1つに（前後の空白・記号の違いを無視）
    .filter((s, i, a) => a.findIndex((t) => t.replace(/[\s。、．，!！?？]/g, "") === s.replace(/[\s。、．，!！?？]/g, "")) === i)
    .slice(0, 8);
  if (items.length <= 1) return items;
  if (items.some(looksLikeFragment)) return [];
  return items;
}

/**
 * 今日この枠で取り上げる項目。
 * 項目が1つ以下なら空文字（＝いつもどおり、全体をそのまま使わせる）。
 */
export function pickRotatingTopic(text: string | null | undefined, index: number): string {
  const items = splitTopics(text);
  if (items.length <= 1) return "";
  const i = Number.isFinite(index) ? Math.abs(Math.trunc(index)) : 0;
  return items[i % items.length];
}

/**
 * 「信条」「実績」が、直近の投稿ですでに使われているか（2026-09-21）。
 *
 * 悩み・強み・N1顧客像は日替わりで回しているのに、信条（belief）と実績（proof）だけは
 * 回りもせず、しかも信条には「投稿に一貫してにじませる」という強い指示が付いていた。
 * そのため毎回この2つが本文に出て、重複ガードに弾かれ続ける方が出ていた。
 *
 * 香取様（acc21）の実データ：
 *   信条「痛い場所をマッサージするだけでは良くなりません。昔はマッサージばかりやっていた。」
 *   実績「整形外科で11年勤務」
 *   → 直近の投稿は「痛い場所だけ揉んでも、一時的になりがちです」「整形外科で11年勤務して分かった」。
 *     9/21 は4回とも差し戻され、1日1件のご契約のため公開ゼロになった。
 *
 * すでに使われているなら、その日は渡さない（渡さなければ、AIはN1顧客像や強みなど
 * 別の材料から書くしかなくなる）。ガードは緩めない。
 *
 * 判定は findRepeatedPhrase をそのまま使う。ただし比べるのは「設定に書かれた一文」と
 * 「直近の投稿」なので、投稿どうしを比べるときより短い一致（6文字）でも十分な合図になる。
 */
export function usedInRecentPosts(
  text: string | null | undefined,
  recentPosts: readonly string[],
  minChars: number = 6,
): boolean {
  const v = String(text ?? "").trim();
  if (!v || recentPosts.length === 0) return false;
  // 循環importを避けるため、ここでは require ではなく同じ判定を持つ関数を使う
  return findRepeatedPhraseForSetting(v, recentPosts, minChars) !== null;
}

/** usedInRecentPosts 専用の最長一致（jpQualityGuard の findRepeatedPhrase と同じ考え方） */
function findRepeatedPhraseForSetting(
  text: string,
  recentTexts: readonly string[],
  minChars: number,
): string | null {
  const plain = (s: string) =>
    String(s || "")
      .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
      .replace(/[\s　]/g, "")
      .replace(/[、。！？!?・「」『』（）()…‥~〜\-—:：;；'"”“]/g, "")
      .replace(/[\uD800-\uDFFF]/g, "");
  // 漢字・カタカナが2文字以上含まれる一致だけを拾う（「しています」のような機能語で誤爆しない）
  const meaningful = (hit: string) => (hit.match(/[一-龠々ァ-ヶ]/g) ?? []).length >= 2;
  const a = Array.from(plain(text));
  if (a.length < minChars) return null;
  for (const r of recentTexts) {
    const b = plain(r);
    if (b.length < minChars) continue;
    for (let i = 0; i + minChars <= a.length; i++) {
      let len = minChars;
      if (!b.includes(a.slice(i, i + len).join(""))) continue;
      while (i + len < a.length && b.includes(a.slice(i, i + len + 1).join(""))) len++;
      const hit = a.slice(i, i + len).join("");
      if (meaningful(hit)) return hit;
    }
  }
  return null;
}
