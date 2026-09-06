import { describe, it, expect } from "vitest";
import { buildPostCards, parsePostback, textWithQuick, textWithChoices, settingsQuick, settingsSummary, helpQuick, shouldClearPendingInput } from "./lineChat";

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

describe("公式LINEから来た方の導線", () => {
  it("あいさつは会員登録を起点にしている（アカウントを持っている前提にしない）", async () => {
    const { LINE_TEXTS } = await import("./lineNotify");
    // 2026-09-02: はじめての方が最初に押すのは「連携する」ではなく「会員登録する」。
    expect(LINE_TEXTS.greeting).toContain("会員登録する");
    expect(LINE_TEXTS.greeting).toContain("登録済みの方はこちら");
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

describe("入力のやり直し", () => {
  it("必須でない質問には「スキップ」、2問目以降には「戻る」が出せる", () => {
    const msg: any = textWithChoices("質問です", ["選択肢A", "スキップ", "戻る"]);
    const labels = msg.quickReply.items.map((i: any) => i.action.label);
    expect(labels).toContain("スキップ");
    expect(labels).toContain("戻る");
  });

  it("確認画面のボタンは「登録する」と「直す」の2つ", () => {
    const msg: any = textWithQuick("ご確認ください", [
      { label: "この内容で登録する", data: "c=save" },
      { label: "直す", data: "c=edit" },
    ]);
    expect(msg.quickReply.items.map((i: any) => i.action.data)).toEqual(["c=save", "c=edit"]);
  });

  it("押し間違い用の取り消しボタンを作れる", () => {
    const msg: any = textWithQuick("承認しました", [{ label: "取り消す", data: "a=undo&i=12" }]);
    expect(msg.quickReply.items[0].action.data).toBe("a=undo&i=12");
  });
});

describe("文章の入力待ちの途中で別のボタンを押されたとき", () => {
  const on = (state: string, data: string) => shouldClearPendingInput(state, parsePostback(data));

  it("メニューへ移られたら、待ち状態をやめる（打った文章が登録されないように）", () => {
    // ★NGワード待ちのまま残ると、次に届いたご質問が「使わない言葉」になる
    expect(on("ngword", "m=menu")).toBe(true);
    expect(on("ngword", "m=posts")).toBe(true);
    expect(on("set_line_url", "m=posts")).toBe(true);
    expect(on("self_edit", "m=settings")).toBe(true);
    expect(on("rewrite_free", "m=menu")).toBe(true);
    expect(on("staff_message", "m=posts")).toBe(true);
  });

  it("同じ待ち状態を作り直すボタンでは、やめない", () => {
    expect(on("ngword", "s=ng")).toBe(false);
    expect(on("set_line_url", "c=seturl&p=12")).toBe(false);
    expect(on("self_edit", "a=selfedit&i=7")).toBe(false);
    expect(on("rewrite_free", "a=rw&i=7")).toBe(false);
    expect(on("staff_message", "m=staff&q=3")).toBe(false);
  });

  it("はじめの設定と連携の途中は、ボタン操作も流れの一部なので消さない", () => {
    expect(on("counseling", "m=menu")).toBe(false);
    expect(on("counseling", "c=save")).toBe(false);
    expect(on("counseling", "c=resume")).toBe(false);
    expect(on("link_email", "m=signup")).toBe(false);
    expect(on("signup_code", "m=refcode")).toBe(false);
  });

  it("待ち状態が無いときは、何もしない", () => {
    expect(on("", "m=menu")).toBe(false);
    expect(shouldClearPendingInput(null, parsePostback("m=menu"))).toBe(false);
    expect(shouldClearPendingInput(undefined, parsePostback("m=menu"))).toBe(false);
  });
});

describe("Meta AI呼びかけ投稿のカード", () => {
  it("正体を示し、AIの「書き直す」ボタンを出さない", () => {
    const json = JSON.stringify(buildPostCards([{ id: 9, postContent: "@meta.ai 新倉敷・玉島周辺の人に、うちのお店（例）を届けて", scheduledAt: null, angle: "meta_ai_call" }]));
    expect(json).toContain("Meta AI呼びかけ投稿");
    expect(json).toContain("このまま公開するのがおすすめ");
    expect(json).not.toContain("a=rw&i=9");
    expect(json).toContain("a=ok&i=9");
    expect(json).toContain("a=selfedit&i=9");
  });
  it("通常投稿には出さない", () => {
    const json = JSON.stringify(buildPostCards([{ id: 10, postContent: "本文", scheduledAt: null, angle: "qa" }]));
    expect(json).not.toContain("Meta AI呼びかけ投稿");
    expect(json).toContain("a=rw&i=10");
  });
});
