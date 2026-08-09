import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, bigint, uniqueIndex, index } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).unique(),
  name: text("name"),
  // 店舗名・屋号（セミナー情報配信・本人確認のために取得。任意・後から変更可）
  storeName: varchar("storeName", { length: 255 }),
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
  // 自動投稿を「公開前承認」にする（ON: awaiting_approval で作成し、ユーザー承認後に投稿）
  autoPostRequireApproval: boolean("autoPostRequireApproval").default(false).notNull(),
  // 投稿にトピックタグ（地域名・悩みワード）を自動でつける（発見性UP）
  autoTopicTag: boolean("autoTopicTag").default(true).notNull(),
  // 追い投稿：自動投稿の約6時間後に、自分の投稿へひとこと返信して再浮上させる
  autoFollowUpEnabled: boolean("autoFollowUpEnabled").default(true).notNull(),
  // コメント即応通知：最後に新着コメントを確認した時刻（通知の重複防止）
  lastCommentCheckAt: timestamp("lastCommentCheckAt"),
  // Last auto-post type index (for rotation)
  lastAutoPostTypeIndex: int("lastAutoPostTypeIndex").default(0).notNull(),
  lastAutoPurposeIndex: int("lastAutoPurposeIndex").default(0).notNull(),
  // Referral code for referral program
  referralCode: varchar("referralCode", { length: 16 }).unique(),
  // User's credit balance (for referral rewards)
  credits: int("credits").default(0).notNull(),
  // Monitor program participant
  isMonitor: boolean("isMonitor").default(false).notNull(),
  // 適用中のキャンペーン種別（クーポンで出し分け）: 'seminar' | 'monitor' | null
  campaignTier: varchar("campaignTier", { length: 20 }),
  // ── BYOA（Bring Your Own App）: 利用者自身のMetaアプリでThreads連携する ──
  //   弊社アプリがMeta審査未承認でも、自分で作ったアプリなら自分のアカウントに
  //   対して審査なしで全権限が使える。両方セットされているときだけ有効。
  //   Secretは encryption.ts で暗号化して保存する（平文で持たない）。
  threadsAppId: varchar("threadsAppId", { length: 64 }),
  threadsAppSecretEnc: text("threadsAppSecretEnc"),
  // ── 代理店プラン: クライアントへ個別IDを発行する ──
  //   代理店が発行したクライアントアカウントには、この列に代理店のuserIdが入る。
  //   代理店本人は null。代理店が解約されると配下クライアントも利用停止になる。
  parentAgencyUserId: int("parentAgencyUserId"),
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
  // キャンペーンプランの実課金回数。規定回数(campaignCharges)に達したらアプリ側で
  // 自動解約する（Univapay側が自動停止しない場合の過剰課金防止）。
  campaignChargeCount: int("campaignChargeCount").notNull().default(0),
  // 最後に処理した課金イベントID。Webhook再送時の二重カウントを防ぐ（冪等性）。
  lastChargeEventId: varchar("lastChargeEventId", { length: 255 }),
  // ── 決済失敗フォローアップ（dunning）─────────────────────────────
  // カード決済に連続で失敗した回数。成功課金で0にリセット。メールの
  // トーン段階付け・自動停止の判定に使う。
  failedPaymentCount: int("failedPaymentCount").notNull().default(0),
  // 最初に失敗した日時（猶予期間の起点）。成功でnullに戻す。
  firstFailedPaymentAt: timestamp("firstFailedPaymentAt"),
  // 直近で失敗した日時。
  lastFailedPaymentAt: timestamp("lastFailedPaymentAt"),
  // 直近でフォロー（督促）メールを送った日時。日次cronの多重送信防止。
  lastDunningReminderAt: timestamp("lastDunningReminderAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_sub_userId").on(table.userId),
  index("idx_sub_status").on(table.status),
]);

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;

/**
 * バックグラウンドジョブの実行記録。
 * デプロイ再起動とcron時刻が重なって「その日のジョブが丸ごと飛ぶ」事故を防ぐため、
 * 各ジョブの最終実行を記録し、サーバ起動時に未実行分をキャッチアップする。
 */
export const jobRuns = mysqlTable("jobRuns", {
  jobName: varchar("jobName", { length: 100 }).primaryKey(),
  lastRunAt: timestamp("lastRunAt").notNull(),
  lastStatus: varchar("lastStatus", { length: 20 }).notNull().default("success"), // success | error
  lastError: text("lastError"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type JobRun = typeof jobRuns.$inferSelect;

/**
 * フォロワー数の日次スナップショット。
 * 「増えている実感」を見せるためのダッシュボード推移グラフ・週次レポートに使う。
 * capturedOn は JST の 'YYYY-MM-DD'。アカウント×日でユニーク（日次冪等）。
 */
export const followerSnapshots = mysqlTable("followerSnapshots", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  threadsAccountId: int("threadsAccountId").notNull().references(() => threadsAccounts.id, { onDelete: "cascade" }),
  followersCount: int("followersCount").notNull().default(0),
  capturedOn: varchar("capturedOn", { length: 10 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uniq_snapshot_account_day").on(table.threadsAccountId, table.capturedOn),
  index("idx_snapshot_user").on(table.userId),
]);

export type FollowerSnapshot = typeof followerSnapshots.$inferSelect;

/**
 * 伸びた投稿の全ユーザー横断アーカイブ。
 * プロダクト改善（プロンプト・バズ型のアップデート）の学習素材として、
 * 平均超えエンゲージメントの投稿を毎日自動で貯める。管理者のみ閲覧。
 * ユーザー退会時は cascade で削除（プライバシー配慮）。
 */
export const hitPostArchive = mysqlTable("hitPostArchive", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  threadsPostId: varchar("threadsPostId", { length: 255 }).notNull(),
  businessType: varchar("businessType", { length: 255 }),
  postContent: text("postContent"),
  impressions: int("impressions").notNull().default(0),
  likes: int("likes").notNull().default(0),
  replies: int("replies").notNull().default(0),
  reposts: int("reposts").notNull().default(0),
  engagement: int("engagement").notNull().default(0),
  postedAt: timestamp("postedAt"),
  archivedAt: timestamp("archivedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("uniq_hit_post").on(table.threadsPostId),
  index("idx_hit_business").on(table.businessType),
]);

export type HitPostArchive = typeof hitPostArchive.$inferSelect;

/**
 * 解約時アンケート。理由をワンタップで集めて改善に活かす。
 */
export const cancellationFeedback = mysqlTable("cancellationFeedback", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  planId: varchar("planId", { length: 50 }),
  reason: varchar("reason", { length: 50 }).notNull(),
  detail: text("detail"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CancellationFeedback = typeof cancellationFeedback.$inferSelect;

/**
 * ユーザーが「非表示」にした共有アイテム（初期プリセット・デザインテンプレート集）。
 * これらは全ユーザー共通の静的/管理データで削除はできないため、
 * ユーザーごとに「使わないものを隠す」ためのマッピング。
 *   itemType: 'preset'（AI生成プリセット）| 'template'（投稿テンプレート集）
 *   itemKey: そのアイテムの安定ID（preset.id / template.id）を文字列化したもの
 */
export const hiddenItems = mysqlTable("hiddenItems", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  itemType: varchar("itemType", { length: 20 }).notNull(),
  itemKey: varchar("itemKey", { length: 100 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uniq_hidden_user_item").on(table.userId, table.itemType, table.itemKey),
  index("idx_hidden_user").on(table.userId),
]);

export type HiddenItem = typeof hiddenItems.$inferSelect;

/**
 * 契約時（利用開始時）の「興味のあるコンテンツ」アンケート。
 * どんな投稿ネタに興味があるかを把握し、運営の改善・提案に活かす。
 * ユーザーごとに1回（存在＝回答済み）。
 */
export const contentInterestSurvey = mysqlTable("contentInterestSurvey", {
  userId: int("userId").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  interests: text("interests"), // カンマ区切りの選択サービス
  freeText: text("freeText"),   // 自由記述
  wantsInfo: boolean("wantsInfo").notNull().default(true), // 登録メールに案内を送ってよいか
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ContentInterestSurvey = typeof contentInterestSurvey.$inferSelect;

/**
 * 地域トレンド：その地域で反応の高い（Threads人気順=TOP）投稿の参考ストック。
 * これを素材に「丸写しではない、似た切り口の地域ネタ投稿」を生成する。
 *   source: 'collected'（キーワード検索APIで自動収集）| 'manual'（クライアントが手動登録）
 * ※他人の投稿の正確な閲覧数はAPIで取得できないため、Threadsの人気順(TOP)を指標にする。
 */
export const regionalRefPosts = mysqlTable("regionalRefPosts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  projectId: varchar("projectId", { length: 50 }).notNull().references(() => projects.id, { onDelete: "cascade" }),
  source: varchar("source", { length: 20 }).notNull().default("collected"),
  area: varchar("area", { length: 255 }),
  keyword: varchar("keyword", { length: 255 }), // 収集に使ったキーワード
  authorUsername: varchar("authorUsername", { length: 255 }),
  text: text("text"),
  permalink: text("permalink"),
  postedAt: timestamp("postedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_regional_project").on(table.projectId),
]);

export type RegionalRefPost = typeof regionalRefPosts.$inferSelect;

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
  // どの店舗(プロジェクト)の内容を自動投稿するか。複数店舗運用時に
  // 「店舗Aのアカウントに店舗Bの内容」を防ぐための紐付け。
  // null の場合は全プロジェクトを日替わりローテーション（従来挙動）。
  defaultProjectId: varchar("defaultProjectId", { length: 50 }).references(() => projects.id, { onDelete: "set null" }),
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
  storeName: varchar("storeName", { length: 100 }), // 店名（一度登録すれば毎回再入力不要）
  businessType: varchar("businessType", { length: 100 }), // 業種
  area: varchar("area", { length: 100 }), // 地域（市区町村レベル）
  // 地元の人に伝わる呼び方（最寄り駅・通称/町名・ランドマーク等）を改行区切りで保持。
  // AIが投稿ごとに使い分け、ローカル集客の精度を上げる。事実のみ（AI提案→本人確認で確定）。
  localTerms: text("localTerms"),
  target: text("target"), // ターゲット
  mainProblem: text("mainProblem"), // 主な悩み
  strength: text("strength"), // 強み/特徴
  proof: text("proof"), // 実績/証拠
  ctaLink: text("ctaLink"), // 誘導先URL（後方互換用 — 新規はlinksを使う）
  // 複数のURL（LINE/Web予約/HP/Instagram等）をJSON配列で保持。
  // フォーマット: [{ id, type, label, url, isDefault }]
  // type: 'line' | 'reservation' | 'website' | 'instagram' | 'youtube' | 'other'
  links: text("links"),
  usp: text("usp"), // USP（第13回：独自の強み）
  n1Customer: text("n1Customer"), // N1分析：実在の1人の顧客像（第11回）
  belief: text("belief"), // 主張・信念（業界常識への自分の立場。一度登録すれば毎回利用）
  catchphrase: text("catchphrase"), // 口癖・方言・決めゼリフ（キャラ付け。一度登録すれば毎回利用）
  customerWords: text("customerWords"), // お客さんが実際に使った言葉ストック（最優先で投稿に使う）
  // 過去の良かった/バズった投稿（お手本）。文体（口調・絵文字・改行・1文の長さ）の模倣に使う。
  styleSamples: text("styleSamples"),
  // AIカウンセリング結果（JSON）。事実ベース投稿のためにユーザから取得した
  // 「使ってよい実績」「実在の顧客エピソード」「絶対に書きたくないこと」など。
  // null の場合は未カウンセリング状態。フォーマット: shared/counseling.ts CounselingResult。
  counselingResult: text("counselingResult"),
  // Threadsマーケティング技法（強い1行目・心理トリガー等）をAI生成で使うか。
  // true: 既存のフルプロンプト  / false: 自然・事実ベース寄りのライト版プロンプト
  // null/未設定時はtrue扱い（既存挙動）
  useThreadsKnowhow: boolean("useThreadsKnowhow").default(true),
  // スタイル校正結果（サンプル投稿選択結果）。JSON。
  // shared/styleSamples.ts StylePreferenceProfile 形式。
  // null=未校正（AI生成は既存挙動）
  stylePreference: text("stylePreference"),
  // 投稿に入れたくないワード（NGワード）。改行/カンマ/読点区切りのテキストで保持。
  // 生成プロンプトで禁止し、生成後に shared/ngwords.ts で機械的に除去して必ず含めないようにする。
  ngWords: text("ngWords"),
  // LINE問い合わせ計測（Keiro連携）。投稿別の合言葉ヒット数を集計するための
  // Keiro側 inquiry-hits エンドポイントURLとAPIキー。null=連携なし（計測セクション非表示）。
  keiroHitsUrl: text("keiroHitsUrl"),
  keiroHitsKey: text("keiroHitsKey"),
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
  status: mysqlEnum("status", ["pending", "processing", "posted", "failed", "canceled", "awaiting_approval"]).default("pending").notNull(),
  // 投稿の生成元：manual=ユーザーが手動で予約 / auto=自動投稿エンジンが生成。
  // 「予約中」が手動か自動か区別がつかない混乱を解消するため。
  source: mysqlEnum("source", ["manual", "auto"]).default("manual").notNull(),
  // 追い投稿：この値があるときは新規投稿ではなく、このThreads投稿IDへの
  // 「返信」として公開する（自分の投稿へのひとこと追加＝再浮上ブースト）。
  replyToThreadsId: varchar("replyToThreadsId", { length: 255 }),
  postedAt: timestamp("postedAt"),
  errorMessage: text("errorMessage"),
  // Store the post content snapshot at scheduling time
  postContent: text("postContent"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_sp_status_scheduledAt").on(table.status, table.scheduledAt),
  index("idx_sp_userId").on(table.userId),
]);

export type ScheduledPost = typeof scheduledPosts.$inferSelect;
export type InsertScheduledPost = typeof scheduledPosts.$inferInsert;

/**
 * Coupons - promotional codes for discounts and trials
 */
export const coupons = mysqlTable("coupons", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  type: mysqlEnum("type", ["forever_free", "trial_30", "trial_14", "discount_50", "discount_30", "special_price", "monitor", "monitor_only"]).notNull(),
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

/**
 * Monitor Feedback - stores feedback from monitor program participants
 */
export const monitorFeedback = mysqlTable("monitorFeedback", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  // Which page/feature the feedback is about
  page: varchar("page", { length: 100 }).notNull(),
  // Feedback category
  category: mysqlEnum("category", ["bug", "usability", "feature_request", "other"]).default("other").notNull(),
  // The feedback content
  content: text("content").notNull(),
  // Screenshot URL (optional)
  screenshotUrl: text("screenshotUrl"),
  // Admin response
  adminNote: text("adminNote"),
  // Status
  status: mysqlEnum("status", ["new", "in_progress", "resolved", "wont_fix"]).default("new").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userIdIdx: index("monitor_feedback_user_id_idx").on(table.userId),
  statusIdx: index("monitor_feedback_status_idx").on(table.status),
}));

export type MonitorFeedback = typeof monitorFeedback.$inferSelect;
export type InsertMonitorFeedback = typeof monitorFeedback.$inferInsert;
