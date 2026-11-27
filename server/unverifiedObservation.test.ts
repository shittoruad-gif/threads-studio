import { describe, it, expect } from "vitest";
import { unverifiedObservation } from "../shared/unverifiedObservation";

describe("登録に無い様子の言い切りを止める（2026-11-27）", () => {
  it("11/27 に予約されていた4件の形は止まる", () => {
    expect(unverifiedObservation("玉島中央町を歩くと、お店の軒先に飾られたクリスマスの飾りが増えてきました。\n\nこの時期の玉島で好きな風景はありますか？", "倉敷市玉島")).toMatch(/クリスマス/);
    expect(unverifiedObservation("本格的な寒さで、腰の痛みが気になる方が増えています。", "大分市")).toMatch(/増えています/);
    expect(unverifiedObservation("倉敷駅近くにオープンしたお店です。", "倉敷駅")).toMatch(/オープン/);
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
