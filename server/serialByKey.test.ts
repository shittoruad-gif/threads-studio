import { describe, it, expect } from "vitest";
import { serialByKey, _serialPendingKeys } from "../shared/serialByKey";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("同じキーの処理を順に動かす", () => {
  it("同じキーは重ならず、押した順に動く", async () => {
    const log: string[] = [];
    const job = (name: string, ms: number) => serialByKey("a", async () => { log.push(`${name}:start`); await sleep(ms); log.push(`${name}:end`); return name; });
    const r = await Promise.all([job("1", 30), job("2", 5), job("3", 1)]);
    expect(r).toEqual(["1", "2", "3"]);
    expect(log).toEqual(["1:start", "1:end", "2:start", "2:end", "3:start", "3:end"]);
  });
  it("別のキーは待たない", async () => {
    const log: string[] = [];
    await Promise.all([
      serialByKey("x", async () => { await sleep(30); log.push("x"); }),
      serialByKey("y", async () => { log.push("y"); }),
    ]);
    expect(log).toEqual(["y", "x"]);
  });
  it("前が失敗しても次は動き、終われば覚えを残さない", async () => {
    const p1 = serialByKey("e", async () => { throw new Error("boom"); });
    const p2 = serialByKey("e", async () => "ok");
    await expect(p1).rejects.toThrow("boom");
    await expect(p2).resolves.toBe("ok");
    await sleep(5);
    expect(_serialPendingKeys()).toBe(0);
  });
});

describe("代わりの投稿にも保証の書き直し（2026-11-19）", () => {
  it("3回で諦めず、未使用の材料を渡す保証と、登録内容だけで書く最後の1本がある", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("./autoPostScheduler.ts", import.meta.url), "utf8");
    const body = src.slice(src.indexOf("async function generateReplacementPostNow"), src.indexOf("export { generateAutoPost as _generateAutoPostForOps }"));
    expect(body).toContain("unusedMaterials");
    expect(body).toContain("REPLACEMENT_SAFE_LAST_HINT");
    expect(body).toMatch(/generateAutoPost\([^)]*true, true, \{ avoidAngleIds \}\)/);
  });
  it("保証の指示は、見送った下書きと未使用の材料の両方を含む", async () => {
    const { replacementGuaranteeHint } = await import("./autoPostScheduler");
    const h = replacementGuaranteeHint("お客様が見送った下書き：「秋の味覚」", ["創業130年", "着物のお手入れ"]);
    expect(h).toContain("秋の味覚");
    expect(h).toContain("創業130年");
    expect(replacementGuaranteeHint("x", [])).toContain("これまでと違う入り方");
  });
});
