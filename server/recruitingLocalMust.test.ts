import { describe, it, expect } from "vitest";
import { recruitingLocalMissing, recruitingLocalTalkAllowed, recruitingLocalNote } from "../shared/recruitingPost";

describe("地元の人に届ける求人：求人だとひと目で分かる形（2026-11-25）", () => {
  it("「求人っぽくない」と言われた投稿は、3つのうち条件と入口が足りない", () => {
    const weak = "倉敷で夜のお仕事に興味があっても、\n人間関係が不安な方もいると思います。\nREVIVEは、上下関係やルールが厳しくありません。\n自分らしく楽しく働ける場所です。\nお友達と一緒の応募も大歓迎です。";
    const miss = recruitingLocalMissing(weak);
    expect(miss.length).toBeGreaterThanOrEqual(2);
    expect(miss.join()).toMatch(/条件/);
  });
  it("募集の一文・条件・入口がそろえば通る（お手本の形）", () => {
    const good = "倉敷駅の近くのBARで、一緒に働いてくれるスタッフさんを探しています♡\n週1日から、Tシャツやパーカーでの出勤もOKです。\nまずは体験入店だけでも、気軽にDMくださいね♪";
    expect(recruitingLocalMissing(good)).toEqual([]);
  });
  it("地元の会話は連携から14日は出さない・その後も直近2本にあれば出さない", () => {
    expect(recruitingLocalTalkAllowed(3, [])).toBe(false);
    expect(recruitingLocalTalkAllowed(13, ["reassurance", "reassurance"])).toBe(false);
    expect(recruitingLocalTalkAllowed(14, ["reassurance", "reassurance"])).toBe(true);
    expect(recruitingLocalTalkAllowed(20, ["reassurance", "local_talk"])).toBe(false);
    expect(recruitingLocalTalkAllowed(20, ["local_talk"])).toBe(false);
  });
  it("指示に3つの必須が入る（募集の回でも、そうでない回でも）", () => {
    for (const offer of [true, false]) {
      const n = recruitingLocalNote(["倉敷"], offer);
      expect(n).toMatch(/毎回この3つを必ず入れる/);
      expect(n).not.toMatch(/募集の呼びかけで締めない/);
    }
  });
});
