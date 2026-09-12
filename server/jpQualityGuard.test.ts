import { describe, it, expect } from "vitest";
import {
  checkNaturalized, hiraganaRatio, endsWithQuestion, countNdesu,
  countEmoji, hasRepeatedEnding, polishPunctuation, findBannedTic, findRepeatedPhrase,
  findRepeatedHookNumber,
  HIRAGANA_RATIO_MAX, NDESU_MAX,
} from "../shared/jpQualityGuard";

/**
 * 検体は2026-08-26に実際に公開されてしまった劣化投稿と、
 * Threads公開検索から収集した人間の投稿（2026-08-27リサーチ）。
 */

const NO_Q = { allowQuestionEnding: false };
const OK_Q = { allowQuestionEnding: true };

describe("findBannedTic（リライト前の文も検査するための単体判定）", () => {
  it("生成本文に混ざった決まり文句を見つける（2026-09-03に公開を検出した経路）", () => {
    expect(findBannedTic("ピラティス、体が硬いと無理だと思っていませんか？")).toBe("いませんか？");
  });

  it("決まり文句が無ければ null", () => {
    expect(findBannedTic("倉敷市玉島で、体が硬い方も通っています。")).toBeNull();
  });
});

describe("実際に起きた劣化の検出", () => {
  it("お手本コピー「同じ悩みの方、いませんか」を落とす", () => {
    const bad = "姿勢を気にしても続かない…と諦めていませんか？\n\n同じ悩みの方、いませんか？";
    expect(checkNaturalized(bad, "元の文です。", OK_Q).ok).toBe(false);
  });

  it("「正直、」の口癖を落とす", () => {
    const bad = "営業13年で気づいたこと。\n\n正直、その場だけの揉みほぐしでは変わりません。";
    expect(checkNaturalized(bad, "営業13年で気づいたこと。", NO_Q).ok).toBe(false);
  });

  it("同意確認の「いませんか？」を落とす（人間の投稿では出現ゼロ）", () => {
    const bad = "運動が続かない…って方もいますか？と思ったら、同じ悩みの方いませんか？";
    expect(checkNaturalized(bad, "元の文。", OK_Q).ok).toBe(false);
  });

  it("「思っていませんか」「気になりませんか」を落とす", () => {
    for (const phrase of ["きつい運動が良いと思っていませんか？", "ピラティス、気になりませんか？"]) {
      expect(checkNaturalized(phrase, "元の文。", OK_Q).ok).toBe(false);
    }
  });

  it("「んです」系の3連発を落とす（実際の劣化投稿の形）", () => {
    const bad =
      "ジムが続かなかった方、諦めるのはまだ早いんです！\n" +
      "運動嫌いだった人も変わってるんですよ。\n" +
      "無理なく続けられるからなんです";
    expect(countNdesu(bad)).toBeGreaterThan(NDESU_MAX);
    expect(checkNaturalized(bad, "元の文。", NO_Q).ok).toBe(false);
  });

  it("ひらがなに開きすぎた文を落とす", () => {
    const bad = "からだがかたいとおもっているあなたへ。むりなくつづけられるので、こわがらなくてもだいじょうぶですよ。きょうからいっしょにはじめてみませんか。";
    expect(hiraganaRatio(bad)).toBeGreaterThan(HIRAGANA_RATIO_MAX);
    expect(checkNaturalized(bad, "元の文。", OK_Q).ok).toBe(false);
  });

  it("言い切りだった締めを問いかけに書き換えたら落とす", () => {
    const original = "揉むだけでは戻ります。原因は姿勢にあります。";
    const rewritten = "揉むだけでは戻ります。原因、気になりますよね？";
    expect(checkNaturalized(rewritten, original, NO_Q).ok).toBe(false);
  });
});

describe("リライトによる悪化の検出（元との比較）", () => {
  it("元に無い「実は」を接ぎ木したら落とす", () => {
    const original = "体が硬い方こそピラティスが向いています。マシンが支えるからです。";
    const rewritten = "実は、体が硬い方こそピラティスが向いています。マシンが支えるからです。";
    expect(checkNaturalized(rewritten, original, NO_Q).ok).toBe(false);
  });

  it("元から「実は」がある文はそのまま通る（不安をほどく型で正当に使う）", () => {
    const original = "体が硬いとできないと思われがち。実は逆で、マシンが支えてくれます。";
    const rewritten = "体が硬いとできない？実は逆で、マシンが支えてくれます。";
    expect(checkNaturalized(rewritten, original, OK_Q).ok).toBe(true);
  });

  it("装飾絵文字✨💦を勝手に足したら落とす", () => {
    const original = "国家資格者が丁寧に見ます。";
    expect(checkNaturalized("国家資格者が丁寧に見ます✨", original, NO_Q).ok).toBe(false);
    expect(checkNaturalized("国家資格者が丁寧に見ます💦", original, NO_Q).ok).toBe(false);
  });

  it("「！」を2個以上増やしたら落とす", () => {
    const original = "今日から始められます。";
    expect(checkNaturalized("今日から始められます！誰でも！すぐに！", original, NO_Q).ok).toBe(false);
    expect(checkNaturalized("今日から始められます！", original, NO_Q).ok).toBe(true);
  });

  it("同じ語尾の連続をリライトが作ったら落とす", () => {
    const original = "肩の重さは姿勢から来ます。座り方を少し変えるだけで違います。";
    const rewritten = "肩の重さは姿勢から来ています。座り方を変えるだけで変わってきています。デスクワークでも楽になってきています。";
    expect(hasRepeatedEnding(rewritten)).toBe(true);
    expect(checkNaturalized(rewritten, original, NO_Q).ok).toBe(false);
  });
});

describe("自然な文は通す（人間の実投稿）", () => {
  const humanPosts = [
    "倉敷で根本的に姿勢改善できるところありますか？整体とかじゃなくて、体の分析と使い方教えてもらえるところに行きたいです。3ヶ月後結婚式なので、猫背治したくて…",
    "ピラティス月4回9000円って高いの？\nもう高いか安いかわからん\n相場しらなさすぎてw",
    "パーソナルピラティス（姿勢評価〜体験）が3,000円で受けられるのは8/23(日)です！！\n最初で最後の試み。\n30分で完結させますので🫡",
    "長年通ってる美容院。明日予約してるけどこんな連絡が来た。キャンセルしていいかな？",
  ];
  it("人間の投稿はすべて合格する", () => {
    for (const p of humanPosts) {
      const v = checkNaturalized(p, p, OK_Q);
      expect(v.ok, `${p.slice(0, 20)}… が不合格: ${v.reason}`).toBe(true);
    }
  });

  it("ごく短い体言止め・余韻も通る", () => {
    const p = "最初で最後の試み。\n夏休み最後、30分で完結させます🫡";
    expect(checkNaturalized(p, p, NO_Q).ok).toBe(true);
  });
});

describe("句読点の整形（唯一の決定的書き換え）", () => {
  it("「。」+絵文字の句点を落とす", () => {
    expect(polishPunctuation("丁寧に指導しますね。✨")).toBe("丁寧に指導しますね✨");
    expect(polishPunctuation("楽になったと喜ばれています。😊\n次の文です。")).toBe("楽になったと喜ばれています😊\n次の文です。");
  });

  it("絵文字が無い文は変えない", () => {
    const t = "揉むだけでは戻ります。原因は姿勢にあります。";
    expect(polishPunctuation(t)).toBe(t);
  });

  it("日本語の記号（→・※）には触らない", () => {
    const t = "うつ伏せ→仰向けの順です。※ご相談ください。";
    expect(polishPunctuation(t)).toBe(t);
  });
});

describe("部品の単体動作", () => {
  it("countEmoji が日本語文字を数えない", () => {
    expect(countEmoji("整体で体を整える。")).toBe(0);
    expect(countEmoji("嬉しい😊✨")).toBe(2);
  });

  it("endsWithQuestion は絵文字付きの問いかけも判定する", () => {
    expect(endsWithQuestion("どこが気になりますか？😊")).toBe(true);
    expect(endsWithQuestion("今日から始めます😊")).toBe(false);
  });
});

/**
 * 2026-09-09 実測。香取様（@shin_honetugi）が5本続けて「✕ 違う」を付け、
 * うち4本をご自身で見送られた。切り口は毎回違うのに、書き出しの決め台詞だけが
 * 毎回同じだった。生成側が自分の直近の投稿を見ていなかったのが原因。
 */
describe("直近の投稿の使い回しを見つける（2026-09-10）", () => {
  const 直近 = [
    "痛い場所だけ揉んでも、なかなか良くならないんです。\n\n根本原因は別の場所にあることが多い。\n整形外科で11年勤務した経験から、しっかりサポートします。",
    "スポーツの秋。ケガで悩む人の勘違い3つ。\n\n痛い場所だけ揉んでも、なかなか良くならないんです。\n昔の私もそうだった😅",
  ];

  it("実際に✕が付いた5本に共通していた一節を拾う", () => {
    const 新しい下書き = "スポーツのケガ、痛い場所だけ揉んでも、なかなか良くならないんです。\n\n昔の私もそうでした😅";
    const dup = findRepeatedPhrase(新しい下書き, 直近);
    expect(dup).not.toBeNull();
    expect(dup).toContain("痛い場所だけ揉んでも");
  });

  it("句読点・絵文字の違いは吸収する（「、」を抜いても同じ使い回し）", () => {
    expect(findRepeatedPhrase("痛い場所だけ揉んでもなかなか良くならないんです✨", 直近)).not.toBeNull();
  });

  it("同じ業種の言葉が少し重なるだけでは止めない（誤爆させない）", () => {
    expect(findRepeatedPhrase("肩こりの原因は姿勢にあることが多いです。今日は座り方の話を。", 直近)).toBeNull();
    expect(findRepeatedPhrase("スポーツの秋ですね。", 直近)).toBeNull();
  });

  it("直近の投稿が無ければ何も止めない", () => {
    expect(findRepeatedPhrase("痛い場所だけ揉んでも、なかなか良くならないんです。", [])).toBeNull();
  });

  it("短い下書きで誤爆しない", () => {
    expect(findRepeatedPhrase("こんにちは", 直近)).toBeNull();
  });
});

describe("使い回し判定の強化（2026-09-11 香取様）", () => {
  const 直近 = [
    "痛い場所だけ揉んでも、なかなか良くならないんです。\n根本原因は別の場所にあることが多い。",
    "スポーツのケガ、痛い場所だけ揉んでも良くならない。\n昔の私もそうでした。",
  ];
  it("10文字の決め台詞「痛い場所だけ揉んでも」を拾う", () => {
    expect(findRepeatedPhrase("整形外科で11年勤務していました。\n痛い場所だけ揉んでも、根本は変わりません。", 直近)).toBe("痛い場所だけ揉んでも");
  });
  it("ひらがなだけの一致（挨拶・語尾）は拾わない", () => {
    expect(findRepeatedPhrase("いつもありがとうございます。今日も一日よろしくお願いします。", ["ありがとうございます。よろしくお願いします。"])).toBeNull();
  });
  it("別の話題なら通る", () => {
    expect(findRepeatedPhrase("土浦市神立の整骨院です。夜21時まで営業しているので、仕事帰りにも通えます。", 直近)).toBeNull();
  });
});

describe("使い回し判定：店名・地名は外して比べる（2026-09-11 みらい整体院様）", () => {
  it("店名を外せば、店名だけが共通の2本は使い回しにならない", () => {
    const strip = (t: string) => t.split("金沢市のみらい整体院接骨院").join(" ");
    const recent = ["金沢市のみらい整体院接骨院です。今日は骨盤の話。"];
    expect(findRepeatedPhrase("金沢市のみらい整体院接骨院より。食事の順番を変えるだけで違います。", recent)).not.toBeNull();
    expect(findRepeatedPhrase(strip("金沢市のみらい整体院接骨院より。食事の順番を変えるだけで違います。"), recent.map(strip))).toBeNull();
  });
});

/**
 * 2026-09-13 香取様。「ここ数日は同じ内容でしたので自身で投稿しておりました」という
 * ご連絡（supportQuestions #30）に対し、9/11 に入れた findRepeatedPhrase（10文字の一致）は
 * 実際の5本を1件も拾えなかった。一字一句は違うのに、書き出しが毎回「11年」で始まっていた。
 * 実物をそのまま置いて、再発したら落ちるようにする。
 */
describe("書き出しの実績の数字の繰り返し（2026-09-13 香取様）", () => {
  const 本物 = [
    "11年勤務して気づいた、スポーツのケガでよくある勘違い3つ。\n痛いのに「これくらい大丈夫」と我慢する。その気持ち、よく分かります。",
    "「予約は必要ですか？」とよく聞かれます。\n土浦市神立中央の当院は予約優先制です。\n急なケガも対応します。",
    "茨城県土浦市でスポーツのケガを見て11年。\n痛む場所だけ触っても、根本は変わりません。",
    "整形外科で11年勤務して分かった、スポーツの怪我で一番大切なこと。\n痛む場所だけでなく、根本原因を見つけることです。",
    "スポーツのケガは「動くと悪化する」と思われがちです。\n土浦市で外傷専門の私が、早期回復をサポートします。",
  ];

  it("従来の一致判定では1本も拾えない（この抜けを埋めるための判定）", () => {
    for (let i = 1; i < 本物.length; i++) {
      expect(findRepeatedPhrase(本物[i], 本物.slice(0, i))).toBeNull();
    }
  });

  it("同じ「11年」で書き出した2本・3本目を拾う", () => {
    expect(findRepeatedHookNumber(本物[2], [本物[0]])).toBe("11年");
    expect(findRepeatedHookNumber(本物[3], [本物[0], 本物[2]])).toBe("11年");
  });

  it("数字で書き出していない投稿は拾わない", () => {
    expect(findRepeatedHookNumber(本物[1], [本物[0]])).toBeNull();
    expect(findRepeatedHookNumber(本物[4], 本物.slice(0, 4))).toBeNull();
  });

  it("違う数字なら通す", () => {
    expect(findRepeatedHookNumber("開業3年目に見えてきたことがあります。", [本物[0]])).toBeNull();
  });

  it("書き出しから離れた場所（45字より後ろ）の数字は見ない", () => {
    const 後ろに数字 = "秋は気圧の変化で体調をくずす方が増えます。寝る前のひと呼吸だけでも違うので、週末の過ごし方をひとつご紹介します。ちなみに私は整形外科で11年勤務していました。";
    expect(findRepeatedHookNumber(後ろに数字, [本物[0]])).toBeNull();
  });

  it("直近が無ければ何もしない", () => {
    expect(findRepeatedHookNumber(本物[0], [])).toBeNull();
  });
});
