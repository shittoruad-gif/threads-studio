/**
 * 投稿時間の試験の途中経過（読み取りのみ）。
 *
 *   npx tsx scripts/ops/posting-time-report.mts
 *
 * 2026-09-24 三上様「本当にどの時間が一番伸びるのか、一回テストしてほしい」「朝7時から1時間単位で実験してみて」。
 * 対象4アカウント（shared/postingTimeTest.ts）の試験期間の投稿を、公開した時間帯ごとに比べる。
 *
 * 見方:
 *   - アカウントごとに表示の桁が違う（玉島は平均150前後、しっとる公式は20前後）ので、
 *     全体の比較は「そのアカウントの試験期間の中央値に対して何倍か」で並べる（1.00＝いつもどおり）。
 *   - 公開から24時間たった投稿だけを数える（伸びている途中の投稿を混ぜない）。
 *   - 時間は17日で一巡するように回しているので、曜日や日ごとの波は各時間に均等に乗る。
 *   - 1時間ごとだと本数が少ないので、3時間ずつの帯でも並べる（帯のほうが先に判断できる）。
 */
const db = await import("../../server/db");
const d = await db.getDb();
const { sql } = await import("drizzle-orm");
const { POSTING_TIME_TEST } = await import("../../shared/postingTimeTest");
if (!d) { console.error("DBに接続できません"); process.exit(1); }

const { start, end, hours } = POSTING_TIME_TEST;
const ids = POSTING_TIME_TEST.accountIds.join(",");

const rows: any[] = (await d.execute(sql`
  SELECT a.id acc, a.threadsUsername name,
         HOUR(CONVERT_TZ(s.scheduledAt, '+00:00', '+09:00')) h,
         p.impressions imp, p.likes lk, p.replies rp
  FROM scheduledPosts s
  JOIN threadsAccounts a ON a.id = s.threadsAccountId
  JOIN postAnalytics p ON p.threadsPostId = s.publishedThreadsPostId AND p.userId = s.userId
  WHERE s.threadsAccountId IN (${sql.raw(ids)})
    AND s.status = 'posted'
    AND CONVERT_TZ(s.postedAt, '+00:00', '+09:00') >= ${start}
    AND CONVERT_TZ(s.postedAt, '+00:00', '+09:00') < DATE_ADD(${end}, INTERVAL 1 DAY)
    AND s.postedAt < NOW() - INTERVAL 24 HOUR`))[0] as any;

if (rows.length === 0) {
  console.log(`投稿時間の試験（${start}〜${end}）の投稿で、公開から24時間たったものはまだありません。`);
  process.exit(0);
}

// 時間帯は「予定した時刻」で数える（試験で割り当てた時間そのもの。公開が数分遅れてもずれない）
const bucket = (h: number) => h;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length === 0 ? 0 : s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

const accs = Array.from(new Set(rows.map((r) => +r.acc)));
const med = new Map<number, number>();
for (const a of accs) med.set(a, Math.max(1, median(rows.filter((r) => +r.acc === a).map((r) => +r.imp))));

console.log(`■ 投稿時間の試験（${start}〜${end}・公開から24時間たった投稿 ${rows.length}本）\n`);

console.log("【4アカウント合算】いつもの表示（各アカウントの中央値）に対して何倍か");
const pooled = [...hours].map((h) => {
  const xs = rows.filter((r) => bucket(+r.h) === h);
  return { h, n: xs.length, ratio: avg(xs.map((r) => +r.imp / med.get(+r.acc)!)), rp: avg(xs.map((r) => +r.rp)) };
}).sort((a, b) => b.ratio - a.ratio);
for (const p of pooled) {
  console.log(`  ${String(p.h).padStart(2)}時台：${p.n}本　${p.n ? p.ratio.toFixed(2) + "倍" : "—"}　返信 平均${p.rp.toFixed(1)}`);
}

console.log("\n【4アカウント合算・3時間ずつの帯】");
const BANDS: [number, number][] = [[7, 9], [10, 12], [13, 15], [16, 18], [19, 21], [22, 23]];
const bandRows = BANDS.map(([lo, hi]) => {
  const xs = rows.filter((r) => +r.h >= lo && +r.h <= hi);
  return { lo, hi, n: xs.length, ratio: avg(xs.map((r) => +r.imp / med.get(+r.acc)!)), m: median(xs.map((r) => +r.imp / med.get(+r.acc)!)) };
}).sort((a, b) => b.ratio - a.ratio);
for (const b of bandRows) {
  console.log(`  ${String(b.lo).padStart(2)}〜${b.hi}時台：${b.n}本　${b.n ? b.ratio.toFixed(2) + "倍（中央値 " + b.m.toFixed(2) + "倍）" : "—"}`);
}

for (const a of accs) {
  const mine = rows.filter((r) => +r.acc === a);
  console.log(`\n【@${mine[0].name}】${mine.length}本・中央値 ${Math.round(med.get(a)!)}`);
  for (const h of hours) {
    const xs = mine.filter((r) => bucket(+r.h) === h);
    if (xs.length === 0) { console.log(`  ${String(h).padStart(2)}時台：0本`); continue; }
    console.log(`  ${String(h).padStart(2)}時台：${xs.length}本　平均表示 ${Math.round(avg(xs.map((r) => +r.imp)))}　中央値 ${Math.round(median(xs.map((r) => +r.imp)))}　いいね ${avg(xs.map((r) => +r.lk)).toFixed(1)}　返信 ${avg(xs.map((r) => +r.rp)).toFixed(1)}`);
  }
  const off = mine.filter((r) => !hours.includes(bucket(+r.h) as any));
  if (off.length) console.log(`  （候補外の時間に予定された投稿 ${off.length}本：試験の前日から持ち越した分・承認待ちのずらし等。比較には入れていない）`);
}

console.log(`\n※ 1周目（〜${POSTING_TIME_TEST.firstRoundEnd}・1時間あたり合算12本）は途中の見立て。2周目（〜${end}・合算24本）で結論を出す。帯（3時間）は1周目でも判断してよい。`);
console.log("※ 1本だけ飛び抜けた投稿があると平均が引っぱられる。平均と中央値の両方が高い時間帯を「伸びる時間」とみなす。");
process.exit(0);
