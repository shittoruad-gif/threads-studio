import { describe, expect, it } from "vitest";
import { topicIndexForSlot } from "./autoPostScheduler";
import { pickRotatingTopic } from "../shared/topicRotation";

const problems = "産後の骨盤の歪み\n交通事故のむち打ち・首や腰の痛み\nお子様の頭の形（頭蓋骨矯正のご相談）";

describe("1日の中では枠ごとに別のお悩み", () => {
  it("お悩み3つ・1日3本なら、同じ日に3つとも1本ずつ出る", () => {
    for (const day of ["2026-10-02T09:00:00+09:00", "2026-10-03T09:00:00+09:00", "2026-10-04T23:30:00+09:00"]) {
      const at = new Date(day);
      const picked = [0, 1, 2].map((slot) => pickRotatingTopic(problems, topicIndexForSlot(slot, at, 0)));
      expect(new Set(picked).size).toBe(3);
    }
  });
  it("日が変わると、どの枠に何が来るかがずれる", () => {
    const a = pickRotatingTopic(problems, topicIndexForSlot(0, new Date("2026-10-02T09:00:00+09:00"), 0));
    const b = pickRotatingTopic(problems, topicIndexForSlot(0, new Date("2026-10-03T09:00:00+09:00"), 0));
    expect(a).not.toBe(b);
  });
  it("枠の番号が無い経路はこれまでどおり", () => {
    expect(topicIndexForSlot(99, null, 7)).toBe(7);
  });
});
