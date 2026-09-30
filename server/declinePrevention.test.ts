import { describe, it, expect } from 'vitest';
import { stickyDeclinedWords, stickyHits, questionEndingBlocked, coversTopic, topicAnchorWords, planFreshTopic } from '../shared/freshTopic';
import { endsWithQuestion } from '../shared/jpQualityGuard';

// 2026-09-30 三上様「1〜3を今夜進めて」。見送り理由7件がすべて「同じような内容ばかり」。
// 香取様 acc21 の実際の見送り（9/23〜9/29）
const declined21 = [
  '土浦市にある当院では、エコーで骨や靭帯を確認します。\n\n痛みの本当の原因は、見えない部分にあることも。\n\nあなたの痛み、どんな時に一番辛いですか？',
  '朝、ベッドから起き上がるのが辛い。毎日聞くお悩みです。\n\n土浦市にある当院は、エコーで体の中を正確に見ていきます。',
  '腰痛は揉むだけでは変わりません。\n\n土浦市にある神立宏友会シン接骨院では、エコーで根本を探します。\n\n腰の痛み、何に一番困っていますか？',
  'エコーで体の中をその場で確認。\n\n土浦市、神立宏友会シン接骨院のこだわりです。\n\n見えない原因まで探します。',
];
const protect21 = ['神立宏友会シン接骨院', '茨城県土浦市神立中央1丁目', null, '整骨院・接骨院', 'スポーツをする学生'];

describe('見送られた投稿の主役の言葉（1語でも止める）', () => {
  it('香取様：「エコー」を止め、地名・店名は止めない', () => {
    const w = stickyDeclinedWords({ declined: declined21, recentPosts: declined21.concat(declined21), protect: protect21 });
    expect(w).toContain('エコー');
    expect(w.some((x) => /土浦|神立|接骨院/.test(x))).toBe(false);
    expect(stickyHits('エコーでその場で確かめます。', w)).toEqual(['エコー']);
    expect(stickyHits('部活を休まずに通えるよう、夜21時まで開けています。', w)).toEqual([]);
  });
  it('見送りが1本だけなら何もしない', () => {
    expect(stickyDeclinedWords({ declined: declined21.slice(0, 1), recentPosts: declined21, protect: protect21 })).toEqual([]);
  });
});

describe('問いかけの締めは3本に1本まで', () => {
  it('直近2本のどちらかが問いかけで終わっていれば、今日は問いかけで締めない', () => {
    expect(questionEndingBlocked(['言い切りの投稿です。', 'あなたの痛み、どんな時に辛いですか？😊'], endsWithQuestion)).toBe(true);
    expect(questionEndingBlocked(['言い切りです。', 'お店からのひとことです😊', '何に困っていますか？'], endsWithQuestion)).toBe(false);
  });
});

describe('今日の主題を書いているか', () => {
  it('主題の言葉が無い下書きは作り直す', () => {
    const anchors = topicAnchorWords('パーソナルトレーニングで、ケガをしない体づくりまで見る', protect21);
    expect(coversTopic('エコーで確認します。', anchors)).toBe(false);
    expect(coversTopic('ケガの後は、パーソナルトレーニングで体づくりまで見ています。', anchors)).toBe(true);
  });
  it('3字以上の言葉が無い切れ端の主題は確かめない', () => {
    expect(coversTopic('なんでも', topicAnchorWords('購入して頂いている。', []))).toBe(true);
  });
  it('直近3本の主役だった材料は主題にしない', () => {
    const recent = ['エコーで骨を確認します。土浦市。', 'エコーでその場で見ます。', 'エコーで原因を探します。', '夜の話1です。', '夜の話2です。'];
    const plan = planFreshTopic({ recentPosts: recent.concat(recent), materials: ['エコーで骨や靭帯を確認', 'スポーツのケガに強い、夜21時まで営業'], protect: protect21, index: 0 });
    expect(plan.topic).not.toMatch(/エコー/);
  });
});

// 9/30 昼：プレステージ様の朝の生成で「先輩」が止まらず、保証パス #2299・代わり #2330 が見送られた。
describe('見送り3本以上に出た言葉は、直近の投稿が散っていても止める', () => {
  const declined22 = [
    '「技術覚えられるか不安…」\n\nそう話していた先輩も、プレステージで今では役職に。',
    'エステティシャンって、技術は見て盗むもの？\n\n未経験で入社した先輩も、最初は不安でした。',
    '異業種からの先輩が「職人のようだ」と話します。\n\nプレステージの技術は実践で身につくんです😊',
  ];
  const recent22 = ['社会保険完備で、長く働ける職場です。川崎店。', 'アーユルヴェーダの考え方を大切にしています。', 'ノルマなし。お客様の変化を喜べる職場です。', '賞与は年3回。頑張った分を評価します。', '駅近でアクセス抜群です。'];
  it('「先輩」を止める', () => {
    expect(stickyDeclinedWords({ declined: declined22, recentPosts: recent22, protect: ['プレステージ', '神奈川県川崎市', null, 'エステサロン', ''] })).toContain('先輩');
  });
});

describe('切れ端の材料は、ほかに候補があれば主題にしない', () => {
  it('岩根様：「購入して頂いている。」より3字以上の言葉がある材料を選ぶ', () => {
    const recent = ['正絹の一枚で自信を。', '正絹の一枚をお誂え。', '正絹で自信を持って。', '講演会の一枚。自信。', '正絹の着物。自信。'];
    for (let i = 0; i < 3; i++) {
      const plan = planFreshTopic({ recentPosts: recent.concat(recent), materials: ['購入して頂いている。', 'お茶のお稽古をされる方の着物選び', '文化勲章の授賞式に参列される方へ誂え'], protect: ['㈱津の国や本店', '岡山', null, '呉服小売店', ''], index: i });
      expect(plan.topic).not.toBe('購入して頂いている。');
    }
  });
});

describe('NGワード・見送られた主役の言葉を含む材料は主題にしない', () => {
  it('香取様：NGの「11年」の行を主題にしない', () => {
    const recent = ['エコーで骨や靭帯をその場で確認します。', 'エコーで痛みの原因を探していきます。', 'エコーで体の中を確認しています。', 'エコーを使って見えない所まで見ます。', 'エコーでその場で説明しています。'];
    for (let i = 0; i < 3; i++) {
      const plan = planFreshTopic({ recentPosts: recent.concat(recent), materials: ['整形外科で11年勤務', '学生のケガ予防啓蒙活動をボランティアで実施'], protect: [], index: i, avoid: ['学会', '11年'] });
      expect(plan.topic).toBeTruthy();
      expect(plan.topic ?? '').not.toMatch(/11年/);
    }
  });
});
