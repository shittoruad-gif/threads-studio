import { describe, it, expect } from "vitest";
import { generateThreadsPrompt } from "../shared/threadsPrompts";

/**
 * 健康表現は「最初から書かせない」（2026-09-15 三上様指示 → 2026-09-16 夜間整備で反映）。
 *
 * > 健康表現ガードで引っかかるものに関しては、最初から記載しないようにしてください。
 * > クライアントが設定のところに入れていても同じです。
 *
 * これまでは本文ができたあとに落とす後追いだったため、はじめの設定の「強み・実績」に
 * 結果表現を書かれている方は、毎回そこから同じ言い回しが出てきて作り直しになり、
 * 3回で諦めた枠がそのまま消えていた（9/14 userId=2907 が24時間で6回・うち5回が同じ型）。
 *
 * ここで使っている文字列は、すべて本番の projects に実際に入っているもの。
 */
describe("健康系のお店には、結果表現を渡さない", () => {
  const base = {
    businessType: "整体院",
    area: "広島県廿日市市",
    target: "30〜60代の女性",
    mainProblem: "肩こり・腰の張り",
    postType: "hook_tree",
    treeCount: 0,
  } as any;

  it("強みの「根本改善にこだわる」はプロンプトに入らない（userId=5002）", () => {
    const p = generateThreadsPrompt({
      ...base,
      strength: "根本改善にこだわる\n完全予約制でゆったり\n国家資格者による施術",
    });
    expect(p).not.toContain("根本改善");
    expect(p).toContain("完全予約制でゆったり");
    expect(p).toContain("国家資格者による施術");
  });

  it("N1顧客像の体験談も渡さない（userId=5002「不妊の悩み/妊娠出産した」）", () => {
    const p = generateThreadsPrompt({ ...base, strength: "完全予約制", n1Customer: "代女性/不妊の悩み/妊娠出産した" });
    expect(p).not.toContain("妊娠出産");
    expect(p).not.toContain("不妊");
  });

  it("お客さんの生の言葉に結果が入っていたら、その行だけ落とす（そのまま本文に使えと指示している材料なので）", () => {
    const p = generateThreadsPrompt({
      ...base,
      strength: "完全予約制",
      // userId=3200 の実際の登録は「/」区切りの1行。結果の声が混ざっている行は行ごと落ちる
      customerWords: "朝起きた瞬間からずっと腰が痛い/首回りがバキバキ\n施術で腰の痛みが消えました",
    });
    expect(p).toContain("首回りがバキバキ");
    expect(p).not.toContain("痛みが消えました");
  });

  it("カウンセリングの実績・エピソードも洗ってから渡す", () => {
    const p = generateThreadsPrompt({
      ...base,
      strength: "完全予約制",
      counseling: {
        realProofs: ["Google口コミ★4.9", "3ヶ月で腰痛が改善しました"],
        realEpisodes: ["常連さんと畑の話で盛り上がった"],
      },
    });
    expect(p).toContain("Google口コミ★4.9");
    expect(p).toContain("常連さんと畑の話");
    expect(p).not.toContain("腰痛が改善");
  });

  it("健康系でないお店の設定は、これまでどおり手を付けない（呉服店・userId=5443）", () => {
    const p = generateThreadsPrompt({
      businessType: "呉服小売店",
      area: "岡山県倉敷市",
      target: "日本文化を大切にされている方",
      mainProblem: "敷居が高いと思われている",
      strength: "本物の正絹の着物を扱っている。\n根本改善にこだわる姿勢で仕立て直します。",
      postType: "hook_tree",
      treeCount: 0,
    } as any);
    expect(p).toContain("根本改善");
  });

  it("落とした型は呼び出し側に知らせる（ログに残して、材料の足りない方に気づけるようにする）", () => {
    const hits: string[] = [];
    generateThreadsPrompt({ ...base, strength: "根本改善にこだわる", onProfileScrub: (h) => hits.push(...h) });
    expect(hits).toContain("治る・改善の断定");
  });

  it("結果表現が無ければ呼ばれない", () => {
    let called = false;
    generateThreadsPrompt({ ...base, strength: "完全予約制でゆったり", onProfileScrub: () => { called = true; } });
    expect(called).toBe(false);
  });
});
