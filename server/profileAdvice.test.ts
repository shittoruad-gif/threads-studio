import { describe, it, expect } from "vitest";
import { buildProfileAdvice, suggestBio, suggestDisplayName } from "../shared/profileAdvice";

const project = { storeName: "こうざき接骨院", businessType: "整骨院・接骨院", area: "千葉県香取郡神崎町", target: "40〜60代の女性", mainProblem: "慢性的な腰痛、肩こり", strength: "国家資格者が一人ひとりの体を見て施術します。", linkUrl: "https://lin.ee/xxxx", linkName: "公式LINE" };

describe("プロフィールの提案", () => {
  it("表示名は店名＋地域の業種で30字以内", () => {
    const n = suggestDisplayName(project);
    expect(n).toContain("こうざき接骨院｜");
    expect(n).toContain("整骨院");
    expect(Array.from(n).length).toBeLessThanOrEqual(30);
  });
  it("自己紹介は150字以内で地域・店名・誘導が入る", () => {
    const b = suggestBio(project);
    expect(Array.from(b).length).toBeLessThanOrEqual(150);
    expect(b).toContain("こうざき接骨院");
    expect(b).toContain("リンクから");
  });
  it("空の自己紹介と数字入りユーザー名を✕/△にする", () => {
    const a = buildProfileAdvice({ username: "take_kouzaki201462", name: "", biography: "", hasPicture: true }, project);
    expect(a.checks.find((c) => c.key === "bio")?.mark).toBe("✕");
    expect(a.checks.find((c) => c.key === "username")?.mark).toBe("△");
    expect(a.usernameAdvice).toContain("take_kouzaki_sekkotsu");
    expect(a.allGood).toBe(false);
  });
  it("整っていれば○", () => {
    const a = buildProfileAdvice({ username: "kouzaki_sekkotsu", name: "こうざき接骨院｜神崎町の整骨院", biography: "香取郡神崎町の整骨院。慢性的な腰痛・肩こりでお困りの40〜60代の女性へ。ご予約はリンクから", hasPicture: true }, project);
    expect(a.allGood).toBe(true);
  });
});
