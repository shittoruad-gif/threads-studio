import { describe, it, expect } from "vitest";
import { skippedApprovalMorningPart } from "../shared/autoModeNudge";

describe("見送りになった翌朝の自動投稿の選択肢", () => {
  it("見送りが無ければ出さない", () => {
    expect(skippedApprovalMorningPart({ expired: 0, postedYesterday: 0, softOn: false, declinedBefore: false })).toBeNull();
  });
  it("見送りがあれば件数と3つの選択肢", () => {
    const p = skippedApprovalMorningPart({ expired: 4, postedYesterday: 0, softOn: false, declinedBefore: false })!;
    expect(p.text).toContain("4件");
    expect(p.text).toContain("1件も公開されていません");
    expect(p.text).toContain("自動投稿に切り替えませんか");
    expect(p.buttons.map((b) => b.data)).toEqual(["c=automode&v=on", "s=softappr&v=on", "c=automode&v=keep", "m=posts"]);
    for (const b of p.buttons) expect(b.label.length).toBeLessThanOrEqual(20);
  });
  it("一部だけ公開された日は「1件も」と書かない", () => {
    const p = skippedApprovalMorningPart({ expired: 3, postedYesterday: 1, softOn: false, declinedBefore: false })!;
    expect(p.text).not.toContain("1件も");
  });
  it("見送りしなければ公開がすでにONなら、その選択肢は出さない", () => {
    const p = skippedApprovalMorningPart({ expired: 1, postedYesterday: 2, softOn: true, declinedBefore: false })!;
    expect(p.buttons.some((b) => b.data.startsWith("s=softappr"))).toBe(false);
    expect(p.text).not.toContain("見送りしなければ公開");
  });
  it("「このまま確認する」を選んだ方には事実の一言だけ", () => {
    const p = skippedApprovalMorningPart({ expired: 2, postedYesterday: 0, softOn: false, declinedBefore: true })!;
    expect(p.text).not.toContain("切り替えませんか");
    expect(p.buttons.some((b) => b.data === "c=automode&v=keep")).toBe(false);
  });
});
