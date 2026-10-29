/**
 * Threads 連携の点検（2026-10-29 三上様「明確な連携ができているかの基準を定め、それをすべて確認する」をThreads Studioにも）。
 * 読むだけ。DBは変えない・お客様へは送らない。お客様の名前はこの画面にだけ出す（ファイルに残さない）。
 *
 *   eval "$(bash scripts/ops/prod-env.sh DATABASE_URL TOKEN_ENCRYPTION_KEY)"
 *   npx tsx scripts/ops/threads-link-audit.mts          … 問題のあるアカウントだけ
 *   npx tsx scripts/ops/threads-link-audit.mts --all    … 全部
 *
 * 基準（1つでも × ならその行を出す）：
 *   1 接続が生きている（Threads に聞いて自分の名前が返る）
 *   2 記録の @名前 と Threads の今の @名前 が同じ（名前を変えた・別のアカウントに入れ替わった、を見つける）
 *   3 接続の期限まで10日以上
 *   4 同じ Threads アカウントが、別の会員にもつながっていない
 *   5 契約（有料・お試し）が有効
 *   6 アカウントが2つ以上なら、どのお店の情報で投稿するかが決まっている
 *   7 自動投稿がONなら、直近3日に公開か予定がある
 *   8 返信の権限がある（コメントへの返事に要る。返信の権限を求めている会員だけ見る＝server/threadsAuth.ts wantsReplyScope）
 *   9 公式LINEとつながっている（案の確認・お知らせが届く）
 */
const ALL = process.argv.includes("--all");
const db = await import("../../server/db");
const d = await db.getDb();
const { sql } = await import("drizzle-orm");
if (!d) { console.error("DBに接続できません"); process.exit(1); }
const rows = (r: any): any[] => (Array.isArray(r?.[0]) ? r[0] : r ?? []);

const accts = rows(await d.execute(sql`
  SELECT ta.id, ta.userId, ta.threadsUserId, ta.threadsUsername, ta.tokenExpiresAt, ta.hasReplyScope, ta.defaultProjectId,
         u.storeName, u.name, u.isDemoMode, u.lineUserId IS NOT NULL AS line, u.role,
         (SELECT COUNT(*) FROM threadsAccounts t2 WHERE t2.userId = ta.userId AND t2.isActive = 1) nAccts,
         (SELECT COUNT(*) FROM threadsAccounts t3 WHERE t3.threadsUserId = ta.threadsUserId AND t3.isActive = 1 AND t3.userId <> ta.userId) dupOther,
         (SELECT GROUP_CONCAT(CONCAT(s.planId, ':', s.status)) FROM subscriptions s WHERE s.userId = ta.userId AND s.status IN ('active','trialing')
            AND NOT (s.cancelAtPeriodEnd = 1 AND s.currentPeriodEnd <= UTC_TIMESTAMP())) sub,
         (SELECT COUNT(*) FROM scheduledPosts sp WHERE sp.threadsAccountId = ta.id AND sp.status IN ('posted','pending','awaiting_approval','processing')
            AND sp.scheduledAt > UTC_TIMESTAMP() - INTERVAL 3 DAY) recent
  FROM threadsAccounts ta JOIN users u ON u.id = ta.userId
  WHERE ta.isActive = 1 AND u.isDemoMode = 0
  ORDER BY ta.userId, ta.id`));

const { effectiveAccountSettings } = await import("../../shared/accountSettings").catch(() => ({ effectiveAccountSettings: null as any }));
const out: string[] = [];
let bad = 0;
for (const a of accts) {
  const full: any = await db.getThreadsAccountById(Number(a.id)).catch(() => null);
  const token = full?.accessToken;
  let live = false, apiName: string | null = null, apiErr = "";
  if (token) {
    try {
      const res = await fetch(`https://graph.threads.net/v1.0/me?fields=id,username&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(15_000) });
      const j: any = await res.json().catch(() => ({}));
      if (res.ok && j?.id) { live = true; apiName = String(j.username ?? ""); } else apiErr = String(j?.error?.message ?? res.status).slice(0, 60);
    } catch (e) { apiErr = String((e as Error).message).slice(0, 60); }
  } else apiErr = "トークンなし";
  const days = a.tokenExpiresAt ? Math.floor((new Date(a.tokenExpiresAt).getTime() - Date.now()) / 864e5) : -1;
  const user: any = await db.getUserById(Number(a.userId)).catch(() => null);
  const lineIds: string[] = await db.getLineUserIdsForUser(Number(a.userId)).catch(() => []);
  const { wantsReplyScope } = await import("../../server/threadsAuth");
  const needReply = wantsReplyScope(Number(a.userId));
  const eff = effectiveAccountSettings && user ? effectiveAccountSettings(user, full ?? a) : { autoPostEnabled: true };
  const checks: [string, boolean, string][] = [
    ["1接続", live, live ? "" : apiErr],
    ["2名前", !live || apiName?.toLowerCase() === String(a.threadsUsername).toLowerCase(), live && apiName?.toLowerCase() !== String(a.threadsUsername).toLowerCase() ? `記録@${a.threadsUsername}→今@${apiName}` : ""],
    ["3期限", days >= 10, `あと${days}日`],
    ["4重複", Number(a.dupOther) === 0, Number(a.dupOther) ? `ほかの会員に${a.dupOther}件` : ""],
    ["5契約", !!a.sub || a.role === "admin", a.sub ? String(a.sub) : "契約なし"],
    ["6お店", Number(a.nAccts) < 2 || !!a.defaultProjectId, Number(a.nAccts) >= 2 && !a.defaultProjectId ? "どのお店で投稿するか未設定" : ""],
    ["7投稿", !eff?.autoPostEnabled || Number(a.recent) > 0, eff?.autoPostEnabled && Number(a.recent) === 0 ? "直近3日 0本" : ""],
    ["8返信", !needReply || !!a.hasReplyScope, needReply && !a.hasReplyScope ? "返信の権限なし（接続のやり直しで付く）" : ""],
    ["9LINE", lineIds.length > 0, lineIds.length ? "" : "公式LINE未連携"],
  ];
  const ng = checks.filter((c) => !c[1]);
  if (ng.length) bad++;
  if (!ALL && ng.length === 0) continue;
  out.push(`${ng.length ? "×" : "○"} acc${a.id} user${a.userId} ${a.storeName || a.name || ""} @${a.threadsUsername}  ${ng.map((c) => `${c[0]}（${c[2]}）`).join(" / ") || "すべて○"}`);
}
console.log(`Threads 連携の点検 ${new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ")}（${accts.length}アカウント・要確認 ${bad}）`);
for (const l of out) console.log(l);
process.exit(0);
