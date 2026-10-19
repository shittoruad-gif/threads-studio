import { describe, it, expect } from "vitest";
import { multiStoreLabels, pickStoreForPost, counselingStoreTexts } from "../shared/storeAreaPick";
import { generateThreadsPrompt } from "../shared/threadsPrompts";

// プレステージ様 acc33 の登録（2026-10-19 本番の写し）
const HOURS = [
  "営業時間　平日11～20時",
  "横浜店　店内が広くゆったり過ごしていただける空間（最寄りは横浜駅と神奈川駅）",
  "川崎店　長く通ってくださる地元のお客様が多いアットホームなサロン（最寄りは川崎駅と京急川崎駅）",
  "横須賀中央店　横須賀にお住まいのお客様が多く通われる落ち着いた雰囲気のサロン（最寄りは横須賀中央駅）",
];

describe("店舗が複数あるお店の店舗の指定", () => {
  it("地域の語すべてに「〇〇店」があれば店舗の呼び名を返す（横須賀→横須賀中央）", () => {
    expect(multiStoreLabels("横浜・川崎・横須賀", counselingStoreTexts({ hoursInfo: HOURS }))).toEqual(["横浜", "川崎", "横須賀中央"]);
  });

  it("1店で周りの地域からも来られる方（店が見つからない語がある）は何もしない", () => {
    expect(multiStoreLabels("倉敷・岡山", ["倉敷店　駅前"])).toEqual([]);
    expect(multiStoreLabels("横浜・川崎", [])).toEqual([]);
    expect(multiStoreLabels("八千代市勝田台", ["勝田台店"])).toEqual([]);
  });

  it("直近で「横浜にある」ばかりなら、ほかの店を選ぶ（10/18 にご本人が川崎・横須賀中央へ直した形）", () => {
    const recent = [
      "秋の冷え込みで…横浜にあるプレステージでは…",
      "「痩せたい」と…横浜にあるプレステージでは…",
      "夕方になると脚が…川崎にあるプレステージでは…",
      "創業40年、横浜・川崎・横須賀にあるプレステージです。",
    ];
    expect(pickStoreForPost(["横浜", "川崎", "横須賀中央"], recent)).toBe("横須賀中央");
  });

  it("店が1つ以下なら指定しない", () => {
    expect(pickStoreForPost(["横浜"], [])).toBeNull();
    expect(pickStoreForPost([], [])).toBeNull();
  });

  it("プロンプトに「この1本で書く店舗」が入る／無ければ入らない", () => {
    const base = { storeName: "プレステージ", businessType: "エステサロン", area: "横浜・川崎・横須賀", target: "40代女性", mainProblem: "むくみ", strength: "オールハンド" } as any;
    expect(generateThreadsPrompt({ ...base, storeForPost: "川崎" })).toContain("この1本で書く店舗：川崎店");
    expect(generateThreadsPrompt({ ...base, storeForPost: "川崎" })).toContain("「川崎にあるプレステージ」");
    expect(generateThreadsPrompt(base)).not.toContain("この1本で書く店舗");
  });
});
