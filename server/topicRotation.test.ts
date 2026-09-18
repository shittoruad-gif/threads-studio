import { describe, it, expect } from "vitest";
import { splitTopics, pickRotatingTopic } from "../shared/topicRotation";
import { generateThreadsPrompt } from "../shared/threadsPrompts";

/**
 * 登録された悩み・強みを日替わりで取り上げる（2026-09-14）。
 * 直近30日の ✕ 24本のうち17本が2名に集中し、どちらも「毎回いちばん上の1つだけ」が原因だった。
 */
describe("今日取り上げる悩み・強みを選ぶ", () => {
  // 香取様（userId 3500）の実際の登録内容
  const katori = "スポーツによる腰痛や膝の痛み、ケガ（捻挫、肉離れ、突き指）\n慢性的な腰痛、膝痛、首肩の痛み\n交通事故後の身体の痛み";
  // 岩根様（userId 5443）の実際の登録内容
  const iwane = "本物の正絹の着物を扱っている。\n\nお茶をされている方に、\nお琴をされている方に、\n踊りをされている方に、\n購入して頂いて";

  it("改行で分かれた悩みを、それぞれ取り出す", () => {
    const t = splitTopics(katori);
    expect(t.length).toBe(3);
    expect(t[2]).toBe("交通事故後の身体の痛み");
  });

  it("日ごとに順番に変わる（3日で一巡して戻る）", () => {
    const seen = [0, 1, 2, 3].map((i) => pickRotatingTopic(katori, i));
    expect(new Set(seen.slice(0, 3)).size).toBe(3); // 3日で3つとも出る
    expect(seen[3]).toBe(seen[0]);                  // 4日目で先頭に戻る
  });

  it("1つしか登録が無い方には何もしない（今までどおり）", () => {
    expect(pickRotatingTopic("敷居が高いと思われている？", 0)).toBe("");
    expect(pickRotatingTopic("", 3)).toBe("");
    expect(pickRotatingTopic(null, 1)).toBe("");
  });

  it("箇条書きの記号・番号は落とす", () => {
    expect(splitTopics("・慢性的な肩こり\n・繰り返す腰痛\n1. 産後の骨盤")).toEqual(
      ["慢性的な肩こり", "繰り返す腰痛", "産後の骨盤"],
    );
  });

  it("同じ項目は1つにまとめ、短すぎるものは拾わない", () => {
    expect(splitTopics("慢性的な肩こり\n慢性的な肩こり。\nはい")).toEqual(["慢性的な肩こり"]);
  });

  it("文の途中で折り返しただけの文章は、日替わりにしない", () => {
    // 岩根様の「強み」は1つの文が改行で折り返されている。ここを項目として取り出すと
    // 「今日使う強みは『購入して頂いて』」という無茶な指示になってしまう。
    expect(splitTopics(iwane)).toEqual([]);
    expect(pickRotatingTopic(iwane, 0)).toBe("");
  });

  it("読点で終わる行も、それ1つで完結していれば項目として扱う", () => {
    // 氷見様（userId 2907）の悩みの1行目。読点で終わるが「〜方、」で1項目として完結している。
    const himi = "今まで、何をやっても良くならなかった方、何処へ行っても良くならなかった方、手術を勧められた方、\n自律神経の乱れ・不眠\n膝の痛み\n繰り返す腰痛、坐骨神経痛、椎間板ヘルニア";
    expect(splitTopics(himi).length).toBe(4);
    expect(pickRotatingTopic(himi, 1)).toBe("自律神経の乱れ・不眠");
  });

  it("1項目の中の読点では切らない", () => {
    // 「腰痛や膝の痛み、ケガ（捻挫、肉離れ、突き指）」で1つの悩み
    expect(splitTopics(katori)[0]).toBe("スポーツによる腰痛や膝の痛み、ケガ（捻挫、肉離れ、突き指）");
    expect(splitTopics("スポーツのケガに強い、夜２１時まで営業、院長の経験豊富").length).toBe(1);
  });

  it("指定した悩みがプロンプトに「今日の主題」として入る", () => {
    const p = generateThreadsPrompt({
      businessType: "整骨院", area: "茨城県土浦市",
      target: "スポーツをする学生", mainProblem: katori, strength: "夜21時まで営業",
      focusProblem: "交通事故後の身体の痛み",
      postType: "hook_tree", treeCount: 0,
    } as any);
    expect(p).toContain("今日この1本で取り上げる悩み：交通事故後の身体の痛み");
    expect(p).toContain("他の悩みは今日は書かない");
  });

  it("指定が無ければ、その行はプロンプトに出ない", () => {
    const p = generateThreadsPrompt({
      businessType: "整骨院", area: "茨城県土浦市",
      target: "スポーツをする学生", mainProblem: katori, strength: "夜21時まで営業",
      postType: "hook_tree", treeCount: 0,
    } as any);
    expect(p).not.toContain("今日この1本で取り上げる悩み");
  });
});

/**
 * 2026-09-18 夜間整備。岩根様（userId 5443）は直近30日で✕13本・○1本と最も悪く、
 * night-todo には「登録内容そのものが薄い＝材料を足していただくのが本筋」と記録されていた。
 * 実データを見たところ、それは**誤り**だった。
 *   ・悩み＝1行、強み＝文の折り返しで項目に分けられない → ここまでは記録どおり
 *   ・しかし N1顧客像には「園遊会に招待された方へ誂えた」「文化勲章の授賞式に参列される方へ誂えた」など
 *     はっきり分かれた7行の良い材料が入っていた
 * 日替わりの指定が「悩み」と「強み」にしか無かったため、この7行は1本も使われず、
 * 投稿はどれも「敷居が高い」＋「本物の正絹」＋「創業130年」の繰り返しになっていた。
 */
describe("N1顧客像も日替わりで取り上げる（2026-09-18）", () => {
  const 岩根様のN1 =
    "園遊会に招待された方へ誂えた\n" +
    "文化勲章の授賞式に参列される方へ誂えた\n" +
    "講演会で登壇された方へ誂えた\n" +
    "海外訪問へ行かれる際に誂えた\n" +
    "お茶席の方へ誂えた\n" +
    "お琴の発表会の方へ誂えた\n" +
    "同窓会へお出掛けの方へ誂えた";

  it("7行すべてが項目として取り出せる", () => {
    expect(splitTopics(岩根様のN1)).toHaveLength(7);
  });

  it("日が変わると、ちがうお客様が選ばれる", () => {
    const picks = [0, 1, 2, 3, 4, 5, 6].map((i) => pickRotatingTopic(岩根様のN1, i));
    expect(new Set(picks).size).toBe(7);
    expect(picks[0]).toBe("園遊会に招待された方へ誂えた");
    expect(picks[1]).toBe("文化勲章の授賞式に参列される方へ誂えた");
    // 一周したら先頭に戻る
    expect(pickRotatingTopic(岩根様のN1, 7)).toBe(picks[0]);
  });

  it("1行しか登録が無い方には、今までどおり指定しない", () => {
    // プレステージ様（userId 4667）は本当にどの欄も1項目で、材料を足していただくほかない
    expect(pickRotatingTopic("美容が好き/人にマッサージするのが好き/キレイになりたい", 0)).toBe("");
    expect(pickRotatingTopic("敷居が高いと思われている？", 0)).toBe("");
  });
});

/**
 * 2026-09-18 昼。本番データで実測したところ、N1顧客像の指数に purposeIndex だけを使っていたため
 * 0〜3 の4通りしか取らず、岩根様の7行のうち4行しか回っていなかった。
 * 指数を postTypeIndex * 4 + purposeIndex（0〜23）にして、7行すべてが回ることを確かめる。
 */
describe("N1顧客像の指数は7行すべてを回る（2026-09-18 昼の修正）", () => {
  const n1 = [
    "園遊会に招待された方へ誂えた", "文化勲章の授賞式に参列される方へ誂えた", "講演会で登壇された方へ誂えた",
    "海外訪問へ行かれる際に誂えた", "お茶席の方へ誂えた", "お琴の発表会の方へ誂えた", "同窓会へお出掛けの方へ誂えた",
  ].join("\n");
  const PURPOSES = 4, POST_TYPES = 6;
  const idx = (typeIdx: number, purposeIdx: number) => typeIdx * PURPOSES + purposeIdx;

  it("purposeIndex だけだと4行しか出ない（直す前の姿）", () => {
    const picks = new Set([0, 1, 2, 3].map((p) => pickRotatingTopic(n1, p)));
    expect(picks.size).toBe(4);
  });

  it("組み合わせた指数なら7行すべてが出る", () => {
    const picks = new Set<string>();
    let t = 0, p = 0;
    for (let post = 0; post < 24; post++) {
      picks.add(pickRotatingTopic(n1, idx(t, p)));
      t = (t + 1) % POST_TYPES;
      p = (p + 1) % PURPOSES;
    }
    expect(picks.size).toBe(7);
  });

  it("連続する2本で、同じお客様が続けて出ない", () => {
    let t = 0, p = 0, prev = "";
    for (let post = 0; post < 12; post++) {
      const cur = pickRotatingTopic(n1, idx(t, p));
      expect(cur).not.toBe(prev);
      prev = cur;
      t = (t + 1) % POST_TYPES;
      p = (p + 1) % PURPOSES;
    }
  });
});
