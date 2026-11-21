/**
 * ツリーの利点を生かした投稿の試し（2026-11-21 三上様「試して」→「もっとツリー投稿の利点を生かしたような投稿を心がけて。ノウハウにもあったと思うので」）。
 *
 * 経緯
 *  - ツリーの試し（shared/treeTrial.ts・11/3〜11/16）は、ふつうの本文を「最初の1文／残り」に機械的に分けただけで、
 *    店舗の2アカウントでは1本目の表示が下がった（玉島0.81倍・金光0.76倍）。分けるだけでは伸びない。
 *  - ノウハウ（Threads集客講座 第12回・shared/threadsPrompts.ts の【ツリー投稿のルール】）が言うツリーの利点は次の4つ。
 *      1. 1本目はフックだけ（短く強く）。★三上様 11/21「1本目の文章の続きが気になるような形で、思わずコメント欄を開いてしまうような内容をベースに」
 *         → 1本目では答え・結論・理由を言わず、続きを読めば必ず答えがある形にする（「続きは下で」のような場所の案内は書かない＝内容で気にならせる）
 *      2. 2本目で中身（なぜそうなのか・具体例）。短→長の階段。全体で2スクロール分
 *      3. 最後の段に案内（オファー）を分ける。理由つき・URLなし・プロフィールへの間接の案内。あり／なしを交互に
 *      4. 型は3つ：○選／Q&A／言い切り→理由（ストーリー型は作り話になりやすいので、お店の考えを理由で語る形にする）
 *    今回はこの4つを満たす文章を最初から書き、その切れ目で分ける。
 *
 * 決まり
 *  - 学習用の自社3アカウントだけ。期間中は1日1本（契約の本数のすぐ後ろ＝上乗せの1本目の枠）を、3つの型を日替わりで書く。
 *    書くのは既存の「試し」の仕組み（検査はすべて通常どおり）。3回書けなければ、その枠は今までどおりの作り方に戻る。
 *  - 公開のとき、予約の投稿の id で「ツリー／1本のまま」（偶奇）と「案内あり／なし」（2本ごと）を交互にする。
 *    本文は1字も変えない。案内はアカウントごとの決まった1文（プロフィールに実際にある公式LINEの入口だけを指す）。
 *    1本のままの側にも同じ案内を末尾に付ける（比べるのは「分けるかどうか」だけにするため）。
 *  - お客様のアカウントは変えない。広げるかは結果を見て三上様が決める。
 *  - 集計 scripts/ops/tree-design-report.mts。
 */
import type { LearningTrial } from "./learningAccounts";

export const TREE_DESIGN = {
  accountIds: [10, 12, 36] as readonly number[],
  /** JSTの日付。この日から until の日まで（両端を含む） */
  start: "2026-11-22",
  until: "2026-12-19",
  /**
   * 最後の段の案内。プロフィールの文と固定投稿にある言葉だけを使う（2026-11-21 に3アカウントの実物で確認：
   * 10・12「ご予約・ご相談は下の公式LINEから」／12 固定投稿「『まず話を聞きたい』だけでも大丈夫です」／36「無料相談は、下のリンクの公式LINEから」「売り込みはしません」）。
   * URL・料金・効果の約束は書かない。
   */
  offers: {
    10: "ご予約・ご相談は、プロフィールの公式LINEからどうぞ。\n「まず話を聞きたい」だけでも大丈夫です。",
    12: "ご予約・ご相談は、プロフィールの公式LINEからどうぞ。\n「まず話を聞きたい」だけでも大丈夫です。",
    36: "集客の無料相談は、プロフィールの公式LINEからどうぞ。\n売り込みはしません。",
  } as Readonly<Record<number, string>>,
} as const;

export type TreeDesignKey = "tree_rank" | "tree_qa" | "tree_reason";
export const TREE_DESIGN_KEYS: readonly TreeDesignKey[] = ["tree_rank", "tree_qa", "tree_reason"];
export const isTreeDesignKey = (k: unknown): k is TreeDesignKey => TREE_DESIGN_KEYS.includes(k as TreeDesignKey);

const COMMON = [
  "いちばん大事なのは1行目。読んだ人が「え、なぜ？」「それって何？」と続きを知りたくなり、思わずコメント欄（続き）を開く1文にする（30字以内）。そのために、1行目では答え・結論・理由を言わない。問いで止める、意外な事実の入口だけを見せる、「〜には理由があります」「〜は1つだけです」のように中身を伏せる、のどれかにする。大げさにあおらない・うそを書かない（続きを読めば、1行目の答えが必ず書いてあること）。",
  "ただし「続きは」「コメント欄へ」「理由は下で」「このあと紹介」のように、続きの場所を案内する言葉は書かない（内容で気にならせる）。",
  "2行目の最初で、1行目の答えをすぐ書く（じらさない）。",
  "2行目以降が中身。全体で150〜220字。",
  "予約・相談・LINE・プロフィールへの案内や宣伝は書かない（案内は別に付ける）。最後の文は、この投稿の中身にしか当てはまらない一言にする。",
  "湿布・薬・温める／冷やす・マッサージ・他の施術や他店のやり方の良し悪しは言わない。「根本」「原因に届く」のように、効果をにおわせる言葉は使わない。お店が提供していないメニューや道具は書かない。",
  "「。」のたびに改行する決まりはそのまま。",
].join("");

export const TREE_DESIGN_TRIALS: Readonly<Record<TreeDesignKey, LearningTrial>> = {
  tree_rank: {
    key: "tree_rank",
    label: "ツリー設計：BEST3",
    note: "この投稿は「BEST3」の形で書く。1行目は題名：「（読む人の身近な場面や悩み）＋（順位の基準）BEST3」。順位の基準は、書き手の考えだと分かるもの（手軽な順・続けやすい順・気づきにくい順 など）にし、人数・割合・調査・人気の順位のように数えた結果に見える基準にしない。"
      + "題名には順位の中身（3つの名前）を書かない。題名のすぐ下に、第1位について名前を言わずに一言だけ添える（例の形：「1位は、道具がいらないものです。」。うそ・大げさは書かない）。そのあとに「第3位　〇〇」「第2位　〇〇」「第1位　〇〇」の順に書く（必ずこの表記・この順・行の先頭）。順位ごとに1本ずつの投稿に分かれるので、それぞれ、名前のあとに改行して理由や場面を2文（合わせて40〜70字）で書き、その順位だけ読んでも分かるようにする。この型は全体で180〜260字でよい。"
      + "順位にするのは、読む人が今日できる身近なこと、または日常のよくある場面。「やってはいけないこと」「効かないこと」「まちがい」の順位にしない。商品名・研究や成分の話・数字のデータは書かない。順位の行に絵文字や記号は付けない。"
      + COMMON,
  },
  tree_qa: {
    key: "tree_qa",
    label: "ツリー設計：Q&A",
    note: "この投稿は「問いと答え」の形で書く。1行目は、読む人がふだん迷いがちで、答えをすぐ知りたくなる問いを1つだけ（「？」で終える。答えやヒントは1行目に書かない）。"
      + "2行目で答えを一言で示し、そのあと理由を2〜3文、最後に今日できることを1つ書く。"
      + "「お客様からよく聞かれます」「先日こんな質問がありました」のように、実際にあった質問として書くのは、登録情報にその質問が書かれているときだけ。無ければ、読む人の側の疑問として書く。"
      + COMMON,
  },
  tree_reason: {
    key: "tree_reason",
    label: "ツリー設計：気になる一言→理由",
    note: "この投稿は「気になる一言→その理由」の形で書く。1行目は、お店の考え・こだわり（登録された信条にあること）や、読む人の身近な場面について、理由を伏せた一言にする（例の形：「〇〇を、あえて△△にしています。」「〇〇のとき、最初に見るのは1か所だけです。」）。1行目に「から」「ので」「ため」などの理由は書かない。だれか・ほかのお店・ほかのやり方を下げる一言にしない。"
      + "2行目以降で、その理由を、読む人のふだんの場面を1つ挙げて説明する。書き手自身の体験談・お客様の話は作らない。"
      + COMMON,
  },
};

const JST = 9 * 3600_000;
const jstYmd = (now: number) => new Date(now + JST).toISOString().slice(0, 10);

export function inTreeDesign(threadsAccountId: number, now = Date.now()): boolean {
  const ymd = jstYmd(now);
  return TREE_DESIGN.accountIds.includes(Number(threadsAccountId)) && ymd >= TREE_DESIGN.start && ymd <= TREE_DESIGN.until;
}

/** この試しで書く枠：契約の本数のすぐ後ろ（上乗せの1本目）だけ。上乗せが無い日は対象なし */
export function isTreeDesignSlot(threadsAccountId: number, slotIndex: number, contractCount: number, postCount: number, now = Date.now()): boolean {
  return inTreeDesign(threadsAccountId, now) && slotIndex === contractCount && slotIndex < postCount;
}

/** 今日の型。3つを日替わりで回し、同じ日の3アカウントで型がずれるようにする */
export function treeDesignFor(threadsAccountId: number, now = Date.now()): LearningTrial {
  const day = Math.floor((now + JST) / 86400_000);
  const pos = Math.max(0, TREE_DESIGN.accountIds.indexOf(Number(threadsAccountId)));
  return TREE_DESIGN_TRIALS[TREE_DESIGN_KEYS[(day + pos) % TREE_DESIGN_KEYS.length]];
}

/** 交互の割り当て：id が奇数＝ツリー／偶数＝1本のまま */
export function treeDesignArm(postId: number): "tree" | "single" {
  return Number(postId) % 2 === 1 ? "tree" : "single";
}
/** 案内あり／なし：id を2本ずつの組にして交互（ツリー・1本のままの両方に同じ数だけ当たる） */
export function treeDesignOffer(postId: number): boolean {
  return Math.floor(Number(postId) / 2) % 2 === 1;
}

const RANK_LINE = (n: 1 | 2 | 3) => new RegExp(`^[ \\t　]*第\\s*${n === 1 ? "[1１一]" : n === 2 ? "[2２二]" : "[3３三]"}\\s*位`);

/** 行の先頭の「第3位」「第2位」「第1位」が、この順で1回ずつ出てくる本文か。出てくる行の番号を返す */
export function rankingLines(text: string | null | undefined): { l3: number; l2: number; l1: number; lines: string[] } | null {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const find = (n: 1 | 2 | 3) => lines.map((l, i) => (RANK_LINE(n).test(l) ? i : -1)).filter((i) => i >= 0);
  const a3 = find(3), a2 = find(2), a1 = find(1);
  if (a3.length !== 1 || a2.length !== 1 || a1.length !== 1) return null;
  if (!(a3[0] < a2[0] && a2[0] < a1[0])) return null;
  return { l3: a3[0], l2: a2[0], l1: a1[0], lines };
}

/**
 * 順位の表記だけを消した本文（数字の検査用）。行の先頭の「第N位」と「BEST3」「ベスト3」以外の数字には触らない。
 * 本文の途中の「3位」や、人数・割合・回数はそのまま残る（＝検査で止まる）。
 */
export function maskRankLabels(text: string | null | undefined): string {
  return String(text || "")
    .replace(/^([ \t　]*)第\s*[1-3１-３一二三]\s*位/gm, "$1")
    .replace(/(BEST|ＢＥＳＴ|ベスト)\s*[3３]/gi, "$1");
}

export const HOOK_MIN = 12;
export const HOOK_MAX = 80;
export const BODY_MIN = 60;
export const BODY_MAX = 420;
const len = (s: string) => Array.from(s).length;
/** 続きがあることを知らせる言葉（1本目に入っていたらツリーにしない） */
export const TEASER_RE = /続きは|つづきは|このあと|この後で|下で(紹介|解説|説明)|ツリーで|スレッドで|以下で/;

export const RANK_PART_MIN = 12;

/**
 * 本文を「1本目（フック）／続き」に分ける。分けられなければ null（1本のまま出す）。
 *   BEST3：題名（第3位の行より前）／第3位／第2位／第1位（＋結び）の4本
 *          （2026-11-21 三上様「2本目に1〜3位を書くのではなく、2本目に3位、3本目に2位、その次に1位みたいな形で分けて」）
 *   Q&A・気になる一言：1行目／2行目以降 の2本（Q&A は1行目が「？」で終わること）
 * 1本目は短く（12〜80字）、続きの合計より短いこと（短→長の階段）。元の文は1字も変えない。
 */
export function treeDesignSplit(key: string | null | undefined, text: string | null | undefined): string[] | null {
  if (!isTreeDesignKey(key)) return null;
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const join = (from: number, to: number) => lines.slice(from, to).join("\n").trim();
  let cut: number;
  let rest: string[];
  if (key === "tree_rank") {
    const r = rankingLines(text);
    if (!r) return null;
    cut = r.l3;
    rest = [join(r.l3, r.l2), join(r.l2, r.l1), join(r.l1, lines.length)];
    if (rest.some((p) => len(p) < RANK_PART_MIN)) return null;
  } else {
    cut = lines.findIndex((l) => l.trim()) + 1;
    rest = [join(cut, lines.length)];
  }
  if (cut <= 0) return null;
  const hook = join(0, cut);
  if (!hook || rest.some((p) => !p)) return null;
  if (key === "tree_qa" && !/[？?]$/.test(hook)) return null;
  if (TEASER_RE.test(hook)) return null;
  const hl = len(hook), bl = rest.reduce((n, p) => n + len(p), 0);
  if (hl < HOOK_MIN || hl > HOOK_MAX || bl < BODY_MIN || bl > BODY_MAX || hl >= bl) return null;
  return [hook, ...rest];
}

/**
 * 公開するときの形。試しの対象でなければ null（呼び出し側は何も変えない）。
 *   ツリー：分けられれば [フック, 続き…, （案内）]（BEST3 は フック／第3位／第2位／第1位）。分けられなければ1本のまま
 *   1本のまま：[本文（＋案内）]
 */
export function treeDesignSegments(p: { experimentKey?: string | null; threadsAccountId: number; id: number; text: string }): { segments: string[]; arm: "tree" | "single"; offer: boolean } | null {
  if (!isTreeDesignKey(p.experimentKey) || !TREE_DESIGN.accountIds.includes(Number(p.threadsAccountId))) return null;
  const text = String(p.text || "").trim();
  if (!text) return null;
  const offerText = treeDesignOffer(p.id) ? TREE_DESIGN.offers[Number(p.threadsAccountId)] ?? null : null;
  const split = treeDesignArm(p.id) === "tree" ? treeDesignSplit(p.experimentKey, text) : null;
  if (split) return { segments: offerText ? [...split, offerText] : [...split], arm: "tree", offer: !!offerText };
  return { segments: [offerText ? `${text}\n\n${offerText}` : text], arm: "single", offer: !!offerText };
}

/**
 * この試しだけの機械的な検査（11/21 の試し書きで、指示を無視した下書きが自然さの採点を5点で通った：
 *   「よくある落とし穴BEST3／温めすぎ…根本ではありません／強すぎるマッサージ…かえって悪くなる」「姿勢を見直して楽になったという方が多いです」）。
 *   ほかのやり方を下げる話・効果のにおわせ・結果の話・呼びかけ始まり・本文中の案内を止め、型どおりに分けられない下書きも作り直す。
 */
const BANNED: ReadonlyArray<[RegExp, string]> = [
  [/根本|原因に届/, "効果をにおわせる言葉（根本・原因に届く）"],
  [/湿布|温め|冷や|マッサージ|揉[みむ]|もみほぐ|ストレッチのしすぎ/, "ほかのやり方の良し悪し（湿布・温める・冷やす・マッサージ）"],
  [/落とし穴|やってはいけない|やりがち|まちがい|間違い|NG|逆効果|悪化|悪くな/, "「やってはいけないこと・まちがい」の話"],
  [/楽にな|ラクにな|良くなった|変わったという|という方が多い|喜ばれ/, "お客様の結果・効果の話（楽になる等）"],
  [/体は変わ|変わっていきま|整えていきま|整えます|お任せ/, "効果を約束する言い方（体は変わる・整えていきます）"],
  [/プロフィール|公式LINE|ご予約|予約は|ご相談は|お問い合わせ|ぜひ[。！\n]|お越し|お待ちして/, "本文の中の案内・宣伝"],
];

export function treeDesignProblems(key: string | null | undefined, text: string | null | undefined): string[] {
  if (!isTreeDesignKey(key)) return [];
  const s = String(text || "");
  const out: string[] = [];
  for (const [re, label] of BANNED) if (re.test(s)) out.push(`${label}が入っている。書かない`);
  const first = s.split("\n").find((l) => l.trim())?.trim() ?? "";
  if (/(あなた|方|人|さん)へ[。！]?$/.test(first)) out.push("1行目が「〜な方へ」の呼びかけになっている。呼びかけで始めない");
  // 1本目で答えを言ってしまうと、続きを開く理由が無くなる（11/21 試し書き：「それ、実は腕の使い方が原因かもしれません。」）
  const hookPart = treeDesignSplit(key, s)?.[0] ?? first;
  if (key !== "tree_rank" && /が(原因|理由)(です|でした|かも|なんです)|が関係してい|のせいです/.test(hookPart)) out.push("1本目で答え（原因・理由の中身）を言ってしまっている。1本目は答えを伏せ、2行目で書く");
  if (key === "tree_reason" && /(から|ので|ため)[、。]/.test(first)) out.push("1行目に理由（〜から・〜ので・〜ため）を書いてしまっている。1行目は理由を伏せ、2行目以降で書く");
  if (key === "tree_rank") {
    const r = rankingLines(s);
    const head = r ? r.lines.slice(0, r.l3).join("\n") : "";
    const names = r ? [r.l3, r.l2, r.l1].map((i) => r.lines[i].replace(RANK_LINE(1), "").replace(RANK_LINE(2), "").replace(RANK_LINE(3), "").trim()).filter((n) => Array.from(n).length >= 3) : [];
    if (names.some((n) => head.includes(n))) out.push("題名のところに順位の中身（名前）を書いてしまっている。1本目では中身を伏せる");
  }
  if (!treeDesignSplit(key, s)) {
    out.push(key === "tree_rank"
      ? "形が合っていない。1行目に題名と一言（合わせて80字以内）、続けて行の先頭に「第3位」「第2位」「第1位」をこの順で1回ずつ書く"
      : key === "tree_qa"
        ? "形が合っていない。1行目は「？」で終わる短い問い（80字以内）だけにし、2行目以降に答えと理由を60字以上書く"
        : "形が合っていない。1行目は理由を伏せた短い一言（80字以内）だけにし、2行目以降に理由を60字以上書く（1行目より長く）");
  }
  return out;
}
