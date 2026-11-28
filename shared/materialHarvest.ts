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

/**
 * 体の結果を言い切る文・数字の結果（2026-11-28）。ご本人が書いた文でも、ネタ帳の「必須の主役」にすると
 * 健康表現の検査で作り直しになり枠が欠ける。全アカウントへ広げる下見で
 * 「1回で-3センチのウエスト引き締め効果」「3ヶ月で-10㌔を目指します」「見た目でわかるくらいサイズダウン」
 * 「安静では治るのに時間がかかります」が拾われていた。
 */
export const OUTCOME_CLAIM_RE = /治(っ|り|る|せ)|完治|改善|痩せ|やせ|サイズダウン|引き締め効果|効果があ|スッキリ|[-−ー－]\s*[0-9０-９]+\s*(?:センチ|cm|㎝|キロ|kg|㌔|㎏)|[0-9０-９]+\s*(?:センチ|cm|㎝|キロ|kg|㌔|㎏)\s*(?:減|やせ|痩せ|ダウン|マイナス)/i;

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
    if (SLOGAN_ONLY_RE.test(content) || OUTCOME_CLAIM_RE.test(content)) continue;
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

// ==================== 全アカウントへ広げる（2026-11-28 三上様「そういうのも他のアカウントにも入れて」） ====================
//
// 11/28 実測（お客様・自社の21アカウント）：ネタ帳があるのは2アカウントだけ。手直し投稿が10本以上あるのに
// ネタ帳が無いアカウントが6つ、ホームページを登録しているのに読んでいないアカウントが7つ、
// 地元の会話に地元の方から返信が付いているのに使っていないアカウントが5つあった。
// 材料の出どころを3つにする：①ご本人の手直し投稿（今まで）②ご本人のホームページ ③投稿に付いた返信。
// どれも「足すだけ・今ある行は変えない・書いていないことは足さない」。

/** 手直し投稿からの補充を、ネタ帳がまだ無いアカウントにも行う（false にすると 11/19 の条件に戻る） */
export const HARVEST_ALL_ACCOUNTS = true;

// ---------- ② ホームページ ----------

export const SITE_HARVEST = {
  /** 1回で足す件数の上限 */
  maxAdd: 8,
  /** 同じお店のホームページを読むのは、この日数に1回まで */
  everyDays: 30,
  /** 読ませるページの長さ（字） */
  pageChars: 7000,
  /** 拾った文の文字2つ組のうち、ページの「近くの文」に出ている割合がこれ未満なら捨てる */
  grounded: 0.7,
  /** 近くの文として比べる幅（字）と、ずらす幅 */
  window: 240,
  step: 80,
} as const;

/** 料金・期間限定・時間・順位など、古くなりやすい／言い切れない文（ネタにしない） */
const SITE_VOLATILE_RE = /[¥￥]|[0-9０-９,，]+\s*円|[0-9０-９]+\s*[%％]|OFF|オフ|割引|無料|クーポン|キャンペーン|期間限定|今だけ|先着|[0-9０-９]{1,2}月[0-9０-９]{1,2}日|営業時間|定休日|受付時間|[0-9０-９]{1,2}[:：][0-9０-９]{2}|No\.?\s*[1１]|ナンバーワン|ランキング|[0-9０-９]+位|日本一|地域一|口コミ/;
/** 体の結果を語る文（健康表現の検査に落ちる・誤解のもと。declineFollowup の OUTCOME_WORDS と同じ考え方） */
const SITE_OUTCOME_RE = /治(っ|り|る|せ)|完治|改善|消失|なくなり|無くなり|スッキリ|回復し|良くな|痩せ|やせ|効果|効く|解消/;
/** ご本人のページではないもの（まとめ・順位・比べるサイト）。ほかのお店の話が混ざるので読まない */
const THIRD_PARTY_HOST_RE = /rank|matome|hikaku|kuchikomi|review|navi(?:\.|-)|ekiten|epark|google\.|facebook\.|instagram\.|threads\.|x\.com|twitter\.|line\.me|lin\.ee|youtube\.|tiktok\./i;

/** そのURLは、ご本人のページとして読んでよいか */
export function isOwnSiteUrl(url: string | null | undefined): boolean {
  try {
    const u = new URL(String(url ?? ''));
    if (!/^https?:$/.test(u.protocol)) return false;
    return !THIRD_PARTY_HOST_RE.test(u.hostname);
  } catch { return false; }
}

/** ページの「近くの文」に書いてあるか（ページ全体と比べると、長いページではどんな文でも当たってしまう） */
export function groundedInPage(item: string, page: string): number {
  const p = String(page ?? '').replace(/\s+/g, ' ');
  if (p.length <= SITE_HARVEST.window) return groundedShare(item, p);
  let best = 0;
  for (let i = 0; i < p.length; i += SITE_HARVEST.step) {
    const s = groundedShare(item, p.slice(i, i + SITE_HARVEST.window));
    if (s > best) best = s;
    if (best >= 1) break;
  }
  return best;
}

/** ホームページから拾った候補をふるいにかける */
export function filterSiteHarvested(
  cands: readonly HarvestCandidate[],
  page: string,
  existing: readonly string[],
  ngWords: readonly string[] = [],
): Array<{ kind: MaterialKind; content: string }> {
  const out: Array<{ kind: MaterialKind; content: string }> = [];
  const ng = ngWords.map(samenessKey).filter((w) => w.length >= 2);
  for (const c of cands) {
    const kind: MaterialKind | null = c.kind === 'faq' ? 'faq' : c.kind === 'episode' ? 'episode' : null;
    const content = String(c.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const key = samenessKey(content);
    if (!kind || key.length < HARVEST.minLen) continue;
    if (SLOGAN_ONLY_RE.test(content) || SITE_VOLATILE_RE.test(content) || SITE_OUTCOME_RE.test(content)) continue;
    if (ng.some((w) => key.includes(w))) continue;
    if (groundedInPage(content, page) < SITE_HARVEST.grounded) continue;
    if (existing.some((e) => similarity(e, content) >= HARVEST.duplicate || samenessKey(e).includes(key))) continue;
    if (out.some((o) => similarity(o.content, content) >= HARVEST.duplicate)) continue;
    out.push({ kind, content });
    if (out.length >= SITE_HARVEST.maxAdd) break;
  }
  return out;
}

/** ホームページから、お店の事実を拾わせる指示 */
export function siteHarvestPrompt(page: string, storeName: string, registered: string, existing: readonly string[]): string {
  return `あなたは、お店のSNS投稿の「材料帳」を整える係です。
下の【ホームページ】は「${storeName || 'このお店'}」ご本人のページです。これからの投稿の材料になる「お店の事実」を拾ってください。

【拾うもの】
- episode：お店で大切にしている具体的なやり方・こだわり・扱っている物・お店の歴史・どんな方が来られるか
- faq：よく聞かれることと、その答え（物の違い・選び方・手入れの仕方・できること・初めての方の流れ）

【決まり（厳守）】
- ページに書いてある事実だけを、ページにある言葉のまま書く。書いていないことを足さない・言い換えで膨らませない・数字を作らない。
- 1件は1〜2文・100文字以内。1件に話を1つだけ。
- 料金・割引・クーポン・キャンペーン・期間限定・営業時間・定休日・日付・順位や「No.1」は拾わない。
- 体の変化や結果（治る・改善・痩せる・効果）は拾わない。お客様の感想・口コミも拾わない。
- 「寄り添います」「心を込めて」「お気軽にどうぞ」のような、どの店でも言える宣伝の言葉だけの文は拾わない。
- ページの見出し・ボタンの名前・ほかのお店の話は拾わない。
- 【すでに登録されている内容】【ネタ帳に今あるもの】と同じ話は拾わない。
- 多くて10件。拾えるものが無ければ items を空にする。from は 1 を入れる。

【すでに登録されている内容】
${registered.slice(0, 2000) || '（なし）'}

【ネタ帳に今あるもの】
${existing.length > 0 ? existing.map((e) => `- ${e}`).join('\n') : '（なし）'}

【ホームページ】
${String(page ?? '').slice(0, SITE_HARVEST.pageChars)}`;
}

// ---------- ③ 投稿に付いた返信 ----------

export const REPLY_HARVEST = {
  /** 1回で足す件数の上限（返信の話ばかりにしない） */
  maxAdd: 2,
  /** この日数より前の返信は読まない */
  days: 21,
  /** 返信の長さ（字・空白を除く） */
  minLen: 10,
  maxLen: 100,
  /** 返信を読みに行く曜日（JST・0=日）。毎日は読まない（1アカウントで20回ほど読みに行くため） */
  weekdays: [1, 4] as readonly number[],
  /** 親の投稿を引く長さ（字） */
  parentChars: 30,
} as const;

export interface ReplyCandidate { text: string; username?: string | null; parentText?: string | null; timestamp?: string | null }

/** ネタにしない返信：値段・連絡先・ほかのお店・営業・強い言葉 */
const REPLY_DROP_RE = /https?:|www\.|[¥￥]|[0-9０-９,，]+\s*円|[0-9０-９]{2,4}-[0-9０-９]{2,4}-[0-9０-９]{3,4}|@[a-zA-Z0-9_.]{2,}|DM|ＤＭ|プロフ|フォロー|経営|事業|収益|副業|稼|無料|募集|紹介させ|ご連絡|はじめまして|突然の|最悪|ひどい|嫌い|怖|むかつ|クレーム|訴え|死|殺/;

/**
 * 読んだ返信のうち、ネタの候補にしてよいもの。
 *   ・ご本人の返信、Meta AI の返信（@meta.ai への呼びかけ投稿に付く長い答え）は外す
 *   ・値段・連絡先・営業・強い言葉を含むものは外す（11/28 実測：acc19 に同業の営業の長文が3件、acc40 に他社の車検の値段が1件）
 *   ・質問で終わるもの（お店への問い合わせ）は外す。答えを作ってしまうため
 */
export function eligibleReplies(
  list: readonly ReplyCandidate[],
  ownUsername: string | null | undefined,
  isSpam: (text: string, commenter?: string | null) => boolean,
  now: number = Date.now(),
): ReplyCandidate[] {
  const own = String(ownUsername ?? '').toLowerCase();
  const seen = new Set<string>();
  const out: ReplyCandidate[] = [];
  for (const r of list) {
    const text = String(r.text ?? '').replace(/\s+/g, ' ').trim();
    const user = String(r.username ?? '').toLowerCase();
    const parent = String(r.parentText ?? '').replace(/\s+/g, ' ').trim();
    if (!text || !parent) continue;
    if (user === own || /^meta\.?ai$/.test(user) || /@meta\.ai/i.test(parent)) continue;
    const len = Array.from(text.replace(/\s/g, '')).length;
    if (len < REPLY_HARVEST.minLen || len > REPLY_HARVEST.maxLen) continue;
    if (r.timestamp) {
      const t = Date.parse(String(r.timestamp));
      if (Number.isFinite(t) && now - t > REPLY_HARVEST.days * 86_400_000) continue;
    }
    if (REPLY_DROP_RE.test(text) || isSpam(text, r.username ?? null)) continue;
    // 質問で終わる返信（？のあとは絵文字・記号だけ）は外す
    if (/[?？][^A-Za-z0-9ぁ-んァ-ヶ一-龠]*$/.test(text)) continue;
    const key = samenessKey(text);
    if (key.length < 6 || seen.has(key)) continue;
    seen.add(key);
    out.push({ text, username: r.username ?? null, parentText: parent, timestamp: r.timestamp ?? null });
  }
  return out;
}

/** 返信1件をネタ帳の1行にする（書き足さない＝返信の言葉のまま。返信した方の名前は入れない） */
export function replyItemContent(r: ReplyCandidate): string {
  const parent = Array.from(String(r.parentText ?? '').replace(/\s+/g, ' ').trim());
  const head = parent.slice(0, REPLY_HARVEST.parentChars).join('') + (parent.length > REPLY_HARVEST.parentChars ? '…' : '');
  return `投稿「${head}」に、読んだ方から「${String(r.text).replace(/\s+/g, ' ').trim()}」と返信をいただいた。`;
}

/** 返信の中から、ネタにしてよいものを選ばせる指示（番号だけを返させる＝文は作らせない） */
export function replyPickPrompt(replies: readonly ReplyCandidate[]): string {
  return `お店のSNS投稿に、読んだ方から付いた返信です。次の投稿の話題にしてよいものの番号を選んでください。

【選ぶもの】
- 地元の食べ物・場所・季節の過ごし方・暮らしの小さな工夫や好みを、教えてくれている返信

【選ばないもの】
- あいさつ・相づち・お礼だけの返信（「いいですね」「ありがとうございます」「わかります」）
- お店への質問・要望・苦情、行政や他人への不満
- ほかのお店や会社の名前を出して比べているもの・値段の話
- 個人が分かる話（名前・勤め先・病気・家族の事情）
- 営業・勧誘、意味が取れないもの、きつい言い方のもの

多くて${REPLY_HARVEST.maxAdd * 2}件。選べるものが無ければ picks を空にする。

【返信】
${replies.map((r, i) => `(${i + 1}) 投稿「${String(r.parentText ?? '').slice(0, 40)}」← 返信「${r.text}」`).join('\n')}`;
}

export const REPLY_PICK_SCHEMA = {
  name: 'reply_pick',
  schema: {
    type: 'object',
    properties: { picks: { type: 'array', items: { type: 'integer' } } },
    required: ['picks'],
    additionalProperties: false,
  },
} as const;

/** 選ばれた返信を、ネタ帳の行にする（今ある行・同じ回のほかの件と同じ話は足さない） */
export function buildReplyItems(
  eligible: readonly ReplyCandidate[],
  picks: readonly number[],
  existing: readonly string[],
  ngWords: readonly string[] = [],
): Array<{ kind: MaterialKind; content: string }> {
  const out: Array<{ kind: MaterialKind; content: string }> = [];
  const ng = ngWords.map(samenessKey).filter((w) => w.length >= 2);
  const usedParents = new Set<string>();
  for (const n of picks) {
    const r = eligible[Number(n) - 1];
    if (!r) continue;
    const parentKey = samenessKey(String(r.parentText ?? '')).slice(0, 20);
    if (usedParents.has(parentKey)) continue; // 同じ投稿への返信は1回に1件
    const content = replyItemContent(r);
    const key = samenessKey(r.text);
    if (ng.some((w) => key.includes(w))) continue;
    if (existing.some((e) => samenessKey(e).includes(key))) continue;
    usedParents.add(parentKey);
    out.push({ kind: 'episode', content });
    if (out.length >= REPLY_HARVEST.maxAdd) break;
  }
  return out;
}
