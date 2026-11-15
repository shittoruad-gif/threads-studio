import { describe, it, expect } from 'vitest';
import { calloutInFirstLine, calloutOpeningStreak, ownerKeys, openingKey, repeatedOpening, repeatedSentences, identityInFirstLine, identityOpeningStreak, buildRepetitionNote } from '../shared/repetitionGuard';

// 2026-10-05 三上様「同じ投稿ばかりになっていたりするので、きちんと改善して」
const greet = 'ハイサイ♪はいさい整骨院の比嘉です(^^)\n\n今日は肩の話です。';
describe('同じ投稿に見せない', () => {
  it('書き出しが直近5本のうち2本以上と同じなら止める', () => {
    expect(openingKey(greet)).toBe('ハイサイ♪はいさい整骨院');
    expect(repeatedOpening(greet, [greet, 'ちがう書き出しの投稿です。', greet])).toBeTruthy();
    expect(repeatedOpening(greet, [greet, 'ちがう書き出しの投稿です。'])).toBeNull();
  });
  it('実績の数字を含む文でも、丸ごと同じなら止める（既存の検査は数字を外していたので通っていた）', () => {
    const r = ['ダイエットコーチとして10年。\n食事の話。', 'ダイエットコーチとして10年。\n運動の話。'];
    expect(repeatedSentences('ダイエットコーチとして10年。\n睡眠の話をします。', r)).toEqual(['ダイエットコーチとして10年。']);
    expect(repeatedSentences('睡眠の話をします。', r)).toEqual([]);
  });
  it('1行目の地名・店名が続いているか', () => {
    const tokens = ['金沢市', 'みらい整体院'];
    expect(identityInFirstLine('金沢市で整体をしています。\n肩の話。', tokens)).toBe(true);
    expect(identityInFirstLine('肩が重い朝に。\n金沢市のみらい整体院です。', tokens)).toBe(false);
    expect(identityOpeningStreak(['金沢市で…。', '金沢市の…。', '肩の話。'], tokens)).toBe(true);
    expect(identityOpeningStreak(['金沢市で…。', '肩の話。', '腰の話。'], tokens)).toBe(false);
  });
  it('指示文に、直近の書き出し・繰り返している文・地名の注意が入る', () => {
    const n = buildRepetitionNote([greet, greet, '金沢市で一言。'], ['金沢市']);
    expect(n).toMatch(/同じ・似た書き出しにしない/);
    expect(n).toMatch(/ハイサイ♪はいさい整骨院の比嘉です/);
    expect(buildRepetitionNote([], ['金沢市'])).toBe('');
  });
});

describe('ご本人が自分で書いた書き出し・文は止めない（2026-10-05 比嘉様）', () => {
  it('手直しで書き足したあいさつは、繰り返しても止めない', async () => {
    const { ownerKeys } = await import('../shared/repetitionGuard');
    const owner = ownerKeys(['ハイサイ♪はいさい整骨院の比嘉です(^^)\n\nご本人が直した投稿。']);
    expect(repeatedOpening(greet, [greet, greet], { owner })).toBeNull();
    expect(buildRepetitionNote([greet, greet], [], owner)).not.toMatch(/ハイサイ/);
  });
});

describe('14日で2回使った文は指示で避ける（2026-10-19 見張り M3：acc11「倉敷市で13年。」4本）', () => {
  it('直近6本に1本しか無くても、14日で2本あれば指示に入る', () => {
    const recent = ['腰の話です。\n倉敷市で13年。\nお気軽にどうぞ。', '肩の話です。', '膝の話です。'];
    const older = [...recent, '首の話です。\n倉敷市で13年。\nまたどうぞ。', '足の話です。'];
    const n = buildRepetitionNote(recent, ['倉敷市'], undefined, older);
    expect(n).toMatch(/この2週間ですでに2回以上使っている.*「倉敷市で13年。」/);
  });
  it('14日で1本だけ・ご本人が書いた文は入れない', async () => {
    const { ownerKeys } = await import('../shared/repetitionGuard');
    const older = ['倉敷市で13年。\n腰の話です。', '肩の話です。'];
    expect(buildRepetitionNote([], [], undefined, older)).not.toMatch(/倉敷市で13年/);
    const owner = ownerKeys(['倉敷市で13年。\nご本人の文。']);
    expect(buildRepetitionNote([], [], owner, [...older, '倉敷市で13年。\n膝の話です。'])).not.toMatch(/倉敷市で13年/);
  });
});

describe('14日で2本使った文は作り直し・最後は外して出す（2026-10-19 acc22 試し生成で「プレステージは創業40年。」が指示だけでは残った）', () => {
  it('下書きの中の、14日で2本使った文を返す', async () => {
    const { sentencesUsedTwiceIn14Days, removeRepeatedSentences } = await import('../shared/repetitionGuard');
    const older = ['プレステージは創業40年。\n横浜の話です。', '研修の話です。\nプレステージは創業40年。', '別の話です。'];
    const draft = 'プレステージは創業40年。\n長く愛されてきた理由は、内側から整えるアーユルヴェーダです。横浜駅の近くで、本物の技術を学びませんか。';
    const rs = sentencesUsedTwiceIn14Days(draft, older);
    expect(rs).toEqual(['プレステージは創業40年。']);
    expect(removeRepeatedSentences(draft, rs)).not.toMatch(/創業40年/);
    expect(sentencesUsedTwiceIn14Days(draft, older.slice(1))).toEqual([]);
  });
});

// 2026-11-15 夜間整備：acc42 の 11/16 分4本（#7024〜#7027）が、4本とも「〜へ。」の呼びかけで始まっていた。頭12文字は違うので R2 には掛からない
describe('R5 呼びかけの書き出しが続いたら、今回は呼びかけで始めない', () => {
  const p7024 = '「自分に自信がない」と悩む経営者さんへ。\n\n元集客売上No.1ホステスが、あなたの強みを引き出します💫\n\n一歩踏み出すきっかけを掴みませんか？😊';
  const p7025 = '岡山駅西口で「サービスに自信がない」と感じる方へ。\n\n『MIRACLE Link💫』は、ただ名刺交換するだけの場所じゃないです。\n\n新しい視点やヒント、きっと見つかりますよ😊';
  const p7026 = '自分に自信がない経営者さんへ。\n\n「自分には強みがない」と考えるのは、もったいないです。';
  const p7027 = '「人脈がない」と悩むあなたへ。\n『MIRACLE Link💫』では、毎回SPECIALワークとグループディスカッションを実施しています。';
  it('実例の4本はどれも呼びかけの書き出し', () => {
    for (const p of [p7024, p7025, p7026, p7027]) expect(calloutInFirstLine(p)).toBe(true);
    expect(calloutInFirstLine('がんばるあなたへ💫\n本文')).toBe(true);
  });
  it('呼びかけでない書き出しは拾わない', () => {
    expect(calloutInFirstLine('10年お店を経営して気づいたこと。\n悩む経営者さんへ。')).toBe(false);
    expect(calloutInFirstLine('岡山駅西口へ向かう途中で。')).toBe(false);
    expect(calloutInFirstLine('交流会は名刺交換だけ？')).toBe(false);
  });
  it('直近3本のうち2本以上が呼びかけなら続いている・1本なら続いていない', () => {
    expect(calloutOpeningStreak([p7025, p7024, '10年お店を経営して気づいたこと。'])).toBe(true);
    expect(calloutOpeningStreak([p7024, '交流会は名刺交換だけ？', '岡山も朝晩冷え込んできましたね。', p7025])).toBe(false);
  });
  it('ご本人が呼びかけで書く方は止めない', () => {
    expect(calloutOpeningStreak([p7025, p7024], ownerKeys(['肩こりで眠れない方へ。\n今日はストレッチの話です。']))).toBe(false);
  });
  it('続いているときは指示文に入る・続いていなければ入らない', () => {
    expect(buildRepetitionNote([p7025, p7024], [])).toContain('呼びかけ');
    expect(buildRepetitionNote([p7024, '交流会は名刺交換だけ？'], [])).not.toContain('呼びかけにしない');
  });
});
