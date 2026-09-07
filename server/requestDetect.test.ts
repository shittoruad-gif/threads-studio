import { describe, it, expect } from "vitest";
import { isFeatureRequest } from "../shared/requestDetect";
describe("ご要望の見分け", () => {
  it("要望", () => {
    expect(isFeatureRequest("投稿の文章をコピーして修正できるようにしてほしい")).toBe(true);
    expect(isFeatureRequest("メニュー別のアカウントで文章を変えてほしいです")).toBe(true);
    expect(isFeatureRequest("画像も付けられる機能はありますか")).toBe(true);
  });
  it("使い方の質問は要望にしない", () => {
    expect(isFeatureRequest("固定投稿のやり方を教えてほしい")).toBe(false);
    expect(isFeatureRequest("このやり方がよくわかりません")).toBe(false);
  });
});
