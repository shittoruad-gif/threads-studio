import { describe, it, expect } from "vitest";
import { productKnowledge } from "../shared/productKnowledge";

/**
 * お客様は「Threads Studioのこと」と「Threadsアプリのこと」を分けて聞かれない。
 * アプリ側の言葉を尋ねられて「Threads Studioにはありません」と返すのは的外れなので、
 * 自動応答の知識にアプリ側のことが載っていることを固定する。
 * （2026-09-08 比嘉様のご質問 #17「興味関心を追加って？」#19「ゴースト投稿ってなに？」）
 */
describe("Threadsアプリ側の知識", () => {
  const k = productKnowledge();

  it("興味関心（プロフィールのトピック）が載っている", () => {
    expect(k).toContain("興味関心");
    expect(k).toContain("10個");
    // アプリ側の設定で、Threads Studioからは変えられないことまで書く
    expect(k).toContain("プロフィールを編集");
    expect(k).toMatch(/Threads Studioからは設定できません/);
  });

  it("ゴースト投稿が載っている（24時間で消える・返信はDM）", () => {
    expect(k).toContain("ゴースト投稿");
    expect(k).toContain("24時間");
    expect(k).toContain("DM");
    // Threads Studioの投稿は通常の投稿だと分かること
    expect(k).toMatch(/ゴースト投稿にはなりません/);
  });

  it("投稿のトピックは自動で付けていると分かる", () => {
    expect(k).toContain("トピックを追加");
    expect(k).toMatch(/自動で付けている|自動で付け/);
  });

  it("アプリ側の機能は段階提供だと断り書きがある", () => {
    expect(k).toMatch(/順番に配られ|段階的/);
  });
});
