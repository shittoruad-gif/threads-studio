import { describe, it, expect } from "vitest";
import {
  checkVoice, findFragmentQuestions, findCasualClosers, findWarmClosers, isPoliteVoice, isFriendlyVoice,
} from "../shared/voiceGuard";
import { emojiAllowed, extractStyleTraits, styleTraitsNote } from "../shared/styleTraits";
import { checkHealthClaims } from "../shared/healthClaimGuard";

/**
 * 2026-09-08 比嘉先生（はいさい整骨院・口調「敬語で落ち着いた口調」）に出た不自然な投稿を、
 * そのまま不合格にできること。三上様「二度とこのような不自然な日本語が使われないように」。
 */
const HIGA_VOICE = "敬語で落ち着いた口調、沖縄出身でゆったりとした口調";
const BAD_1198 = `夏の疲れ、そのままにすると秋に3つの不調が出ます。
肩こりや腰痛、自律神経の乱れなど、心当たり？
一人ひとりの身体に合わせて、スッキリ整えるお手伝いをしていますよ😊`;

describe("登録した口調との矛盾", () => {
  it("実際に出た投稿を不合格にする（断片の問いかけ＋砕けた締め）", () => {
    const v = checkVoice(BAD_1198, HIGA_VOICE);
    expect(v.ok).toBe(false);
    expect(v.reasons.join(" ")).toContain("心当たり？");
    expect(v.reasons.join(" ")).toContain("ますよ");
  });

  it("一語で切る問いかけを拾い、述語のある問いかけは通す", () => {
    expect(findFragmentQuestions("肩こりや腰痛など、心当たり？")).toEqual(["肩こりや腰痛など、心当たり？"]);
    expect(findFragmentQuestions("本当？")).toHaveLength(1);
    expect(findFragmentQuestions("最近、肩はどうですか？")).toEqual([]);
    expect(findFragmentQuestions("同じ経験、ありませんか？")).toEqual([]);
    expect(findFragmentQuestions("朝起きたとき、首は重くないですか？")).toEqual([]);
  });

  it("砕けた締めは敬語登録のお店だけ不合格", () => {
    const casual = "肩こりのご相談、受けていますよ😊";
    expect(checkVoice(casual, HIGA_VOICE).ok).toBe(false);
    expect(checkVoice(casual, "フランクで親しみやすい口調").ok).toBe(true);
    expect(findCasualClosers("今日も暑いですね。水分をとってくださいね。")).toEqual([]);
    // ★絵文字が無くても拾う（2026-09-11まで、絵文字が付いた締めしか拾えていなかった）
    expect(findCasualClosers("肩こり、そのままにしないほうがいいかな")).toEqual(["かな"]);
    expect(checkVoice("肩こり、そのままにしないほうがいいかな", HIGA_VOICE).ok).toBe(false);
  });

  it("敬語で自然な文はそのまま通る", () => {
    const good = `夏の疲れは、秋に肩こりや腰の重さとして出てくることがあります。
朝起きたとき、首や肩が重いと感じる方は、体の使い方を一度見直してみてください。
はいさい整骨院では、お一人おひとりのお話を伺ってから施術しています。`;
    expect(checkVoice(good, HIGA_VOICE)).toEqual({ ok: true, reasons: [] });
  });

  it("疑問詞がある短い問いかけは通す（岩根様・2026-09-11）", () => {
    // 9/10、この1文が「どこへ」＝断片と判定され、㈱津の国や本店の枠が作り直しになっていた。
    expect(findFragmentQuestions("もし着物で海外へ行くなら、どこへ？")).toEqual([]);
    expect(findFragmentQuestions("次のお休み、どこへ行かれますか？")).toEqual([]);
    // 疑問詞のない名詞止めは、これまでどおり不合格のまま
    expect(findFragmentQuestions("肩こりや腰痛など、心当たり？")).toHaveLength(1);
  });

  it("「丁寧な敬語＋少しフレンドリー」は あたたかい締め を認め、タメ口は認めない（2026-09-11）", () => {
    // 契約中7名のうち4名がこの口調で登録している（9/11実測）。
    const MIXED = "丁寧な敬語＋少しフレンドリー";
    expect(isFriendlyVoice(MIXED)).toBe(true);
    expect(isPoliteVoice(MIXED)).toBe(true);
    // 9/10に2回続けて同じ理由で落ちた実際の締め
    expect(checkVoice("肩こりのご相談、受けていますよ😊", MIXED).ok).toBe(true);
    expect(checkVoice("横浜で40年、続けてきましたよ😊", MIXED).ok).toBe(true);
    // です・ます が崩れる締めは、フレンドリー登録でも不合格
    expect(checkVoice("肩こりのご相談、いつでも受けてるんだよ", MIXED).ok).toBe(false);
    expect(checkVoice("一度みてみると早いかな", MIXED).ok).toBe(false);
    // 落ち着いた口調だけの登録（比嘉先生）は、これまでどおり不合格のまま
    expect(checkVoice("肩こりのご相談、受けていますよ😊", HIGA_VOICE).ok).toBe(false);
    expect(findWarmClosers("肩こりのご相談、受けていますよ😊")).toHaveLength(1);
    expect(findCasualClosers("肩こりのご相談、受けていますよ😊")).toEqual([]);
  });

  it("口調の判定", () => {
    expect(isPoliteVoice(HIGA_VOICE)).toBe(true);
    expect(isFriendlyVoice(HIGA_VOICE)).toBe(false);
    expect(isFriendlyVoice("元気で明るく親しみやすい")).toBe(true);
    expect(isFriendlyVoice(null)).toBe(false);
    // 「まず5問」で口調が未登録のあいだに生成側が使う既定（autoPostScheduler）は敬語として扱われる
    expect(isPoliteVoice("丁寧で落ち着いた口調（未登録のため既定）")).toBe(true);
    expect(isPoliteVoice("明るく元気なタメ口")).toBe(false);
    expect(isPoliteVoice(null)).toBe(false);
  });
});

/**
 * 2026-09-11 岩根様（㈱津の国や本店）の3枠すべてが3回とも同じ理由で落ち、その日の投稿がゼロになった。
 * 落ちた理由は毎回「お手本にある店主の個人的な体験や感情、絵文字を用いた口調が欠けている」。
 * お手本の癖を数えて指示に書くようにした分の固定。
 */
describe("お手本から数えた癖", () => {
  const IWANE_SAMPLES = `今朝、早朝から参拝に行って参りました✨

体を清め。心を清め。

私が小さい頃からお世話になっている神社⛩️

#沖田神社
#津の国や 本店
---
昨日は雨の福山にて。
大好きな方々に会えてすごく幸せな時間でした🩷

#福山城
#椿の会`;

  it("絵文字・ハッシュタグ・自分の体験を数える", () => {
    const t = extractStyleTraits(IWANE_SAMPLES)!;
    expect(t.sampleCount).toBe(2);
    expect(t.usesEmoji).toBe(true);
    expect(t.usesHashtags).toBe(true);
    expect(t.writesOwnExperience).toBe(true);
  });

  it("数えた癖を指示の文にする", () => {
    const note = styleTraitsNote(extractStyleTraits(IWANE_SAMPLES));
    expect(note).toContain("絵文字を使っています");
    expect(note).toContain("店主自身の体験");
    expect(note).toContain("ハッシュタグ");
  });

  it("お手本が無ければ何も足さない（これまでどおりの生成）", () => {
    expect(extractStyleTraits(null)).toBeNull();
    expect(extractStyleTraits("")).toBeNull();
    expect(styleTraitsNote(null)).toBe("");
  });

  it("絵文字を消してよいのは「落ち着いた口調だけ＋お手本も絵文字なし」のときだけ", () => {
    expect(emojiAllowed("丁寧な敬語＋少しフレンドリー", null)).toBe(true);
    expect(emojiAllowed(HIGA_VOICE, IWANE_SAMPLES)).toBe(true); // お手本が絵文字を使っている
    expect(emojiAllowed(HIGA_VOICE, null)).toBe(false);
    expect(emojiAllowed(HIGA_VOICE, "本日は休診です。\n---\n明日から通常どおりです。")).toBe(false);
  });
});

describe("症状の予告断定（健康表現ガード）", () => {
  it("「秋に3つの不調が出ます」を落とす", () => {
    const v = checkHealthClaims(BAD_1198);
    expect(v.ok).toBe(false);
    expect(v.hits).toContain("症状の予告断定");
    expect(v.text).not.toContain("不調が出ます");
  });
});
