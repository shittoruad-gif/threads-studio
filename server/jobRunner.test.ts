import { describe, it, expect, vi, beforeEach } from 'vitest';
import { lastScheduledOccurrence, runTrackedJob } from './jobRunner';
import * as db from './db';
import * as notification from './_core/notification';

vi.mock('./db', () => ({
  getJobRun: vi.fn(),
  recordJobRun: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./_core/notification', () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

describe('lastScheduledOccurrence（直近の実行予定時刻）', () => {
  it('JST 6:00 の日次ジョブ: 予定時刻を過ぎた後は当日分を返す', () => {
    // 2026-07-02 09:00 JST = 00:00 UTC
    const now = new Date('2026-07-02T00:00:00Z');
    const occ = lastScheduledOccurrence({ hour: 6, minute: 0, tzOffsetHours: 9 }, now);
    // 当日6:00 JST = 前日21:00 UTC
    expect(occ.toISOString()).toBe('2026-07-01T21:00:00.000Z');
  });

  it('JST 6:00 の日次ジョブ: 予定時刻前は前日分を返す', () => {
    // 2026-07-02 05:00 JST = 前日20:00 UTC
    const now = new Date('2026-07-01T20:00:00Z');
    const occ = lastScheduledOccurrence({ hour: 6, minute: 0, tzOffsetHours: 9 }, now);
    expect(occ.toISOString()).toBe('2026-06-30T21:00:00.000Z');
  });

  it('UTC 9:30 の日次ジョブ（決済フォロー）', () => {
    const now = new Date('2026-07-02T10:00:00Z');
    const occ = lastScheduledOccurrence({ hour: 9, minute: 30, tzOffsetHours: 0 }, now);
    expect(occ.toISOString()).toBe('2026-07-02T09:30:00.000Z');
  });

  it('週次（月曜0:00 UTC）: 水曜時点では直近の月曜を返す', () => {
    // 2026-07-01 は水曜
    const now = new Date('2026-07-01T12:00:00Z');
    const occ = lastScheduledOccurrence({ hour: 0, minute: 0, tzOffsetHours: 0, weekday: 1 }, now);
    // 直近の月曜 = 2026-06-29
    expect(occ.toISOString()).toBe('2026-06-29T00:00:00.000Z');
    expect(occ.getUTCDay()).toBe(1);
  });
});

describe('runTrackedJob（実行記録＋失敗通報）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('成功時: success を記録し通報しない', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    await runTrackedJob('test_job_ok', fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(db.recordJobRun).toHaveBeenCalledWith('test_job_ok', 'success');
    expect(notification.notifyOwner).not.toHaveBeenCalled();
  });

  it('失敗時: error を記録し運営へ通報する（ジョブ自体は throw しない）', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(runTrackedJob('test_job_fail', fn)).resolves.toBeUndefined();
    expect(db.recordJobRun).toHaveBeenCalledWith(
      'test_job_fail',
      'error',
      expect.stringContaining('boom'),
    );
    expect(notification.notifyOwner).toHaveBeenCalledTimes(1);
  });

  it('同一ジョブの失敗通報は24時間に1回まで', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'));
    await runTrackedJob('test_job_dedup', fn);
    await runTrackedJob('test_job_dedup', fn);
    expect(notification.notifyOwner).toHaveBeenCalledTimes(1);
    // 記録自体は毎回行われる
    expect(db.recordJobRun).toHaveBeenCalledTimes(2);
  });
});
