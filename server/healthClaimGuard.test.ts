import { describe, it, expect } from "vitest";
import { checkHealthClaims, isHealthBusiness } from "../shared/healthClaimGuard";
import { rampCap, compensationCount } from "../shared/accountRamp";

describe("健康系の断定ガード", () => {
  it("杖なしで歩ける・痛みなく・ぐっすり・初回1980円を検出して和らげる", () => {
    const v = checkHealthClaims("初回お試し1980円。長年の腰の悩み、僕が向き合います。\n\n杖なしでスタスタ歩ける方もいます。\n10年の経験と5万人以上の実績でサポート。\n\n朝、痛みなくスッと起き上がれる毎日を目指しましょう😊");
    expect(v.ok).toBe(false);
    expect(v.hits).toEqual(expect.arrayContaining(["歩行回復の体験談", "痛みの消失", "価格訴求"]));
    expect(v.text).not.toContain("1980円");
    expect(v.text).not.toContain("杖なし");
    expect(v.text).toContain("5万人以上の実績");
  });
  it("問題ない文はそのまま", () => {
    const v = checkHealthClaims("腰が辛い時、つい揉んでしまう。\n僕も昔は、揉めば良いと思っていました。\n\nでも実は、身体の使い方が大切なんです。");
    expect(v.ok).toBe(true);
    expect(v.text).toBe("腰が辛い時、つい揉んでしまう。\n僕も昔は、揉めば良いと思っていました。\n\nでも実は、身体の使い方が大切なんです。");
  });
  it("2026-09-09 はいさい整骨院でThreads側に消された「たった1分で楽になる」型を止める", () => {
    const v = checkHealthClaims("寝る前のたった1分で肩こりが楽になるワザ、ありますよ。\n\n深くゆっくり呼吸するだけ。\nこれだけで自律神経が整いやすくなります。\n\n毎日続けると、寝起きもスッキリします😊\n\nあなたは寝る前、何か習慣にしていますか？");
    expect(v.ok).toBe(false);
    expect(v.hits).toEqual(expect.arrayContaining(["短時間で楽になる約束", "症状が楽になる断定", "寝起き改善の断定"]));
    expect(v.text).not.toContain("1分で");
    expect(v.text).not.toContain("スッキリ");
    expect(v.text).toContain("深くゆっくり呼吸するだけ。");
  });
  it("2026-09-09 「毎日頭痛や不眠で…」と症状名で悩みを呼び込む書き出しを止める", () => {
    const v = checkHealthClaims("「毎日頭痛や不眠で…」八千代市でよく聞くお悩みです。\n\n夏の疲れが出るこの時期、体調を崩しやすい方も多いです。");
    expect(v.ok).toBe(false);
    expect(v.hits).toContain("症状名で悩みを呼び込む書き出し");
    expect(v.text).not.toContain("頭痛や不眠");
    expect(v.text).toContain("夏の疲れ");
  });
  it("症状名を出しても断定でなければ通す（過剰に落とさない）", () => {
    for (const t of [
      "八千代市勝田台で開業11年。\n\n強く押すのが良い施術とは限りません。\n\n一人ひとりのお話を聞いてから、その方に合う施術を選びます。",
      "デスクワークの合間に、肩を大きく回してみてください。\n\n身体の使い方を少し変えるだけで、日常が変わることがあります。",
      "肩こりでお悩みの方へ。\n\n原因は肩そのものではなく、座り方にあることも多いです。",
      "「一度会えば、みんな兄弟」沖縄の言葉です。\n\n私、この言葉がすごく好きなんです。",
    ]) {
      const v = checkHealthClaims(t);
      expect(v.ok, t).toBe(true);
      expect(v.text).toBe(t);
    }
  });
  it("業種判定", () => {
    expect(isHealthBusiness("トレーニングを取り入れた整体院")).toBe(true);
    expect(isHealthBusiness("呉服小売店")).toBe(false);
  });
});
describe("新しいアカウントの慣らし", () => {
  it("5日未満は1件、10日未満は2件、以降は契約どおり", () => {
    const now = Date.parse("2026-09-06T00:00:00Z");
    expect(rampCap(3, "2026-09-02T00:00:00Z", now).count).toBe(1);
    expect(rampCap(3, "2026-08-30T00:00:00Z", now).count).toBe(2);
    expect(rampCap(3, "2026-08-01T00:00:00Z", now).count).toBe(3);
    expect(rampCap(1, "2026-08-30T00:00:00Z", now).capped).toBe(false);
  });
  it("慣らしで減った分は1日＋1件で補い、30日で契約×30に届く", () => {
    // 5日×1件＋5日×2件＝15件のあと、11日目から4件/日
    let posted = 15; let total = 15;
    for (let day = 10; day < 30; day++) {
      const c = compensationCount(3, day, posted);
      total += c.count; posted += c.count;
    }
    expect(total).toBeGreaterThanOrEqual(90);
    expect(compensationCount(3, 10, 15).count).toBe(4);
    expect(compensationCount(3, 10, 30).count).toBe(3); // 不足なし
    expect(compensationCount(1, 10, 5).count).toBe(1);  // ライトは補填なし
  });
});

describe("健康系の断定ガード（2026-09-07 追加）", () => {
  it("「2ヶ月でよく寝られるように」を検出する", () => {
    const v = checkHealthClaims("八千代の30代女性が、頭痛や不眠で悩んでいました。\n2ヶ月でよく寝られるように。\n\n痛くない施術を大切に、一人ひとりに合わせたやり方で身体を整えます😊\n\nあなたはどんな変化がほしいですか？");
    expect(v.ok).toBe(false);
    expect(v.text).not.toContain("2ヶ月で");
    expect(v.text).not.toContain("寝られる");
    expect(v.text).toContain("痛くない施術を大切に");
  });
});

/**
 * 2026-09-09 夜間整備。
 * 廿日市の整体院で「15年の経験で、不妊の悩みから妊娠出産されたお客様がいます」が作られていた
 * （たまたま公開前に止まっていた）。不妊・妊娠は医療の領域で、施術の結果として語ると
 * 医療広告の規制にも、Threads側の健康の誤情報の判定にも当たる。
 */
describe("不妊・妊娠を施術の結果として語らせない（2026-09-09 追加）", () => {
  it("実際に作られていた文を落とす", () => {
    const v = checkHealthClaims(
      "15年の経験で、不妊の悩みから妊娠出産されたお客様がいます。\n" +
      "体のバランスを整え、妊娠しやすい体づくりをサポートします。\n\n" +
      "気になることがあれば、お気軽にご相談ください。",
    );
    expect(v.ok).toBe(false);
    expect(v.hits).toEqual(expect.arrayContaining(["不妊・妊娠の結果"]));
    expect(v.text).not.toContain("不妊の悩みから妊娠出産");
    expect(v.text).not.toContain("妊娠しやすい体づくり");
    expect(v.text).toContain("お気軽にご相談ください");
  });

  it("産後ケアの案内そのものは残す（言葉狩りにしない）", () => {
    const v = checkHealthClaims("産後の骨盤ケアを行っています。\n出産のあとの体の変化について、よくご相談をいただきます。");
    expect(v.ok).toBe(true);
    expect(v.text).toContain("産後の骨盤ケア");
    expect(v.text).toContain("よくご相談をいただきます");
  });
});
