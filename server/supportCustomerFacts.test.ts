/**
 * ご自身のご契約・件数のお尋ねに、自動応答がお答えできる状態を保つ番人。
 *
 * きっかけは 2026-09-22 に比嘉様（5131・pro_seminar）からいただいた3件。
 *   #42「今月のこり何通？」                       → 担当者送り
 *   #43「聞かなくて大丈夫！！24件と書いてあった！！」 ← ご自分で画面を探された
 *   #44「月に1通のプランは月額いくらだった？？」      → 担当者送り
 * 答えはどれも社内のDBに在ったのに、自動応答には渡っていなかった。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const state: any = {
  user: null,
  sub: null,
  accounts: [],
  monthly: 0,
};

vi.mock("./db", () => ({
  getUserById: async () => state.user,
  getSubscriptionByUserId: async () => state.sub,
  getThreadsAccountsByUserId: async () => state.accounts,
  countUserMonthlyPosts: async () => state.monthly,
}));

import { customerFacts, postsPerDayOf, jstMonthPosition } from "./supportCustomerFacts";
import { systemPromptFor } from "./supportBot";

// 比嘉優様の実データに合わせる（pro_seminar・1日3回・公開前確認あり・連携1件）
// ★describe をまたいで持ち越さない。以前はここが describe の中にあり、
//   前の describe の最後のテスト（DBが読めない想定）が次へ漏れていた。
beforeEach(() => {
  state.user = {
    id: 5131,
    autoPostEnabled: true,
    autoPostFrequency: "three_daily",
    autoPostRequireApproval: true,
  };
  state.sub = {
    planId: "pro_seminar",
    status: "active",
    currentPeriodEnd: "2026-10-07T02:20:08.000Z",
    cancelAtPeriodEnd: false,
    trialEndsAt: null,
  };
  state.accounts = [{ id: 22, threadsUsername: "higa_seitai", isActive: true }];
  state.monthly = 23;
});

describe("このお客様の状況（自動応答に渡す事実）", () => {
  beforeEach(() => {
    state.user = {
      id: 5131,
      autoPostEnabled: true,
      autoPostFrequency: "three_daily",
      autoPostRequireApproval: true,
    };
    state.sub = {
      planId: "pro_seminar",
      status: "active",
      currentPeriodEnd: "2026-10-07T02:20:08.000Z",
      cancelAtPeriodEnd: false,
      trialEndsAt: null,
    };
    state.accounts = [{ id: 22, threadsUsername: "higa_seitai", isActive: true }];
    state.monthly = 23;
  });

  it("ご契約のプラン名と月額が入る（#44「月額いくらだった？」に答えられる）", async () => {
    const facts = await customerFacts(5131);
    expect(facts).toBeTruthy();
    expect(facts).toContain("8,800円");
    expect(facts).toContain("次回のご請求日：2026年10月7日");
  });

  it("今月の公開数が入る（#42「今月のこり何通？」に答えられる）", async () => {
    const facts = await customerFacts(5131);
    expect(facts).toContain("23件");
    expect(facts).toContain("1日 3 件");
  });

  it("連携アカウントと、いま効いている設定が入る", async () => {
    const facts = await customerFacts(5131);
    expect(facts).toContain("@higa_seitai");
    expect(facts).toContain("1日3回");
    expect(facts).toContain("公開前にご確認いただく設定");
  });

  it("アカウント別の上書き（片方だけ止める）を、共通設定より優先して書く", async () => {
    state.accounts = [
      { id: 22, threadsUsername: "a", isActive: true },
      { id: 23, threadsUsername: "b", isActive: true, autoPostEnabled: false },
    ];
    const facts = await customerFacts(5131);
    expect(facts).toContain("@b：自動投稿は止めています");
    expect(facts).toContain("@a：自動投稿 1日3回");
  });

  it("連携がまだ無い方には、その事実を書く（あるように見せない）", async () => {
    state.accounts = [];
    const facts = await customerFacts(5131);
    expect(facts).toContain("まだありません");
  });

  it("プラン変更のご予約があれば、切り替わる日とプランを書く", async () => {
    state.sub.pendingPlanId = "light";
    state.sub.pendingPlanEffectiveAt = "2026-10-07T02:20:08.000Z";
    const facts = await customerFacts(5131);
    expect(facts).toContain("ライト");
    expect(facts).toContain("2026年10月7日のご請求から");
    // 「今はまだ今のプラン」を必ず添える（下げる変更で機能だけ先に減ったと誤解されないため）
    expect(facts).toContain("それまでは今のプランのまま");
  });

  it("ログイン前のご質問（userId なし）では何も作らない", async () => {
    expect(await customerFacts(null)).toBeNull();
    expect(await customerFacts(undefined)).toBeNull();
  });

  it("DBが読めなくても落ちない（事実が無いだけ）", async () => {
    state.sub = null;
    state.accounts = [];
    state.monthly = 0;
    const facts = await customerFacts(5131);
    // フリープラン扱いの案内と今月の件数は残る。例外で落ちないことが大事
    expect(typeof facts === "string" || facts === null).toBe(true);
  });
});

describe("システムプロンプトへの差し込み", () => {
  it("状況が読めたら【このお客様の状況】として添える", () => {
    const p = systemPromptFor("ご契約：プロプラン");
    expect(p).toContain("【このお客様の状況】");
    expect(p).toContain("ご契約：プロプラン");
  });

  it("読めなければ今までどおり（余計な見出しを付けない）", () => {
    const p = systemPromptFor(null);
    expect(p).not.toContain("【このお客様の状況】");
  });

  it("状況に書いてあることは答えてよい、と明記してある", () => {
    // ここが消えると、AIは今までどおり「個別のご契約状況」として担当者送りに戻る
    expect(systemPromptFor("x")).toContain("そのままお答えしてかまいません");
  });
});

describe("今月の位置（JST）", () => {
  it("9/22 23:00 JST は「9月22日・残り9日」（UTCでは前日でも JST で数える）", () => {
    // 2026-09-22 14:00Z = 2026-09-22 23:00 JST
    const p = jstMonthPosition(new Date("2026-09-22T14:00:00Z"));
    expect(p.today).toBe("2026年9月22日");
    expect(p.month).toBe(9);
    expect(p.daysLeft).toBe(9); // 22〜30日の9日間
  });

  it("UTCでは前月でも、JSTで月をまたいでいればそちらで数える", () => {
    // 2026-09-30 15:30Z = 2026-10-01 00:30 JST
    const p = jstMonthPosition(new Date("2026-09-30T15:30:00Z"));
    expect(p.today).toBe("2026年10月1日");
    expect(p.daysLeft).toBe(31);
  });

  it("月末当日は残り1日", () => {
    expect(jstMonthPosition(new Date("2026-09-30T03:00:00Z")).daysLeft).toBe(1);
  });

  it("うるう年の2月も正しく数える", () => {
    expect(jstMonthPosition(new Date("2028-02-01T03:00:00Z")).daysLeft).toBe(29);
  });
});

describe("今月あと何件（#42）にお答えするための材料", () => {
  it("今日の日付・残り日数・これから作れる上限が入る", async () => {
    const facts = await customerFacts(5131);
    const { today, daysLeft } = jstMonthPosition();
    // ★日付を渡さないと、AIは「現在の日付が不明」で答えられない（実測で確認した）
    expect(facts).toContain(today);
    expect(facts).toContain(`${daysLeft * 3}件`);
    // 上限であってお約束ではない、と必ず添える
    expect(facts).toContain("お約束の本数ではありません");
  });
});

describe("postsPerDayOf", () => {
  it("設定の値を本数にする", () => {
    expect(postsPerDayOf("three_daily")).toBe(3);
    expect(postsPerDayOf("twice_daily")).toBe(2);
    expect(postsPerDayOf("daily")).toBe(1);
    expect(postsPerDayOf(null)).toBe(1);
  });
});
