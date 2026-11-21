import { describe, it, expect } from "vitest";
import { maskRankLabels, RANKING_TREE, RANKING_TRIAL, RANKING_TRIAL_KEY, inRankingTree, isRankingSlot, rankingArm, rankingLines, rankingSplit } from "../shared/rankingTree";

const at = (ymd: string, h = 12) => Date.parse(`${ymd}T${String(h).padStart(2, "0")}:00:00+09:00`);
const SAMPLE = [
  "デスクワークの合間にできる肩まわりの動き、手軽な順BEST3",
  "",
  "第3位　肩をすくめてストンと落とす",
  "座ったまま3回でできます。",
  "",
  "第2位　両手を後ろで組んで胸をひらく",
  "画面を見続けたあとに向いています。",
  "",
  "第1位　深く息を吐く",
  "道具も場所もいりません。",
  "まずはここからで十分です。",
].join("\n");

describe("ランキング型の試し", () => {
  it("対象は学習用の3アカウントだけ・期間の両端を含む", () => {
    expect(RANKING_TREE.accountIds).toEqual([10, 12, 36]);
    expect(inRankingTree(10, at(RANKING_TREE.start, 0))).toBe(true);
    expect(inRankingTree(12, at(RANKING_TREE.until, 23))).toBe(true);
    expect(inRankingTree(36, at("2026-12-13", 0))).toBe(false);
    expect(inRankingTree(10, at("2026-11-21", 23))).toBe(false);
    expect(inRankingTree(11, at(RANKING_TREE.start))).toBe(false);
    expect(inRankingTree(33, at(RANKING_TREE.start))).toBe(false);
  });
  it("枠は上乗せの1本目だけ。上乗せが無い日・契約の枠・最後の枠は対象外", () => {
    const now = at(RANKING_TREE.start);
    expect(isRankingSlot(10, 3, 3, 5, now)).toBe(true);
    expect(isRankingSlot(10, 2, 3, 5, now)).toBe(false);
    expect(isRankingSlot(10, 4, 3, 5, now)).toBe(false);
    expect(isRankingSlot(10, 3, 3, 3, now)).toBe(false);
    expect(isRankingSlot(33, 3, 3, 5, now)).toBe(false);
  });
  it("id の偶奇で交互", () => {
    expect(rankingArm(7001)).toBe("tree");
    expect(rankingArm(7002)).toBe("single");
  });
  it("順位の切れ目で3本に分ける。元の文は変えず、足すのは次の順位の予告だけ", () => {
    const parts = rankingSplit(SAMPLE)!;
    expect(parts).toHaveLength(3);
    expect(parts[0].startsWith("デスクワークの合間に")).toBe(true);
    expect(parts[0].endsWith("第2位は、")).toBe(true);
    expect(parts[1].startsWith("第2位　両手を")).toBe(true);
    expect(parts[1].endsWith("第1位は、")).toBe(true);
    expect(parts[2].startsWith("第1位　深く息を吐く")).toBe(true);
    const strip = (s: string) => s.replace(/\n\n第[12]位は、$/, "");
    const rejoined = parts.map(strip).join("\n").replace(/\n+/g, "\n");
    expect(rejoined).toBe(SAMPLE.replace(/\n+/g, "\n"));
  });
  it("分けられない本文は null（1本のまま出す）", () => {
    expect(rankingSplit("ふつうの投稿です。\n順位はありません。")).toBeNull();
    expect(rankingSplit(SAMPLE.replace("第2位", "2つ目"))).toBeNull();
    expect(rankingSplit(SAMPLE.split("\n").slice(2).join("\n"))).toBeNull(); // 題名なし
    expect(rankingSplit(SAMPLE + "\n第1位　もう1つ")).toBeNull(); // 同じ順位が2回
    const swapped = SAMPLE.replace("第3位", "第X位").replace("第1位", "第3位").replace("第X位", "第1位");
    expect(rankingSplit(swapped)).toBeNull(); // 順番が逆
    expect(rankingLines("本文の途中に第3位と書いても行の先頭でなければ数えない")).toBeNull();
  });
  it("全角の数字でも読める", () => {
    expect(rankingSplit(SAMPLE.replace("第3位", "第３位").replace("第1位", "第１位"))).not.toBeNull();
  });
  it("指示：数えた結果に見える基準・宣伝・提供していないメニューを書かせない", () => {
    expect(RANKING_TRIAL.key).toBe(RANKING_TRIAL_KEY);
    expect(RANKING_TRIAL.note).toContain("BEST3");
    expect(RANKING_TRIAL.note).toContain("数えた結果に見える基準にしない");
    expect(RANKING_TRIAL.note).toContain("提供していないメニュー");
    expect(RANKING_TRIAL.note).toContain("宣伝");
  });
  it("お客様のアカウントでは公開の分け方が動かない（執行側は学習用の番号と目印の両方を見る）", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync(new URL("./scheduledPostExecutor.ts", import.meta.url), "utf8");
    expect(src).toMatch(/experimentKey === RANKING_TRIAL_KEY && RANKING_TREE\.accountIds\.includes\(Number\(post\.threadsAccountId\)\)/);
    const sch = fs.readFileSync(new URL("./autoPostScheduler.ts", import.meta.url), "utf8");
    expect(sch).toMatch(/rt\.isRankingSlot\(account\.id, i, contractCount, postCount\)/);
  });
  it("数字の検査から外すのは順位の表記だけ。人数・割合・途中の順位は残る", () => {
    const m = maskRankLabels(SAMPLE + "\n3人に1人が知りません。\n人気3位のメニューです。");
    expect(m).not.toMatch(/第[123]位/);
    expect(m).not.toMatch(/BEST3/);
    expect(m).toContain("3回でできます");
    expect(m).toContain("3人に1人");
    expect(m).toContain("人気3位");
  });
});
