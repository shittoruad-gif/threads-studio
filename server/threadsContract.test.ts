/**
 * 管理画面「契約」は Threads の契約だけ（2026-09-25 三上様「66万・16,500円・11,000円は絶対に違う」）。
 * 本番の UnivaPay 一覧（9/25 未明）の実物で固定する。
 */
import { describe, it, expect } from "vitest";
import { isThreadsContract } from "@shared/threadsContract";

describe("Threads の契約だけを出す", () => {
  it("別事業の契約は、アプリのお客様のものでも出さない", () => {
    expect(isThreadsContract({ id: "a", amount: 660000, linkDescription: "", isAppUser: true, appSubscriptionId: "x" })).toBe(false);
    expect(isThreadsContract({ id: "b", amount: 16500, linkDescription: "交通事故対応ルーム(管理シート)※翌月課金スタート", isAppUser: true, appSubscriptionId: "x" })).toBe(false);
    expect(isThreadsContract({ id: "c", amount: 11000, linkDescription: "Instagram広告運用代行(11,000円)_初回当", isAppUser: true, appSubscriptionId: "x" })).toBe(false);
  });
  it("【Threads】のリンク・アプリの契約番号と一致・セミナー価格のリンクは出す", () => {
    expect(isThreadsContract({ id: "d", amount: 6980, linkDescription: "【Threads】プロ キャンペーン：6,980円/月", isAppUser: false })).toBe(true);
    expect(isThreadsContract({ id: "e", amount: 8800, linkDescription: "※プロプラン　8,800円→9,800円", isAppUser: true, appSubscriptionId: "e" })).toBe(true);
    // 二重に作られた未確定の契約（契約番号は別）も、Threads の金額なので出す（二重契約の警告に要る）
    expect(isThreadsContract({ id: "f", amount: 8800, linkDescription: "※プロプラン　8,800円→9,800円", isAppUser: true, appSubscriptionId: "e" })).toBe(true);
    expect(isThreadsContract({ id: "g", amount: 4480, linkDescription: "※ライトプラン　4,480円→4,980円", isAppUser: true, appSubscriptionId: "g" })).toBe(true);
  });
  it("アプリのお客様でない・【Threads】でもない・金額も違う契約は出さない", () => {
    expect(isThreadsContract({ id: "h", amount: 8800, linkDescription: "", isAppUser: false })).toBe(false);
  });
});
