/**
 * 求人（採用）の投稿の見分けと、その指示の番人。
 *
 * きっかけ：株式会社プレステージ様（@esthe_prestige_r）が2晩続けて
 * naturalnessReview で3回落ち、その日の枠を捨てていた（2026-09-22・09-23 の実測）。
 * 落ちた下書きをそのままここに入れて、同じ型に戻ったら気づけるようにする。
 */
import { describe, it, expect } from "vitest";
import { looksLikeRecruiting, RECRUITING_POST_ADDENDUM, hasRecruitingMarker } from "@shared/recruitingPost";

describe("求人の投稿かどうかの見分け", () => {
  it("プレステージ様の実データを求人として見分ける", () => {
    expect(looksLikeRecruiting({
      target: "20～30代女性　エステティシャンに興味がある",
      mainProblem: "エステサロンで働きたい",
    })).toBe(true);
  });

  it("ふつうの集客のお店は求人にしない（香取様・接骨院の実データ）", () => {
    expect(looksLikeRecruiting({
      target: "土浦市の中学生・高校生とその保護者",
      mainProblem: "スポーツのケガが長引いて復帰できない",
    })).toBe(false);
  });

  it("強みに「未経験でも育てます」と書いてあるだけでは求人にしない", () => {
    // ★見る欄を「お客さん像」「お悩み」に絞っている理由。ここが効かないと
    //   ふつうの集客の投稿にまで求人の指示が混ざる。
    expect(looksLikeRecruiting({
      target: "肩こりに悩む30代の会社員",
      mainProblem: "デスクワークで肩が上がらない",
      n1Customer: "未経験から入社したスタッフが担当します",
    })).toBe(false);
  });

  it("採用・応募・転職などの言い方も拾う", () => {
    for (const w of ["スタッフ募集中です", "中途採用を考えている方", "異業種から転職したい方", "正社員になりたい"]) {
      expect(looksLikeRecruiting({ target: w, mainProblem: "" }), w).toBe(true);
    }
  });

  it("空・未登録では求人にしない", () => {
    expect(looksLikeRecruiting(null)).toBe(false);
    expect(looksLikeRecruiting({})).toBe(false);
    expect(looksLikeRecruiting({ target: "", mainProblem: "" })).toBe(false);
  });
});

describe("求人の投稿に足す指示", () => {
  it("標語だけで終わらせないことを求めている（落ちた下書きの型）", () => {
    expect(RECRUITING_POST_ADDENDUM).toContain("あなたの成長を支えます");
    expect(RECRUITING_POST_ADDENDUM).toContain("美容が好きならきっと大丈夫");
    expect(RECRUITING_POST_ADDENDUM).toContain("不合格");
  });

  it("登録された事実を1つ選んで具体的に書かせ、入社された方の話は起きた順に書かせる", () => {
    expect(RECRUITING_POST_ADDENDUM).toContain("**1つだけ**選び");
    expect(RECRUITING_POST_ADDENDUM).toContain("起きた順");
    // ★9/26「また同じものばかり」：一人の話を毎回必ず使わせると、同じ流れが続く
    expect(RECRUITING_POST_ADDENDUM).toContain("毎回同じ人の話にしない");
    expect(RECRUITING_POST_ADDENDUM).not.toContain("一人の話を1つだけ選び");
  });

  it("求人の投稿だと読んで分かるように書かせる（2026-09-26）", () => {
    expect(RECRUITING_POST_ADDENDUM).toContain("求人の投稿だ」とすぐ分かる");
  });

  it("来店を促す言い方を止める（読む人はお客様ではない）", () => {
    expect(RECRUITING_POST_ADDENDUM).toContain("ご予約");
    expect(RECRUITING_POST_ADDENDUM).toContain("働くかもしれない人");
  });

  it("登録に無い待遇を書かせない・言い切らせない（ガードを緩めない）", () => {
    expect(RECRUITING_POST_ADDENDUM).toContain("給与・待遇・勤務条件");
    expect(RECRUITING_POST_ADDENDUM).toContain("必ず成長できる");
  });

  it("絵文字を使っていない（★は社内の強調記号なので対象外）", () => {
    expect(RECRUITING_POST_ADDENDUM).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe("求人だと読める言葉があるか（2026-09-26）", () => {
  it("お客様向けの宣伝にも読める文は、求人の言葉が無いと判定する", () => {
    // 架空のサロン。体質別ケアの紹介だけで、働く人に向けた言葉が無い
    expect(hasRecruitingMarker("サンプルサロンのケアは、体質別。\n創業から20年続けてきました。\nお客様の体質を見て組み立てます。")).toBe(false);
  });
  it("働く・職場・募集・入社などがあれば求人と読める", () => {
    expect(hasRecruitingMarker("働きながら学べる職場です。")).toBe(true);
    expect(hasRecruitingMarker("一緒に働く仲間を募集しています。")).toBe(true);
    expect(hasRecruitingMarker("入社2か月目に指名をいただけた方がいます。")).toBe(true);
    expect(hasRecruitingMarker("あなたが働くなら、どのお店が合いそうですか？")).toBe(true);
  });
});
