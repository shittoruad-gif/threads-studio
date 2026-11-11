import { describe, it, expect } from "vitest";
import { judgeReachCollapse, median, reachCollapseOwnerText } from "../shared/reachCollapse";

const rep = (n: number, v: number) => Array.from({ length: n }, () => v);

describe("表示回数の急な落ち込みの判定", () => {
  it("中央値", () => {
    expect(median([])).toBe(0);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it("以前60回→直近3回は落ち込み", () => {
    const j = judgeReachCollapse(rep(19, 3), rep(68, 60));
    expect(j.collapsed).toBe(true);
    expect(j.ratio).toBeCloseTo(0.05);
  });
  it("2割ちょうどは落ち込みにしない", () => {
    expect(judgeReachCollapse(rep(10, 20), rep(20, 100)).collapsed).toBe(false);
    expect(judgeReachCollapse(rep(10, 19), rep(20, 100)).collapsed).toBe(true);
  });
  it("1本だけ大きく伸びた投稿に引っ張られない", () => {
    // 以前：ほとんど50回、1本だけ10万回。直近：40回。平均なら落ち込みに見えるが中央値では見えない
    const j = judgeReachCollapse(rep(10, 40), [...rep(19, 50), 100000]);
    expect(j.collapsed).toBe(false);
  });
  it("件数が足りないとき・もともと少ないときは判定しない", () => {
    expect(judgeReachCollapse(rep(4, 1), rep(30, 100)).collapsed).toBe(false);
    expect(judgeReachCollapse(rep(10, 1), rep(9, 100)).collapsed).toBe(false);
    expect(judgeReachCollapse(rep(10, 1), rep(30, 9)).collapsed).toBe(false);
    expect(judgeReachCollapse([], []).collapsed).toBe(false);
  });
  it("運営への知らせの本文", () => {
    const j = judgeReachCollapse(rep(19, 3), rep(68, 60));
    const t = reachCollapseOwnerText({ username: "sample", userId: 1 }, j);
    expect(t).toContain("@sample");
    expect(t).toContain("60回");
    expect(t).toContain("3回");
    expect(t).toContain("本数は変えていません");
    expect(t).not.toContain("絞りました");
  });
});
