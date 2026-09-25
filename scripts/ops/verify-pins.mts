/**
 * 固定投稿のピン留めを、Threadsの公開プロフィールで実際に確かめる（2026-09-25 三上様指示
 * 「固定投稿がピン留め（未確認となっているが、できているパターンもある）されているかなど、まずすべて確認して」）。
 *
 *   npx tsx scripts/ops/verify-pins.mts            … 確認だけ（DBは変えない）
 *   npx tsx scripts/ops/verify-pins.mts --apply    … ピン留めを確認できたアカウントを「確認済み」にする
 *   npx tsx scripts/ops/verify-pins.mts --all      … 確認済みのアカウントも含めて見る
 *
 * ★なぜMacで動かすか：プロフィールの投稿はブラウザで描かれるため、サーバーの取得（HTML）には入っていない。
 *   ログイン無しの公開プロフィールに「ピン留め済み」が出るので、Mac の Chrome（ヘッドレス）で読む。
 * ★「確認済み」にするだけで、外すことはしない（読み込み失敗を「外れた」と取り違えないため）。
 * ★ピン留めされているのがご本人の別の投稿でも「ピン留めはできている」として確認済みにする（案内を止めるため）。
 *   当サービスの固定投稿かどうかは報告に書く。
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const puppeteer = require("/Users/kabushikikaishashitsutoru/CODE/service-catalog/deck/node_modules/puppeteer-core");

const APPLY = process.argv.includes("--apply");
const ALL = process.argv.includes("--all");

const db = await import("../../server/db");
const d = await db.getDb();
const { sql } = await import("drizzle-orm");
if (!d) { console.error("DBに接続できません"); process.exit(1); }
const q = async (s: any) => ((await d.execute(s))[0] as any[]);

const accounts = await q(sql`
  SELECT a.id, a.userId, a.threadsUsername, a.pinnedPostConfirmedAt, u.name, u.email,
    (SELECT COUNT(*) FROM threadsAccounts a2 WHERE a2.userId = a.userId AND a2.isActive = 1) AS activeCount
  FROM threadsAccounts a JOIN users u ON u.id = a.userId
  WHERE a.isActive = 1 ${ALL ? sql`` : sql`AND a.pinnedPostConfirmedAt IS NULL`}
    AND u.email NOT LIKE '%@example.com' AND u.email NOT LIKE '%meta-review%' AND u.name NOT LIKE '%Reviewer%'

  ORDER BY a.userId, a.id`);

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new", args: ["--no-sandbox", "--lang=ja-JP"],
});
const page = await browser.newPage();
await page.setExtraHTTPHeaders({ "Accept-Language": "ja" });
await page.setViewport({ width: 1200, height: 1600 });

let confirmed = 0;
console.log(`■ 固定投稿のピン留め確認（${accounts.length}アカウント${APPLY ? "・確認できたものは記録します" : "・確認のみ"}）\n`);
for (const a of accounts) {
  const who = `${a.name ?? a.email}　@${a.threadsUsername}`;
  try {
    await page.goto(`https://www.threads.com/@${a.threadsUsername}`, { waitUntil: "networkidle2", timeout: 45000 });
    await new Promise((r) => setTimeout(r, 2500));
    const lines: string[] = (await page.evaluate(() => document.body.innerText)).split("\n").map((s: string) => s.trim()).filter(Boolean);
    if (lines.some((l) => /このページは利用できません|Sorry, this page isn't available/.test(l))) { console.log(`・${who}：プロフィールが開けません（非公開・削除の可能性）`); continue; }
    const i = lines.indexOf("ピン留め済み");
    if (i < 0) {
      // 投稿が読めていないだけの可能性があるので、投稿らしい行が出ているかも書く
      const loaded = lines.includes("スレッド");
      console.log(`・${who}：ピン留めなし${loaded ? "" : "（読み込めていない可能性）"}`);
      continue;
    }
    // ピン留め済みの下：ユーザー名・（話題タグ）・日付・本文…の順。日付の次の行からを本文とみなす
    const after = lines.slice(i + 1, i + 14);
    const di = after.findIndex((l) => /^(\d{4}\/\d{2}\/\d{2}|\d+(分|時間|日))$/.test(l));
    const bodyLines = after.slice(di >= 0 ? di + 1 : 1);
    const body = bodyLines.join("").replace(/\s+/g, "");
    const ours = await q(sql`SELECT postContent FROM scheduledPosts WHERE threadsAccountId = ${a.id} AND angle = 'pinned' AND status = 'posted'`);
    // 当サービスの固定投稿か：こちらの本文の先頭から10文字ずつ3か所のどれかが一致すれば同じ投稿とみなす
    const isOurs = ours.some((r: any) => {
      const c = String(r.postContent ?? "").replace(/\s+/g, "");
      return [0, 10, 20].some((k) => c.length >= k + 10 && body.includes(c.slice(k, k + 10)));
    });
    console.log(`・${who}：ピン留め済み（${ours.length === 0 ? "こちらで作った固定投稿の公開記録なし" : isOurs ? "Threads Studio の固定投稿" : "Threads Studio の固定投稿とは別の投稿"}）「${bodyLines.join(" ").slice(0, 40)}」`);
    if (APPLY && !a.pinnedPostConfirmedAt) {
      await d.execute(sql`UPDATE threadsAccounts SET pinnedPostConfirmedAt = CURRENT_TIMESTAMP WHERE id = ${a.id} AND pinnedPostConfirmedAt IS NULL`);
      if (Number(a.activeCount) === 1) await d.execute(sql`UPDATE users SET pinnedPostConfirmedAt = CURRENT_TIMESTAMP WHERE id = ${a.userId} AND pinnedPostConfirmedAt IS NULL`);
      confirmed++;
    }
  } catch (e) {
    console.log(`・${who}：確認できませんでした（${String((e as Error)?.message).slice(0, 60)}）`);
  }
}
await browser.close();
if (APPLY) console.log(`\n確認済みにした：${confirmed}アカウント`);
process.exit(0);
