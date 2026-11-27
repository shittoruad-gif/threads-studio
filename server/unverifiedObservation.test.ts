import { describe, it, expect } from "vitest";
import { unverifiedObservation } from "../shared/unverifiedObservation";

describe("登録に無い様子の言い切りを止める（2026-11-27）", () => {
  it("11/27 に予約されていた4件の形は止まる", () => {
    expect(unverifiedObservation("玉島中央町を歩くと、お店の軒先に飾られたクリスマスの飾りが増えてきました。\n\nこの時期の玉島で好きな風景はありますか？", "倉敷市玉島")).toMatch(/クリスマス/);
    expect(unverifiedObservation("本格的な寒さで、腰の痛みが気になる方が増えています。", "大分市")).toMatch(/増えています/);
    expect(unverifiedObservation("倉敷駅近くにオープンしたお店です。", "倉敷駅")).toMatch(/オープン/);
    // 2026-11-27 夜間整備：敬語の同じ形（acc37 #7380 で公開済み）
    expect(unverifiedObservation("冬の寒さで体が固まり、肩や腰、膝がつらいと感じる方が増えております。", "八潮市")).toMatch(/増えております/);
  });
  it("問いかけ・登録に書かれた事実・ふつうの文は止めない", () => {
    expect(unverifiedObservation("金光町で、最近見かけるようになったものありますか？", "")).toBeNull();
    expect(unverifiedObservation("2026年4月にオープンしたお店です。", "2026年4月オープンしました")).toBeNull();
    expect(unverifiedObservation("小さい頃によく遊んだ場所、\n玉島の人はどこでしたか？", "")).toBeNull();
    expect(unverifiedObservation("長く座ったあとは、背中を丸めて伸ばすのを3回。", "")).toBeNull();
  });
});

describe("言葉の取り違えをしない", () => {
  it("「飾らない言葉で」は止めない", () => {
    expect(unverifiedObservation("日常の気づきを、飾らない言葉で伝えるのが好きです。", "")).toBeNull();
  });
});

describe("11/27 金光の形（天気・名物・お店の設備の言い切り）", () => {
  it("止まる", () => {
    expect(unverifiedObservation("金光の夜はもうすっかり冷えますね。\n温かいお鍋が恋しい季節です。", "浅口市金光町")).not.toBeNull();
    expect(unverifiedObservation("金光の秋といえば、やっぱり柿ですよね。\nみなさんはどんな食べ方しますか？", "浅口市金光町")).not.toBeNull();
    expect(unverifiedObservation("金光駅から近いので、着替えを持ってきても大丈夫ですよ", "浅口市金光町占見新田")).not.toBeNull();
    expect(unverifiedObservation("金光の夕暮れ、川沿いを歩くのが気持ちいい季節ですね。", "")).not.toBeNull();
  });
  it("登録にある設備は止めない", () => {
    expect(unverifiedObservation("キッズルームがあるので、お子さま連れでも大丈夫です。", "キッズルーム完備")).toBeNull();
    expect(unverifiedObservation("駐車場もあるので、車でどうぞ。", "駐車場3台")).toBeNull();
  });
});
