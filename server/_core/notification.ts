import { Resend } from "resend";

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
  const resend = getResend();
  if (!resend) {
    console.log("[Email] Skipped - RESEND_API_KEY not configured");
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
      return false;
    }

    console.log(`[Email] Sent to ${payload.to}: ${payload.subject}`);
    return true;
  } catch (err) {
    console.warn("[Email] Error:", err);
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
  return sendEmail({
    to,
    subject: `【Threads Studio】無料トライアルがあと${daysLeft}日で終了します`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>無料トライアル期限のお知らせ</h2>
        <p>${planName}の無料トライアルがあと<strong>${daysLeft}日</strong>で終了します。</p>
        <p>トライアル終了後も引き続きご利用いただくには、有料プランへの移行をお願いいたします。</p>
        <a href="https://threads-studio-production-c190.up.railway.app/pricing" style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin: 16px 0;">
          プランを確認する
        </a>
      </div>
    `,
  });
}

/**
 * Legacy notifyOwner - now sends email to admin
 */
export async function notifyOwner(payload: NotificationPayload): Promise<boolean> {
  console.log(`[Notification] ${payload.title}: ${payload.content}`);
  return true;
}
