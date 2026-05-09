import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import rateLimit from "express-rate-limit";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { stripe } from "../stripe";
import * as db from "../db";
import Stripe from "stripe";
import { initTrialReminderScheduler } from "../trialReminder";
import { startTokenRefreshJob } from "../tokenRefreshJob";

declare global {
  var __stripeWebhookSeen: { id: string; ts: number }[] | undefined;
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  // Validate environment variables
  const { validateEnv } = await import("./env");
  validateEnv();

  // Initialize Sentry error tracking
  const { initSentry } = await import("../sentry");
  initSentry();

  const app = express();
  app.set('trust proxy', 1);
  const server = createServer(app);

  // Stripe webhook endpoint - MUST be before express.json() middleware
  app.post('/api/stripe/webhook', 
    express.raw({ type: 'application/json' }),
    async (req, res) => {
      const sig = req.headers['stripe-signature'] as string;
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

      if (!webhookSecret) {
        console.error('[Webhook] Missing STRIPE_WEBHOOK_SECRET');
        return res.status(500).json({ error: 'Webhook secret not configured' });
      }

      let event: Stripe.Event;

      try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      } catch (err: any) {
        console.error('[Webhook] Signature verification failed:', err.message);
        return res.status(400).json({ error: `Webhook Error: ${err.message}` });
      }

      // Handle test events
      if (event.id.startsWith('evt_test_')) {
        console.log("[Webhook] Test event detected, returning verification response");
        return res.json({ verified: true });
      }

      // ── #6 冪等性チェック（in-memory） ────────────────────────────
      // Stripe は 5xx 応答時に同じ event を最大3日間リトライする。
      // 1時間ウィンドウでメモリ内に処理済み event.id を覚えておき、
      // 重複処理を防ぐ。プロセス再起動で失われるが Stripe の再送間隔を
      // 考えれば実害は許容範囲。完全な冪等性が必要なら DB テーブル化。
      type WebhookSeen = { id: string; ts: number };
      if (!globalThis.__stripeWebhookSeen) {
        globalThis.__stripeWebhookSeen = [] as WebhookSeen[];
      }
      const seen = globalThis.__stripeWebhookSeen as WebhookSeen[];
      const nowTs = Date.now();
      const ONE_HOUR = 60 * 60 * 1000;
      // 古いエントリを掃除
      while (seen.length > 0 && nowTs - seen[0].ts > ONE_HOUR) seen.shift();
      if (seen.find((s) => s.id === event.id)) {
        console.log(`[Webhook] Duplicate event ignored: ${event.id}`);
        return res.json({ received: true, duplicate: true });
      }
      seen.push({ id: event.id, ts: nowTs });
      // 上限を設けてメモリ暴走を防ぐ
      if (seen.length > 5000) seen.splice(0, seen.length - 5000);

      console.log(`[Webhook] Received event: ${event.type} (${event.id})`);

      try {
        switch (event.type) {
          case 'checkout.session.completed': {
            const session = event.data.object as Stripe.Checkout.Session;
            const userId = parseInt(session.metadata?.userId || session.client_reference_id || '0');
            const planId = session.metadata?.planId || 'light';
            const subscriptionId = session.subscription as string;

            if (userId && subscriptionId) {
              // Get subscription details from Stripe
              const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
              
              // Calculate trial end date
              const trialEndsAt = stripeSubscription.trial_end 
                ? new Date(stripeSubscription.trial_end * 1000) 
                : null;
              
              const currentPeriodEnd = new Date((stripeSubscription as any).current_period_end * 1000);

              // Create subscription in database
              await db.createSubscription({
                userId,
                planId,
                stripeSubscriptionId: subscriptionId,
                status: stripeSubscription.status === 'trialing' ? 'trialing' : 'active',
                trialEndsAt,
                currentPeriodEnd,
              });

              console.log(`[Webhook] Created subscription for user ${userId}, plan: ${planId}`);
            }
            break;
          }

          case 'customer.subscription.updated': {
            const subscription = event.data.object as Stripe.Subscription;
            const stripeSubscriptionId = subscription.id;
            
            // Map Stripe status to our status enum
            let status: 'trialing' | 'active' | 'canceled' | 'past_due' | 'unpaid' | 'incomplete' = 'active';
            if (subscription.status === 'trialing') status = 'trialing';
            else if (subscription.status === 'canceled') status = 'canceled';
            else if (subscription.status === 'past_due') status = 'past_due';
            else if (subscription.status === 'unpaid') status = 'unpaid';
            else if (subscription.status === 'incomplete') status = 'incomplete';

            const currentPeriodEnd = new Date((subscription as any).current_period_end * 1000);
            const planId = subscription.metadata?.planId;

            await db.updateSubscriptionByStripeId(stripeSubscriptionId, {
              status,
              currentPeriodEnd,
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
              ...(planId && { planId }),
            });

            console.log(`[Webhook] Updated subscription ${stripeSubscriptionId}, status: ${status}`);
            break;
          }

          case 'customer.subscription.deleted': {
            const subscription = event.data.object as Stripe.Subscription;
            const stripeSubscriptionId = subscription.id;

            await db.updateSubscriptionByStripeId(stripeSubscriptionId, {
              status: 'canceled',
            });

            console.log(`[Webhook] Subscription ${stripeSubscriptionId} canceled`);
            break;
          }

          case 'invoice.payment_failed': {
            const invoice = event.data.object as Stripe.Invoice;
            const subscriptionId = (invoice as any).subscription as string;

            if (subscriptionId) {
              await db.updateSubscriptionByStripeId(subscriptionId, {
                status: 'past_due',
              });
              console.log(`[Webhook] Payment failed for subscription ${subscriptionId}`);

              // ── ユーザへメール通知 + 管理者へ通知 ────────────────────
              try {
                const sub = await db.getSubscriptionByStripeId(subscriptionId);
                if (sub) {
                  const user = await db.getUserById(sub.userId);
                  const { getPlan } = await import("../../shared/plans");
                  const plan = getPlan(sub.planId);
                  const planName = plan?.name ?? sub.planId;

                  // 失敗回数（Stripe が attempt_count を管理）
                  const attemptCount = (invoice as any).attempt_count ?? 1;
                  const amountDue = (invoice as any).amount_due ?? null;
                  const nextRetryUnix = (invoice as any).next_payment_attempt as number | null;
                  const nextRetryAt = nextRetryUnix ? new Date(nextRetryUnix * 1000) : null;

                  if (user?.email) {
                    const {
                      sendPaymentFailedEmail,
                      sendSubscriptionSuspendedEmail,
                      notifyOwner,
                    } = await import("./notification");

                    // attemptCount >= 4 で Stripe は通常諦める。最終なら停止メール。
                    if (attemptCount >= 4 || !nextRetryUnix) {
                      await sendSubscriptionSuspendedEmail(user.email, planName);
                    } else {
                      await sendPaymentFailedEmail(
                        user.email,
                        planName,
                        amountDue != null ? amountDue : null,
                        attemptCount,
                        nextRetryAt,
                      );
                    }

                    // 管理者にも通知（要 ADMIN_NOTIFICATION_EMAIL）
                    await notifyOwner({
                      title: `決済失敗: user ${user.id} (${user.email})`,
                      content:
                        `Plan: ${planName}\n` +
                        `Subscription: ${subscriptionId}\n` +
                        `Attempt: ${attemptCount}\n` +
                        `Amount: ${amountDue ?? 'unknown'}\n` +
                        `Next retry: ${nextRetryAt?.toISOString() ?? 'none (final)'}\n`,
                    });
                  }
                }
              } catch (notifyErr) {
                console.error('[Webhook] Failed to send payment_failed notification:', notifyErr);
              }
            }
            break;
          }

          case 'invoice.payment_action_required': {
            // 3Dセキュア等の追加認証が必要なケース
            const invoice = event.data.object as Stripe.Invoice;
            const subscriptionId = (invoice as any).subscription as string | undefined;
            const customerId = invoice.customer as string | undefined;
            try {
              let userEmail: string | null = null;
              if (subscriptionId) {
                const sub = await db.getSubscriptionByStripeId(subscriptionId);
                if (sub) {
                  const user = await db.getUserById(sub.userId);
                  userEmail = user?.email ?? null;
                }
              } else if (customerId) {
                const user = await db.getUserByStripeCustomerId(customerId);
                userEmail = user?.email ?? null;
              }
              if (userEmail) {
                const { sendPaymentActionRequiredEmail } = await import("./notification");
                await sendPaymentActionRequiredEmail(
                  userEmail,
                  (invoice as any).hosted_invoice_url ?? null,
                );
                console.log(`[Webhook] Sent action_required email to ${userEmail}`);
              }
            } catch (e) {
              console.error('[Webhook] payment_action_required handling error:', e);
            }
            break;
          }

          case 'customer.source.expiring': {
            // カード有効期限切れ予告（前月初めに飛んでくる）
            const card = event.data.object as Stripe.Card;
            const customerId = card.customer as string;
            try {
              const user = await db.getUserByStripeCustomerId(customerId);
              if (user?.email) {
                const { sendCardExpiringEmail } = await import("./notification");
                await sendCardExpiringEmail(
                  user.email,
                  card.last4,
                  card.exp_month,
                  card.exp_year,
                );
                console.log(`[Webhook] Sent card-expiring email to ${user.email}`);
              }
            } catch (e) {
              console.error('[Webhook] customer.source.expiring handling error:', e);
            }
            break;
          }

          case 'payment_method.automatically_updated': {
            // Stripe が自動でカード情報を更新したケース（カード再発行等）。
            // 通知は不要だがログは残す。
            const pm = event.data.object as Stripe.PaymentMethod;
            console.log(`[Webhook] Payment method auto-updated for customer ${pm.customer}`);
            break;
          }

          default:
            console.log(`[Webhook] Unhandled event type: ${event.type}`);
        }

        res.json({ received: true });
      } catch (err: any) {
        console.error('[Webhook] Error processing event:', err);
        res.status(500).json({ error: 'Webhook processing failed' });
      }
    }
  );

  // Rate limiting for API endpoints
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // max 100 requests per window per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'リクエストが多すぎます。しばらく待ってから再試行してください。' },
  });
  app.use('/api/', apiLimiter);

  // CSRF protection: verify Origin header on mutation requests
  app.use('/api/trpc', (req, res, next) => {
    // Only check POST/mutation requests
    if (req.method !== 'POST') return next();

    const origin = req.headers.origin;
    const host = req.headers.host;

    // Skip CSRF check for webhook endpoints (they use signature verification)
    if (req.path.includes('webhook')) return next();

    // In production, verify Origin matches Host
    if (process.env.NODE_ENV === 'production') {
      if (!origin) {
        return res.status(403).json({ error: 'Missing Origin header' });
      }
      try {
        const originHost = new URL(origin).host;
        if (originHost !== host) {
          console.warn(`[CSRF] Origin mismatch: ${origin} vs ${host}`);
          return res.status(403).json({ error: 'CSRF validation failed' });
        }
      } catch {
        return res.status(403).json({ error: 'Invalid Origin header' });
      }
    }

    next();
  });

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  
  // Note: Threads OAuth callback is handled directly by the frontend route /threads-connect
  // No server-side /api/threads/callback route needed - this avoids production routing issues
  
  // Threads Data Deletion Request Callback (required for Meta App Review)
  app.post('/api/threads/data-deletion', async (req, res) => {
    try {
      const signedRequest = req.body?.signed_request;
      if (!signedRequest) {
        return res.status(400).json({ error: 'Missing signed_request' });
      }

      // Parse the signed request to get user_id
      const [, payload] = signedRequest.split('.');
      const data = JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'));
      const threadsUserId = data.user_id?.toString();

      if (threadsUserId) {
        // Find and delete all threads accounts matching this Threads user ID
        const { eq } = await import('drizzle-orm');
        const { threadsAccounts } = await import('../../drizzle/schema');
        const { getDb } = await import('../db');
        const database = await getDb();
        if (database) {
          const accounts = await database.select().from(threadsAccounts).where(eq(threadsAccounts.threadsUserId, threadsUserId));
          for (const account of accounts) {
            await db.deleteThreadsAccount(account.id);
          }
        }
        console.log(`[Data Deletion] Deleted data for Threads user: ${threadsUserId}`);
      }

      // Return confirmation URL and tracking code as required by Meta
      const confirmationCode = `del_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const statusUrl = `${req.headers.origin || req.protocol + '://' + req.get('host')}/api/threads/data-deletion-status?code=${confirmationCode}`;

      res.json({
        url: statusUrl,
        confirmation_code: confirmationCode,
      });
    } catch (err: any) {
      console.error('[Data Deletion] Error:', err.message);
      res.status(500).json({ error: 'Data deletion processing failed' });
    }
  });

  // Data Deletion Status Check
  app.get('/api/threads/data-deletion-status', (req, res) => {
    const code = req.query.code;
    res.json({
      confirmation_code: code,
      status: 'completed',
      message: 'All user data has been deleted.',
    });
  });

  // Threads Deauthorize Callback (required for Meta App Review)
  app.post('/api/threads/deauthorize', async (req, res) => {
    try {
      const signedRequest = req.body?.signed_request;
      if (!signedRequest) {
        return res.status(400).json({ error: 'Missing signed_request' });
      }

      const [, payload] = signedRequest.split('.');
      const data = JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'));
      const threadsUserId = data.user_id?.toString();

      if (threadsUserId) {
        const { eq } = await import('drizzle-orm');
        const { threadsAccounts } = await import('../../drizzle/schema');
        const { getDb } = await import('../db');
        const database = await getDb();
        if (database) {
          const accounts = await database.select().from(threadsAccounts).where(eq(threadsAccounts.threadsUserId, threadsUserId));
          for (const account of accounts) {
            await db.deleteThreadsAccount(account.id);
          }
        }
        console.log(`[Deauthorize] Deauthorized Threads user: ${threadsUserId}`);
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error('[Deauthorize] Error:', err.message);
      res.status(500).json({ error: 'Deauthorize processing failed' });
    }
  });

  // Static Privacy Policy page (server-rendered HTML for Meta App Review crawlers)
  app.get("/privacy", (req, res, next) => {
    // Only serve static HTML for non-browser crawlers (Meta/Facebook bot, curl, etc.)
    // Let SPA handle it for regular browsers
    const ua = req.headers['user-agent'] || '';
    const isCrawler = /facebookexternalhit|facebookcatalog|Facebot|meta-externalagent|curl|wget|bot|crawl|spider|slurp/i.test(ua);
    if (!isCrawler) return next();

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>プライバシーポリシー - Threads Studio | 株式会社しっとる</title>
</head>
<body>
<h1>プライバシーポリシー</h1>
<p>最終更新日：2025年6月1日</p>
<p>運営会社：株式会社しっとる</p>
<p>サービス名：Threads Studio</p>

<h2>1. はじめに</h2>
<p>株式会社しっとる（以下「当社」）が運営するThreads Studio（以下「本サービス」）は、ユーザーのプライバシーを尊重し、個人情報の保護に努めます。本プライバシーポリシーは、本サービスがどのような情報を収集し、どのように利用・保護するかについて説明します。</p>

<h2>2. 収集する情報</h2>
<h3>2.1 アカウント情報</h3>
<p>メールアドレス、ユーザー名、パスワード（暗号化して保存）など、アカウント作成時に提供される情報。</p>
<h3>2.2 Threadsアカウント情報</h3>
<p>Threads APIを通じて取得するThreadsユーザーID、ユーザー名、プロフィール画像URL、アクセストークン。これらはThreads連携機能を提供するために必要です。</p>
<h3>2.3 投稿コンテンツ</h3>
<p>本サービスを通じて作成・編集された投稿テキスト、画像、テンプレートデータ。</p>
<h3>2.4 AI生成に関するデータ</h3>
<p>AI投稿生成機能を利用する際にユーザーが入力するプロジェクト情報、テーマ、キーワード等のデータ。</p>
<h3>2.5 決済情報</h3>
<p>有料プランの決済に必要な情報はStripe社を通じて安全に処理されます。当社はクレジットカード番号等の機密情報を直接保存しません。</p>
<h3>2.6 利用データ</h3>
<p>サービスの利用状況、投稿履歴、機能の使用頻度など、サービス改善のために収集する匿名化されたデータ。</p>
<h3>2.7 インサイトデータ</h3>
<p>Threads APIのインサイト機能を通じて取得する投稿のビュー数、いいね数、返信数等の統計データ。これらはユーザーの投稿パフォーマンス分析機能を提供するために使用します。</p>

<h2>3. 情報の利用目的</h2>
<ul>
<li>本サービスの提供・運営・改善</li>
<li>Threads APIを通じた投稿の作成・管理・予約投稿の実行</li>
<li>Threads投稿のインサイト分析・パフォーマンスレポートの提供</li>
<li>AIによる投稿コンテンツの自動生成・最適化</li>
<li>ユーザーアカウントの認証・管理</li>
<li>決済処理およびサブスクリプション管理</li>
<li>カスタマーサポートの提供</li>
<li>サービスの安全性確保と不正利用の防止</li>
<li>利用状況の分析によるサービス改善</li>
</ul>

<h2>4. Threads APIデータの取り扱い</h2>
<p>本サービスは、Meta社のThreads APIを利用しています。</p>
<ul>
<li>Threads APIから取得したデータは、本サービスの機能提供のみに使用します</li>
<li>アクセストークンは暗号化して安全に保存します</li>
<li>第三者にThreads APIデータを販売・共有することはありません</li>
<li>ユーザーがThreads連携を解除した場合、関連するThreadsデータを速やかに削除します</li>
<li>インサイトデータはユーザー自身の投稿分析にのみ使用し、第三者と共有しません</li>
</ul>

<h2>5. AI生成機能におけるデータの取り扱い</h2>
<ul>
<li>AIへの入力データは投稿生成の目的でのみ外部APIに送信されます</li>
<li>生成されたコンテンツはユーザーが確認・編集した上で投稿されます</li>
<li>AI生成データを第三者のモデル学習に提供することはありません</li>
</ul>

<h2>6. 決済処理</h2>
<p>有料プランの決済はStripe社の安全な決済インフラを通じて処理されます。クレジットカード情報は当社サーバーを経由せず、Stripe社が直接処理・保管します。</p>

<h2>7. 情報の共有</h2>
<p>本サービスは、以下の場合を除き、ユーザーの個人情報を第三者に提供しません。</p>
<ul>
<li>ユーザーの同意がある場合</li>
<li>法令に基づく開示要求がある場合</li>
<li>サービス提供に必要な業務委託先に対して、必要最小限の情報を提供する場合</li>
</ul>

<h2>8. データの保存と保護</h2>
<p>SSL/TLS暗号化通信、パスワードのハッシュ化、アクセストークンの暗号化など、業界標準のセキュリティ対策を実施しています。</p>

<h2>9. ユーザーの権利</h2>
<ul>
<li>アクセス権：自身の個人情報へのアクセスを要求する権利</li>
<li>訂正権：不正確な個人情報の訂正を要求する権利</li>
<li>削除権：個人情報の削除を要求する権利</li>
<li>Threads連携解除：いつでもThreadsアカウントの連携を解除する権利</li>
</ul>

<h2>10. データ削除</h2>
<p>ユーザーがアカウントの削除を希望する場合、またはThreads連携を解除する場合、関連する個人情報およびThreads APIデータは速やかに削除されます。データ削除のリクエストは、アプリ内の設定画面から行うことができます。</p>

<h2>11. Cookieの使用</h2>
<p>本サービスでは、ユーザー認証のためにセッションCookieを使用しています。トラッキングや広告目的では使用しません。</p>

<h2>12. 本ポリシーの変更</h2>
<p>本プライバシーポリシーは、法令の改正やサービスの変更に伴い、予告なく変更される場合があります。重要な変更がある場合は、サービス内で通知します。</p>

<h2>13. お問い合わせ</h2>
<p>プライバシーに関するご質問やご要望がございましたら、アプリ内のお問い合わせ機能またはサポートまでご連絡ください。</p>
<p>運営：株式会社しっとる</p>
<p>所在地：岡山県岡山市</p>
<p>メール：momen_t421@yahoo.co.jp</p>

<footer>
<p>&copy; 2025 Threads Studio（株式会社しっとる）. All rights reserved.</p>
</footer>
</body>
</html>`);
  });

  // Static Terms of Service page (server-rendered HTML for Meta App Review crawlers)
  app.get("/terms", (req, res, next) => {
    const ua = req.headers['user-agent'] || '';
    const isCrawler = /facebookexternalhit|facebookcatalog|Facebot|meta-externalagent|curl|wget|bot|crawl|spider|slurp/i.test(ua);
    if (!isCrawler) return next();

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>利用規約 - Threads Studio | 株式会社しっとる</title>
</head>
<body>
<h1>利用規約</h1>
<p>最終更新日：2025年6月1日</p>
<p>運営会社：株式会社しっとる</p>
<p>サービス名：Threads Studio</p>
<p>本利用規約は、株式会社しっとる（以下「当社」）が提供するThreads Studio（以下「本サービス」）の利用条件を定めるものです。詳細はアプリ内でご確認ください。</p>
<footer>
<p>&copy; 2025 Threads Studio（株式会社しっとる）. All rights reserved.</p>
</footer>
</body>
</html>`);
  });

  // Health check endpoint
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Client error reporting endpoint
  app.post('/api/client-error', express.json(), (req, res) => {
    console.error("[CLIENT ERROR]", req.body?.message);
    console.error("[CLIENT STACK]", req.body?.stack?.substring(0, 500));
    console.error("[CLIENT COMPONENT]", req.body?.componentStack?.substring(0, 500));
    res.json({ ok: true });
  });

  // Debug: check user data for specific email
  app.get('/api/debug/user-check', async (req, res) => {
    try {
      const { getDb } = await import("../db");
      const database = await getDb();
      if (!database) return res.status(503).json({ error: 'no db' });
      const { sql } = await import("drizzle-orm");

      const [users] = await database.execute(sql.raw(
        `SELECT id, email, role, authProvider, setupStep FROM users WHERE email = 'momen_t421@yahoo.co.jp' LIMIT 1`
      )) as any;

      const userId = users?.[0]?.id;
      let subs: any = [];
      if (userId) {
        const [subResult] = await database.execute(sql.raw(
          `SELECT * FROM subscriptions WHERE userId = ${userId}`
        )) as any;
        subs = subResult;
      }

      res.json({ user: users?.[0] || null, subscriptions: subs });
    } catch (e: any) {
      res.status(500).json({ error: e.message, stack: e.stack?.substring(0, 300) });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // Ensure database schema matches application requirements
  try {
    const { getDb } = await import("../db");
    const database = await getDb();
    if (database) {
      const { sql } = await import("drizzle-orm");

      // Check if schema is from old app (Zoom) by checking if plans table has correct columns
      const [rows] = await database.execute(sql.raw(
        `SELECT COUNT(*) as cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'plans' AND COLUMN_NAME = 'maxAiGenerations'`
      )) as any;
      const hasCorrectSchema = rows?.[0]?.cnt > 0;

      if (!hasCorrectSchema) {
        console.log("[DB] Schema mismatch detected - rebuilding tables for Threads Studio...");

        // Drop old tables that conflict (from previous Zoom app)
        const oldTables = [
          '__drizzle_migrations',
          'userHistoryFavorites', 'userFavorites', 'userCoupons',
          'aiChatMessages', 'aiChatConversations',
          'aiGenerationHistory', 'aiGenerationUsage', 'aiGenerationPresets', 'aiGenerationTemplates',
          'postAnalytics', 'scheduledPosts', 'creditTransactions', 'referrals',
          'passwordResetTokens', 'subscriptions', 'threadsAccounts', 'projects',
          'templates', 'coupons', 'plans', 'users',
          // Old Zoom app tables
          'app_settings', 'chatbot_logs', 'chatbot_nodes', 'chatbot_scenarios',
          'client_invitations', 'client_users', 'industry_templates',
          'invitation_templates', 'meetings', 'message_logs', 'passcodes',
          'recurring_meetings', 'rich_menus', 'step_messages', 'step_scenarios',
          'zoom_settings'
        ];

        for (const table of oldTables) {
          try {
            await database.execute(sql.raw(`DROP TABLE IF EXISTS \`${table}\``));
          } catch (e: any) {
            // FK constraints may prevent drop, try again after disabling checks
          }
        }

        // Now read and apply the latest migration SQL to create fresh tables
        const fs = await import("fs");
        const path = await import("path");
        const drizzleDir = path.resolve(process.cwd(), "drizzle");
        const sqlFiles = fs.readdirSync(drizzleDir)
          .filter((f: string) => f.endsWith(".sql"))
          .sort();

        // Disable FK checks for clean creation
        await database.execute(sql.raw(`SET FOREIGN_KEY_CHECKS = 0`));

        for (const file of sqlFiles) {
          const filePath = path.join(drizzleDir, file);
          const content = fs.readFileSync(filePath, "utf-8");
          const statements = content.split("--> statement-breakpoint").filter((s: string) => s.trim());
          for (const stmt of statements) {
            const trimmed = stmt.trim();
            if (!trimmed) continue;
            try {
              await database.execute(sql.raw(trimmed));
            } catch (e: any) {
              if (e.errno === 1050 || e.errno === 1060 || e.errno === 1061) continue;
              console.warn(`[DB] Warning in ${file}:`, e.message?.substring(0, 100));
            }
          }
          console.log(`[DB] Applied: ${file}`);
        }

        await database.execute(sql.raw(`SET FOREIGN_KEY_CHECKS = 1`));
        console.log("[DB] Fresh schema created successfully");
      } else {
        // Schema is correct but we still need to apply any new migrations
        console.log("[DB] Schema OK - checking for new migrations...");
        const fs = await import("fs");
        const path = await import("path");
        const drizzleDir = path.resolve(process.cwd(), "drizzle");
        const sqlFiles = fs.readdirSync(drizzleDir)
          .filter((f: string) => f.endsWith(".sql"))
          .sort();

        // Create tracking table if not exists
        await database.execute(sql.raw(`
          CREATE TABLE IF NOT EXISTS \`__drizzle_migrations\` (
            \`id\` int AUTO_INCREMENT PRIMARY KEY,
            \`hash\` varchar(255) NOT NULL,
            \`created_at\` bigint NOT NULL
          )
        `));

        const applied = await database.execute(sql.raw(`SELECT hash FROM \`__drizzle_migrations\``));
        const appliedHashes = new Set((applied as any)[0]?.map((r: any) => r.hash) || []);

        for (const file of sqlFiles) {
          const hash = file.replace(".sql", "");
          if (appliedHashes.has(hash)) continue;

          const filePath = path.join(drizzleDir, file);
          const content = fs.readFileSync(filePath, "utf-8");
          const statements = content.split("--> statement-breakpoint").filter((s: string) => s.trim());

          for (const stmt of statements) {
            const trimmed = stmt.trim();
            if (!trimmed) continue;
            try {
              await database.execute(sql.raw(trimmed));
            } catch (e: any) {
              if (e.errno === 1050 || e.errno === 1060 || e.errno === 1061) continue;
              console.warn(`[DB] Warning in ${file}:`, e.message?.substring(0, 100));
            }
          }

          await database.execute(sql.raw(
            `INSERT INTO \`__drizzle_migrations\` (\`hash\`, \`created_at\`) VALUES ('${hash}', ${Date.now()})`
          ));
          console.log(`[DB] Applied migration: ${file}`);
        }
        console.log("[DB] Migration check complete");
      }
    }
  } catch (err: any) {
    console.error("[DB] Schema setup error:", err.message);
  }

  // Ensure DB schema is up-to-date (fix missing columns)
  try {
    const { getDb } = await import("../db");
    const database = await getDb();
    if (database) {
      const { sql } = await import("drizzle-orm");

      // Create missing tables first
      const createStatements = [
        `CREATE TABLE IF NOT EXISTS aiGenerationHistory (
          id int AUTO_INCREMENT PRIMARY KEY,
          userId int NOT NULL,
          projectId varchar(50),
          postType varchar(50) NOT NULL,
          content text NOT NULL,
          metadata text,
          createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX user_id_idx (userId),
          INDEX project_id_idx (projectId),
          INDEX created_at_idx (createdAt)
        )`,
      ];

      for (const stmt of createStatements) {
        try { await database.execute(sql.raw(stmt)); } catch (e: any) {}
      }

      // Fix subscriptions table
      const alterStatements = [
        `ALTER TABLE subscriptions ADD COLUMN planId varchar(50) NOT NULL DEFAULT 'free'`,
        `ALTER TABLE subscriptions ADD COLUMN stripeSubscriptionId varchar(255)`,
        `ALTER TABLE subscriptions ADD COLUMN univapaySubscriptionId varchar(255)`,
        `ALTER TABLE subscriptions ADD COLUMN status enum('trialing','active','canceled','past_due','unpaid','incomplete') NOT NULL DEFAULT 'trialing'`,
        `ALTER TABLE subscriptions ADD COLUMN trialEndsAt timestamp NULL`,
        `ALTER TABLE subscriptions ADD COLUMN currentPeriodEnd timestamp NULL`,
        `ALTER TABLE subscriptions ADD COLUMN cancelAtPeriodEnd boolean NOT NULL DEFAULT false`,
        `ALTER TABLE subscriptions ADD COLUMN updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
        // Fix plans table
        `ALTER TABLE plans ADD COLUMN maxAiGenerations int NOT NULL DEFAULT 10`,
        `ALTER TABLE plans ADD COLUMN hasPrioritySupport boolean NOT NULL DEFAULT false`,
        `ALTER TABLE plans ADD COLUMN stripePriceId varchar(255)`,
        `ALTER TABLE plans ADD COLUMN isActive boolean NOT NULL DEFAULT true`,
        // Fix users table
        `ALTER TABLE users ADD COLUMN emailVerified boolean NOT NULL DEFAULT false`,
        `ALTER TABLE users ADD COLUMN emailVerificationToken varchar(64)`,
        `ALTER TABLE users ADD COLUMN autoPostEnabled boolean NOT NULL DEFAULT true`,
        `ALTER TABLE users ADD COLUMN autoPostFrequency enum('daily','twice_daily','three_daily') NOT NULL DEFAULT 'daily'`,
        `ALTER TABLE users ADD COLUMN lastAutoPostTypeIndex int NOT NULL DEFAULT 0`,
        `ALTER TABLE users ADD COLUMN lastAutoPurposeIndex int NOT NULL DEFAULT 0`,
        `ALTER TABLE users ADD COLUMN referralCode varchar(16)`,
        `ALTER TABLE users ADD COLUMN credits int NOT NULL DEFAULT 0`,
        `ALTER TABLE users ADD COLUMN isDemoMode boolean NOT NULL DEFAULT true`,
        `ALTER TABLE users ADD COLUMN setupStep int NOT NULL DEFAULT 0`,
        `ALTER TABLE users ADD COLUMN authProvider enum('manus','email') NOT NULL DEFAULT 'manus'`,
        `ALTER TABLE users ADD COLUMN role enum('user','admin') NOT NULL DEFAULT 'user'`,
      ];

      for (const stmt of alterStatements) {
        try {
          await database.execute(sql.raw(stmt));
        } catch (e: any) {
          // Ignore "duplicate column" errors (1060)
          if (e.errno !== 1060) {
            // Only log unexpected errors
          }
        }
      }
      // Fix invalid subscription records (from old Zoom/LINE app)
      // Set planId to 'free' where it's empty, set status where it's NULL
      await database.execute(sql.raw(`UPDATE subscriptions SET planId = 'free' WHERE planId IS NULL OR planId = ''`));
      await database.execute(sql.raw(`UPDATE subscriptions SET status = 'active' WHERE status IS NULL OR status = ''`));
      console.log("[DB] Schema columns verified");

      // Set admin
      await database.execute(sql.raw(`UPDATE users SET role = 'admin' WHERE email = 'momen_t421@yahoo.co.jp'`));
      console.log("[Admin] Admin role set for momen_t421@yahoo.co.jp");
    }
  } catch (e: any) {
    console.error("[DB] Schema fix error:", e.message);
  }

  // Initialize plans in database
  await db.initializePlans();
  
  // Initialize coupon codes
  const { seedCoupons } = await import("../coupon");
  await seedCoupons();
  
  // Start trial reminder scheduler
  initTrialReminderScheduler();
  
  // Start scheduled post executor
  const { startScheduledPostExecutor } = await import("../scheduledPostExecutor");
  const stopPostExecutor = startScheduledPostExecutor();

  // Start auto-post scheduler (daily AI generation + scheduling)
  const { startAutoPostScheduler } = await import("../autoPostScheduler");
  startAutoPostScheduler();

  // Start weekly report scheduler (Monday 9:00 AM JST, pro+ users only)
  const { startWeeklyReportScheduler } = await import("../weeklyReport");
  startWeeklyReportScheduler();

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    // Start background token refresh job
    startTokenRefreshJob();
  });

  // Graceful shutdown handler
  const shutdown = async (signal: string) => {
    console.log(`[Server] ${signal} received, shutting down gracefully...`);

    // Stop schedulers
    stopPostExecutor();
    const cron = await import("node-cron");
    cron.getTasks().forEach((task) => task.stop());

    // Close HTTP server (stop accepting new connections)
    server.close(() => {
      console.log('[Server] HTTP server closed');
      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      console.error('[Server] Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// ─── #10 グローバル例外ハンドラ ─────────────────────────────────
// 非同期エラーが拾われずにプロセスが落ちるのを防ぐ。
// 起動前に登録してログだけ残す。プロセスは継続させる（最低限の可用性）。
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  // Sentry などがあれば送信。落とさない（サービス継続）。
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[unhandledRejection]', reason);
  void promise;
});

startServer().catch(console.error);
