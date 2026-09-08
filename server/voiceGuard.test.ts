import { describe, it, expect } from "vitest";
import { checkVoice, findFragmentQuestions, findCasualClosers, isPoliteVoice } from "../shared/voiceGuard";
import { checkHealthClaims } from "../shared/healthClaimGuard";

/**
 * 2026-09-08 比嘉先生（はいさい整骨院・口調「敬語で落ち着いた口調」）に出た不自然な投稿を、
 * そのまま不合格にできること。三上様「二度とこのような不自然な日本語が使われないように」。
 */
const HIGA_VOICE = "敬語で落ち着いた口調、沖縄出身でゆったりとした口調";
const BAD_1198 = `夏の疲れ、そのままにすると秋に3つの不調が出ます。
肩こりや腰痛、自律神経の乱れなど、心当たり？
一人ひとりの身体に合わせて、スッキリ整えるお手伝いをしていますよ😊`;

describe("登録した口調との矛盾", () => {
  it("実際に出た投稿を不合格にする（断片の問いかけ＋砕けた締め）", () => {
    const v = checkVoice(BAD_1198, HIGA_VOICE);
    expect(v.ok).toBe(false);
    expect(v.reasons.join(" ")).toContain("心当たり？");
    expect(v.reasons.join(" ")).toContain("ますよ");
  });

  it("一語で切る問いかけを拾い、述語のある問いかけは通す", () => {
    expect(findFragmentQuestions("肩こりや腰痛など、心当たり？")).toEqual(["肩こりや腰痛など、心当たり？"]);
    expect(findFragmentQuestions("本当？")).toHaveLength(1);
    expect(findFragmentQuestions("最近、肩はどうですか？")).toEqual([]);
    expect(findFragmentQuestions("同じ経験、ありませんか？")).toEqual([]);
    expect(findFragmentQuestions("朝起きたとき、首は重くないですか？")).toEqual([]);
  });

  it("砕けた締めは敬語登録のお店だけ不合格", () => {
    const casual = "肩こりのご相談、受けていますよ😊";
    expect(checkVoice(casual, HIGA_VOICE).ok).toBe(false);
    expect(checkVoice(casual, "フランクで親しみやすい口調").ok).toBe(true);
    expect(findCasualClosers("今日も暑いですね。水分をとってくださいね。")).toEqual([]);
  });

  it("敬語で自然な文はそのまま通る", () => {
    const good = `夏の疲れは、秋に肩こりや腰の重さとして出てくることがあります。
朝起きたとき、首や肩が重いと感じる方は、体の使い方を一度見直してみてください。
はいさい整骨院では、お一人おひとりのお話を伺ってから施術しています。`;
    expect(checkVoice(good, HIGA_VOICE)).toEqual({ ok: true, reasons: [] });
  });

  it("口調の判定", () => {
    expect(isPoliteVoice(HIGA_VOICE)).toBe(true);
    // 「まず5問」で口調が未登録のあいだに生成側が使う既定（autoPostScheduler）は敬語として扱われる
    expect(isPoliteVoice("丁寧で落ち着いた口調（未登録のため既定）")).toBe(true);
    expect(isPoliteVoice("明るく元気なタメ口")).toBe(false);
    expect(isPoliteVoice(null)).toBe(false);
  });
});

describe("症状の予告断定（健康表現ガード）", () => {
  it("「秋に3つの不調が出ます」を落とす", () => {
    const v = checkHealthClaims(BAD_1198);
    expect(v.ok).toBe(false);
    expect(v.hits).toContain("症状の予告断定");
    expect(v.text).not.toContain("不調が出ます");
  });
});
