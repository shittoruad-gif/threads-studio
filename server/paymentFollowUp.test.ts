import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runPaymentFollowUp } from './paymentFollowUp';
import * as db from './db';
import * as notification from './_core/notification';
import * as univapay from './univapay';

vi.mock('./db', () => ({
  getSubscriptionsWithPaymentIssues: vi.fn(),
  updateSubscription: vi.fn(),
  getUserById: vi.fn(),
}));

vi.mock('./_core/notification', () => ({
  sendPaymentFailedEmail: vi.fn().mockResolvedValue(true),
  sendSubscriptionStoppedEmail: vi.fn().mockResolvedValue(true),
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

vi.mock('./univapay', () => ({
  cancelSubscription: vi.fn().mockResolvedValue(undefined),
}));

const NOW = new Date('2026-07-10T00:30:00Z'); // 9:30 JST
const DAY = 24 * 60 * 60 * 1000;

function makeSub(overrides: Partial<any> = {}) {
  return {
    id: 10,
    userId: 1,
    planId: 'light',
    univapaySubscriptionId: 'sub_abc',
    status: 'past_due',
    failedPaymentCount: 1,
    firstFailedPaymentAt: new Date(NOW.getTime() - 1 * DAY),
    lastFailedPaymentAt: new Date(NOW.getTime() - 1 * DAY),
    lastDunningReminderAt: null,
    updatedAt: new Date(NOW.getTime() - 1 * DAY),
    ...overrides,
  };
}

const user = { id: 1, email: 'sensei@example.com', name: '院長先生' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.getUserById).mockResolvedValue(user as any);
});

describe('決済失敗フォローアップ（dunning）', () => {
  it('猶予期間内・未督促 → 督促メール送信＋lastDunningReminderAt更新', async () => {
    vi.mocked(db.getSubscriptionsWithPaymentIssues).mockResolvedValue([makeSub()] as any);

    await runPaymentFollowUp(NOW);

    expect(notification.sendPaymentFailedEmail).toHaveBeenCalledTimes(1);
    const args = vi.mocked(notification.sendPaymentFailedEmail).mock.calls[0];
    expect(args[0]).toBe('sensei@example.com');
    // カード再登録リンク（ライトの Univapay リンク）が渡されている
    expect(args[5]).toMatch(/^https:\/\/univa\.cc\//);
    expect(db.updateSubscription).toHaveBeenCalledWith(10, { lastDunningReminderAt: NOW });
    expect(notification.sendSubscriptionStoppedEmail).not.toHaveBeenCalled();
  });

  it('前回督促から2日未満 → 再送しない', async () => {
    vi.mocked(db.getSubscriptionsWithPaymentIssues).mockResolvedValue([
      makeSub({ lastDunningReminderAt: new Date(NOW.getTime() - 1 * DAY) }),
    ] as any);

    await runPaymentFollowUp(NOW);

    expect(notification.sendPaymentFailedEmail).not.toHaveBeenCalled();
    expect(db.updateSubscription).not.toHaveBeenCalled();
  });

  it('前回督促から2日以上 → 再送する', async () => {
    vi.mocked(db.getSubscriptionsWithPaymentIssues).mockResolvedValue([
      makeSub({
        firstFailedPaymentAt: new Date(NOW.getTime() - 4 * DAY),
        lastDunningReminderAt: new Date(NOW.getTime() - 2 * DAY),
      }),
    ] as any);

    await runPaymentFollowUp(NOW);

    expect(notification.sendPaymentFailedEmail).toHaveBeenCalledTimes(1);
  });

  it('初回失敗から7日超 → Univapay解約＋canceled化＋停止メール＋運営通知', async () => {
    vi.mocked(db.getSubscriptionsWithPaymentIssues).mockResolvedValue([
      makeSub({ firstFailedPaymentAt: new Date(NOW.getTime() - 8 * DAY), failedPaymentCount: 3 }),
    ] as any);

    await runPaymentFollowUp(NOW);

    expect(univapay.cancelSubscription).toHaveBeenCalledWith('sub_abc');
    expect(db.updateSubscription).toHaveBeenCalledWith(10, {
      status: 'canceled',
      cancelAtPeriodEnd: false,
    });
    expect(notification.sendSubscriptionStoppedEmail).toHaveBeenCalledTimes(1);
    expect(notification.notifyOwner).toHaveBeenCalledTimes(1);
    // 停止した場合は督促メールは送らない
    expect(notification.sendPaymentFailedEmail).not.toHaveBeenCalled();
  });

  it('Univapay解約が失敗してもアプリ側の停止処理は続行する', async () => {
    vi.mocked(univapay.cancelSubscription).mockRejectedValueOnce(new Error('api down'));
    vi.mocked(db.getSubscriptionsWithPaymentIssues).mockResolvedValue([
      makeSub({ firstFailedPaymentAt: new Date(NOW.getTime() - 8 * DAY) }),
    ] as any);

    await runPaymentFollowUp(NOW);

    expect(db.updateSubscription).toHaveBeenCalledWith(10, {
      status: 'canceled',
      cancelAtPeriodEnd: false,
    });
    expect(notification.sendSubscriptionStoppedEmail).toHaveBeenCalledTimes(1);
  });

  it('incomplete（登録途中）は督促対象外', async () => {
    vi.mocked(db.getSubscriptionsWithPaymentIssues).mockResolvedValue([
      makeSub({ status: 'incomplete' }),
    ] as any);

    await runPaymentFollowUp(NOW);

    expect(notification.sendPaymentFailedEmail).not.toHaveBeenCalled();
    expect(db.updateSubscription).not.toHaveBeenCalled();
  });

  it('メールアドレスの無いユーザーはスキップ', async () => {
    vi.mocked(db.getUserById).mockResolvedValue({ id: 1, email: null } as any);
    vi.mocked(db.getSubscriptionsWithPaymentIssues).mockResolvedValue([makeSub()] as any);

    await runPaymentFollowUp(NOW);

    expect(notification.sendPaymentFailedEmail).not.toHaveBeenCalled();
  });

  it('1件目の処理が失敗しても2件目は処理される', async () => {
    vi.mocked(db.getUserById)
      .mockRejectedValueOnce(new Error('db error'))
      .mockResolvedValueOnce(user as any);
    vi.mocked(db.getSubscriptionsWithPaymentIssues).mockResolvedValue([
      makeSub({ id: 10, userId: 1 }),
      makeSub({ id: 11, userId: 2 }),
    ] as any);

    await runPaymentFollowUp(NOW);

    expect(notification.sendPaymentFailedEmail).toHaveBeenCalledTimes(1);
  });
});
