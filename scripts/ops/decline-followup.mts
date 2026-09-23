/**
 * 見送りが続くお客様の徹底フォロー（2026-09-24 三上様指示）を、手で回す。
 * ふだんは毎晩20:30に自動で動く（server/dailyOpsJobs.ts の decline_followup）。
 *
 * 夜間整備で使う場面：
 *   ホームページが登録されていない方（LINEに「ホームページが登録されていません」と届いた方）を、
 *   店名・地域で検索して見つけたら、そのURLを渡して案を作り、三上様のLINEへ送る。
 *   お店の情報は、三上様が「足す」を押すまで変わらない。
 *
 * 使い方（SSHトンネルを張ってから）:
 *   nc -z localhost 13308 || ssh -fN -L 13308:10.0.1.7:3306 root@163.44.103.9
 *   eval "$(bash scripts/ops/prod-env.sh DATABASE_URL BUILT_IN_FORGE_API_KEY BUILT_IN_FORGE_API_URL LINE_NOTIFY_CHANNEL_ACCESS_TOKEN LINE_NOTIFY_CHANNEL_SECRET)"
 *   npx tsx scripts/ops/decline-followup.mts --list                       # 対象の一覧だけ
 *   npx tsx scripts/ops/decline-followup.mts --account 21 --url https://… --dry   # 案を作って表示だけ
 *   npx tsx scripts/ops/decline-followup.mts --account 21 --url https://…         # 案を記録して三上様へ送る
 */
import "dotenv/config";

const args = process.argv.slice(2);
const val = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const { listRepeatDecliners, runDeclineFollowup } = await import("../../server/declineFollowup");

if (args.includes("--list")) {
  const list = await listRepeatDecliners();
  for (const t of list) console.log(`acc${t.accountId} @${t.username}（${t.userName}） 見送り${t.declines}回／公開${t.published}件`);
  console.log(`--- ${list.length}件 ---`);
  process.exit(0);
}

const r = await runDeclineFollowup({
  accountId: val("--account") ? Number(val("--account")) : undefined,
  url: val("--url"),
  dryRun: args.includes("--dry"),
});
for (const m of r.messages) console.log("────────\n" + m);
console.log(`\n対象${r.checked}件・三上様へ${r.sent}通${args.includes("--dry") ? "（--dry：記録も送信もしていません）" : ""}`);
process.exit(0);
