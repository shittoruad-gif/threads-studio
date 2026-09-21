/**
 * フォロワー数の日次スナップショットを手で取る（運営用）。
 *
 * 毎日7:00の analytics_snapshot（server/dailyOpsJobs.ts）が同じことをするが、
 * 2026-09-21 まで取り口が誤っていて followerSnapshots が空だったため、
 * 反映を待たずに当日分の基準値を取りたいときに使う。
 *
 *   eval "$(bash scripts/ops/prod-env.sh DATABASE_URL TOKEN_ENCRYPTION_KEY)"
 *   npx tsx scripts/ops/snapshot-followers.mts          # 今日の分を記録
 *   npx tsx scripts/ops/snapshot-followers.mts --dry    # 取得するだけ（書き込まない）
 *
 * 本番のDBに書くのは followerSnapshots だけで、お客様への送信は一切しない。
 */
import * as db from "../../server/db";
import { getThreadsUserCounts } from "../../server/threadsApi";

const dry = process.argv.includes("--dry");
const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10); // JST

// 毎朝7:00のジョブと同じ辿り方（getThreadsAccountsByUserId はトークンを復号して返す）
const users = await db.getAllUsers();
const accounts: any[] = [];
for (const u of users as any[]) {
  for (const a of await db.getThreadsAccountsByUserId(u.id)) accounts.push(a);
}
console.log(`対象 ${accounts.length}件 / capturedOn=${today}${dry ? "（--dry：書き込みません）" : ""}`);

let ok = 0;
const failed: string[] = [];

for (const a of accounts) {
  if (!a.accessToken) {
    failed.push(`@${a.threadsUsername}（トークンなし）`);
    continue;
  }

  const { followersCount, ok: got } = await getThreadsUserCounts(a.accessToken, a.threadsUserId);
  if (!got) {
    failed.push(`@${a.threadsUsername}（取得できず）`);
    continue;
  }

  console.log(`  @${a.threadsUsername}: ${followersCount}`);
  if (!dry) {
    await db.upsertFollowerSnapshot({
      userId: a.userId,
      threadsAccountId: a.id,
      followersCount,
      capturedOn: today,
    });
  }
  ok++;
}

console.log(`\n記録 ${ok}件 / 取得できず ${failed.length}件`);
if (failed.length) console.log("  " + failed.join("\n  "));
process.exit(0);
