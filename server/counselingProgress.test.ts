import { describe, it, expect, vi, beforeAll } from "vitest";
import { QUICK_QUESTION_IDS } from "../shared/counseling";

/**
 * 「まず5つ」の進み具合の数え方（2026-09-15 夜間整備の通し確認で見つけた）。
 *
 * 公式LINEでは先にホームページのURLを聞き、その画面だけ「【1／5】」と書いてあった。
 * ところが次の質問から `questionsFor(..., quick)` が返す4問で数え直すため「【1／4】」に戻り、
 * お客様からは **数が減って見えていた**（1／5 → 1／4 → 2／4 → 3／4 → 4／4）。
 * URLを1問目として数え、2／5 から 5／5 で終わるのが正しい。
 */

// LINEへ実際に送らないよう、送信まわりは止めてから読み込む
vi.mock("../server/lineNotify", () => ({ pushLine: vi.fn(), replyLine: vi.fn() }));

let handler: any;
beforeAll(async () => {
  process.env.QA_SAFE_MODE = "1";
  handler = await import("./lineChatHandler");
});

/** askQuestion は外に出していないので、同じ式をここに置いて意図を固定する */
const progress = (quick: boolean, step: number, questionCount: number) => {
  const urlStep = quick ? 1 : 0;
  return { current: step + 1 + urlStep, total: questionCount + urlStep };
};

describe("はじめの設定の進み具合", () => {
  it("まず5つ：URLが1問目、質問4つが2〜5問目（数が戻らない）", () => {
    const n = QUICK_QUESTION_IDS.length; // 4
    expect(n).toBe(4);
    const seen = [0, 1, 2, 3].map((s) => progress(true, s, n));
    expect(seen.map((x) => `${x.current}／${x.total}`)).toEqual(["2／5", "3／5", "4／5", "5／5"]);
    // URLの画面で見せている「【1／5】」と地続きになっている
    expect(seen[0].total).toBe(5);
    expect(seen[0].current).toBeGreaterThan(1);
  });

  it("やり直し（全20問）は今までどおり 1／20 から", () => {
    expect(progress(false, 0, 20)).toEqual({ current: 1, total: 20 });
    expect(progress(false, 19, 20)).toEqual({ current: 20, total: 20 });
  });

  it("URLの画面の文言そのものが「1／5」であること（コード側とずれたら気づけるように）", () => {
    const src = require("fs").readFileSync(__dirname + "/lineChatHandler.ts", "utf8");
    expect(src).toContain("【1／5】");
    // 進み具合は current／total で出す（st.step + 1 の直書きに戻っていないこと）
    expect(src).toContain("${current}／${total}");
  });

  it("handlePostback / handleFreeText が読み込めている", () => {
    expect(typeof handler.handlePostback).toBe("function");
    expect(typeof handler.handleFreeText).toBe("function");
  });
});

describe("自動応答の知識が、はじめの設定の実物と合っている（2026-09-15）", () => {
  // アプリの画面（/ai-counseling）は 2026-09-10 から公式LINEと同じ4問に揃っているのに、
  // 知識だけ「アプリから登録する場合は従来どおり全20問です」のままだった。
  // お客様に「20問あります」とご案内してしまうと、実物より重く見えて手が止まる。
  it("アプリの画面が20問だとは書かない", async () => {
    const { productKnowledge } = await import("../shared/productKnowledge");
    const k = productKnowledge();
    expect(k).not.toMatch(/アプリの画面（\/ai-counseling）から登録する場合は、従来どおり全20問/);
    expect(k).toContain("アプリの画面（/ai-counseling）から登録する場合も同じ4問");
  });

  it("公式LINEの進み具合（1／5〜5／5）が書いてある", async () => {
    const { productKnowledge } = await import("../shared/productKnowledge");
    expect(productKnowledge()).toContain("「1／5」から「5／5」");
  });

  it("やり直しのときだけ全20問、と分かる", async () => {
    const { productKnowledge } = await import("../shared/productKnowledge");
    expect(productKnowledge()).toMatch(/やり直すときだけ、全20問/);
  });
});
