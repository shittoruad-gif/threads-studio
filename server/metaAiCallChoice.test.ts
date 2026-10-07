import { describe, it, expect } from "vitest";
import { chooseMetaAiCall, detectCallKind, buildMetaAiCallPostOfKind, META_AI_CALL_ALL_KINDS, META_AI_CALL_VARIANTS, type MetaAiCallHistoryItem } from "../shared/metaAiAsk";
import { isLightDay, LIGHT_EVERY_DAYS, buildMetaAiCallBundle } from "./metaAiCallPrompt";

// 2026-10-07 三上様「Meta AIに関しても、もっと様々な内容をあげるようにし、リーチを広げる最大限のできることを」
const src = { storeName: "テスト整体院", businessType: "整体院", area: "広島県廿日市市天神", target: "デスクワークの30〜50代", mainProblem: "慢性的な肩こり" };
const oct = new Date("2026-10-07T10:00:00+09:00");
const daysAgo = (n: number) => new Date(oct.getTime() - n * 86400_000);

describe("呼びかけ文の種類と言い回し", () => {
  it("18種類・言い回し違いを含めて、材料が揃えば20通り以上作れる。どれも @meta.ai で始まり、効果を言い切らない", () => {
    const all: string[] = [];
    for (const k of META_AI_CALL_ALL_KINDS) for (let v = 0; v < (META_AI_CALL_VARIANTS[k] ?? 1); v++) {
      const t = buildMetaAiCallPostOfKind(src, k, oct, v);
      if (t) all.push(t);
    }
    expect(META_AI_CALL_ALL_KINDS.length).toBe(18);
    expect(new Set(all).size).toBeGreaterThanOrEqual(20);
    for (const t of all) {
      expect(t.startsWith("@meta.ai ")).toBe(true);
      expect(/治る|治す|改善する|効果がある|必ず|痩せる/.test(t)).toBe(false);
      expect(/[\uD83C-\uD83E][\uDC00-\uDFFF]/.test(t)).toBe(false);
      expect(/届けて|おすすめを教えて|何が違う|強み/.test(t)).toBe(false);
    }
  });
  it("大人向けのお店には子ども・雨の日のお出かけを出さない。体の業種でなければ体の質問を出さない", () => {
    const snack = { businessType: "スナック", area: "倉敷市水島", storeName: "テスト" };
    expect(buildMetaAiCallPostOfKind(snack, "local_rainy", oct)).toBeNull();
    expect(buildMetaAiCallPostOfKind(snack, "local_family", oct, 1)).toBeNull();
    expect(buildMetaAiCallPostOfKind(snack, "body_sleep", oct)).toBeNull();
    expect(buildMetaAiCallPostOfKind(snack, "local_souvenir", oct)).toContain("倉敷市水島で手土産");
  });
  it("過去の文の種類が分かる（季節が違っても・地元の一言が付く前の昔の文でも）", () => {
    const aug = new Date("2026-08-10T10:00:00+09:00");
    expect(detectCallKind(buildMetaAiCallPostOfKind(src, "local_season", aug)!, src)).toBe("local_season");
    expect(detectCallKind(buildMetaAiCallPostOfKind(src, "choose", oct, 1)!, src)).toBe("choose");
    expect(detectCallKind("@meta.ai 廿日市市天神の名産品と言えば？", src)).toBe("local_specialty");
    expect(detectCallKind("@meta.ai うちのお店（テスト整体院）の強みを、来店されたことのない人に伝えて", src)).toBe("strength");
    expect(detectCallKind("ふつうの投稿", src)).toBeNull();
  });
});

describe("今日の呼びかけ文の選び方（chooseMetaAiCall）", () => {
  it("まったく同じ文は60日出さない（10/7 実測：同じ文を4回出したアカウントは中央値13回まで落ちていた）", () => {
    const choose = buildMetaAiCallPostOfKind(src, "choose", oct)!;
    const hist: MetaAiCallHistoryItem[] = [{ text: choose, views: 9999, at: daysAgo(30) }];
    for (let seed = 0; seed < 200; seed++) expect(chooseMetaAiCall(src, hist, seed, oct)!.text).not.toBe(choose);
  });
  it("直近4本で使った種類は出さない", () => {
    const hist: MetaAiCallHistoryItem[] = (["local_specialty", "about_store", "choose", "body_season"] as const)
      .map((k, i) => ({ text: buildMetaAiCallPostOfKind(src, k, oct)!, views: 100, at: daysAgo(i + 1) }));
    for (let seed = 0; seed < 200; seed++) {
      const c = chooseMetaAiCall(src, hist, seed, oct)!;
      expect(["local_specialty", "about_store", "choose", "body_season"]).not.toContain(c.kind);
    }
  });
  it("このアカウントでよく見られた種類が多めに出る（ただしそれだけにはならない）", () => {
    // 名産品が他の4倍見られたアカウント（直近4本には入れない＝除外されない古い記録）
    const hist: MetaAiCallHistoryItem[] = [
      ...[1, 2, 3, 4].map((d) => ({ text: buildMetaAiCallPostOfKind(src, "first_visit", oct, d % 2)!, views: 100, at: daysAgo(d) })),
      { text: "@meta.ai 廿日市市天神の名産品と言えば？", views: 800, at: daysAgo(40) },
      { text: "@meta.ai 廿日市市天神の名産品と言えば？\n地元の方のおすすめも、よかったら教えてください", views: 900, at: daysAgo(70) },
      { text: buildMetaAiCallPostOfKind(src, "body_stretch", oct)!, views: 20, at: daysAgo(50) },
      { text: buildMetaAiCallPostOfKind(src, "body_stretch", oct)!, views: 30, at: daysAgo(80) },
    ];
    const count: Record<string, number> = {};
    for (let seed = 0; seed < 2000; seed++) { const k = chooseMetaAiCall(src, hist, seed, oct)!.kind; count[k] = (count[k] ?? 0) + 1; }
    expect(count.local_specialty).toBeGreaterThan((count.body_stretch ?? 0) * 3);
    expect(Object.keys(count).length).toBeGreaterThanOrEqual(10);
  });
  it("地元の話題が多めに出る（実測でいちばん見られ、返信も付く）", () => {
    const count = { local: 0, other: 0 };
    for (let seed = 0; seed < 2000; seed++) {
      const k = chooseMetaAiCall(src, [], seed, oct)!.kind;
      if (k.startsWith("local_")) count.local++; else count.other++;
    }
    expect(count.local).toBeGreaterThan(count.other * 0.8);
  });
  it("「別の質問」は今日の質問と別の種類", () => {
    for (let seed = 0; seed < 100; seed++) {
      const c = chooseMetaAiCall(src, [], seed, oct)!;
      expect(c.alt).not.toBeNull();
      expect(c.alt!.kind).not.toBe(c.kind);
    }
  });
  it("同じお客様の別のアカウントで今日選んだ種類は出さない（10/7 試算で同じお店の2アカウントが同じ質問になっていた）", () => {
    for (let seed = 0; seed < 100; seed++) {
      const a = chooseMetaAiCall(src, [], seed, oct)!;
      const b = chooseMetaAiCall(src, [], seed, oct, new Set([a.kind, a.alt!.kind]))!;
      expect([a.kind, a.alt!.kind]).not.toContain(b.kind);
      expect([a.kind, a.alt!.kind]).not.toContain(b.alt!.kind);
    }
  });
  it("同じ日・同じアカウントなら同じ文（朝の送信をやり直しても変わらない）", () => {
    expect(chooseMetaAiCall(src, [], 12345, oct)).toEqual(chooseMetaAiCall(src, [], 12345, oct));
  });
  it("全部使い切っていたら、いちばん前に使った文から戻す（何も送れなくならない）", () => {
    const hist: MetaAiCallHistoryItem[] = [];
    let d = 1;
    for (const k of META_AI_CALL_ALL_KINDS) for (let v = 0; v < (META_AI_CALL_VARIANTS[k] ?? 1); v++) {
      const t = buildMetaAiCallPostOfKind(src, k, oct, v);
      if (t) hist.push({ text: t, views: 100, at: daysAgo(d++) });
    }
    const c = chooseMetaAiCall(src, hist, 1, oct)!;
    expect(c.text).toBe(hist[hist.length - 1].text);
  });
  it("材料がほとんど無いときは強みの型", () => {
    expect(chooseMetaAiCall({}, [], 0, oct)!.kind).toBe("strength");
  });
});

describe("使われていないアカウントは止めずに3日に1回", () => {
  it("3日に1回だけ送る日になる", () => {
    const days = [...Array(30)].map((_, i) => isLightDay(20000 + i, 24)).filter(Boolean).length;
    expect(LIGHT_EVERY_DAYS).toBe(3);
    expect(days).toBe(10);
  });
});

describe("カードに「別の質問で投稿する」", () => {
  it("2つ目のボタンと、どちらか1つだけ投稿する案内が付く", () => {
    const msgs: any[] = buildMetaAiCallBundle([{ username: "test", storeName: "テスト", text: "@meta.ai A？", alt: "@meta.ai B？" }]);
    const json = JSON.stringify(msgs[0]);
    expect(json).toContain("別の質問で投稿する");
    expect(json).toContain(encodeURIComponent("@meta.ai B？"));
    expect(msgs[1].text).toContain("どちらか1つだけ投稿してください");
  });
  it("別の質問が無ければ今までどおりボタン1つ", () => {
    const msgs: any[] = buildMetaAiCallBundle([{ username: "test", storeName: "テスト", text: "@meta.ai A？" }]);
    expect(JSON.stringify(msgs[0])).not.toContain("別の質問");
    expect(msgs[1].text).not.toContain("どちらか1つ");
  });
});
