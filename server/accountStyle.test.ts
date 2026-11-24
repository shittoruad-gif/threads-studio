import { describe, it, expect } from "vitest";
import { repeatedTopic, accountStyleNote, topicLine } from "../shared/accountStyle";
import { findAccountBannedWord, accountBannedNote, scrubProjectForAccount } from "../shared/accountBannedWords";
import { treeDesignFor } from "../shared/treeDesign";

const at = (ymd: string) => Date.parse(`${ymd}T12:00:00+09:00`);

describe("金光の書き方の決まり（2026-11-24）", () => {
  it("決めゼリフと「〇〇市でも〜よくいらっしゃいます」の決まり文句を止める", () => {
    const hits = [
      "床に座って作業する。\nカラダが動くと、ココロも弾みます。",
      "浅口市でも、この姿勢で悩む方がよくいらっしゃいますよ",
      "浅口市でも、腰の悩みを抱える方は多いです。",
      "浅口市でも、同じお悩みの方が多くいらっしゃいます。",
      "浅口市でも、この感覚を抱える方からよく聞きます。",
    ];
    for (const t of hits) expect(findAccountBannedWord(12, t)).not.toBeNull();
    const ok = [
      "金光町で、この時期おすすめの食べたいもの、何かありますか？",
      "金光・鴨方あたりで、子ども連れで行きやすいとこってどこですか？",
      "夕方になると、首と肩の境目がカチカチになる。",
      "浅口市で整体を探すとき、完全予約制ってどう感じますか？",
    ];
    for (const t of ok) expect(findAccountBannedWord(12, t)).toBeNull();
    // ほかのアカウントは変わらない
    expect(findAccountBannedWord(36, hits[1])).toBeNull();
    expect(findAccountBannedWord(10, hits[1])).toBeNull();
  });

  it("登録の決めゼリフは生成に渡す前に外す（DBは変えない）", () => {
    const p = scrubProjectForAccount(12, { id: 1, catchphrase: "カラダが動くと、ココロも弾みます。", area: "浅口市" } as any);
    expect(p.catchphrase).not.toMatch(/ココロ/);
    expect(p.area).toBe("浅口市");
  });

  it("指示文：玉島はマシンの言い換え、金光は決まり文句の言い換えを書く", () => {
    expect(accountBannedNote(10)).toMatch(/機械・器具/);
    expect(accountBannedNote(12)).not.toMatch(/機械/);
    expect(accountBannedNote(12)).toMatch(/この辺りでも/);
    expect(accountStyleNote(12)).toMatch(/絵文字を付けない/);
    expect(accountStyleNote(36)).toBe("");
  });

  it("1行目が前の投稿と10字以上重なったら作り直し", () => {
    const past = ["猫背を悪化させる習慣、意外と3つあります。\n\nスマホ長時間見る", "金光町の道、最近よく渋滞してますよね。"];
    expect(repeatedTopic("猫背を悪化させる習慣、実は日常に潜んでいます。\n気づきにくい", past)).toMatch(/^猫背を悪化させる習慣/);
    expect(repeatedTopic("朝、布団から起きる時に腰が重いと感じませんか？", past)).toBeNull();
    expect(topicLine("😅 猫背、つらいですよね…。")).toBe("猫背つらいですよね");
  });

  it("金光のツリーの試しは BEST3 を使わない（ほかの型は日替わりのまま）", () => {
    const seen12 = new Set<string>(), seen10 = new Set<string>();
    for (let d = 0; d < 9; d++) {
      const day = at("2026-11-26") + d * 86400_000;
      seen12.add(treeDesignFor(12, day).key);
      seen10.add(treeDesignFor(10, day).key);
    }
    expect(seen12.has("tree_rank")).toBe(false);
    expect(seen12.size).toBe(2);
    expect(seen10.has("tree_rank")).toBe(true);
  });
});
