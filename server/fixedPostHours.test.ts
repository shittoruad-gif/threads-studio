import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateFixedPostHours, parseFixedPostHours, fixedSlotTimes, planFixedDaySlots, deferredTimeForFixedHours,
  FIXED_POST_HOURS_MAX, OCCUPIED_GAP_MINUTES, slotTimeForIndex,
} from "../shared/fixedPostHours";
import { nextDaySameTime } from "../shared/dailyCap";

vi.mock("./db", () => ({ getAccountSlotTimesOnDate: vi.fn(async () => []) }));
import * as db from "./db";
import { deferredPostTime } from "./fixedPostHoursCheck";

// JST の年月日時分 → Date
const jst = (y: number, m: number, d: number, h: number, mi = 0) => new Date(Date.UTC(y, m - 1, d, h, mi) - 9 * 3600e3);
const hm = (t: Date) => new Date(t.getTime() + 9 * 3600e3).toISOString().slice(5, 16).replace("T", " ");

describe("決めておく時刻の検証", () => {
  it("0〜23の昇順・重複なし・最大5件を受け付ける", () => {
    expect(validateFixedPostHours("12,15")).toEqual({ ok: true, hours: [12, 15], value: "12,15" });
    expect(validateFixedPostHours(" 0, 23 ")).toEqual({ ok: true, hours: [0, 23], value: "0,23" });
    expect(validateFixedPostHours("7,9,12,15,21").ok).toBe(true);
  });
  it("空は解除", () => {
    expect(validateFixedPostHours("")).toEqual({ ok: true, hours: [], value: "" });
  });
  it("範囲外・数でない・重複・6件以上・昇順でないものは断る", () => {
    expect(validateFixedPostHours("24").ok).toBe(false);
    expect(validateFixedPostHours("-1").ok).toBe(false);
    expect(validateFixedPostHours("12:00").ok).toBe(false);
    expect(validateFixedPostHours("12,,15").ok).toBe(false);
    expect(validateFixedPostHours("12.5").ok).toBe(false);
    expect(validateFixedPostHours("12,12").ok).toBe(false);
    expect(validateFixedPostHours("15,12").ok).toBe(false);
    expect(validateFixedPostHours("1,2,3,4,5,6").ok).toBe(false);
    expect(FIXED_POST_HOURS_MAX).toBe(5);
  });
  it("DB の値：NULL・空・決まりに合わない値は null（＝今まで通り）", () => {
    expect(parseFixedPostHours(null)).toBeNull();
    expect(parseFixedPostHours(undefined)).toBeNull();
    expect(parseFixedPostHours("")).toBeNull();
    expect(parseFixedPostHours("15,12")).toBeNull();
    expect(parseFixedPostHours("abc")).toBeNull();
    expect(parseFixedPostHours("12,15")).toEqual([12, 15]);
  });
});

describe("その日の時刻（前の晩・朝の回）", () => {
  const evening = jst(2026, 11, 4, 20, 30);   // 前の晩の回（確認21時 → 20:30）
  const morning = jst(2026, 11, 5, 6, 0);     // 朝6時の回
  // 今までの決め方の代わり（k 番目 → 21,15,20,22 時の 7 分）
  const def = (day: number) => (k: number) => jst(2026, 11, day, [21, 15, 20, 22][k % 4], 7);

  it("1本なら12:00、2本なら12:00と15:00（分はちょうど0分）", () => {
    const one = planFixedDaySlots({ hours: [12, 15], count: 1, dayOffset: 1, now: evening, occupied: [], gapMinutes: OCCUPIED_GAP_MINUTES, defaultAt: def(5) });
    expect(one.map(hm)).toEqual(["11-05 12:00"]);
    const two = planFixedDaySlots({ hours: [12, 15], count: 2, dayOffset: 1, now: evening, occupied: [], gapMinutes: OCCUPIED_GAP_MINUTES, defaultAt: def(5) });
    expect(two.map(hm)).toEqual(["11-05 12:00", "11-05 15:00"]);
  });
  it("ご本人の18時の投稿があっても12:00と15:00はそのまま", () => {
    const two = planFixedDaySlots({ hours: [12, 15], count: 2, dayOffset: 1, now: evening, occupied: [jst(2026, 11, 5, 18)], gapMinutes: 60, defaultAt: def(5) });
    expect(two.map(hm)).toEqual(["11-05 12:00", "11-05 15:00"]);
  });
  it("その時刻にご本人の投稿があれば、次の決めた時刻へ", () => {
    const one = planFixedDaySlots({ hours: [12, 15], count: 1, dayOffset: 1, now: evening, occupied: [jst(2026, 11, 5, 12)], gapMinutes: 60, defaultAt: def(5) });
    expect(one.map(hm)).toEqual(["11-05 15:00"]);
  });
  it("決めた時刻がすべて埋まっていれば今までの決め方（既存の投稿から離す）", () => {
    const one = planFixedDaySlots({ hours: [12, 15], count: 1, dayOffset: 1, now: evening, occupied: [jst(2026, 11, 5, 12), jst(2026, 11, 5, 15)], gapMinutes: 60, defaultAt: def(5) });
    expect(one.map(hm)).toEqual(["11-05 21:07"]);
  });
  it("決めた数より多いときは、残りを今までの決め方で決め、決めた時刻と重ねない", () => {
    // 3本目の今までの決め方は k=2 → 20:07。15時の枠を飛ばしたぶん 21:07 / 15:07 と重ならないか見る
    const three = planFixedDaySlots({ hours: [12, 15], count: 3, dayOffset: 0, now: morning, occupied: [jst(2026, 11, 5, 18)], gapMinutes: 60, defaultAt: def(5) });
    expect(three.map(hm)).toEqual(["11-05 12:00", "11-05 15:00", "11-05 20:07"]);
    // 今までの決め方が決めた時刻に近いとき（k=1 → 15:07）は次の候補へ進む
    const near = planFixedDaySlots({ hours: [15], count: 2, dayOffset: 0, now: morning, occupied: [], gapMinutes: 60, defaultAt: (k) => jst(2026, 11, 5, [15, 15, 20][k % 3], 7) });
    expect(near.map(hm)).toEqual(["11-05 15:00", "11-05 20:07"]);
  });
  it("残りどうしも離す（21:07 と 20:40 は重ねない）", () => {
    const r = planFixedDaySlots({ hours: [12], count: 3, dayOffset: 0, now: morning, occupied: [], gapMinutes: 60, defaultAt: (k) => jst(2026, 11, 5, [21, 21, 20, 15][k % 4], k === 2 ? 40 : 7) });
    expect(r.map(hm)).toEqual(["11-05 12:00", "11-05 21:07", "11-05 15:07"]);
  });
  it("前から5つまで・5本でも順に使う", () => {
    const r = fixedSlotTimes({ hours: [9, 12, 15, 18, 21], count: 5, dayOffset: 1, now: evening, occupied: [], gapMinutes: 60 });
    expect(r.map(hm)).toEqual(["11-05 09:00", "11-05 12:00", "11-05 15:00", "11-05 18:00", "11-05 21:00"]);
  });
});

describe("当日分（もう過ぎた時刻は使わない）", () => {
  it("13時に作るときは12時を飛ばして15時、足りない分は今までの決め方", () => {
    const now = jst(2026, 11, 5, 13, 0);
    expect(fixedSlotTimes({ hours: [12, 15], count: 2, dayOffset: 0, now, occupied: [], gapMinutes: 60 }).map(hm)).toEqual(["11-05 15:00"]);
    const r = planFixedDaySlots({ hours: [12, 15], count: 2, dayOffset: 0, now, occupied: [], gapMinutes: 60, defaultAt: (k) => jst(2026, 11, 5, [21, 15, 20][k % 3], 7) });
    expect(r.map(hm)).toEqual(["11-05 15:00", "11-05 20:07"]);
  });
  it("直前すぎる（10分以内）時刻も使わない", () => {
    const now = jst(2026, 11, 5, 11, 55);
    expect(fixedSlotTimes({ hours: [12, 15], count: 1, dayOffset: 0, now, occupied: [], gapMinutes: 60 }).map(hm)).toEqual(["11-05 15:00"]);
  });
});

describe("翌日へ回す時刻", () => {
  it("決めた時刻の投稿は翌日の同じ決めた時刻", () => {
    const base = nextDaySameTime(jst(2026, 11, 5, 12), jst(2026, 11, 5, 11).getTime());
    expect(hm(deferredTimeForFixedHours(base, [12, 15], [], 60))).toBe("11-06 12:00");
  });
  it("翌日のその時刻が埋まっていれば次の決めた時刻", () => {
    const base = nextDaySameTime(jst(2026, 11, 5, 12), jst(2026, 11, 5, 11).getTime());
    expect(hm(deferredTimeForFixedHours(base, [12, 15], [jst(2026, 11, 6, 12)], 60))).toBe("11-06 15:00");
  });
  it("決めた時刻でない投稿（設定前に作った分）は翌日の空いている決めた時刻へ", () => {
    const base = nextDaySameTime(jst(2026, 11, 5, 21, 13), jst(2026, 11, 5, 19).getTime());
    expect(hm(deferredTimeForFixedHours(base, [12, 15], [], 60))).toBe("11-06 12:00");
  });
  it("どれも埋まっていれば今まで通り（翌日の同じ時刻）", () => {
    const base = nextDaySameTime(jst(2026, 11, 5, 21, 13), jst(2026, 11, 5, 19).getTime());
    expect(hm(deferredTimeForFixedHours(base, [12, 15], [jst(2026, 11, 6, 12), jst(2026, 11, 6, 15)], 60))).toBe("11-06 21:13");
  });
  it("決めていなければ base のまま", () => {
    const base = jst(2026, 11, 6, 21, 13);
    expect(deferredTimeForFixedHours(base, null, [], 60)).toBe(base);
    expect(deferredTimeForFixedHours(base, [], [], 60)).toBe(base);
  });
});

describe("ほかのアカウントは今まで通り（fixedPostHours が NULL）", () => {
  beforeEach(() => vi.mocked(db.getAccountSlotTimesOnDate).mockClear());
  it("翌日へ回す時刻は nextDaySameTime と同じで、DB も読まない", async () => {
    const now = jst(2026, 11, 5, 19).getTime();
    for (const at of [jst(2026, 11, 5, 21, 13), jst(2026, 11, 5, 2, 30), jst(2026, 11, 5, 15, 4)]) {
      for (const acct of [{ id: 1, fixedPostHours: null }, { id: 2 }, { id: 3, fixedPostHours: "" }, { id: 4, fixedPostHours: "bad" }, null]) {
        expect((await deferredPostTime(acct as any, at, 10, now)).getTime()).toBe(nextDaySameTime(at, now).getTime());
      }
    }
    expect(db.getAccountSlotTimesOnDate).not.toHaveBeenCalled();
  });
  it("決めてあるアカウントは翌日の決めた時刻（その日の投稿を読む）", async () => {
    vi.mocked(db.getAccountSlotTimesOnDate).mockResolvedValueOnce([jst(2026, 11, 6, 12)]);
    const now = jst(2026, 11, 5, 19).getTime();
    const at = await deferredPostTime({ id: 9, fixedPostHours: "12,15" }, jst(2026, 11, 5, 12), 10, now);
    expect(hm(at)).toBe("11-06 15:00");
    expect(db.getAccountSlotTimesOnDate).toHaveBeenCalledWith(9, "2026-11-06", 10);
  });
});

describe("生成ループで枠に渡す時刻（slotTimeForIndex）", () => {
  const t = (h: number) => jst(2026, 11, 5, h, 3);
  const tomorrowAt = (i: number) => t(20 + i);
  it("決めていない（plannedTimes=null）なら入れる前と同じ：当日補充→その枠／前の晩→tomorrowAt／朝→null", () => {
    // 入れる前の式：sameDaySlots ? sameDaySlots[i] : (forTomorrow ? postingTimeOnDay(i, ...) : null)
    const before = (i: number, s: Date[] | null, f: boolean) => (s ? s[i] : (f ? tomorrowAt(i) : null));
    for (const s of [null, [t(15), t(21)]]) for (const f of [false, true]) for (const i of [0, 1, 2]) {
      expect(slotTimeForIndex(i, { sameDaySlots: s, plannedTimes: null, forTomorrow: f, tomorrowAt })).toEqual(before(i, s, f));
    }
  });
  it("決めてあれば plannedTimes を使う（朝の回でも）", () => {
    const planned = [jst(2026, 11, 5, 12), jst(2026, 11, 5, 15)];
    expect(slotTimeForIndex(0, { sameDaySlots: null, plannedTimes: planned, forTomorrow: false, tomorrowAt })).toBe(planned[0]);
    expect(slotTimeForIndex(1, { sameDaySlots: null, plannedTimes: planned, forTomorrow: true, tomorrowAt })).toBe(planned[1]);
  });
});
