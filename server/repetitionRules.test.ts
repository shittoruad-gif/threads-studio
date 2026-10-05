import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { REPETITION_RULES as R } from '../shared/repetitionRules';
import { removeRepeatedSentences, measureRepetition } from '../shared/repetitionGuard';

// 2026-10-05 三上様「きちんと厳格にルール化しといて」：ルールの数字は shared/repetitionRules.ts が唯一の正。台帳と食い違ったら落ちる
describe('同じ投稿に見せないルール：台帳と数字がそろっている', () => {
  const doc = readFileSync(new URL('../docs/scaling-thresholds.md', import.meta.url), 'utf8');
  it('R1〜R4・M1〜M3 の数字が台帳に書かれている', () => {
    expect(doc).toContain(`直近${R.topic.window}本の${Math.round(R.topic.share * 10)}割以上（最低${R.topic.minPosts}本）`);
    expect(doc).toContain(`頭${R.opening.chars}文字が、直近${R.opening.window}本のうち${R.opening.min}本以上`);
    expect(doc).toContain(`${R.sentence.minLen}文字以上の文が、直近${R.sentence.window}本のうち${R.sentence.min}本以上`);
    expect(doc).toContain(`${R.sentence.keepAtLeast}字未満`);
    expect(doc).toContain(`直近${R.identityFirstLine.window}本のうち${R.identityFirstLine.min}本以上が1行目`);
    expect(doc).toContain(`直近${R.monitor.days}日の自動の投稿の${Math.round(R.monitor.topicShare * 10)}割以上`);
    expect(doc).toContain(`同じ書き出しが${R.monitor.sameOpening}本以上`);
    expect(doc).toContain(`が${R.monitor.sameSentence}本以上`);
    expect(doc).toContain(`自動の投稿が${R.monitor.minPosts}本以上`);
  });
});

describe('R3 最後の作り直し：繰り返している文を外す', () => {
  it('外して40字以上残れば外す・短くなりすぎるなら外さない', () => {
    const t = 'ダイエットコーチとして10年。\n\n食べる順番を変えるだけで、体は少しずつ変わっていきます。毎日の小さな工夫が、続けるいちばんの近道です。';
    expect(removeRepeatedSentences(t, ['ダイエットコーチとして10年。'])).not.toMatch(/10年/);
    expect(removeRepeatedSentences('ダイエットコーチとして10年。短い文。', ['ダイエットコーチとして10年。'])).toBeNull();
  });
});

describe('M1〜M3 週次の見張り', () => {
  it('話題の言葉・同じ書き出し・同じ文を数え、店名・地名と一般的な言葉とご本人の文は数えない', () => {
    const posts = Array.from({ length: 8 }, (_, i) => `金沢市の整体院です。\n我慢しないでください。投稿${i}の本文はここに書きます。お客様の身体の話。`);
    const m = measureRepetition(posts, ['金沢市', '整体院'], []);
    expect(m.flagged).toBe(true);
    expect(m.topicWords.map((w) => w.word)).toContain('我慢');
    expect(m.topicWords.map((w) => w.word)).not.toContain('金沢市');
    expect(m.topicWords.map((w) => w.word)).not.toContain('身体');
    expect(m.sameSentences.map((s) => s.sentence)).toContain('我慢しないでください。');
    const m2 = measureRepetition(posts, ['金沢市', '整体院'], ['我慢しないでください。']);
    expect(m2.sameSentences.map((s) => s.sentence)).not.toContain('我慢しないでください。');
    expect(measureRepetition(posts.slice(0, 3), [], []).flagged).toBe(false);
  });
});
