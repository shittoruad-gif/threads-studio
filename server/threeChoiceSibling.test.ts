import { describe, it, expect } from 'vitest';
import { choiceSiblingNote } from '../shared/threeChoice';

// 2026-10-04 三上様「テーマが偏らないように」：香取様の3案がすべて「24時間の電話受付」だった
describe('3案の2案目以降：前の案と別の話題で書く', () => {
  it('前の案の冒頭と「同じ話題を主役にしない」を渡す', () => {
    const n = choiceSiblingNote(['「夜中に足を捻った時、電話してもいいですか？」と聞かれることがあります。', '部活で足を痛めた時…']);
    expect(n).toContain('1. 「夜中に足を捻った時');
    expect(n).toContain('2. 部活で足を痛めた時');
    expect(n).toMatch(/同じ話題・同じ材料.*主役にしない/);
  });
  it('長い案は100字で切る・3つ目以降は入れない', () => {
    const n = choiceSiblingNote(['あ'.repeat(300), 'い', 'う']);
    expect(n).not.toContain('あ'.repeat(101));
    expect(n).not.toContain('3. う');
  });
});
