import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyThreadsSignature, extractReplyEvents } from "./threadsWebhook";
describe("Threads Webhook", () => {
  it("署名を検証する", () => {
    const body = JSON.stringify({ a: 1 }); const sig = "sha256=" + createHmac("sha256", "secret").update(body).digest("hex");
    expect(verifyThreadsSignature(body, sig, "secret")).toBe(true);
    expect(verifyThreadsSignature(body, "sha256=00", "secret")).toBe(false);
  });
  it("values形式とentry形式の両方から返信イベントを取り出す", () => {
    const a = extractReplyEvents({ target_id: "111", values: { field: "replies", value: { id: "9", username: "guest", text: "料金は？", shortcode: "abc", root_post: { id: "5", owner_id: "111" } } } });
    expect(a).toHaveLength(1); expect(a[0].rootOwnerId).toBe("111"); expect(a[0].shortcode).toBe("abc");
    const b = extractReplyEvents({ entry: [{ id: "222", changes: [{ field: "replies", value: { id: "10", text: "いいね" } }, { field: "publish", value: { id: "11" } }] }] });
    expect(b).toHaveLength(1); expect(b[0].rootOwnerId).toBe("222");
  });
});
