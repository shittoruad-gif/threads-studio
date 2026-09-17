import { describe, it, expect } from "vitest";
import { announcementApplies, announcementForToday, DAILY_ANNOUNCEMENTS, renderAnnouncement } from "../shared/announcements";

/** 8:30の案内と一緒に、その日だけ全員へ送るお知らせ（2026-09-09） */
describe("その日のお知らせ", () => {
  const jst = (s: string) => Date.parse(s + "+09:00");

  it("送る日（JST）にだけ返す。前日・翌日は返さない", () => {
    expect(announcementForToday(jst("2026-09-09T08:30:00"))?.key).toBe("easy_setup_2026-09-09");
    expect(announcementForToday(jst("2026-09-09T00:05:00"))?.key).toBe("easy_setup_2026-09-09");
    expect(announcementForToday(jst("2026-09-08T23:55:00"))).toBeNull();
    expect(announcementForToday(jst("2026-09-10T08:30:00"))).toBeNull();
  });

  it("文面はLINEの1通に収まり、初心者向けの言葉で書かれている", () => {
    for (const a of DAILY_ANNOUNCEMENTS) {
      expect(Array.from(a.text).length).toBeLessThan(2000);
      // 内部用語を使わない（お客様に見せない言葉）
      for (const ng of ["adminReview", "styleSamples", "postback", "quick", "API", "プロンプト"]) expect(a.text).not.toContain(ng);
    }
    // 9/9：変わった点が「5問」「きょうの1問」「次にやること」の言葉で説明されている
    const a909 = DAILY_ANNOUNCEMENTS.find((a) => a.key === "easy_setup_2026-09-09")!;
    expect(a909.text).toContain("5問");
    expect(a909.text).toContain("きょうの1問");
    expect(a909.text).toContain("次にやること");
    // 9/11：既存の方が混乱しないよう「変わらない」を先に、戻し方（設定）を必ず書く（2026-09-10 三上様指示）
    const a911 = DAILY_ANNOUNCEMENTS.find((a) => a.key === "morning_digest_2026-09-11")!;
    const pro = renderAnnouncement(a911, { maxPerDay: 3, requireApproval: true, metaAiEnabled: true });
    expect(pro.indexOf("変わりません")).toBeLessThan(pro.indexOf("■ 1."));
    expect(pro).toContain("「設定」");
    expect(pro).toContain("7:40");
    expect(pro).toContain("■ 4. ");
    expect(Array.from(pro).length).toBeLessThan(2000);
  });

  it("その方に当てはまる段落だけを出す（2026-09-10 三上様指示）", () => {
    const a911 = DAILY_ANNOUNCEMENTS.find((a) => a.key === "morning_digest_2026-09-11")!;
    // ライト（Meta AIなし）・確認あり：Meta AIの段落は出ない。番号は詰まる
    const light = renderAnnouncement(a911, { maxPerDay: 1, requireApproval: true, metaAiEnabled: true });
    expect(light).not.toContain("Meta AI");
    expect(light).toContain("■ 3. 「自動（確認なし）にしませんか」");
    // 自動（確認なし）の方：承認の話と「自動にしませんか」は出ない
    const auto = renderAnnouncement(a911, { maxPerDay: 3, requireApproval: false, metaAiEnabled: false });
    expect(auto).not.toContain("承認カード");
    expect(auto).not.toContain("自動（確認なし）にしませんか");
    expect(auto).toContain("■ 2. 投稿が作れなかった日は、翌日に足します");
    // 自動投稿の無いプラン：1と結びの文だけ
    const free = renderAnnouncement(a911, { maxPerDay: 0, requireApproval: true, metaAiEnabled: true });
    expect(free).toContain("■ 1. ");
    expect(free).not.toContain("■ 2. ");
    expect(free).toContain("このLINEに文章で送ってください");
  });

  /** 慣らし運転のお知らせ（2026-09-17 三上様の○・sendOn 9/19）。関係のない方に届かせない */
  describe("慣らし運転のお知らせ", () => {
    const ramp = DAILY_ANNOUNCEMENTS.find((a) => a.key === "account_ramp_2026-09-19")!;
    const ctx = (newestAccountAgeDays: number | null) => ({
      maxPerDay: 3, requireApproval: false, metaAiEnabled: false, newestAccountAgeDays,
    });

    it("送る日は9/19（本番反映の翌日以降＝R4）", () => {
      expect(ramp.sendOn).toBe("2026-09-19");
      expect(announcementForToday(jst("2026-09-19T07:40:00"))?.key).toBe("account_ramp_2026-09-19");
      expect(announcementForToday(jst("2026-09-18T07:40:00"))?.key).not.toBe("account_ramp_2026-09-19");
      expect(announcementForToday(jst("2026-09-20T07:40:00"))?.key).not.toBe("account_ramp_2026-09-19");
    });

    it("連携から30日以内の方にだけ送る", () => {
      expect(announcementApplies(ramp, ctx(0))).toBe(true);   // きょう連携した方
      expect(announcementApplies(ramp, ctx(9))).toBe(true);   // 慣らしの最中
      expect(announcementApplies(ramp, ctx(29))).toBe(true);  // 取り戻しの最中
      expect(announcementApplies(ramp, ctx(30))).toBe(false); // 取り戻しが終わった方
      expect(announcementApplies(ramp, ctx(154))).toBe(false);
      expect(announcementApplies(ramp, ctx(null))).toBe(false); // 連携が1件も無い方
    });

    it("お知らせの絞り込みが無いものは、今までどおり全員に送る", () => {
      const a911 = DAILY_ANNOUNCEMENTS.find((a) => a.key === "morning_digest_2026-09-11")!;
      expect(announcementApplies(a911, ctx(999))).toBe(true);
      expect(announcementApplies(a911, ctx(null))).toBe(true);
    });

    it("お客様がすること・日数・本数・取り戻し・ライトの扱いが書かれている", () => {
      const t = renderAnnouncement(ramp, ctx(3));
      expect(t).toContain("1〜5日目：1日1件");
      expect(t).toContain("6〜10日目：1日2件");
      expect(t).toContain("11日目から：ご契約どおりの本数");
      expect(t).toContain("30日間の合計は、ご契約どおりの本数になります");
      expect(t).toContain("ライトプラン");
      expect(t).toContain("お客様にしていただくことはありません");
      // 「不具合ではない」を先に言う（2026-09-10 三上様指示：変わらないことを先に）
      expect(t.indexOf("不具合ではありません")).toBeLessThan(t.indexOf("■ なぜ抑えているか"));
      expect(Array.from(t).length).toBeLessThan(2000);
    });
  });
});
