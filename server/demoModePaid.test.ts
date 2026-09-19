import { describe, it, expect } from "vitest";

/**
 * 有料のお客様が「お試し（デモ）」として朝の案内から外れていた件（2026-09-19）。
 *
 * 斎藤様（user 10043・pro_campaign・9/16 課金済み）は isDemoMode=1 のままで、
 * morningDigestJob が黙って飛ばしていた。「次にやること（Threadsを連携してください）」が
 * 3日間1通も届かず、Threads未連携・投稿0のまま止まっていた。
 * isDemoMode はデモの生成枠（10件）を使い切ったときにしか下りない作りだったのが原因。
 */
function isDemoForDigest(user: { isDemoMode: boolean }, sub: { planId: string; status: string } | null): boolean {
  if (!user.isDemoMode) return false;
  const paid = !!sub && (sub.status === "active" || sub.status === "trialing") && sub.planId !== "free";
  return !paid;
}

describe("有料の方を「お試し」として案内から外さない", () => {
  it("斎藤様（pro_campaign・active）は isDemoMode=1 でも案内の対象", () => {
    expect(isDemoForDigest({ isDemoMode: true }, { planId: "pro_campaign", status: "active" })).toBe(false);
  });
  it("大木様（pro・trialing）も案内の対象", () => {
    expect(isDemoForDigest({ isDemoMode: true }, { planId: "pro", status: "trialing" })).toBe(false);
  });
  it("契約の無いお試しの方は今までどおり送らない", () => {
    expect(isDemoForDigest({ isDemoMode: true }, null)).toBe(true);
    expect(isDemoForDigest({ isDemoMode: true }, { planId: "free", status: "active" })).toBe(true);
  });
  it("解約済みの方には送らない", () => {
    expect(isDemoForDigest({ isDemoMode: true }, { planId: "pro", status: "canceled" })).toBe(true);
  });
});
