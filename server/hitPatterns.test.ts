import { describe, it, expect } from "vitest";
import {
  selectHitCandidates, leaksSource, validatePattern, isHitPatternSlot, businessGroupOf, inHitPatternTrial, HIT_PATTERN_TRIAL,
} from "../shared/hitPatterns";

const mk = (acc: number, imps: number[], text = "「このくらいの痛みなら大丈夫」と我慢していませんか。痛いのが普通になる前に一度ご相談ください。") =>
  imps.map((imp, i) => ({ threadsPostId: `${acc}-${i}`, accountId: acc, impressions: imp, text }));

describe("hitPatterns: 当たりの選び方（2026-09-28）", () => {
  it("その店の中央値の2倍以上だけを当たりにする（閲覧数の絶対値では選ばない）", () => {
    const small = mk(1, [10, 10, 10, 10, 10, 10, 10, 25]);     // 中央値10 → 25は当たり
    const big = mk(2, [500, 500, 500, 500, 500, 500, 500, 900]); // 中央値500 → 900は当たりではない
    const hits = selectHitCandidates([...small, ...big]);
    expect(hits.map((h) => h.threadsPostId)).toEqual(["1-7"]);
  });
  it("Meta AI呼びかけ・その場の事実が要る投稿（今日・空き枠・祭り）は外す", () => {
    const base = mk(3, [10, 10, 10, 10, 10, 10, 10]);
    const hits = selectHitCandidates([
      ...base,
      { threadsPostId: "m", accountId: 3, impressions: 999, text: "@meta.ai 玉島のおすすめのピラティススタジオを教えてください" },
      { threadsPostId: "t", accountId: 3, impressions: 999, text: "雨降ってますが、今日玉島まつりはあるんですかね？皆さんは行かれますか" },
      { threadsPostId: "v", accountId: 3, impressions: 999, text: "明日9月8日に整体受けたい方いますか？Threads限定のご案内です。お気軽にどうぞ" },
    ]);
    expect(hits).toHaveLength(0);
  });
  it("投稿が少ないアカウント（8本未満）は数えない", () => {
    expect(selectHitCandidates(mk(4, [10, 10, 10, 99]))).toHaveLength(0);
  });
});

describe("hitPatterns: 型に元の本文を残さない", () => {
  const src = "「膝が痛いのは、もう歳だから仕方ないですよね」患者さんから聞くことがあります。";
  it("元の文が8文字以上続けて入っていたら漏れ", () => {
    expect(leaksSource("1行目：膝が痛いのはもう歳だから、というセリフで始める", src)).toBe(true);
  });
  it("型だけなら通る", () => {
    const p = "- 1行目：お客様がよく口にする思い込みのセリフをカギかっこで\n- 2段目：それを聞く場面を一言\n- 3段目：自分はそう考えない理由を短く\n- 締め：続きが気になる一言";
    expect(validatePattern(p, src)).toEqual({ ok: true });
  });
  it("他の方法の否定・根本改善に向かう型は使わない", () => {
    expect(validatePattern("- 1段目：施設名を名乗る\n- 2段目：一般的な対処法を否定し、自分の価値を示す\n- 締め：実績で終える形にする", src).ok).toBe(false);
    expect(validatePattern("- 1段目：季節の体の傾向を述べる\n- 2段目：根本的な調整を望む気持ちに寄り添う\n- 締め：前向きな一言で終える", src).ok).toBe(false);
  });
  it("健康系のお店では、結果・体験談を語る型は使わない（ほかの業種では使える）", () => {
    const p = "- 1行目：活動に戻れた人の事例紹介で始める\n- 2段目：その人の悩みを説明する\n- 締め：感情を込めた短い一言で終える";
    expect(validatePattern(p, src, "health").ok).toBe(false);
    expect(validatePattern(p, src, "other").ok).toBe(true);
  });
  it("具体的な数字・地名が入った型は使わない", () => {
    expect(validatePattern("- 1行目：開院から10年の実績を置く\n- 2段目：理由を三つ並べる\n- 締め：問いかけで終える形にする", src).ok).toBe(false);
    expect(validatePattern("- 1行目：倉敷市で痛みに悩む方へ呼びかける\n- 2段目：理由を三つ並べる\n- 締め：問いかけで終える形にする", src).ok).toBe(false);
  });
});

describe("hitPatterns: 試しの枠", () => {
  const now = Date.parse("2026-09-29T06:00:00+09:00");
  it("試しのアカウントの4本目・5本目だけ（契約の3本は今までどおり）", () => {
    expect(isHitPatternSlot(10, 2, 3, now)).toBe(false);
    expect(isHitPatternSlot(10, 3, 3, now)).toBe(true);
    expect(isHitPatternSlot(10, 4, 3, now)).toBe(true);
    expect(isHitPatternSlot(10, 5, 3, now)).toBe(false);
  });
  it("対象はMoveact2店・そら先生・しっとる公式だけ。期限を過ぎたら止まる", () => {
    expect([...HIT_PATTERN_TRIAL.accountIds].sort()).toEqual([10, 11, 12, 36]);
    expect(isHitPatternSlot(21, 3, 3, now)).toBe(false);
    expect(inHitPatternTrial(10, Date.parse("2026-10-28T00:00:01+09:00"))).toBe(false);
  });
  it("業種のまとまり", () => {
    expect(businessGroupOf("マシンピラティススタジオ（整体・美容鍼併設）")).toBe("health");
    expect(businessGroupOf("整骨院・接骨院\n鍼灸院")).toBe("health");
    expect(businessGroupOf("エステサロン")).toBe("beauty");
    expect(businessGroupOf("エステサロン", { recruiting: true })).toBe("recruit");
    expect(businessGroupOf("Web集客支援")).toBe("other");
  });
});
