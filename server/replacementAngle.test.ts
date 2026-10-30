import { describe, it, expect, vi, beforeEach } from "vitest";
import { pickAngle } from "../shared/postAngles";
import { LOCAL_TALK_ANGLE_ID } from "../shared/localTalk";

/**
 * 2026-10-30 どい接骨院様（acc37）：「地元の会話」の下書きに✕ →「代わりを作る」がまた地元の会話
 * （#5322「朝ごはん…八潮で、朝食におすすめのお店ありますか？」→ #5323「八潮の公園、紅葉が…」）で、続けて見送り。
 * 代わりの投稿は、見送った切り口（同じ枠で続けて見送ったものも）を外して選ぶ。
 */
describe("代わりの投稿：見送った切り口を選ばない", () => {
  it("excludeAngleIds の切り口は何度選んでも出ない", () => {
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 2000; i++) {
      const a = pickAngle({}, rnd, undefined, Date.now(), "store", { excludeAngleIds: [LOCAL_TALK_ANGLE_ID, "deep_worry"] });
      expect(a.id).not.toBe(LOCAL_TALK_ANGLE_ID);
      expect(a.id).not.toBe("deep_worry");
    }
  });

  it("外すと候補が無くなるときは元の候補から選ぶ（投稿ゼロにしない）", () => {
    const a = pickAngle({}, Math.random, undefined, Date.now(), "store", { excludeAngleIds: ["__all__"] });
    expect(a).toBeTruthy();
  });
});

const posts: any[] = [];
vi.mock("./db", () => ({ getScheduledPostsByUserId: async () => posts }));

describe("代わりの投稿：同じ枠で続けて見送った切り口もまとめて外す", () => {
  beforeEach(() => { posts.length = 0; });

  it("acc37 の実例：deep_worry ✕ → local_talk ✕ のあと、どちらも外す", async () => {
    const { replacementAvoidAngles } = await import("./autoPostScheduler");
    const slot = "2026-10-29T20:29:00.000Z";
    const old = new Date(Date.now() - 3 * 60 * 60 * 1000);
    posts.push(
      { id: 5307, angle: "deep_worry", status: "canceled", clientRating: "bad", scheduledAt: slot, updatedAt: old },
      { id: 5322, angle: LOCAL_TALK_ANGLE_ID, status: "canceled", clientRating: "bad", scheduledAt: slot, updatedAt: old },
      { id: 5200, angle: "pro_tip", status: "canceled", clientRating: "bad", scheduledAt: "2026-10-27T20:00:00.000Z", updatedAt: old },
      { id: 5100, angle: "qa", status: "posted", clientRating: null, scheduledAt: slot, updatedAt: old },
    );
    const got = await replacementAvoidAngles(15296, posts[1]);
    expect(got.sort()).toEqual(["deep_worry", LOCAL_TALK_ANGLE_ID].sort());
  });
});
