import { describe, it, expect } from "vitest";
import { findRepeatedPhraseExcept } from "../shared/jpQualityGuard";

// 2026-10-14 比嘉様 acc26：ご本人が毎回冒頭に足す挨拶が使い回し扱いで作り直しになっていた
const GREETING = "ハイサイ♪はいさい整骨院の比嘉です(^^)";
const recent = [
  `${GREETING}\n\n連休明けのお疲れも溜まってないでしょうか？`,
  `${GREETING}\n\nあっという間に三連休も終わってしまいましたね。`,
];
const ownerAfter = [
  { before: "連休明けのお疲れも溜まってないでしょうか？", after: `${GREETING}\n\n連休明けのお疲れも溜まってないでしょうか？\nお気軽にどうぞ` },
  { before: "あっという間に三連休も終わってしまいましたね", after: `${GREETING}\n\nあっという間に三連休も終わってしまいましたね` },
  { before: "トートー", after: "ちょこっとウチナーグチ🌺\n\n『トートー』\n↪️さぁさぁ。もう十分。" },
];

describe("findRepeatedPhraseExcept（ご本人の決まった挨拶）", () => {
  it("ご本人の直した後の文に2本以上ある挨拶は使い回し扱いしない", () => {
    const text = `ハイサイ はいさい整骨院の比嘉です^^\n\n朝晩の冷え込みで、足がつりやすい時季ですね。`;
    expect(findRepeatedPhraseExcept(text, recent, { ownerPairs: ownerAfter })).toBeNull();
  });

  it("挨拶以外の使い回しは今までどおり拾う", () => {
    const text = `${GREETING}\n\nあっという間に三連休も終わってしまいましたね。今日も元気に`;
    const dup = findRepeatedPhraseExcept(text, recent, { ownerPairs: ownerAfter.slice(2) });
    expect(dup).toContain("三連休も終わってしまいました");
  });

  it("挨拶を外したあとに残る使い回しも拾う", () => {
    const r = [...recent, "ギックリ腰は急性腰痛です。無理に動かさず安静にしてください"];
    const text = `${GREETING}\n\nギックリ腰は急性腰痛です。無理に動かさず冷やしましょう`;
    expect(findRepeatedPhraseExcept(text, r, { ownerPairs: ownerAfter })).toContain("ギックリ腰は急性腰痛です");
  });

  it("ご本人の文に1本しか無い言い回しは外さない", () => {
    const text = "ギックリ腰は急性腰痛です。無理に動かさず冷やしましょう";
    const r = ["ギックリ腰は急性腰痛です。無理に動かさず安静にしてください"];
    expect(findRepeatedPhraseExcept(text, r, { ownerPairs: [{ before: "", after: r[0] }] })).toContain("ギックリ腰は急性腰痛です");
  });

  it("AIが書いたまま直されずに残っただけの言い回しは外さない", () => {
    const line = "孫を抱っこしたい、またゴルフがしたい";
    const text = `${line}。そんな声をよく聞きます`;
    const r = [`${line}。そう話す方が多いです`];
    const pairs = [
      { before: `${line}。前の文`, after: `${line}。直した文` },
      { before: `${line}。別の文`, after: `${line}。直した別の文` },
    ];
    expect(findRepeatedPhraseExcept(text, r, { ownerPairs: pairs })).toContain("孫を抱っこしたい");
  });

  it("店名などの除外は空白・記号の違いがあっても効く", () => {
    const text = "金沢市の みらい整体院接骨院 です。今日は肩の話";
    const r = ["金沢市のみらい整体院接骨院です。昨日は腰の話"];
    expect(findRepeatedPhraseExcept(text, r, { stripWords: ["金沢市", "みらい整体院接骨院"] })).toBeNull();
  });
});
