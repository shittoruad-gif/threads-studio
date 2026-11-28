import { describe, it, expect } from "vitest";
import { LOCAL_TALK_ANGLE_ID, LOCAL_TALK_ACCOUNT_PLAN, localTalkPlanFor, localTalkDue, localTalkNote } from "../shared/localTalk";
import { nudgeAwayFromOccupied } from "../shared/fixedPostHours";

describe("地元の会話の入れ方を決めてあるアカウント（2026-11-28）", () => {
  it("表に無いアカウントは今までどおり（何も決めない）", () => {
    expect(localTalkPlanFor(999999)).toBeNull();
    expect(localTalkPlanFor(null)).toBeNull();
    expect(localTalkDue(null, [])).toBe(false);
  });

  it("直近 everyN-1 本に地元の会話が無ければ、次の1本を地元の会話にする", () => {
    const plan = { everyN: 3 };
    expect(localTalkDue(plan, ["lesson", "qa", LOCAL_TALK_ANGLE_ID])).toBe(true);
    expect(localTalkDue(plan, ["lesson", LOCAL_TALK_ANGLE_ID, "qa"])).toBe(false);
    expect(localTalkDue(plan, [LOCAL_TALK_ANGLE_ID, "qa", "lesson"])).toBe(false);
    expect(localTalkDue(plan, [])).toBe(true);
  });

  it("3本続けて作ると、地元の会話は1本だけ入る", () => {
    const plan = { everyN: 3 };
    const recent: string[] = ["lesson", "qa", "seasonal"];
    const made: string[] = [];
    for (let i = 0; i < 6; i++) {
      const a = localTalkDue(plan, recent) ? LOCAL_TALK_ANGLE_ID : "lesson";
      made.push(a);
      recent.unshift(a);
    }
    expect(made.filter((a) => a === LOCAL_TALK_ANGLE_ID)).toHaveLength(2);
    expect(made.slice(0, 3).filter((a) => a === LOCAL_TALK_ANGLE_ID)).toHaveLength(1);
  });

  it("寄せ方は、その回の指示に入る（決めていなければ入らない）", () => {
    const base = localTalkNote({ places: ["岡山"], allowEmoji: true });
    expect(base).not.toContain("寄せ方");
    const plan = Object.values(LOCAL_TALK_ACCOUNT_PLAN)[0];
    const note = localTalkNote({ places: ["岡山"], allowEmoji: true, focus: plan.focus });
    expect(note).toContain("このお店の「地元の会話」の寄せ方");
    expect(note).toContain("天気・気温");
    expect(note).toContain("必ず質問で終える");
  });
});

describe("すでにある投稿から離して置く（2026-11-28）", () => {
  const at = (h: number, m: number) => new Date(Date.UTC(2026, 10, 28, h - 9, m));
  it("離れていれば元のまま", () => {
    expect(nudgeAwayFromOccupied(at(21, 15), [at(15, 0)], 25).getTime()).toBe(at(21, 15).getTime());
    expect(nudgeAwayFromOccupied(at(21, 15), [], 25).getTime()).toBe(at(21, 15).getTime());
  });
  it("11分差なら、25分以上あくまで後ろへ", () => {
    const out = nudgeAwayFromOccupied(at(21, 15), [at(21, 26)], 25);
    expect(out.getTime()).toBe(at(21, 55).getTime());
  });
  it("後ろに空きが無ければ前へ（その日のうちに置く）", () => {
    const out = nudgeAwayFromOccupied(at(23, 40), [at(23, 45)], 25);
    expect(out.getTime()).toBe(at(23, 20).getTime());
  });
  it("先に置いた枠どうしも離れる", () => {
    const occupied = [at(21, 26)];
    const a = nudgeAwayFromOccupied(at(21, 15), occupied, 25);
    const b = nudgeAwayFromOccupied(at(21, 40), [...occupied, a], 25);
    expect(Math.abs(b.getTime() - a.getTime())).toBeGreaterThanOrEqual(25 * 60_000);
    expect(Math.abs(b.getTime() - at(21, 26).getTime())).toBeGreaterThanOrEqual(25 * 60_000);
  });
});
