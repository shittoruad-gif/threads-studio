/**
 * 「同じような内容ばかり」を、言い回しではなく「話題」の単位で止める（2026-09-25 三上様指示）。
 *
 * > 「クライアントから同じような意見が何度も出ているので修正して」
 *
 * ★きっかけ（プレステージ様 acc22・実データ）
 *
 * 9/24〜9/25 に「同じような内容ばかり」で4回見送られた。直近の投稿はほぼすべてが
 *   「未経験で技術を覚えられるか不安 → 先輩も最初は不安 → 2年で役職に → スタッフが優しい」
 * の同じ流れだった。9/25 10:31 に見送った直後の「代わりを作る」（10:33）も同じ流れで、10:48 にまた見送られた。
 *
 * 9/24 の直し（declinedPatterns.ts）は「見送られた投稿に共通する言い回し」を禁止するもので、
 * 「最初は不安でした」を禁止しても「『技術、覚えられるかな』って不安でした」と言い換えれば通っていた。
 * しかも出どころは、ご登録の
 *   N1顧客像（3行とも「未経験→役職・指名」）、お客様の声（「スタッフが優しく」「変化を一緒に喜べる」）
 * で、この2欄はプロンプトで「そのまま使う」「★最優先で1〜2個使う」と指示されているうえ、
 * 「お店の主題」として禁止の対象から外していた。材料そのものは豊富（勉強会・賞与・産休育休・体質別エステ・
 * 3店の雰囲気・カジュアル面談…）なのに、毎回同じ2欄から書いていた。
 *
 * ここでは次の2つを作る。
 *  1. 直近の投稿の多くに出ている「話題の言葉」（未経験・不安・役職…）＝今日は触れない
 *  2. ご登録の材料のうち、まだ使っていないものを1つ＝今日の主題
 * 使うのは「同じような内容ばかり」と言われた方だけ（ふつうのお客様の生成は変わらない）。
 */

import { looksLikeFragment } from "./topicRotation";

/** 漢字・カタカナの2字以上のつながり（＝話題を表す言葉の候補） */
const WORD_RUN = /[一-龠々ァ-ヶー]{2,}/g;

/**
 * 話題の言葉として数えない、どの投稿にも出るふつうの言葉。
 * ★ここに業種の言葉（エステ・整体…）は入れない。業種・店名・地名は protect で外す。
 */
const COMMON = new Set([
  "客様", "一緒", "大切", "自分", "気持", "本当", "毎日", "今日", "場所", "仕事", "最初", "時間",
  "大丈夫", "安心", "笑顔", "理想", "一番", "当院", "当店",
  // 場所の言い方（この店らしさ＝identityGuard が地名・場所を求めるので、禁止にしない）
  "駅前", "駅近", "地元", "地域",
]);

function norm(text: string): string {
  return String(text ?? "")
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
    .replace(/[\s　]+/g, "");
}

/** 文に出てくる話題の言葉（漢字・カタカナ2字以上） */
export function topicWordsOf(text: string): string[] {
  return Array.from(new Set(norm(text).match(WORD_RUN) ?? [])).filter((w) => !COMMON.has(w) && !/^ー/.test(w));
}

/** 店名・地名・業種・対象のお客様など、毎回出てよい言葉を細かく分ける */
function protectWordsOf(protect: readonly (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const raw of protect) {
    for (const w of topicWordsOf(String(raw ?? ""))) {
      out.add(w);
      // 「横須賀中央駅」→「横須賀」「中央」のように、区切りでも分ける（本文は略して書くことが多い）
      for (const m of w.match(/[^都道府県市区町村郡駅店]+[都道府県市区町村郡駅店]?/g) ?? []) if (m.length >= 2) out.add(m.replace(/[都道府県市区町村郡駅店]$/, ""));
    }
  }
  return Array.from(out).filter((w) => w.length >= 2);
}

/**
 * 言葉を言い換えても同じに見える「流れの型」（2026-09-26 三上様指示「また同じものばかり」）。
 *
 * ★きっかけ：9/25 夜に上の「話題の言葉」を入れたあとも、同じ求人アカウントで
 *   「覚えるのが大変そう？／難しそう／自分にできるかな → 先輩が教える → 一緒にプロを目指しませんか」
 *   が続き、また「同じ」で見送られた。「覚えられる」「できるかな」はかなを含むので、
 *   漢字・カタカナの言葉を数える上の仕組みでは拾えない。流れの入り口と締めを型として数える。
 */
export const FRAMES = [
  {
    key: "worry",
    where: "head" as const,
    re: /不安|できるかな|できるか[？?]|できるのか|覚えられ|覚えるのが|覚えることが|難しそう|大変そう|自分にでき|ついていけ|向いてるか|向いているか|未経験/,
    note: "書き出しを「不安・難しそう・大変そう・自分にできるかな・覚えられるか・未経験」から入らない。「不安→教えてもらえる→大丈夫」の流れは直近で何度も使っているので、今日は書かない。",
  },
  {
    key: "invite",
    where: "tail" as const,
    re: /目指しませんか|目指しましょう|一緒に成長|成長しませんか|成長を応援|踏み出しませんか|一緒に働きませんか/,
    note: "締めを「一緒に◯◯を目指しませんか／成長しませんか／成長を応援します」にしない。締めはこの投稿の内容に固有の1文にする。",
  },
];
export type FrameKey = (typeof FRAMES)[number]["key"];

function headOf(text: string): string {
  return String(text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 2).join("");
}
function tailOf(text: string): string {
  return String(text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(-2).join("");
}

/** その文が当たっている型（書き出しの型は先頭2行、締めの型は末尾2行で見る） */
export function framesOf(text: string, keys?: readonly string[]): FrameKey[] {
  return FRAMES
    .filter((f) => !keys || keys.includes(f.key))
    .filter((f) => f.re.test(f.where === "head" ? headOf(text) : tailOf(text)))
    .map((f) => f.key);
}

/** 材料の1行・お手本の1文など、短い文がその型の言い回しを含むか（位置は問わない） */
export function lineHitsFrames(line: string, keys: readonly string[]): boolean {
  return FRAMES.some((f) => keys.includes(f.key) && f.re.test(String(line ?? "")));
}

export interface FreshTopicPlan {
  /** 直近の投稿の多くに出ている話題の言葉（今日は触れない）。多い順 */
  overused: string[];
  /** 直近の投稿の多くが当たっている流れの型（今日は使わない） */
  frames?: FrameKey[];
  /** 今日の主題（まだ使っていない材料から1つ）。候補が無ければ null */
  topic: string | null;
  /** 何本の投稿から数えたか */
  sampleSize: number;
}

/**
 * 直近の投稿から「使いすぎの話題」を数え、まだ使っていない材料を1つ選ぶ。
 *
 * @param recentPosts 直近の投稿（公開・確認待ち・見送りを含む、新しい順）
 * @param materials   ご登録の材料（1行＝1項目）
 * @param protect     毎回出てよい言葉（店名・地名・業種・対象のお客様）
 * @param index       同じ日の枠ごとに別の材料を選ぶための番号
 */
export function planFreshTopic(params: {
  recentPosts: readonly string[];
  materials: readonly (string | null | undefined)[];
  protect: readonly (string | null | undefined)[];
  index?: number;
  maxOverused?: number;
}): FreshTopicPlan {
  const docs = params.recentPosts.map(norm).filter((d) => d.length >= 10).slice(0, 12);
  const empty: FreshTopicPlan = { overused: [], frames: [], topic: null, sampleSize: docs.length };
  if (docs.length < 4) return empty;

  // 流れの型：直近の3割以上（最低3本）が同じ入り方・締め方なら、今日は使わない（改行を残した原文で見る）
  const raws = params.recentPosts.filter((t) => norm(t).length >= 10).slice(0, 12);
  const minFrameDocs = Math.max(3, Math.ceil(raws.length * 0.3));
  const frames = FRAMES.map((f) => f.key)
    .filter((k) => raws.filter((t) => framesOf(t, [k]).length > 0).length >= minFrameDocs);

  const protect = protectWordsOf(params.protect);
  const isProtected = (w: string) => protect.some((p) => p.includes(w) || w.includes(p));

  // 言葉ごとに「何本の投稿に出たか」を数える（「役職」は「役職者」の投稿でも出たと数える）
  const candidates = new Set<string>();
  for (const d of docs) for (const w of topicWordsOf(d)) candidates.add(w);
  const df = new Map<string, number>();
  candidates.forEach((w) => {
    if (isProtected(w)) return;
    const n = docs.filter((d) => d.includes(w)).length;
    df.set(w, n);
  });

  // ★直近の3割以上（最低3本）に出ている言葉を「使いすぎ」とする。
  //   プレステージ様の直近10本（9/25 実測）は「技術」「不安」「スタッフ」5本、「先輩」「異業種」4本、
  //   「未経験」「役職」3本。4割（4本）で切ると「未経験」「役職」が漏れ、試しに作った案にまだ出ていた。
  const minDocs = Math.max(3, Math.ceil(docs.length * 0.3));
  const frequent = Array.from(df.entries()).filter(([, n]) => n >= minDocs).sort((a, b) => b[1] - a[1] || a[0].length - b[0].length);
  // 長い言葉は、それを含む短い言葉が選ばれていれば要らない（「役職者」は「役職」で足りる）
  const overused: string[] = [];
  for (const [w] of frequent) {
    if (overused.some((o) => w.includes(o))) continue;
    overused.push(w);
    if (overused.length >= (params.maxOverused ?? 8)) break;
  }
  if (overused.length === 0 && frames.length === 0) return empty;

  // 材料を1行ずつに分け、「使いすぎの言葉を含む数」と「直近の投稿での使われ具合」で並べる
  const items: string[] = [];
  for (const m of params.materials) {
    for (const line of String(m ?? "").split(/\r?\n/)) {
      const s = line.replace(/^\s*[-–—*●○◯□■・･]\s*/, "").trim();
      if (s.length < 4) continue;
      // 文の途中で改行されただけの行（「お茶をされている方に、」）は主題にできない
      if (looksLikeFragment(s.replace(/[。．.]$/, ""))) continue;
      if (items.some((x) => norm(x) === norm(s))) continue;
      items.push(s);
    }
  }
  const scored = items.map((s) => {
    const words = topicWordsOf(s).filter((w) => !isProtected(w));
    const hitOverused = overused.filter((o) => norm(s).includes(o)).length;
    // その材料の言葉が、直近の投稿にどれだけ出ているか（0〜1）
    const used = words.length === 0 ? 1 : words.filter((w) => docs.some((d) => d.includes(w))).length / words.length;
    // 使いすぎの型の言い回しを含む材料（「技術を覚えられるか不安」）は主題にしない
    const hitFrame = lineHitsFrames(s, frames) ? 2 : 0;
    return { s, score: hitOverused * 2 + hitFrame + used, words: words.length };
  }).filter((x) => x.words > 0);
  if (scored.length === 0) return { ...empty, overused, frames };
  const best = Math.min(...scored.map((x) => x.score));
  // いちばん使われていない材料の中から、枠ごとに順に選ぶ（同じ日の3案が同じ主題にならないように）
  const pool = scored.filter((x) => x.score <= best + 0.34);
  const i = Math.abs(Math.trunc(params.index ?? 0)) % pool.length;
  const topic = pool[i].score < 2 ? pool[i].s : null; // 使いすぎの言葉を含む材料しか無ければ指定しない
  return { overused, frames, topic, sampleSize: docs.length };
}

/** 下書きに含まれる「使いすぎの話題の言葉」 */
export function overusedHits(text: string, plan: FreshTopicPlan | null): string[] {
  if (!plan || plan.overused.length === 0) return [];
  const t = norm(text);
  return plan.overused.filter((w) => t.includes(w));
}

/**
 * 使いすぎの言葉を含む行を外す。全部の行が外れたら空文字。
 *
 * @param maxHits この数以上の言葉を含む行を外す。
 *   ・N1顧客像・お客様の声は 1（プロンプトで「そのまま使う」「★最優先で1〜2個使う」と指示される欄。
 *     プレステージ様の「スタッフが優しく」はここから毎回出ていた）
 *   ・信条・実績は 2（「先輩」1語で行ごと消すと、書く材料が無くなるため）
 */
export function dropOverusedLines(text: string | null | undefined, plan: FreshTopicPlan | null, maxHits: number = 2): string {
  const raw = String(text ?? "");
  const frames = plan?.frames ?? [];
  if (!plan || (plan.overused.length === 0 && frames.length === 0) || !raw.trim()) return raw;
  return raw.split(/\r?\n/)
    .filter((l) => overusedHits(l, plan).length < maxHits && !lineHitsFrames(l, frames))
    .join("\n").trim();
}

/**
 * 文体のお手本・◯の付いた案から、使いすぎの型・話題に当たる文を外す（お手本は写されるため）。
 * ★9/26：◯✕アンケートで◯が付いた「覚えることが多そうで不安です→現場で覚える」の案が
 *   お手本の先頭に入り、毎回その流れで書かれていた。◯は残し、その日の型に当たる文だけ外す。
 */
export function dropFramedSentences(text: string | null | undefined, plan: FreshTopicPlan | null): string {
  const raw = String(text ?? "");
  const frames = plan?.frames ?? [];
  if (!plan || (plan.overused.length === 0 && frames.length === 0) || !raw.trim()) return raw;
  return raw.split(/\n?-{3,}\n?/)
    .map((b) => b.split(/(?<=[。！？!?\n])/)
      .filter((s) => !lineHitsFrames(s, frames) && overusedHits(s, plan).length < 2)
      .join("").trim())
    .filter((b) => b.replace(/\s/g, "").length >= 6)
    .join("\n---\n");
}

// ==================== ◯✕アンケートで✕が付いた題材（2026-09-26） ====================

export interface SurveyAvoid {
  /** ✕が付いた案の題名の言葉（1つでも出たら同じ題材） */
  labelWords: string[];
  /** ✕が付いた案の本文にだけ出る言葉（◯の案には出ない。2つ出たら同じ題材） */
  contentWords: string[];
  /** 題名（プロンプトに書く用） */
  labels: string[];
}

/**
 * ✕が付いた案の「題材の言葉」を取り出す。
 * ★9/25 に「子育てと両立する働き方」に✕が付いたのに、翌日「産休・育休から復帰できるの？」が作られた。
 *   ✕は「避ける書き方の例」として渡していただけで、題材としては外していなかった。
 *   ◯の案にも出る言葉（エステティシャン・先輩など、お店の主題）は外さない。
 */
export function surveyAvoidWords(
  bad: ReadonlyArray<{ label?: string | null; content?: string | null }>,
  goodContents: readonly string[],
  protect: readonly (string | null | undefined)[],
): SurveyAvoid {
  const good = new Set(goodContents.flatMap((c) => topicWordsOf(c)));
  const pw = protectWordsOf(protect);
  const keep = (w: string) => !good.has(w) && !pw.some((p) => p.includes(w) || w.includes(p));
  const labelWords = new Set<string>();
  const contentWords = new Set<string>();
  for (const b of bad) {
    for (const w of topicWordsOf(String(b.label ?? ""))) if (keep(w)) labelWords.add(w);
    for (const w of topicWordsOf(String(b.content ?? ""))) if (keep(w) && !labelWords.has(w)) contentWords.add(w);
  }
  return {
    labelWords: Array.from(labelWords),
    contentWords: Array.from(contentWords).filter((w) => !labelWords.has(w)),
    labels: bad.map((b) => String(b.label ?? "").trim()).filter(Boolean),
  };
}

/** その文が✕の題材に当たっているか（題名の言葉1つ、または本文の言葉2つ） */
export function hitsSurveyAvoid(text: string, avoid: SurveyAvoid | null): string[] {
  if (!avoid) return [];
  const t = norm(text);
  const l = avoid.labelWords.filter((w) => t.includes(w));
  const c = avoid.contentWords.filter((w) => t.includes(w));
  return l.length >= 1 || c.length >= 2 ? [...l, ...c] : [];
}

export function buildSurveyAvoidNote(avoid: SurveyAvoid | null): string {
  if (!avoid || avoid.labels.length === 0) return "";
  const words = [...avoid.labelWords, ...avoid.contentWords].slice(0, 8);
  return `\n\n【オーナーが✕を付けた題材（厳守）】\n- オーナーが方向性のアンケートで「違う」と答えた題材：${avoid.labels.map((l) => `「${l}」`).join("")}\n- この題材は書かない（${words.map((w) => `「${w}」`).join("")}の話をしない）。Q&Aや別の切り口に言い換えて同じ題材を書くのも不可。`;
}

/**
 * オーナーから「同じような内容ばかり」と言われているか。
 * ボタン（same）のほか、文章で「同じ」「似た」「ばかり」「毎回」と書かれた場合も含む。
 */
export function saidSameContent(reasons: ReadonlyArray<{ reason: string; reasonText?: string | null }>): boolean {
  return reasons.some((r) =>
    r.reason === "same" ||
    (r.reason === "text" && /同じ|似た|似て|ばかり|毎回|いつも|繰り返|くり返/.test(String(r.reasonText ?? ""))));
}

/** 生成プロンプトに足す指示。使いすぎの話題が無ければ空文字 */
export function buildFreshTopicNote(plan: FreshTopicPlan | null): string {
  const frames = plan?.frames ?? [];
  if (!plan || (plan.overused.length === 0 && frames.length === 0)) return "";
  const lines: string[] = [];
  if (plan.overused.length > 0) {
    lines.push(
      `- 直近${plan.sampleSize}本の投稿の多くが、同じ話題（${plan.overused.map((w) => `「${w}」`).join("")}）になっている。オーナーから「同じような内容ばかり」と言われている。`,
      `- 今日の投稿では、上の言葉を1つも使わない。言い換えて同じ話（同じ人物・同じ体験・同じ悩み）を書くのも不可。`,
    );
  } else {
    lines.push(`- 直近${plan.sampleSize}本の投稿の多くが、同じ流れになっている。オーナーから「同じような内容ばかり」と言われている。`);
  }
  for (const f of FRAMES) if (frames.includes(f.key)) lines.push(`- ${f.note}`);
  if (plan.topic) {
    lines.push(`- ★今日の主題（必須）：「${plan.topic}」\n  ご登録の材料のうち、直近の投稿でまだ使っていないもの。この1つだけを主題にして書く。書いてある事実だけを使い、足さない。`);
  } else {
    lines.push("- 直近の投稿で使っていない材料（メニュー・よくあるご質問・季節・お店ごとの違い）から、1つだけを主題にして書く。");
  }
  return `\n\n【★話題を変える（最優先・厳守）】\n${lines.join("\n")}`;
}
