import { describe, it, expect } from "vitest";
import { sanitizePrefill, prefillProposalText, prefillIntroText, buildPrefillFromSavedProject, PREFILL_FIELDS } from "./counselingPrefill";

describe("登録ずみの方は、前回の答えをそのまま先に入れる（もう一度入力させない）", () => {
  it("rawAnswers があれば、20問ぶんそのまま使う", () => {
    const pf = buildPrefillFromSavedProject({
      businessType: "呉服店",
      counselingResult: JSON.stringify({ rawAnswers: {
        businessTypeRaw: "呉服小売店", areaRaw: "岡山市北区京橋町", storeNameRaw: "㈱津の国や本店",
        targetRaw: "お稽古の方", realProofsRaw: "創業130年", preferredTypesRaw: "local,proof", useThreadsKnowhow: "off",
        ngListRaw: "",
      } }),
    });
    expect(pf.businessTypeRaw).toBe("呉服小売店");
    expect(pf.preferredTypesRaw).toBe("local,proof");
    expect(pf.useThreadsKnowhow).toBe("off");
    expect(pf.ngListRaw).toBeUndefined(); // 空の答えは入れない（質問はふつうに出る）
  });

  it("古い登録で rawAnswers が無くても、列の値から分かるものは入れる", () => {
    const pf = buildPrefillFromSavedProject({
      businessType: "整体院", area: "倉敷市", storeName: "ナイト整体院", target: "40代女性",
      mainProblem: "肩こり", strength: "原因から見る", proof: "開業7年", ngWords: "必ず治る", counselingResult: null,
    });
    expect(pf).toEqual({
      businessTypeRaw: "整体院", areaRaw: "倉敷市", storeNameRaw: "ナイト整体院", targetRaw: "40代女性",
      mainProblemRaw: "肩こり", strengthRaw: "原因から見る", realProofsRaw: "開業7年", ngListRaw: "必ず治る",
    });
  });

  it("登録が無ければ空", () => {
    expect(buildPrefillFromSavedProject(null)).toEqual({});
    expect(buildPrefillFromSavedProject({ counselingResult: "{壊れたJSON" })).toEqual({});
  });

  it("前回の内容のときは、案内文が「もう一度入力しなくていい」と伝える", () => {
    expect(prefillIntroText("いまの登録内容", 18, "saved")).toContain("もう一度すべて入力していただく必要はありません");
    expect(prefillProposalText("呉服店", "いまの登録内容", "saved")).toContain("いまの登録内容：");
  });
});

/**
 * 連携アカウントのプロフィールから「はじめの設定」を先に埋める仕組みの、
 * AIの出力を受け取る部分の確認（AIそのものは呼ばない）。
 */
describe("プロフィールからの先埋め", () => {
  it("知らない項目・空・「なし」は落とし、使える答えだけ残す", () => {
    const out = sanitizePrefill({
      businessTypeRaw: "呉服店",
      areaRaw: "",
      storeNameRaw: "  津の国や本店  ",
      targetRaw: "なし",
      realProofsRaw: "不明",
      menuRaw: "訪問着、帯、お直し",
      somethingElse: "捨てる",
      ngListRaw: "先埋めの対象ではない",
    });
    expect(out).toEqual({ businessTypeRaw: "呉服店", storeNameRaw: "津の国や本店", menuRaw: "訪問着、帯、お直し" });
  });

  it("壊れた入力でも落ちずに空を返す", () => {
    expect(sanitizePrefill(null)).toEqual({});
    expect(sanitizePrefill("文字列")).toEqual({});
    expect(sanitizePrefill({ businessTypeRaw: 123 })).toEqual({});
  });

  it("長すぎる答えは200文字で止める", () => {
    const out = sanitizePrefill({ strengthRaw: "あ".repeat(500) });
    expect(Array.from(out.strengthRaw!).length).toBe(200);
  });

  it("先埋めの対象に、AIが補ってはいけない項目（NG・実話・きっかけ）が入っていない", () => {
    for (const ng of ["ngListRaw", "realEpisodesRaw", "originStoryRaw", "industryMythsRaw", "brandVoiceRaw"]) {
      expect(PREFILL_FIELDS as readonly string[]).not.toContain(ng);
    }
  });

  it("案内文に、読み取り元と「これでOK」の押し方が入る", () => {
    const t = prefillProposalText("呉服店", "@tsunokuniya のプロフィール");
    expect(t).toContain("@tsunokuniya のプロフィール");
    expect(t).toContain("「呉服店」");
    expect(t).toContain("これでOK");
    expect(prefillIntroText("@tsunokuniya のプロフィール", 3)).toContain("3項目");
  });
});
