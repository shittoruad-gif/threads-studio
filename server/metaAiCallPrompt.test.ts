import { describe, it, expect } from "vitest";
import { buildMetaAiCallMessages, buildThreadsIntentUrl } from "./metaAiCallPrompt";

describe("Meta AI呼びかけ文のLINEカード", () => {
  it("絵つきカード＋短い一言の2通で、手順は2つだけ", () => {
    const msgs: any[] = buildMetaAiCallMessages({ username: "yokunaru4976seitai", storeName: "よくなる整体院", text: "@meta.ai 滑川市上小泉周辺の人に、うちのお店を届けて" }) as any[];
    expect(msgs).toHaveLength(2);
    expect(msgs[0].type).toBe("flex");
    expect(msgs[0].contents.hero.url).toMatch(/^https:\/\//);
    const json = JSON.stringify(msgs[0]);
    expect(json).toContain("やることは2つだけ");
    expect(json).toContain("Threadsアプリで投稿する");
    expect(json).toContain(buildThreadsIntentUrl("@meta.ai 滑川市上小泉周辺の人に、うちのお店を届けて"));
    expect(msgs[1].text.length).toBeLessThan(400);
    expect(msgs[1].text).toContain("@yokunaru4976seitai（よくなる整体院）");
  });
  it("やり直しは、短い一言で理由と『消さなくて大丈夫』を添える", () => {
    const msgs: any[] = buildMetaAiCallMessages({ username: "a", storeName: null, text: "@meta.ai x", redo: true }) as any[];
    expect(msgs[1].text).toContain("消さなくて大丈夫");
  });
});
