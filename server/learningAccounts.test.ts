import { describe, it, expect } from "vitest";
import { inLearning, learningExtra, trialFor, learningSlotTimes, LEARNING_TRIALS, LEARNING_ACCOUNTS, TRIAL_COMMON_RULES, burstTotalFor, burstGrid, burstSlotsToMake, LEARNING_BURST } from "../shared/learningAccounts";
import { groupByRatio, lengthBucket, firstLineTraits, learningReportText, type LearningRow } from "../shared/learningReport";
import { postingTimeTestHours } from "../shared/postingTimeTest";

// 2026-10-07 三上様「Moveactの店舗をもっと投稿数を増やして、リーチが取れる投稿の傾向を取れるように」
const at = (ymd: string, hm = "06:00") => Date.parse(`${ymd}T${hm}:00+09:00`);
const fmt = (d: Date) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(11, 16);

describe("学習用アカウント", () => {
  it("Moveact 2店と株式会社しっとる公式だけ・期間内だけ（10/10 から公式も）", () => {
    expect(inLearning(10, at("2026-10-08"))).toBe(true);
    expect(inLearning(12, at("2026-11-30"))).toBe(true);
    expect(inLearning(36, at("2026-10-11"))).toBe(true);
    expect(inLearning(10, at("2026-10-07"))).toBe(false);
    expect(inLearning(10, at("2026-12-01"))).toBe(false);
    for (const customer of [11, 21, 22, 24, 25, 31]) expect(inLearning(customer, at("2026-10-11"))).toBe(false);
  });
  it("冷却・慣らしで抑えている日は上乗せしない。10/10までは2店だけ＋2本", () => {
    expect(learningExtra(10, { capped: false, baseCount: 5 }, at("2026-10-10"))).toBe(2);
    expect(learningExtra(36, { capped: false, baseCount: 3 }, at("2026-10-10"))).toBe(0);
    expect(learningExtra(10, { capped: true, baseCount: 5 }, at("2026-10-14"))).toBe(0);
  });
  it("1日の合計は4日で30本まで段を踏む（10/11 12本→10/12 18本→10/13 24本→10/14から30本）", () => {
    expect(burstTotalFor("2026-10-10")).toBeNull();
    expect(burstTotalFor("2026-10-11")).toBe(12);
    expect(burstTotalFor("2026-10-12")).toBe(18);
    expect(burstTotalFor("2026-10-13")).toBe(24);
    expect(burstTotalFor("2026-10-14")).toBe(30);
    expect(burstTotalFor("2026-11-20")).toBe(30);
    // 上乗せ＝合計の目安−契約と補填
    expect(learningExtra(10, { capped: false, baseCount: 5 }, at("2026-10-14"))).toBe(25);
    expect(learningExtra(36, { capped: false, baseCount: 3 }, at("2026-10-11"))).toBe(9);
  });
  it("候補時刻は7:00〜23:20を等分し、30本でも25分以上あく", () => {
    const g = burstGrid("2026-10-14", 30);
    expect(g.length).toBe(30);
    expect(fmt(g[0])).toBe("07:00");
    for (let i = 1; i < g.length; i++) expect(g[i].getTime() - g[i - 1].getTime()).toBeGreaterThanOrEqual(LEARNING_BURST.minGapMinutes * 60_000);
    expect(fmt(g[g.length - 1]) <= "23:20").toBe(true);
  });
  it("今ある投稿と25分以内の時刻・時間外は作らない。何度動いても二重に作らない", () => {
    const g = burstGrid("2026-10-14", 30);
    const from = at("2026-10-14", "09:00"), to = at("2026-10-14", "10:20");
    const first = burstSlotsToMake(g, [new Date(at("2026-10-14", "09:30"))], from, to);
    for (const t of first) expect(Math.abs(t.getTime() - at("2026-10-14", "09:30"))).toBeGreaterThanOrEqual(25 * 60_000);
    expect(first.every((t) => t.getTime() >= from && t.getTime() <= to)).toBe(true);
    // 作った分が「今ある投稿」に入れば、次の回は同じ時刻を作らない
    const again = burstSlotsToMake(g, [new Date(at("2026-10-14", "09:30")), ...first], from, to);
    expect(again.length).toBe(0);
  });
  it("試しは13種類を回し、1日のうち同じアカウントで条件が偏らない", () => {
    expect(LEARNING_TRIALS.length).toBe(13);
    for (const acc of LEARNING_ACCOUNTS.accountIds) {
      const keys = Array.from({ length: 26 }, (_, i) => trialFor(acc, i, at("2026-10-14")).key);
      const count: Record<string, number> = {};
      for (const k of keys) count[k] = (count[k] ?? 0) + 1;
      expect(Object.keys(count).length).toBe(13);
      for (const k of Object.keys(count)) expect(count[k]).toBe(2);
    }
  });
  it("学習の枠の時刻：投稿時間の試験の5枠のあいだに、ほかの枠と1時間以上あけて2本置ける（試験の全日程）", () => {
    for (let d = 0; d < 34; d++) for (const a of LEARNING_ACCOUNTS.accountIds) {
      const now = new Date(at("2026-09-24") + d * 86400e3);
      const hours = postingTimeTestHours(a, now)!;
      const times = learningSlotTimes(hours, 2, "2026-10-10");
      expect(times.length).toBe(2);
      const mins = times.map((t) => { const [h, m] = fmt(t).split(":").map(Number); return h * 60 + m; });
      for (const m of mins) {
        expect(m).toBeGreaterThanOrEqual(7 * 60);
        expect(m).toBeLessThanOrEqual(23 * 60);
        // ほかの枠は h:00〜h:29 に出る
        for (const h of hours) expect(Math.min(Math.abs(m - h * 60), Math.abs(m - (h * 60 + 29)))).toBeGreaterThanOrEqual(60);
      }
      expect(Math.abs(mins[0] - mins[1])).toBeGreaterThanOrEqual(60);
    }
  });
  it("1時間以上あけられなければ置かない", () => {
    const packed = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
    expect(learningSlotTimes(packed, 2, "2026-10-10").length).toBe(0);
  });
});

describe("リーチの傾向の集計", () => {
  const now = at("2026-10-30", "12:00");
  const old = new Date(at("2026-10-20"));
  const row = (accountId: number, impressions: number, text: string, experimentKey: string | null = null): LearningRow =>
    ({ accountId, impressions, postedAt: old, text, experimentKey, angle: "local", area: "岡山県倉敷市玉島" });
  it("アカウントごとの中央値でそろえる（大きい店に引っ張られない）", () => {
    const rows = [
      ...[100, 100, 100, 100].map((v) => row(1, v, "ふつう")),
      ...[1000, 1000, 1000, 1000].map((v) => row(2, v, "ふつう")),
      ...[200, 200, 200].map((v) => row(1, v, "短", "len_oneliner")),
      ...[2000, 2000, 2000].map((v) => row(2, v, "短", "len_oneliner")),
    ];
    const g = groupByRatio(rows, (r) => r.experimentKey ?? "control", undefined, now);
    const one = g.find((x) => x.key === "len_oneliner")!;
    expect(one.n).toBe(6);
    expect(one.medianRatio).toBeGreaterThanOrEqual(1.3);
    expect(one.verdict).toBe("伸びる");
  });
  it("本数が足りなければ「まだ分からない」", () => {
    const rows = [...[100, 100, 100].map((v) => row(1, v, "a")), row(1, 900, "b", "len_long")];
    expect(groupByRatio(rows, (r) => r.experimentKey ?? "control", undefined, now).find((x) => x.key === "len_long")!.verdict).toBe("まだ分からない");
  });
  it("公開から48時間たっていない投稿は数えない", () => {
    const fresh = { ...row(1, 9999, "a", "len_long"), postedAt: new Date(now - 3600e3) };
    expect(groupByRatio([fresh], (r) => r.experimentKey, undefined, now)).toEqual([]);
  });
  it("長さ・1行目の見分け", () => {
    expect(lengthBucket("あ".repeat(40))).toBe("〜50字");
    expect(lengthBucket("あ".repeat(300))).toBe("251字〜");
    expect(firstLineTraits("肩こり、放っていませんか？\n本文")).toContain("1行目が問いかけ");
    expect(firstLineTraits("3つのコツ\n本文")).toContain("1行目に数字");
    expect(firstLineTraits("倉敷市で整体なら\n本文", "岡山県倉敷市玉島")).toContain("1行目に地域名");
    expect(firstLineTraits("こんにちは\n本文")).toEqual(["1行目にどれも無し"]);
  });
  it("まとめの文に、基準と承諾が要ることが書いてある", () => {
    const t = learningReportText({ learning: [], all: [], days: 21, now });
    expect(t).toContain("6本以上");
    expect(t).toContain("三上様の承諾後");
  });
});

// 10/10 朝 acc10：ひとことが「運動が続かない人、倉敷市玉島で3人に1人。」で自然さ2/5、
// 3回目と「長め」が「私もそうでした」「私だけじゃないはず」で作り話の点検に落ち、2枠とも見送り
describe("学習の試しの指示（10/10 acc10 の見送り）", () => {
  it("どの試しにも、書き手の体験・心の声と作った割合を書かない決まりが付く", () => {
    const all = TRIAL_COMMON_RULES.join("\n");
    expect(all).toContain("私もそうでした");
    expect(all).toContain("私だけじゃないはず");
    expect(all).toContain("3人に1人");
    expect(all).toContain("作り話・効果の断定・登録に無い事実・価格の禁止は変わらない");
  });
  it("ひとことは、です・ますで言い切り、名詞や割合で切らない", () => {
    const one = LEARNING_TRIALS.find((t) => t.key === "len_oneliner")!;
    expect(one.note).toContain("です・ます");
    expect(one.note).toContain("割合・人数・統計は書かない");
  });
});
