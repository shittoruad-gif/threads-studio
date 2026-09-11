import { describe, it, expect } from "vitest";
import { renderAgencyWeekly } from "./agencyReportJob";

describe("代理店向け週次まとめ（2026-09-11）", () => {
  const base = { id: 1, name: null, storeName: null, email: "a@example.com", autoPostEnabled: true, threadsAccounts: 1, lineLinks: 1, posted7: 20, awaiting: 0, stoppedAccounts: 0, rampNote: "" };
  it("店名・公開数・状態が1行ずつ並び、問題が無ければそう書く", () => {
    const t = renderAgencyWeekly([{ ...base, storeName: "テスト整体院" }], "9月15日");
    expect(t).toContain("テスト整体院：この7日 公開20件／稼働中");
    expect(t).toContain("気になる点はありません");
  });
  it("未連携・停止・承認待ちを見分けて、お声がけ先の件数を出す", () => {
    const t = renderAgencyWeekly([
      { ...base, id: 2, storeName: "A", threadsAccounts: 0 },
      { ...base, id: 3, storeName: "B", stoppedAccounts: 1, posted7: 0 },
      { ...base, id: 4, storeName: "C", lineLinks: 0, awaiting: 3 },
      { ...base, id: 5, storeName: "D", rampNote: "慣らし運転中（1日1件）", posted7: 5 },
    ], "9月15日");
    expect(t).toContain("A：この7日 公開20件／Threads未連携");
    expect(t).toContain("B：この7日 公開0件／★自動投稿が止まっています");
    expect(t).toContain("C：この7日 公開20件／稼働中／LINE未連携・承認待ち3件");
    expect(t).toContain("D：この7日 公開5件／慣らし運転中（1日1件）");
    expect(t).toContain("お声がけをおすすめする先：3件");
  });
});
