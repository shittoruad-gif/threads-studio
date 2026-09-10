import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { productKnowledge } from "../shared/productKnowledge";

const handler = readFileSync(new URL("./lineChatHandler.ts", import.meta.url), "utf8");

/**
 * 2026-09-10 夜間整備で見つけた「ご案内した言葉に受け取り口が無い」問題。
 * こちらから「〜と送ってください」とご案内している言葉は、必ず受け取り口を持つ。
 */
describe("ご案内している合言葉には受け取り口がある", () => {
  it("「Zoom希望」を受け取る分岐がある（無いと受け皿の一般案内で終わる）", () => {
    expect(handler).toMatch(/\/\(zoom\|ズーム\|ずーむ\)\/i\.test\(t\)/);
  });

  it("Zoomのご希望は担当者へお伝えする経路に乗る（朝の報告で日程調整として拾える）", () => {
    const block = handler.slice(handler.indexOf("(zoom|ズーム|ずーむ)"), handler.indexOf("(zoom|ズーム|ずーむ)") + 900);
    expect(block).toContain("forwardToStaff");
    expect(block).toContain("【Zoom希望】");
  });

  it("商品知識にも同じ合言葉が載っている（自動応答とチャットで案内がずれない）", () => {
    expect(productKnowledge()).toContain("Zoom希望");
  });
});

/**
 * はじめの設定は 2026-09-10 から「まず5問」。入口の案内が「10〜15分・全20問」の
 * ままだと、始める前に諦める方が出る（6〜7日間なにも進んでいない方が3名）。
 */
describe("はじめの設定の入口の案内が、実際に通る道と一致する", () => {
  it("入口の案内文に「全20問」と書かれていない", () => {
    expect(handler).toContain("はじめの設定を始めます。最初は5つだけです（URL1つと質問4つ・2分ほど）。");
    expect(handler).not.toContain("はじめの設定を始めます（10〜15分・全20問）");
  });

  it("お店の情報が未登録の方への案内も「まず5つ」になっている", () => {
    expect(handler).toContain("まだお店の情報が登録されていません。\\nこのトークで質問にお答えいただくだけで登録できます。最初は5つだけです（URL1つと質問4つ・2分ほど）。");
  });

  it("前回の登録内容がある方（やり直し）には、全部入力し直さなくてよいと伝える", () => {
    expect(handler).toContain("前回の答えが入った状態でお出しするので、合っていれば「これでOK」を押すだけで進みます。");
  });
});

/**
 * お問い合わせはLINEで受ける。お電話では受けない（2026-09-09 三上様指示）。
 */
describe("お問い合わせの導線", () => {
  it("商品知識が「お電話では受けていない」と明記している", () => {
    expect(productKnowledge()).toMatch(/お電話では受けていない|お電話では受け付けて/);
  });

  it("まずスクリーンショットをお願いする", () => {
    expect(productKnowledge()).toContain("スクリーンショット");
  });
});

/**
 * 2026-09-10 三上様「5問のみに直したのに、まだ『20問』という案内が全部出てしまう」。
 * 公式LINEの経路は「まず5問」。アプリの画面（/ai-counseling）は今も全20問。
 * LINEの話をしている案内文が「20問」と言っていないことを固定する。
 */
describe("「はじめの設定」の案内が経路ごとに正しい", () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

  it("毎朝の「次にやること」（LINEのボタン）が20問と言わない", () => {
    const s = read("./nextAction.ts");
    expect(s).not.toContain("10〜15分・全20問");
    expect(s).toContain("最初は5つだけです（URL1つと質問4つ・2分ほど）");
  });

  it("ご登録直後のご案内メールが20問と言わない", () => {
    const s = read("./onboardingEmailJob.ts");
    expect(s).not.toContain("全20問");
    expect(s).toContain("公式LINEなら最初は5つだけです");
  });

  it("自動応答の知識が、LINEは5問・アプリの画面は20問と書き分けている", () => {
    const k = productKnowledge();
    expect(k).toContain("公式LINEなら最初は5つだけ");
    expect(k).toContain("/ai-counseling");
    expect(k).not.toContain("「はじめの設定」（20問）に答える");
  });

  it("LINEの入口（トーク内）が20問と言わない", () => {
    expect(handler).not.toContain("はじめの設定を始めます（10〜15分・全20問）");
    expect(handler).not.toContain("登録できます（10〜15分・全20問）");
  });
});
