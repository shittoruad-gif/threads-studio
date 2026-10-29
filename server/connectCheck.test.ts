import { describe, it, expect } from "vitest";
import { normalizeThreadsUsername, isValidThreadsUsername, judgeConnect, connectDeviceOf, retryGuide, notListedGuide, mismatchOwnerNote } from "../shared/connectCheck";
import { stashPendingConnect, takePendingConnect, peekPendingConnect, PENDING_CONNECT_TTL_MS } from "./pendingConnect";

describe("つなぎたいアカウントか確かめる（10/29 交流会用のアカウントで別のアカウントがつながった件）", () => {
  it("@・空白・全角・URL を外して比べる", () => {
    expect(normalizeThreadsUsername(" @Salon_Event_Okayama ")).toBe("salon_event_okayama");
    expect(normalizeThreadsUsername("＠ｓａｌｏｎ＿ｅｖｅｎｔ＿ｏｋａｙａｍａ")).toBe("salon_event_okayama");
    expect(normalizeThreadsUsername("https://www.threads.com/@salon_event_okayama?xmt=1")).toBe("salon_event_okayama");
    expect(normalizeThreadsUsername("https://www.instagram.com/salon_event_okayama/")).toBe("salon_event_okayama");
    expect(normalizeThreadsUsername(null)).toBe("");
  });
  it("ユーザー名として使える形だけを確かめに使う（表示名を入れられても止めない）", () => {
    expect(isValidThreadsUsername("salon_event_okayama")).toBe(true);
    expect(isValidThreadsUsername("ri_me.okayama")).toBe(true);
    expect(isValidThreadsUsername("やまだはなこ")).toBe(false);
    expect(isValidThreadsUsername(".abc")).toBe(false);
    expect(judgeConnect({ expected: "山田花子｜交流サロン", got: "owner_private", existingUsernames: [] })).toEqual({ kind: "ok" });
  });
  it("違うアカウントが戻ってきたら mismatch（同じ表示名でも @ で見分ける）", () => {
    expect(judgeConnect({ expected: "@salon_event_okayama", got: "owner_private", intent: "first", existingUsernames: [] }))
      .toEqual({ kind: "mismatch", expected: "salon_event_okayama", got: "owner_private" });
    expect(judgeConnect({ expected: "Salon_Event_Okayama", got: "salon_event_okayama", intent: "first", existingUsernames: [] })).toEqual({ kind: "ok" });
  });
  it("追加のつもりで、もうつながっているアカウントが戻ってきたら same_as_existing", () => {
    expect(judgeConnect({ got: "owner_private", intent: "add", existingUsernames: ["owner_private"] })).toEqual({ kind: "same_as_existing", got: "owner_private" });
    expect(judgeConnect({ got: "owner_private", intent: "reconnect", existingUsernames: ["owner_private"] })).toEqual({ kind: "ok" });
    expect(judgeConnect({ got: "newone", intent: "add", existingUsernames: ["owner_private"] })).toEqual({ kind: "ok" });
  });
  it("端末を見分けて、その端末の手順を先に出す", () => {
    expect(connectDeviceOf("Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/129 Mobile")).toBe("android");
    expect(connectDeviceOf("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("iphone");
    expect(connectDeviceOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe("iphone");
    expect(connectDeviceOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe("pc");
    const a = retryGuide("android", "salon_event_okayama");
    expect(a[0]!.title).toMatch(/Android/);
    expect(a[0]!.steps.map((s) => s.text).join("\n")).toMatch(/対応リンクを開く/);
    expect(a[1]!.title).toMatch(/パソコン/);
    expect(retryGuide("pc", null)).toHaveLength(1);
    expect(retryGuide("iphone", "x")[0]!.steps.map((s) => s.text).join("\n")).toMatch(/@x でログイン/);
  });
  it("一覧に出ない＝まだ Threads を始めていない、を案内する", () => {
    const g = notListedGuide("salon_event_okayama");
    const all = g.steps.map((s) => s.text).join("\n");
    expect(all).toMatch(/別のプロフィールを使用/);
    expect(all).toMatch(/初めて/);
    expect(all).toMatch(/@ から始まるユーザー名/);
  });
  it("運営への知らせはお店の名前・両方の @・端末・選んだ結果", () => {
    const n = mismatchOwnerNote({ userId: 9999, storeName: "交流サロン", expected: "salon_event_okayama", got: "owner_private", kind: "mismatch", device: "android", decided: null });
    expect(n.title).toContain("9999");
    expect(n.content).toMatch(/@salon_event_okayama/);
    expect(n.content).toMatch(/@owner_private/);
    expect(n.content).toMatch(/Android/);
    expect(n.content).toMatch(/保存せず/);
  });
});

describe("違ったときは保存せずに預かる（15分・1回だけ取り出せる）", () => {
  it("預けて、取り出したら消える", () => {
    const now = Date.parse("2026-10-29T03:00:00Z");
    stashPendingConnect(1, { profile: { id: "p", username: "a" }, longLivedToken: { access_token: "t", expires_in: 1 }, kind: "mismatch", expected: "b", device: "pc" }, now);
    expect(peekPendingConnect(1, now)?.expected).toBe("b");
    expect(takePendingConnect(1, now)?.profile.username).toBe("a");
    expect(takePendingConnect(1, now)).toBeNull();
  });
  it("15分を過ぎたら使わない", () => {
    const now = Date.parse("2026-10-29T03:00:00Z");
    stashPendingConnect(2, { profile: {}, longLivedToken: { access_token: "t", expires_in: 1 }, kind: "same_as_existing", expected: null, device: "iphone" }, now);
    expect(takePendingConnect(2, now + PENDING_CONNECT_TTL_MS + 1)).toBeNull();
  });
});
