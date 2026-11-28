import { describe, it, expect } from "vitest";
import { recruitingLocalMissing, recruitingLocalTalkAllowed, recruitingLocalNote, dropRecruitDenials, appendRecruitEntry, prependRecruitCall, RECRUIT_CALL_STRIP_WORDS } from "../shared/recruitingPost";

describe("地元の人に届ける求人：求人だとひと目で分かる形（2026-11-25）", () => {
  it("「求人っぽくない」と言われた投稿は、3つのうち条件と入口が足りない", () => {
    const weak = "倉敷で夜のお仕事に興味があっても、\n人間関係が不安な方もいると思います。\nREVIVEは、上下関係やルールが厳しくありません。\n自分らしく楽しく働ける場所です。\nお友達と一緒の応募も大歓迎です。";
    const miss = recruitingLocalMissing(weak);
    expect(miss.length).toBeGreaterThanOrEqual(2);
    expect(miss.join()).toMatch(/条件/);
  });
  it("募集の一文・条件・入口がそろえば通る（お手本の形）", () => {
    const good = "倉敷駅の近くのBARで、一緒に働いてくれるスタッフさんを募集しています♡\n週1日から、Tシャツやパーカーでの出勤もOKです。\nまずは体験入店だけでも、気軽にDMくださいね♪";
    expect(recruitingLocalMissing(good)).toEqual([]);
  });
  it("地元の会話は連携から14日は出さない・その後も直近2本にあれば出さない", () => {
    expect(recruitingLocalTalkAllowed(3, [])).toBe(false);
    expect(recruitingLocalTalkAllowed(13, ["reassurance", "reassurance"])).toBe(false);
    expect(recruitingLocalTalkAllowed(14, ["reassurance", "reassurance"])).toBe(true);
    expect(recruitingLocalTalkAllowed(20, ["reassurance", "local_talk"])).toBe(false);
    expect(recruitingLocalTalkAllowed(20, ["local_talk"])).toBe(false);
  });
  it("指示に3つの必須が入る（募集の回でも、そうでない回でも）", () => {
    for (const offer of [true, false]) {
      const n = recruitingLocalNote(["倉敷"], offer);
      expect(n).toMatch(/毎回この3つを必ず入れる/);
      expect(n).not.toMatch(/募集の呼びかけで締めない/);
    }
  });
  it("「募集」という言葉が無い投稿は作り直す（2026-11-28「求人募集してます！というワードがあると分かりやすい」）", () => {
    const soft = "服装が自由だと、働くのが楽しいです。\nTシャツやパーカーで出勤OK。\n小さなお店で、一緒に働きませんか。\n質問だけでもDMくださいね。";
    expect(recruitingLocalMissing(soft).join()).toMatch(/募集/);
    expect(recruitingLocalMissing("求人募集しています！\n" + soft)).toEqual([]);
  });
  it("登録の条件を打ち消す行は落とす（条件そのものの「ありません」は残す）", () => {
    const bad = "友達と一緒の応募は受け付けておりません。\n駅近くのお店で、スタッフさんを募集しています。\nノルマや無理な営業はありません。\n質問だけでもDMで声をかけてくださいね。";
    const d = dropRecruitDenials(bad);
    expect(d.dropped).toEqual(["友達と一緒の応募は受け付けておりません。"]);
    expect(d.text).toContain("ノルマや無理な営業はありません。");
    expect(d.text.startsWith("駅近くのお店で")).toBe(true);
    const ok = "スタッフさんを募集しています。\nお友達同士の応募もOKです。";
    expect(dropRecruitDenials(ok)).toEqual({ text: ok, dropped: [] });
  });
  it("募集の回は、新しいお店だと分かる事実を入れる指示が付く。打ち消しの文は毎回禁じる", () => {
    expect(recruitingLocalNote(["倉敷"], true)).toMatch(/オープンして間もない/);
    expect(recruitingLocalNote(["倉敷"], false)).not.toMatch(/オープンして間もない/);
    for (const offer of [true, false]) expect(recruitingLocalNote(["倉敷"], offer)).toMatch(/受け付けておりません/);
  });
  it("入口の一言が無いときだけ、登録の案内の一言を末尾に足す", () => {
    const t = "駅近くのお店で、スタッフさんを募集しています。\n堅苦しいルールはありません。";
    expect(appendRecruitEntry(t, ["質問だけでもお気軽にDMください"])).toBe(t + "\n質問だけでもお気軽にDMください。");
    expect(appendRecruitEntry(t, [])).toBe(t);
    expect(appendRecruitEntry(t, ["https://example.com からDM"])).toBe(t);
    const has = t + "\nまずは体験入店だけでも。";
    expect(appendRecruitEntry(has, ["質問だけでもお気軽にDMください"])).toBe(has);
  });
  it("「募集」の言葉が無いときだけ、1行目に一言足す。その一言は重なりの比べから外す言葉に入っている", () => {
    expect(prependRecruitCall("9月にオープンしたお店です。\n一緒に盛り上げていきましょう。")).toBe("求人募集してます！\n9月にオープンしたお店です。\n一緒に盛り上げていきましょう。");
    const has = "スタッフさん募集中です。\n週1日からOKです。";
    expect(prependRecruitCall(has)).toBe(has);
    expect(RECRUIT_CALL_STRIP_WORDS).toContain("求人募集してます");
  });
});
