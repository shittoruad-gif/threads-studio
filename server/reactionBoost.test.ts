/**
 * 1か月動かして反応が取れていないアカウントの改善（2026-10-02 三上様指示・shared/reactionBoost.ts）。
 * （公開リポジトリのため、お客様の実データは入れず架空の数字で書く）
 */
import { describe, it, expect } from "vitest";
import {
  isLowReaction, computePooledReactions, reactionMultiplier, lowReactionNote, shortArea, LOW_REACTION, isOneLinerTurn,
} from "../shared/reactionBoost";
import { pickAngle } from "../shared/postAngles";

describe("反応が取れていないアカウントの判定", () => {
  it("連携3週間以上・30日で20本以上・1本あたりの反応が0.35未満なら対象", () => {
    expect(isLowReaction({ linkedDays: 30, posts: 74, reactions: 6 })).toBe(true);
    expect(isLowReaction({ linkedDays: 30, posts: 60, reactions: 25 })).toBe(false); // 0.42
  });
  it("立ち上がり（3週間未満）と本数が少ないうちは判定しない", () => {
    expect(isLowReaction({ linkedDays: LOW_REACTION.minDays - 1, posts: 60, reactions: 0 })).toBe(false);
    expect(isLowReaction({ linkedDays: 40, posts: LOW_REACTION.minPosts - 1, reactions: 0 })).toBe(false);
    expect(isLowReaction(null)).toBe(false);
  });
});

describe("全アカウントの実測（切り口ごとの反応の比）", () => {
  it("アカウントごとに平均を1にそろえてから平均する（反応の多い店に引っ張られない）", () => {
    const rows = [
      // 反応の多い店：local 10・pro_tip 10（差なし）
      { accountId: 1, angle: "local", reactions: 10 }, { accountId: 1, angle: "pro_tip", reactions: 10 },
      // 反応の少ない店：local 2・pro_tip 0
      { accountId: 2, angle: "local", reactions: 2 }, { accountId: 2, angle: "pro_tip", reactions: 0 },
      // まだ反応0件の店は比が出せないので除く
      { accountId: 3, angle: "local", reactions: 0 }, { accountId: 3, angle: "pro_tip", reactions: 0 },
    ];
    const p = computePooledReactions(rows);
    expect(p.local.ratio).toBeCloseTo(1.5);
    expect(p.pro_tip.ratio).toBeCloseTo(0.5);
    expect(p.local.count).toBe(2);
  });
});

describe("反応の倍率", () => {
  const pooled = { local: { ratio: 1.6, count: 50 }, pro_tip: { ratio: 0.3, count: 80 }, rare: { ratio: 3, count: 5 } };
  it("反応が取れていないアカウントは、自分のデータが無くても全アカウントの実測で寄せる", () => {
    expect(reactionMultiplier("local", undefined, 0, pooled, true)).toBeCloseTo(1.6);
    expect(reactionMultiplier("pro_tip", undefined, 0, pooled, true)).toBeCloseTo(0.35); // 下限
    expect(reactionMultiplier("rare", undefined, 0, pooled, true)).toBe(1); // 本数が少ない実測は使わない
  });
  it("それ以外のアカウントは、自分のデータだけで穏やかに（全アカウントの実測は使わない）", () => {
    expect(reactionMultiplier("local", undefined, 0, pooled, false)).toBe(1);
    expect(reactionMultiplier("local", { avgReactions: 4, count: 8 }, 1, pooled, false)).toBe(1.5); // 上限
    expect(reactionMultiplier("local", { avgReactions: 0, count: 8 }, 1, pooled, false)).toBe(0.6); // 下限
  });
  it("自分のデータが貯まるほど、全アカウントの実測より自分の結果を優先する", () => {
    // 他店では反応が取れない pro_tip でも、この店で8本以上反応が取れていれば戻す
    expect(reactionMultiplier("pro_tip", { avgReactions: 1.2, count: 8 }, 1, pooled, true)).toBeCloseTo(1.2);
  });
});

describe("切り口選び：反応が取れていないアカウントは、反応の取れる切り口が増える", () => {
  const count = (low: boolean) => {
    const perf = {
      perAngle: {}, overallAvg: 0, overallAvgReactions: 0, lowReaction: low,
      pooled: { local: { ratio: 1.6, count: 50 }, pro_tip: { ratio: 0.3, count: 80 } },
    };
    let seed = 1;
    const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const c: Record<string, number> = {};
    for (let i = 0; i < 4000; i++) {
      const a = pickAngle({}, rand, perf as any, Date.parse("2026-10-02T00:00:00Z"));
      c[a.id] = (c[a.id] ?? 0) + 1;
    }
    return c;
  };
  it("local が増え、pro_tip が減る", () => {
    const normal = count(false), low = count(true);
    expect(low.local).toBeGreaterThan(normal.local * 1.3);
    expect(low.pro_tip).toBeLessThan(normal.pro_tip * 0.6);
  });
});

describe("生成に足す指示", () => {
  it("短め・来てもらうための言葉なし・地域名（市区町村まで）・本人の目線", () => {
    const n = lowReactionNote({ angleId: "local", area: "茨城県土浦市神立中央1丁目", shortLength: true });
    expect(n).toContain("60字前後");
    expect(n).toContain("「予約」");
    expect(n).toContain("（土浦市）");
    expect(n).not.toContain("神立中央1丁目");
    expect(n).toContain("本人の目線");
  });
  it("予約への案内そのものが目的の回は、来てもらうための言葉を止めない。長めを選んだ方には字数を指定しない", () => {
    const n = lowReactionNote({ angleId: "reservation_funnel", area: null, shortLength: false });
    expect(n).not.toContain("「予約」");
    expect(n).not.toContain("60字前後");
  });
  it("地域名の取り出し", () => {
    expect(shortArea("岡山")).toBe("岡山");
    expect(shortArea("東京都港区赤坂")).toBe("港区");
    expect(shortArea("")).toBe("");
  });
});

describe("ひとことの回（2026-10-02 三上様共有のアカウントの型）", () => {
  it("地元・人柄の回だけ、1日おきに", () => {
    const d1 = new Date("2026-10-02T09:00:00+09:00"), d2 = new Date("2026-10-03T09:00:00+09:00");
    expect(isOneLinerTurn("local", 0, d1)).not.toBe(isOneLinerTurn("local", 0, d2));
    expect(isOneLinerTurn("pro_tip", 0, d1) || isOneLinerTurn("pro_tip", 0, d2)).toBe(false);
  });
  it("ひとことの回は20〜40字の指示に替わる（長めを選んだ方には出さない）", () => {
    expect(lowReactionNote({ angleId: "local", area: "岡山", shortLength: true, oneLiner: true })).toContain("20〜40字");
    expect(lowReactionNote({ angleId: "local", area: "岡山", shortLength: true, oneLiner: true })).not.toContain("60字前後");
    expect(lowReactionNote({ angleId: "local", area: "岡山", shortLength: false, oneLiner: true })).not.toContain("20〜40字");
  });
});

describe("返信で教えて（試験の切り口・三上様のアカウントだけ）", () => {
  it("返信のお願いで締めていれば合格・売り込みが入れば不合格", async () => {
    const { checkAngle } = await import("../shared/angleGuard");
    expect(checkAngle("invite_reply", "この辺りで好きな朝の散歩道、ありますか。\n返信で教えてください。").ok).toBe(true);
    expect(checkAngle("invite_reply", "好きな散歩道は？ご予約はプロフィールから。返信で教えてください。").ok).toBe(false);
    expect(checkAngle("invite_reply", "好きな散歩道があります。").ok).toBe(false);
  });
  it("お客様のアカウントには出ない（試験は三上様のアカウントだけ）", () => {
    let seed = 7;
    const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    for (let i = 0; i < 2000; i++) expect(pickAngle({}, rand, undefined, Date.now()).id).not.toBe("invite_reply");
  });
});
