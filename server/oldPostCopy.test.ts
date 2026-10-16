import { describe, expect, it } from "vitest";
import { findOldPostCopy, oldPostCopyHint, OLD_POST_COPY } from "../shared/oldPostCopy";

// 2026-10-16 夜間整備：acc22 プレステージ様が見送った案（#3727）は、10/11 に公開した #3109 とほぼ同じ文だった
const posted3109 = "プレステージでは、未経験で入社した方が8割以上。\n\n服装の心配はいりません。制服を貸与しますので、安心してスタートできますよ。\n\nどんな制服で働きたいですか？😊\n\n横浜店より。";
const draft3727 = "プレステージでは未経験で入社した方が8割以上。\n制服を貸与しますので、安心してスタートできますよ。\nどんな制服で働きたいですか？\n横浜店より。";

// acc18 #3448 は手直しのお手本（#2916）を一字一句そのまま写していた
const edited2916 = "事故に遭われた方から弁護士や行政書士の紹介、よく聞かれます。\n京都市伏見区で接骨院をしている僕も【安心】を大切にしています。\n困ったときは一人で抱えず、まずはご相談ください。";

describe("少し前の投稿とほぼ同じ文", () => {
  it("見送られた #3727 は 10/11 の #3109 と同じと判定する", () => {
    const m = findOldPostCopy(draft3727, [{ content: posted3109, at: new Date("2026-10-11T03:11:00Z") }]);
    expect(m).not.toBeNull();
    expect(m!.score).toBeGreaterThanOrEqual(OLD_POST_COPY.dropOnLastAttempt);
    expect(oldPostCopyHint(m!)).toContain("10/11の投稿");
  });
  it("手直しのお手本をそのまま写した文は止める", () => {
    expect(findOldPostCopy(edited2916, [{ content: edited2916, at: null }])!.score).toBe(1);
  });
  it("同じ話題を別の言葉で書いたもの（似ている度0.5台）は止めない", () => {
    const a = "運動が続かない人の共通点、3つあります。頑張りすぎ・完璧主義・ひとりでやる。倉敷市玉島でよく聞くお悩みです。まずは週1回から始めてみませんか。";
    const b = "運動が続かない人へ、実は誤解が2つあります。頑張りすぎと、完璧主義。倉敷市玉島では、続けられるペースを一緒に見つけています。";
    expect(findOldPostCopy(a, [{ content: b, at: null }])).toBeNull();
  });
  it("短い投稿は比べない", () => {
    expect(findOldPostCopy("今日も元気に営業中です。", [{ content: "今日も元気に営業中です。", at: null }])).toBeNull();
  });
});
