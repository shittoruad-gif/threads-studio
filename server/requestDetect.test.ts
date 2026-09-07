import { describe, it, expect } from "vitest";
import { isFeatureRequest } from "../shared/requestDetect";
describe("ご要望の見分け", () => {
  it("要望", () => {
    expect(isFeatureRequest("投稿の文章をコピーして修正できるようにしてほしい")).toBe(true);
    expect(isFeatureRequest("メニュー別のアカウントで文章を変えてほしいです")).toBe(true);
    expect(isFeatureRequest("画像も付けられる機能はありますか")).toBe(true);
  });
  // ★実際にお客様からいただいた文面（supportQuestions #11・#12）。
  //   以前はどれにも当てはまらず「お答えできないご質問でした」と返っていた。
  it("遠回しなご依頼も要望として拾う", () => {
    expect(isFeatureRequest(
      "こちらから、ご丁寧になりますが、文書を修正する場合、\n\nコピペできれば、修正しやすいのですが、全文打たなくてはいけなくて、\n何とかなりませんでしょうか？",
    )).toBe(true);
    expect(isFeatureRequest(
      "スクリーンショットをとってから、写真のアプリでコピペする形になってます。\n\nそのままコピペできれば、修正しやすいです。",
    )).toBe(true);
    expect(isFeatureRequest("予約の締切だけ変更は可能でしょうか")).toBe(true);
    expect(isFeatureRequest("投稿時間を選べるようにしていただけますか")).toBe(true);
    expect(isFeatureRequest("一覧で見られると助かります")).toBe(true);
  });
  it("使い方の質問は要望にしない", () => {
    expect(isFeatureRequest("固定投稿のやり方を教えてほしい")).toBe(false);
    expect(isFeatureRequest("このやり方がよくわかりません")).toBe(false);
    // 「教えていただけますか」は使い方のお尋ね（ご要望ではない）
    expect(isFeatureRequest("固定投稿のやり方を教えていただけますか")).toBe(false);
  });
  it("ただのお礼・あいさつは要望にしない", () => {
    expect(isFeatureRequest("ありがとうございます")).toBe(false);
    expect(isFeatureRequest("おはようございます")).toBe(false);
    expect(isFeatureRequest("承知しました")).toBe(false);
    expect(isFeatureRequest("")).toBe(false);
  });
});
