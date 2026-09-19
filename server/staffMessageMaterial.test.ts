import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 「担当者に聞く」を押したあとに送られた投稿の材料が、投稿に一度も使われずに終わっていた
 * （2026-09-19 株式会社プレステージ様・ご質問 #40）。
 *
 * こちらから採用の材料（入社された方のお声・入社後の場面・代表のお考え・
 * 店舗ごとの雰囲気・数字）をお願いし、そのすべてを書いて送ってくださったのに、
 * そのときのトークは `staff_message` の状態だったため、文章は担当者への連絡として
 * 記録されるだけで（category='その他'）、「実績として登録」は一度も出なかった。
 * お店の情報に入らない材料は投稿に使われないので、書いてくださった内容が活きない。
 *
 * 担当者へお届けするのは変えず、その場で登録もできるようにする。
 */
vi.mock("./lineNotify", () => ({ pushLine: vi.fn(), replyLine: vi.fn(), pushLineWithButtons: vi.fn() }));
vi.mock("./supportNotify", () => ({ notifyStaffOfQuestion: vi.fn(async () => true) }));

const LINE_USER = "Ustaffmaterial";
let state: any = null;
let project: any;
const created: any[] = [];

vi.mock("./db", () => {
  const impl: Record<string, any> = {
    getUserByLineUserId: async () => ({ id: 1, email: "qa@example.com", name: "QA" }),
    getUserById: async () => ({ id: 1, email: "qa@example.com", name: "QA" }),
    getUserProjects: async () => [project],
    getProjectById: async () => project,
    getLineChatState: async () => state,
    getLineChatStateIgnoringTtl: async () => state,
    setLineChatState: async (_u: string, s: string, d: string) => { state = { state: s, payload: d, ageMin: 0 } as any; },
    clearLineChatState: async () => { state = null; },
    createSupportQuestion: async (q: any) => { created.push(q); return created.length; },
    updateSupportQuestion: async () => undefined,
  };
  for (const name of [
    "getThreadsAccountsByUserId", "getActiveThreadsAccounts", "getSubscriptionByUserId",
    "getScheduledPostsByUser", "logEvent", "getLineFollower", "findOwnRecentPostByContent",
    "updateProject", "setLineFollowerOptOut",
  ]) impl[name] ??= async () => undefined;
  return impl;
});

const handler: any = await import("./lineChatHandler");

const textOf = (res: any) => (Array.isArray(res) ? res : [res])
  .map((m: any) => String(m?.text ?? m?.altText ?? "")).join("\n");
const dataOf = (res: any) => JSON.stringify(res);

/** 2026-09-19 にプレステージ様が実際に送ってくださった文章（先頭だけ・形はそのまま） */
const 材料 = [
  "1. 入社された方・見学に来られた方から、実際に言われた言葉",
  "　そのままの言い方で2つ3つ。ここがいちばん効きます。",
  "　例：「見学のとき、先輩が優しくて安心した」「未経験でも本当に教えてもらえた」",
  "",
  "・一番安心したのはスタッフが優しくサロンの雰囲気も良かった",
  "・お客様の変化を一緒に喜べる仕事にやりがいがあります",
  "",
  "2. 実際にあった入社後の場面",
  "　・未経験で入社して2か月目には指名をいただけた",
  "　・異業種からの転職で2年で役職者になった",
  "",
  "3. 採用で大切にされている考え",
  "・未経験でもしっかりプロに育てる",
  "・チームワークを大事にする",
].join("\n");

describe("「担当者に聞く」のあとに送られた投稿の材料（2026-09-19 #40）", () => {
  beforeEach(() => {
    created.length = 0;
    state = { state: "staff_message", payload: null, ageMin: 0 };
    project = {
      id: "line_qa1", mode: "store", businessType: "エステサロン", area: "神奈川県横浜市",
      storeName: "プレステージ", mainProblem: "採用が集まらないこと",
      target: "20〜30代の女性", strength: "未経験からしっかり育てること",
    };
  });

  it("担当者にはこれまでどおりお届けする", async () => {
    const res = await handler.handleFreeText(LINE_USER, 材料);
    expect(created.length).toBe(1);
    expect(created[0].needsHuman).toBe(1);
    expect(textOf(res)).toContain("担当者");
  });

  it("その場で「実績として登録」も出す（投稿に使えるようにする）", async () => {
    const res = await handler.handleFreeText(LINE_USER, 材料);
    expect(dataOf(res)).toContain("c=addproof");
    expect(textOf(res)).toContain("実績として登録");
  });

  it("押していただけるよう、文章を預かっておく", async () => {
    await handler.handleFreeText(LINE_USER, 材料);
    expect(state?.state).toBe("pending_material");
    expect(String(state?.payload)).toContain("未経験で入社して2か月目");
  });

  it("ふつうのお困りごとには「実績として登録」を出さない", async () => {
    const res = await handler.handleFreeText(LINE_USER, "ログインできません。パスワードを入れても画面が変わらないです。どうすればよいでしょうか？");
    expect(created.length).toBe(1);
    expect(dataOf(res)).not.toContain("c=addproof");
    expect(state).toBe(null);
  });
});
