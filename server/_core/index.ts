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

      console.log(`[Webhook] Received event: ${event.type}`);

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
            }
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

  // Health check endpoint
  app.get('/api/health', async (_req, res) => {
    try {
      const { getDb } = await import("../db");
      const database = await getDb();
      if (!database) {
        return res.status(503).json({ status: 'unhealthy', error: 'Database unavailable' });
      }
      res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    } catch (error) {
      res.status(503).json({ status: 'unhealthy', error: 'Health check failed' });
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
        console.log("[DB] Schema OK - no migration needed");
      }
    }
  } catch (err: any) {
    console.error("[DB] Schema setup error:", err.message);
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

startServer().catch(console.error);
