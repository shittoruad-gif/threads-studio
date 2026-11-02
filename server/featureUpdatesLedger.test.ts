import { describe, it, expect } from "vitest";
import {
  FEATURE_UPDATES, isVerified, pendingUpdates, updatesFor, renderFeatureUpdates, hasPictograph, adminPreviewHead, contextLabel,
  type FeatureUpdate, type FeatureUpdateContext,
} from "../shared/featureUpdates";
import { isProOrAbove } from "../shared/mediaPosts";

// 2026-11-02 三上様「アップデートされるたびに配信されるように。1週間に1回」
// 教訓：写真つき自動投稿は mode=on にしたが本番で一度も動いていなかった → 本番で動いたと確かめた項目だけ出す

const proLine: FeatureUpdateContext = { planId: "pro", maxPerDay: 3, requireApproval: true, hasLine: true };
const lightLine: FeatureUpdateContext = { planId: "light", maxPerDay: 1, requireApproval: false, hasLine: true };
const proMail: FeatureUpdateContext = { planId: "pro", maxPerDay: 3, requireApproval: true, hasLine: false };

const T: FeatureUpdate[] = [
  { id: "a", date: "2026-11-01", title: "全員の項目", body: "本文A", verifiedAt: "2026-11-02", verifiedHow: "x" },
  { id: "b", date: "2026-11-01", title: "プロ以上の項目", body: "本文B", when: (c) => c.hasLine && isProOrAbove(c.planId), verifiedAt: "2026-11-02", verifiedHow: "x" },
  { id: "c", date: "2026-11-01", title: "未確認の項目", body: "本文C", verifiedHow: "未確認" },
];

describe("台帳：本番で確かめた項目だけ", () => {
  it("verifiedAt の無い項目は候補にも、お一人ずつの項目にも出ない", () => {
    expect(pendingUpdates(new Set(), T).map((u) => u.id)).toEqual(["a", "b"]);
    expect(updatesFor(T, proLine).map((u) => u.id)).not.toContain("c");
    expect(isVerified({ ...T[0], verifiedAt: "そのうち" })).toBe(false);
  });
  it("送信ずみ・出さないと決めた項目は候補に出ない", () => {
    expect(pendingUpdates(new Set(["a"]), T).map((u) => u.id)).toEqual(["b"]);
  });
  it("本物の台帳：写真つき投稿は未確認のまま（配信されない）。どの項目にも verifiedHow がある", () => {
    const media = FEATURE_UPDATES.find((u) => u.id === "media_posts");
    expect(media && isVerified(media)).toBe(false);
    for (const u of FEATURE_UPDATES) {
      expect(u.verifiedHow, u.id).toBeTruthy();
      expect(/^\d{4}-\d{2}-\d{2}$/.test(u.date), u.id).toBe(true);
    }
    expect(new Set(FEATURE_UPDATES.map((u) => u.id)).size).toBe(FEATURE_UPDATES.length);
  });
});

describe("プラン・設定の条件", () => {
  it("プロ以上の項目はプロの方にだけ。ライトの方には出ない", () => {
    expect(updatesFor(T, proLine).map((u) => u.id)).toEqual(["a", "b"]);
    expect(updatesFor(T, lightLine).map((u) => u.id)).toEqual(["a"]);
  });
  it("本物の台帳：写真つき（確かめたら）はプロ以上でLINEのある方だけ・案を見る時間は確認ありの方だけ", () => {
    const media = { ...FEATURE_UPDATES.find((u) => u.id === "media_posts")!, verifiedAt: "2026-11-09" };
    expect(updatesFor([media], proLine)).toHaveLength(1);
    expect(updatesFor([media], lightLine)).toHaveLength(0);
    expect(updatesFor([media], proMail)).toHaveLength(0);
    const rh = FEATURE_UPDATES.find((u) => u.id === "review_hour")!;
    expect(updatesFor([rh], proLine)).toHaveLength(1);
    expect(updatesFor([rh], lightLine)).toHaveLength(0);
  });
  it("その方に届いている項目は二度出さない", () => {
    expect(updatesFor(T, proLine, new Set(["a"])).map((u) => u.id)).toEqual(["b"]);
  });
});

describe("文面", () => {
  it("0件なら文を作らない（空のお知らせは送らない）", () => {
    expect(renderFeatureUpdates([])).toBeNull();
  });
  it("安心の一文→番号つきの項目→最後の一言。LINEとメールで最後の一言を変える", () => {
    const t = renderFeatureUpdates(T.slice(0, 2))!;
    expect(t).toContain("投稿の中身は何も変わりません");
    expect(t.indexOf("何も変わりません")).toBeLessThan(t.indexOf("1. 全員の項目"));
    expect(t).toContain("2. プロ以上の項目");
    expect(t.trim().endsWith("このトークにそのまま送ってください。")).toBe(true);
    expect(renderFeatureUpdates(T.slice(0, 1), "email")!).toContain("このメールにそのままご返信ください");
  });
  it("本物の台帳の全項目：絵文字なし・「AI」と書かない・社内メモ（verifiedHow）はお客様の文に出ない", () => {
    const all = FEATURE_UPDATES.map((u) => ({ ...u, verifiedAt: "2026-11-02" }));
    for (const ch of ["line", "email"] as const) {
      const t = renderFeatureUpdates(all, ch)!;
      expect(hasPictograph(t)).toBe(false);
      expect(t).not.toMatch(/AI/);
      for (const u of FEATURE_UPDATES) expect(t).not.toContain(u.verifiedHow!);
    }
    const head = adminPreviewHead(all, 10, [{ label: contextLabel(proLine), count: 10, text: "x" }], 0);
    expect(hasPictograph(head)).toBe(false);
  });
});

