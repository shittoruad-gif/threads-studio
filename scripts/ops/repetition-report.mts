/**
 * 同じ投稿に見せないルールの見張り（M1〜M3）を手で見る。読むだけ・誰にも知らせない。
 *   使い方: eval "$(bash scripts/ops/prod-env.sh DATABASE_URL)"; npx tsx scripts/ops/repetition-report.mts
 */
const { measureAllAccounts, repetitionReportText } = await import('../../server/repetitionMonitor');
const list = await measureAllAccounts();
console.log(repetitionReportText(list));
process.exit(0);
