// 「案を確認しやすい時間」をお客様にお尋ねする（shared/reviewTime.ts・2026-09-24 三上様指示）。
// ★お客様に届く送信。三上様の明示の承諾を得てから --send を付けて実行すること（付けなければ表示だけ）。
//
//   npx tsx scripts/ops/ask-review-time.mts --users=4667,3500
//   npx tsx scripts/ops/ask-review-time.mts --users=4667,3500 --send
//   npx tsx scripts/ops/ask-review-time.mts --approval-users          … 公開前確認ありの全員を表示
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const send = process.argv.includes("--send");
const db = await import("../../server/db");
const { REVIEW_HOUR_OPTIONS, REVIEW_HOUR_QUESTION } = await import("../../shared/reviewTime");
const { textWithQuick } = await import("../../server/lineChat");
const { sql } = await import("drizzle-orm");

let ids: number[] = (arg("users") ?? "").split(",").map(Number).filter(Boolean);
if (process.argv.includes("--approval-users")) {
  const d = (await db.getDb())!;
  const rows: any = await d.execute(sql`
    SELECT DISTINCT u.id FROM users u JOIN threadsAccounts a ON a.userId = u.id AND a.isActive = 1
    JOIN subscriptions s ON s.userId = u.id AND s.status IN ('active','trialing')
    WHERE COALESCE(a.autoPostRequireApproval, u.autoPostRequireApproval) = 1
      AND COALESCE(a.autoPostEnabled, u.autoPostEnabled) = 1`);
  ids = ((rows as any)[0] as any[]).map((r) => Number(r.id));
}
if (ids.length === 0) { console.error("--users か --approval-users が必要です"); process.exit(1); }
const msg = textWithQuick(REVIEW_HOUR_QUESTION, [
  ...REVIEW_HOUR_OPTIONS.map((o) => ({ label: o.label, data: `rt=${o.hour}` })),
  { label: "決まっていない", data: "rt=none" },
]);
console.log(REVIEW_HOUR_QUESTION + "\n［" + REVIEW_HOUR_OPTIONS.map((o) => o.label).join("／") + "／決まっていない］\n");
const { pushMessages } = await import("../../server/lineNotify");
for (const id of ids) {
  const u: any = await db.getUserById(id);
  const lineIds = await db.getLineUserIdsForUser(id);
  console.log(`userId=${id} ${u?.name ?? ""} いまの設定=${u?.reviewHour ?? "未設定"} LINE ${lineIds.length}件`);
  if (!send) continue;
  let ok = 0;
  for (const l of lineIds) if (await pushMessages(l, [msg])) ok++;
  console.log(`  → 送信 ${ok}／${lineIds.length}`);
}
if (!send) console.log("\n（確認のみ。送るときは --send）");
process.exit(0);
