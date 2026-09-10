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

/**
 * 2026-09-06〜09-08 に届いたご質問。同じことを二度聞かれないよう、
 * 自動応答の知識に事実が載っていることを固定する。
 */
describe("その日のご質問から足した知識", () => {
  const k = productKnowledge();

  it("今日の投稿はいつでも出し直せる（#22「今日の投稿をもう一度みたい」）", () => {
    expect(k).toContain("今日の投稿");
    expect(k).toMatch(/もう一度お出しします|もう一度見たい/);
    expect(k).toMatch(/さかのぼって探す必要はありません/);
  });

  it("お店の情報の直しは全文の打ち直しが要らない（#11・#12 大木様）", () => {
    expect(k).toMatch(/全文を打ち直す必要はありません/);
    expect(k).toMatch(/別のメッセージ/);
    expect(k).toContain("長押し");
  });

  it("ほかのSNSへの自動投稿は無いと書いてある（#20）", () => {
    expect(k).toContain("Instagram");
    expect(k).toMatch(/ほかのSNSへの自動投稿には対応していません|他のSNS/);
  });

  /**
   * 2026-09-10 香取様（#28「今日は投稿が来ていません」#29「今日の投稿が本日来ていないと思います」）。
   * 設定はすべて正しく、実際は品質の検査で3回とも見送って投稿ゼロになっていた。
   * それまでの知識には「自動投稿がONか確認してください」しか無く、
   * 自動応答は確信ありのまま的外れな返事をしていた。
   */
  it("設定が正しくても見送る日があること・翌朝の自動補填が載っている（#28・#29 香取様）", () => {
    expect(k).toMatch(/設定はすべて正しいのに/);
    expect(k).toMatch(/品質の検査/);
    expect(k).toMatch(/お客様側の不具合ではなく/);
    expect(k).toMatch(/翌日の朝に自動で足して届けます|翌日の朝に自動で1〜2件足して/);
    expect(k).toContain("今日の投稿に足しています");
  });

  /**
   * 2026-09-10 香取様（#30「ここ数日は同じ内容でしたので自身で投稿しておりました」）。
   */
  it("同じ内容が続いたときの仕組みと打ち手が載っている（#30 香取様）", () => {
    expect(k).toMatch(/同じような内容/);
    expect(k).toMatch(/ご自身がThreadsアプリから出された投稿/);
    expect(k).toContain("代わりを作る");
    expect(k).toMatch(/✕ 違う/);
  });
});
