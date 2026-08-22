import { describe, it, expect } from "vitest";
import { POST_ANGLES, getAngle } from "../shared/postAngles";

/**
 * 「悩み深掘り」型（2026-08-23 三上さん提供の型）の組み込み確認。
 *
 * 実測データ（114アカウント・12.9万投稿）では「問いかけ締め」は0.89倍の負け筋だが、
 * この型はリーチではなくコメント獲得を狙う会話型のため、
 * 会話型に限って許可されている締め方の例外に載せている。
 * 例外の対象から外れると「問いかけ締め禁止」に引っかかって型が壊れるので、
 * ここで結び付きを固定する。
 */
describe("悩み深掘り型", () => {
  const angle = getAngle("deep_worry");

  it("切り口として登録されている", () => {
    expect(angle).toBeTruthy();
    expect(angle!.label).toBe("悩み深掘り");
    expect(POST_ANGLES.some((a) => a.id === "deep_worry")).toBe(true);
  });

  it("4段階の順番が指示に含まれている", () => {
    const h = angle!.hint;
    for (const must of ["具体的に", "勘違い", "手に入れたい状態", "問いかけ"]) {
      expect(h).toContain(must);
    }
  });

  it("悩みの具体化を、症状名ではなく場面で指示している", () => {
    expect(angle!.hint).toContain("ファンデ");
    expect(angle!.hint).toContain("毛穴に悩む人");
  });

  it("予約を直接促さない", () => {
    expect(angle!.hint).toContain("予約は直接促さない");
  });

  it("会話型として扱われる（問いかけ締めの例外に入っている）", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("./autoPostScheduler.ts", import.meta.url), "utf8"),
    );
    const line = src.split("\n").find((l) => l.includes("CONVERSATION_POST_TYPES = new Set"))!;
    expect(line, "deep_worry を会話型から外すと問いかけ締めが禁止され型が壊れる").toContain("deep_worry");
  });
});
