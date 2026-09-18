import { describe, it, expect } from "vitest";
import {
  assessMaterialDepth,
  materialDepthNotice,
  materialLines,
  repeatedTopics,
  unusedMaterials,
} from "../shared/materialDepth";

/**
 * 2026-09-18 三上様指示の2点を守るための検査。
 *   ① 材料が少ないと「どうしても似た投稿が続く」とお伝えする
 *   ② 材料が足りているお店には、余計な小言を出さない
 */

/** 岩根様（㈱津の国や本店）の実際の登録内容（2026-09-18 時点） */
const iwane = {
  storeName: "㈱津の国や本店",
  businessType: "呉服小売店",
  area: "岡山",
  target: "20〜70代の女性\nお茶をされている方\nお琴をされている方\n踊りをされている方",
  mainProblem: "敷居が高いと思われている？",
  strength: "本物の正絹の着物を扱っている。",
  usp: "本物の正絹にこだわりぬいている。",
  proof: "今年で創業130年を迎える。",
  n1Customer: "園遊会に招待された方へ誂えた\n文化勲章の授賞式に参列される方へ誂えた",
  belief: null,
  catchphrase: null,
  localTerms: null,
  customerWords: null,
};

describe("materialLines", () => {
  it("空欄は0行、短すぎる断片は数えない", () => {
    expect(materialLines(null)).toEqual([]);
    expect(materialLines("   ")).toEqual([]);
    expect(materialLines("はい。")).toEqual([]);
  });

  it("改行と句読点で材料を割る", () => {
    expect(materialLines("園遊会に招待された方\n文化勲章の授賞式の方")).toHaveLength(2);
  });
});

describe("assessMaterialDepth", () => {
  it("強みと選ばれる理由が同じことを言っていると気づく（岩根様）", () => {
    const d = assessMaterialDepth(iwane);
    expect(d.samePair).toContain("同じことを言っています");
  });

  it("空欄の項目を、効く順に挙げる（お客様の言葉・考えが先）", () => {
    const d = assessMaterialDepth(iwane);
    const keys = d.gaps.filter((g) => g.state === "empty").map((g) => g.key);
    expect(keys).toContain("customerWords");
    expect(keys).toContain("belief");
    // いちばん効く項目（weight 3）が先に来る
    expect(["customerWords", "belief"]).toContain(d.gaps[0].key);
  });

  it("材料がそろっていれば rich になり、空欄の指摘も出ない", () => {
    const rich = {
      ...iwane,
      strength: "国家資格者が在籍\n体の状態を見てから始める\n夜9時まで開いている",
      usp: "マンツーマンで見る\n女性スタッフが対応する\n着替えの場所がある",
      n1Customer: "産後の方\n立ち仕事の方\nデスクワークの方\n学生の方\n高齢の方",
      mainProblem: "肩がこる\n腰が痛い\n続かない",
      customerWords: "ここなら続けられそう\n説明が分かりやすかった",
      belief: "無理にすすめない\nその場しのぎにしない",
      localTerms: "玉島\n商店街",
      catchphrase: "まずは体を知ることから",
      proof: "開業11年\nのべ2万人",
      target: "30代から60代の女性\n近くにお勤めの方",
    };
    const d = assessMaterialDepth(rich);
    expect(d.level).toBe("rich");
    expect(d.gaps.filter((g) => g.state === "empty")).toHaveLength(0);
  });
});

describe("repeatedTopics", () => {
  it("店名・地名・業種は「繰り返し」として数えない（言いがかりにしない）", () => {
    const posts = Array.from({ length: 8 }, (_, i) => `岡山の㈱津の国や本店です。着物のご相談を承ります。${i}`);
    const st = repeatedTopics(posts, iwane);
    expect(st.topics.map((t) => t.phrase).join()).not.toContain("岡山");
    expect(st.topics.map((t) => t.phrase).join()).not.toContain("津の国や");
  });

  it("投稿が少ないうちは判定しない", () => {
    expect(repeatedTopics(["あ".repeat(20)], iwane).topics).toEqual([]);
  });

  it("同じ決め台詞が並べば拾う", () => {
    const posts = Array.from({ length: 8 }, (_, i) => `今日のお話です${i}。本物の正絹は品格を引き立てます。`);
    const st = repeatedTopics(posts, iwane);
    expect(st.topics.length).toBeGreaterThan(0);
    expect(st.topics[0].phrase).toContain("正絹");
  });
});

describe("materialDepthNotice", () => {
  it("書き直しが続いた日は、回数と不足を数えた事実として伝える", () => {
    const n = materialDepthNotice(iwane, [], { dupRejects: 16, shortfall: 1 });
    expect(n.show).toBe(true);
    expect(n.severity).toBe("warn");
    expect(n.evidence).toContain("16回書き直しました");
    expect(n.evidence).toContain("1件は最後まで書けず");
    expect(n.reason).toContain("どうしても似た投稿が続きます");
    expect(n.asks.length).toBeGreaterThan(0);
  });

  it("保証パスでお届けした件数も伝える", () => {
    const n = materialDepthNotice(iwane, [], { guaranteed: 1 });
    expect(n.evidence).toContain("本数を守るためお届け");
    expect(n.severity).toBe("warn");
  });

  it("何も起きていない日に、材料がそろっているお店へは出さない", () => {
    const rich = {
      ...iwane,
      strength: "国家資格者が在籍\n夜9時まで開いている\n着替えの場所がある",
      usp: "マンツーマンで見る\n女性スタッフが対応する\n予約が取りやすい",
      n1Customer: "産後の方\n立ち仕事の方\nデスクワークの方\n学生の方\n高齢の方",
      mainProblem: "肩がこる\n腰が痛い\n続かない",
      customerWords: "ここなら続けられそう\n説明が分かりやすかった",
      belief: "無理にすすめない\nその場しのぎにしない",
      localTerms: "玉島\n商店街",
      catchphrase: "まずは体を知ることから",
      proof: "開業11年\nのべ2万人",
      target: "30代から60代の女性\n近くにお勤めの方",
    };
    expect(materialDepthNotice(rich, [], {}).show).toBe(false);
  });

  it("書き直しが1〜2回だけの日は、まだ出さない（毎日の小言にしない）", () => {
    const ok = {
      ...iwane,
      // 強みと選ばれる理由は別の角度にしておく（同じだとそれ自体をお伝えするため）
      strength: "本物の正絹の着物を扱っている",
      usp: "着付けまで一緒にお手伝いする",
      belief: "無理にすすめない\nその場しのぎにしない",
      customerWords: "ここなら任せられる\n説明が丁寧だった",
      localTerms: "玉島\n商店街",
      catchphrase: "まずは一度ご覧ください",
    };
    expect(materialDepthNotice(ok, [], { dupRejects: 2 }).show).toBe(false);
  });
});

describe("unusedMaterials", () => {
  it("まだ投稿に出ていない材料を、名指しで返す（保証パスが使う）", () => {
    const recent = ["本物の正絹にこだわりぬいています。岡山で創業130年。"];
    const unused = unusedMaterials(iwane, recent, 4);
    expect(unused.join()).toContain("園遊会");
    // すでに使った材料は返さない
    expect(unused.join()).not.toContain("こだわりぬいている");
  });
});
