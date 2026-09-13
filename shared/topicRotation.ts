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
  // 読点・接続で終わる（「〜方に、」「〜ので」「〜して」「〜が」…）
  if (/[、,，]$/.test(s)) return true;
  if (/(て|で|に|が|は|を|と|も|や|ば|し|から|ので|けど|けれど)$/.test(s)) return true;
  // 開いたままの括弧
  if ((s.match(/[（(]/g) || []).length !== (s.match(/[）)]/g) || []).length) return true;
  return false;
}

/**
 * 箇条書き・改行で区切られた項目に分ける。
 * 1つでも「文の途中」の行が混ざっていたら、箇条書きではなく文章とみなして空を返す
 * （＝日替わりの指定はせず、今までどおり全体をそのまま使わせる）。
 *
 * ★読点「、」では分けない。「腰痛や膝の痛み、ケガ（捻挫、肉離れ、突き指）」のような
 *   1項目の中の読点まで切れてしまうため。
 */
export function splitTopics(text: string | null | undefined): string[] {
  const raw = String(text ?? "");
  if (!raw.trim()) return [];
  const items = raw
    .split(/\r?\n|[・･]/)
    .map((s) => s.replace(/^\s*[-–—*●○◯□■▪️✓✔]\s*/, "").replace(/^\s*\d+[.)．）]\s*/, "").trim())
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
