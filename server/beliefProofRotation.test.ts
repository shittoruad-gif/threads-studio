import { describe, it, expect } from "vitest";
import { usedInRecentPosts, pickRotatingTopic } from "../shared/topicRotation";

/**
 * 信条（belief）と実績（proof）が毎回そのまま投稿に出て、重複ガードに弾かれ続けていた（2026-09-21）。
 *
 * 香取様（acc21・light_campaign・1日1件）の本番データ：
 *   - 直近14日で公開できたのは1本だけ（見送り11・Threads削除2）
 *   - 9/21 は4回とも差し戻されて公開ゼロ
 *       1回目「書き出しが直近の投稿と同じ実績の数字『11年』」
 *       2回目 naturalnessReview 2/5
 *       3回目「直近の投稿と同じ言い回し『痛い場所だけ揉んでも良くならない』」
 *       4回目（保証パス）naturalnessReview 2/5
 *
 * 原因は、お店の情報にこう登録されていたこと：
 *   信条「痛い場所をマッサージするだけでは良くなりません。昔はマッサージばかりやっていた。」
 *   実績「整形外科で11年勤務／学会で11年連続で発表」
 * 悩み・強み・N1は日替わりで回していたのに、この2つだけは回さず、
 * さらに信条には「投稿に一貫してにじませる」という強い指示が付いていた。
 */

// 香取様のお店の情報（本番の実データ）
const BELIEF = "痛い場所をマッサージするだけでは良くなりません。\n昔はマッサージばかりやっていた。";
const PROOF = "整形外科で11年勤務\n学会で11年連続で発表";

// 香取様の直近の投稿（本番の実データ）
const RECENT = [
  "痛い場所をマッサージしても、また戻る。 土浦市神立中央の当院では、根本原因にアプローチします。 昔の私もマッサージばかりでした。",
  "土浦市神立中央1丁目で、その腰痛は諦めなくていいです。 痛い場所だけ揉んでも、一時的になりがちです。 昔の私もマッサージばかりしていました。",
  "整形外科で11年勤務して分かった、スポーツの怪我で一番大切なこと。 痛む場所だけでなく、根本原因を見つけることです。",
];

describe("信条・実績を毎日そのまま渡さない（2026-09-21・香取様の実データ）", () => {
  it("信条が直近の投稿ですでに使われていることを見つける", () => {
    expect(usedInRecentPosts(BELIEF, RECENT)).toBe(true);
  });

  it("実績が直近の投稿ですでに使われていることを見つける", () => {
    expect(usedInRecentPosts(PROOF, RECENT)).toBe(true);
  });

  it("まだ使っていない材料は「使われている」と判定しない", () => {
    // 香取様のN1顧客像（本番の実データ）。ここから書けば重複しない
    const n1 = "小学生が足を捻って我慢していたが、当院に来てエコー観察したら骨折があった";
    expect(usedInRecentPosts(n1, RECENT)).toBe(false);
    expect(usedInRecentPosts("夜21時まで営業", RECENT)).toBe(false);
  });

  it("直近の投稿が無いときは何も外さない（初日のお客様）", () => {
    expect(usedInRecentPosts(BELIEF, [])).toBe(false);
  });

  it("空・未登録のときは何もしない", () => {
    expect(usedInRecentPosts(null, RECENT)).toBe(false);
    expect(usedInRecentPosts("", RECENT)).toBe(false);
    expect(usedInRecentPosts("   ", RECENT)).toBe(false);
  });

  it("業種や地域の言葉だけでは「使われている」にしない（誤爆させない）", () => {
    // 「整骨院」「土浦市」は毎回出てよい言葉。これだけで外れてしまうと材料が消える
    expect(usedInRecentPosts("整骨院", RECENT)).toBe(false);
    expect(usedInRecentPosts("土浦市", RECENT)).toBe(false);
  });

  it("信条・実績が複数行あるときは日替わりで1つになる", () => {
    const a = pickRotatingTopic(BELIEF, 0);
    const b = pickRotatingTopic(BELIEF, 1);
    expect(a).not.toBe("");
    expect(b).not.toBe("");
    expect(a).not.toBe(b);
    expect(pickRotatingTopic(PROOF, 0)).toBe("整形外科で11年勤務");
    expect(pickRotatingTopic(PROOF, 1)).toBe("学会で11年連続で発表");
  });

  it("1行しか登録が無い方は今までどおり（回さない）", () => {
    expect(pickRotatingTopic("整形外科で11年勤務", 0)).toBe("");
    expect(pickRotatingTopic("整形外科で11年勤務", 3)).toBe("");
  });
});
