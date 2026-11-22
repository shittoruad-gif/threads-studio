import { describe, it, expect } from "vitest";
import { RECRUITING_LOCAL, recruitingLocalFor, recruitingOfferTurn, recruitingLocalNote, looksLikeRecruiting } from "../shared/recruitingPost";
import { localTalkPlaces } from "../shared/localTalk";

describe("地元の人に届ける求人（RECRUITING_LOCAL）", () => {
  it("対象は登録したお客様だけ。ほかの求人のお客様は変えない", () => {
    expect(recruitingLocalFor(32089)).toBe(true);
    expect(recruitingLocalFor(1)).toBe(false);
    expect(recruitingLocalFor(null)).toBe(false);
    expect(RECRUITING_LOCAL.userIds).toEqual([32089]);
  });
  it("はっきりした募集の回は、およそ5本に1本", () => {
    const base = Date.parse("2026-11-23T00:00:00+09:00");
    let n = 0, total = 0;
    for (let d = 0; d < 20; d++) for (let i = 0; i < 3; i++) { total++; if (recruitingOfferTurn(i, base + d * 86400_000)) n++; }
    expect(n).toBe(total / 5);
  });
  it("地域名は登録の住所から取り、募集の回とそれ以外で指示が変わる", () => {
    const places = localTalkPlaces("岡山県倉敷市阿知", null);
    expect(places).toEqual(["倉敷", "阿知"]);
    const offer = recruitingLocalNote(places, true);
    expect(offer).toContain("「倉敷」「阿知」");
    expect(offer).toContain("はっきりした募集の回");
    expect(offer).toContain("登録にあるものだけ");
    const usual = recruitingLocalNote(places, false);
    expect(usual).toContain("募集の呼びかけで締めない");
    expect(usual).not.toContain("はっきりした募集の回");
    expect(recruitingLocalNote([], false)).not.toContain("1行目に");
    expect(usual).toContain("実際にあった質問・会話として書かない");
    expect(usual).toContain("登録に無いこと（カラオケが苦手でも 等）は約束しない");
  });
  it("対象のお客様の登録は求人として読める", () => {
    expect(looksLikeRecruiting({ target: "BAR REVIVE で一緒に働くスタッフを募集しています（求人の投稿です）。", mainProblem: "アットホーム" })).toBe(true);
  });
  it("つなぎ込み：地元の会話は求人のうち対象のお客様だけ・地元の会話の回は求人の言葉の検査を外す", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync(new URL("./autoPostScheduler.ts", import.meta.url), "utf8");
    expect(src).toContain("if (looksLikeRecruiting(project) && !recruitingLocalFor(userId)) return true;");
    expect(src).toContain("looksLikeRecruiting(project) && !localTalkTurn ? RECRUITING_POST_ADDENDUM");
    expect(src).toContain("looksLikeRecruiting(project) && !localTalkTurn && !lastAttempt && !hasRecruitingMarker(naturalMain)");
  });
});
