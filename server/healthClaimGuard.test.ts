import { describe, it, expect } from "vitest";
import { checkHealthClaims, isHealthBusiness } from "../shared/healthClaimGuard";
import { rampCap } from "../shared/accountRamp";

describe("健康系の断定ガード", () => {
  it("杖なしで歩ける・痛みなく・ぐっすり・初回1980円を検出して和らげる", () => {
    const v = checkHealthClaims("初回お試し1980円。長年の腰の悩み、僕が向き合います。\n\n杖なしでスタスタ歩ける方もいます。\n10年の経験と5万人以上の実績でサポート。\n\n朝、痛みなくスッと起き上がれる毎日を目指しましょう😊");
    expect(v.ok).toBe(false);
    expect(v.hits).toEqual(expect.arrayContaining(["歩行回復の体験談", "痛みの消失", "価格訴求"]));
    expect(v.text).not.toContain("1980円");
    expect(v.text).not.toContain("杖なし");
    expect(v.text).toContain("5万人以上の実績");
  });
  it("問題ない文はそのまま", () => {
    const v = checkHealthClaims("腰が辛い時、つい揉んでしまう。\n僕も昔は、揉めば良いと思っていました。\n\nでも実は、身体の使い方が大切なんです。");
    expect(v.ok).toBe(true);
    expect(v.text).toBe("腰が辛い時、つい揉んでしまう。\n僕も昔は、揉めば良いと思っていました。\n\nでも実は、身体の使い方が大切なんです。");
  });
  it("業種判定", () => {
    expect(isHealthBusiness("トレーニングを取り入れた整体院")).toBe(true);
    expect(isHealthBusiness("呉服小売店")).toBe(false);
  });
});
describe("新しいアカウントの慣らし", () => {
  it("7日未満は1件、14日未満は2件、以降は契約どおり", () => {
    const now = Date.parse("2026-09-06T00:00:00Z");
    expect(rampCap(3, "2026-09-02T00:00:00Z", now).count).toBe(1);
    expect(rampCap(3, "2026-08-25T00:00:00Z", now).count).toBe(2);
    expect(rampCap(3, "2026-08-01T00:00:00Z", now).count).toBe(3);
    expect(rampCap(1, "2026-08-25T00:00:00Z", now).capped).toBe(false);
  });
});
