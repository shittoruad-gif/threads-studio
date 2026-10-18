import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { contentTopicTag, inTopicTagTrial, topicTagArm, scheduledPostTopicTag, TOPIC_TAG_TRIAL } from "../shared/topicTagTrial";

// JST の日時を UTC のミリ秒に
const jst = (s: string) => new Date(`${s}+09:00`).getTime();
const IN = jst("2026-10-20T12:00:00");

describe("contentTopicTag：本文に合う言葉だけ（10/18 金光で全投稿「慢性的な肩こり」だった件）", () => {
  it("本文でいちばん先に出る地名・話題を選ぶ", () => {
    expect(contentTopicTag("鴨方のそうめん、冬でも食べる派ですか？笑")).toBe("鴨方");
    expect(contentTopicTag("デスクワークの方、今日何時間座りました？")).toBe("デスクワーク");
    expect(contentTopicTag("浅口の人に聞きたいんですけど、肩こったとき「はる」って言います？")).toBe("浅口");
    expect(contentTopicTag("夕方になると肩こりがひどくなりません？")).toBe("肩こり");
  });
  it("同じ位置なら長い言葉（公式LINE＞LINE）", () => {
    expect(contentTopicTag("公式LINEの友だち、どこから来たか分かりますか？")).toBe("公式LINE");
  });
  it("登録の地域の言葉も拾う", () => {
    expect(contentTopicTag("西阿知の方、朝の渋滞どうですか？", "岡山県倉敷市西阿知")).toBe("西阿知");
  });
  it("合う言葉が無ければ付けない（作らない）", () => {
    expect(contentTopicTag("日曜の午後ってなんでこんなに眠いんですかね")).toBeNull();
    expect(contentTopicTag("夕方けっこう冷えてきましたね")).toBe("冷え");
    expect(contentTopicTag("")).toBeNull();
    expect(contentTopicTag(null)).toBeNull();
  });
});

describe("お客様には付けない・学習用アカウントだけ期間中に交互", () => {
  const text = "鴨方のそうめん、冬でも食べる派ですか？";
  it("お客様のアカウントには、設定ONでも付けない", () => {
    expect(scheduledPostTopicTag({ threadsAccountId: 11, postId: 2, text, userAutoTopicTag: true, now: IN })).toBeUndefined();
    expect(scheduledPostTopicTag({ threadsAccountId: 25, postId: 2, text, now: IN })).toBeUndefined();
  });
  it("学習用：偶数の id は付ける・奇数は付けない", () => {
    for (const id of TOPIC_TAG_TRIAL.accountIds) {
      expect(scheduledPostTopicTag({ threadsAccountId: id, postId: 1000, text, now: IN })).toBe("鴨方");
      expect(scheduledPostTopicTag({ threadsAccountId: id, postId: 1001, text, now: IN })).toBeUndefined();
    }
    expect(topicTagArm(4)).toBe("tag");
    expect(topicTagArm(5)).toBe("none");
  });
  it("学習用でも、本人が設定でOFFにしていれば付けない", () => {
    expect(scheduledPostTopicTag({ threadsAccountId: 12, postId: 1000, text, userAutoTopicTag: false, now: IN })).toBeUndefined();
  });
  it("期間は JST 10/19〜11/1（両端を含む）。外では学習用にも付けない", () => {
    expect(inTopicTagTrial(12, jst("2026-10-18T23:59:00"))).toBe(false);
    expect(inTopicTagTrial(12, jst("2026-10-19T00:00:00"))).toBe(true);
    expect(inTopicTagTrial(12, jst("2026-11-01T23:59:00"))).toBe(true);
    expect(inTopicTagTrial(12, jst("2026-11-02T00:00:00"))).toBe(false);
    expect(scheduledPostTopicTag({ threadsAccountId: 12, postId: 1000, text, now: jst("2026-11-02T09:00:00") })).toBeUndefined();
  });
});

describe("公開の経路に、店舗の悩みワードを全投稿へ付ける処理が残っていない", () => {
  const read = (p: string) => fs.readFileSync(path.join(__dirname, p), "utf8");
  it("予約の投稿・今すぐ投稿のどちらも deriveTopicTag を呼ばない", () => {
    expect(read("scheduledPostExecutor.ts")).not.toMatch(/deriveTopicTag\(/);
    expect(read("routers.ts")).not.toMatch(/deriveTopicTag\(/);
  });
});
