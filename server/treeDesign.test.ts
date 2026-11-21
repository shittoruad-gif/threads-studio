import { describe, it, expect } from "vitest";
import {
  TREE_DESIGN, TREE_DESIGN_KEYS, TREE_DESIGN_TRIALS, inTreeDesign, isTreeDesignSlot, treeDesignFor, treeDesignArm, treeDesignOffer,
  treeDesignSplit, treeDesignSegments, treeDesignProblems, maskRankLabels, rankingLines, TEASER_RE,
} from "../shared/treeDesign";

const at = (ymd: string, h = 12) => Date.parse(`${ymd}T${String(h).padStart(2, "0")}:00:00+09:00`);
const RANK = [
  "デスクワークの合間にできる肩まわりの動き、手軽な順BEST3",
  "第3位　肩をすくめてストンと落とす",
  "座ったまま3回でできます。",
  "第2位　両手を後ろで組んで胸をひらく",
  "画面を見続けたあとに向いています。",
  "第1位　深く息を吐く",
  "道具も場所もいりません。",
  "まずはここからで十分です。",
].join("\n");
const QA = [
  "運動は朝と夜、どちらが続けやすい？",
  "決まった答えはなく、生活の中で動かしやすい時間のほうです。",
  "朝は予定に左右されにくく、夜は一日のこわばりに気づきやすい時間です。",
  "どちらも試して、次の日に体が軽いほうを選んでみてください。",
  "まずは今夜、寝る前に背伸びを1回だけ。",
].join("\n");
const REASON = [
  "初めての方に、あえて最初にお聞きすることが1つあります。",
  "それは「どんな日に、いちばん体を動かしたくないか」です。",
  "仕事の帰りに「今日は行きたくないな」と思う日は、だれにでもあります。",
  "そんな日でも足が向く場所なら、体を動かす時間が生活の中に残ります。",
  "続く形を一緒に探したいと思っています。",
].join("\n");

describe("ツリーの利点を生かした投稿の試し", () => {
  it("対象は学習用の3アカウントだけ・期間の両端を含む", () => {
    expect(TREE_DESIGN.accountIds).toEqual([10, 12, 36]);
    expect(inTreeDesign(10, at(TREE_DESIGN.start, 0))).toBe(true);
    expect(inTreeDesign(12, at(TREE_DESIGN.until, 23))).toBe(true);
    expect(inTreeDesign(36, at("2026-12-20", 0))).toBe(false);
    expect(inTreeDesign(10, at("2026-11-21", 23))).toBe(false);
    expect(inTreeDesign(33, at(TREE_DESIGN.start))).toBe(false);
  });
  it("枠は上乗せの1本目だけ", () => {
    const now = at(TREE_DESIGN.start);
    expect(isTreeDesignSlot(10, 3, 3, 5, now)).toBe(true);
    expect(isTreeDesignSlot(10, 2, 3, 5, now)).toBe(false);
    expect(isTreeDesignSlot(10, 4, 3, 5, now)).toBe(false);
    expect(isTreeDesignSlot(10, 3, 3, 3, now)).toBe(false);
    expect(isTreeDesignSlot(33, 3, 3, 5, now)).toBe(false);
  });
  it("3つの型を日替わりで回し、同じ日の3アカウントで型がずれる", () => {
    const now = at("2026-11-25");
    expect(new Set([10, 12, 36].map((a) => treeDesignFor(a, now).key)).size).toBe(3);
    const three = [0, 1, 2].map((d) => treeDesignFor(10, now + d * 86400_000).key);
    expect(new Set(three).size).toBe(3);
    for (const k of three) expect(TREE_DESIGN_KEYS).toContain(k);
  });
  it("ツリー／1本のまま と 案内あり／なし が、4本でひと回りして同じ数ずつ当たる", () => {
    const combos = [7000, 7001, 7002, 7003].map((id) => `${treeDesignArm(id)}:${treeDesignOffer(id)}`);
    expect(new Set(combos).size).toBe(4);
  });
  it("BEST3：1本目は題名だけ、続きは 第3位／第2位／第1位 を1本ずつ。元の文は変えない・予告を足さない", () => {
    const parts = treeDesignSplit("tree_rank", RANK)!;
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe("デスクワークの合間にできる肩まわりの動き、手軽な順BEST3");
    expect(parts[1]).toBe("第3位　肩をすくめてストンと落とす\n座ったまま3回でできます。");
    expect(parts[2].startsWith("第2位　両手を")).toBe(true);
    expect(parts[3].startsWith("第1位　深く息を吐く")).toBe(true);
    expect(parts[3].endsWith("まずはここからで十分です。")).toBe(true); // 結びは第1位の投稿に付く
    expect(parts.join("\n")).toBe(RANK);
    expect(parts.join("")).not.toMatch(/第2位は、|第1位は、/);
    // 案内ありの回は、最後に案内が1本つく（5本）
    const seg = treeDesignSegments({ experimentKey: "tree_rank", threadsAccountId: 12, id: 7003, text: RANK })!;
    expect(seg.segments).toHaveLength(5);
    expect(seg.segments[4]).toBe(TREE_DESIGN.offers[12]);
    expect(treeDesignSegments({ experimentKey: "tree_rank", threadsAccountId: 12, id: 7001, text: RANK })!.segments).toHaveLength(4);
    // 順位の中身が1行だけで短すぎるものは分けない
    expect(treeDesignSplit("tree_rank", RANK.replace("第2位　両手を後ろで組んで胸をひらく\n画面を見続けたあとに向いています。", "第2位　胸をひらく"))).toBeNull();
  });
  it("Q&A：1行目の問い／答え。言い切り：1行目／理由。1本目は中身より短い（短→長）", () => {
    const qa = treeDesignSplit("tree_qa", QA)!;
    expect(qa[0]).toBe("運動は朝と夜、どちらが続けやすい？");
    expect(`${qa[0]}\n${qa[1]}`).toBe(QA);
    const rs = treeDesignSplit("tree_reason", REASON)!;
    expect(rs[0]).toBe("初めての方に、あえて最初にお聞きすることが1つあります。");
    for (const x of [qa, rs]) { expect(x).toHaveLength(2); expect(Array.from(x[0]).length).toBeLessThan(Array.from(x[1]).length); }
  });
  it("分けられない本文は null（1本のまま出す）", () => {
    expect(treeDesignSplit("tree_rank", "ふつうの投稿です。\n順位はありません。")).toBeNull();
    expect(treeDesignSplit("tree_rank", RANK.split("\n").slice(1).join("\n"))).toBeNull(); // 題名なし
    expect(treeDesignSplit("tree_rank", RANK + "\n第1位　もう1つ")).toBeNull();
    expect(treeDesignSplit("tree_qa", QA.replace("続けやすい？", "続けやすいかという話。"))).toBeNull(); // 問いで始まっていない
    expect(treeDesignSplit("tree_qa", "短い？\n短い答え。")).toBeNull(); // 中身が短い
    expect(treeDesignSplit("tree_reason", "慢性的な肩こり。\n" + REASON)).toBeNull(); // 1本目が短すぎる
    expect(treeDesignSplit("tree_reason", "続きは下で紹介します。\n" + REASON)).toBeNull(); // 続きの予告
    expect(treeDesignSplit("ranking3", RANK)).toBeNull();
    expect(treeDesignSplit(null, RANK)).toBeNull();
    expect(rankingLines("本文の途中に第3位と書いても行の先頭でなければ数えない")).toBeNull();
    expect(TEASER_RE.test("理由はこのあと")).toBe(true);
  });
  it("公開の形：ツリーは フック／中身／（案内）、1本のままは末尾に同じ案内", () => {
    const base = { experimentKey: "tree_qa", threadsAccountId: 12, text: QA };
    const t = treeDesignSegments({ ...base, id: 7001 })!; // 奇数＝ツリー・案内なし
    expect(t.arm).toBe("tree"); expect(t.offer).toBe(false); expect(t.segments).toHaveLength(2);
    const to = treeDesignSegments({ ...base, id: 7003 })!; // ツリー・案内あり
    expect(to.segments).toHaveLength(3);
    expect(to.segments[2]).toBe(TREE_DESIGN.offers[12]);
    const s = treeDesignSegments({ ...base, id: 7000 })!; // 1本・案内なし
    expect(s.segments).toEqual([QA]);
    const so = treeDesignSegments({ ...base, id: 7002 })!; // 1本・案内あり
    expect(so.segments).toEqual([`${QA}\n\n${TREE_DESIGN.offers[12]}`]);
    // 分けられない本文は、ツリーの番でも1本のまま
    const ns = treeDesignSegments({ ...base, id: 7001, text: "短い？\n短い答え。" })!;
    expect(ns.arm).toBe("single"); expect(ns.segments).toHaveLength(1);
  });
  it("お客様のアカウント・ふつうの投稿では何も変えない（null）", () => {
    expect(treeDesignSegments({ experimentKey: "tree_qa", threadsAccountId: 33, id: 7001, text: QA })).toBeNull();
    expect(treeDesignSegments({ experimentKey: null, threadsAccountId: 12, id: 7001, text: QA })).toBeNull();
    expect(treeDesignSegments({ experimentKey: "hook_local", threadsAccountId: 12, id: 7001, text: QA })).toBeNull();
  });
  it("案内：URL・料金・効果の約束を書かない。3アカウントぶんだけある", () => {
    expect(Object.keys(TREE_DESIGN.offers).map(Number).sort((a, b) => a - b)).toEqual([10, 12, 36]);
    for (const o of Object.values(TREE_DESIGN.offers)) {
      expect(o).not.toMatch(/https?:|\.com|\.net|円|無料体験|治|改善|必ず/);
      expect(o).toContain("プロフィールの公式LINE");
      expect(Array.from(o).length).toBeLessThanOrEqual(80);
    }
  });
  it("指示：1行目だけで完結・続きを匂わせない・本文に案内を書かせない", () => {
    for (const k of TREE_DESIGN_KEYS) {
      const n = TREE_DESIGN_TRIALS[k].note;
      expect(TREE_DESIGN_TRIALS[k].key).toBe(k);
      expect(n).toContain("思わずコメント欄（続き）を開く1文");
      expect(n).toContain("1行目では答え・結論・理由を言わない");
      expect(n).toContain("続きの場所を案内する言葉は書かない");
      expect(n).toContain("うそを書かない");
      expect(n).toContain("案内は別に付ける");
      expect(n).toContain("提供していないメニュー");
    }
    expect(TREE_DESIGN_TRIALS.tree_rank.note).toContain("数えた結果に見える基準にしない");
    expect(TREE_DESIGN_TRIALS.tree_qa.note).toContain("登録情報にその質問が書かれているときだけ");
    expect(TREE_DESIGN_TRIALS.tree_reason.note).toContain("下げる一言にしない");
  });
  it("数字の検査から外すのは順位の表記だけ。人数・割合・途中の順位は残る", () => {
    const m = maskRankLabels(RANK + "\n3人に1人が知りません。\n人気3位のメニューです。");
    expect(m).not.toMatch(/第[123]位/);
    expect(m).not.toMatch(/BEST3/);
    expect(m).toContain("3回でできます");
    expect(m).toContain("3人に1人");
    expect(m).toContain("人気3位");
  });
  it("つなぎ込み：書く側は上乗せの枠の判定を通し、数字の検査の例外は BEST3 の型だけ", async () => {
    const fs = await import("node:fs");
    const sch = fs.readFileSync(new URL("./autoPostScheduler.ts", import.meta.url), "utf8");
    expect(sch).toMatch(/td\.isTreeDesignSlot\(account\.id, i, contractCount, postCount\)/);
    expect(sch).toMatch(/const rankingTurn = trialKey === 'tree_rank';/);
    expect(sch).toMatch(/const numberCheckText = rankingTurn \?/);
    const ex = fs.readFileSync(new URL("./scheduledPostExecutor.ts", import.meta.url), "utf8");
    expect(ex).toMatch(/treeDesignSegments\(\{ experimentKey: \(post as any\)\.experimentKey, threadsAccountId: Number\(post\.threadsAccountId\)/);
  });
  it("試し専用の検査：見本は通る。ほかのやり方を下げる話・結果の話・本文の案内・呼びかけ始まり・形くずれは作り直し", () => {
    expect(treeDesignProblems("tree_rank", RANK)).toEqual([]);
    expect(treeDesignProblems("tree_qa", QA)).toEqual([]);
    expect(treeDesignProblems("tree_reason", REASON)).toEqual([]);
    const bad = "夕方になると肩が重くなるあなたへ。\n肩こりケアのよくある落とし穴BEST3\n第3位　温めすぎ\n一時的に楽になりますが、根本ではありません。\n第2位　強すぎるマッサージ\n揉み返しでかえって悪くなることも。\n第1位　姿勢を気にしない\n姿勢を見直して楽になったという方が多いです。";
    const p = treeDesignProblems("tree_rank", bad).join("|");
    for (const w of ["根本", "湿布・温める", "やってはいけない", "お客様の結果", "呼びかけ"]) expect(p).toContain(w);
    expect(treeDesignProblems("tree_reason", "無理して予約を急がなくても大丈夫です。\n完全予約制です。\nゆったり受けたい方はぜひ。").join("|")).toMatch(/案内・宣伝.*形が合っていない|形が合っていない/);
    expect(treeDesignProblems("tree_qa", QA + "\nご予約はプロフィールから。").join("|")).toContain("本文の中の案内");
    expect(treeDesignProblems("hook_local", bad)).toEqual([]); // ほかの試し・ふつうの投稿には当てない
    expect(treeDesignProblems(null, bad)).toEqual([]);
  });
  it("1本目で答えを言ってしまった下書きは作り直し（理由型に理由・BEST3 の題名に中身）", () => {
    expect(treeDesignProblems("tree_reason", REASON.replace("あえて最初にお聞きすることが1つあります。", "続けてほしいから、最初に1つお聞きします。")).join("|")).toContain("1行目に理由");
    const leaked = RANK.replace("手軽な順BEST3", "手軽な順BEST3\n1位は深く息を吐くことです。");
    expect(treeDesignProblems("tree_rank", leaked).join("|")).toContain("題名のところに順位の中身");
    const teased = RANK.replace("手軽な順BEST3", "手軽な順BEST3\n1位は、道具がいらないものです。");
    expect(treeDesignProblems("tree_rank", teased)).toEqual([]);
    expect(treeDesignSplit("tree_rank", teased)![0]).toBe("デスクワークの合間にできる肩まわりの動き、手軽な順BEST3\n1位は、道具がいらないものです。");
  });
  it("1本目で原因を言ってしまった下書き・「ラクになります」は作り直し", () => {
    const leak = "夕方になると肩が重くなる。それ、実は腕の使い方が原因かもしれません。\n" + REASON.split("\n").slice(1).join("\n");
    expect(treeDesignProblems("tree_reason", leak).join("|")).toContain("1本目で答え");
    expect(treeDesignProblems("tree_qa", QA + "\n長時間のデスクワークがラクになりますよ。").join("|")).toContain("効果の話");
    expect(treeDesignProblems("tree_qa", "夕方、肩がガチガチになるのはなぜ？\n" + QA.split("\n").slice(1).join("\n"))).toEqual([]);
  });
});
