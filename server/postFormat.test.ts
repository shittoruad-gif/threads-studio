import { describe, it, expect } from "vitest";
import { softWrapLongLines } from "../shared/postFormat";

describe("softWrapLongLines", () => {
  it("短い行はそのまま", () => {
    const t = "倉敷市玉島で、猫背が気になるあなたへ。\n\n運動はきついものだと思っていませんか？";
    expect(softWrapLongLines(t)).toBe(t);
  });
  it("90字を超える段落だけ、文末で改行を入れる", () => {
    const s1 = "多くの方が腰痛を感じると、腰を直接揉んだりストレッチしたりしますよね。";
    const s2 = "もちろんそれらのケアも大切ですが、それだけでは一時的な改善に留まってしまうことがあります。";
    const s3 = "なぜなら腰痛の根本には日々の呼吸の仕方が深く関わっている場合があるからです。";
    const out = softWrapLongLines(s1 + s2 + s3, 90);
    expect(out.split("\n").length).toBeGreaterThanOrEqual(2);
    for (const l of out.split("\n")) expect(Array.from(l).length).toBeLessThanOrEqual(90);
    expect(out.replace(/\n/g, "")).toBe(s1 + s2 + s3);
  });
});
