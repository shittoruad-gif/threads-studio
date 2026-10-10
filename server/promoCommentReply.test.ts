import { describe, it, expect } from "vitest";
import { PROMOS, wantsPromo, replyTextFor, inPromoWindow } from "./promoCommentReply";

// 2026-10-11 三上様「コメントを促すように」「自動で返す（案C）」
const p = PROMOS.find((x) => x.key === "konko-seitai-1011")!;
describe("告知のコメントへの自動返信", () => {
  it("申し込みの意思が読めるコメントだけ返す", () => {
    for (const t of ["整体", "整体！", "受けてみたいです", "興味あります", "予約したい", "明日空いてますか"]) expect(wantsPromo(t)).toBe(true);
    for (const t of ["", "いいね", "フォローしました", "すごい"]) expect(wantsPromo(t)).toBe(false);
  });
  it("返す文は4通りを回し、必ず予約ページが入る", () => {
    const texts = [0, 1, 2, 3].map((n) => replyTextFor(p, n));
    expect(new Set(texts).size).toBe(4);
    for (const t of texts) expect(t).toContain("https://booking.moveact.net/menu/seitai-hisaichi-1011");
    expect(replyTextFor(p, 4)).toBe(texts[0]);
  });
  it("10/11 0時〜10/12 21時の間だけ動く", () => {
    expect(inPromoWindow(p, Date.parse("2026-10-10T23:59:00+09:00"))).toBe(false);
    expect(inPromoWindow(p, Date.parse("2026-10-11T09:00:00+09:00"))).toBe(true);
    expect(inPromoWindow(p, Date.parse("2026-10-12T20:59:00+09:00"))).toBe(true);
    expect(inPromoWindow(p, Date.parse("2026-10-12T21:01:00+09:00"))).toBe(false);
  });
  it("返事の文に料金の言い過ぎ・効果の断定が無い", () => {
    for (let n = 0; n < 4; n++) expect(replyTextFor(p, n)).not.toMatch(/治|改善|必ず|先着/);
  });
});
