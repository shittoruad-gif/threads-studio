import { describe, it, expect } from "vitest";
import { buildPostCards, parsePostback, textWithQuick, settingsQuick, settingsSummary, helpQuick } from "./lineChat";

describe("LINEチャット完結UI", () => {
  it("投稿カードのボタンはすべてpostback（Webビューを開かない）", () => {
    const flex: any = buildPostCards([{ id: 7, postContent: "本文です", scheduledAt: "2026-09-02T06:00:00Z" }]);
    const json = JSON.stringify(flex);
    expect(json).not.toContain('"uri"');
    expect(json).toContain('a=ok&i=7');
    expect(json).toContain('a=rw&i=7');
    expect(json).toContain('a=skip&i=7');
  });

  it("本文は省略せずカードに載る（見に行かせない）", () => {
    const body = "あ".repeat(300);
    const json = JSON.stringify(buildPostCards([{ id: 1, postContent: body, scheduledAt: null }]));
    expect(json).toContain("あ".repeat(300));
  });

  it("複数件はカルーセルになる", () => {
    const flex: any = buildPostCards([
      { id: 1, postContent: "a", scheduledAt: null },
      { id: 2, postContent: "b", scheduledAt: null },
    ]);
    expect(flex.contents.type).toBe("carousel");
  });

  it("postbackデータを解析できる", () => {
    expect(parsePostback("a=rw2&i=12&k=short")).toEqual({ a: "rw2", i: "12", k: "short" });
  });

  it("クイックリプライは13件までに収まる", () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ label: `L${i}`, data: `d=${i}` }));
    const msg: any = textWithQuick("t", items);
    expect(msg.quickReply.items.length).toBe(13);
  });

  it("設定の選択肢は現在値の逆を提示する", () => {
    const on: any = settingsQuick({ autoPostEnabled: true, autoPostRequireApproval: false, postLength: "short" });
    expect(on[0].label).toContain("止める");
    expect(on[0].data).toBe("s=auto&v=off");
    const off: any = settingsQuick({ autoPostEnabled: false, autoPostRequireApproval: true, postLength: "short" });
    expect(off[0].data).toBe("s=auto&v=on");
  });

  it("設定の要約に現在値が出る", () => {
    const t = settingsSummary({ autoPostEnabled: true, autoPostRequireApproval: true, postLength: "long", autoPostFrequency: "three_daily" });
    expect(t).toContain("1日3回");
    expect(t).toContain("長め");
  });

  it("ヘルプの選択肢が並ぶ", () => {
    expect(helpQuick().length).toBeGreaterThanOrEqual(4);
  });
});
