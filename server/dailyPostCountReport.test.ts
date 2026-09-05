import { describe, it, expect } from "vitest";
import { buildDailyPostCountMessage } from "./dailyPostCountReport";

describe("昨日の公開数の通知文", () => {
  it("契約どおりなら数字だけ", () => {
    const t = buildDailyPostCountMessage("9月5日", [{ username: "a", posted: 3, awaiting: 0, canceled: 0, failed: 0, pending: 0, entitled: 3 }]);
    expect(t).toContain("@a：公開 3件（ご契約 1日3件）");
    expect(t).not.toContain("公開されていません");
  });
  it("0件なら「1件も公開されていません」と理由が出る", () => {
    const t = buildDailyPostCountMessage("9月5日", [{ username: "b", posted: 0, awaiting: 5, canceled: 3, failed: 0, pending: 0, entitled: 3 }]);
    expect(t).toContain("★昨日は1件も公開されていません（承認待ち 5件・取り消し 3件）");
    expect(t).toContain("承認待ちの投稿は「今日の投稿」から");
  });
  it("契約より少なければ差分を出す", () => {
    const t = buildDailyPostCountMessage("9月5日", [{ username: "c", posted: 1, awaiting: 2, canceled: 0, failed: 0, pending: 0, entitled: 3 }]);
    expect(t).toContain("ご契約より 2件 少ない（承認待ち 2件）");
  });
});
