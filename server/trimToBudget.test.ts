import { describe, it, expect } from "vitest";
import { trimToBudget } from "../shared/postLength";

/** 「…」でのぶつ切りをやめ、段落単位で予算に収めることの確認 */
describe("文字数予算への収め方", () => {
  const p = (n: number, ch = "あ") => ch.repeat(n);

  it("予算内ならそのまま（…を付けない）", () => {
    const out = trimToBudget(`${p(100)}\n\n${p(100)}`, "締めの一言", 490);
    expect(out).not.toContain("…");
    expect(out).toContain("締めの一言");
  });

  it("超過したら後ろの段落を丸ごと落とし、締めの一言は残す", () => {
    const out = trimToBudget(`${p(200, "あ")}\n\n${p(200, "い")}\n\n${p(200, "う")}`, "コメント欄のリンクからどうぞ", 490);
    expect(out).not.toContain("…");
    expect(out).toContain("コメント欄のリンクからどうぞ");
    expect(out).not.toContain("ううう"); // 最後の段落が落ちる
    expect(Array.from(out).length).toBeLessThanOrEqual(490);
  });

  it("文の途中で切れた形（…終わり）にはならない", () => {
    const out = trimToBudget(p(600), null, 490);
    expect(out.endsWith("…")).toBe(false);
  });
});
