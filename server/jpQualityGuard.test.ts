import { describe, it, expect } from "vitest";
import {
  checkNaturalized, hiraganaRatio, endsWithQuestion, countNdesu,
  countEmoji, hasRepeatedEnding, polishPunctuation,
  HIRAGANA_RATIO_MAX, NDESU_MAX,
} from "../shared/jpQualityGuard";

/**
 * 検体は2026-08-26に実際に公開されてしまった劣化投稿と、
 * Threads公開検索から収集した人間の投稿（2026-08-27リサーチ）。
 */

const NO_Q = { allowQuestionEnding: false };
const OK_Q = { allowQuestionEnding: true };

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
