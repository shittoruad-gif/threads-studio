import { describe, it, expect } from "vitest";
import { shouldNudgeAutoMode, autoModeNudgeText, type ApprovalStats } from "../shared/autoModeNudge";

const now = Date.parse("2026-09-24T00:00:00Z");
const base: ApprovalStats = {
  approvedTotal: 15, firstApprovedAt: "2026-09-10T00:00:00Z", approvedRecent: 12, declinedRecent: 1, editedRecent: 1,
  nudgeCount: 0, lastNudgeAt: null,
};

describe("自動（確認なし）へのお声がけ判定（2026-09-10）", () => {
  it("承認が習慣になっていて見送りが少なければ案内する", () => {
    expect(shouldNudgeAutoMode(base, now).ok).toBe(true);
  });
  it("承認10件未満・最初の承認から7日未満・直近の承認5件未満は案内しない", () => {
    expect(shouldNudgeAutoMode({ ...base, approvedTotal: 9 }, now).ok).toBe(false);
    expect(shouldNudgeAutoMode({ ...base, firstApprovedAt: "2026-09-20T00:00:00Z" }, now).ok).toBe(false);
    expect(shouldNudgeAutoMode({ ...base, approvedRecent: 4 }, now).ok).toBe(false);
  });
  it("見送りや手直しが多い（内容に納得していない）方には案内しない", () => {
    expect(shouldNudgeAutoMode({ ...base, approvedRecent: 8, declinedRecent: 4 }, now).ok).toBe(false);
    expect(shouldNudgeAutoMode({ ...base, editedRecent: 6 }, now).ok).toBe(false);
  });
  it("3回まで・21日おき。「このまま確認する」を選んだ方（count=3）には送らない", () => {
    expect(shouldNudgeAutoMode({ ...base, nudgeCount: 3 }, now).ok).toBe(false);
    expect(shouldNudgeAutoMode({ ...base, nudgeCount: 1, lastNudgeAt: "2026-09-10T00:00:00Z" }, now).ok).toBe(false);
    expect(shouldNudgeAutoMode({ ...base, nudgeCount: 1, lastNudgeAt: "2026-09-01T00:00:00Z" }, now).ok).toBe(true);
  });
  it("文面に件数と戻し方が入る", () => {
    const t = autoModeNudgeText(base);
    expect(t).toContain("15件の投稿を承認");
    expect(t).toContain("見送りは1件だけ");
    expect(t).toContain("公開前に確認する");
    expect(autoModeNudgeText({ ...base, declinedRecent: 0 })).toContain("見送りはありませんでした");
  });
});
