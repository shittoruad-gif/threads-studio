/**
 * 学習用アカウントの毎時の生成（2026-10-10 三上様「ムーブアクトと株式会社しっとるのアカウントは1日30投稿を目安に、
 * 最速でリーチを取れる投稿を早急に調べ上げてください」）。
 *
 * 毎時5分（JST 6:05〜22:05）に動き、次の約80分に入る学習の投稿だけを作る。
 *  - 1日の合計の目安は shared/learningAccounts.ts の LEARNING_BURST（4日で30本まで段を踏む）
 *  - 候補時刻は7:00〜23:20を目安の本数で等分した時刻。今日すでにある投稿と25分以上あく時刻だけ使う
 *    （何度動いても二重に作らない・朝の回の契約分とも重ならない）
 *  - 1日の合計が目安に届いたら作らない。冷却中・慣らし中・自動投稿OFF・契約終了は作らない
 *  - 作るのは「1つの条件だけ変えた投稿」（LEARNING_TRIALS）。書けなければその枠は見送る（補填しない）
 * 朝の回（autoPostScheduler）は学習の枠を作らない。
 */
import * as db from "./db";

export interface BurstResult { accountId: number; made: number; skipped: string | null }

export async function runLearningBurstOnce(now: Date = new Date()): Promise<BurstResult[]> {
  const { LEARNING_ACCOUNTS, burstTotalFor, burstGrid, burstSlotsToMake, inLearning, trialFor } = await import("../shared/learningAccounts");
  const { rampForAccount } = await import("./accountRampCheck");
  const { effectiveAccountSettings } = await import("../shared/accountSettings");
  const { canAutoPost } = await import("../shared/autoPostRequirements");
  const { generateAutoPost } = await import("./autoPostScheduler");
  const ymd = new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
  const total = burstTotalFor(ymd);
  const out: BurstResult[] = [];
  if (total == null) return out;
  for (const accountId of LEARNING_ACCOUNTS.accountIds) {
    const skip = (why: string) => { out.push({ accountId, made: 0, skipped: why }); console.log(`[LearningBurst] account=${accountId} とばす：${why}`); };
    try {
      if (!inLearning(accountId, now.getTime())) { skip("期間外"); continue; }
      const account: any = await db.getThreadsAccountById(accountId);
      if (!account || account.isActive === false) { skip("アカウントが無い・無効"); continue; }
      const user: any = await db.getUserById(Number(account.userId));
      if (!user) { skip("ユーザーが無い"); continue; }
      if (!(await db.hasServiceAccess(Number(user.id)))) { skip("使える契約が無い"); continue; }
      const eff: any = effectiveAccountSettings(user as any, account as any);
      if (!eff.autoPostEnabled) { skip("自動投稿OFF"); continue; }
      // 冷却中・慣らし中は rampForAccount が learning を0にする
      const r: any = await rampForAccount(account, 3);
      if (!(Number(r.learning ?? 0) > 0)) { skip(r.capped ? `抑えている日（${r.note}）` : "上乗せなし"); continue; }
      const projects = ((await db.getUserProjects(Number(user.id))) || []).filter((p: any) => !String(p.id).startsWith("demo_") && canAutoPost(p));
      const project = account.defaultProjectId ? projects.find((p: any) => p.id === account.defaultProjectId) : projects[0];
      if (!project) { skip("お店の情報が無い"); continue; }

      const already = await db.countAccountAutoPostsScheduledToday(accountId).catch(() => 0);
      const room = Math.max(0, total - already);
      if (room === 0) { skip(`今日は目安の${total}本に届いている`); continue; }
      const occupied = await db.getAccountScheduledTimesToday(accountId).catch(() => [] as Date[]);
      const grid = burstGrid(ymd, total);
      const from = now.getTime() + 15 * 60_000;
      const to = now.getTime() + 80 * 60_000;
      const slots = burstSlotsToMake(grid, occupied, from, to).slice(0, room);
      let made = 0;
      for (const at of slots) {
        const idx = grid.findIndex((g) => g.getTime() === at.getTime());
        const trial = trialFor(accountId, Math.max(0, idx), now.getTime());
        let ok = false;
        for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
          // 前の回で実は保存されていた場合に、同じ枠をもう1本作らない（2026-10-04 の枠の二重作成と同じ筋）
          if (attempt > 1) {
            const nowTimes = await db.getAccountScheduledTimesToday(accountId).catch(() => [] as Date[]);
            if (nowTimes.some((t) => Math.abs(t.getTime() - at.getTime()) < 60_000)) { ok = true; break; }
          }
          ok = await generateAutoPost(
            Number(user.id), project, idx, idx, accountId, idx,
            !!eff.autoPostRequireApproval, null, eff.postLength ?? null, at, null, attempt === 3, false,
            { learningTrial: trial } as any,
          );
        }
        console.log(`[LearningBurst] account=${accountId} ${new Date(at.getTime() + 9 * 3600_000).toISOString().slice(11, 16)} ${trial.key} → ${ok ? "作成" : "書けず見送り"}`);
        if (ok) made++;
        await new Promise((res) => setTimeout(res, 1500));
      }
      out.push({ accountId, made, skipped: null });
      console.log(`[LearningBurst] account=${accountId} 目安${total}本・今日${already}本 → 今回${made}/${slots.length}本`);
    } catch (e) {
      skip(`失敗：${(e as Error)?.message}`);
    }
  }
  return out;
}

let running = false;
export async function runLearningBurstJob(): Promise<void> {
  if (process.env.QA_SAFE_MODE === "1") return;
  // 前の回が長引いているあいだは重ねて動かさない（同じ枠を二重に作らない）
  if (running) { console.log("[LearningBurst] 前の回がまだ動いているため、今回はとばす"); return; }
  running = true;
  try { await runLearningBurstOnce(); } finally { running = false; }
}
