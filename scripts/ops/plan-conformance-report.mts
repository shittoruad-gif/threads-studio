/**
 * 全クライアントのプランと、プランどおりに機能が使えているかの点検（読むだけ・誰にも送らない・2026-10-07 三上様指示）。
 *   使い方: eval "$(bash scripts/ops/prod-env.sh DATABASE_URL)"; npx tsx scripts/ops/plan-conformance-report.mts
 *   見るもの：アカウント・お店・LINE連携の数と上限／AI生成の上限／アカウントごとの自動投稿の設定と1日の本数／直近7日の日別の公開数（見送り・失敗）／Meta AI呼びかけ
 */
import { writeFileSync } from 'node:fs';
const db:any = await import("../../server/db"); const d:any = await db.getDb(); const { sql } = await import("drizzle-orm");
const q=async(s:any)=>(await d.execute(s))[0] as any[];
const { getPlan, resolveEffectivePlanId, PLANS } = await import("../../shared/plans");
const { effectiveAccountSettings } = await import("../../shared/accountSettings");
const cnt = (f:string)=> f==='three_daily'?3: f==='twice_daily'?2:1;
const users = await q(sql`SELECT id, name, role, autoPostEnabled, autoPostRequireApproval, autoPublishIfNoResponse, autoPostFrequency, postLength, metaAiAskEnabled FROM users`);
const rows:any[] = []; const acctRows:any[] = [];
for (const u of users) {
  const access = await db.hasServiceAccess(u.id); const grace = await db.isFreeGrace(u.id); const ended = await db.isEndedCustomer(u.id); const dunning = await db.isInDunning(u.id);
  const sub = await db.getSubscriptionByUserId(u.id);
  if (!sub && !grace) continue;
  const eff = resolveEffectivePlanId(sub?.planId, sub?.status);
  const plan:any = await db.withFreeGrace(u.id, getPlan(eff));
  const F = plan?.features ?? {};
  const accts = await q(sql`SELECT id, threadsUsername, autoPostEnabled, autoPostRequireApproval, autoPostFrequency, postLength, createdAt, defaultProjectId, metaAiCallPausedAt, cooldownUntil FROM threadsAccounts WHERE userId=${u.id} AND isActive=1`);
  const projects = (await q(sql`SELECT COUNT(*) n FROM projects WHERE userId=${u.id} AND id NOT LIKE 'demo_%'`))[0].n;
  const links = (await q(sql`SELECT COUNT(*) n FROM userLineLinks WHERE userId=${u.id}`))[0].n;
  const ai = await db.getAiGenerationUsage(u.id);
  const issues:string[] = [];
  const lim = (n:number,max:number)=> max!==-1 && n>max;
  if (lim(accts.length, F.maxThreadsAccounts)) issues.push(`アカウント${accts.length}>上限${F.maxThreadsAccounts}`);
  if (lim(Number(projects), F.maxProjects)) issues.push(`お店${projects}>上限${F.maxProjects}`);
  if (lim(Number(links), F.maxLineLinks)) issues.push(`LINE${links}>上限${F.maxLineLinks}`);
  if (ai.limit !== F.maxAiGenerations && !(F.maxAiGenerations===-1 && ai.limit===-1)) issues.push(`AI上限 表示${ai.limit}≠プラン${F.maxAiGenerations}`);
  for (const a of accts) {
    const e = effectiveAccountSettings({ autoPostEnabled: !!u.autoPostEnabled, autoPostRequireApproval: !!u.autoPostRequireApproval, autoPostFrequency: u.autoPostFrequency, postLength: u.postLength } as any,
      { autoPostEnabled: a.autoPostEnabled==null?null:!!a.autoPostEnabled, autoPostRequireApproval: a.autoPostRequireApproval==null?null:!!a.autoPostRequireApproval, autoPostFrequency: a.autoPostFrequency, postLength: a.postLength } as any);
    const perDay = Math.min(cnt(e.autoPostFrequency), F.maxAutoPostsPerDay ?? 0);
    const days = await q(sql`SELECT DATE(CONVERT_TZ(scheduledAt,'+00:00','+09:00')) day, SUM(status='posted') posted, SUM(status='canceled') canceled, SUM(status='awaiting_approval') awaiting, SUM(status='failed') failed, COUNT(DISTINCT COALESCE(choiceGroupId, CONCAT('id',id))) slots
      FROM scheduledPosts WHERE threadsAccountId=${a.id} AND source='auto' AND scheduledAt >= UTC_TIMESTAMP() - INTERVAL 7 DAY AND scheduledAt < UTC_TIMESTAMP() - INTERVAL 3 HOUR GROUP BY day ORDER BY day`);
    const ageDays = Math.floor((Date.now()-new Date(a.createdAt).getTime())/864e5);
    acctRows.push({ user:u.id, plan: eff, acct:a.id, u:a.threadsUsername, 自動:e.autoPostEnabled, 確認:e.autoPostRequireApproval, 設定回数:cnt(e.autoPostFrequency), プラン上限:F.maxAutoPostsPerDay, 一日の本数:perDay, 連携日数:ageDays,
      日別公開: days.map((x:any)=>`${String(x.day).slice(5)}:${x.posted}/${x.slots}${Number(x.canceled)?`(見送${x.canceled})`:''}${Number(x.failed)?`(失敗${x.failed})`:''}`).join(' '),
      MetaAI: (F.maxAutoPostsPerDay??0)>=2 && u.metaAiAskEnabled!==0 ? (a.metaAiCallPausedAt?'止':'有') : '対象外', 店:a.defaultProjectId?'あり':'なし' });
    if (access && (F.maxAutoPostsPerDay??0) > 0 && e.autoPostEnabled && cnt(e.autoPostFrequency) < F.maxAutoPostsPerDay) issues.push(`acct${a.id} 設定が1日${cnt(e.autoPostFrequency)}回（プランは${F.maxAutoPostsPerDay}回）`);
    if (access && (F.maxAutoPostsPerDay??0) > 0 && !e.autoPostEnabled) issues.push(`acct${a.id} 自動投稿OFF`);
  }
  rows.push({ user:u.id, role:u.role, 契約:sub?`${sub.planId}/${sub.status}`:'なし', 実効:eff+(grace?'(猶予)':''), 使える:access, 解約:ended, 決済確認中:dunning, アカウント:`${accts.length}/${F.maxThreadsAccounts}`, お店:`${projects}/${F.maxProjects}`, LINE:`${links}/${F.maxLineLinks}`, AI上限:`${ai.limit}`, 問題: issues.join(' ／ ') });
}
console.table(rows);
console.table(acctRows);
writeFileSync(process.env.OUT || '/dev/null', JSON.stringify({rows, acctRows}, null, 1));
process.exit(0);
