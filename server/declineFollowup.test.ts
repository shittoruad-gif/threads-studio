/**
 * 見送りが続くお客様の徹底フォローの番人（2026-09-24 三上様指示）。
 * ★いちばん守ること：お店の情報は「足すだけ」。消さない・書き換えない・元に戻せる。
 * （公開リポジトリのため、お客様の実データは入れず架空のお店で書く）
 */
import { describe, it, expect } from "vitest";
import {
  mergeProposal, removeProposal, isScheduleItem, dropAlreadyRegistered, proposalMessage, proposalSize,
  EMPTY_PROPOSAL, FOLLOWUP_DAYS, FOLLOWUP_MIN_DECLINES, type MaterialProposal,
} from "@shared/declineFollowup";
import { websiteUrlOf } from "./declineFollowup";

const CURRENT = {
  strength: "スポーツのケガに強い、夜21時まで営業",
  counselingResult: JSON.stringify({
    brandVoice: "ですます調",
    realProofs: ["整形外科で11年勤務"],
    realEpisodes: ["小学生が足を捻って我慢していた"],
    faq: ["予約が必要ですか？"],
    menu: ["加圧式トレーニング"],
    industryMyths: ["痛い場所だけ揉んでも良くなりません"],
  }),
};

const PROPOSAL: MaterialProposal = {
  strength: ["エコーで体の中をその場で確認できる", "24時間いつでも急患の相談を受け付けている"],
  realEpisodes: ["5歳の男の子が、滑り台から落ちて肘をけがして来院"],
  faq: ["治療機器に痛みはありますか？→痛みを伴うことはありません"],
  menu: ["超音波画像診断装置（エコー）", "加圧式トレーニング"], // 2つ目はすでに登録あり
  realProofs: ["整形外科勤務時代：年間の骨折・脱臼 約800例"],
  discrepancies: ["登録：11年勤務／ページ：10年以上勤務"],
};

describe("足すだけ（消さない・書き換えない）", () => {
  const m = mergeProposal(CURRENT, PROPOSAL);
  const cr = JSON.parse(m.counselingResult);

  it("今の登録は1文字も消えない", () => {
    expect(m.strength.startsWith(CURRENT.strength)).toBe(true);
    expect(cr.realProofs[0]).toBe("整形外科で11年勤務");
    expect(cr.realEpisodes[0]).toBe("小学生が足を捻って我慢していた");
    expect(cr.faq[0]).toBe("予約が必要ですか？");
    expect(cr.industryMyths).toEqual(["痛い場所だけ揉んでも良くなりません"]); // 案に無い項目もそのまま
    expect(cr.brandVoice).toBe("ですます調");
  });

  it("新しいものだけが後ろに足される", () => {
    expect(m.strength).toContain("エコーで体の中をその場で確認できる");
    expect(cr.realEpisodes).toContain("5歳の男の子が、滑り台から落ちて肘をけがして来院");
    expect(cr.realProofs).toContain("整形外科勤務時代：年間の骨折・脱臼 約800例");
  });

  it("すでに登録にあるものは二重に足さない", () => {
    expect(cr.menu.filter((x: string) => x === "加圧式トレーニング")).toHaveLength(1);
    expect(m.added).toBe(6); // 強み2＋実例1＋質問1＋メニュー1＋実績1
  });

  it("食い違う点は、どこにも足さない", () => {
    expect(m.counselingResult).not.toContain("10年以上");
    expect(m.strength).not.toContain("10年以上");
  });

  it("同じ案を2回足しても増えない", () => {
    const again = mergeProposal({ strength: m.strength, counselingResult: m.counselingResult }, PROPOSAL);
    expect(again.added).toBe(0);
  });
});

describe("すでに登録にあるものの見分け", () => {
  it("句読点や空白の違いは同じものとみなす", () => {
    expect(dropAlreadyRegistered(["夜21時まで営業"], ["夜 21時まで 営業。"])).toEqual([]);
  });
  it("短すぎる切れ端は足さない", () => {
    expect(dropAlreadyRegistered(["エコ", "いい"], [])).toEqual([]);
  });
});

describe("三上様へのLINE", () => {
  const msg = proposalMessage({
    userName: "サンプル", username: "sample_clinic", declines: 5, published: 0,
    patterns: ["11年", "痛い場所だけ揉んでも"], reasons: ["言っていることが違う"],
    sourceUrl: "https://example.com/", proposal: PROPOSAL,
  });
  it("回数・共通点・理由・案・食い違いがそろっている", () => {
    expect(msg).toContain(`直近${FOLLOWUP_DAYS}日：見送り5回／公開0件`);
    expect(msg).toContain("「11年」");
    expect(msg).toContain("言っていることが違う");
    expect(msg).toContain("エコーで体の中をその場で確認できる");
    expect(msg).toContain("登録と食い違う点（入れていません");
    expect(msg).toContain("今の登録は消しません");
  });
  it("LINEの1通（5000字）に収まる", () => {
    const huge = { ...PROPOSAL, strength: Array(200).fill("とても長い強みの説明がここに入ります") };
    expect(proposalMessage({ userName: "a", username: "b", declines: 3, published: 0, patterns: [], reasons: [], sourceUrl: "x", proposal: huge }).length).toBeLessThanOrEqual(4800);
  });
  it("絵文字を使わない", () => {
    expect(msg).not.toMatch(/\p{Extended_Pictographic}/u);
  });
  it("案が空なら「足す」の案内を出さない", () => {
    const m2 = proposalMessage({ userName: "a", username: "b", declines: 3, published: 0, patterns: [], reasons: [], sourceUrl: null, proposal: EMPTY_PROPOSAL, note: "ホームページが登録されていません。" });
    expect(m2).not.toContain("「足す」を押すと");
    expect(proposalSize(EMPTY_PROPOSAL)).toBe(0);
  });
});

describe("読むページ", () => {
  it("ご案内先URLのホームページ → 予約ページの順に選ぶ", () => {
    expect(websiteUrlOf({ links: JSON.stringify([{ type: "line", url: "https://lin.ee/x" }, { type: "reservation", url: "https://yoyaku.example/" }, { type: "website", url: "https://hp.example/" }]) })).toBe("https://hp.example/");
    expect(websiteUrlOf({ links: JSON.stringify([{ type: "reservation", url: "https://yoyaku.example/" }]) })).toBe("https://yoyaku.example/");
    expect(websiteUrlOf({ links: JSON.stringify([{ type: "line", url: "https://lin.ee/x" }]) })).toBeNull();
    expect(websiteUrlOf({ links: null })).toBeNull();
  });
});

describe("発動の条件（三上様決定）", () => {
  it("直近7日に3回以上", () => {
    expect(FOLLOWUP_DAYS).toBe(7);
    expect(FOLLOWUP_MIN_DECLINES).toBe(3);
  });
});

describe("元に戻す（足した項目だけを外す・2026-09-24 三上様指示）", () => {
  const before = {
    strength: "創業40年",
    counselingResult: JSON.stringify({ menu: ["痩身メニュー"], faq: ["ノルマはあるのか"] }),
  };
  const p: MaterialProposal = {
    ...EMPTY_PROPOSAL,
    strength: ["座学よりもサロン実習を大切にしている"],
    menu: ["フェイシャル", "痩身メニュー"],
    realProofs: ["賞与年3回（実績賞与）"],
  };

  it("足したあとに何もしていなければ、足す前と同じ中身に戻る", () => {
    const merged = mergeProposal(before, p);
    const r = removeProposal(merged, before, p);
    expect(r.strength).toBe("創業40年");
    const cr = JSON.parse(r.counselingResult);
    expect(cr.menu).toEqual(["痩身メニュー"]);
    expect(cr.faq).toEqual(["ノルマはあるのか"]);
    expect(cr.realProofs).toEqual([]);
    expect(r.removed).toBe(3);
  });

  it("足したあとにお客様が直した・足した分は消さない（以前は戻せなかった場面）", () => {
    const merged = mergeProposal(before, p);
    const cr = JSON.parse(merged.counselingResult);
    cr.menu.push("ブライダル（ご本人が追加）");
    const edited = { strength: merged.strength + "\nチームワークを大事にする", counselingResult: JSON.stringify(cr) };
    const r = removeProposal(edited, before, p);
    expect(r.strength).toBe("創業40年\nチームワークを大事にする");
    expect(JSON.parse(r.counselingResult).menu).toEqual(["痩身メニュー", "ブライダル（ご本人が追加）"]);
  });

  it("もともと登録にあった文は、案に同じ文があっても外さない", () => {
    const merged = mergeProposal(before, p);
    const r = removeProposal(merged, before, p);
    expect(JSON.parse(r.counselingResult).menu).toContain("痩身メニュー");
  });
});

describe("登録を優先する：時間・予約の決まりはホームページから足さない（2026-09-24 三上様指示）", () => {
  it("9/24 に登録と食い違った実物は、足さない側に入る", () => {
    for (const s of [
      "予約がなくても来院可能か？→予約優先だが来院可",
      "平日午後の診療は15時からですか？",
      "祝日午後の診療は15時からですか？",
      "定休日 水曜・日曜隔週",
    ]) expect(isScheduleItem(s), s).toBe(true);
  });
  it("相談・電話・急患の受付は診療時間とは別なので足せる（9/24 三上様ご指摘）", () => {
    for (const s of [
      "交通事故のご相談は24時間受付で無料",
      "24時間急患電話で出られなかった場合、折り返し連絡",
    ]) expect(isScheduleItem(s), s).toBe(false);
  });
  it("時間に触れない材料は足せる", () => {
    for (const s of [
      "座学よりもサロン実習を大切にしている",
      "応募から内定まで1週間〜10日程度",
      "口コミ平均点5.00（91件）",
      "4か月の子どもを連れて初めて来院した患者さん",
      "パラ卓球日本代表選手の指導実績",
    ]) expect(isScheduleItem(s), s).toBe(false);
  });
});
