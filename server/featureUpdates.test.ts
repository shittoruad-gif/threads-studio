import { describe, it, expect, vi, beforeEach } from "vitest";
import { hasPictograph, type FeatureUpdate } from "../shared/featureUpdates";
import { isProOrAbove } from "../shared/mediaPosts";

// 2026-11-02 三上様「アップデートされるたびに配信されるように。1週間に1回」。台帳と文面の試験は featureUpdatesLedger.test.ts。
// ★相手に届く送信は毎回三上様の承諾が要る：下見は三上様にだけ、お客様へは「この内容で送る」を押した時だけ。

const T: FeatureUpdate[] = [
  { id: "a", date: "2026-11-01", title: "全員の項目", body: "本文A", verifiedAt: "2026-11-02", verifiedHow: "x" },
  { id: "b", date: "2026-11-01", title: "プロ以上の項目", body: "本文B", when: (c) => c.hasLine && isProOrAbove(c.planId), verifiedAt: "2026-11-02", verifiedHow: "x" },
  { id: "c", date: "2026-11-01", title: "未確認の項目", body: "本文C", verifiedHow: "未確認" },
];

// ── 下見と三上様の判断（DB・LINEはまねもの） ──
const h = vi.hoisted(() => ({
  list: [] as any[],
  items: new Map<string, { status: string; batchKey: string | null; previewedAt: Date | null }>(),
  deliveries: new Set<string>(),
  recipients: [] as Array<{ userId: number; name: string; email: string | null }>,
}));
vi.mock("@shared/featureUpdates", async (orig) => {
  const real: any = await orig();
  return { ...real, get FEATURE_UPDATES() { return h.list; } };
});
const pushMessages = vi.fn(async (..._a: any[]) => true);
const sendEmail = vi.fn(async (..._a: any[]) => true);
vi.mock("./lineNotify", () => ({ pushMessages }));
vi.mock("./_core/notification", () => ({ sendEmail }));
vi.mock("./newsletter", () => ({ listNewsletterRecipients: async () => h.recipients }));

/** drizzle の sql`` から、埋め込んだ値だけを順に取り出す */
const paramsOf = (q: any): any[] => (q?.queryChunks ?? []).filter((c: any) => !(c && typeof c === "object" && Array.isArray(c.value)));
const textOf = (q: any): string => (q?.queryChunks ?? []).map((c: any) => (c && typeof c === "object" && Array.isArray(c.value) ? c.value.join("") : "?")).join("");

vi.mock("./db", () => ({
  getDb: async () => ({
    execute: async (q: any) => {
      const t = textOf(q);
      const p = paramsOf(q);
      if (t.includes("SELECT id FROM users WHERE role = 'admin'")) return [[{ id: 1 }]];
      if (t.includes("SELECT itemId, status, batchKey, previewedAt FROM featureUpdateItems")) {
        return [Array.from(h.items.entries()).map(([itemId, s]) => ({ itemId, ...s }))];
      }
      if (t.includes("INSERT INTO featureUpdateItems")) {
        h.items.set(String(p[0]), { status: "pending", batchKey: String(p[1]), previewedAt: new Date() });
        return [{ affectedRows: 1 }];
      }
      if (t.includes("UPDATE featureUpdateItems SET status =") && t.includes("status = 'pending'")) {
        // send: SET status = 'sending' … WHERE batchKey = ? / skip・drop: SET status = ? …
        const next = t.includes("'sending'") ? "sending" : String(p[0]);
        const key = String(p[p.length - 1]);
        let n = 0;
        for (const s of Array.from(h.items.values())) if (s.batchKey === key && s.status === "pending") { s.status = next; n++; }
        return [{ affectedRows: n }];
      }
      if (t.includes("SELECT itemId FROM featureUpdateItems WHERE batchKey")) {
        return [Array.from(h.items.entries()).filter(([, s]) => s.batchKey === String(p[0]) && s.status === "sending").map(([itemId]) => ({ itemId }))];
      }
      if (t.includes("UPDATE featureUpdateItems SET status = 'sent'")) {
        for (const s of Array.from(h.items.values())) if (s.batchKey === String(p[0]) && s.status === "sending") s.status = "sent";
        return [{ affectedRows: 1 }];
      }
      if (t.includes("SELECT itemId, userId FROM featureUpdateDeliveries")) {
        return [Array.from(h.deliveries).map((k) => { const [itemId, userId] = k.split(":"); return { itemId, userId: Number(userId) }; })];
      }
      if (t.includes("INSERT IGNORE INTO featureUpdateDeliveries")) {
        const k = `${p[0]}:${p[1]}`;
        if (h.deliveries.has(k)) return [{ affectedRows: 0 }];
        h.deliveries.add(k);
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 1 }];
    },
  }),
  getUserById: async (id: number) => ({ id, autoPostRequireApproval: true }),
  getSubscriptionByUserId: async (id: number) => ({ planId: id === 201 ? "pro" : "light", status: "active" }),
  // 201＝プロ・LINE、202＝ライト・LINE、203＝ライト・メールのみ、1＝運営（下見の送り先）
  getLineUserIdsForUser: async (id: number) => (id === 201 || id === 202 || id === 1 ? [`U${id}`] : []),
}));

const sentTo = (id: string) => pushMessages.mock.calls.filter((c: any[]) => c[0] === id);

describe("週1回の下見と送信", () => {
  beforeEach(() => {
    h.list = T;
    h.items.clear();
    h.deliveries.clear();
    h.recipients = [
      { userId: 201, name: "", email: "p@example.com" },
      { userId: 202, name: "", email: "l@example.com" },
      { userId: 203, name: "", email: "m@example.com" },
    ];
    pushMessages.mockClear();
    sendEmail.mockClear();
  });

  it("確かめずみの未送信が0件の週は、下見を出さない", async () => {
    h.list = [T[2]]; // 未確認だけ
    const { runFeatureUpdatesPreview } = await import("./featureUpdates");
    const r = await runFeatureUpdatesPreview({ now: Date.parse("2026-11-04T02:30:00Z") });
    expect(r.batchKey).toBeNull();
    expect(pushMessages).not.toHaveBeenCalled();
  });

  it("下見は三上様にだけ届き、お客様には届かない（押すまで送らない）。未確認の項目は入らない", async () => {
    const { runFeatureUpdatesPreview } = await import("./featureUpdates");
    const r = await runFeatureUpdatesPreview({ now: Date.parse("2026-11-04T02:30:00Z") });
    expect(r.batchKey).toBe("20261104");
    expect(r.items).toEqual(["a", "b"]);
    expect(pushMessages).toHaveBeenCalledTimes(1);
    expect((pushMessages.mock.calls[0] as any[])[0]).toBe("U1");
    expect(sendEmail).not.toHaveBeenCalled();
    const all = r.messages.join("\n");
    expect(all).not.toContain("未確認の項目");
    expect(all).toContain("プロ以上");
    expect(hasPictograph(all)).toBe(false);
  });

  it("「この内容で送る」：当てはまる項目だけ・LINEが無い方はメール。2回押しても1回だけ", async () => {
    const { runFeatureUpdatesPreview, decideFeatureUpdates } = await import("./featureUpdates");
    await runFeatureUpdatesPreview({ now: Date.parse("2026-11-04T02:30:00Z") });
    pushMessages.mockClear();
    const msg = await decideFeatureUpdates("20261104", "send", 1);
    expect(msg).toContain("LINE 2名・メール 1名");
    const pro = String((sentTo("U201")[0] as any[])[1][0].text);
    const light = String((sentTo("U202")[0] as any[])[1][0].text);
    expect(pro).toContain("プロ以上の項目");
    expect(light).not.toContain("プロ以上の項目");
    expect(String((sendEmail.mock.calls[0] as any[])[0].html)).toContain("全員の項目");
    expect(await decideFeatureUpdates("20261104", "send", 1)).toContain("すでに処理ずみ");
    expect(pushMessages).toHaveBeenCalledTimes(2);
    // 次の週：送った項目はもう下見に出ない
    pushMessages.mockClear();
    const r2 = await runFeatureUpdatesPreview({ now: Date.parse("2026-11-11T02:30:00Z") });
    expect(r2.batchKey).toBeNull();
    expect(pushMessages).not.toHaveBeenCalled();
  });

  it("同じ項目を同じ方へ二度送らない（すでに届いている方は飛ばす）", async () => {
    h.deliveries.add("a:202");
    const { runFeatureUpdatesPreview, decideFeatureUpdates } = await import("./featureUpdates");
    await runFeatureUpdatesPreview({ now: Date.parse("2026-11-04T02:30:00Z") });
    pushMessages.mockClear();
    const msg = await decideFeatureUpdates("20261104", "send", 1);
    expect(sentTo("U202")).toHaveLength(0); // ライトの方は「全員の項目」だけ＝届きずみ
    expect(msg).toContain("LINE 1名・メール 1名");
  });

  it("配信先は読み物と同じ一覧だけ（「不要」の方は一覧に入らないので届かない）", async () => {
    h.recipients = h.recipients.filter((r) => r.userId !== 202);
    const { runFeatureUpdatesPreview, decideFeatureUpdates } = await import("./featureUpdates");
    await runFeatureUpdatesPreview({ now: Date.parse("2026-11-04T02:30:00Z") });
    await decideFeatureUpdates("20261104", "send", 1);
    expect(sentTo("U202")).toHaveLength(0);
  });

  it("「今週は送らない」は来週の下見にもう一度入る・「この項目は出さない」は二度と出ない", async () => {
    const { runFeatureUpdatesPreview, decideFeatureUpdates } = await import("./featureUpdates");
    await runFeatureUpdatesPreview({ now: Date.parse("2026-11-04T02:30:00Z") });
    expect(await decideFeatureUpdates("20261104", "skip", 1)).toContain("来週");
    expect(sentTo("U201")).toHaveLength(0);
    const r2 = await runFeatureUpdatesPreview({ now: Date.parse("2026-11-11T02:30:00Z") });
    expect(r2.items).toEqual(["a", "b"]);
    // 古い週のボタンは効かない
    expect(await decideFeatureUpdates("20261104", "send", 1)).toContain("置き換わっています");
    expect(await decideFeatureUpdates("20261111", "drop", 1)).toContain("出しません");
    const r3 = await runFeatureUpdatesPreview({ now: Date.parse("2026-11-18T02:30:00Z") });
    expect(r3.batchKey).toBeNull();
    expect(sentTo("U201")).toHaveLength(0);
  });

  it("押されないまま1週間たてば、次の週の下見にもう一度入る（6日以内は出し直さない）", async () => {
    const { runFeatureUpdatesPreview } = await import("./featureUpdates");
    await runFeatureUpdatesPreview({ now: Date.parse("2026-11-04T02:30:00Z") });
    // 再起動などで同じ週にもう一度動いても出し直さない
    const again = await runFeatureUpdatesPreview({ now: Date.now() });
    expect(again.batchKey).toBeNull();
    for (const s of Array.from(h.items.values())) s.previewedAt = new Date(Date.now() - 7 * 86400_000);
    const next = await runFeatureUpdatesPreview({ now: Date.now() });
    expect(next.items).toEqual(["a", "b"]);
    expect(next.batchKey).not.toBeNull();
  });
});
