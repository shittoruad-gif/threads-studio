import { eq, and, desc, sql, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
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
  passwordResetTokens, PasswordResetToken, InsertPasswordResetToken
} from "../drizzle/schema";
import { ENV } from './_core/env';
import { PLANS } from '../shared/plans';

let _db: ReturnType<typeof drizzle> | null = null;

/**
 * Get or create a database connection.
 * If the cached connection is stale (ECONNRESET), it will be recreated.
 */
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
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

export async function updateUserStripeCustomerId(userId: number, stripeCustomerId: string) {
  const db = await getDb();
  if (!db) return;

  await db.update(users)
    .set({ stripeCustomerId })
    .where(eq(users.id, userId));
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

export async function updatePlanStripePriceId(planId: string, stripePriceId: string) {
  const db = await getDb();
  if (!db) return;

  await db.update(plans)
    .set({ stripePriceId })
    .where(eq(plans.id, planId));
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

export async function getSubscriptionByStripeId(stripeSubscriptionId: string): Promise<Subscription | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
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

export async function updateSubscriptionByStripeId(
  stripeSubscriptionId: string,
  data: Partial<InsertSubscription>
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(subscriptions)
    .set(data)
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId));
}

// ============ Threads Account Functions ============

export async function createThreadsAccount(data: InsertThreadsAccount): Promise<void> {
  const db = await getDb();
  if (!db) return;

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
        threadsUsername: data.threadsUsername,
        profilePictureUrl: data.profilePictureUrl,
        biography: data.biography,
        accessToken: data.accessToken,
        tokenExpiresAt: data.tokenExpiresAt,
        isActive: true,
      })
      .where(eq(threadsAccounts.id, existing[0].id));
    return;
  }

  await db.insert(threadsAccounts).values(data);
}

export async function getThreadsAccountsByUserId(userId: number): Promise<ThreadsAccount[]> {
  const db = await getDb();
  if (!db) return [];

  return await db.select()
    .from(threadsAccounts)
    .where(and(
      eq(threadsAccounts.userId, userId),
      eq(threadsAccounts.isActive, true)
    ));
}

// Get all accounts including inactive ones (for re-activation check)
export async function getAllThreadsAccountsByUserId(userId: number): Promise<ThreadsAccount[]> {
  const db = await getDb();
  if (!db) return [];

  return await db.select()
    .from(threadsAccounts)
    .where(eq(threadsAccounts.userId, userId));
}

export async function getThreadsAccountById(accountId: number): Promise<ThreadsAccount | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select()
    .from(threadsAccounts)
    .where(eq(threadsAccounts.id, accountId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * Get all active accounts with tokens expiring within the given days
 */
export async function getAccountsWithExpiringTokens(daysUntilExpiry: number): Promise<ThreadsAccount[]> {
  const db = await getDb();
  if (!db) return [];

  const expiryThreshold = new Date();
  expiryThreshold.setDate(expiryThreshold.getDate() + daysUntilExpiry);

  return await db.select()
    .from(threadsAccounts)
    .where(and(
      eq(threadsAccounts.isActive, true),
      lte(threadsAccounts.tokenExpiresAt, expiryThreshold)
    ));
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
      accessToken,
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

export async function deleteThreadsAccount(accountId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(threadsAccounts)
    .set({ isActive: false })
    .where(eq(threadsAccounts.id, accountId));
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
      sql`YEAR(${scheduledPosts.postedAt}) = YEAR(NOW())`,
      sql`MONTH(${scheduledPosts.postedAt}) = MONTH(NOW())`
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

export async function incrementAiGenerationUsage(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format

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
      .set({ count: sql`${aiGenerationUsage.count} + 1` })
      .where(eq(aiGenerationUsage.id, existing[0].id));
  } else {
    // Create new record
    await db.insert(aiGenerationUsage).values({
      userId,
      month: currentMonth,
      count: 1,
    });
  }
}

export async function getAiGenerationUsage(userId: number): Promise<{ count: number; limit: number | null }> {
  const db = await getDb();
  if (!db) return { count: 0, limit: null };

  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format

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

export async function checkAiGenerationLimit(userId: number): Promise<boolean> {
  const { count, limit } = await getAiGenerationUsage(userId);
  
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
  type: 'forever_free' | 'trial_30' | 'trial_14';
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
  type?: 'forever_free' | 'trial_30' | 'trial_14';
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

export async function createEmailUser(email: string, passwordHash: string, name?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Generate a unique openId for email users (email-based)
  const openId = `email_${email}`;

  const user: InsertUser = {
    openId,
    email,
    name: name || null,
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
  
  return await db.select({
    id: users.id,
    openId: users.openId,
    email: users.email,
    name: users.name,
    role: users.role,
    authProvider: users.authProvider,
    createdAt: users.createdAt,
    lastSignedIn: users.lastSignedIn,
  }).from(users).orderBy(desc(users.createdAt));
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
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return result[0] || null;
}

/**
 * Update user's auto-post settings
 */
export async function updateAutoPostSettings(userId: number, settings: { autoPostEnabled?: boolean; autoPostFrequency?: string }) {
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
