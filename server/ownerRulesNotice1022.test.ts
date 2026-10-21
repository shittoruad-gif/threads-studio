import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { parseOwnerRuleMessage, addOwnerRule, buildOwnerRulesNote, parseOwnerRules } from "../shared/ownerRules";
import { localTalkOptedOutByRules } from "../shared/localTalk";
import { DAILY_ANNOUNCEMENTS, announcementApplies, announcementForToday, renderAnnouncement } from "../shared/announcements";

// 2026-10-22 のお知らせ（書き方の決まり・地元の会話・トピック）で、お客様が「書いてあるとおりに」送ったときに効くか
describe("10/22 お知らせのとおりに送ったとき", () => {
  const ann = DAILY_ANNOUNCEMENTS.find((a) => a.key === "owner_rules_local_talk_2026-10-22")!;

  it("お知らせの例3行をそのまま貼って送ると、3つとも「決まり：」の付かない決まりになる", () => {
    const msg = "決まり：自分のことは「院長」ではなく「私」と書く\n　決まり：「完全予約制」と必ず書く\n　決まり：「〜ですよね？」で終わらせない";
    const body = parseOwnerRuleMessage(msg)!;
    expect(body).toBeTruthy();
    // lineChatHandler の addOwnerRulesForAccount と同じ整え方
    let cur: string | null = null;
    for (const raw of body.split(/\r?\n/).map((l) => (parseOwnerRuleMessage(l.trim()) ?? l).replace(/^[\s　]*[-・•*]\s*/, "").trim()).filter(Boolean)) {
      const r = addOwnerRule(cur, raw);
      expect(r.added).toBe(true);
      cur = r.rules.join("\n");
    }
    expect(parseOwnerRules(cur)).toEqual([
      "自分のことは「院長」ではなく「私」と書く",
      "「完全予約制」と必ず書く",
      "「〜ですよね？」で終わらせない",
    ]);
    const note = buildOwnerRulesNote(parseOwnerRules(cur));
    expect(note).toContain("- 「完全予約制」と必ず書く");
    expect(note).not.toContain("決まり：");
  });

  it("「決まり：地元の投稿はいらない」で地元の会話が止まる・ほかの決まりでは止まらない", () => {
    const rule = parseOwnerRuleMessage("決まり：地元の投稿はいらない")!;
    expect(localTalkOptedOutByRules([rule])).toBe(true);
    expect(localTalkOptedOutByRules(["地域の話題は作らない"])).toBe(true);
    expect(localTalkOptedOutByRules(["自分のことは「私」と書く", "「完全予約制」と必ず書く"])).toBe(false);
    expect(localTalkOptedOutByRules([])).toBe(false);
  });

  it("書き直し（LINE「書き直す」）でも決まりを渡している", () => {
    const src = fs.readFileSync(path.join(__dirname, "lineChatHandler.ts"), "utf8");
    const fn = src.slice(src.indexOf("async function rewritePost("), src.indexOf("async function rewritePost(") + 2500);
    expect(fn).toContain("buildOwnerRulesNote");
    expect(fn).toContain("ownerRulesNote");
  });

  it("10/22 に、三上様が確かめた16名にだけ送られる", () => {
    expect(announcementForToday(Date.parse("2026-10-21T23:00:00Z"))?.key).toBe(ann.key); // JST 10/22 8:00
    expect(announcementForToday(Date.parse("2026-10-21T10:00:00Z"))?.key).not.toBe(ann.key); // JST 10/21
    const base = { maxPerDay: 3, requireApproval: false, metaAiEnabled: false };
    const ok = [2768, 3200, 3500, 3521, 4667, 4851, 5002, 5131, 5443, 6679, 7269, 7798, 12800, 15296, 17641, 556];
    for (const id of ok) expect(announcementApplies(ann, { ...base, userId: id })).toBe(true);
    for (const id of [78, 19190, 2907, 749]) expect(announcementApplies(ann, { ...base, userId: id })).toBe(false);
    expect(announcementApplies(ann, base)).toBe(false); // userId が分からなければ送らない
    const text = renderAnnouncement(ann, { ...base, userId: 2768 });
    expect(text).toContain("決まり：地元の投稿はいらない");
    expect(text).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  });
});
