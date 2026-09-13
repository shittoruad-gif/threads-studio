import { describe, it, expect } from "vitest";
import { computeDailyCap, nextDaySameTime, cooldownCapNotice, rampCapNotice, deletedPostsNotice, dateJstLabel } from "../shared/dailyCap";

describe("1日の公開上限（2026-09-13 R1）", () => {
  it("歴の長いアカウントも契約本数で頭打ち（9/12 滝本様 8件・Moveact 10件の再発防止）", () => {
    expect(computeDailyCap({ contract: 3, rampCount: 3, rampCapped: false, carry: 0, maxExtra: 2 })).toBe(3);
  });
  it("補填（手動＋自動の繰り越し）は合わせて＋2件まで", () => {
    expect(computeDailyCap({ contract: 3, rampCount: 4, rampCapped: false, carry: 1, maxExtra: 2 })).toBe(5);
    expect(computeDailyCap({ contract: 3, rampCount: 4, rampCapped: false, carry: 2, maxExtra: 2 })).toBe(5);
  });
  it("慣らし運転中・冷却中はその本数が優先（繰り越しを足さない）", () => {
    expect(computeDailyCap({ contract: 3, rampCount: 1, rampCapped: true, carry: 2, maxExtra: 2 })).toBe(1);
    expect(computeDailyCap({ contract: 3, rampCount: 2, rampCapped: true, carry: 1, maxExtra: 2 })).toBe(2);
  });
  it("最低1件", () => {
    expect(computeDailyCap({ contract: 1, rampCount: 0, rampCapped: false, carry: 0, maxExtra: 2 })).toBe(1);
  });
});

describe("翌日の同じ時刻へ送る", () => {
  // JST の年月日時分 → epoch ms
  const jst = (y: number, m: number, d: number, h: number, mi: number) => Date.UTC(y, m - 1, d, h, mi) - 9 * 3600e3;
  const asJst = (t: Date) => new Date(t.getTime() + 9 * 3600e3).toISOString();
  it("同じ時刻（JST）で翌日", () => {
    const at = jst(2026, 9, 13, 21, 17);
    expect(asJst(nextDaySameTime(at, at - 3600e3))).toBe("2026-09-14T21:17:00.000Z");
  });
  it("深夜の予定は翌日10:00に寄せる", () => {
    const at = jst(2026, 9, 13, 2, 30);
    expect(asJst(nextDaySameTime(at, at))).toBe("2026-09-14T10:00:00.000Z");
  });
  // ★公開が遅れても時刻はずらさない（毎日少しずつ後ろへ流れて、いつもの時間帯から外れるのを防ぐ）
  it("公開が遅れても、予定していた時刻のまま翌日", () => {
    const sched = jst(2026, 9, 13, 10, 17);
    const now = jst(2026, 9, 13, 14, 0);
    expect(asJst(nextDaySameTime(sched, now))).toBe("2026-09-14T10:17:00.000Z");
  });
  it("何日も前の予定でも、過去に戻さず「明日」へ送る", () => {
    const sched = jst(2026, 9, 10, 10, 17);
    const now = jst(2026, 9, 13, 14, 0);
    expect(asJst(nextDaySameTime(sched, now))).toBe("2026-09-14T10:17:00.000Z");
  });
});

describe("文言（R8：冷却中を「慣らし運転1日目」と言わない）", () => {
  it("冷却中の文面は『投稿が消されたため』", () => {
    const t = cooldownCapNotice("shittoru_official", dateJstLabel("2026-09-19"), 1);
    expect(t).toContain("投稿が消されたため");
    expect(t).toContain("9月19日まで");
    expect(t).not.toContain("慣らし運転");
    expect(t).not.toContain("1日目");
  });
  it("慣らし運転の文面は日数を『連携した日＝1日目』で言う", () => {
    const t = rampCapNotice("haisaiseikotsuin", 6, 2, 2);
    expect(t).toContain("7日目");
    expect(t).toContain("翌日に回しました");
  });
  it("消失検知の定型文（髙木様 9/13 承諾文の型）", () => {
    const t = deletedPostsNotice("miraiseitai.diet", 3, "9月20日");
    expect(t).toContain("3件が、Threads側で削除");
    expect(t).toContain("9月20日まで1日1件");
    expect(t).toContain("1日1件ずつ足してお届け");
  });
});
