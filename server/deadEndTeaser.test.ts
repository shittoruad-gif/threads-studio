import { describe, it, expect } from 'vitest';
import { findDeadEndTeaser } from '../shared/jpQualityGuard';

// 2026-09-29 川邊様 acc34 #2252：保証パスが答えを伏せた問いだけの文を承認カードにした。
describe('答えを伏せたまま終わる問い', () => {
  it('#2252 の文を止める', () => {
    expect(findDeadEndTeaser('産後の骨盤を回復させるためには、骨盤矯正だけでなくもう一つ重要なものがあります。そのもう一つとは？')).toBe('そのもう一つとは？');
  });
  it('答えを伏せた「何だと思いますか？」で終わる形を止める', () => {
    expect(findDeadEndTeaser('肩こりが続く方に多い共通点があります。\n\nそれは何だと思いますか？😊')).not.toBeNull();
  });
  it('読み手に本当に聞く問いは通す', () => {
    expect(findDeadEndTeaser('岐阜市のしん整骨院です。産後ケアは無理しないこと。\n\nあなたはどんな時に「無理してるな」と感じますか？😅')).toBeNull();
    expect(findDeadEndTeaser('自分の体質、知っていますか？')).toBeNull();
  });
  it('途中の「〜とは？」の後に答えがあれば通す', () => {
    expect(findDeadEndTeaser('反り腰の原因とは？\n\n抱っこで骨盤が前に傾くことが多いです。')).toBeNull();
  });
});
