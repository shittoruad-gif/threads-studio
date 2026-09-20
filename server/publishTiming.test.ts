import { describe, it, expect } from "vitest";
import { slideOverdueTime, lateApprovalTime } from "../shared/publishTiming";

const jst = (s: string) => Date.parse(s + "+09:00");
const toJst = (d: Date) => new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 16);

describe("承認が間に合わなかった投稿のずらし方（2026-09-11）", () => {
  it("昼間に時刻を過ぎたら、2時間後の時間帯にずらす", () => {
    const r = slideOverdueTime(jst("2026-09-11T10:30:00"), () => 0);
    expect(toJst(r!.at)).toBe("2026-09-11T12:00");
    expect(r!.label).toBe("今日の12時台");
  });
  // ★2026-09-21：翌朝へずらすのをやめた。翌日どのみち「日をまたいだ承認待ち」として見送りになるうえ、
  //   朝6時の生成が「今日すでに1件ある」と数えて新規を作らず、公開0件の日を作っていた（香取様・実測）。
  it("19時以降はずらさない（そのまま置いて、日付が変わったら見送りにする）", () => {
    expect(slideOverdueTime(jst("2026-09-11T19:10:00"), () => 0.5)).toBeNull();
    expect(slideOverdueTime(jst("2026-09-11T21:20:00"), () => 0)).toBeNull();
  });
  it("21時直前は21時台で止める", () => {
    expect(toJst(slideOverdueTime(jst("2026-09-11T18:50:00"), () => 0)!.at)).toBe("2026-09-11T20:00");
  });
  it("遅れて承認：7〜21時はすぐ、夜は翌朝10時台", () => {
    expect(lateApprovalTime(jst("2026-09-11T14:00:00")).label).toBe("まもなく");
    const late = lateApprovalTime(jst("2026-09-11T23:30:00"), () => 0);
    expect(toJst(late.at)).toBe("2026-09-12T10:00");
    expect(lateApprovalTime(jst("2026-09-12T06:00:00"), () => 0).label).toBe("明日の10時ごろに");
  });
});
