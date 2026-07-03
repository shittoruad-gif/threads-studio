/**
 * バックグラウンドジョブの実行追跡＆起動時キャッチアップ
 *
 * 目的：
 *  1) デプロイ再起動とcron発火時刻が重なって「その日のジョブが丸ごと飛ぶ」事故を防ぐ。
 *     各ジョブの最終実行を jobRuns テーブルに記録し、サーバ起動時に
 *     「直近の実行予定時刻を過ぎているのに未実行」のジョブを追い実行する。
 *  2) ジョブの失敗を運営（メール＋LINE）へ通報する（同一ジョブは1日1回まで）。
 *
 * 冪等性メモ：
 *  - 実行記録は成功/失敗を問わず更新する（失敗の連続再実行ループを防ぐ）。
 *  - 初回デプロイはマイグレーションで「今実行済み」をシードするため、
 *    キャッチアップの暴発（当日分の二重実行）は起きない。
 */
import { getJobRun, recordJobRun } from './db';

type TrackedJob = {
  name: string;
  /** 実行予定時刻（tzOffsetHours のタイムゾーンでの時・分） */
  hour: number;
  minute: number;
  /** 固定タイムゾーンオフセット（JST=9, UTC=0）。node-cron側の設定と一致させること */
  tzOffsetHours: number;
  /** 週次ジョブは曜日（0=日..6=土, tz基準）。日次は undefined */
  weekday?: number;
  /** 実行予定からこの時間を過ぎていたらキャッチアップしない（次の定期実行に任せる） */
  maxStalenessHours: number;
  run: () => Promise<unknown>;
};

// 失敗通報の1日1回制限（プロセス内。再起動でリセットされるが通知過多よりまし）
const lastFailureNotifiedAt = new Map<string, number>();
const FAILURE_NOTIFY_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * ジョブを実行し、結果を jobRuns に記録。失敗時は運営に通報（1日1回まで）。
 * cron本体・キャッチアップの両方がこれを通ることで記録が一元化される。
 */
export async function runTrackedJob(name: string, fn: () => Promise<unknown>): Promise<void> {
  console.log(`[JobRunner] ${name} 実行開始`);
  try {
    await fn();
    await recordJobRun(name, 'success');
    console.log(`[JobRunner] ${name} 完了`);
  } catch (e) {
    const msg = e instanceof Error ? (e.stack ?? e.message) : String(e);
    console.error(`[JobRunner] ${name} 失敗:`, msg);
    try {
      await recordJobRun(name, 'error', msg.slice(0, 2000));
    } catch {}
    // 運営通報（メール＋LINE）。通知自体の失敗でジョブを巻き込まない。
    const last = lastFailureNotifiedAt.get(name) ?? 0;
    if (Date.now() - last > FAILURE_NOTIFY_INTERVAL_MS) {
      lastFailureNotifiedAt.set(name, Date.now());
      try {
        const { notifyOwner } = await import('./_core/notification');
        await notifyOwner({
          title: `🚨 バックグラウンドジョブ失敗: ${name}`,
          content: `ジョブ「${name}」の実行が失敗しました。\n\nエラー:\n${msg.slice(0, 1500)}\n\n※同一ジョブの通報は24時間に1回までです。サーバログも確認してください。`,
        });
      } catch (notifyErr) {
        console.error('[JobRunner] 失敗通報の送信にも失敗:', notifyErr);
      }
    }
  }
}

/** tz固定オフセットでの「直近の実行予定時刻」（now以前で最新のもの）を返す */
export function lastScheduledOccurrence(
  job: Pick<TrackedJob, 'hour' | 'minute' | 'tzOffsetHours' | 'weekday'>,
  now: Date = new Date(),
): Date {
  const offMs = job.tzOffsetHours * 3600_000;
  const tzNow = new Date(now.getTime() + offMs); // tzローカル時刻をUTCフィールドで扱う
  let cand = new Date(
    Date.UTC(tzNow.getUTCFullYear(), tzNow.getUTCMonth(), tzNow.getUTCDate(), job.hour, job.minute) - offMs,
  );
  if (cand.getTime() > now.getTime()) cand = new Date(cand.getTime() - 24 * 3600_000);
  if (job.weekday !== undefined) {
    while (new Date(cand.getTime() + offMs).getUTCDay() !== job.weekday) {
      cand = new Date(cand.getTime() - 24 * 3600_000);
    }
  }
  return cand;
}

/** 登録ジョブ一覧（cron設定と時刻・TZを必ず一致させること） */
async function jobRegistry(): Promise<TrackedJob[]> {
  const { processAutoPostGeneration } = await import('./autoPostScheduler');
  const { checkTrialReminders } = await import('./trialReminder');
  const { runPaymentFollowUp } = await import('./paymentFollowUp');
  const { runWeeklyReportBatch } = await import('./weeklyReport');
  const { runAnalyticsSnapshotJob, runApprovalReminderJob } = await import('./dailyOpsJobs');
  // 日次ジョブの maxStalenessHours は 23h。周期(24h)より短いので二重実行はせず、
  // かつ「起動が発火時刻をまたいで遅れても、その日のうちなら必ず追い実行」できる
  // （＝丸ごと飛ぶ穴を塞ぐ）。実行が多少遅れても害の無いジョブばかりのため許容。
  return [
    // dailyOpsJobs: '0 22 * * *' UTC（7:00 JST）
    { name: 'analytics_snapshot', hour: 22, minute: 0, tzOffsetHours: 0, maxStalenessHours: 23, run: runAnalyticsSnapshotJob },
    // dailyOpsJobs: '0 23 * * *' UTC（8:00 JST）
    { name: 'approval_reminder', hour: 23, minute: 0, tzOffsetHours: 0, maxStalenessHours: 23, run: runApprovalReminderJob },
    // autoPostScheduler: '0 6 * * *' timezone Asia/Tokyo
    { name: 'auto_post_generation', hour: 6, minute: 0, tzOffsetHours: 9, maxStalenessHours: 23, run: processAutoPostGeneration },
    // trialReminder: '0 9 * * *'（TZ指定なし＝サーバローカル。コンテナはUTC）
    { name: 'trial_reminder', hour: 9, minute: 0, tzOffsetHours: 0, maxStalenessHours: 23, run: checkTrialReminders },
    // paymentFollowUp: '30 9 * * *'（同上UTC）
    { name: 'payment_follow_up', hour: 9, minute: 30, tzOffsetHours: 0, maxStalenessHours: 23, run: runPaymentFollowUp },
    // weeklyReport: '0 0 * * 1' UTC（月曜9:00 JST）。週次なので長めでも二重実行しない。
    { name: 'weekly_report', hour: 0, minute: 0, tzOffsetHours: 0, weekday: 1, maxStalenessHours: 72, run: runWeeklyReportBatch },
  ];
}

/**
 * 起動時キャッチアップ：直近の実行予定を過ぎているのに記録がないジョブを追い実行。
 * サーバ起動から少し待ってから（DB接続・他の初期化が落ち着いてから）呼ぶこと。
 */
export async function catchUpMissedJobs(now: Date = new Date()): Promise<void> {
  let jobs: TrackedJob[];
  try {
    jobs = await jobRegistry();
  } catch (e) {
    console.error('[JobRunner] レジストリ初期化失敗:', e);
    return;
  }
  for (const job of jobs) {
    try {
      const scheduled = lastScheduledOccurrence(job, now);
      const ageHours = (now.getTime() - scheduled.getTime()) / 3600_000;
      if (ageHours > job.maxStalenessHours) continue; // 古すぎ→次の定期実行に任せる

      const rec = await getJobRun(job.name);
      const lastRun = rec?.lastRunAt ? new Date(rec.lastRunAt) : null;
      if (lastRun && lastRun.getTime() >= scheduled.getTime()) continue; // 実行済み

      console.log(
        `[JobRunner] キャッチアップ実行: ${job.name}（予定=${scheduled.toISOString()} 最終実行=${lastRun?.toISOString() ?? 'なし'}）`,
      );
      await runTrackedJob(job.name, job.run);
    } catch (e) {
      console.error(`[JobRunner] ${job.name} キャッチアップ判定エラー:`, e);
    }
  }
}
