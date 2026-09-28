import { describe, expect, it } from "vitest";
import {
  endsWithQuestion, featureForSlot, featureNote, isRepostDay, parsePollOptions, pollAttachment, spoilerEntities, spoilerRange,
} from "../shared/threadsFeatures";
import { checkAngle } from "../shared/angleGuard";

// 日本時間の正午をUTCで
const jst = (ds: string) => new Date(`${ds}T12:00:00+09:00`);

describe("Threads の機能の投稿：いつ・どのアカウントで", () => {
  it("10/28 から、試しの4アカウント。2本目は毎日アンケート、火・金は3本目をクイズ", () => {
    expect(featureForSlot(10, 1, jst("2026-10-27"))).toBeNull(); // 試しの前（投稿時間の試験中）
    expect(featureForSlot(10, 1, jst("2026-10-29"))).toBe("poll"); // 木
    expect(featureForSlot(10, 1, jst("2026-11-01"))).toBe("poll"); // 日
    expect(featureForSlot(10, 2, jst("2026-10-30"))).toBe("spoiler_quiz"); // 金
    expect(featureForSlot(10, 2, jst("2026-11-03"))).toBe("spoiler_quiz"); // 火
    expect(featureForSlot(10, 2, jst("2026-10-29"))).toBeNull(); // 木の3本目は普段どおり
    expect(featureForSlot(10, 0, jst("2026-11-03"))).toBeNull(); // 1本目は変えない
    expect(featureForSlot(99, 1, jst("2026-11-03"))).toBeNull(); // お客様のアカウントは対象外
    expect(featureForSlot(10, 1, jst("2026-12-01"))).toBeNull(); // 終わったあと
  });
  it("再投稿は日曜だけ", () => {
    expect(isRepostDay(36, jst("2026-11-01"))).toBe(true);
    expect(isRepostDay(36, jst("2026-11-02"))).toBe(false);
    expect(isRepostDay(36, jst("2026-10-25"))).toBe(false);
  });
});

describe("アンケートの選択肢", () => {
  it("JSON・箇条書きどちらでも読み、決まり（2〜4個・25文字）に合わなければ付けない", () => {
    expect(parsePollOptions('["首","肩","腰","特になし"]')).toEqual(["首", "肩", "腰", "特になし"]);
    expect(parsePollOptions('答え：\n["朝","夜"]')).toEqual(["朝", "夜"]);
    expect(parsePollOptions("- 朝起きたとき\n- 夕方\n- 寝る前")).toEqual(["朝起きたとき", "夕方", "寝る前"]);
    expect(parsePollOptions('["1つだけ"]')).toBeNull();
    expect(parsePollOptions(['あ'.repeat(26), "い"])).toBeNull();
    expect(parsePollOptions(["https://example.com", "い"])).toBeNull();
    expect(parsePollOptions(["a", "b", "c", "d", "e"])).toEqual(["a", "b", "c", "d"]);
  });
  it("API に渡す形", () => {
    expect(pollAttachment(["首", "肩", "腰"])).toEqual({ option_a: "首", option_b: "肩", option_c: "腰" });
  });
  it("最後の行が質問で終わっているか", () => {
    expect(endsWithQuestion("朝がつらい方へ\nいちばん重いのはどこですか？")).toBe(true);
    expect(endsWithQuestion("どこですか？😊")).toBe(true);
    expect(endsWithQuestion("どこですか？\nご予約はこちら")).toBe(false);
  });
});

describe("クイズの答えを隠す", () => {
  it("最後の「答え：」の後ろだけを隠す", () => {
    const t = "問題です。\n肩甲骨はいくつある？\n答え：2つ";
    const r = spoilerRange(t)!;
    expect(t.slice(r.offset, r.offset + r.length)).toBe("2つ");
    expect(spoilerEntities(t)).toEqual([{ entity_type: "SPOILER", offset: r.offset, length: r.length }]);
  });
  it("答えの行が無い・答えより前に絵文字がある（位置がずれる恐れ）なら隠さない", () => {
    expect(spoilerRange("答えは内緒")).toBeNull();
    expect(spoilerRange("問題😊\n答え：2つ")).toBeNull();
  });
});

describe("切り口の検査", () => {
  it("アンケートは質問で終わる・クイズは答えの行がある。結果の言い切りは落とす", () => {
    expect(checkAngle("poll", "朝がつらい方へ\nいちばん重いのはどこですか？").ok).toBe(true);
    expect(checkAngle("poll", "朝がつらい方へ\nご予約お待ちしています").ok).toBe(false);
    expect(checkAngle("poll", "これで必ず治ります。どこがつらいですか？").ok).toBe(false);
    expect(checkAngle("spoiler_quiz", "問題です\n答え：2つ").ok).toBe(true);
    expect(checkAngle("spoiler_quiz", "問題です\n正解は明日").ok).toBe(false);
  });
});

describe("カードに添える一言", () => {
  it("アンケートは選択肢、クイズは隠れることを伝える", () => {
    expect(featureNote({ pollOptions: '["首","肩"]' })).toBe("アンケートの選択肢：首／肩");
    expect(featureNote({ angle: "spoiler_quiz" })).toContain("隠れて");
    expect(featureNote({ angle: "qa" })).toBeNull();
  });
});
