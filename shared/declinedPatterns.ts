/**
 * オーナーが続けて見送った投稿から「共通点」を取り出す（2026-09-24 三上様指示）。
 *
 * > 「相手に3案送って見送った場合に、何がその見送る原因になったのかを、
 * >   質問もしくはどのような形でもいいので見つけるようにしてください。
 * >   仕組みの方を直してください」
 *
 * ★きっかけ（香取様 acc21・実データ）
 *
 * 9/23 に初めて3案をお送りしたが、3案とも見送られた。3案の中身は
 *   「その腰痛、揉むだけでは根本は変わりません。…〇〇市で11年」
 *   「『痛い場所だけ揉んでも…』…〇〇市で11年」
 *   「…11年の経験から、根本を見ます」
 * で、それまでに見送られた12本とほぼ同じ主張だった。見送られた12本のうち
 *   「11年」7本 ／「痛い場所だけ揉んでも」系 4本 ／「根本は変わりません」3本 ／
 *   「昔の私も・マッサージばかり」4本
 * が繰り返し出ている。
 *
 * 出どころは、ご登録の「信条」（痛い場所をマッサージするだけでは良くなりません）と
 * 「実績」（整形外科で11年勤務）と「文体のお手本」（マッサージだけでは腰痛は良くなりません）。
 * 9/21 の直し（beliefProofRotation）は「直近の投稿と同じ言い回しなら渡さない」だったため、
 * AIが「揉むだけ」「揉んでも」と言い換えると素通りしていた。
 *
 * ここでは「言い換え」に強い形で、見送られた投稿どうしに共通する言い回しを取り出す。
 * 1本だけに出た言葉は拾わない（たまたまの一致で、ふつうの言葉まで禁止にしないため）。
 * お店の名前・地名は拾わない（この店らしさの必須条件＝identityGuard を壊さないため）。
 */

/** 漢字・カタカナ・数字（＝意味を持つ文字） */
const MEANINGFUL = /[一-鿿゠-ヿ0-9０-９]/g;

/** 候補にしない、どの投稿にも出るつなぎの言い回し */
const GENERIC = /^(ありますか|ありません|ています|でしょうか|ください|ではなく|だけでは|ですか|ました)$/;

/** 比べやすい形にそろえる（空白・改行・絵文字・記号を外す） */
export function normalizeForPatterns(text: string): string {
  return String(text || "")
    .replace(/[\uD83C-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]\uFE0F?/g, "")
    .replace(/[\s　]+/g, "")
    // ★「ー」（長音）は記号ではない。外すと「マッサージ」が「マッサ|ジ」に切れて拾えない
    .replace(/[「」『』（）()【】…・、。！？!?,.:：;；~〜－\-]+/g, "|");
}

/** その言い回しが「意味を持つ」か（漢字・カタカナ・数字が2文字以上） */
function isMeaningful(s: string): boolean {
  if (s.includes("|")) return false; // 句読点をまたぐものは言い回しではない
  if (GENERIC.test(s)) return false;
  return (s.match(MEANINGFUL) ?? []).length >= 2;
}

/**
 * 守る言葉（店名・地名・地元の言葉）を、比べやすい単位に分ける。
 * 住所は「〇〇県／〇〇市／〇〇町」のように、都道府県・市区町村の区切りでも分ける
 * （住所まるごとだと、本文の「〇〇市で」と一致しないため）。
 */
export function protectTokensOf(protect: readonly (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const raw of protect) {
    for (const part of String(raw ?? "").split(/[\s、,，\n]+/)) {
      const n = normalizeForPatterns(part).replace(/\|/g, "");
      if (n.length >= 2) out.add(n);
      for (const m of n.match(/[^都道府県市区町村郡]+?[都道府県市区町村郡]/g) ?? []) if (m.length >= 2) out.add(m);
      const rest = n.replace(/^.*[都道府県市区町村郡]/, "").replace(/[0-9０-９]+丁目.*$/, "");
      if (rest.length >= 2) out.add(rest);
    }
  }
  return Array.from(out).sort((a, b) => b.length - a.length);
}

export interface DeclinedPatterns {
  /** プロンプトに出す代表的な言い回し（長い順・重なりを除いたもの） */
  top: string[];
  /** 照合用（短いものも含む）。信条・実績・お手本の文を外す判定に使う */
  all: string[];
  /** 何本の見送りから取り出したか */
  sampleSize: number;
}

/**
 * 見送られた投稿どうしに共通する言い回しを取り出す。
 *
 * @param declined 見送られた投稿の本文（新しい順・10本程度）
 * @param protect  拾ってはいけない言葉（店名・地名など）。これに含まれる言い回しは除く
 */
export function extractDeclinedPatterns(
  declined: readonly string[],
  protect: readonly string[] = [],
  opts: {
    minLen?: number; maxLen?: number; maxTop?: number;
    /**
     * ご本人が「話したいこと」として登録した欄（お客さん像・お悩み・強み・N1顧客像など）。
     * ここに書かれている言い回しは避ける対象にしない。
     * ★香取様では「スポーツのケガ」（強みに登録）が見送りに何度も出ていたため拾われかけた。
     *   お店の主題まで禁止すると書くことが無くなる。くり返し見送られているのは
     *   信条・実績・お手本から来た「主張」の方で、主題ではない。
     */
    topics?: readonly (string | null | undefined)[];
  } = {},
): DeclinedPatterns {
  const minLen = opts.minLen ?? 4;
  const maxLen = opts.maxLen ?? 14;
  const maxTop = opts.maxTop ?? 6;
  const docs = declined.map(normalizeForPatterns).filter((d) => d.replace(/\|/g, "").length >= 8);
  const empty: DeclinedPatterns = { top: [], all: [], sampleSize: docs.length };
  if (docs.length < 2) return empty;

  // 2本以上、かつ見送りの2割以上に出た言い回しだけを拾う
  const minDocs = Math.max(2, Math.ceil(docs.length * 0.2));
  const protectTokens = protectTokensOf(protect);
  // ★守る言葉（店名・地名）は、数える前に本文から外す。
  //   外さないと「〇〇市で」「〇〇市で11年」のように地名を含む言い回しが拾われ、
  //   「地名を書くな」と読める指示になる（この店らしさ＝identityGuard は地名が要る）。
  const cleaned = docs.map((d) => protectTokens.reduce((acc, t) => acc.split(t).join("|"), d));

  const df = new Map<string, number>();
  for (const d of cleaned) {
    const seen = new Set<string>();
    const chars = Array.from(d);
    for (let i = 0; i < chars.length; i++) {
      for (let len = minLen; len <= maxLen && i + len <= chars.length; len++) {
        const s = chars.slice(i, i + len).join("");
        if (seen.has(s)) continue;
        seen.add(s);
      }
    }
    seen.forEach((s) => df.set(s, (df.get(s) ?? 0) + 1));
  }

  const topicNorm = (opts.topics ?? []).map((t) => normalizeForPatterns(String(t ?? ""))).filter(Boolean);
  const isTopic = (s: string) => topicNorm.some((t) => t.includes(s));
  const all = Array.from(df.entries())
    .filter(([s, n]) => n >= minDocs && isMeaningful(s) && !isTopic(s))
    .map(([s, n]) => ({ s, n }));

  // 代表：ほかの言い回しに含まれない「いちばん長い形」だけを残す（「場所だけ」のような切れ端を出さない）。
  //   並びは「本数×長さ」。何度も出ている長い言い回しほど先に出す。
  const maximal = all.filter(({ s }) => !all.some((o) => o.s !== s && o.s.includes(s)));
  const picked: string[] = [];
  for (const { s } of maximal.sort((a, b) => b.n * b.s.length - a.n * a.s.length)) {
    // ★14字を超える言い回しは、1字ずつずれた窓がいくつも「いちばん長い形」として残る
    //   （「昔の私もマッサージばかりして」「の私もマッサージばかりしてい」…）。
    //   すでに選んだものと6字以上重なるものは同じ言い回しとみなして飛ばす。
    if (picked.some((p) => p.includes(s) || s.includes(p) || commonRun(p, s) >= 6)) continue;
    picked.push(s);
    if (picked.length >= maxTop) break;
  }

  // ★決め数字（「11年」など）は単独でも出す。長い言い回しの中に埋もれると、
  //   「〇〇市で11年」「整形外科で11年」のように言い換えられて素通りするため。
  const numberDf = new Map<string, number>();
  for (const d of cleaned) {
    Array.from(new Set(d.match(/[0-9０-９]+(?:年|回|人|件|%|％|割|か月|ヶ月)/g) ?? [])).forEach((m) => {
      numberDf.set(m, (numberDf.get(m) ?? 0) + 1);
    });
  }
  const numbers = Array.from(numberDf.entries()).filter(([m, n]) => n >= minDocs && !isTopic(m)).map(([m]) => m);

  // 先頭の助詞1字（「を大切にして」「た先輩が」の「を」「た」）は、読みやすさのために外す
  const tidy = (x: string) => {
    const ch = Array.from(x);
    return /^[をにでがはのとたもへや]$/.test(ch[0]) && /[^\u3040-\u309F]/.test(ch[1] ?? "") && ch.length - 1 >= minLen
      ? ch.slice(1).join("") : x;
  };
  const top = Array.from(new Set([...numbers, ...picked.map(tidy)])).slice(0, maxTop + numbers.length);
  return {
    top,
    all: [...numbers, ...all.sort((a, b) => b.s.length - a.s.length).map((x) => x.s)],
    sampleSize: docs.length,
  };
}

/** 2つの文字列に共通する、いちばん長いつながりの字数 */
function commonRun(a: string, b: string): number {
  const x = Array.from(a), y = Array.from(b);
  let best = 0;
  const prev = new Array(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i++) {
    let diag = 0;
    for (let j = 1; j <= y.length; j++) {
      const tmp = prev[j];
      prev[j] = x[i - 1] === y[j - 1] ? diag + 1 : 0;
      if (prev[j] > best) best = prev[j];
      diag = tmp;
    }
  }
  return best;
}

/** その文が、見送られた投稿の共通点に触れているか */
export function touchesDeclined(text: string | null | undefined, patterns: DeclinedPatterns): boolean {
  if (!text || patterns.all.length === 0) return false;
  const t = normalizeForPatterns(text);
  return patterns.all.some((p) => t.includes(p));
}

/**
 * 文体のお手本から、見送られた主張に触れている文だけを外す。
 * 口調（語尾・改行・長さ）の見本としての役目は、残りの文で保つ。
 * 全部の文が外れた場合は空を返す（口調の癖は別途 styleTraits で数えて渡している）。
 */
export function filterStyleSamples(styleSamples: string | null | undefined, patterns: DeclinedPatterns): string {
  const raw = String(styleSamples || "");
  if (!raw.trim() || patterns.all.length === 0) return raw;
  const blocks = raw.split(/\n?-{3,}\n?/);
  const kept = blocks
    .map((b) => b
      .split(/(?<=[。！？!?\n])/)
      .filter((sentence) => !touchesDeclined(sentence, patterns))
      .join("")
      .trim())
    .filter((b) => b.replace(/\s/g, "").length >= 6);
  return kept.join("\n---\n");
}

/** 見送りの理由（公式LINEのボタン） */
export const SKIP_REASONS = {
  same: { label: "同じような内容ばかり", note: "オーナーから「同じような内容ばかり」と言われている。直近の投稿と違う材料（N1顧客像・強み・季節・よくあるご質問）から書く。同じ主張を言い換えて繰り返さない。" },
  claim: { label: "言っていることが違う", note: "オーナーから「言っていることが違う（当院の考えと違う）」と言われている。見送られた投稿の主張は使わない。信条・実績を主張としてそのまま書かない。" },
  tone: { label: "口調・言い回しが違う", note: "オーナーから「口調・言い回しが違う」と言われている。文体のお手本の語尾・文の長さに寄せる。決め台詞や、毎回同じ問いかけで締める形は使わない。" },
  length: { label: "長い・読みにくい", note: "オーナーから「長い・読みにくい」と言われている。短く、伝えることは1つだけにする。" },
  today: { label: "今日は出したくないだけ", note: "" },
  text: { label: "文章で伝える", note: "" },
} as const;

export type SkipReasonCode = keyof typeof SKIP_REASONS;

export function isSkipReasonCode(v: unknown): v is SkipReasonCode {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(SKIP_REASONS, v);
}

/** 3案をまとめて見送ったあとに、理由をお聞きする文 */
export const SKIP_REASON_QUESTION =
  "よろしければ、見送った理由を1つだけ教えてください。明日の案に反映します。\n" +
  "（押さなくても大丈夫です。その場合も、見送った投稿の共通点を自動で読み取って避けます）";

/** 理由を受け取ったあとのお返事 */
export function skipReasonThanks(code: SkipReasonCode, text?: string | null): string {
  if (code === "today") return "承知しました。内容の問題ではないとして扱います。明日の朝、また新しい案をお届けします。";
  if (code === "text" && text) return `ありがとうございます。いただいた内容（「${text.slice(0, 60)}${text.length > 60 ? "…" : ""}」）を、明日からの投稿づくりでいちばん優先します。`;
  return `ありがとうございます。「${SKIP_REASONS[code].label}」を、明日からの投稿づくりに反映します。`;
}

/**
 * 生成プロンプトに足す「見送りから分かったこと」。
 * 共通点が無く、理由も届いていなければ空文字。
 */
export function buildDeclinedNote(params: {
  patterns: DeclinedPatterns;
  reasons: Array<{ reason: string; reasonText?: string | null }>;
  declinedHeads?: string[];
}): string {
  const lines: string[] = [];
  const texts = params.reasons.filter((r) => r.reason === "text" && r.reasonText).map((r) => String(r.reasonText));
  for (const t of texts.slice(0, 3)) lines.push(`- ★オーナーの言葉（いちばん優先して守る）：「${t.slice(0, 200)}」`);
  const codes = Array.from(new Set(params.reasons.map((r) => r.reason))).filter(isSkipReasonCode);
  for (const c of codes) if (SKIP_REASONS[c].note) lines.push(`- ${SKIP_REASONS[c].note}`);
  if (params.patterns.top.length > 0) {
    lines.push(
      `- 次の言い回しは、見送られた投稿に何度も出ている。使わない。言い換えて同じことを言うのも不可：` +
      params.patterns.top.map((p) => `「${p.replace(/\|/g, "")}」`).join(""),
    );
  }
  const heads = (params.declinedHeads ?? []).filter(Boolean).slice(0, 3);
  if (heads.length > 0) {
    lines.push("- 見送られた投稿の書き出し（この方向の主張・話題は今日は書かない）：\n" + heads.map((h) => `  ・${h}`).join("\n"));
  }
  if (lines.length === 0) return "";
  return `\n\n【★オーナーが続けて見送った投稿から分かったこと（最優先・厳守）】\n${lines.join("\n")}`;
}
