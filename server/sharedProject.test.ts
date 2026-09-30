import { describe, expect, it } from "vitest";
import { sharedProjectQuestion } from "../shared/sharedProject";

describe("共有しているお店の情報の書き直し", () => {
  it("どのアカウントに影響するかと、2つの選び方を伝える", () => {
    const t = sharedProjectQuestion("tama.yurazoku", ["shittoru.1203"]);
    expect(t).toContain("@shittoru.1203 でも使っています");
    expect(t).toContain("このアカウントだけ変える");
    expect(t).toContain("両方とも変える");
    expect(/[\u{1F300}-\u{1FAFF}]/u.test(t)).toBe(false);
  });
});
