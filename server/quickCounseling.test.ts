import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { COUNSELING_QUESTIONS, QUICK_QUESTION_IDS, quickQuestions } from "../shared/counseling";

/**
 * 2026-09-10 三上様指示「LINEでの質問と同じように、Threadsのアプリ内も5問だけに」。
 * それまでは公式LINEだけが「まず5問」で、アプリの画面（/ai-counseling）は全20問。
 * 同じ「はじめの設定」なのに経路で問数が違い、案内文もずれていた。
 */
describe("はじめの設定は、LINEでもアプリの画面でも同じ4問（＋URL）", () => {
  it("「まず5つ」はURL1つ＋4問", () => {
    expect(QUICK_QUESTION_IDS).toHaveLength(4);
    expect(QUICK_QUESTION_IDS).toEqual(["businessTypeRaw", "areaRaw", "storeNameRaw", "mainProblemRaw"]);
  });

  it("絞った質問は、全20問の中に実在する（IDのつづり間違いを防ぐ）", () => {
    const picked = quickQuestions(COUNSELING_QUESTIONS);
    expect(picked).toHaveLength(4);
    for (const q of picked) expect(COUNSELING_QUESTIONS).toContain(q);
  });

  it("並び順は QUICK_QUESTION_IDS のとおり（業種→地域→店名→お悩み）", () => {
    expect(quickQuestions(COUNSELING_QUESTIONS).map((q) => q.id)).toEqual([...QUICK_QUESTION_IDS]);
  });

  it("業種・地域は必須のまま（この店らしさに使うため）", () => {
    const byId = new Map(COUNSELING_QUESTIONS.map((q) => [q.id, q]));
    expect(byId.get("businessTypeRaw")?.required).toBe(true);
    expect(byId.get("areaRaw")?.required).toBe(true);
  });

  it("絞る定義はshared/counseling.tsの1か所だけ（2か所に置くとまたずれる）", () => {
    const line = readFileSync(new URL("./lineChatHandler.ts", import.meta.url), "utf8");
    expect(line).toContain("quickQuestions");
    expect(line).not.toContain('const QUICK_QUESTION_IDS');
  });

  it("アプリの画面も同じ定義から4問に絞っている", () => {
    const web = readFileSync(new URL("../client/src/pages/AICounseling.tsx", import.meta.url), "utf8");
    expect(web).toContain("quickQuestions(allQuestions)");
    expect(web).not.toContain("（10〜15分）");
  });
});
