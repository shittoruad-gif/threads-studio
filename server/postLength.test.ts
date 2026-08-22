import { describe, it, expect } from "vitest";
import {
  resolvePostLength, charBudgetFor, POST_LENGTHS, DEFAULT_POST_LENGTH,
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
