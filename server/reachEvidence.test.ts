import { describe, it, expect } from "vitest";
import { reachNoteFor } from "../shared/reachEvidence";

// 2026-10-07 三上様「違う内容でも閲覧数が取れて結果が残せるのであれば問題ない」→ 承認カードに実績の一言
const perf = { overallAvg: 100, perAngle: { local: { avgImpressions: 160, count: 5 }, qa: { avgImpressions: 110, count: 8 }, aruaru: { avgImpressions: 300, count: 2 } } };

describe("承認カードの実績の一言", () => {
  it("3本以上・ふだんの1.2倍以上の切り口だけ、実数で書く", () => {
    expect(reachNoteFor("local", perf)).toBe("この形の投稿は、これまで5本の平均で、ふだんの約1.6倍見られています。");
  });
  it("差が小さい・本数が少ない・実績が無いときは何も書かない", () => {
    expect(reachNoteFor("qa", perf)).toBeNull();
    expect(reachNoteFor("aruaru", perf)).toBeNull();
    expect(reachNoteFor("seasonal", perf)).toBeNull();
    expect(reachNoteFor(null, perf)).toBeNull();
    expect(reachNoteFor("local", { overallAvg: 0, perAngle: {} })).toBeNull();
  });
  it("Meta AI呼びかけ・固定投稿には書かない", () => {
    expect(reachNoteFor("meta_ai_call", { overallAvg: 10, perAngle: { meta_ai_call: { avgImpressions: 100, count: 9 } } })).toBeNull();
  });
});
