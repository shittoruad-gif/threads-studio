import { describe, it, expect } from 'vitest';
import { similarity, measureSameness, overusedPhrases, buildSamenessNote } from '../shared/sameness';
import { filterHarvested, groundedShare, harvestPrompt } from '../shared/materialHarvest';
import { measureRepetition } from '../shared/repetitionGuard';

// 2026-11-19 三上様「ネタ切れで同じような投稿ばかり…このようなことにならないようにできる仕組みを早急に作って」
const STORE = 'さくら呉服店';
// 形が同じ投稿（悩みを言う→当店では寄り添い…）
const samey = [
  `大切な会のお着物選び、迷うこともありますよね。\n${STORE}では、お客様に寄り添い、一枚をご提案いたします。`,
  `講演会のお着物選び、迷うこともありますよね。\n${STORE}では、お客様に寄り添い、丁寧にご提案いたします。`,
  `大切な会にお呼ばれした時。お着物選びに迷うこともありますよね。\n${STORE}では、お客様に寄り添い、お誂えいたします。`,
  `着た後のお手入れ、迷うこともありますよね。\n${STORE}では、お客様に寄り添い、丁寧に承っております。`,
  `園遊会のお着物選び、迷うこともありますよね。\n${STORE}では、お客様に寄り添い、一枚をご提案いたします。`,
  `秋のお出掛けのお着物選び、迷うこともありますよね。\n${STORE}では、お客様に寄り添い、ご提案いたします。`,
];
// 話がばらけている投稿
const varied = [
  '付下げは略礼装で、訪問着より下、小紋より上です。結婚式や入学式はどちらも着られる場合があります。',
  'お琴の発表会の前に来られたお客様が「自信を持って舞台に立てました」と言ってくださいました。',
  '寒い季節でも、着物の中は意外と汗をかいています。袖口と裾は、しまう前に一度見てみてください。',
  'お母様の着物を今の寸法に直したいというご相談が、この秋は続いています。',
  '同窓会に着物で行くと、写真を撮るたびに声をかけられるそうです。先週のお客様のお話です。',
  '正絹は、座っている時間が長い日ほど違いが分かります。お茶席の方がよくそう言われます。',
];

describe('似ている度', () => {
  it('同じ文は1・関係ない文は低い・絵文字と改行は比べない', () => {
    expect(similarity('着物のお手入れに迷います。', '着物の\nお手入れに迷います。😊')).toBe(1);
    expect(similarity(varied[0], varied[1])).toBeLessThan(0.2);
    expect(similarity(samey[0], samey[4])).toBeGreaterThan(0.5);
    expect(similarity('', 'あいう')).toBe(0);
  });
});

describe('M4 似た投稿の割合', () => {
  it('形が同じ投稿が続くと基準を超える・ばらけていれば超えない・本数が少なければ数えない', () => {
    expect(measureSameness(samey).flagged).toBe(true);
    expect(measureSameness(varied).flagged).toBe(false);
    expect(measureSameness(varied).similarShare).toBe(0);
    expect(measureSameness(samey.slice(0, 3)).flagged).toBe(false);
  });
  it('週次の見張りに入る（ご本人の文として外していても、形が似ていれば基準を超える）', () => {
    const m = measureRepetition(samey, [STORE], samey);
    expect(m.sameSentences).toEqual([]);
    expect(m.similarFlagged).toBe(true);
    expect(m.flagged).toBe(true);
    expect(measureRepetition(varied, [STORE], []).similarFlagged).toBe(false);
  });
});

describe('R6 何度も使った言い回し', () => {
  it('店名だけの言い回しは数えず、決まり文句を拾う', () => {
    const ph = overusedPhrases(samey, [STORE]);
    expect(ph.some((p) => p.includes('お客様に寄り添い'))).toBe(true);
    expect(ph.some((p) => p.includes('迷うこともありますよね'))).toBe(true);
    expect(ph.every((p) => p.replace(STORE, '').length >= 4)).toBe(true);
    expect(overusedPhrases(varied, [STORE])).toEqual([]);
  });
  it('ご本人が手直しの半分以上で書いている言い回しは数えない', () => {
    const owner = ['はいさい、さくら呉服店です。今日は帯の話。', 'はいさい、さくら呉服店です。小紋の話。', 'はいさい、さくら呉服店です。お手入れの話。'];
    const posts = samey.map((p) => `はいさい、さくら呉服店です。\n${p}`);
    const ph = overusedPhrases(posts, [], owner, 8);
    expect(ph.some((p) => p.includes('はいさい'))).toBe(false);
    expect(ph.some((p) => p.includes('お客様に寄り添い'))).toBe(true);
  });
  it('似ていなければ指示は空・似ていれば言い回しを名指しする', () => {
    expect(buildSamenessNote(varied, [STORE])).toBe('');
    const note = buildSamenessNote(samey, [STORE]);
    expect(note).toContain('お客様に寄り添い');
    expect(note).toContain('今日はこの言い回しを使わない');
  });
});

describe('ネタの補充：拾った候補のふるい', () => {
  const sources = [
    'お客様から、付下げと訪問着の違いについてよくご質問をいただきます。\n付下げは略礼装。訪問着より下で小紋より上。\n訪問着は準礼装。留袖より下で付下げより上。',
    'お琴の発表会。着物選びに迷われていたお客様。\n「自信を持って舞台に立てました」と嬉しいお声。',
    '海外へ行かれる際のお着物。現地で軽やかに過ごせるようお仕立てさせて頂いております。',
  ];
  it('元の投稿に書いてある話だけを通し、作った話・決まり文句・NGワード・今ある話は通さない', () => {
    const out = filterHarvested([
      { kind: 'faq', content: '付下げは略礼装で、訪問着より下で小紋より上。訪問着は準礼装で、留袖より下で付下げより上。', from: 1 },
      { kind: 'episode', content: 'お琴の発表会の着物選びに迷われていたお客様から「自信を持って舞台に立てました」と嬉しいお声。', from: 2 },
      { kind: 'episode', content: '創業以来3万人のお客様に選ばれ、口コミ評価は4.9です。', from: 1 },
      { kind: 'episode', content: 'お客様に寄り添い、丁寧に承ります。', from: 2 },
      { kind: 'episode', content: '海外へ行かれる際のお着物を、現地で軽やかに過ごせるようお仕立てしている。', from: 3 },
      { kind: 'topic', content: 'お琴の発表会の着物選びに迷われていたお客様。', from: 2 },
      { kind: 'faq', content: '付下げは略礼装。訪問着より下で小紋より上。訪問着は準礼装。', from: 1 },
    ], sources, ['成人式・入学式・卒業式の着物'], ['海外']);
    expect(out.map((o) => o.kind)).toEqual(['faq', 'episode']);
    expect(out[0].content).toContain('略礼装');
    expect(out[1].content).toContain('自信を持って舞台に立てました');
  });
  it('ネタ帳に今ある話とほぼ同じなら足さない', () => {
    const exist = ['お琴の発表会の着物選びに迷われていたお客様から「自信を持って舞台に立てました」と嬉しいお声をいただいた。'];
    expect(filterHarvested([{ kind: 'episode', content: 'お琴の発表会の着物選びに迷われていたお客様から「自信を持って舞台に立てました」と嬉しいお声。', from: 2 }], sources, exist)).toEqual([]);
  });
  it('書いてある割合を数える・指示に今あるネタと投稿の番号が入る', () => {
    expect(groundedShare('付下げは略礼装。', sources[0])).toBe(1);
    expect(groundedShare('口コミ評価は4.9です。', sources[0])).toBeLessThan(0.3);
    const p = harvestPrompt(sources, ['留袖・振袖を着る場面']);
    expect(p).toContain('(2) お琴の発表会');
    expect(p).toContain('- 留袖・振袖を着る場面');
  });
});
