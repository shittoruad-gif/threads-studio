import { describe, it, expect } from "vitest";
import { buildPostCards, parsePostback, textWithQuick, textWithChoices, settingsQuick, settingsSummary, helpQuick } from "./lineChat";

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

describe("複数アカウント運用での取り違え防止", () => {
  it("カードにアカウント名が入る", () => {
    const json = JSON.stringify(buildPostCards([
      { id: 1, postContent: "a", scheduledAt: null, accountName: "salon_a" },
    ]));
    expect(json).toContain("@salon_a");
  });

  it("1件ずつモードではボタンに o=1 が付く（処理後に次の1件を出すため）", () => {
    const json = JSON.stringify(buildPostCards([{ id: 5, postContent: "a", scheduledAt: null }], { one: true }));
    expect(json).toContain("a=ok&i=5&o=1");
    expect(json).toContain("a=rw&i=5&o=1");
    expect(json).toContain("a=skip&i=5&o=1");
  });

  it("まとめて表示のときは o=1 が付かない", () => {
    const json = JSON.stringify(buildPostCards([{ id: 5, postContent: "a", scheduledAt: null }]));
    expect(json).not.toContain("o=1");
  });
});

describe("カウンセリングの選択肢", () => {
  it("タップでその文字が送られる（手入力と同じ扱いにする）", () => {
    const msg: any = textWithChoices("業種は？", ["整体院", "美容サロン", "スキップ"]);
    expect(msg.quickReply.items[0].action.type).toBe("message");
    expect(msg.quickReply.items[0].action.text).toBe("整体院");
  });
});

describe("公式LINEから来た方の連携導線", () => {
  it("あいさつは連携を促す文面になっている（アプリの設定画面を探させない）", async () => {
    const { LINE_TEXTS } = await import("./lineNotify");
    expect(LINE_TEXTS.greeting).toContain("連携する");
    expect(LINE_TEXTS.greeting).not.toContain("設定画面で表示される6桁");
  });

  it("連携用のクイックリプライが作れる", () => {
    const msg: any = textWithQuick("まだつながっていません", [
      { label: "連携する", data: "m=link" },
      { label: "アカウントを持っていない", data: "m=signup" },
    ]);
    expect(msg.quickReply.items[0].action.data).toBe("m=link");
    expect(msg.quickReply.items[1].action.data).toBe("m=signup");
  });
});
