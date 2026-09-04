/**
 * はじめの設定（20問）の「要旨」。
 *
 * ★2026-09-04 三上様指示：
 *   これまでは20問の答えをそのまま生成プロンプトに流し込むだけで、
 *   「AIが何をどう理解したか」がお客様にも見えず、投稿もぶれていた。
 *
 *   ここで答えを1枚の要旨にまとめ、
 *     ① お客様に見ていただき、違うところを直せるようにする
 *     ② 以後のすべての投稿を、この要旨に沿って作る
 *   ようにする。
 *
 * 大原則：**答えに書かれていないことは書かない**。
 *   要旨は答えの言い換え・並べ替えだけで作る。AIに創作させない。
 *   空欄は空欄のまま「（未記入）」と出し、埋めたつもりにさせない。
 */

import type { CounselingAnswers } from './counseling';
import { splitToList, isEmptyAnswer } from './answerText';

/** コンセプトの5要素（勉強会のコンセプト設計に対応） */
export interface ConceptBreakdown {
  /** 誰に */
  who: string;
  /** どんな悩みを */
  problem: string;
  /** どんな方法で */
  how: string;
  /** どんな未来へ */
  future: string;
  /** なぜあなたか（根拠） */
  why: string;
}

export interface CounselingBrief {
  /** お店の基本 */
  storeName: string;
  businessType: string;
  area: string;
  concept: ConceptBreakdown;
  /** 一言化。お客様が書き換えられる（空なら下書きを出す） */
  oneLine: string;
  /** 発信の土台（答えに書かれた事実だけ） */
  menu: string[];
  proofs: string[];
  episodes: string[];
  benefits: string[];
  faq: string[];
  voice: string;
  ngWords: string[];
  hours: string[];
  ctaAssets: string[];
}

const EMPTY = '（未記入）';

function one(v: string | undefined): string {
  const t = (v ?? '').trim();
  return !t || isEmptyAnswer(t) ? '' : t;
}

/** 長い自由記入から、要旨に載せる1行を作る（切り詰めるだけ。言い換えない） */
function firstLine(v: string | undefined, max = 60): string {
  const t = one(v);
  if (!t) return '';
  const head = t.split(/\n/)[0].trim();
  return head.length > max ? head.slice(0, max) + '…' : head;
}

/**
 * 答えから要旨を組み立てる。
 * @param existingOneLine お客様がすでに書き換えた一言化があれば、それを優先する
 */
export function buildCounselingBrief(
  answers: Partial<CounselingAnswers>,
  existingOneLine?: string,
): CounselingBrief {
  const concept: ConceptBreakdown = {
    who: firstLine(answers.targetRaw),
    problem: firstLine(answers.mainProblemRaw),
    // 「どんな方法で」は、提供しているメニューと強みから取る（創作しない）
    how: splitToList(answers.menuRaw ?? '').slice(0, 3).join('／') || firstLine(answers.strengthRaw),
    future: splitToList(answers.benefitsDailyRaw ?? '')[0] ?? '',
    why: firstLine(answers.uspRaw) || firstLine(answers.strengthRaw),
  };
  return {
    storeName: one(answers.storeNameRaw),
    businessType: one(answers.businessTypeRaw),
    area: one(answers.areaRaw),
    concept,
    oneLine: one(existingOneLine) || draftOneLine(concept, one(answers.areaRaw), one(answers.businessTypeRaw)),
    menu: splitToList(answers.menuRaw ?? ''),
    proofs: splitToList(answers.realProofsRaw ?? ''),
    episodes: splitToList(answers.realEpisodesRaw ?? ''),
    benefits: splitToList(answers.benefitsDailyRaw ?? ''),
    faq: splitToList(answers.faqRaw ?? ''),
    voice: one(answers.brandVoiceRaw),
    ngWords: splitToList(answers.ngListRaw ?? ''),
    hours: splitToList(answers.hoursInfoRaw ?? ''),
    ctaAssets: splitToList(answers.ctaAssetsRaw ?? ''),
  };
}

/** 「岡山県倉敷市中央」→「倉敷市」。長い住所をそのまま一言に入れないため。 */
function shortArea(area: string | undefined): string {
  const a = area ?? '';
  const m = a.match(/([^\s都道府県]+?[市区町村])/);
  return m ? m[1] : a.slice(0, 8);
}

/**
 * 一言の下書きに入れてよい長さかを見る。
 * 途中で切ると日本語が壊れるので、長すぎるものは入れない
 * （下書きが短くなるだけ。お客様が書き換えられる）。
 */
function shortWho(who: string | undefined, max = 30): string {
  const t = (who ?? '').replace(/[。、]$/, '').trim();
  // 途中で切ると日本語が壊れる。入り切らないものは下書きに入れない。
  return t.length <= max ? t : '';
}

/**
 * 一言化の下書き。答えの語を短く組み合わせるだけで、創作はしない。
 *
 * ★長くすると一言にならないので、要素を全部つなげない。
 *   「どこで・誰に・何を」の3つだけに絞る。足りない分は入れない。
 *   しっくりこなければお客様が書き換える前提の「下書き」。
 */
export function draftOneLine(c: ConceptBreakdown, area?: string, businessType?: string): string {
  // 長すぎて入れられなかった要素は、そのぶんを丸ごと省く
  // （空文字を混ぜて「ののための」のような文にしない）
  const who = shortWho(c.who);
  const what = shortWho(businessType || '', 14) || shortWho(c.how, 14);
  const parts: string[] = [];
  if (area) parts.push(`${shortArea(area)}の`);
  if (who) parts.push(`${who}のための`);
  if (what) parts.push(what);
  if (!who && !what) return '';
  const s = parts.join('');
  return s.length > 60 ? s.slice(0, 60) : s;
}

/** 画面・トークに出す要旨（そのまま読める日本語） */
export function renderBriefText(b: CounselingBrief): string {
  const L: string[] = [];
  const head = [b.storeName, b.businessType].filter(Boolean).join('／');
  L.push(`【AIはこう理解しました】${head ? `\n${head}${b.area ? `（${b.area}）` : ''}` : ''}`);
  L.push('');
  L.push('■ コンセプト');
  L.push(`・誰に：${b.concept.who || EMPTY}`);
  L.push(`・どんな悩みを：${b.concept.problem || EMPTY}`);
  L.push(`・どんな方法で：${b.concept.how || EMPTY}`);
  L.push(`・どんな未来へ：${b.concept.future || EMPTY}`);
  L.push(`・なぜあなたか：${b.concept.why || EMPTY}`);
  if (b.oneLine) { L.push(''); L.push(`一言でいうと：${b.oneLine}`); }
  L.push('');
  L.push('■ 投稿に使う事実');
  L.push(`・メニュー：${b.menu.length ? b.menu.join('／') : EMPTY}`);
  L.push(`・実績：${b.proofs.length ? b.proofs.join('／') : '数字は出しません'}`);
  L.push(`・お客様の話：${b.episodes.length ? `${b.episodes.length}件` : '使いません'}`);
  L.push(`・言い方：${b.voice || EMPTY}`);
  L.push(`・使わない言葉：${b.ngWords.length ? b.ngWords.join('／') : 'なし'}`);
  return L.join('\n');
}

/**
 * 生成プロンプトの先頭に入れる要旨。
 * ここに書かれていないことは書かせない、という位置づけで渡す。
 */
export function buildBriefPromptSection(b: CounselingBrief | null | undefined): string {
  if (!b) return '';
  const c = b.concept;
  const has = c.who || c.problem || c.how || c.future || c.why || b.oneLine;
  if (!has) return '';
  const L: string[] = ['', '【★このお店の要旨（すべての投稿はこれに沿って作る）】'];
  if (b.oneLine) L.push(`一言でいうと: ${b.oneLine}`);
  if (c.who) L.push(`- 誰に: ${c.who}`);
  if (c.problem) L.push(`- どんな悩みを: ${c.problem}`);
  if (c.how) L.push(`- どんな方法で: ${c.how}`);
  if (c.future) L.push(`- どんな未来へ: ${c.future}`);
  if (c.why) L.push(`- なぜこのお店か: ${c.why}`);
  L.push('この5点から外れた話題を投稿にしない。ここに無い悩み・効果・未来を足さない。');
  L.push('毎回すべてを盛り込む必要はない。1投稿につき「誰に」＋どれか1つに絞る。');
  L.push('');
  return L.join('\n');
}
