import { describe, it, expect } from "vitest";
import { checkHealthClaims, isHealthBusiness, healthClaimRetryHint, scrubSettingText, scrubSettingList } from "../shared/healthClaimGuard";
import { findFabricatedNumbers, fabricatedNumberRetryHint } from "../shared/fabricatedNumberGuard";
import { rampCap, compensationCount, manualExtraPosts, carryOverCount, inCooldown } from "../shared/accountRamp";

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
  it("運営が決めた補填：期間内は1日＋n件、期間を過ぎたら0（2026-09-10 プレステージ様）", () => {
    const a = { extraPostsPerDay: 1, extraPostsUntil: "2026-09-16", extraPostsReason: "9/8〜9/10に届かなかった6件の補填（9/11〜9/16は1日4件）" };
    expect(manualExtraPosts(a, "2026-09-11")).toEqual({ extra: 1, note: a.extraPostsReason });
    expect(manualExtraPosts(a, "2026-09-16").extra).toBe(1);
    expect(manualExtraPosts(a, "2026-09-17").extra).toBe(0);
    expect(manualExtraPosts({ extraPostsPerDay: 0, extraPostsUntil: "2026-09-16" }, "2026-09-11").extra).toBe(0);
    expect(manualExtraPosts(null, "2026-09-11").extra).toBe(0);
    // DBから Date で来ても同じ（UTC 15:00 = JST 翌0:00 の境目を跨がない）
    expect(manualExtraPosts({ extraPostsPerDay: 1, extraPostsUntil: new Date("2026-09-16T00:00:00Z") }, "2026-09-16").extra).toBe(1);
  });
  it("自動補填：昨日落ちた枠を今日に足す（＋2まで・手動の補填と合わせて）", () => {
    expect(carryOverCount({ shortfallDate: "2026-09-10", shortfallCount: 1 }, 0, "2026-09-11")).toBe(1);
    expect(carryOverCount({ shortfallDate: "2026-09-10", shortfallCount: 3 }, 0, "2026-09-11")).toBe(2);
    expect(carryOverCount({ shortfallDate: "2026-09-10", shortfallCount: 3 }, 1, "2026-09-11")).toBe(1);
    expect(carryOverCount({ shortfallDate: "2026-09-10", shortfallCount: 3 }, 2, "2026-09-11")).toBe(0);
    expect(carryOverCount({ shortfallDate: "2026-09-09", shortfallCount: 3 }, 0, "2026-09-11")).toBe(0); // 一昨日の分は持ち越さない
    expect(carryOverCount({ shortfallDate: new Date("2026-09-10T00:00:00Z"), shortfallCount: 1 }, 0, "2026-09-11")).toBe(1);
    expect(carryOverCount(null, 0, "2026-09-11")).toBe(0);
  });
  it("投稿が消されたアカウントの冷却期間（当日を含む・過ぎたら解除）", () => {
    expect(inCooldown({ cooldownUntil: "2026-09-19" }, "2026-09-12")).toBe(true);
    expect(inCooldown({ cooldownUntil: "2026-09-19" }, "2026-09-19")).toBe(true);
    expect(inCooldown({ cooldownUntil: "2026-09-19" }, "2026-09-20")).toBe(false);
    expect(inCooldown({ cooldownUntil: null }, "2026-09-12")).toBe(false);
  });
});

describe("止めた理由を作り直しへ渡す（2026-09-15）", () => {
  // 2026-09-14 の本番ログ：userId=2907 が「短時間で楽になる約束」で24時間に5回落ち、
  // 「本文が短くなりすぎたため公開しない」で3枠が消えていた。理由を次の回に渡していなかったため。
  it("健康ガード：引っかかった型の名前を、次に避けるべきものとして渡す", () => {
    const v = checkHealthClaims("たった3分で肩こりが楽になります。\n毎日の腰痛の悩みから解放されますよ。");
    expect(v.ok).toBe(false);
    const hint = healthClaimRetryHint(v.hits, "many");
    expect(hint).toContain("短時間で楽になる約束");
    expect(hint).toContain("言い切らない");
    expect(hint.startsWith("- ")).toBe(true);
  });
  it("健康ガード：短くなりすぎた場合は、書き直しの向きまで伝える", () => {
    const hint = healthClaimRetryHint(["痛みの消失"], "short");
    expect(hint).toContain("痛みの消失");
    expect(hint).toContain("本文が残らない");
  });
  it("健康ガード：型名が取れなくても空のヒントにはしない", () => {
    expect(healthClaimRetryHint([], "many")).toContain("健康の断定");
  });
  it("数字ガード：登録に無い数字をそのまま名指しで渡す", () => {
    // 2026-09-14 本番：userId=2768「9割」／userId=3200「3万人」
    const fab = findFabricatedNumbers("SNS投稿が続かない人は9割です。", "開業11年／のべ20万人以上");
    expect(fab.map((f) => f.text).join()).toContain("9割");
    const hint = fabricatedNumberRetryHint(fab);
    expect(hint).toContain("9割");
    expect(hint).toContain("はじめの設定");
  });
  it("数字ガード：登録にある数字は止めないので、ヒントも作られない", () => {
    expect(findFabricatedNumbers("のべ20万人以上を診てきました。", "開業11年／のべ20万人以上")).toEqual([]);
  });
});

/**
 * 2026-09-16 夜間整備（2026-09-15 三上様指示）。
 * 「健康表現ガードで引っかかるものに関しては、最初から記載しないようにしてください。
 *   クライアントが設定のところに入れていても同じです。」
 *
 * これまでは本文ができたあとに落とす後追いだったため、「強み・実績」に結果表現を
 * 書かれている方は毎回そこから同じ言い回しが出てきて、作り直しで枠が消えていた
 * （9/14 userId=2907 が24時間で6回・うち5回が同じ型）。
 * 下の文字列はすべて本番の projects に実際に入っているもの。
 */
describe("はじめの設定を渡す前に洗う（scrubSettingText）", () => {
  it("userId=5002・556 の「根本改善にこだわる」を落とし、他の行は残す", () => {
    const r = scrubSettingText("根本改善にこだわる\n完全予約制でゆったり\n国家資格者による施術");
    expect(r.hits).toContain("治る・改善の断定");
    expect(r.text).not.toContain("根本改善");
    expect(r.text).toContain("完全予約制でゆったり");
    expect(r.text).toContain("国家資格者による施術");
  });

  it("userId=2907 の強みから体験談だけを落とし、残った行を壊れた日本語にしない", () => {
    const r = scrubSettingText(
      "整体院を開業して30年近く、豊富な経験と様々な実績があり、手術宣告を受けられた方が症状改善したり、杖をついて来られた方の杖がいらなくなったり、自宅での歩行器も不要になったり、施術効果はまさに世界トップクラス！！また、日本トップクラスの整体法を取得、更にMLBメジャーリーグ9名のトレーナーが小波津式を学び、ドイツの有名サッカーチームでも小波津式を学んでいます。",
    );
    expect(r.text).not.toContain("症状改善");
    expect(r.text).not.toContain("杖がいらなく");
    expect(r.text).toContain("日本トップクラスの整体法を取得");
    // 落とした残りの「！」が行頭に取り残されない
    expect(r.text.startsWith("また、")).toBe(true);
  });

  it("userId=5002 の N1顧客像「不妊の悩み/妊娠出産した」は丸ごと空になる", () => {
    const r = scrubSettingText("代女性/不妊の悩み/妊娠出産した");
    expect(r.hits).toContain("不妊・妊娠の結果");
    expect(r.text).toBe("");
  });

  it("価格は落とさない（設定に書かれたメニュー料金は事実。本文側のガードが受け持つ）", () => {
    const r = scrubSettingText("初回お試し1980円\n完全予約制");
    expect(r.text).toContain("1980円");
  });

  it("結果表現の無い設定はそのまま（userId=3500 の強み）", () => {
    const src = "スポーツのケガに強い、夜２１時まで営業、院長の経験豊富、交通事故治療と対応に強い";
    const r = scrubSettingText(src);
    expect(r.hits).toEqual([]);
    expect(r.text).toBe(src);
  });

  it("箇条書きは、空になった行だけを落とす", () => {
    const r = scrubSettingList(["国家資格者による施術", "根本改善にこだわる", "夜遅くまで営業"]);
    expect(r.list).toEqual(["国家資格者による施術", "夜遅くまで営業"]);
    expect(r.hits).toContain("治る・改善の断定");
  });
});

/**
 * 2026-09-16：上の実データを見ていて分かった取りこぼし。
 * 直近30日の健康系の公開投稿749本のうち6本（すべて userId=2907）が、
 * これらの型で**公開まで通っていた**。施術の結果そのものなので本文でも止める。
 */
describe("2026-09-16 追加：本番で公開まで通っていた体験談の型", () => {
  it("「手術を回避できた」を止める", () => {
    const v = checkHealthClaims("変形性股関節症で手術予定だった方が、2回の施術で手術を回避できました。\n\n八千代で施術をしています。");
    expect(v.ok).toBe(false);
    expect(v.hits).toContain("手術回避の体験談");
    expect(v.text).toContain("八千代で施術をしています。");
  });
  it("「杖が要らなくなり」「痛みが和らぎ」を止める", () => {
    expect(checkHealthClaims("杖が要らなくなり、歩行器も不要になりました。").hits).toContain("歩行補助が不要になった体験談");
    expect(checkHealthClaims("1回の施術で痛みが和らぎました。").hits).toContain("症状が軽くなった断定");
  });
  it("「膝の痛みも治ってました」「健康回復できました」を止める", () => {
    expect(checkHealthClaims("気がついたら膝の痛みも治ってました。").hits).toContain("治ったの断定");
    expect(checkHealthClaims("身も心も健康回復できました。").hits).toContain("改善・回復の断定");
  });
});

/**
 * 2026-09-18 夜間整備。固定投稿の通し確認で作られた文が素通りしていた。
 * 直近30日の健康系の公開投稿764本のうち10本（userId 78 が5本・2907 が5本）が
 * この型で公開まで通っていた。
 */
describe("2026-09-18 追加：「効果を実感できます」の断定", () => {
  it("通し確認で実際に作られた一文を止める", () => {
    const v = checkHealthClaims(
      "QA整体院では、国家資格を持つ私が丁寧に確認しています。\n" +
      "どこに行っても変わらなかったと諦めかけていた方でも、着実に変化を感じていただけます。",
    );
    expect(v.ok).toBe(false);
    expect(v.hits).toContain("効果を実感できるの断定");
  });

  it.each([
    "変化を実感できます",
    "その違いを実感できます",
    "初回から効果を感じていただけます",
    "効果を実感できる魔法のような施術法です",
    "からだの軽さを実感していただけるはずです",
  ])("本番で公開まで通っていた言い回しを止める: %s", (t) => {
    expect(checkHealthClaims(t).hits).toContain("効果を実感できるの断定");
  });

  it.each([
    "変化を感じたと話す方もいます",
    "変化を感じた、という声をいただきました",
    "効果には個人差があります",
    "姿勢のくせから整えるお手伝いをしています",
  ])("人の声として伝える形は通す: %s", (t) => {
    expect(checkHealthClaims(t).hits).not.toContain("効果を実感できるの断定");
  });
});
