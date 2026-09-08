import { describe, it, expect } from "vitest";
import { buildPreferenceNote, removedPhrases } from "../shared/postPreference";

/**
 * お客様が手直しした内容が、翌日以降の投稿に活きること（2026-09-08 三上様指示）。
 * これまでは手直しがその1投稿だけで消えていたので、毎日直しても投稿が変わらなかった。
 */
describe("手直しからの好みの読み取り", () => {
  it("消された文を「避けたい言い回し」として拾う", () => {
    const removed = removedPhrases({
      originalContent: "八千代市の整骨院です。初回お試し1980円で受けられます。姿勢を一緒に見直しています。",
      postContent: "八千代市の整骨院です。姿勢を一緒に見直しています。",
    });
    expect(removed.join("")).toContain("1980円");
    // 残した文は拾わない
    expect(removed.join("")).not.toContain("姿勢を一緒に");
  });

  it("助詞だけの短い断片は拾わない", () => {
    const removed = removedPhrases({
      originalContent: "こんにちは。が。今日は寒いですね。",
      postContent: "こんにちは。今日は寒いですね。",
    });
    expect(removed.every((r) => Array.from(r).length >= 6)).toBe(true);
  });

  it("手直しした文をお手本として渡す", () => {
    const note = buildPreferenceNote([
      { originalContent: "AIが作った長ったらしい文章がここに入ります。よろしくお願いします。", postContent: "八千代市の整骨院です。肩こり、一緒に見ていきましょう。気軽にどうぞ。" },
    ]);
    expect(note).toContain("八千代市の整骨院です");
    expect(note).toContain("手直しした文");
  });

  it("材料が無ければ何も足さない（プロンプトを汚さない）", () => {
    expect(buildPreferenceNote([])).toBe("");
    // 短すぎる手直しは材料にしない
    expect(buildPreferenceNote([{ originalContent: "あああ", postContent: "はい" }])).toBe("");
  });

  it("消された文が無ければ「避けたい言い回し」の節は出さない", () => {
    const note = buildPreferenceNote([
      { originalContent: "八千代市の整骨院です。", postContent: "八千代市の整骨院です。肩こりのご相談を受けています。どうぞお気軽に。" },
    ]);
    expect(note).not.toContain("消した言い回し");
  });
});
