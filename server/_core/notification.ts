import { Resend } from "resend";
import { escapeHtml } from "../../shared/sanitize";

export type NotificationPayload = {
  title: string;
  content: string;
};

export type EmailPayload = {
  to: string;
  subject: string;
  html: string;
};

let _resend: Resend | null = null;

function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) {
    return null;
  }
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

function getFromEmail(): string {
  const domain = process.env.RESEND_FROM_DOMAIN;
  if (domain && domain !== "resend.dev") {
    return `Threads Studio <noreply@${domain}>`;
  }
  return "Threads Studio <onboarding@resend.dev>";
}

/**
 * Send an email via Resend
 */
export async function sendEmail(payload: EmailPayload): Promise<boolean> {
  // 送信結果を管理画面「契約・メール」用に記録する（記録失敗は送信に影響させない）
  const log = async (status: 'sent' | 'failed' | 'skipped', error?: string) => {
    try {
      const db = await import('../db');
      await db.insertEmailLog({
        toEmail: payload.to,
        subject: payload.subject,
        body: payload.html,
        status,
        error: error ?? null,
      });
    } catch { /* ログ失敗は無視 */ }
  };

  const resend = getResend();
  if (!resend) {
    console.log("[Email] Skipped - RESEND_API_KEY not configured");
    await log('skipped', 'RESEND_API_KEY not configured');
    return false;
  }

  try {
    const { error } = await resend.emails.send({
      from: getFromEmail(),
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
    });

    if (error) {
      console.warn("[Email] Failed to send:", error);
      await log('failed', JSON.stringify(error).slice(0, 1000));
      return false;
    }

    console.log(`[Email] Sent to ${payload.to}: ${payload.subject}`);
    await log('sent');
    return true;
  } catch (err) {
    console.warn("[Email] Error:", err);
    await log('failed', String(err).slice(0, 1000));
    return false;
  }
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(to: string, resetToken: string, baseUrl: string): Promise<boolean> {
  const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;
  return sendEmail({
    to,
    subject: "【Threads Studio】パスワードリセット",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>パスワードリセット</h2>
        <p>以下のリンクをクリックして、新しいパスワードを設定してください。</p>
        <a href="${resetUrl}" style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin: 16px 0;">
          パスワードをリセット
        </a>
        <p style="color: #666; font-size: 14px;">このリンクは1時間有効です。</p>
        <p style="color: #666; font-size: 14px;">心当たりがない場合は、このメールを無視してください。</p>
      </div>
    `,
  });
}

/**
 * Send email verification email
 */
export async function sendVerificationEmail(to: string, token: string, baseUrl: string): Promise<boolean> {
  const verifyUrl = `${baseUrl}/verify-email?token=${token}`;
  return sendEmail({
    to,
    subject: "【Threads Studio】メールアドレスの確認",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>メールアドレスの確認</h2>
        <p>Threads Studioへのご登録ありがとうございます。</p>
        <p>以下のリンクをクリックして、メールアドレスを確認してください。</p>
        <a href="${verifyUrl}" style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin: 16px 0;">
          メールアドレスを確認
        </a>
      </div>
    `,
  });
}

/**
 * Send trial ending reminder
 */
export async function sendTrialReminderEmail(to: string, daysLeft: number, planName: string): Promise<boolean> {
  // ★旧 Railway URL がハードコードされていたバグを修正。
  // 本番ドメインは APP_BASE_URL（環境変数）から取得し、未設定時のみ
  // threads.shittoru.com にフォールバックする。
  const baseUrl = process.env.APP_BASE_URL || process.env.VITE_APP_URL || 'https://threads.shittoru.com';
  return sendEmail({
    to,
    subject: `【Threads Studio】無料トライアルがあと${daysLeft}日で終了します`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>無料トライアル期限のお知らせ</h2>
        <p>${planName}の無料トライアルがあと<strong>${daysLeft}日</strong>で終了します。</p>
        <p>トライアル終了後も引き続きご利用いただくには、有料プランへの移行をお願いいたします。</p>
        <a href="${baseUrl}/pricing" style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin: 16px 0;">
          プランを確認する
        </a>
      </div>
    `,
  });
}

/**
 * 運営（管理者）へLINEでプッシュ通知する。
 * LINE Messaging API の push を使用（LINE Notifyは2025/3終了のため不可）。
 *   - LINE_CHANNEL_ACCESS_TOKEN: Messagingチャネルの長期アクセストークン
 *   - LINE_ADMIN_TARGET_ID: 送信先のグループID or ユーザーID
 * どちらか未設定なら何もしない（メール通知は別途動く）。
 */
export async function notifyLine(title: string, content: string): Promise<boolean> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const to = process.env.LINE_ADMIN_TARGET_ID;
  if (!token || !to) return false;
  try {
    // LINEのテキストは1通5000文字上限。余裕を持って切り詰める。
    const text = `${title}\n\n${content}`.slice(0, 4900);
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ to, messages: [{ type: 'text', text }] }),
    });
    if (!res.ok) {
      console.error(`[Notification] LINE push失敗 status=${res.status}: ${await res.text().catch(() => '')}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[Notification] LINE push例外:', e);
    return false;
  }
}

/**
 * Legacy notifyOwner - 管理者へメール＋LINEで通知する
 */
export async function notifyOwner(payload: NotificationPayload): Promise<boolean> {
  console.log(`[Notification] ${payload.title}: ${payload.content}`);
  // ADMIN_NOTIFICATION_EMAIL が設定されていれば、そこへもメールを送る
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (adminEmail) {
    // ★#24 ユーザ由来データを HTML に直接 interpolate しないよう escape する
    const safeTitle = escapeHtml(payload.title);
    const safeContent = escapeHtml(payload.content);
    await sendEmail({
      to: adminEmail,
      subject: `[Threads Studio Admin] ${payload.title}`,
      html: `<div style="font-family: sans-serif;"><h2>${safeTitle}</h2><pre style="white-space: pre-wrap;">${safeContent}</pre></div>`,
    });
  }
  // LINE設定があればLINEにも通知（メール失敗と切り離して実行）。
  await notifyLine(payload.title, payload.content);
  return true;
}

// ─────────────────────────────────────────────────────────────────────────
// 決済関連メール（カード期限切れ・決済失敗・3Dセキュア認証必須）
// ─────────────────────────────────────────────────────────────────────────

const APP_BASE_URL =
  process.env.APP_BASE_URL ||
  'https://threads.shittoru.com';

/**
 * 共通の見た目テンプレート
 */
function emailShell(title: string, body: string, ctaLabel?: string, ctaUrl?: string): string {
  const cta = ctaLabel && ctaUrl
    ? `<a href="${ctaUrl}" style="display: inline-block; background: #ef4444; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin: 16px 0; font-weight: bold;">${ctaLabel}</a>`
    : '';
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #f9fafb;">
      <div style="background: white; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <h2 style="color: #1f2937; margin-top: 0;">${title}</h2>
        ${body}
        ${cta}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #9ca3af; font-size: 12px;">
          このメールは Threads Studio の決済システムから自動送信されています。<br />
          お心当たりがない場合は、お手数ですがサポートまでご連絡ください。
        </p>
      </div>
    </div>
  `;
}

/**
 * 決済失敗通知メール
 *
 * Stripe が定期決済を引き落とそうとして失敗したときに送る。
 * Stripe は標準で 14 日間で 3〜4 回リトライするので、
 * その都度（ステータスが past_due の間）このメールを送る。
 *
 * @param to ユーザのメールアドレス
 * @param planName プラン名（「Pro」など）
 * @param amount 請求額（円）
 * @param attemptCount これが何回目の失敗か（1〜4 を想定）
 * @param nextRetryAt 次回リトライ予定日（ある場合）
 */
export async function sendPaymentFailedEmail(
  to: string,
  planName: string,
  amount: number | null,
  attemptCount: number,
  nextRetryAt: Date | null,
  updateUrl?: string | null,
): Promise<boolean> {
  // カード更新＝Univapayのリンクフォームで再登録する運用のため、
  // プラン固有の再登録リンクが渡された場合はそれを優先する。
  const portalUrl = updateUrl || `${APP_BASE_URL}/settings`;
  const amountStr = amount != null ? `¥${amount.toLocaleString('ja-JP')}` : '';
  const retryStr = nextRetryAt
    ? `<p>次回の自動リトライは <strong>${nextRetryAt.toLocaleDateString('ja-JP')}</strong> に行われます。</p>`
    : '';
  // 何回目かでメッセージのトーンを変える
  const urgency =
    attemptCount >= 3
      ? '<p style="color:#dc2626;"><strong>※ 何度かリトライを試みていますが決済できていません。最終リトライまでに更新がない場合、サブスクリプションは自動的に停止します。</strong></p>'
      : attemptCount >= 2
      ? '<p style="color:#d97706;"><strong>※ 引き落としに失敗しています。お早めにカード情報を更新してください。</strong></p>'
      : '<p>カードの有効期限切れ・残高不足・利用停止などが原因として考えられます。</p>';

  return sendEmail({
    to,
    subject: `【Threads Studio】決済ができませんでした（${attemptCount}回目）`,
    html: emailShell(
      'お支払いの確認をお願いいたします',
      `
        <p>いつも Threads Studio をご利用いただきありがとうございます。</p>
        <p><strong>${planName}プラン</strong>の自動更新で、ご登録のクレジットカードからのお引き落としに失敗いたしました。</p>
        ${amountStr ? `<p>請求額: <strong>${amountStr}</strong></p>` : ''}
        ${urgency}
        ${retryStr}
        <p>サービス停止を避けるため、お手数ですが以下のボタンからカード情報のご登録をお願いいたします（新しいカードでの再登録になります）。</p>
      `,
      'カード情報を登録する',
      portalUrl,
    ),
  });
}

/**
 * 「他に興味のあるサービス」アンケートで選ばれたサービスの案内を、
 * 本人の登録メールへ自動送信する。services は {label, description} の配列。
 */
export async function sendRelatedServicesEmail(
  to: string,
  services: { label: string; description: string }[],
  contactEmail: string,
): Promise<boolean> {
  if (services.length === 0) return false;
  const items = services
    .map(
      (s) => `
        <div style="border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin:10px 0;">
          <p style="margin:0 0 4px;font-weight:bold;color:#065f46;">${escapeHtml(s.label)}</p>
          <p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">${escapeHtml(s.description)}</p>
        </div>`,
    )
    .join('');
  const mailto = `mailto:${contactEmail}?subject=${encodeURIComponent('サービスの詳細希望')}`;
  return sendEmail({
    to,
    subject: '【Threads Studio】ご興味をお持ちのサービスのご案内',
    html: emailShell(
      'ご興味をお持ちのサービスのご案内',
      `
        <p>この度は Threads Studio をご利用いただきありがとうございます。</p>
        <p>アンケートでご興味をお選びいただいた、集客に役立つサービスをご案内します。</p>
        ${items}
        <p>詳しい資料のご請求・ご相談は、下のボタンからお気軽にご連絡ください（このメールへのご返信でも承ります）。</p>
      `,
      'このサービスについて相談する',
      mailto,
    ),
  });
}

/**
 * 決済失敗が続き、猶予期間を過ぎてサービスを自動停止したときの通知メール。
 * フリープランに戻った旨と、再開（再登録）の導線を案内する。
 */
export async function sendSubscriptionStoppedEmail(
  to: string,
  planName: string,
  updateUrl?: string | null,
): Promise<boolean> {
  const portalUrl = updateUrl || `${APP_BASE_URL}/pricing`;
  return sendEmail({
    to,
    subject: '【Threads Studio】お支払い未完了のため、有料プランを一時停止しました',
    html: emailShell(
      '有料プランを一時停止しました',
      `
        <p>いつも Threads Studio をご利用いただきありがとうございます。</p>
        <p><strong>${planName}プラン</strong>のお支払いが確認できない状態が続いたため、
        本日付で有料プランを一時停止し、フリープランに切り替えました。</p>
        <p>自動投稿などの有料機能は現在ご利用いただけません。引き続きご利用になる場合は、
        以下のボタンからカード情報を登録のうえ、プランを再開してください。</p>
        <p>ご不明な点がございましたら、お気軽にサポートまでご連絡ください。</p>
      `,
      'プランを再開する',
      portalUrl,
    ),
  });
}
