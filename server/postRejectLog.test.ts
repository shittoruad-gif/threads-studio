/**
 * 作り直しの理由をDBに残す仕組みの番人（2026-09-22）。
 *
 * 夜間整備の手順 §3.45 は「その日に作り直しで落ちた理由を数え、同じ理由で3回落ちて
 * 投稿ゼロになった人がいれば生成側を直す」ことになっている。ところが本番のログは
 * 再デプロイのたびに消えるため（9/19 20時・9/21 01:16 に実際に消えた）、
 * 9/22 未明の整備では6時の生成のログが 09:52 の再デプロイで消えており、1件も数えられなかった。
 *
 * そこで落ちた理由を postRejectLog に残すようにした。このテストは
 * 「理由をDBに残さないまま lastRejectReason だけ書く」書き方に戻ったら落ちる。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(__dirname, "autoPostScheduler.ts"), "utf8");

/** 品質ガードで落ちたときに必ず記録される検査の名前 */
const GUARDS = [
  "voiceGuard",
  "identityGuard",
  "naturalnessReview",
  "healthClaimGuard",
  "fabricatedNumberGuard",
  "angleGuard",
  "duplicatePhrase",
  "duplicateHookNumber",
];

describe("作り直しの理由はDBに残す", () => {
  it("lastRejectReason.set を直に呼ぶ場所は noteReject の中だけ", () => {
    const calls = src.match(/lastRejectReason\.set\(/g) ?? [];
    // ★1つだけ＝noteReject の中の1行。増えていたら、その場所はDBに残していない。
    expect(calls.length).toBe(1);

    const helper = src.slice(src.indexOf("function noteReject("));
    expect(helper.slice(0, 600)).toContain("lastRejectReason.set(");
    expect(helper.slice(0, 600)).toContain("recordPostReject");
  });

  it("すべての検査が noteReject で記録される", () => {
    for (const g of GUARDS) {
      expect(src, `${g} が noteReject に渡されていない`).toContain(`noteReject('${g}'`);
    }
  });

  it("記録の失敗で投稿の生成を止めない（待たない・握りつぶす）", () => {
    const helper = src.slice(src.indexOf("function noteReject("), src.indexOf("function noteReject(") + 900);
    // await せず void で投げっぱなしにし、失敗は catch で捨てる
    expect(helper).toContain("void db");
    expect(helper).toContain(".catch(() => undefined)");
    expect(helper).not.toContain("await db.recordPostReject");
  });

  it("枠を捨てた作り直し（gaveUp）が分かる形で渡っている", () => {
    // 投稿ゼロの追跡に使うので、最後の作り直しで落とす検査は gaveUp を渡す
    for (const g of ["voiceGuard", "identityGuard", "naturalnessReview", "healthClaimGuard", "fabricatedNumberGuard", "duplicatePhrase"]) {
      const at = src.indexOf(`noteReject('${g}'`);
      expect(at, `${g} が見つからない`).toBeGreaterThan(-1);
      expect(src.slice(at, at + 400), `${g} に gaveUp が渡っていない`).toContain("gaveUp");
    }
  });
});

describe("postRejectLog のマイグレーション", () => {
  const sql = readFileSync(join(__dirname, "..", "drizzle", "0093_post_reject_log.sql"), "utf8");

  it("テーブルと、数えるための索引がある", () => {
    expect(sql).toContain("CREATE TABLE `postRejectLog`");
    expect(sql).toContain("idx_postRejectLog_created");
    expect(sql).toContain("idx_postRejectLog_account");
  });

  it("理由（guard）と中身（detail）と枠を捨てたか（gaveUp）を持つ", () => {
    expect(sql).toContain("`guard` varchar(40) NOT NULL");
    expect(sql).toContain("`detail` varchar(255)");
    expect(sql).toContain("`gaveUp` tinyint NOT NULL DEFAULT 0");
  });
});
