import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 列だけを直す画面（AI投稿画面の「プロジェクト情報」）の修正が、
 * 「はじめの設定」の答えと要旨にも反映されることの確認。
 *
 * ★2026-09-18 森様：交通事故専門のアカウントに切り替えて業種・お客さん像を直したのに、
 *   要旨は「産後のママ／骨盤矯正」のままで、その内容の投稿が作られていた。
 */
const state: { project: any; patched: any } = { project: null, patched: null };

vi.mock("./db", () => ({
  getProjectById: vi.fn(async () => state.project),
  updateProject: vi.fn(async (_id: string, patch: any) => { state.patched = patch; }),
}));

const { syncCounselingFromColumns } = await import("./counselingSync");

const before = {
  counseledAt: 1700000000000,
  useThreadsKnowhow: false,
  freeFormSummary: "",
  brief: { oneLine: "川口市の交通事故の痛みでお困りの方へ" },
  rawAnswers: {
    businessTypeRaw: "接骨院",
    targetRaw: "産後のママ",
    mainProblemRaw: "肩こり",
    menuRaw: "骨盤矯正\n産後骨盤矯正",
    ngListRaw: "必ず治る",
  },
};

beforeEach(() => {
  state.project = { id: "p1", userId: 1, counselingResult: JSON.stringify(before) };
  state.patched = null;
});

describe("列の修正を答えにもそろえる", () => {
  it("お客さん像を直すと、答えと要旨の「誰に」が入れ替わる", async () => {
    await syncCounselingFromColumns("p1", { target: "交通事故の体の痛みでお困りの方" });
    const after = JSON.parse(state.patched.counselingResult);
    expect(after.rawAnswers.targetRaw).toBe("交通事故の体の痛みでお困りの方");
    expect(after.brief.concept.who).toBe("交通事故の体の痛みでお困りの方");
    // 直していない答えは残る
    expect(after.rawAnswers.menuRaw).toBe("骨盤矯正\n産後骨盤矯正");
  });

  it("お客様が書き換えた「一言でいうと」と、設定を終えた日は変えない", async () => {
    await syncCounselingFromColumns("p1", { businessType: "交通事故専門の接骨院" });
    const after = JSON.parse(state.patched.counselingResult);
    expect(after.brief.oneLine).toBe("川口市の交通事故の痛みでお困りの方へ");
    expect(after.counseledAt).toBe(1700000000000);
    expect(after.useThreadsKnowhow).toBe(false);
  });

  it("実績・使わない言葉も答えに入る（トークから足した分）", async () => {
    await syncCounselingFromColumns("p1", { proof: "歴18年\nメディア掲載", ngWords: "必ず治る、格安" });
    const after = JSON.parse(state.patched.counselingResult);
    expect(after.realProofs).toEqual(["歴18年", "メディア掲載"]);
    expect(after.ngList).toEqual(["必ず治る", "格安"]);
  });

  it("答えに関係のない列だけの修正では書き込まない", async () => {
    await syncCounselingFromColumns("p1", { localTerms: "東川口駅", styleSamples: "お手本" });
    expect(state.patched).toBeNull();
  });

  it("同じ内容なら書き込まない", async () => {
    await syncCounselingFromColumns("p1", { targetRaw: "産後のママ", target: "産後のママ" });
    expect(state.patched).toBeNull();
  });

  // ★2026-09-06 以前の不具合で、列だけ「40代女性」→「代女性」になっている方が7名いる。
  //   列を答えへ写すと、正しく残っている数字が消えてしまう。
  it("列から数字が落ちている項目は、答えを上書きしない", async () => {
    state.project = {
      id: "p1", userId: 1,
      counselingResult: JSON.stringify({
        counseledAt: 1,
        rawAnswers: { targetRaw: "産後のママ", realEpisodesRaw: "40代女性／長年の腰痛\n50代男性／五十肩" },
      }),
    };
    await syncCounselingFromColumns("p1", {
      target: "交通事故の方",
      n1Customer: "代女性／長年の腰痛\n代男性／五十肩",
    });
    const after = JSON.parse(state.patched.counselingResult);
    expect(after.rawAnswers.targetRaw).toBe("交通事故の方");
    expect(after.rawAnswers.realEpisodesRaw).toBe("40代女性／長年の腰痛\n50代男性／五十肩");
  });

  it("答えが残っていない古い登録は触らない（メニュー等を消さないため）", async () => {
    state.project = {
      id: "p1", userId: 1,
      counselingResult: JSON.stringify({ menu: ["骨盤矯正"], hoursInfo: ["9-19時"], counseledAt: 1 }),
    };
    await syncCounselingFromColumns("p1", { target: "交通事故の方" });
    expect(state.patched).toBeNull();
  });

  it("はじめの設定がまだのプロジェクトには何もしない", async () => {
    state.project = { id: "p1", userId: 1, counselingResult: null };
    await syncCounselingFromColumns("p1", { target: "交通事故の方" });
    expect(state.patched).toBeNull();
  });
});
