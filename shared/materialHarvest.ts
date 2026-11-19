/**
 * ネタの自動の補充（決まり・純粋な関数）。DB と LLM は server/materialHarvest.ts。
 *
 * 2026-11-19 三上様「ネタ切れで同じような投稿ばかりというのが増えてくると思うので、
 * このようなことにならないようにできる仕組みを早急に作って」。
 *
 * 考え方：
 *  - 似た投稿が続くのは、生成の工夫ではなく材料の不足。作り直しを足しても同じ所に戻る（11/19 呉服店のアカウントで実測）。
 *  - 材料は、まずご本人がすでに書いたものから拾う。ご本人が手直しして公開した投稿には、
 *    お店の事実（物の名前・違い・お客様の声）がご本人の言葉で入っているのに、ネタ帳には入っていなかった。
 *  - 新しい事実は作らない。拾った1件ごとに「元の投稿に本当に書いてあるか」を文字の重なりで確かめる。
 *  - 今ある行は変えない・消さない。足すだけ。
 */

import { similarity, samenessKey } from './sameness';
import { MATERIAL_MAX_LEN, type MaterialKind } from './materialLedger';

export const HARVEST = {
  /** 補充の対象にする条件：ネタ帳があって、今日使えるネタがこの件数以下 */
  lowUsable: 2,
  /** 読む手直し投稿の本数と期間 */
  maxSources: 40,
  sourceDays: 120,
  /** 1回で足す件数の上限 */
  maxAdd: 10,
  /** 拾った文の文字2つ組のうち、元の投稿に出ている割合がこれ未満なら「書いていないこと」として捨てる */
  grounded: 0.6,
  /** ネタ帳の今ある行・同じ回のほかの件と、これ以上似ていたら同じ話として足さない */
  duplicate: 0.5,
  /** 同じお店への補充は、この日数に1回まで（前回足した日から） */
  everyDays: 14,
  minLen: 12,
} as const;

/** 宣伝の決まり文句だけの文（事実がない） */
const SLOGAN_ONLY_RE = /^(?:[^。]{0,20})?(?:寄り添|心を込め|丁寧に|お気軽に|お待ちして|大切にして|こだわ)[^。]{0,24}。?$/;

export interface HarvestCandidate { kind: string; content: string; from?: number }

function bigramSet(s: string): Set<string> {
  const k = samenessKey(s);
  const out = new Set<string>();
  for (let i = 0; i < k.length - 1; i++) out.add(k.slice(i, i + 2));
  return out;
}

/** 拾った文が、元の投稿に本当に書いてあるか（文字2つ組のうち元の投稿にある割合） */
export function groundedShare(item: string, source: string): number {
  const a = bigramSet(item);
  if (a.size === 0) return 0;
  const b = bigramSet(source);
  let n = 0;
  a.forEach((k) => { if (b.has(k)) n++; });
  return n / a.size;
}

/**
 * LLM が拾った候補を、決まりでふるいにかける。通ったものだけをネタ帳に足す。
 *   sources  … 読ませた手直し投稿（候補の from はこの番号・1始まり）
 *   existing … ネタ帳に今ある行
 *   ngWords  … 使ってほしくない言葉（含む候補は足さない）
 */
export function filterHarvested(
  cands: readonly HarvestCandidate[],
  sources: readonly string[],
  existing: readonly string[],
  ngWords: readonly string[] = [],
): Array<{ kind: MaterialKind; content: string }> {
  const out: Array<{ kind: MaterialKind; content: string }> = [];
  const ng = ngWords.map(samenessKey).filter((w) => w.length >= 2);
  const all = sources.join('\n');
  for (const c of cands) {
    const kind: MaterialKind | null = c.kind === 'faq' ? 'faq' : c.kind === 'episode' ? 'episode' : null;
    const content = String(c.content ?? '').replace(/\s+/g, ' ').trim().slice(0, MATERIAL_MAX_LEN);
    if (!kind || samenessKey(content).length < HARVEST.minLen) continue;
    if (SLOGAN_ONLY_RE.test(content)) continue;
    const key = samenessKey(content);
    if (ng.some((w) => key.includes(w))) continue;
    // 元の投稿に書いてあるか：番号が合えばその投稿、合わなければ読ませた全部と比べる
    const src = typeof c.from === 'number' && sources[c.from - 1] ? sources[c.from - 1] : all;
    if (groundedShare(content, src) < HARVEST.grounded && groundedShare(content, all) < HARVEST.grounded) continue;
    if (existing.some((e) => similarity(e, content) >= HARVEST.duplicate || samenessKey(e).includes(key))) continue;
    if (out.some((o) => similarity(o.content, content) >= HARVEST.duplicate)) continue;
    out.push({ kind, content });
    if (out.length >= HARVEST.maxAdd) break;
  }
  return out;
}

/** 手直し投稿から、お店の事実を拾わせる指示 */
export function harvestPrompt(sources: readonly string[], existing: readonly string[]): string {
  return `あなたは、お店のSNS投稿の「材料帳」を整える係です。
下の【ご本人が手直しして公開した投稿】から、これからの投稿の材料になる「お店の事実」を拾ってください。

【拾うもの】
- episode：実際にあった話（お客様の言葉・来店のきっかけ・お手伝いした場面・お店で大切にしている具体的なやり方）
- faq：よく聞かれることと、その答え（物の違い・選び方・手入れの仕方・できること）

【決まり（厳守）】
- 投稿に書いてある事実だけを、投稿にある言葉のまま書く。書いていないことを足さない・言い換えで膨らませない・数字を作らない。
- 1件は1〜2文・100文字以内。1件に話を1つだけ。
- 「寄り添います」「心を込めて」「お気軽にどうぞ」のような、どの店でも言える宣伝の言葉だけの文は拾わない。
- 季節のあいさつ・読む人への問いかけ・絵文字は拾わない。
- 同じ内容は1件にまとめる。【ネタ帳に今あるもの】と同じ話は拾わない。
- 多くて12件。拾えるものが無ければ items を空にする。
- from には、その事実が書いてある投稿の番号を入れる。

【ネタ帳に今あるもの】
${existing.length > 0 ? existing.map((e) => `- ${e}`).join('\n') : '（なし）'}

【ご本人が手直しして公開した投稿】
${sources.map((s, i) => `(${i + 1}) ${s.replace(/\n+/g, ' ／ ')}`).join('\n')}`;
}

export const HARVEST_SCHEMA = {
  name: 'material_harvest',
  schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: ['episode', 'faq'] },
            content: { type: 'string', description: '投稿に書いてある事実を、投稿の言葉のまま（1〜2文・100文字以内）' },
            from: { type: 'integer', description: 'その事実が書いてある投稿の番号' },
          },
          required: ['kind', 'content', 'from'],
          additionalProperties: false,
        },
      },
    },
    required: ['items'],
    additionalProperties: false,
  },
} as const;
