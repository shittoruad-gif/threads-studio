import { describe, it, expect, vi, beforeEach } from "vitest";
import { isPaidMemberSubscription, isNewsletterRecipient, NEWSLETTER_ISSUES, personalNote, renderIssue } from "../shared/newsletter";

// 2026-09-29 三上様指示「有料会員のみに配信をして、解約した人には配信しない仕組みを最初から入れておいて。無料プランは配信なし」
describe("読み物の配信先", () => {
  const paid = { planId: "pro_seminar", status: "active", univapaySubscriptionId: "uv-1", cancelAtPeriodEnd: 0 };

  it("有料・ご契約中・解約予約なし → 配信する", () => {
    expect(isPaidMemberSubscription(paid)).toBe(true);
  });
  it("無料プランには配信しない", () => {
    expect(isPaidMemberSubscription({ ...paid, planId: "free" })).toBe(false);
  });
  it("解約した方には配信しない", () => {
    expect(isPaidMemberSubscription({ ...paid, status: "canceled" })).toBe(false);
  });
  it("解約の予約が入っている方にも配信しない（例：9/27 解約予約の方）", () => {
    expect(isPaidMemberSubscription({ ...paid, cancelAtPeriodEnd: 1 })).toBe(false);
    expect(isPaidMemberSubscription({ ...paid, cancelAtPeriodEnd: true })).toBe(false);
  });
  it("課金なしのお試し（pro だが決済が無い）・未払い・お試し中には配信しない", () => {
    expect(isPaidMemberSubscription({ ...paid, univapaySubscriptionId: null })).toBe(false);
    expect(isPaidMemberSubscription({ ...paid, status: "past_due" })).toBe(false);
    expect(isPaidMemberSubscription({ ...paid, status: "trialing" })).toBe(false);
  });
  it("運営（admin）には送らない。契約が複数あれば1つでも条件を満たせば送る", () => {
    expect(isNewsletterRecipient({ role: "admin" }, [paid])).toBe(false);
    expect(isNewsletterRecipient({ role: "user" }, [{ ...paid, status: "canceled" }, paid])).toBe(true);
    expect(isNewsletterRecipient({ role: "user" }, [])).toBe(false);
  });
});

describe("読み物の文面", () => {
  it("絵文字を使わない・5回ある・第1回に鉄則が書いてある", () => {
    expect(NEWSLETTER_ISSUES).toHaveLength(5);
    for (const i of NEWSLETTER_ISSUES) expect(/\p{Extended_Pictographic}/u.test(i.body + i.title)).toBe(false);
    expect(NEWSLETTER_ISSUES[0].body).toContain("伸びた方を見つけていくのが鉄則");
  });
  it("第5回：本数が少なければ、数字を作らず正直に書く", () => {
    expect(personalNote({ storeName: "A", total: 4 })).toContain("まだ書き方どうしを比べられるだけの本数");
    const t = personalNote({ storeName: "A", total: 20, bestLabel: "あるある", bestAvg: 300, overallAvg: 150 });
    expect(t).toContain("「あるある」");
    expect(t).toContain("2.0倍");
    expect(renderIssue(NEWSLETTER_ISSUES[4], t)).not.toContain("{PERSONAL}");
  });
});

// ── 三上様の「送る」：二度押しでも1回だけ・押した時点の配信先へ ──
const st = { issue: "pending", optOut: 0 };
const pushMessages = vi.fn(async () => true);
const sendEmail = vi.fn(async () => true);
vi.mock("./lineNotify", () => ({ pushMessages }));
vi.mock("./_core/notification", () => ({ sendEmail }));
vi.mock("./db", () => ({
  getDb: async () => ({
    execute: async (q: any) => {
      const t = JSON.stringify(q);
      if (t.includes("UPDATE newsletterIssues SET status = 'sending'")) {
        if (st.issue !== "pending") return [{ affectedRows: 0 }];
        st.issue = "sending"; return [{ affectedRows: 1 }];
      }
      if (t.includes("INSERT IGNORE INTO newsletterDeliveries")) return [{ affectedRows: 1 }];
      if (t.includes("FROM newsletterOptOuts")) return [[{ userId: st.optOut }]];
      if (t.includes("FROM users u JOIN subscriptions")) {
        return [[
          { userId: 101, name: "有料LINE", email: "a@example.com", role: "user", planId: "pro", status: "active", univapaySubscriptionId: "u1", cancelAtPeriodEnd: 0 },
          { userId: 102, name: "有料メール", email: "b@example.com", role: "user", planId: "light", status: "active", univapaySubscriptionId: "u2", cancelAtPeriodEnd: 0 },
          { userId: 103, name: "解約", email: "c@example.com", role: "user", planId: "pro", status: "canceled", univapaySubscriptionId: "u3", cancelAtPeriodEnd: 0 },
          { userId: 104, name: "無料", email: "d@example.com", role: "user", planId: "free", status: "active", univapaySubscriptionId: null, cancelAtPeriodEnd: 0 },
        ]];
      }
      return [{ affectedRows: 1 }];
    },
  }),
  getLineUserIdsForUser: async (id: number) => (id === 101 || id === 103 || id === 104 ? [`U${id}`] : []),
  getUserProjects: async () => [],
}));

describe("読み物：三上様の判断", () => {
  beforeEach(() => { st.issue = "pending"; st.optOut = 0; pushMessages.mockClear(); sendEmail.mockClear(); });

  it("有料の方だけに届く（LINEが無い方はメール）。解約・無料には届かない", async () => {
    const { decideNewsletter } = await import("./newsletter");
    const msg = await decideNewsletter(1, "send", 1);
    expect(msg).toContain("LINE 1名・メール 1名");
    expect(pushMessages).toHaveBeenCalledTimes(1);
    expect((pushMessages.mock.calls[0] as any[])[0]).toBe("U101");
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(((sendEmail.mock.calls[0] as any[])[0] as any).to).toBe("b@example.com");
  });

  it("「読み物は不要」の方には送らない", async () => {
    st.optOut = 102;
    const { decideNewsletter } = await import("./newsletter");
    expect(await decideNewsletter(1, "send", 1)).toContain("LINE 1名・メール 0名");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("「送る」を2回押しても2回目は送らない", async () => {
    const { decideNewsletter } = await import("./newsletter");
    await decideNewsletter(1, "send", 1);
    expect(await decideNewsletter(1, "send", 1)).toContain("すでに処理ずみ");
    expect(pushMessages).toHaveBeenCalledTimes(1);
  });
});
