import { describe, it, expect } from "vitest";
import {
  resolvePostLength, charBudgetFor, POST_LENGTHS, DEFAULT_POST_LENGTH,
  alternatedLength, resolveWithAlternation, jstDayNumber,
} from "../shared/postLength";

describe("投稿の長さ設定", () => {
  it("既定は短め（実測でいちばん見られるため）", () => {
    expect(DEFAULT_POST_LENGTH).toBe("short");
    expect(resolvePostLength(null)).toBe("short");
    expect(resolvePostLength(undefined)).toBe("short");
    expect(resolvePostLength("")).toBe("short");
  });

  it("不正な値でも既定に落ちる（長文で事故らせない）", () => {
    for (const v of ["LONG", "ながめ", "300", "true"]) {
      expect(resolvePostLength(v)).toBe("short");
    }
  });

  it("長めを選んだときだけ300字になる", () => {
    expect(resolvePostLength("long")).toBe("long");
    expect(charBudgetFor("long")).toBe(300);
    expect(charBudgetFor(null)).toBe(140);
  });

  it("長めの指示に水増し禁止が入っている", () => {
    expect(POST_LENGTHS.long.guide).toContain("水増し");
    expect(POST_LENGTHS.long.guide).toContain("250〜300字");
  });

  it("短めの指示は50〜100字", () => {
    expect(POST_LENGTHS.short.guide).toContain("50〜100字");
  });
});

describe("A/Bテストの交互割り当て", () => {
  it("日をまたぐと入れ替わる", () => {
    expect(alternatedLength(100, 0)).toBe("short");
    expect(alternatedLength(101, 0)).toBe("long");
    expect(alternatedLength(102, 0)).toBe("short");
  });

  it("同じ日の中でも枠ごとに入れ替わる（時間帯の有利不利と混ざらない）", () => {
    expect(alternatedLength(100, 0)).toBe("short");
    expect(alternatedLength(100, 1)).toBe("long");
    expect(alternatedLength(100, 2)).toBe("short");
  });

  it("各枠が両方の条件を等しく経験する", () => {
    for (const slot of [0, 1, 2]) {
      const seen = new Set<string>();
      for (let d = 0; d < 14; d++) seen.add(alternatedLength(d, slot));
      expect(seen, `枠${slot}が片方に偏っている`).toEqual(new Set(["short", "long"]));
    }
  });

  it("14日間で短め・長めがほぼ半々になる", () => {
    let short = 0, long = 0;
    for (let d = 0; d < 14; d++) {
      for (const slot of [0, 1, 2]) {
        alternatedLength(d, slot) === "short" ? short++ : long++;
      }
    }
    expect(Math.abs(short - long)).toBeLessThanOrEqual(1);
  });

  it("alternate 以外の設定では交互にしない", () => {
    expect(resolveWithAlternation("short", 1)).toBe("short");
    expect(resolveWithAlternation("long", 0)).toBe("long");
    expect(resolveWithAlternation(null, 1)).toBe("short");
  });

  it("日付境界は日本時間で切る", () => {
    const jstMidnight = Date.parse("2026-08-23T00:00:00+09:00");
    expect(jstDayNumber(jstMidnight)).toBe(jstDayNumber(jstMidnight + 3600000));
    expect(jstDayNumber(jstMidnight - 1)).toBe(jstDayNumber(jstMidnight) - 1);
  });
});
