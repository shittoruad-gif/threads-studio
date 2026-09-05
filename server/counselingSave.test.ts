import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * はじめの設定（全20問）の保存内容の確認。
 * お客様は確認画面で内容を見てから「登録する」を押すので、
 * そこに出ていた答えは必ず保存されていなければならない。
 * DBは差し替えて、書き込もうとした内容だけを見る。
 */
const state: { project: any; patched: any } = { project: null, patched: null };

vi.mock("./db", () => ({
  getProjectById: vi.fn(async () => state.project),
  createProject: vi.fn(async () => { state.project = { id: "p1", userId: 1, title: "マイプロジェクト" }; }),
  updateProject: vi.fn(async (_id: string, patch: any) => { state.patched = patch; }),
}));

const { saveCounselingAnswers } = await import("./counselingSave");

const ANSWERS = {
  storeNameRaw: "ナイト整体院",
  businessTypeRaw: "整体院",
  areaRaw: "岡山県倉敷市玉島爪崎町",
  targetRaw: "40代の女性",
  mainProblemRaw: "肩こりと腰の痛み",
  strengthRaw: "原因から見ていきます",
  uspRaw: "説明がわかりやすい",
  realProofsRaw: "開業7年、のべ8000人の施術実績",
  industryMythsRaw: "強く押せば治るという考え方には賛成できません",
  realEpisodesRaw: "産後の腰痛の30代Aさんが3回で楽になりました",
  ngListRaw: "必ず治る、完治",
};

const save = (project: any) => {
  state.project = project;
  state.patched = null;
  return saveCounselingAnswers({ userId: 1, projectId: "p1", mode: "store", answers: ANSWERS });
};

beforeEach(() => { state.project = null; state.patched = null; });

describe("はじめの設定の保存", () => {
  it("「絶対に書きたくないこと」を ngWords に保存する（投稿の機械検査がこの列だけを見るため）", async () => {
    await save({ id: "p1", userId: 1, title: "ナイト整体院" });
    expect(state.patched.ngWords).toBe("必ず治る、完治");
  });

  it("トークで後から足したNGワードを消さない", async () => {
    await save({ id: "p1", userId: 1, title: "ナイト整体院", ngWords: "格安、日本一" });
    expect(state.patched.ngWords).toBe("格安、日本一、必ず治る、完治");
  });

  it("設定をやり直したら、実績・強み・考え方が新しい答えに入れ替わる", async () => {
    // 以前の答えが入ったままの状態でやり直す（確認画面には新しい答えが出ている）
    await save({
      id: "p1", userId: 1, title: "ナイト整体院",
      proof: "古い実績", usp: "古い強み", belief: "古い考え", n1Customer: "古いお客様の話",
    });
    expect(state.patched.proof).toBe("開業7年\nのべ8000人の施術実績");
    expect(state.patched.usp).toBe("説明がわかりやすい");
    expect(state.patched.belief).toBe("強く押せば治るという考え方には賛成できません");
    expect(state.patched.n1Customer).toBe("産後の腰痛の30代Aさんが3回で楽になりました");
  });

  it("答えが空の項目は、いまの内容を消さない", async () => {
    state.project = { id: "p1", userId: 1, title: "ナイト整体院", proof: "残したい実績", ngWords: "残したいNG" };
    state.patched = null;
    await saveCounselingAnswers({
      userId: 1, projectId: "p1", mode: "store",
      answers: { ...ANSWERS, realProofsRaw: "", ngListRaw: "" },
    });
    expect(state.patched.proof).toBeUndefined();
    expect(state.patched.ngWords).toBeUndefined();
  });

  it("他の方のプロジェクトには保存しない", async () => {
    state.project = { id: "p1", userId: 999, title: "よそのお店" };
    state.patched = null;
    const res = await saveCounselingAnswers({ userId: 1, projectId: "p1", mode: "store", answers: ANSWERS });
    expect(res).toEqual({ ok: false, reason: "not_found" });
    expect(state.patched).toBeNull();
  });
});
