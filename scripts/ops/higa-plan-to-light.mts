/**
 * 比嘉先生のプランをライトプランへ変更する（サブスク期間終了後に実行）。
 *
 * 使い方:
 *   # 1. SSHトンネルを張る
 *   nc -z localhost 13308 || ssh -fN -L 13308:10.0.1.7:3306 root@163.44.103.9
 *   # 2. 本番のDATABASE_URLを取得してexport
 *   eval "$(bash scripts/ops/prod-env.sh DATABASE_URL)"
 *   # 3. dry-run で確認（実際には変更しない）
 *   DATABASE_URL=$DATABASE_URL npx tsx scripts/ops/higa-plan-to-light.mts --dry-run
 *   # 4. 本番実行
 *   DATABASE_URL=$DATABASE_URL npx tsx scripts/ops/higa-plan-to-light.mts
 *
 * やること:
 *   - users テーブルから 比嘉 を含む名前/メールのユーザーを探す
 *   - subscriptions テーブルで現在のサブスク情報を確認する
 *   - currentPeriodEnd が現在時刻より前なら planId を 'light' に変更する
 *   - UnivaPay の解約は別途手動で行うこと（二重課金防止のためここでは行わない）
 */

const dryRun = process.argv.includes('--dry-run');

const db = await import("../../server/db");
const d = await db.getDb();
if (!d) { console.error("DB接続失敗"); process.exit(1); }

const { sql } = await import("drizzle-orm");

// ─── 1. 比嘉先生を検索 ───
const users: any = await d.execute(
  sql`SELECT id, name, email, role, createdAt FROM users
      WHERE name LIKE '%比嘉%' OR name LIKE '%ひが%' OR email LIKE '%higa%'
      ORDER BY id`
);
const userRows = (users as any)[0] ?? users;

console.log(`\n=== 比嘉先生 候補ユーザー ===`);
if (!userRows.length) {
  console.log("見つかりませんでした。メールアドレスで再確認してください。");
  process.exit(0);
}

for (const u of userRows) {
  console.log(`  id=${u.id}  name="${u.name}"  email=${u.email}  role=${u.role}  createdAt=${u.createdAt}`);
}

// 候補が複数いる場合は最初の1件のみを対象（確認してから実行すること）
const targetUser = userRows[0];
console.log(`\n対象: id=${targetUser.id} / ${targetUser.name} / ${targetUser.email}`);

// ─── 2. サブスク情報を確認 ───
const subs: any = await d.execute(
  sql`SELECT id, planId, status, currentPeriodEnd, cancelAtPeriodEnd, univapaySubscriptionId, campaignChargeCount
      FROM subscriptions WHERE userId = ${targetUser.id} ORDER BY id DESC LIMIT 1`
);
const subRows = (subs as any)[0] ?? subs;
const sub = subRows[0];

if (!sub) {
  console.log("サブスクリプションが見つかりません。フリープランで登録されています。");
  process.exit(0);
}

const now = new Date();
const periodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;

console.log(`\n=== 現在のサブスク ===`);
console.log(`  subscriptionId  : ${sub.id}`);
console.log(`  planId          : ${sub.planId}`);
console.log(`  status          : ${sub.status}`);
console.log(`  currentPeriodEnd: ${periodEnd ? periodEnd.toISOString() : "(null)"}`);
console.log(`  cancelAtPeriodEnd: ${sub.cancelAtPeriodEnd}`);
console.log(`  univapayId      : ${sub.univapaySubscriptionId}`);
console.log(`  campaignCharge  : ${sub.campaignChargeCount}`);
console.log(`  現在時刻        : ${now.toISOString()}`);

if (sub.planId === 'light') {
  console.log("\n既にライトプランです。変更不要。");
  process.exit(0);
}

// ─── 3. 期間終了チェック ───
if (periodEnd && periodEnd > now) {
  const diff = Math.ceil((periodEnd.getTime() - now.getTime()) / 1000 / 60 / 60 / 24);
  console.log(`\nサブスク期間中です（あと約${diff}日）。期間終了後に再実行してください。`);
  console.log(`期間終了予定: ${periodEnd.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} JST`);
  process.exit(0);
}

// ─── 4. プラン変更実行 ───
console.log(`\n${dryRun ? "[DRY-RUN] " : ""}プランを ${sub.planId} → light に変更します...`);

if (!dryRun) {
  await d.execute(
    sql`UPDATE subscriptions SET
          planId = 'light',
          status = 'active',
          cancelAtPeriodEnd = 0,
          currentPeriodEnd = NULL,
          campaignChargeCount = 0
        WHERE id = ${sub.id}`
  );
  // 自動投稿頻度はライトプランの上限（1日1回）に合わせて下げる（任意）
  // ライトプランは maxAutoPostsPerDay=1 なので、三_daily設定のままでもスケジューラが自動で上限適用する
  // 変更不要。

  console.log("変更完了。");
  console.log(`\n注意: UnivaPay（${sub.univapaySubscriptionId ?? "不明"}）の定期課金は手動で解約が必要です。`);
  console.log("二重課金防止のため、UnivaPay管理画面で確認してください。");
  console.log("https://app.univapay.com/");
} else {
  console.log("[DRY-RUN] 変更はしませんでした。--dry-run なしで再実行すると反映されます。");
}

process.exit(0);
