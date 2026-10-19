import { describe, it, expect } from 'vitest';
import { openingKey, repeatedOpening, repeatedSentences, identityInFirstLine, identityOpeningStreak, buildRepetitionNote } from '../shared/repetitionGuard';

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
