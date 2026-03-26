import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, bigint, uniqueIndex, index } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }).unique(),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  // Authentication provider: 'manus' (OAuth) or 'email' (email+password)
  authProvider: mysqlEnum("authProvider", ["manus", "email"]).default("manus").notNull(),
  // Password hash for email+password authentication (null for OAuth users)
  passwordHash: varchar("passwordHash", { length: 255 }),
  // Email verification status
  emailVerified: boolean("emailVerified").default(false).notNull(),
  // Email verification token
  emailVerificationToken: varchar("emailVerificationToken", { length: 64 }),
  // Stripe customer ID for payment integration
  stripeCustomerId: varchar("stripeCustomerId", { length: 255 }),
  // Onboarding tour completion status
  onboardingCompleted: boolean("onboardingCompleted").default(false).notNull(),
  // Setup wizard progress: 0=not started, 1=welcome, 2=threads, 3=project, 4=ai_generate, 5=completed
  setupStep: int("setupStep").default(0).notNull(),
  // Demo mode: true if user is in demo mode (no real Threads connection required)
  isDemoMode: boolean("isDemoMode").default(true).notNull(),
  // Auto-post settings
  autoPostEnabled: boolean("autoPostEnabled").default(true).notNull(),
  autoPostFrequency: mysqlEnum("autoPostFrequency", ["daily", "twice_daily", "three_daily"]).default("daily").notNull(),
  // Last auto-post type index (for rotation)
  lastAutoPostTypeIndex: int("lastAutoPostTypeIndex").default(0).notNull(),
  lastAutoPurposeIndex: int("lastAutoPurposeIndex").default(0).notNull(),
  // Referral code for referral program
  referralCode: varchar("referralCode", { length: 16 }).unique(),
  // User's credit balance (for referral rewards)
  credits: int("credits").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Subscription plans configuration
 */
export const plans = mysqlTable("plans", {
  id: varchar("id", { length: 50 }).primaryKey(), // e.g., 'free', 'light', 'pro', 'business'
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  priceMonthly: int("priceMonthly").notNull(), // Price in JPY
  stripePriceId: varchar("stripePriceId", { length: 255 }), // Stripe Price ID for paid plans
  // Feature limits
  maxProjects: int("maxProjects").notNull().default(3),
  maxThreadsAccounts: int("maxThreadsAccounts").notNull().default(0),
  maxScheduledPosts: int("maxScheduledPosts").notNull().default(0),
  maxAiGenerations: int("maxAiGenerations").notNull().default(0), // -1 for unlimited, 0 for none
  hasPrioritySupport: boolean("hasPrioritySupport").notNull().default(false),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Plan = typeof plans.$inferSelect;
export type InsertPlan = typeof plans.$inferInsert;

/**
 * User subscriptions - stores only essential Stripe identifiers
 */
export const subscriptions = mysqlTable("subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  planId: varchar("planId", { length: 50 }).notNull().references(() => plans.id),
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 255 }),
  univapaySubscriptionId: varchar("univapaySubscriptionId", { length: 255 }),
  // Cache subscription status for performance (updated via webhook)
  status: mysqlEnum("status", ["trialing", "active", "canceled", "past_due", "unpaid", "incomplete"]).default("trialing").notNull(),
  // Trial period
  trialEndsAt: timestamp("trialEndsAt"),
  // Current billing period end (cached for quick access checks)
  currentPeriodEnd: timestamp("currentPeriodEnd"),
  cancelAtPeriodEnd: boolean("cancelAtPeriodEnd").notNull().default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;

/**
 * Threads account connections (mock implementation for now)
 */
export const threadsAccounts = mysqlTable("threadsAccounts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  threadsUserId: varchar("threadsUserId", { length: 255 }).notNull(),
  threadsUsername: varchar("threadsUsername", { length: 255 }),
  profilePictureUrl: text("profilePictureUrl"),
  biography: text("biography"),
  followersCount: int("followersCount").default(0),
  followingCount: int("followingCount").default(0),
  lastSyncedAt: timestamp("lastSyncedAt"),
  accessToken: text("accessToken").notNull(),
  tokenExpiresAt: timestamp("tokenExpiresAt"),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ThreadsAccount = typeof threadsAccounts.$inferSelect;
export type InsertThreadsAccount = typeof threadsAccounts.$inferInsert;

/**
 * Projects - stores user's thread projects
 */
export const projects = mysqlTable("projects", {
  id: varchar("id", { length: 50 }).primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  templateId: varchar("templateId", { length: 100 }),
  inputs: text("inputs"), // JSON string of input values
  posts: text("posts"), // JSON string of posts array
  tags: text("tags"), // JSON string of tags array
  // 店舗情報フィールド
  businessType: varchar("businessType", { length: 100 }), // 業種
  area: varchar("area", { length: 100 }), // 地域
  target: text("target"), // ターゲット
  mainProblem: text("mainProblem"), // 主な悩み
  strength: text("strength"), // 強み/特徴
  proof: text("proof"), // 実績/証拠
  ctaLink: text("ctaLink"), // 誘導先URL
  usp: text("usp"), // USP（第13回：独自の強み）
  n1Customer: text("n1Customer"), // N1分析：実在の1人の顧客像（第11回）
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

/**
 * Scheduled posts for Threads
 */
export const scheduledPosts = mysqlTable("scheduledPosts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  projectId: varchar("projectId", { length: 50 }).notNull().references(() => projects.id, { onDelete: "cascade" }),
  threadsAccountId: int("threadsAccountId").notNull().references(() => threadsAccounts.id, { onDelete: "cascade" }),
  scheduledAt: timestamp("scheduledAt").notNull(),
  status: mysqlEnum("status", ["pending", "processing", "posted", "failed", "canceled"]).default("pending").notNull(),
  postedAt: timestamp("postedAt"),
  errorMessage: text("errorMessage"),
  // Store the post content snapshot at scheduling time
  postContent: text("postContent"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ScheduledPost = typeof scheduledPosts.$inferSelect;
export type InsertScheduledPost = typeof scheduledPosts.$inferInsert;

/**
 * Coupons - promotional codes for discounts and trials
 */
export const coupons = mysqlTable("coupons", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  type: mysqlEnum("type", ["forever_free", "trial_30", "trial_14"]).notNull(),
  description: text("description"),
  maxUses: int("maxUses"), // null = unlimited
  usedCount: int("usedCount").notNull().default(0),
  expiresAt: timestamp("expiresAt"),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Coupon = typeof coupons.$inferSelect;
export type InsertCoupon = typeof coupons.$inferInsert;

/**
 * User coupons - tracks which users have used which coupons
 */
export const userCoupons = mysqlTable("userCoupons", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  couponId: int("couponId").notNull().references(() => coupons.id, { onDelete: "cascade" }),
  appliedAt: timestamp("appliedAt").defaultNow().notNull(),
});

export type UserCoupon = typeof userCoupons.$inferSelect;
export type InsertUserCoupon = typeof userCoupons.$inferInsert;

/**
 * Templates - pre-built post templates for different industries
 */
export const templates = mysqlTable("templates", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 50 }).notNull(), // e.g., 'beauty', 'clinic', 'restaurant', 'gym', 'cafe'
  content: text("content").notNull(), // Template content with placeholders
  previewText: text("previewText"), // Short preview of the template
  tags: text("tags"), // Comma-separated tags for filtering
  usageCount: int("usageCount").notNull().default(0),
  isPopular: boolean("isPopular").notNull().default(false),
  isPremium: boolean("isPremium").notNull().default(false), // Requires paid plan
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Template = typeof templates.$inferSelect;
export type InsertTemplate = typeof templates.$inferInsert;

/**
 * User favorite templates - tracks which templates users have favorited
 */
export const userFavorites = mysqlTable("userFavorites", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  templateId: int("templateId").notNull().references(() => templates.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type UserFavorite = typeof userFavorites.$inferSelect;
export type InsertUserFavorite = typeof userFavorites.$inferInsert;

// AI生成回数トラッキング
export const aiGenerationUsage = mysqlTable("aiGenerationUsage", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  month: varchar("month", { length: 7 }).notNull(), // YYYY-MM format
  count: int("count").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userMonthIdx: uniqueIndex("user_month_idx").on(table.userId, table.month),
}));

export type AiGenerationUsage = typeof aiGenerationUsage.$inferSelect;
export type InsertAiGenerationUsage = typeof aiGenerationUsage.$inferInsert;

/**
 * AI Generation History - stores past AI-generated posts for reuse
 */
export const aiGenerationHistory = mysqlTable("aiGenerationHistory", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  projectId: varchar("projectId", { length: 50 }).references(() => projects.id, { onDelete: "set null" }),
  postType: varchar("postType", { length: 50 }).notNull(), // 'promotional', 'educational', 'engagement', 'seasonal', 'testimonial'
  content: text("content").notNull(), // JSON string of the generated post (array of thread posts)
  metadata: text("metadata"), // JSON string of generation parameters (business type, target audience, etc.)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("user_id_idx").on(table.userId),
  projectIdIdx: index("project_id_idx").on(table.projectId),
  createdAtIdx: index("created_at_idx").on(table.createdAt),
}));

export type AiGenerationHistory = typeof aiGenerationHistory.$inferSelect;
export type InsertAiGenerationHistory = typeof aiGenerationHistory.$inferInsert;

/**
 * User favorite AI generation history items
 */
export const userHistoryFavorites = mysqlTable("userHistoryFavorites", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  historyId: int("historyId").notNull().references(() => aiGenerationHistory.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  userHistoryIdx: uniqueIndex("user_history_favorite_idx").on(table.userId, table.historyId),
}));

export type UserHistoryFavorite = typeof userHistoryFavorites.$inferSelect;
export type InsertUserHistoryFavorite = typeof userHistoryFavorites.$inferInsert;

/**
 * AI Generation Templates - stores reusable generation patterns
 */
export const aiGenerationTemplates = mysqlTable("aiGenerationTemplates", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  postType: varchar("postType", { length: 50 }).notNull(),
  generationParams: text("generationParams").notNull(), // JSON string of generation parameters
  isPublic: boolean("isPublic").notNull().default(false),
  usageCount: int("usageCount").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userIdIdx: index("template_user_id_idx").on(table.userId),
  usageCountIdx: index("template_usage_count_idx").on(table.usageCount),
}));

export type AiGenerationTemplate = typeof aiGenerationTemplates.$inferSelect;
export type InsertAiGenerationTemplate = typeof aiGenerationTemplates.$inferInsert;

/**
 * AI Generation Presets - system-defined and custom presets for quick generation
 */
export const aiGenerationPresets = mysqlTable("aiGenerationPresets", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("userId").references(() => users.id, { onDelete: "cascade" }), // null for system presets
  category: varchar("category", { length: 50 }).notNull(), // 'industry', 'purpose', 'post_type', 'custom'
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  icon: varchar("icon", { length: 50 }), // lucide icon name
  postType: varchar("postType", { length: 50 }).notNull(),
  defaultParams: text("defaultParams").notNull(), // JSON string of default parameters
  isSystem: boolean("isSystem").notNull().default(true), // system preset or custom preset
  isPinned: boolean("isPinned").notNull().default(false),
  displayOrder: int("displayOrder").notNull().default(0),
  usageCount: int("usageCount").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  categoryIdx: index("preset_category_idx").on(table.category),
  displayOrderIdx: index("preset_display_order_idx").on(table.displayOrder),
  usageCountIdx: index("preset_usage_count_idx").on(table.usageCount),
  userIdx: index("preset_user_idx").on(table.userId),
}));

export type AiGenerationPreset = typeof aiGenerationPresets.$inferSelect;
export type InsertAiGenerationPreset = typeof aiGenerationPresets.$inferInsert;

/**
 * AI Chat Conversations - stores chat sessions with AI assistant
 */
export const aiChatConversations = mysqlTable("aiChatConversations", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }), // Auto-generated or user-defined title
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userIdIdx: index("chat_conversation_user_id_idx").on(table.userId),
}));

export type AiChatConversation = typeof aiChatConversations.$inferSelect;
export type InsertAiChatConversation = typeof aiChatConversations.$inferInsert;

/**
 * AI Chat Messages - stores individual messages in chat conversations
 */
export const aiChatMessages = mysqlTable("aiChatMessages", {
  id: int("id").primaryKey().autoincrement(),
  conversationId: int("conversationId").notNull().references(() => aiChatConversations.id, { onDelete: "cascade" }),
  role: mysqlEnum("role", ["user", "assistant", "system"]).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  conversationIdIdx: index("chat_message_conversation_id_idx").on(table.conversationId),
}));

export type AiChatMessage = typeof aiChatMessages.$inferSelect;
export type InsertAiChatMessage = typeof aiChatMessages.$inferInsert;


/**
 * Referrals - tracks referral relationships between users
 */
export const referrals = mysqlTable("referrals", {
  id: int("id").primaryKey().autoincrement(),
  referrerId: int("referrerId").notNull().references(() => users.id, { onDelete: "cascade" }),
  referredUserId: int("referredUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  referrerReward: int("referrerReward").default(0).notNull(), // Credits awarded to referrer
  referredReward: int("referredReward").default(0).notNull(), // Credits awarded to referred user
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  referrerIdIdx: index("referral_referrer_id_idx").on(table.referrerId),
  referredUserIdIdx: index("referral_referred_user_id_idx").on(table.referredUserId),
}));

export type Referral = typeof referrals.$inferSelect;
export type InsertReferral = typeof referrals.$inferInsert;

/**
 * Credit Transactions - tracks credit balance changes for users
 */
export const creditTransactions = mysqlTable("creditTransactions", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  amount: int("amount").notNull(), // Positive for credits added, negative for credits used
  type: mysqlEnum("type", ["referral_bonus", "referred_bonus", "purchase", "usage", "referral_reward"]).notNull(),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("credit_transaction_user_id_idx").on(table.userId),
}));

export type CreditTransaction = typeof creditTransactions.$inferSelect;
export type InsertCreditTransaction = typeof creditTransactions.$inferInsert;

/**
 * Password Reset Tokens - stores temporary tokens for password reset
 */
export const passwordResetTokens = mysqlTable("passwordResetTokens", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("password_reset_token_user_id_idx").on(table.userId),
  tokenIdx: index("password_reset_token_token_idx").on(table.token),
}));

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = typeof passwordResetTokens.$inferInsert;

/**
 * Post Analytics - stores fetched Threads post insight metrics
 */
export const postAnalytics = mysqlTable("postAnalytics", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  threadsPostId: varchar("threadsPostId", { length: 255 }).notNull(),
  postContent: text("postContent"), // Snapshot of the post text
  postPermalink: text("postPermalink"),
  postedAt: timestamp("postedAt"), // When the post was originally published
  impressions: int("impressions").default(0).notNull(),
  likes: int("likes").default(0).notNull(),
  replies: int("replies").default(0).notNull(),
  reposts: int("reposts").default(0).notNull(),
  fetchedAt: timestamp("fetchedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userIdIdx: index("post_analytics_user_id_idx").on(table.userId),
  threadsPostIdIdx: index("post_analytics_threads_post_id_idx").on(table.threadsPostId),
  userPostIdx: uniqueIndex("post_analytics_user_post_idx").on(table.userId, table.threadsPostId),
}));

export type PostAnalytics = typeof postAnalytics.$inferSelect;
export type InsertPostAnalytics = typeof postAnalytics.$inferInsert;
