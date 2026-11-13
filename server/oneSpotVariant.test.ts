import { describe, it, expect } from "vitest";
import { applyOneSpot, isOneSpotSlot, nextSpot, ONE_SPOT, oneSpotExperimentKey, SEASON_RE, stripSignature } from "../shared/oneSpotVariant";

const NOW = Date.parse("2026-11-20T10:00:00+09:00");
const SRC = "夕方になると腰が重い人の共通点。\n座りっぱなしで股関節が固まっています。\n1時間に1回、立つだけで変わります。";

describe("1か所だけ変えた投稿の比べ", () => {
  it("対象は学習用の3アカウントの、最後の上乗せの枠だけ", () => {
    expect(isOneSpotSlot(10, 4, 3, 5, NOW)).toBe(true);
    expect(isOneSpotSlot(10, 3, 3, 5, NOW)).toBe(false);
    expect(isOneSpotSlot(10, 2, 3, 3, NOW)).toBe(false); // 上乗せが無い日は契約の枠を使わない
    expect(isOneSpotSlot(22, 4, 3, 5, NOW)).toBe(false); // お客様のアカウントには広げない
    expect(isOneSpotSlot(10, 4, 3, 5, Date.parse("2026-11-13T12:00:00+09:00"))).toBe(false);
    expect([...ONE_SPOT.accountIds]).toEqual([10, 12, 36]);
  });
  it("1行目の言葉だけを置き換え、ほかは一字も変えない", () => {
    const r = applyOneSpot(SRC, "first_line", "腰が重い", "立ち上がるのがおっくうな");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text.split("\n")[0]).toBe("夕方になると立ち上がるのがおっくうな人の共通点。");
      expect(r.text.split("\n").slice(1)).toEqual(SRC.split("\n").slice(1));
    }
  });
  it("場所が違う・元に無い・2回ある・同じ言葉・改行またぎは使わない", () => {
    expect(applyOneSpot(SRC, "first_line", "股関節が固まって", "お尻が固まって").ok).toBe(false);
    expect(applyOneSpot(SRC, "later_line", "腰が重い", "肩が重い").ok).toBe(false);
    expect(applyOneSpot(SRC, "later_line", "股関節が固まって", "お尻が固まって").ok).toBe(true);
    expect(applyOneSpot(SRC, "first_line", "背中が重い", "肩が重い").ok).toBe(false);
    expect(applyOneSpot("腰が重い。腰が重い人へ。", "first_line", "腰が重い", "肩が重い").ok).toBe(false);
    expect(applyOneSpot(SRC, "first_line", "腰が重い", "腰が重い").ok).toBe(false);
    expect(applyOneSpot(SRC, "first_line", "共通点。\n座り", "特徴。\n立ち").ok).toBe(false);
    expect(applyOneSpot("1行だけの投稿です。", "later_line", "投稿", "文章").ok).toBe(false);
  });
  it("1行目 → 2行目以降の順に試し、両方済んだら終わり", () => {
    expect(nextSpot([], 3)).toBe("first_line");
    expect(nextSpot(["first_line"], 3)).toBe("later_line");
    expect(nextSpot(["first_line"], 1)).toBeNull();
    expect(nextSpot(["first_line", "later_line"], 3)).toBeNull();
    expect(oneSpotExperimentKey("first_line").length).toBeLessThanOrEqual(40);
  });
  it("文末の署名は引き継がず、季節の言葉が入った投稿は元にしない", () => {
    expect(stripSignature("岡山で飲むコーヒーは落ち着きます。\n\n株式会社しっとるより。")).toBe("岡山で飲むコーヒーは落ち着きます。");
    expect(stripSignature("朝より夜のほうが体は硬いです。")).toBe("朝より夜のほうが体は硬いです。");
    expect(stripSignature("1行目。\n昨日より今日。")).toBe("1行目。\n昨日より今日。"); // 「より」で終わらない行は本文
    expect(SEASON_RE.test("玉島で秋といえば、食べたくなるもの")).toBe(true);
    expect(SEASON_RE.test("夕方になると腰が重い")).toBe(false);
  });
});
