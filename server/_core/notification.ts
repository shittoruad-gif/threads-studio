import { Resend } from "resend";
import { escapeHtml } from "../../shared/sanitize";
import { RELATED_SERVICES_OVERVIEW_URL, type RelatedService } from "../../shared/relatedServices";

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

  // ★QA安全モード：本番スナップショットを載せたローカル環境から
  //   実在のお客様へメールが飛ぶ事故を防ぐ（QA_SAFE_MODE=1 のとき送信しない）。
  if (process.env.QA_SAFE_MODE === '1') {
    console.log(`[Email] QA_SAFE_MODE のため送信しません: to=${payload.to} subject=${payload.subject}`);
    await log('skipped', 'QA_SAFE_MODE');
    return false;
  }

  const resend = getResend();
  if (!resend) {
    console.log("[Email] Skipped - RESEND_API_KEY not configured");
    await log('skipped', 'RESEND_API_KEY not configured');
    return false;
  }

  try {
    // ★返信先は会社の窓口メールにする。
    //   差出人は noreply@ のため、本文で「このメールにご返信ください」と案内していても
    //   返信先を指定しないと誰にも届かない（2026-09-03 点検で発見）。
    const replyTo = process.env.SUPPORT_REPLY_TO || 'shittoru@s-toru.com';
    const { error } = await resend.emails.send({
      from: getFromEmail(),
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      replyTo: replyTo,
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
  const baseUrl = process.env.APP_BASE_URL || process.env.VITE_APP_URL || 'https://threads-studio.com';
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
  'https://threads-studio.com';

/**
 * 共通の見た目テンプレート
 */
function emailShell(
  title: string,
  body: string,
  ctaLabel?: string,
  ctaUrl?: string,
  // 決済以外の用途（サービスのご案内など）で、末尾の断り書きを差し替えるため
  footerNote?: string,
): string {
  const cta = ctaLabel && ctaUrl
    ? `<a href="${ctaUrl}" style="display: inline-block; background: #ef4444; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin: 16px 0; font-weight: bold;">${ctaLabel}</a>`
    : '';
  const footer = footerNote
    ?? 'このメールは Threads Studio の決済システムから自動送信されています。<br />お心当たりがない場合は、お手数ですがサポートまでご連絡ください。';
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #f9fafb;">
      <div style="background: white; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <h2 style="color: #1f2937; margin-top: 0;">${title}</h2>
        ${body}
        ${cta}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #9ca3af; font-size: 12px;">
          ${footer}
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
 * 本人の登録メールへ自動送信する。
 *
 * 書き方の方針:
 *   ・選ばれたサービスごとに「実際のページ」を必ず見せる。
 *     以前はメール本文に説明1行と返信用の相談ボタンしか無く、
 *     ご興味をお持ちの方に「返信する」という一番重い動作しか用意できていなかった。
 *   ・LPのように実物をお見せできるものは、サンプルのボタンを説明より先に置く。
 *     見てから相談するほうが、話が早い。
 *   ・料金は確定しているものだけ書く（shared/relatedServices.ts の price）。
 *     ページが無いサービスは、説明と相談ボタンだけになる。
 */
export function renderRelatedServicesEmail(
  services: RelatedService[],
  contactEmail: string,
): string {
  const button = (label: string, url: string, primary: boolean) =>
    `<a href="${url}" style="display:inline-block;${primary
      ? 'background:#065f46;color:#ffffff;border:1px solid #065f46;'
      : 'background:#ffffff;color:#065f46;border:1px solid #a7d7c5;'
    }padding:9px 16px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:bold;margin:0 8px 8px 0;">${escapeHtml(label)}</a>`;

  const items = services
    .map((s) => {
      const price = s.price
        ? `<p style="margin:8px 0 0;color:#065f46;font-size:13px;">料金：${escapeHtml(s.price)}</p>`
        : '';
      const sampleNote = s.sample?.note
        ? `<p style="margin:8px 0 0;color:#6b7280;font-size:13px;line-height:1.6;">${escapeHtml(s.sample.note)}</p>`
        : '';
      const buttons = [
        s.sample ? button(s.sample.label, s.sample.url, true) : '',
        s.url ? button('サービスの詳細を見る', s.url, !s.sample) : '',
      ].join('');
      const buttonRow = buttons ? `<div style="margin-top:12px;">${buttons}</div>` : '';
      return `
        <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:12px 0;">
          <p style="margin:0 0 6px;font-weight:bold;color:#065f46;font-size:15px;">${escapeHtml(s.label)}</p>
          <p style="margin:0;color:#374151;font-size:14px;line-height:1.7;">${escapeHtml(s.description)}</p>
          ${sampleNote}
          ${price}
          ${buttonRow}
        </div>`;
    })
    .join('');

  // ページが無いサービスだけを選ばれた場合は、相談以外の導線が無い旨をぼかさず書く
  const hasLink = services.some((s) => s.url || s.sample);
  const closing = hasLink
    ? '気になるものがあれば、上のボタンから中身をご覧ください。お見積り・ご相談は下のボタン、またはこのメールへのご返信でも承ります。'
    : 'お店の状況をうかがったうえでご提案しますので、下のボタン、またはこのメールへのご返信でお気軽にご連絡ください。';

  const mailto = `mailto:${contactEmail}?subject=${encodeURIComponent('サービスの詳細希望')}`;
  return emailShell(
      'ご興味をお持ちのサービスのご案内',
      `
        <p>この度は Threads Studio をご利用いただきありがとうございます。</p>
        <p>アンケートでお選びいただいたサービスをご案内します。</p>
        ${items}
        <p style="font-size:14px;line-height:1.7;">${closing}</p>
        <p style="font-size:13px;color:#6b7280;line-height:1.7;">
          集客の流れ（ページ作成 → 広告 → SNS → 公式LINE → 計測）の全体像は
          <a href="${RELATED_SERVICES_OVERVIEW_URL}" style="color:#065f46;">こちらのご案内ページ</a>にまとめています。
        </p>
      `,
      'このサービスについて相談する',
      mailto,
      'このメールは、Threads Studio のアンケートで「メールでの案内を希望する」とお選びいただいた方にお送りしています。<br />'
      + `今後のご案内が不要な場合は、このメールへのご返信、または ${escapeHtml(contactEmail)} までその旨をお知らせください。`,
  );
}

/**
 * サービス1件ぶんの案内メール（アンケートでチェックされたサービスごとに1通）。
 * 中身は紹介ページ（/services/<slug>）と同じ定義（shared/relatedServices.ts）から作る。
 * ★料金は確定しているものだけが定義に入っている。ここで金額を書き足さない。
 */
export function renderServiceIntroEmail(service: RelatedService, pageUrl: string, contactEmail: string): string {
  const p = service.page;
  const li = (items: string[]) => items.map((t) => `<li style="margin:0 0 6px;">${escapeHtml(t)}</li>`).join('');
  const steps = p.steps
    .map((st, i) =>
      `<tr><td style="vertical-align:top;padding:6px 8px 6px 0;color:#065f46;font-weight:bold;white-space:nowrap;">${i + 1}. ${escapeHtml(st.who)}</td>` +
      `<td style="vertical-align:top;padding:6px 0;color:#374151;line-height:1.6;">${escapeHtml(st.text)}</td></tr>`)
    .join('');
  const price = service.price
    ? `<p style="margin:16px 0 0;padding:12px 14px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;color:#065f46;font-size:14px;line-height:1.6;"><strong>料金</strong>：${escapeHtml(service.price)}</p>`
    : `<p style="margin:16px 0 0;color:#6b7280;font-size:13px;line-height:1.6;">料金は、お店の状況をうかがったうえでお見積りします。</p>`;
  const sample = service.sample
    ? `<p style="margin:12px 0 0;"><a href="${service.sample.url}" style="color:#065f46;font-weight:bold;">${escapeHtml(service.sample.label)}</a>` +
      (service.sample.note ? `<br /><span style="color:#6b7280;font-size:13px;">${escapeHtml(service.sample.note)}</span>` : '') + `</p>`
    : '';
  const mailto = `mailto:${contactEmail}?subject=${encodeURIComponent(`${service.label}について`)}`;
  return emailShell(
    escapeHtml(service.label),
    `
      <p style="font-size:16px;font-weight:bold;color:#1f2937;line-height:1.6;margin:0 0 8px;">${escapeHtml(p.headline)}</p>
      <p style="color:#374151;font-size:14px;line-height:1.7;">${escapeHtml(service.description)}</p>
      <p style="margin:18px 0 6px;font-weight:bold;color:#1f2937;">こんなお悩みに</p>
      <ul style="margin:0;padding-left:20px;color:#374151;font-size:14px;line-height:1.6;">${li(p.pains)}</ul>
      <p style="margin:18px 0 6px;font-weight:bold;color:#1f2937;">流れ</p>
      <table style="border-collapse:collapse;font-size:14px;">${steps}</table>
      <p style="margin:18px 0 6px;font-weight:bold;color:#1f2937;">得られるもの</p>
      <ul style="margin:0;padding-left:20px;color:#374151;font-size:14px;line-height:1.6;">${li(p.outputs)}</ul>
      ${price}
      ${sample}
      <p style="margin:16px 0 0;font-size:14px;line-height:1.7;">くわしい内容は下のボタンからご覧ください。お見積り・ご相談は
        <a href="${mailto}" style="color:#065f46;">こちら</a>、またはこのメールへのご返信でも承ります。</p>
    `,
    `${service.label} の案内ページを見る`,
    pageUrl,
    'このメールは、Threads Studio のアンケートで「メールでの案内を希望する」とお選びいただいた方にお送りしています。<br />'
    + `今後のご案内が不要な場合は、このメールへのご返信、または ${escapeHtml(contactEmail)} までその旨をお知らせください。`,
  );
}

/** チェックされたサービスごとに1通ずつ案内を送る。戻り値は送れた件数 */
export async function sendServiceIntroEmails(
  to: string,
  services: RelatedService[],
  contactEmail: string,
  pageUrlFor: (service: RelatedService) => string,
): Promise<number> {
  let sent = 0;
  for (const s of services) {
    const ok = await sendEmail({
      to,
      subject: `【Threads Studio】${s.label} のご案内`,
      html: renderServiceIntroEmail(s, pageUrlFor(s), contactEmail),
    });
    if (ok !== false) sent++;
  }
  return sent;
}

/** アンケートで選ばれたサービスの案内を、本人の登録メールへ送る（まとめて1通の旧形式。いまは未使用） */
export async function sendRelatedServicesEmail(
  to: string,
  services: RelatedService[],
  contactEmail: string,
): Promise<boolean> {
  if (services.length === 0) return false;
  return sendEmail({
    to,
    subject: '【Threads Studio】ご興味をお持ちのサービスのご案内',
    html: renderRelatedServicesEmail(services, contactEmail),
  });
}

/**
 * 管理者がプランを切り替えたときの、お客様へのご案内（支払いリンク付き）。
 * ★リンクフォームはメールアドレスで契約を突き合わせるため、登録アドレスと同じもので入力してもらう。
 */
export async function sendPlanGuideEmail(params: {
  to: string;
  name?: string | null;
  planName: string;
  priceMonthly: number;
  paymentLink: string | null;
  isCampaign: boolean;
  campaignCharges: number | null;
}): Promise<boolean> {
  const greet = params.name ? `${escapeHtml(params.name)} 様` : 'ご担当者様';
  const price = `月額 ${params.priceMonthly.toLocaleString('ja-JP')}円（税込）`;
  const campaignNote = params.isCampaign
    ? `<p>こちらはキャンペーン価格のプランです。無料トライアルは付かず、お申し込み時に初回のお支払いが発生します。${params.campaignCharges ? `${params.campaignCharges}回のお支払いのあと、通常価格に自動で切り替わります。` : ''}</p>`
    : '';
  const linkPart = params.paymentLink
    ? `<p>下のボタンからお支払いのご登録をお願いいたします。<br /><strong>ご登録のメールアドレス（${escapeHtml(params.to)}）と同じアドレス</strong>でご入力ください（違うと自動で反映されません）。</p>`
    : '<p>お支払いのご案内は、担当者より別途ご連絡いたします。</p>';
  return sendEmail({
    to: params.to,
    subject: `【Threads Studio】${params.planName} のご案内（お支払い登録のお願い）`,
    html: emailShell(
      `${escapeHtml(params.planName)} のご案内`,
      `
        <p>${greet}</p>
        <p>Threads Studio のプランを <strong>${escapeHtml(params.planName)}</strong>（${price}）でご利用いただけるよう設定しました。機能はすでにお使いいただけます。</p>
        ${campaignNote}
        ${linkPart}
        <p style="font-size:13px;color:#6b7280;">ご不明な点は、このメールへのご返信でお気軽にどうぞ。</p>
      `,
      params.paymentLink ? 'お支払いを登録する' : undefined,
      params.paymentLink ?? undefined,
      'このメールは、Threads Studio の担当者がプランを設定した際にお送りしています。',
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
