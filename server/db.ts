import { eq, and, desc, sql, lte, gte, gt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { encrypt, decrypt } from "./encryption";
import {
  InsertUser, User, users,
  plans, InsertPlan, Plan,
  subscriptions, InsertSubscription, Subscription,
  threadsAccounts, InsertThreadsAccount, ThreadsAccount,
  projects, InsertProject, Project,
  scheduledPosts, InsertScheduledPost, ScheduledPost,
  templates, Template,
  userFavorites, InsertUserFavorite,
  userHistoryFavorites, UserHistoryFavorite, InsertUserHistoryFavorite,
  aiGenerationUsage, AiGenerationUsage, InsertAiGenerationUsage,
  aiGenerationHistory, AiGenerationHistory, InsertAiGenerationHistory,
  coupons, Coupon, InsertCoupon,
  userCoupons,
  aiGenerationTemplates, AiGenerationTemplate, InsertAiGenerationTemplate,
  aiGenerationPresets, AiGenerationPreset, InsertAiGenerationPreset,
  aiChatConversations, AiChatConversation, InsertAiChatConversation,
  aiChatMessages, AiChatMessage, InsertAiChatMessage,
  referrals, Referral, InsertReferral,
  creditTransactions, CreditTransaction, InsertCreditTransaction,
  passwordResetTokens, PasswordResetToken, InsertPasswordResetToken,
  postAnalytics, PostAnalytics, InsertPostAnalytics,
  monitorFeedback, MonitorFeedback, InsertMonitorFeedback,
  jobRuns, JobRun,
  followerSnapshots, hitPostArchive, HitPostArchive, cancellationFeedback,
  hiddenItems, contentInterestSurvey, ContentInterestSurvey,
  regionalRefPosts, RegionalRefPost
} from "../drizzle/schema";
import { ENV } from './_core/env';
import { PLANS } from '../shared/plans';

let _db: ReturnType<typeof drizzle> | null = null;

/**
 * Get or create a database connection.
 *
 * Uses utf8mb4 charset explicitly so emojis (🔥💡📍 etc.) and other
 * 4-byte UTF-8 characters used heavily in Threads posts persist correctly.
 * Without this, MySQL's default `utf8` (= utf8mb3) silently corrupts
 * 4-byte chars on insert, producing 文字化け in stored content.
 *
 * If the cached connection is stale (ECONNRESET), it will be recreated.
 */
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      // Lazy-import mysql2 (callback style — drizzle's mysql2 driver expects this).
      // Build a pool with explicit charset so emojis aren't corrupted.
      const mysql = await import("mysql2");
      const pool = mysql.createPool({
        uri: process.env.DATABASE_URL,
        charset: "utf8mb4",
        // mysql2 will issue `SET NAMES utf8mb4` on each new connection,
        // ensuring text inserted (especially emojis) is preserved.
      });
      _db = drizzle(pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

/**
 * Reset the cached database connection.
 * Call this when a connection error (ECONNRESET, ETIMEDOUT, etc.) is detected.
 */
export function resetDbConnection() {
  console.log("[Database] Resetting cached connection");
  _db = null;
}

/**
 * Execute a database operation with automatic retry on connection errors.
 * Retries up to `maxRetries` times with exponential backoff.
 */
export async function withDbRetry<T>(
  operation: (db: NonNullable<ReturnType<typeof drizzle>>) => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const db = await getDb();
    if (!db) {
      throw new Error("[Database] Database not available");
    }
    try {
      return await operation(db);
    } catch (error: unknown) {
      lastError = error;
      const errMsg = error instanceof Error ? error.message : String(error);
      const isConnectionError = 
        errMsg.includes('ECONNRESET') || 
        errMsg.includes('ETIMEDOUT') || 
        errMsg.includes('PROTOCOL_CONNECTION_LOST') ||
        errMsg.includes('Connection lost') ||
        errMsg.includes('EPIPE');
      
      if (isConnectionError && attempt < maxRetries) {
        console.warn(`[Database] Connection error on attempt ${attempt}/${maxRetries}: ${errMsg}. Retrying...`);
        resetDbConnection();
        // Exponential backoff: 500ms, 1000ms, 2000ms...
        await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, attempt - 1)));
      } else {
        throw error;
      }
    }
  }
  throw lastError;
}

// ============ User Functions ============

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    // ★パスワードハッシュ（パスワードリセット等で更新される）。
    //   これを扱わないと resetPassword が成功表示だけして実際は変更されない不具合になる。
    if (user.passwordHash !== undefined) {
      values.passwordHash = user.passwordHash;
      updateSet.passwordHash = user.passwordHash;
    }
    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(userId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateUserOnboardingCompleted(userId: number, completed: boolean) {
  const db = await getDb();
  if (!db) return;

  await db.update(users)
    .set({ onboardingCompleted: completed })
    .where(eq(users.id, userId));
}

// ============ Plan Functions ============

export async function initializePlans() {
  const db = await getDb();
  if (!db) return;

  for (const [id, plan] of Object.entries(PLANS)) {
    await db.insert(plans).values({
      id,
      name: plan.name,
      description: plan.description,
      priceMonthly: plan.priceMonthly,
      stripePriceId: plan.stripePriceId || null,
      maxProjects: plan.features.maxProjects,
      maxThreadsAccounts: plan.features.maxThreadsAccounts,
      maxScheduledPosts: plan.features.maxScheduledPosts,
      maxAiGenerations: plan.features.maxAiGenerations,
      hasPrioritySupport: plan.features.hasPrioritySupport,
    }).onDuplicateKeyUpdate({
      set: {
        name: plan.name,
        description: plan.description,
        priceMonthly: plan.priceMonthly,
        maxProjects: plan.features.maxProjects,
        maxThreadsAccounts: plan.features.maxThreadsAccounts,
        maxScheduledPosts: plan.features.maxScheduledPosts,
        maxAiGenerations: plan.features.maxAiGenerations,
        hasPrioritySupport: plan.features.hasPrioritySupport,
      },
    });
  }
}

export async function getAllPlans(): Promise<Plan[]> {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(plans).where(eq(plans.isActive, true));
}

export async function getPlanById(planId: string): Promise<Plan | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ============ Subscription Functions ============

export async function createSubscription(data: InsertSubscription): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.insert(subscriptions).values(data);
}

export async function getSubscriptionByUserId(userId: number): Promise<Subscription | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * past_due / unpaid 状態のサブスクリプション一覧を返す。
 * 管理者ダッシュボードで「決済失敗ユーザー一覧」として使用。
 */
export async function getSubscriptionsWithPaymentIssues(): Promise<Subscription[]> {
  const db = await getDb();
  if (!db) return [];
  // drizzle の inArray を使う必要があるが import 追加せずに手書きの SQL で
  return db.select()
    .from(subscriptions)
    .where(sql`${subscriptions.status} IN ('past_due', 'unpaid', 'incomplete')`);
}

export async function updateSubscription(
  subscriptionId: number,
  data: Partial<InsertSubscription>
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(subscriptions)
    .set(data)
    .where(eq(subscriptions.id, subscriptionId));
}

// ============ Job Run Tracking（cron欠落キャッチアップ用） ============

export async function getJobRun(jobName: string): Promise<JobRun | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(jobRuns).where(eq(jobRuns.jobName, jobName)).limit(1);
  return rows[0];
}

export async function recordJobRun(
  jobName: string,
  status: 'success' | 'error',
  error?: string,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(jobRuns)
    .values({ jobName, lastRunAt: new Date(), lastStatus: status, lastError: error ?? null })
    .onDuplicateKeyUpdate({
      set: { lastRunAt: new Date(), lastStatus: status, lastError: error ?? null },
    });
}

// ============ Threads Account Functions ============

export async function createThreadsAccount(data: InsertThreadsAccount): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Encrypt access token before storage
  const encryptedData = {
    ...data,
    accessToken: data.accessToken ? encrypt(data.accessToken) : data.accessToken,
  };

  // Check if this Threads user is already connected (even if inactive)
  const existing = await db.select()
    .from(threadsAccounts)
    .where(and(
      eq(threadsAccounts.userId, data.userId!),
      eq(threadsAccounts.threadsUserId, data.threadsUserId)
    ))
    .limit(1);

  if (existing.length > 0) {
    // Update existing account (reactivate if inactive, refresh token)
    await db.update(threadsAccounts)
      .set({
        threadsUsername: encryptedData.threadsUsername,
        profilePictureUrl: encryptedData.profilePictureUrl,
        biography: encryptedData.biography,
        accessToken: encryptedData.accessToken,
        tokenExpiresAt: encryptedData.tokenExpiresAt,
        isActive: true,
      })
      .where(eq(threadsAccounts.id, existing[0].id));
    return;
  }

  await db.insert(threadsAccounts).values(encryptedData);
}

/** Decrypt access token in a ThreadsAccount object */
function decryptAccountToken<T extends { accessToken: string }>(account: T): T {
  return { ...account, accessToken: decrypt(account.accessToken) };
}

export async function getThreadsAccountsByUserId(userId: number): Promise<ThreadsAccount[]> {
  const db = await getDb();
  if (!db) return [];

  const results = await db.select()
    .from(threadsAccounts)
    .where(and(
      eq(threadsAccounts.userId, userId),
      eq(threadsAccounts.isActive, true)
    ));
  return results.map(decryptAccountToken);
}

// Get all accounts including inactive ones (for re-activation check)
export async function getAllThreadsAccountsByUserId(userId: number): Promise<ThreadsAccount[]> {
  const db = await getDb();
  if (!db) return [];

  const results = await db.select()
    .from(threadsAccounts)
    .where(eq(threadsAccounts.userId, userId));
  return results.map(decryptAccountToken);
}

export async function getThreadsAccountById(accountId: number): Promise<ThreadsAccount | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select()
    .from(threadsAccounts)
    .where(eq(threadsAccounts.id, accountId))
    .limit(1);

  return result.length > 0 ? decryptAccountToken(result[0]) : undefined;
}

/**
 * Get all active accounts with tokens expiring within the given days
 */
export async function getAccountsWithExpiringTokens(daysUntilExpiry: number): Promise<ThreadsAccount[]> {
  const db = await getDb();
  if (!db) return [];

  const expiryThreshold = new Date();
  expiryThreshold.setDate(expiryThreshold.getDate() + daysUntilExpiry);

  const results = await db.select()
    .from(threadsAccounts)
    .where(and(
      eq(threadsAccounts.isActive, true),
      lte(threadsAccounts.tokenExpiresAt, expiryThreshold)
    ));
  return results.map(decryptAccountToken);
}

/**
 * Update token for a Threads account after refresh
 */
export async function updateThreadsAccountToken(
  accountId: number,
  accessToken: string,
  expiresInSeconds: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const tokenExpiresAt = new Date();
  tokenExpiresAt.setSeconds(tokenExpiresAt.getSeconds() + expiresInSeconds);

  await db.update(threadsAccounts)
    .set({
      accessToken: encrypt(accessToken),
      tokenExpiresAt,
      updatedAt: new Date(),
    })
    .where(eq(threadsAccounts.id, accountId));
}

export async function updateThreadsAccount(
  accountId: number,
  data: Partial<InsertThreadsAccount>
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(threadsAccounts)
    .set(data)
    .where(eq(threadsAccounts.id, accountId));
}

// 連携解除：アクセスを停止し、保存しているアクセストークンを消去する。
// （プライバシー記載の「アクセストークンを削除」を実態と一致させるため。
//   投稿履歴などはアカウント削除／データ削除請求で消える。）
export async function deleteThreadsAccount(accountId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(threadsAccounts)
    .set({ isActive: false, accessToken: "" })
    .where(eq(threadsAccounts.id, accountId));
}

// データ削除リクエスト（Meta）用：該当アカウントを完全に物理削除する。
// 関連する予約・投稿履歴は外部キーのカスケードで一緒に削除される。
export async function hardDeleteThreadsAccount(accountId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.delete(threadsAccounts).where(eq(threadsAccounts.id, accountId));
}

// ============ Project Functions ============

export async function createProject(data: InsertProject): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.insert(projects).values(data);
}

export async function getProjectsByUserId(userId: number): Promise<Project[]> {
  const db = await getDb();
  if (!db) return [];

  return await db.select()
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(desc(projects.updatedAt));
}

export async function getProjectById(projectId: string): Promise<Project | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function updateProject(
  projectId: string,
  data: Partial<InsertProject>
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(projects)
    .set(data)
    .where(eq(projects.id, projectId));
}

export async function deleteProject(projectId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.delete(projects).where(eq(projects.id, projectId));
}

export async function countUserProjects(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const result = await db.select({ count: sql<number>`count(*)` })
    .from(projects)
    .where(eq(projects.userId, userId));

  return result[0]?.count ?? 0;
}

// ============ Scheduled Post Functions ============

export async function createScheduledPost(data: InsertScheduledPost): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.insert(scheduledPosts).values(data);
}

export async function getScheduledPostsByUserId(userId: number): Promise<ScheduledPost[]> {
  const db = await getDb();
  if (!db) return [];

  return await db.select()
    .from(scheduledPosts)
    .where(eq(scheduledPosts.userId, userId))
    .orderBy(desc(scheduledPosts.scheduledAt));
}

/**
 * LINE問い合わせ計測用：公開済みの自動メイン投稿（追い投稿=返信は除く）を古い順で返す。
 * 各投稿の合言葉は shared/inquiryKeywords.ts の inquiryKeywordForPost(id) で決まる。
 */
export async function getPostedAutoPostsByProject(projectId: string, since: Date): Promise<ScheduledPost[]> {
  const db = await getDb();
  if (!db) return [];

  return await db.select()
    .from(scheduledPosts)
    .where(and(
      eq(scheduledPosts.projectId, projectId),
      eq(scheduledPosts.source, 'auto'),
      eq(scheduledPosts.status, 'posted'),
      gte(scheduledPosts.postedAt, since),
      sql`${scheduledPosts.replyToThreadsId} IS NULL`,
    ))
    .orderBy(scheduledPosts.postedAt);
}

export async function getPendingScheduledPosts(): Promise<ScheduledPost[]> {
  const db = await getDb();
  if (!db) return [];

  return await db.select()
    .from(scheduledPosts)
    .where(and(
      eq(scheduledPosts.status, 'pending'),
      sql`${scheduledPosts.scheduledAt} <= NOW()`
    ));
}

/**
 * #3 アトミックに予約投稿を「処理中」に遷移させる（CAS）。
 *
 * 並列実行（cron 多重・複数インスタンス）時に同じ投稿が二重送信されないよう、
 *   UPDATE ... WHERE id=? AND status='pending'
 * の条件付き UPDATE を発行し、更新行数 1 のときだけ「自分が処理権を取った」と見なす。
 *
 * @returns 処理権を取得できたら true、既に他で処理されていたら false
 */
export async function claimScheduledPost(postId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const result: any = await db.update(scheduledPosts)
    .set({ status: 'processing' })
    .where(and(
      eq(scheduledPosts.id, postId),
      eq(scheduledPosts.status, 'pending'),
    ));
  // drizzle/mysql2 では affectedRows で確認できる
  const affected = result?.[0]?.affectedRows ?? result?.affectedRows ?? 0;
  return affected > 0;
}

export async function updateScheduledPost(
  postId: number,
  data: Partial<InsertScheduledPost>
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(scheduledPosts)
    .set(data)
    .where(eq(scheduledPosts.id, postId));
}

/**
 * Permanently delete a scheduled post row. Use this when the user wants
 * to clear a failed/canceled entry from history (the cancel mutation only
 * marks status='canceled' but keeps the row visible).
 *
 * Caller must already have verified ownership.
 */
export async function deleteScheduledPost(postId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(scheduledPosts).where(eq(scheduledPosts.id, postId));
}

export async function getScheduledPostById(postId: number): Promise<ScheduledPost | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select()
    .from(scheduledPosts)
    .where(eq(scheduledPosts.id, postId))
    .limit(1);
  return rows[0];
}

export async function countUserScheduledPosts(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const result = await db.select({ count: sql<number>`count(*)` })
    .from(scheduledPosts)
    .where(and(
      eq(scheduledPosts.userId, userId),
      eq(scheduledPosts.status, 'pending')
    ));

  return result[0]?.count ?? 0;
}

export async function countUserMonthlyPosts(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  // Count posts that were successfully posted in the current month
  const result = await db.select({ count: sql<number>`count(*)` })
    .from(scheduledPosts)
    .where(and(
      eq(scheduledPosts.userId, userId),
      eq(scheduledPosts.status, 'posted'),
      // 月境界はJST(UTC+9)で判定（コンテナ/DBがUTCのため+9時間して比較）
      sql`YEAR(DATE_ADD(${scheduledPosts.postedAt}, INTERVAL 9 HOUR)) = YEAR(DATE_ADD(NOW(), INTERVAL 9 HOUR))`,
      sql`MONTH(DATE_ADD(${scheduledPosts.postedAt}, INTERVAL 9 HOUR)) = MONTH(DATE_ADD(NOW(), INTERVAL 9 HOUR))`
    ));

  return result[0]?.count ?? 0;
}

/** 当月、その「連携アカウント」で公開された投稿数（上限はアカウント単位で適用）。 */
export async function countAccountMonthlyPosts(threadsAccountId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: sql<number>`count(*)` })
    .from(scheduledPosts)
    .where(and(
      eq(scheduledPosts.threadsAccountId, threadsAccountId),
      eq(scheduledPosts.status, 'posted'),
      // 月境界はJST(UTC+9)で判定（コンテナ/DBがUTCのため+9時間して比較）
      sql`YEAR(DATE_ADD(${scheduledPosts.postedAt}, INTERVAL 9 HOUR)) = YEAR(DATE_ADD(NOW(), INTERVAL 9 HOUR))`,
      sql`MONTH(DATE_ADD(${scheduledPosts.postedAt}, INTERVAL 9 HOUR)) = MONTH(DATE_ADD(NOW(), INTERVAL 9 HOUR))`
    ));
  return result[0]?.count ?? 0;
}

/** その「連携アカウント」で予約中（pending）の投稿数。 */
export async function countAccountScheduledPosts(threadsAccountId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: sql<number>`count(*)` })
    .from(scheduledPosts)
    .where(and(
      eq(scheduledPosts.threadsAccountId, threadsAccountId),
      eq(scheduledPosts.status, 'pending')
    ));
  return result[0]?.count ?? 0;
}

/**
 * 当月の「使用枠」＝当月公開済み(posted) ＋ 当月に予約済み(pending, scheduledAt が当月) の合計。
 * 月間上限の判定に使う（予約だけで当月枠を超過するのを防ぐ / B-5）。月境界はJST。
 */
export async function countAccountMonthlyUsage(threadsAccountId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: sql<number>`count(*)` })
    .from(scheduledPosts)
    .where(and(
      eq(scheduledPosts.threadsAccountId, threadsAccountId),
      // ★追い投稿（自分の投稿へのひとこと返信）は月間投稿枠を消費しない。
      //   これを除外しないと、追い投稿がライトプランの枠(40件)を食い潰し
      //   本体の自動投稿が止まってしまう。
      sql`${scheduledPosts.replyToThreadsId} IS NULL`,
      sql`(
        (${scheduledPosts.status} = 'posted'
          AND YEAR(DATE_ADD(${scheduledPosts.postedAt}, INTERVAL 9 HOUR)) = YEAR(DATE_ADD(NOW(), INTERVAL 9 HOUR))
          AND MONTH(DATE_ADD(${scheduledPosts.postedAt}, INTERVAL 9 HOUR)) = MONTH(DATE_ADD(NOW(), INTERVAL 9 HOUR)))
        OR
        (${scheduledPosts.status} = 'pending'
          AND YEAR(DATE_ADD(${scheduledPosts.scheduledAt}, INTERVAL 9 HOUR)) = YEAR(DATE_ADD(NOW(), INTERVAL 9 HOUR))
          AND MONTH(DATE_ADD(${scheduledPosts.scheduledAt}, INTERVAL 9 HOUR)) = MONTH(DATE_ADD(NOW(), INTERVAL 9 HOUR)))
      )`
    ));
  return result[0]?.count ?? 0;
}

// ============ Template Functions ============

export async function getAllTemplates(): Promise<Template[]> {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db.select().from(templates).orderBy(desc(templates.isPopular), desc(templates.usageCount));
  return result;
}

export async function getTemplatesByCategory(category: string): Promise<Template[]> {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db.select().from(templates)
    .where(eq(templates.category, category))
    .orderBy(desc(templates.isPopular), desc(templates.usageCount));
  return result;
}

export async function getTemplateById(templateId: number): Promise<Template | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(templates).where(eq(templates.id, templateId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function incrementTemplateUsage(templateId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  await db.update(templates)
    .set({ usageCount: sql`${templates.usageCount} + 1` })
    .where(eq(templates.id, templateId));
}

export async function getUserFavoriteTemplates(userId: number): Promise<Template[]> {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db.select({
    id: templates.id,
    title: templates.title,
    description: templates.description,
    category: templates.category,
    content: templates.content,
    previewText: templates.previewText,
    tags: templates.tags,
    usageCount: templates.usageCount,
    isPopular: templates.isPopular,
    isPremium: templates.isPremium,
    createdAt: templates.createdAt,
    updatedAt: templates.updatedAt,
  })
    .from(userFavorites)
    .innerJoin(templates, eq(userFavorites.templateId, templates.id))
    .where(eq(userFavorites.userId, userId))
    .orderBy(desc(userFavorites.createdAt));
  
  return result;
}

export async function addUserFavorite(userId: number, templateId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  // Check if already favorited
  const existing = await db.select().from(userFavorites)
    .where(and(
      eq(userFavorites.userId, userId),
      eq(userFavorites.templateId, templateId)
    ))
    .limit(1);
  
  if (existing.length === 0) {
    await db.insert(userFavorites).values({ userId, templateId });
  }
}

export async function removeUserFavorite(userId: number, templateId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  await db.delete(userFavorites)
    .where(and(
      eq(userFavorites.userId, userId),
      eq(userFavorites.templateId, templateId)
    ));
}

export async function isTemplateFavorited(userId: number, templateId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  const result = await db.select().from(userFavorites)
    .where(and(
      eq(userFavorites.userId, userId),
      eq(userFavorites.templateId, templateId)
    ))
    .limit(1);
  
  return result.length > 0;
}

// ============ Statistics Functions ============

export async function getUserStats(userId: number) {
  const db = await getDb();
  if (!db) return null;

  // Get total posts count
  const totalPosts = await db.select({ count: sql<number>`count(*)` })
    .from(scheduledPosts)
    .where(eq(scheduledPosts.userId, userId));

  // Get posts by status
  const postsByStatus = await db.select({
    status: scheduledPosts.status,
    count: sql<number>`count(*)`
  })
    .from(scheduledPosts)
    .where(eq(scheduledPosts.userId, userId))
    .groupBy(scheduledPosts.status);

  // Get monthly posts (last 6 months)
  const monthlyPosts = await db.select({
    month: sql<string>`DATE_FORMAT(${scheduledPosts.scheduledAt}, '%Y-%m')`,
    count: sql<number>`count(*)`
  })
    .from(scheduledPosts)
    .where(and(
      eq(scheduledPosts.userId, userId),
      sql`${scheduledPosts.scheduledAt} >= DATE_SUB(NOW(), INTERVAL 6 MONTH)`
    ))
    .groupBy(sql`DATE_FORMAT(${scheduledPosts.scheduledAt}, '%Y-%m')`)
    .orderBy(sql`DATE_FORMAT(${scheduledPosts.scheduledAt}, '%Y-%m')`);

  // Get total projects
  const totalProjects = await db.select({ count: sql<number>`count(*)` })
    .from(projects)
    .where(eq(projects.userId, userId));

  // Get total Threads accounts
  const totalAccounts = await db.select({ count: sql<number>`count(*)` })
    .from(threadsAccounts)
    .where(eq(threadsAccounts.userId, userId));

  return {
    totalPosts: totalPosts[0]?.count ?? 0,
    postsByStatus,
    monthlyPosts,
    totalProjects: totalProjects[0]?.count ?? 0,
    totalAccounts: totalAccounts[0]?.count ?? 0,
  };
}

export async function getPopularTemplates(limit: number = 5): Promise<Template[]> {
  const db = await getDb();
  if (!db) return [];

  const result = await db.select().from(templates)
    .orderBy(desc(templates.usageCount))
    .limit(limit);
  
  return result;
}

// ============ AI Generation Usage Functions ============

export async function incrementAiGenerationUsage(userId: number, inc: number = 1): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // 量産（複数本一括生成）では生成本数ぶん加算する。最低1。
  const amount = Math.max(1, Math.floor(inc));

  const currentMonth = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 7); // YYYY-MM (JST基準)

  // Try to increment existing record
  const existing = await db.select()
    .from(aiGenerationUsage)
    .where(and(
      eq(aiGenerationUsage.userId, userId),
      eq(aiGenerationUsage.month, currentMonth)
    ))
    .limit(1);

  if (existing.length > 0) {
    // Increment count
    await db.update(aiGenerationUsage)
      .set({ count: sql`${aiGenerationUsage.count} + ${amount}` })
      .where(eq(aiGenerationUsage.id, existing[0].id));
  } else {
    // Create new record
    await db.insert(aiGenerationUsage).values({
      userId,
      month: currentMonth,
      count: amount,
    });
  }
}

export async function getAiGenerationUsage(userId: number): Promise<{ count: number; limit: number | null }> {
  const db = await getDb();
  if (!db) return { count: 0, limit: null };

  const currentMonth = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 7); // YYYY-MM (JST基準)

  // Get current month usage
  const usage = await db.select()
    .from(aiGenerationUsage)
    .where(and(
      eq(aiGenerationUsage.userId, userId),
      eq(aiGenerationUsage.month, currentMonth)
    ))
    .limit(1);

  const count = usage.length > 0 ? usage[0].count : 0;

  // Get user's plan limit from PLANS
  const subscription = await getSubscriptionByUserId(userId);
  const plan = subscription ? PLANS[subscription.planId] : PLANS.free;
  const limit = plan?.features.maxAiGenerations ?? 0;

  return { count, limit };
}

/**
 * #2 デモモードユーザの AI 生成は 10 回までで打ち切る（収益保護）。
 *
 * 戻り値:
 *   - allowed: 生成を許可するか
 *   - exitedDemo: デモ枠を使い切ったので isDemoMode を false に切り替えた場合 true
 *                 （この場合呼び出し側でプラン判定をやり直す）
 */
export const DEMO_AI_GEN_CAP = 10;

export async function checkAndEnforceDemoCap(
  userId: number,
  isDemoMode: boolean,
): Promise<{ allowed: boolean; exitedDemo: boolean; remaining: number | null }> {
  if (!isDemoMode) {
    return { allowed: false, exitedDemo: false, remaining: null };
  }
  const { count } = await getAiGenerationUsage(userId);
  const remaining = Math.max(0, DEMO_AI_GEN_CAP - count);
  if (count < DEMO_AI_GEN_CAP) {
    return { allowed: true, exitedDemo: false, remaining };
  }
  // 上限到達 → 自動でデモを抜ける
  await setUserDemoMode(userId, false);
  return { allowed: false, exitedDemo: true, remaining: 0 };
}

/**
 * #25 ハードキャップ：無制限プランでも1ユーザあたりの月間生成数を物理的に制限する。
 * 悪意あるユーザによるLLMコスト暴走を防ぐ最後のセーフティネット。
 * 通常の運用ではここに到達しないが、暴走時の保険として機能する。
 *
 * 数値の根拠：
 *   - Pro/Business プランの想定「重ヘビーユーザ」が月 500〜1000 回
 *   - 2倍のマージンで 2000 回をハード上限に
 *   - 超過時は管理者にも通知して状況確認できるようにする
 */
export const HARD_AI_GEN_CAP_PER_MONTH = 2000;

export async function checkAiGenerationLimit(userId: number): Promise<boolean> {
  const { count, limit } = await getAiGenerationUsage(userId);

  // ★#25 無制限プランでもハードキャップを適用
  if (count >= HARD_AI_GEN_CAP_PER_MONTH) {
    return false;
  }

  // If limit is null or -1 (unlimited), always allow
  if (limit === null || limit === -1) return true;
  
  // If limit is 0, never allow
  if (limit === 0) return false;
  
  // Check if under limit
  return count < limit;
}

// ==================== AI Generation History ====================

export async function saveAiGenerationHistory(params: {
  userId: number;
  projectId?: string;
  postType: string;
  content: string; // JSON string of the generated post array
  metadata?: string; // JSON string of generation parameters
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const result = await db.insert(aiGenerationHistory).values({
    userId: params.userId,
    projectId: params.projectId ?? null,
    postType: params.postType,
    content: params.content,
    metadata: params.metadata ?? null,
  });

  return Number(result[0].insertId);
}

export async function getAiGenerationHistory(userId: number, limit: number = 50, offset: number = 0) {
  const db = await getDb();
  if (!db) return [];

  return await db.select()
    .from(aiGenerationHistory)
    .where(eq(aiGenerationHistory.userId, userId))
    .orderBy(desc(aiGenerationHistory.createdAt))
    .limit(limit)
    .offset(offset);
}

/**
 * Has the user generated at least one 固定投稿 (pinned profile post) yet?
 * Used by the dashboard to surface a "create your pinned post first" banner
 * for new users — the pinned profile post is the highest-CV element of a
 * Threads funnel, so we want users to build it before anything else.
 */
export async function hasGeneratedPinnedPost(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const rows = await db.select({ id: aiGenerationHistory.id })
    .from(aiGenerationHistory)
    .where(and(
      eq(aiGenerationHistory.userId, userId),
      eq(aiGenerationHistory.postType, 'pinned'),
    ))
    .limit(1);
  return rows.length > 0;
}

export async function getAiGenerationHistoryById(id: number, userId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select()
    .from(aiGenerationHistory)
    .where(and(
      eq(aiGenerationHistory.id, id),
      eq(aiGenerationHistory.userId, userId)
    ))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function deleteAiGenerationHistory(id: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const result = await db.delete(aiGenerationHistory)
    .where(and(
      eq(aiGenerationHistory.id, id),
      eq(aiGenerationHistory.userId, userId)
    ));

  return result[0].affectedRows > 0;
}

export async function countAiGenerationHistory(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const result = await db.select({ count: sql<number>`count(*)` })
    .from(aiGenerationHistory)
    .where(eq(aiGenerationHistory.userId, userId));

  return result[0]?.count ?? 0;
}

// ==================== Campaign Code Management ====================

export async function getAllCoupons(limit: number = 100, offset: number = 0) {
  const db = await getDb();
  if (!db) return [];

  return await db.select()
    .from(coupons)
    .orderBy(desc(coupons.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getCouponById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select()
    .from(coupons)
    .where(eq(coupons.id, id))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function createCoupon(params: {
  code: string;
  type: 'forever_free' | 'trial_30' | 'trial_14' | 'discount_50' | 'discount_30' | 'special_price' | 'monitor' | 'monitor_only';
  description?: string;
  maxUses?: number;
  expiresAt?: Date;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const result = await db.insert(coupons).values({
    code: params.code,
    type: params.type,
    description: params.description ?? null,
    maxUses: params.maxUses ?? null,
    expiresAt: params.expiresAt ?? null,
    isActive: true,
    usedCount: 0,
  });

  return Number(result[0].insertId);
}

export async function updateCoupon(id: number, params: {
  code?: string;
  type?: 'forever_free' | 'trial_30' | 'trial_14' | 'discount_50' | 'discount_30' | 'special_price' | 'monitor' | 'monitor_only';
  description?: string;
  maxUses?: number;
  expiresAt?: Date | null;
  isActive?: boolean;
}): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const result = await db.update(coupons)
    .set(params)
    .where(eq(coupons.id, id));

  return result[0].affectedRows > 0;
}

export async function deleteCoupon(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const result = await db.delete(coupons)
    .where(eq(coupons.id, id));

  return result[0].affectedRows > 0;
}

export async function countCoupons(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const result = await db.select({ count: sql<number>`count(*)` })
    .from(coupons);

  return result[0]?.count ?? 0;
}

export async function getCouponUsageStats(couponId: number) {
  const db = await getDb();
  if (!db) return null;

  const coupon = await getCouponById(couponId);
  if (!coupon) return null;

  const userCouponsData = await db.select()
    .from(userCoupons)
    .where(eq(userCoupons.couponId, couponId));

  return {
    coupon,
    usedCount: coupon.usedCount,
    maxUses: coupon.maxUses,
    users: userCouponsData,
  };
}


// ==================== AI Generation Templates ====================

export async function getUserTemplates(userId: number, limit: number = 50, offset: number = 0) {
  const db = await getDb();
  if (!db) return [];

  return await db.select()
    .from(aiGenerationTemplates)
    .where(eq(aiGenerationTemplates.userId, userId))
    .orderBy(desc(aiGenerationTemplates.usageCount), desc(aiGenerationTemplates.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getAiTemplateById(id: number, userId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select()
    .from(aiGenerationTemplates)
    .where(and(
      eq(aiGenerationTemplates.id, id),
      eq(aiGenerationTemplates.userId, userId)
    ))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function createTemplate(params: {
  userId: number;
  name: string;
  description?: string;
  postType: string;
  generationParams: string;
  isPublic?: boolean;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const result = await db.insert(aiGenerationTemplates).values({
    userId: params.userId,
    name: params.name,
    description: params.description ?? null,
    postType: params.postType,
    generationParams: params.generationParams,
    isPublic: params.isPublic ?? false,
    usageCount: 0,
  });

  return Number(result[0].insertId);
}

export async function updateTemplate(id: number, userId: number, params: {
  name?: string;
  description?: string;
  postType?: string;
  generationParams?: string;
  isPublic?: boolean;
}): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const result = await db.update(aiGenerationTemplates)
    .set(params)
    .where(and(
      eq(aiGenerationTemplates.id, id),
      eq(aiGenerationTemplates.userId, userId)
    ));

  return result[0].affectedRows > 0;
}

export async function deleteTemplate(id: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const result = await db.delete(aiGenerationTemplates)
    .where(and(
      eq(aiGenerationTemplates.id, id),
      eq(aiGenerationTemplates.userId, userId)
    ));

  return result[0].affectedRows > 0;
}

export async function incrementAiTemplateUsage(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(aiGenerationTemplates)
    .set({ usageCount: sql`${aiGenerationTemplates.usageCount} + 1` })
    .where(eq(aiGenerationTemplates.id, id));
}

export async function countUserTemplates(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const result = await db.select({ count: sql<number>`count(*)` })
    .from(aiGenerationTemplates)
    .where(eq(aiGenerationTemplates.userId, userId));

  return result[0]?.count ?? 0;
}

export async function getPopularAiTemplates(limit: number = 10) {
  const db = await getDb();
  if (!db) return [];

  return await db.select()
    .from(aiGenerationTemplates)
    .where(eq(aiGenerationTemplates.isPublic, true))
    .orderBy(desc(aiGenerationTemplates.usageCount))
    .limit(limit);
}

// ==================== AI Generation Presets ====================

export async function getAllPresets() {
  const db = await getDb();
  if (!db) return [];

  return await db.select()
    .from(aiGenerationPresets)
    .where(eq(aiGenerationPresets.isSystem, true))
    .orderBy(aiGenerationPresets.displayOrder, aiGenerationPresets.id);
}

export async function getCustomPresets(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select()
    .from(aiGenerationPresets)
    .where(and(
      eq(aiGenerationPresets.isSystem, false),
      eq(aiGenerationPresets.userId, userId)
    ))
    .orderBy(desc(aiGenerationPresets.isPinned), aiGenerationPresets.displayOrder, desc(aiGenerationPresets.createdAt));
}

export async function createCustomPreset(userId: number, data: {
  name: string;
  description: string | null;
  postType: string;
  defaultParams: string;
}) {
  const db = await getDb();
  if (!db) return 0;

  const result = await db.insert(aiGenerationPresets).values({
    userId,
    category: 'custom',
    name: data.name,
    description: data.description,
    icon: 'Star',
    postType: data.postType,
    defaultParams: data.defaultParams,
    isSystem: false,
    displayOrder: 0,
  });
  return Number(result[0].insertId);
}

export async function updateCustomPreset(userId: number, id: number, data: {
  name?: string;
  description?: string | null;
  postType?: string;
  defaultParams?: string;
}) {
  const db = await getDb();
  if (!db) return false;

  await db.update(aiGenerationPresets)
    .set(data)
    .where(and(
      eq(aiGenerationPresets.id, id),
      eq(aiGenerationPresets.isSystem, false),
      eq(aiGenerationPresets.userId, userId)
    ));

  return true;
}

export async function togglePinPreset(userId: number, id: number) {
  const db = await getDb();
  if (!db) return false;

  // Get current state
  const [preset] = await db.select({ isPinned: aiGenerationPresets.isPinned })
    .from(aiGenerationPresets)
    .where(and(
      eq(aiGenerationPresets.id, id),
      eq(aiGenerationPresets.userId, userId),
      eq(aiGenerationPresets.isSystem, false)
    ));

  if (!preset) return false;

  await db.update(aiGenerationPresets)
    .set({ isPinned: !preset.isPinned })
    .where(eq(aiGenerationPresets.id, id));

  return !preset.isPinned;
}

export async function updatePresetOrder(userId: number, presetIds: number[]) {
  const db = await getDb();
  if (!db) return false;

  for (let i = 0; i < presetIds.length; i++) {
    await db.update(aiGenerationPresets)
      .set({ displayOrder: i })
      .where(and(
        eq(aiGenerationPresets.id, presetIds[i]),
        eq(aiGenerationPresets.userId, userId),
        eq(aiGenerationPresets.isSystem, false)
      ));
  }

  return true;
}

export async function deleteCustomPreset(userId: number, id: number) {
  const db = await getDb();
  if (!db) return false;

  await db.delete(aiGenerationPresets)
    .where(and(
      eq(aiGenerationPresets.id, id),
      eq(aiGenerationPresets.isSystem, false),
      eq(aiGenerationPresets.userId, userId)
    ));

  return true;
}

export async function getPresetsByCategory(category: string) {
  const db = await getDb();
  if (!db) return [];

  return await db.select()
    .from(aiGenerationPresets)
    .where(eq(aiGenerationPresets.category, category))
    .orderBy(aiGenerationPresets.displayOrder, aiGenerationPresets.id);
}

export async function getPresetById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const results = await db.select()
    .from(aiGenerationPresets)
    .where(eq(aiGenerationPresets.id, id))
    .limit(1);

  return results[0] || null;
}

export async function createPreset(data: {
  category: string;
  name: string;
  description: string | null;
  icon: string | null;
  postType: string;
  defaultParams: string;
  isSystem: boolean;
  displayOrder: number;
}) {
  const db = await getDb();
  if (!db) return 0;

  const result = await db.insert(aiGenerationPresets).values(data);
  return Number(result[0].insertId);
}

export async function updatePreset(id: number, data: Partial<{
  name: string;
  description: string | null;
  icon: string | null;
  postType: string;
  defaultParams: string;
  displayOrder: number;
}>) {
  const db = await getDb();
  if (!db) return false;

  await db.update(aiGenerationPresets)
    .set(data)
    .where(eq(aiGenerationPresets.id, id));

  return true;
}

export async function deletePreset(id: number) {
  const db = await getDb();
  if (!db) return false;

  // Only allow deletion of non-system presets
  await db.delete(aiGenerationPresets)
    .where(and(
      eq(aiGenerationPresets.id, id),
      eq(aiGenerationPresets.isSystem, false)
    ));

  return true;
}

export async function incrementPresetUsage(id: number) {
  const db = await getDb();
  if (!db) return;

  await db.update(aiGenerationPresets)
    .set({ usageCount: sql`${aiGenerationPresets.usageCount} + 1` })
    .where(eq(aiGenerationPresets.id, id));
}

export async function getPopularPresets(limit: number = 10) {
  const db = await getDb();
  if (!db) return [];

  return await db.select()
    .from(aiGenerationPresets)
    .orderBy(desc(aiGenerationPresets.usageCount))
    .limit(limit);
}

// ============================================================================
// Setup Wizard Functions
// ============================================================================

export async function getUserSetupStep(userId: number) {
  const db = await getDb();
  if (!db) return null;

  const user = await db.select({ setupStep: users.setupStep })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return user[0]?.setupStep ?? 0;
}

export async function updateUserSetupStep(userId: number, setupStep: number) {
  const db = await getDb();
  if (!db) return false;

  await db.update(users)
    .set({ setupStep })
    .where(eq(users.id, userId));

  return true;
}

export async function completeUserSetup(userId: number) {
  const db = await getDb();
  if (!db) return false;

  await db.update(users)
    .set({ setupStep: 5, onboardingCompleted: true })
    .where(eq(users.id, userId));

  return true;
}

// ============================================================================
// Demo Mode Functions
// ============================================================================

export async function getUserDemoMode(userId: number) {
  const db = await getDb();
  if (!db) return true; // Default to demo mode if DB unavailable

  const user = await db.select({ isDemoMode: users.isDemoMode })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return user[0]?.isDemoMode ?? true;
}

export async function setUserDemoMode(userId: number, isDemoMode: boolean) {
  const db = await getDb();
  if (!db) return false;

  await db.update(users)
    .set({ isDemoMode })
    .where(eq(users.id, userId));

  return true;
}

export async function createDemoProject(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const projectId = `demo_${userId}_${Date.now()}`;
  
  const demoProject: InsertProject = {
    id: projectId,
    userId,
    title: "デモプロジェクト - 整体院サンプル",
    templateId: "chiropractic",
    businessType: "整体院",
    area: "東京都渋谷区",
    target: "肩こり・腰痛でお悩みの30-50代の方",
    mainProblem: "慢性的な肩こりや腰痛、姿勢の悪さ",
    strength: "国家資格保有者による丁寧な施術、骨盤矯正専門",
    proof: "年間1000名以上の施術実績、患者満足度95%",
    ctaLink: "https://example.com/booking",
  };

  await db.insert(projects).values(demoProject);

  return await db.select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)
    .then(rows => rows[0]);
}

// ============================================================================
// AI Chat Functions
// ============================================================================

export async function createChatConversation(userId: number, title?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const conversation: InsertAiChatConversation = {
    userId,
    title: title || null,
  };

  await db.insert(aiChatConversations).values(conversation);

  return await db.select()
    .from(aiChatConversations)
    .where(eq(aiChatConversations.userId, userId))
    .orderBy(desc(aiChatConversations.createdAt))
    .limit(1)
    .then(rows => rows[0]);
}

export async function getChatConversation(conversationId: number) {
  const db = await getDb();
  if (!db) return null;

  return await db.select()
    .from(aiChatConversations)
    .where(eq(aiChatConversations.id, conversationId))
    .limit(1)
    .then(rows => rows[0] || null);
}

export async function getUserChatConversations(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select()
    .from(aiChatConversations)
    .where(eq(aiChatConversations.userId, userId))
    .orderBy(desc(aiChatConversations.updatedAt))
    .limit(50);
}

export async function addChatMessage(conversationId: number, role: "user" | "assistant" | "system", content: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const message: InsertAiChatMessage = {
    conversationId,
    role,
    content,
  };

  await db.insert(aiChatMessages).values(message);

  // Update conversation updatedAt
  await db.update(aiChatConversations)
    .set({ updatedAt: new Date() })
    .where(eq(aiChatConversations.id, conversationId));

  return await db.select()
    .from(aiChatMessages)
    .where(eq(aiChatMessages.conversationId, conversationId))
    .orderBy(desc(aiChatMessages.createdAt))
    .limit(1)
    .then(rows => rows[0]);
}

export async function getChatMessages(conversationId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select()
    .from(aiChatMessages)
    .where(eq(aiChatMessages.conversationId, conversationId))
    .orderBy(aiChatMessages.createdAt);
}

export async function deleteChatConversation(conversationId: number) {
  const db = await getDb();
  if (!db) return false;

  await db.delete(aiChatConversations)
    .where(eq(aiChatConversations.id, conversationId));

  return true;
}

// ============================================================================
// Email Authentication Functions
// ============================================================================

/** プロフィール（名前・店舗名）を更新 */
export async function updateUserProfile(userId: number, data: { name: string; storeName: string | null }): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ name: data.name, storeName: data.storeName }).where(eq(users.id, userId));
}

export async function createEmailUser(email: string, passwordHash: string, name?: string, storeName?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Generate a unique openId for email users (email-based)
  const openId = `email_${email}`;

  const user: InsertUser = {
    openId,
    email,
    name: name || null,
    storeName: storeName || null,
    passwordHash,
    authProvider: 'email',
    loginMethod: 'email',
    lastSignedIn: new Date(),
  };

  await db.insert(users).values(user);

  return await getUserByEmail(email);
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function updateUserPassword(userId: number, passwordHash: string) {
  const db = await getDb();
  if (!db) return false;

  await db.update(users)
    .set({ passwordHash })
    .where(eq(users.id, userId));

  return true;
}


// ============ Admin User Management Functions ============

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];

  const userRows = await db.select({
    id: users.id,
    openId: users.openId,
    email: users.email,
    name: users.name,
    storeName: users.storeName,
    role: users.role,
    authProvider: users.authProvider,
    createdAt: users.createdAt,
    lastSignedIn: users.lastSignedIn,
    isMonitor: users.isMonitor,
  }).from(users).orderBy(desc(users.createdAt));

  if (userRows.length === 0) return [];

  // 各ユーザーの最新サブスク（createdAt 降順で先頭を採用）
  const subRows = await db.select({
    userId: subscriptions.userId,
    planId: subscriptions.planId,
    status: subscriptions.status,
    trialEndsAt: subscriptions.trialEndsAt,
  }).from(subscriptions).orderBy(desc(subscriptions.createdAt));
  const subByUser = new Map<number, { planId: string; status: string; trialEndsAt: Date | null }>();
  for (const s of subRows) {
    if (!subByUser.has(s.userId)) {
      subByUser.set(s.userId, { planId: s.planId, status: s.status, trialEndsAt: s.trialEndsAt ?? null });
    }
  }

  // 連携中（有効）Threadsアカウント数
  const acctRows = await db.select({
    userId: threadsAccounts.userId,
    count: sql<number>`count(*)`,
  }).from(threadsAccounts).where(eq(threadsAccounts.isActive, true)).groupBy(threadsAccounts.userId);
  const acctByUser = new Map<number, number>();
  for (const a of acctRows) acctByUser.set(a.userId, Number(a.count));

  return userRows.map((u) => {
    const sub = subByUser.get(u.id);
    return {
      ...u,
      planId: sub?.planId ?? null,
      subscriptionStatus: sub?.status ?? null,
      trialEndsAt: sub?.trialEndsAt ?? null,
      threadsAccountCount: acctByUser.get(u.id) ?? 0,
    };
  });
}

export async function setUserMonitor(userId: number, isMonitor: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ isMonitor }).where(eq(users.id, userId));
  return true;
}

export async function resetUserPassword(userId: number, newPasswordHash: string) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }
  
  await db.update(users)
    .set({ passwordHash: newPasswordHash })
    .where(eq(users.id, userId));
  
  return true;
}


// ============ Referral Program Functions ============

export async function generateReferralCode(): Promise<string> {
  // Generate a random 8-character alphanumeric code
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  
  // Check if code already exists
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const existing = await db.select()
    .from(users)
    .where(eq(users.referralCode, code))
    .limit(1);
  
  // If code exists, generate a new one recursively
  if (existing.length > 0) {
    return generateReferralCode();
  }
  
  return code;
}

/**
 * Referral コードからユーザを引く（招待者の特定）
 */
export async function getUserByReferralCode(code: string): Promise<User | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select()
    .from(users)
    .where(eq(users.referralCode, code))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/**
 * 紹介関係を作成し、両者にクレジットを付与する。
 *
 * 自己参照・重複適用は呼び出し側で防ぐ。
 */
export async function createReferralWithRewards(opts: {
  referrerId: number;
  referredUserId: number;
  referrerReward: number;
  referredReward: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // 既に紹介関係が登録されていないかチェック（重複防止）
  const existing = await db.select()
    .from(referrals)
    .where(eq(referrals.referredUserId, opts.referredUserId))
    .limit(1);
  if (existing.length > 0) return; // 既に紹介済み

  await db.insert(referrals).values({
    referrerId: opts.referrerId,
    referredUserId: opts.referredUserId,
    referrerReward: opts.referrerReward,
    referredReward: opts.referredReward,
  });

  // クレジットを付与（紹介者・被紹介者の両方）
  if (opts.referrerReward > 0) {
    await db.insert(creditTransactions).values({
      userId: opts.referrerId,
      amount: opts.referrerReward,
      type: 'referral_bonus',
      description: `紹介ボーナス: user #${opts.referredUserId} を招待`,
    });
    await db.update(users)
      .set({ credits: sql`${users.credits} + ${opts.referrerReward}` })
      .where(eq(users.id, opts.referrerId));
  }
  if (opts.referredReward > 0) {
    await db.insert(creditTransactions).values({
      userId: opts.referredUserId,
      amount: opts.referredReward,
      type: 'referred_bonus',
      description: `紹介経由ボーナス: 紹介リンクから登録`,
    });
    await db.update(users)
      .set({ credits: sql`${users.credits} + ${opts.referredReward}` })
      .where(eq(users.id, opts.referredUserId));
  }
}

export async function updateUserReferralCode(userId: number, referralCode: string) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  await db.update(users)
    .set({ referralCode })
    .where(eq(users.id, userId));


  return true;
}

export async function getUserCredits(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  
  const user = await db.select({ credits: users.credits })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  
  return user[0]?.credits || 0;
}

export async function getCreditTransactions(userId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select()
    .from(creditTransactions)
    .where(eq(creditTransactions.userId, userId))
    .orderBy(desc(creditTransactions.createdAt));
}

export async function getReferralsByReferrerId(referrerId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select({
    id: referrals.id,
    referredUserId: referrals.referredUserId,
    referrerReward: referrals.referrerReward,
    referredReward: referrals.referredReward,
    createdAt: referrals.createdAt,
  })
    .from(referrals)
    .where(eq(referrals.referrerId, referrerId))
    .orderBy(desc(referrals.createdAt));
}

// ==================== Threads Profile Sync ====================

/**
 * Update Threads account profile information
 */
export async function updateThreadsAccountProfile(
  accountId: number,
  profileData: {
    threadsUsername?: string;
    profilePictureUrl?: string;
    biography?: string;
    followersCount?: number;
    followingCount?: number;
  }
) {
  const db = await getDb();
  if (!db) return undefined;

  await db
    .update(threadsAccounts)
    .set({
      ...profileData,
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(threadsAccounts.id, accountId));

  return getThreadsAccountById(accountId);
}

// ==================== Password Reset Tokens ====================

/**
 * Create a password reset token
 */
export async function createPasswordResetToken(
  userId: number,
  token: string,
  expiresAt: Date
): Promise<PasswordResetToken | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const [result] = await db
    .insert(passwordResetTokens)
    .values({ userId, token, expiresAt });

  if (!result.insertId) return undefined;

  return await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.id, Number(result.insertId)))
    .limit(1)
    .then(rows => rows[0]);
}

/**
 * Get password reset token by token string
 */
export async function getPasswordResetToken(
  token: string
): Promise<PasswordResetToken | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  return await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.token, token))
    .limit(1)
    .then(rows => rows[0]);
}

/**
 * Delete password reset token
 */
export async function deletePasswordResetToken(tokenId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db
    .delete(passwordResetTokens)
    .where(eq(passwordResetTokens.id, tokenId));
}

/**
 * Delete all password reset tokens for a user
 */
export async function deletePasswordResetTokensByUserId(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db
    .delete(passwordResetTokens)
    .where(eq(passwordResetTokens.userId, userId));
}

/**
 * Update user's email verification status
 */
export async function updateEmailVerificationStatus(
  userId: number,
  verified: boolean
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db
    .update(users)
    .set({ 
      emailVerified: verified,
      emailVerificationToken: verified ? null : undefined
    })
    .where(eq(users.id, userId));
}

/**
 * Update user's email verification token
 */
export async function updateEmailVerificationToken(
  userId: number,
  token: string | null
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db
    .update(users)
    .set({ emailVerificationToken: token })
    .where(eq(users.id, userId));
}

/**
 * Get user by email verification token
 */
export async function getUserByEmailVerificationToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;

  return await db
    .select()
    .from(users)
    .where(eq(users.emailVerificationToken, token))
    .limit(1)
    .then(rows => rows[0]);
}

/**
 * Delete a user by ID (for testing purposes)
 */
export async function deleteUser(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.delete(users).where(eq(users.id, userId));
}

// ============ Auto Post Functions ============

/**
 * Get all users eligible for auto-posting:
 * - autoPostEnabled = true
 * - Has active subscription (not free)
 * - Has at least one active Threads account
 */
export async function getAutoPostEligibleUsers() {
  const database = await getDb();
  if (!database) return [];

  const eligibleUsers = await database
    .select({
      id: users.id,
      autoPostFrequency: users.autoPostFrequency,
      autoPostRequireApproval: users.autoPostRequireApproval,
      lastAutoPostTypeIndex: users.lastAutoPostTypeIndex,
      lastAutoPurposeIndex: users.lastAutoPurposeIndex,
    })
    .from(users)
    .innerJoin(subscriptions, eq(users.id, subscriptions.userId))
    .innerJoin(threadsAccounts, eq(users.id, threadsAccounts.userId))
    .where(
      and(
        eq(users.autoPostEnabled, true),
        sql`${subscriptions.status} IN ('active', 'trialing')`,
        eq(threadsAccounts.isActive, true),
      )
    );

  // Deduplicate by user ID
  const seen = new Set<number>();
  return eligibleUsers.filter(u => {
    if (seen.has(u.id)) return false;
    seen.add(u.id);
    return true;
  });
}

/**
 * Get user's active Threads accounts
 */
export async function getActiveThreadsAccounts(userId: number) {
  const database = await getDb();
  if (!database) return [];

  return database
    .select()
    .from(threadsAccounts)
    .where(and(eq(threadsAccounts.userId, userId), eq(threadsAccounts.isActive, true)));
}

/**
 * Get user's projects ordered by most recent
 */
export async function getUserProjects(userId: number) {
  const database = await getDb();
  if (!database) return [];

  return database
    .select()
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(desc(projects.updatedAt))
    .limit(5);
}

/**
 * Update user's auto-post rotation indices
 */
export async function updateUserAutoPostIndices(userId: number, typeIndex: number, purposeIndex: number) {
  const database = await getDb();
  if (!database) return;

  await database
    .update(users)
    .set({ lastAutoPostTypeIndex: typeIndex, lastAutoPurposeIndex: purposeIndex })
    .where(eq(users.id, userId));
}

/**
 * Get user's auto-post settings
 */
export async function getAutoPostSettings(userId: number) {
  const database = await getDb();
  if (!database) return null;

  const result = await database
    .select({
      autoPostEnabled: users.autoPostEnabled,
      autoPostFrequency: users.autoPostFrequency,
      autoPostRequireApproval: users.autoPostRequireApproval,
      autoTopicTag: users.autoTopicTag,
      autoFollowUpEnabled: users.autoFollowUpEnabled,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return result[0] || null;
}

/**
 * Update user's auto-post settings
 */
export async function updateAutoPostSettings(userId: number, settings: { autoPostEnabled?: boolean; autoPostFrequency?: "daily" | "twice_daily" | "three_daily"; autoPostRequireApproval?: boolean; autoTopicTag?: boolean; autoFollowUpEnabled?: boolean }) {
  const database = await getDb();
  if (!database) return;

  await database
    .update(users)
    .set(settings)
    .where(eq(users.id, userId));
}

/**
 * Get recent auto-generated scheduled posts for a user
 */
export async function getAutoPostHistory(userId: number, limit: number = 20) {
  const database = await getDb();
  if (!database) return [];

  return database
    .select()
    .from(scheduledPosts)
    .where(eq(scheduledPosts.userId, userId))
    .orderBy(desc(scheduledPosts.createdAt))
    .limit(limit);
}

// ==================== AI History Favorites ====================

export async function toggleHistoryFavorite(userId: number, historyId: number): Promise<boolean> {
  const database = await getDb();
  if (!database) return false;

  // Check if already favorited
  const existing = await database.select()
    .from(userHistoryFavorites)
    .where(and(
      eq(userHistoryFavorites.userId, userId),
      eq(userHistoryFavorites.historyId, historyId)
    ))
    .limit(1);

  if (existing.length > 0) {
    // Remove favorite
    await database.delete(userHistoryFavorites)
      .where(and(
        eq(userHistoryFavorites.userId, userId),
        eq(userHistoryFavorites.historyId, historyId)
      ));
    return false; // not favorited anymore
  } else {
    // Add favorite
    await database.insert(userHistoryFavorites).values({
      userId,
      historyId,
    });
    return true; // now favorited
  }
}

export async function getHistoryFavorites(userId: number): Promise<UserHistoryFavorite[]> {
  const database = await getDb();
  if (!database) return [];

  return database.select()
    .from(userHistoryFavorites)
    .where(eq(userHistoryFavorites.userId, userId))
    .orderBy(desc(userHistoryFavorites.createdAt));
}

// ==================== Weekly Report ====================

export async function getUserPostsLastWeek(userId: number) {
  const database = await getDb();
  if (!database) return [];

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  return database.select()
    .from(aiGenerationHistory)
    .where(and(
      eq(aiGenerationHistory.userId, userId),
      sql`${aiGenerationHistory.createdAt} >= ${oneWeekAgo}`
    ))
    .orderBy(desc(aiGenerationHistory.createdAt));
}

export async function getScheduledPostsLastWeek(userId: number) {
  const database = await getDb();
  if (!database) return [];

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  return database.select()
    .from(scheduledPosts)
    .where(and(
      eq(scheduledPosts.userId, userId),
      sql`${scheduledPosts.createdAt} >= ${oneWeekAgo}`
    ))
    .orderBy(desc(scheduledPosts.createdAt));
}

export async function getProPlusUsers() {
  const database = await getDb();
  if (!database) return [];

  return database
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      planId: subscriptions.planId,
    })
    .from(users)
    .innerJoin(subscriptions, eq(users.id, subscriptions.userId))
    .where(
      and(
        sql`${subscriptions.planId} NOT IN ('free', 'light')`,
        sql`${subscriptions.status} IN ('active', 'trialing')`
      )
    );
}

// ============ Post Analytics ============

export async function upsertPostAnalytics(data: InsertPostAnalytics): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.insert(postAnalytics)
    .values(data)
    .onDuplicateKeyUpdate({
      set: {
        impressions: data.impressions,
        likes: data.likes,
        replies: data.replies,
        reposts: data.reposts,
        postContent: data.postContent,
        postPermalink: data.postPermalink,
        postedAt: data.postedAt,
        fetchedAt: new Date(),
      },
    });
}

export async function getPostAnalyticsByUserId(userId: number): Promise<PostAnalytics[]> {
  const db = await getDb();
  if (!db) return [];

  return await db.select()
    .from(postAnalytics)
    .where(eq(postAnalytics.userId, userId))
    .orderBy(desc(postAnalytics.fetchedAt));
}

export async function getPostAnalyticsWithEngagement(userId: number) {
  const db = await getDb();
  if (!db) return { posts: [], avgEngagement: 0 };

  const posts = await db.select()
    .from(postAnalytics)
    .where(eq(postAnalytics.userId, userId))
    .orderBy(desc(postAnalytics.postedAt));

  // Calculate engagement for each post: likes + replies + reposts
  const postsWithEngagement = posts.map(p => ({
    ...p,
    engagement: p.likes + p.replies + p.reposts,
    engagementRate: p.impressions > 0
      ? ((p.likes + p.replies + p.reposts) / p.impressions) * 100
      : 0,
  }));

  const totalEngagement = postsWithEngagement.reduce((sum, p) => sum + p.engagement, 0);
  const avgEngagement = postsWithEngagement.length > 0
    ? totalEngagement / postsWithEngagement.length
    : 0;

  return { posts: postsWithEngagement, avgEngagement };
}

// ==================== 成果の見える化・ヒット投稿アーカイブ ====================

/** フォロワー数の日次スナップショットをupsert（同一アカウント×日は上書き＝冪等） */
export async function upsertFollowerSnapshot(data: {
  userId: number;
  threadsAccountId: number;
  followersCount: number;
  capturedOn: string; // 'YYYY-MM-DD'(JST)
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(followerSnapshots)
    .values(data)
    .onDuplicateKeyUpdate({ set: { followersCount: data.followersCount } });
}

/**
 * ユーザーのフォロワー推移（日別合計）。直近days日分を昇順で返す。
 * 複数アカウント連携時は同日の合計値。
 */
export async function getFollowerTrend(
  userId: number,
  days: number = 14,
): Promise<{ capturedOn: string; followers: number }[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({
    capturedOn: followerSnapshots.capturedOn,
    followers: sql<number>`SUM(${followerSnapshots.followersCount})`,
  })
    .from(followerSnapshots)
    .where(eq(followerSnapshots.userId, userId))
    .groupBy(followerSnapshots.capturedOn)
    .orderBy(desc(followerSnapshots.capturedOn))
    .limit(days);
  return rows
    .map((r) => ({ capturedOn: r.capturedOn, followers: Number(r.followers) }))
    .reverse();
}

/** ヒット投稿を全ユーザー横断アーカイブへupsert（threadsPostIdでユニーク・数値は最新に更新） */
export async function upsertHitPostArchive(data: {
  userId: number;
  threadsPostId: string;
  businessType: string | null;
  postContent: string | null;
  impressions: number;
  likes: number;
  replies: number;
  reposts: number;
  engagement: number;
  postedAt: Date | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(hitPostArchive)
    .values(data)
    .onDuplicateKeyUpdate({
      set: {
        impressions: data.impressions,
        likes: data.likes,
        replies: data.replies,
        reposts: data.reposts,
        engagement: data.engagement,
        businessType: data.businessType,
      },
    });
}

/** ヒット投稿アーカイブ一覧（管理者用。エンゲージメント降順） */
export async function listHitPostArchive(opts: {
  businessType?: string;
  limit: number;
  offset: number;
}): Promise<{ rows: HitPostArchive[]; total: number }> {
  const db = await getDb();
  if (!db) return { rows: [], total: 0 };
  const cond = opts.businessType
    ? sql`${hitPostArchive.businessType} LIKE ${'%' + opts.businessType + '%'}`
    : sql`1=1`;
  const rows = await db.select().from(hitPostArchive)
    .where(cond)
    .orderBy(desc(hitPostArchive.engagement))
    .limit(opts.limit)
    .offset(opts.offset);
  const cnt = await db.select({ c: sql<number>`COUNT(*)` }).from(hitPostArchive).where(cond);
  return { rows, total: Number(cnt[0]?.c ?? 0) };
}

/** 解約理由を保存 */
export async function createCancellationFeedback(data: {
  userId: number;
  planId: string | null;
  reason: string;
  detail: string | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(cancellationFeedback).values(data);
}

/** 予定時刻を過ぎた承認待ち投稿（全ユーザー分。リマインド＋翌日スライド用） */
export async function getOverdueAwaitingApprovalPosts(): Promise<ScheduledPost[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(scheduledPosts)
    .where(and(
      eq(scheduledPosts.status, 'awaiting_approval'),
      lte(scheduledPosts.scheduledAt, new Date()),
    ));
}

/** 予約投稿の時刻だけを更新（承認待ちの翌日スライド用） */
export async function updateScheduledPostTime(postId: number, scheduledAt: Date): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(scheduledPosts).set({ scheduledAt }).where(eq(scheduledPosts.id, postId));
}

// ==================== 非表示アイテム（初期プリセット・テンプレ集を隠す） ====================

/** ユーザーの非表示アイテムを種類ごとに返す（{preset:[keys], template:[keys]}） */
export async function getHiddenItems(userId: number): Promise<{ preset: string[]; template: string[] }> {
  const db = await getDb();
  if (!db) return { preset: [], template: [] };
  const rows = await db.select().from(hiddenItems).where(eq(hiddenItems.userId, userId));
  const out: { preset: string[]; template: string[] } = { preset: [], template: [] };
  for (const r of rows) {
    if (r.itemType === 'preset') out.preset.push(r.itemKey);
    else if (r.itemType === 'template') out.template.push(r.itemKey);
  }
  return out;
}

/** 非表示に追加（重複は無視＝冪等） */
export async function addHiddenItem(userId: number, itemType: string, itemKey: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(hiddenItems)
    .values({ userId, itemType, itemKey })
    .onDuplicateKeyUpdate({ set: { itemKey } }); // no-op update to swallow duplicates
}

/** 非表示を解除（元に戻す） */
export async function removeHiddenItem(userId: number, itemType: string, itemKey: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(hiddenItems).where(and(
    eq(hiddenItems.userId, userId),
    eq(hiddenItems.itemType, itemType),
    eq(hiddenItems.itemKey, itemKey),
  ));
}

// ==================== リーチ強化（コメント即応・当たり時間） ====================

/** コメント確認時刻を更新（通知の重複防止） */
export async function updateUserLastCommentCheck(userId: number, at: Date): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ lastCommentCheckAt: at }).where(eq(users.id, userId));
}

/**
 * 本人の実績から「反応が高い投稿時間帯（JST）」を返す。
 * データが少ないうちは null（呼び出し側はデフォルト時刻を使う）。
 * 条件: postedAtのある投稿が8件以上・時間帯3種類以上。7〜22時のみ採用。
 */
export async function getUserBestPostingHours(userId: number): Promise<number[] | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({
    hour: sql<number>`HOUR(DATE_ADD(${postAnalytics.postedAt}, INTERVAL 9 HOUR))`,
    posts: sql<number>`COUNT(*)`,
    avgEng: sql<number>`AVG(${postAnalytics.likes} + ${postAnalytics.replies} + ${postAnalytics.reposts})`,
  })
    .from(postAnalytics)
    .where(and(eq(postAnalytics.userId, userId), sql`${postAnalytics.postedAt} IS NOT NULL`))
    .groupBy(sql`HOUR(DATE_ADD(${postAnalytics.postedAt}, INTERVAL 9 HOUR))`);

  const total = rows.reduce((s, r) => s + Number(r.posts), 0);
  const usable = rows
    .map((r) => ({ hour: Number(r.hour), posts: Number(r.posts), avgEng: Number(r.avgEng) }))
    .filter((r) => r.hour >= 7 && r.hour <= 22 && r.posts >= 2);
  if (total < 8 || usable.length < 3) return null;

  return usable
    .sort((a, b) => b.avgEng - a.avgEng)
    .slice(0, 4)
    .map((r) => r.hour);
}

// ==================== 地域トレンド（参考投稿） ====================

/** プロジェクトの地域参考投稿一覧（新しい順） */
export async function listRegionalRefPosts(projectId: string): Promise<RegionalRefPost[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(regionalRefPosts)
    .where(eq(regionalRefPosts.projectId, projectId))
    .orderBy(desc(regionalRefPosts.createdAt))
    .limit(60);
}

/** 参考投稿を1件追加（手動/収集共通） */
export async function addRegionalRefPost(data: {
  userId: number; projectId: string; source: string; area?: string | null;
  keyword?: string | null; authorUsername?: string | null; text: string;
  permalink?: string | null; postedAt?: Date | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(regionalRefPosts).values({
    userId: data.userId, projectId: data.projectId, source: data.source,
    area: data.area ?? null, keyword: data.keyword ?? null,
    authorUsername: data.authorUsername ?? null, text: data.text,
    permalink: data.permalink ?? null, postedAt: data.postedAt ?? null,
  });
}

/** 既存の参考投稿の permalink 集合（収集時の重複登録を避ける） */
export async function getRegionalRefPermalinks(projectId: string): Promise<Set<string>> {
  const rows = await listRegionalRefPosts(projectId);
  return new Set(rows.map((r) => r.permalink).filter((p): p is string => !!p));
}

/** 参考投稿を1件削除（本人のもののみ） */
export async function removeRegionalRefPost(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(regionalRefPosts).where(and(eq(regionalRefPosts.id, id), eq(regionalRefPosts.userId, userId)));
}

// ==================== 契約時アンケート（興味のあるコンテンツ） ====================

/** 回答済みか（存在＝回答済み） */
export async function getContentInterestSurvey(userId: number): Promise<ContentInterestSurvey | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(contentInterestSurvey).where(eq(contentInterestSurvey.userId, userId)).limit(1);
  return rows[0];
}

/** アンケート回答を保存（1ユーザー1回・再回答は上書き） */
export async function upsertContentInterestSurvey(userId: number, interests: string, freeText: string | null, wantsInfo: boolean): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(contentInterestSurvey)
    .values({ userId, interests, freeText, wantsInfo })
    .onDuplicateKeyUpdate({ set: { interests, freeText, wantsInfo } });
}

// ==================== Processing Timeout ====================

/**
 * Get scheduled posts stuck in 'processing' state for longer than timeout
 */
export async function getStuckProcessingPosts(timeoutMs: number): Promise<ScheduledPost[]> {
  const database = await getDb();
  if (!database) return [];

  const cutoff = new Date(Date.now() - timeoutMs);
  return await database.select()
    .from(scheduledPosts)
    .where(and(
      eq(scheduledPosts.status, 'processing'),
      lte(scheduledPosts.updatedAt, cutoff)
    ));
}

// ============================================================
// Monitor Feedback
// ============================================================

export async function createMonitorFeedback(data: { userId: number; page: string; category: string; content: string; screenshotUrl?: string }) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(monitorFeedback).values({
    userId: data.userId,
    page: data.page,
    category: data.category as any,
    content: data.content,
    screenshotUrl: data.screenshotUrl || null,
  });
  return result[0].insertId;
}

export async function getMonitorFeedbackByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(monitorFeedback).where(eq(monitorFeedback.userId, userId)).orderBy(desc(monitorFeedback.createdAt));
}

export async function getAllMonitorFeedback(limit = 50, offset = 0) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    feedback: monitorFeedback,
    userName: users.name,
    userEmail: users.email,
  }).from(monitorFeedback)
    .leftJoin(users, eq(monitorFeedback.userId, users.id))
    .orderBy(desc(monitorFeedback.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function countMonitorFeedback() {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: sql<number>`COUNT(*)` }).from(monitorFeedback);
  return result[0]?.count || 0;
}

export async function updateMonitorFeedbackStatus(id: number, status: string, adminNote?: string) {
  const db = await getDb();
  if (!db) return false;
  await db.update(monitorFeedback).set({
    status: status as any,
    adminNote: adminNote || null,
    updatedAt: new Date(),
  }).where(eq(monitorFeedback.id, id));
  return true;
}

