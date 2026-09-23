/**
 * 勉強会の型の試験（三上様のアカウント）の途中経過（読み取りのみ）。
 *
 *   npx tsx scripts/ops/study-experiment-report.mts
 *
 * 2026-09-24 三上様「ムーブアクトと株式会社しっとるのアカウントは私のアカウントになるので、
 * いろいろ試してみてください。明らかに危ないのは絶対やめてください」。
 * 試験開始（2026-09-24）以降の投稿を、試験用の切り口とそれ以外に分けて比べる。
 * 公開から24時間たった投稿だけを数える（表示がまだ伸びている途中の投稿を混ぜない）。
 */
const db = await import("../../server/db");
const d = await db.getDb();
const { sql } = await import("drizzle-orm");
const { STUDY_EXPERIMENT_ANGLES, STUDY_EXPERIMENT_USER_IDS } = await import("../../shared/postAngles");
if (!d) { console.error("DBに接続できません"); process.exit(1); }

const START = "2026-09-24";
const EXP = new Set([...STUDY_EXPERIMENT_ANGLES.map((a) => a.id), "failure_story", "opinion"]);
const LABEL: Record<string, string> = Object.fromEntries(STUDY_EXPERIMENT_ANGLES.map((a) => [a.id, a.label]));
LABEL.failure_story = "失敗談（試験：店舗）"; LABEL.opinion = "持論（試験：店舗）";

const rows: any[] = (await d.execute(sql`
  SELECT a.threadsUsername acct, s.angle, p.impressions imp, p.likes lk, p.replies rp
  FROM scheduledPosts s
  JOIN threadsAccounts a ON a.id = s.threadsAccountId
  JOIN postAnalytics p ON p.threadsPostId = s.publishedThreadsPostId AND p.userId = s.userId
  WHERE s.userId IN (${sql.raw(STUDY_EXPERIMENT_USER_IDS.join(","))})
    AND s.status = 'posted' AND s.postedAt >= ${START}
    AND s.postedAt < NOW() - INTERVAL 24 HOUR`))[0] as any;

if (rows.length === 0) {
  console.log(`試験（${START}〜）の投稿で、公開から24時間たったものはまだありません。`);
  process.exit(0);
}
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
const avg1 = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0);

console.log(`■ 勉強会の型の試験（${START}〜・公開から24時間たった投稿）\n`);
for (const acct of Array.from(new Set(rows.map((r) => r.acct)))) {
  const mine = rows.filter((r) => r.acct === acct);
  const exp = mine.filter((r) => EXP.has(r.angle));
  const rest = mine.filter((r) => !EXP.has(r.angle));
  console.log(`【@${acct}】 試験 ${exp.length}本：平均表示 ${avg(exp.map((r) => +r.imp))}・返信 ${avg1(exp.map((r) => +r.rp))}　／　それ以外 ${rest.length}本：平均表示 ${avg(rest.map((r) => +r.imp))}・返信 ${avg1(rest.map((r) => +r.rp))}`);
  const by = new Map<string, any[]>();
  for (const r of exp) { const l = by.get(r.angle) ?? []; l.push(r); by.set(r.angle, l); }
  const list = Array.from(by.entries()).sort((a, b) => avg(b[1].map((r) => +r.imp)) - avg(a[1].map((r) => +r.imp)));
  for (const [id, xs] of list) {
    console.log(`    ${LABEL[id] ?? id}：${xs.length}本・平均表示 ${avg(xs.map((r) => +r.imp))}・いいね ${avg1(xs.map((r) => +r.lk))}・返信 ${avg1(xs.map((r) => +r.rp))}`);
  }
}
console.log("\n※ 1つの型につき5本以上そろうまでは、たまたまの差が大きいので判断しない。");
process.exit(0);
