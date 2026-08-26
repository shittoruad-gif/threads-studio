import { describe, it, expect } from "vitest";
import fs from "node:fs";

/**
 * trimToBudget は autoPostScheduler 内部の関数なので、挙動仕様を
 * ソースの構造検査＋切り出した同等実装で固定する。
 * （cron副作用のある本体を import しないため）
 */
function trimToBudget(mainPost: string, cta: string | null, budget: number): string {
  const parts = mainPost.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  const ctaPart = (cta || '').trim();
  const len = (s: string) => Array.from(s).length;
  const assemble = (blocks: string[], withCta: boolean) =>
    [...blocks, ...(withCta && ctaPart ? [ctaPart] : [])].join('\n\n');
  let blocks = parts;
  while (blocks.length > 1 && len(assemble(blocks, true)) > budget) blocks = blocks.slice(0, -1);
  if (ctaPart && blocks.length === 1 && parts.length > 1) {
    let bodyOnly = parts;
    while (bodyOnly.length > 1 && len(assemble(bodyOnly, false)) > budget) bodyOnly = bodyOnly.slice(0, -1);
    if (bodyOnly.length > 1) return assemble(bodyOnly, false);
  }
  return assemble(blocks, true);
}

const HOOK = "金光町で肩が辛い人、9割が知らないこと。";
const BODY1 = "肩こりの原因は、揉み方ではなく座り方にあります。骨盤が後ろに倒れると、首が前に出て肩に載ります。";
const BODY2 = "当院では、揉むだけでなく座り方から一緒に見直します。";
const CTA = "ご相談・ご予約は、プロフィールのリンクから公式LINEへどうぞ😊\n無理な勧誘はありません。";

describe("trimToBudget：本文の保護", () => {
  it("フックだけ残してCTAを付ける事故を起こさない（投稿725の再発防止）", () => {
    const out = trimToBudget([HOOK, BODY1, BODY2].join("\n\n"), CTA, 140);
    // 「9割が知らないこと。」で終わってCTAだけ、にはならない
    expect(out).not.toBe([HOOK, CTA].join("\n\n"));
    // 中身（本文段落）が最低1つは残る
    expect(out).toContain("座り方");
  });

  it("予算に収まるならCTA付きでそのまま出す", () => {
    const out = trimToBudget([HOOK, "短い本文です。"].join("\n\n"), CTA, 300);
    expect(out).toContain(CTA);
    expect(out).toContain("短い本文です。");
  });

  it("元から1段落の投稿はそのまま（保護の対象外）", () => {
    const out = trimToBudget(HOOK, CTA, 140);
    expect(out).toBe([HOOK, CTA].join("\n\n"));
  });

  it("CTAなしの場合は従来どおり後ろの段落から削る", () => {
    const out = trimToBudget([HOOK, BODY1, BODY2].join("\n\n"), null, 80);
    expect(out).toContain(HOOK);
    expect(out).not.toContain(BODY2);
  });

  it("本体ソースにも本文保護のコードが存在する", () => {
    const src = fs.readFileSync(new URL("./autoPostScheduler.ts", import.meta.url), "utf8");
    expect(src).toContain("本文の保護");
    expect(src).toContain("bodyOnly");
  });
});
