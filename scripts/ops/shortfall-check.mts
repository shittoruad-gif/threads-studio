/**
 * 「ご契約の本数どおりに届いているか」を全クライアント分まとめて確かめる（読み取りのみ）。
 *
 *   npx tsx scripts/ops/shortfall-check.mts [--days 7]
 *
 * 2026-09-23 三上様指示「このようなエラーが発生する可能性がある場合は、
 * 毎日のアップデートの際に、きちんとこちらに報告するようにしてください」。
 *
 * ★きっかけ：梅原様 @daigo.sekkotsuin。停止からの再開後に本数を1日1件へ手で絞り、
 *   慣らし運転が明けた9/13に契約どおり（1日3件）へ戻すのを失念した。
 *   10日間だれも気づかず、お客様からのご指摘で発覚した。36件不足していた。
 *
 * ★このスクリプトは直さない。見つけたら三上様に報告し、指示を待つ。
 *
 * 見ているもの
 *   1. アカウント個別の本数が、ご契約の上限より少ないまま置かれている（いちばんの原因）
 *   2. 冷却中／慣らし運転中（正常だが、明けたら戻っているかを見るため出す）
 *   3. 連携からの累計で、契約どおりなら何件のはずが何件だったか（不足の実数）
 *
 * 必要なenv: DATABASE_URL（本番はトンネル 127.0.0.1:13308）
 */
const days = Number(process.argv[process.argv.indexOf("--days") + 1]) || 7;

const db = await import("../../server/db");
const d = await db.getDb();
const { sql } = await import("drizzle-orm");
if (!d) { console.error("DBに接続できません"); process.exit(1); }

const { getPlan, resolveEffectivePlanId } = await import("../../shared/plans");
const { effectiveAccountSettings } = await import("../../shared/accountSettings");
const { accountAgeDays, rampCap } = await import("../../shared/accountRamp");

const FREQ: Record<string, number> = { daily: 1, twice_daily: 2, three_daily: 3 };
const JST = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

type Row = {
  level: "要判断" | "確認";
  user: string; account: string; what: string; detail: string;
};
const found: Row[] = [];

const accts: any[] = (await d.execute(sql`
  SELECT a.id, a.userId, a.threadsUsername, a.createdAt, a.autoPostEnabled, a.autoPostFrequency,
         a.cooldownUntil, a.extraPostsPerDay, a.extraPostsUntil, a.deletedShortfall,
         u.name AS userName, u.autoPostFrequency AS commonFreq, u.autoPostEnabled AS commonEnabled
  FROM threadsAccounts a JOIN users u ON u.id = a.userId
  WHERE a.isActive <> 0 AND (u.isDemoMode IS NULL OR u.isDemoMode = 0)`))[0] as any;

for (const a of accts) {
  const sub: any = await db.getSubscriptionByUserId(a.userId);
  const plan = getPlan(resolveEffectivePlanId(sub?.planId, sub?.status));
  const planMax = Number(plan?.features?.maxAutoPostsPerDay ?? 0);
  if (planMax <= 0) continue; // 自動投稿の無いプランは対象外

  const eff = effectiveAccountSettings(
    { autoPostEnabled: a.commonEnabled, autoPostFrequency: a.commonFreq } as any,
    a as any,
  );
  if (!eff.autoPostEnabled) continue; // 自動投稿OFFはご本人の意思
  const want = Math.min(FREQ[eff.autoPostFrequency] ?? 1, planMax);
  const who = `${a.userName}(${a.userId})`;
  const acct = `@${a.threadsUsername}`;

  // 1. アカウント個別の設定が、契約の上限より少ないまま置かれている
  if (a.autoPostFrequency && want < planMax) {
    const ageDays = accountAgeDays(a.createdAt);
    const ramp = rampCap(planMax, a.createdAt);
    const note = ramp.capped
      ? `いまは慣らし運転中（連携${ageDays}日・上限${ramp.count}件）なので、明けたら戻す`
      : `慣らし運転は明けている（連携${ageDays}日）。**戻し忘れの可能性**`;
    found.push({
      level: ramp.capped ? "確認" : "要判断",
      user: who, account: acct,
      what: `アカウント個別の設定が1日${want}件（ご契約は1日${planMax}件まで）`,
      detail: note,
    });
  }

  // 2. 冷却中・補填中（正常だが、明けたら戻っているかを見る）
  if (a.cooldownUntil) {
    const until = JST(a.cooldownUntil);
    if (until >= JST(new Date())) {
      found.push({ level: "確認", user: who, account: acct,
        what: `冷却中（${until}まで1日1件）`,
        detail: "明けた翌日に、契約どおりの本数に戻っているかを確かめる" });
    }
  }

  // 3. 連携からの累計で、契約どおりなら何件のはずが何件だったか
  const since = JST(a.createdAt);
  const cnt: any = (await d.execute(sql`
    SELECT COUNT(*) n FROM scheduledPosts
    WHERE threadsAccountId = ${a.id} AND status = 'posted'
      AND scheduledAt >= ${since}`))[0] as any;
  const posted = Number(cnt[0]?.n ?? 0);
  const elapsed = Math.max(0, accountAgeDays(a.createdAt)); // 今日を含まない
  if (elapsed >= 3) {
    // 慣らし運転で意図的に少ない分は引く（設計どおりなので「不足」と呼ばない）
    let expected = 0;
    for (let i = 0; i < elapsed; i++) {
      const at = new Date(new Date(a.createdAt).getTime() + i * 86400000).getTime();
      expected += rampCap(planMax, a.createdAt, at).count;
    }
    const short = expected - posted;
    if (short >= planMax) { // 1日分以上足りない時だけ出す
      found.push({
        level: short >= planMax * 3 ? "要判断" : "確認",
        user: who, account: acct,
        what: `連携からの累計が ${short}件 足りない`,
        detail: `${since} からの${elapsed}日間：慣らし運転を織り込むと${expected}件のはずが${posted}件。` +
          (a.extraPostsPerDay ? `補填 +${a.extraPostsPerDay}件/日（${a.extraPostsUntil ? JST(a.extraPostsUntil) : "期限なし"}まで）設定ずみ` : "補填は未設定"),
      });
    }
  }
}

if (found.length === 0) {
  console.log(`ご契約の本数どおりに届いています（アカウント${accts.length}件）。`);
  process.exit(0);
}
const order = { 要判断: 0, 確認: 1 } as const;
found.sort((x, y) => order[x.level] - order[y.level] || x.user.localeCompare(y.user));
console.log(`■ 契約の本数に届いていない可能性 ${found.length}件（アカウント${accts.length}件）\n`);
console.log("★ここでは直しません。三上様のご判断を仰いでから対応してください。\n");
let cur = "";
for (const f of found) {
  if (f.user !== cur) { console.log(`\n【${f.user}】`); cur = f.user; }
  console.log(`  [${f.level}] ${f.account}　${f.what}`);
  console.log(`         ${f.detail}`);
}
process.exit(0);
