import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { ENV } from "./_core/env";
import bcrypt from "bcryptjs";
import * as stripeService from "./stripe";
import * as couponService from "./coupon";
import { PLANS, TRIAL_DAYS, getPlan } from "../shared/plans";
import { TRPCError } from "@trpc/server";

// Global rate limit store for tryGenerate
declare global {
  var __tryGenerateRateLimit: Map<string, number[]> | undefined;
}

export const appRouter = router({
  system: systemRouter,
  
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),

    // Email + Password Registration
    register: publicProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string().min(8),
        name: z.string().min(1, '名前を入力してください'),
        couponCode: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { hashPassword, isValidEmail, isValidPassword } = await import('./auth-helpers');
        
        // Validate email
        if (!isValidEmail(input.email)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: '無効なメールアドレスです。' });
        }

        // Validate password
        if (!isValidPassword(input.password)) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'パスワードは8文字以上で、数字または記号を1つ以上含む必要があります。' 
          });
        }

        // Check if user already exists
        const existingUser = await db.getUserByEmail(input.email);
        if (existingUser) {
          throw new TRPCError({ code: 'CONFLICT', message: 'このメールアドレスは既に登録されています。' });
        }

        // Hash password
        const passwordHash = await hashPassword(input.password);

        // Create user
        const user = await db.createEmailUser(input.email, passwordHash, input.name);
        if (!user) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'ユーザーの作成に失敗しました。' });
        }

        // Generate email verification token
        const { generateToken } = await import('./auth-helpers');
        const verificationToken = generateToken(32);
        await db.updateEmailVerificationToken(user.id, verificationToken);

        // Send verification email (using Manus notification)
        const { notifyOwner } = await import('./_core/notification');
        const verificationUrl = `${process.env.VITE_APP_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}`;
        await notifyOwner({
          title: 'メール認証リクエスト',
          content: `新規ユーザー: ${user.email}\n\n認証URL: ${verificationUrl}`,
        });

        // Apply coupon code if provided
        if (input.couponCode && input.couponCode.trim()) {
          try {
            await couponService.applyCoupon(user.id, input.couponCode.trim());
          } catch (e) {
            // Don't fail registration if coupon fails - user can apply later
            console.warn(`[Register] Coupon application failed for user ${user.id}:`, e);
          }
        }

        return { success: true, userId: user.id };
      }),

    // Email + Password Login
    login: publicProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { verifyPassword } = await import('./auth-helpers');
        
        // Get user by email
        const user = await db.getUserByEmail(input.email);
        if (!user) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'メールアドレスまたはパスワードが正しくありません。' });
        }

        // Check if user is email auth provider
        if (user.authProvider !== 'email') {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'このアカウントは別の方法で登録されています。' 
          });
        }

        // Verify password
        if (!user.passwordHash) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'パスワードが設定されていません。' });
        }

        const isValid = await verifyPassword(input.password, user.passwordHash);
        if (!isValid) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'メールアドレスまたはパスワードが正しくありません。' });
        }

        // Update last signed in
        if (!user.openId) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'ユーザーIDが設定されていません。' });
        }
        await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });

        // Create session using SDK
        const { sdk } = await import('./_core/sdk');
        const token = await sdk.createSessionToken(user.openId, { name: user.name ?? '' });
        
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, cookieOptions);

        return { success: true, user: { id: user.id, email: user.email, name: user.name } };
      }),

    // Request Password Reset
    requestPasswordReset: publicProcedure
      .input(z.object({
        email: z.string().email(),
      }))
      .mutation(async ({ input }) => {
        const { generateToken } = await import('./auth-helpers');
        
        // Get user by email
        const user = await db.getUserByEmail(input.email);
        if (!user) {
          // Don't reveal if email exists - return same shape but no token
          return { success: true, resetToken: null };
        }

        // Check if user is email auth provider
        if (user.authProvider !== 'email') {
          // Don't reveal if email exists
          return { success: true, resetToken: null };
        }

        // Generate reset token
        const token = generateToken(32);
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        // Delete old tokens
        await db.deletePasswordResetTokensByUserId(user.id);

        // Create new token
        await db.createPasswordResetToken(user.id, token, expiresAt);

        // Return the token directly so the frontend can show the reset link
        return { success: true, resetToken: token };
      }),

    // Reset Password
    resetPassword: publicProcedure
      .input(z.object({
        token: z.string(),
        newPassword: z.string().min(8),
      }))
      .mutation(async ({ input }) => {
        const { hashPassword, isValidPassword } = await import('./auth-helpers');
        
        // Validate password
        if (!isValidPassword(input.newPassword)) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'パスワードは8文字以上で、数字または記号を1つ以上含む必要があります。' 
          });
        }

        // Get token
        const resetToken = await db.getPasswordResetToken(input.token);
        if (!resetToken) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: '無効なリセットトークンです。' });
        }

        // Check expiration
        if (new Date() > resetToken.expiresAt) {
          await db.deletePasswordResetToken(resetToken.id);
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'リセットトークンの有効期限が切れています。' });
        }

        // Hash new password
        const passwordHash = await hashPassword(input.newPassword);

        // Update user password
        const user = await db.getUserById(resetToken.userId);
        if (!user || !user.openId) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'ユーザーが見つかりません。' });
        }

        await db.upsertUser({ openId: user.openId, passwordHash });

        // Delete token
        await db.deletePasswordResetToken(resetToken.id);

        return { success: true };
      }),

    // Verify Email
    verifyEmail: publicProcedure
      .input(z.object({
        token: z.string(),
      }))
      .mutation(async ({ input }) => {
        // Get user by token
        const user = await db.getUserByEmailVerificationToken(input.token);
        if (!user) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: '無効な認証トークンです。' });
        }

        // Update email verification status
        await db.updateEmailVerificationStatus(user.id, true);

        return { success: true };
      }),
  }),

  // ============ Subscription Management ============
  subscription: router({
    // Get current user's subscription status
    getStatus: protectedProcedure.query(async ({ ctx }) => {
      const subscription = await db.getSubscriptionByUserId(ctx.user.id);
      
      if (!subscription) {
        // No subscription - return free plan status
        return {
          planId: 'free',
          plan: PLANS.free,
          status: 'active' as const,
          isTrialing: false,
          trialEndsAt: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
        };
      }

      const plan = getPlan(subscription.planId);
      
      return {
        planId: subscription.planId,
        plan: plan || PLANS.free,
        status: subscription.status,
        isTrialing: subscription.status === 'trialing',
        trialEndsAt: subscription.trialEndsAt,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      };
    }),

    // Get all available plans
    getPlans: publicProcedure.query(() => {
      return Object.values(PLANS);
    }),

    // Get AI generation usage for current month
    getAiUsage: protectedProcedure.query(async ({ ctx }) => {
      return await db.getAiGenerationUsage(ctx.user.id);
    }),

    // Create checkout session for subscription
    createCheckout: protectedProcedure
      .input(z.object({ planId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const plan = getPlan(input.planId);
        if (!plan) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid plan' });
        }

        if (plan.priceMonthly === 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot checkout free plan' });
        }

        // UnivaPayリンクが設定されている場合はそちらを優先
        if (plan.univapayLinkUrl) {
          return { url: plan.univapayLinkUrl };
        }

        const origin = ctx.req.headers.origin || 'http://localhost:3000';
        const checkoutUrl = await stripeService.createCheckoutSession(
          ctx.user.id,
          ctx.user.email || '',
          ctx.user.name || null,
          input.planId,
          origin
        );

        return { url: checkoutUrl };
      }),

    // Create billing portal session
    createPortalSession: protectedProcedure.mutation(async ({ ctx }) => {
      const user = await db.getUserById(ctx.user.id);
      if (!user?.stripeCustomerId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No billing account found' });
      }

      const origin = ctx.req.headers.origin || 'http://localhost:3000';
      const portalUrl = await stripeService.createBillingPortalSession(
        user.stripeCustomerId,
        `${origin}/dashboard`
      );

      return { url: portalUrl };
    }),

    // Cancel subscription
    cancel: protectedProcedure.mutation(async ({ ctx }) => {
      const subscription = await db.getSubscriptionByUserId(ctx.user.id);
      if (!subscription?.stripeSubscriptionId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No active subscription' });
      }

      await stripeService.cancelSubscription(subscription.stripeSubscriptionId);
      await db.updateSubscription(subscription.id, { cancelAtPeriodEnd: true });

      return { success: true };
    }),

    // Resume canceled subscription
    resume: protectedProcedure.mutation(async ({ ctx }) => {
      const subscription = await db.getSubscriptionByUserId(ctx.user.id);
      if (!subscription?.stripeSubscriptionId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No subscription to resume' });
      }

      await stripeService.resumeSubscription(subscription.stripeSubscriptionId);
      await db.updateSubscription(subscription.id, { cancelAtPeriodEnd: false });

      return { success: true };
    }),

    // Get invoices
    getInvoices: protectedProcedure.query(async ({ ctx }) => {
      const user = await db.getUserById(ctx.user.id);
      if (!user?.stripeCustomerId) {
        return [];
      }

      const invoices = await stripeService.getInvoices(user.stripeCustomerId);
      return invoices.map(inv => ({
        id: inv.id,
        amount: inv.amount_paid,
        currency: inv.currency,
        status: inv.status,
        created: inv.created,
        invoiceUrl: inv.hosted_invoice_url,
        pdfUrl: inv.invoice_pdf,
      }));
    }),

    // Preview plan change (calculate proration)
    previewPlanChange: protectedProcedure
      .input(z.object({ newPlanId: z.string() }))
      .query(async ({ ctx, input }) => {
        const subscription = await db.getSubscriptionByUserId(ctx.user.id);
        const currentPlanId = subscription?.planId || 'free';
        
        if (currentPlanId === 'free') {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: '無料プランからの変更は新規購入として行ってください。' 
          });
        }

        if (!subscription?.stripeSubscriptionId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'No active subscription' });
        }

        if (currentPlanId === input.newPlanId) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: '現在と同じプランには変更できません。' 
          });
        }

        const proration = await stripeService.calculatePlanChangeProration(
          subscription.stripeSubscriptionId,
          input.newPlanId
        );

        const currentPlan = getPlan(currentPlanId);
        const newPlan = getPlan(input.newPlanId);

        return {
          ...proration,
          currentPlan,
          newPlan,
        };
      }),


  }),

  // ============ Project Management ============
  project: router({
    // List user's projects
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getProjectsByUserId(ctx.user.id);
    }),

    // Get single project
    get: protectedProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.id);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
        }
        return project;
      }),

    // Create project
    create: protectedProcedure
      .input(z.object({
        id: z.string(),
        title: z.string(),
        templateId: z.string().optional(),
        inputs: z.string().optional(),
        posts: z.string().optional(),
        tags: z.string().optional(),
        // 店舗情報フィールド
        businessType: z.string().optional(),
        area: z.string().optional(),
        target: z.string().optional(),
        mainProblem: z.string().optional(),
        strength: z.string().optional(),
        proof: z.string().optional(),
        ctaLink: z.string().optional(),
        usp: z.string().optional(),
        n1Customer: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check project limit
        const subscription = await db.getSubscriptionByUserId(ctx.user.id);
        const planId = subscription?.planId || 'free';
        const plan = getPlan(planId);
        
        if (plan && plan.features.maxProjects !== -1) {
          const projectCount = await db.countUserProjects(ctx.user.id);
          if (projectCount >= plan.features.maxProjects) {
            throw new TRPCError({ 
              code: 'FORBIDDEN', 
              message: `プロジェクト数の上限（${plan.features.maxProjects}件）に達しています。プランをアップグレードしてください。` 
            });
          }
        }

        await db.createProject({
          ...input,
          userId: ctx.user.id,
        });

        return { success: true };
      }),

    // Update project
    update: protectedProcedure
      .input(z.object({
        id: z.string(),
        title: z.string().optional(),
        inputs: z.string().optional(),
        posts: z.string().optional(),
        tags: z.string().optional(),
        // 店舗情報フィールド
        businessType: z.string().optional(),
        area: z.string().optional(),
        target: z.string().optional(),
        mainProblem: z.string().optional(),
        strength: z.string().optional(),
        proof: z.string().optional(),
        ctaLink: z.string().optional(),
        usp: z.string().optional(),
        n1Customer: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.id);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
        }

        const { id, ...updateData } = input;
        await db.updateProject(id, updateData);

        return { success: true };
      }),

    // Delete project
    delete: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.id);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
        }

        await db.deleteProject(input.id);
        return { success: true };
      }),

    // Get project count
    count: protectedProcedure.query(async ({ ctx }) => {
      return await db.countUserProjects(ctx.user.id);
    }),

    // Generate AI post
    generatePost: protectedProcedure
      .input(z.object({
        projectId: z.string(),
        postType: z.enum(['hook_tree', 'expertise', 'local', 'proof', 'empathy', 'story', 'list', 'offer', 'enemy', 'qa', 'trend', 'aruaru']).optional(),
        treeCount: z.number().min(0).max(5).optional(), // 0 = 本文のみ, 1〜5 = ツリー投稿数
        trendWord: z.string().optional(), // トレンドワード（trend型で使用）
        purpose: z.enum(['cv', 'awareness', 'authority', 'fan']).optional(), // 投稿の目的
      }))
      .mutation(async ({ ctx, input }) => {
        // Check AI generation feature
        const subscription = await db.getSubscriptionByUserId(ctx.user.id);
        const planId = subscription?.planId || 'free';
        const plan = getPlan(planId);
        
        // デモモードではAI生成を許可
        if (!ctx.user.isDemoMode && (!plan || plan.features.maxAiGenerations === 0)) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'AI文章生成機能は有料プランでのみ利用可能です。'
          });
        }

        // Check AI generation limit (skip for demo mode)
        const canGenerate = ctx.user.isDemoMode || await db.checkAiGenerationLimit(ctx.user.id);
        if (!canGenerate) {
          const { count, limit } = await db.getAiGenerationUsage(ctx.user.id);
          throw new TRPCError({ 
            code: 'FORBIDDEN', 
            message: `今月のAI生成回数の上限（${limit}回）に達しました。プロプラン以上にアップグレードすると無制限でご利用いただけます。` 
          });
        }

        // Get project
        const project = await db.getProjectById(input.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
        }

        // Check required fields
        if (!project.businessType || !project.area || !project.target || !project.mainProblem || !project.strength) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'プロジェクトの業種、地域、ターゲット、主な悩み、強みを設定してください。' 
          });
        }

        // Generate prompt
        const { generateThreadsPrompt } = await import('../shared/threadsPrompts');
        const prompt = generateThreadsPrompt({
          businessType: project.businessType,
          area: project.area,
          target: project.target,
          mainProblem: project.mainProblem,
          strength: project.strength,
          proof: project.proof || undefined,
          link: project.ctaLink || undefined,
          postType: input.postType,
          treeCount: input.treeCount,
          usp: (project as any).usp || undefined,
          n1Customer: (project as any).n1Customer || undefined,
          trendWord: input.trendWord || undefined,
          purpose: input.purpose,
        });

        // Call LLM
        const { invokeLLM } = await import('./_core/llm');
        const response = await invokeLLM({
          messages: [
            { role: 'user', content: prompt },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'threads_post',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: '投稿タイトル' },
                  mainPost: { type: 'string', description: 'メイン投稿' },
                  treePosts: { 
                    type: 'array', 
                    items: { type: 'string' },
                    description: 'ツリー投稿配列'
                  },
                  cta: { type: 'string', description: 'CTA' },
                  hashtags: { 
                    type: 'array', 
                    items: { type: 'string' },
                    description: 'ハッシュタグ配列'
                  },
                  goal: { type: 'string', description: '投稿の狙い' },
                  improvement: { type: 'string', description: '次回改善案' },
                  expectedEffect: { type: 'string', description: '投稿の期待効果' },
                  timingCandidate: { type: 'string', description: '投稿設置タイミング候補' },
                  weeklyImprovementPoint: { type: 'string', description: '週次改善ポイント' },
                  hookType: { type: 'string', description: '使用した1行目の型（①〜⑤のどれか）' },
                  cvGoal: { type: 'string', description: 'CVゴール（LINE登録 or 予約 のどちらか1つ）' },
                },
                required: ['title', 'mainPost', 'treePosts', 'cta', 'hashtags', 'goal', 'improvement', 'expectedEffect', 'timingCandidate', 'weeklyImprovementPoint', 'hookType', 'cvGoal'],
                additionalProperties: false,
              },
            },
          },
        });

        const content = response.choices[0].message.content;
        if (!content || typeof content !== 'string') {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'AI応答が空です。' });
        }

        const result = JSON.parse(content);

        // Increment AI generation usage count
        await db.incrementAiGenerationUsage(ctx.user.id);

        // Save to AI generation history
        await db.saveAiGenerationHistory({
          userId: ctx.user.id,
          projectId: input.projectId,
          postType: input.postType || 'hook_tree',
          content: JSON.stringify(result),
          metadata: JSON.stringify({
            businessType: project.businessType,
            area: project.area,
            target: project.target,
            mainProblem: project.mainProblem,
            strength: project.strength,
            proof: project.proof,
            ctaLink: project.ctaLink,
          }),
        });

        return result;
      }),

    // Get AI generation history
    getAiHistory: protectedProcedure
      .input(z.object({
        limit: z.number().optional().default(50),
        offset: z.number().optional().default(0),
      }))
      .query(async ({ ctx, input }) => {
        const history = await db.getAiGenerationHistory(ctx.user.id, input.limit, input.offset);
        const total = await db.countAiGenerationHistory(ctx.user.id);
        return { history, total };
      }),

    // Get AI generation history by ID
    getAiHistoryById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const history = await db.getAiGenerationHistoryById(input.id, ctx.user.id);
        if (!history) {
          throw new TRPCError({ code: 'NOT_FOUND', message: '履歴が見つかりません。' });
        }
        return history;
      }),

    // Delete AI generation history
    deleteAiHistory: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const success = await db.deleteAiGenerationHistory(input.id, ctx.user.id);
        if (!success) {
          throw new TRPCError({ code: 'NOT_FOUND', message: '履歴が見つかりません。' });
        }
        return { success: true };
      }),

    // Clone hit post - generate variations of a high-performing post
    cloneHitPost: protectedProcedure
      .input(z.object({
        historyId: z.number(),
        count: z.number().min(1).max(10).default(5),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check AI generation feature (same as generatePost)
        const subscription = await db.getSubscriptionByUserId(ctx.user.id);
        const planId = subscription?.planId || 'free';
        const plan = getPlan(planId);

        if (!ctx.user.isDemoMode && (!plan || plan.features.maxAiGenerations === 0)) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'AI文章生成機能は有料プランでのみ利用可能です。'
          });
        }

        // Check AI generation limit
        const canGenerate = ctx.user.isDemoMode || await db.checkAiGenerationLimit(ctx.user.id);
        if (!canGenerate) {
          const { count, limit } = await db.getAiGenerationUsage(ctx.user.id);
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: `今月のAI生成回数の上限（${limit}回）に達しました。プロプラン以上にアップグレードすると無制限でご利用いただけます。`
          });
        }

        // Get original history entry
        const history = await db.getAiGenerationHistoryById(input.historyId, ctx.user.id);
        if (!history) {
          throw new TRPCError({ code: 'NOT_FOUND', message: '履歴が見つかりません。' });
        }

        const originalContent = JSON.parse(history.content);
        let metadata: any = {};
        if (history.metadata) {
          try { metadata = JSON.parse(history.metadata); } catch (e) {}
        }

        // Build clone prompt
        const clonePrompt = `以下の投稿が高いエンゲージメントを獲得しました。同じ構成・トーン・長さで、内容を変えた${input.count}本のバリエーションを生成してください。

【元の投稿】
タイトル: ${originalContent.title}
メイン投稿: ${originalContent.mainPost}
ツリー投稿: ${originalContent.treePosts?.join('\n') || ''}
CTA: ${originalContent.cta}
ハッシュタグ: ${originalContent.hashtags?.join(' ') || ''}

【投稿タイプ】${history.postType}

【店舗情報】
業種: ${metadata.businessType || '不明'}
地域: ${metadata.area || '不明'}
ターゲット: ${metadata.target || '不明'}
主な悩み: ${metadata.mainProblem || '不明'}
強み: ${metadata.strength || '不明'}

元の投稿の構成（段落構成、トーン、長さ、絵文字の使い方）を維持しつつ、具体的な内容・エピソード・表現を変えて${input.count}本のバリエーションを生成してください。各バリエーションは独立した投稿として使えるようにしてください。`;

        // Call LLM
        const { invokeLLM } = await import('./_core/llm');
        const response = await invokeLLM({
          messages: [
            { role: 'user', content: clonePrompt },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'cloned_posts',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  variations: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        title: { type: 'string', description: '投稿タイトル' },
                        mainPost: { type: 'string', description: 'メイン投稿' },
                        treePosts: {
                          type: 'array',
                          items: { type: 'string' },
                          description: 'ツリー投稿配列'
                        },
                        cta: { type: 'string', description: 'CTA' },
                        hashtags: {
                          type: 'array',
                          items: { type: 'string' },
                          description: 'ハッシュタグ配列'
                        },
                      },
                      required: ['title', 'mainPost', 'treePosts', 'cta', 'hashtags'],
                      additionalProperties: false,
                    },
                    description: '生成されたバリエーション配列'
                  },
                },
                required: ['variations'],
                additionalProperties: false,
              },
            },
          },
        });

        const content = response.choices[0].message.content;
        if (!content || typeof content !== 'string') {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'AI応答が空です。' });
        }

        const result = JSON.parse(content);

        // Increment AI generation usage count
        await db.incrementAiGenerationUsage(ctx.user.id);

        return { variations: result.variations, originalTitle: originalContent.title };
      }),

    // Regenerate from history
    regenerateFromHistory: protectedProcedure
      .input(z.object({ historyId: z.number() }))
      .query(async ({ ctx, input }) => {
        const history = await db.getAiGenerationHistoryById(input.historyId, ctx.user.id);
        if (!history) {
          throw new TRPCError({ code: 'NOT_FOUND', message: '履歴が見つかりません。' });
        }

        // Parse metadata to get generation parameters
        let metadata: any = {};
        if (history.metadata) {
          try {
            metadata = JSON.parse(history.metadata);
          } catch (e) {
            console.error('Failed to parse metadata:', e);
          }
        }

        return {
          projectId: history.projectId,
          postType: history.postType,
          metadata,
        };
      }),

    // Public "try before register" generation (rate limited by IP)
    tryGenerate: publicProcedure
      .input(z.object({
        businessType: z.string().min(1),
        area: z.string().min(1),
        target: z.string().min(1),
        mainProblem: z.string().min(1),
        strength: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        // Rate limit by IP: max 3 per hour
        const ip = ctx.req.ip || ctx.req.headers['x-forwarded-for'] || 'unknown';
        const ipStr = Array.isArray(ip) ? ip[0] : ip;
        const now = Date.now();
        const windowMs = 60 * 60 * 1000; // 1 hour

        // Simple in-memory rate limiter
        if (!globalThis.__tryGenerateRateLimit) {
          globalThis.__tryGenerateRateLimit = new Map<string, number[]>();
        }
        const rateMap = globalThis.__tryGenerateRateLimit as Map<string, number[]>;
        const timestamps = rateMap.get(ipStr) || [];
        const recentTimestamps = timestamps.filter(t => now - t < windowMs);

        if (recentTimestamps.length >= 3) {
          throw new TRPCError({
            code: 'TOO_MANY_REQUESTS',
            message: 'お試し生成は1時間に3回までです。続けてご利用いただくには無料登録してください。',
          });
        }

        recentTimestamps.push(now);
        rateMap.set(ipStr, recentTimestamps);

        // Generate prompt (mainPost only, no tree posts)
        const { generateThreadsPrompt } = await import('../shared/threadsPrompts');
        const prompt = generateThreadsPrompt({
          businessType: input.businessType,
          area: input.area,
          target: input.target,
          mainProblem: input.mainProblem,
          strength: input.strength,
          treeCount: 0, // main post only
        });

        // Call LLM
        const { invokeLLM } = await import('./_core/llm');
        const response = await invokeLLM({
          messages: [
            { role: 'user', content: prompt },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'threads_post',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: '投稿タイトル' },
                  mainPost: { type: 'string', description: 'メイン投稿' },
                  treePosts: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'ツリー投稿配列'
                  },
                  cta: { type: 'string', description: 'CTA' },
                  hashtags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'ハッシュタグ配列'
                  },
                  goal: { type: 'string', description: '投稿の狙い' },
                  improvement: { type: 'string', description: '次回改善案' },
                  expectedEffect: { type: 'string', description: '投稿の期待効果' },
                  timingCandidate: { type: 'string', description: '投稿設置タイミング候補' },
                  weeklyImprovementPoint: { type: 'string', description: '週次改善ポイント' },
                  hookType: { type: 'string', description: '使用した1行目の型（①〜⑤のどれか）' },
                  cvGoal: { type: 'string', description: 'CVゴール（LINE登録 or 予約 のどちらか1つ）' },
                },
                required: ['title', 'mainPost', 'treePosts', 'cta', 'hashtags', 'goal', 'improvement', 'expectedEffect', 'timingCandidate', 'weeklyImprovementPoint', 'hookType', 'cvGoal'],
                additionalProperties: false,
              },
            },
          },
        });

        const content = response.choices[0].message.content;
        if (!content || typeof content !== 'string') {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'AI応答が空です。' });
        }

        const result = JSON.parse(content);

        // Return only the main post and metadata (no saving to DB)
        return {
          title: result.title,
          mainPost: result.mainPost,
          cta: result.cta,
          hashtags: result.hashtags,
          goal: result.goal,
          expectedEffect: result.expectedEffect,
        };
      }),
  }),

  // ============ Threads Account Management ============
  threads: router({
    // List connected accounts
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getThreadsAccountsByUserId(ctx.user.id);
    }),

    // Get OAuth authorization URL
    getAuthUrl: protectedProcedure.query(async ({ ctx }) => {
      const { getThreadsAuthUrl } = await import("./threadsAuth");
      // Use THREADS_REDIRECT_BASE_URL if set (must match Meta Developer Portal callback URL)
      // Otherwise fall back to origin header for dynamic detection
      const origin = ENV.threadsRedirectBaseUrl
        || ctx.req.headers.origin 
        || `${ctx.req.headers['x-forwarded-proto'] || ctx.req.protocol}://${ctx.req.headers['x-forwarded-host'] || ctx.req.get('host')}`;
      // Use frontend route /threads-connect directly as redirect_uri
      // This avoids dependency on /api/threads/callback server route which may not work in production
      const redirectUri = `${origin}/threads-connect`;
      console.log('[Threads OAuth] Generated redirect_uri:', redirectUri);
      return { authUrl: getThreadsAuthUrl({ redirectUri }) };
    }),

    // Handle OAuth callback
    handleCallback: protectedProcedure
      .input(z.object({
        code: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { exchangeCodeForToken, exchangeForLongLivedToken, getThreadsProfile } = await import("./threadsAuth");
        
        // Exchange code for short-lived token first to get profile info
        // Use THREADS_REDIRECT_BASE_URL if set (must match Meta Developer Portal callback URL)
        // redirect_uri must match exactly what was used in the authorization request
        const origin = ENV.threadsRedirectBaseUrl
          || ctx.req.headers.origin 
          || `${ctx.req.headers['x-forwarded-proto'] || ctx.req.protocol}://${ctx.req.headers['x-forwarded-host'] || ctx.req.get('host')}`;
        const redirectUri = `${origin}/threads-connect`;
        console.log('[Threads OAuth] Token exchange redirect_uri:', redirectUri);
        const shortLivedToken = await exchangeCodeForToken(input.code, redirectUri);
        
        // Exchange for long-lived token (60 days)
        const longLivedToken = await exchangeForLongLivedToken(shortLivedToken.access_token);
        
        // Get user profile
        const profile = await getThreadsProfile(longLivedToken.access_token);
        
        // Check if this is a re-connection of an existing account
        const existingAccounts = await db.getThreadsAccountsByUserId(ctx.user.id);
        const isReconnection = existingAccounts.some(a => a.threadsUserId === profile.id);
        
        // Also check inactive accounts for re-activation
        const allAccounts = await db.getAllThreadsAccountsByUserId(ctx.user.id);
        const isReactivation = !isReconnection && allAccounts.some(a => a.threadsUserId === profile.id);
        
        // Check account limit only for truly new accounts (not re-connections or re-activations)
        if (!isReconnection && !isReactivation) {
          const subscription = await db.getSubscriptionByUserId(ctx.user.id);
          const planId = subscription?.planId || 'free';
          const plan = getPlan(planId);
          
          if (plan && plan.features.maxThreadsAccounts !== -1) {
            if (existingAccounts.length >= plan.features.maxThreadsAccounts) {
              throw new TRPCError({ 
                code: 'FORBIDDEN', 
                message: `Threadsアカウント連携数の上限（${plan.features.maxThreadsAccounts}件）に達しています。` 
              });
            }
          }
        }
        
        // Calculate expiration date
        const expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + longLivedToken.expires_in);

        // Save to database (upsert - creates new or updates existing)
        await db.createThreadsAccount({
          userId: ctx.user.id,
          threadsUserId: profile.id,
          threadsUsername: profile.username,
          profilePictureUrl: profile.threads_profile_picture_url,
          biography: profile.threads_biography,
          accessToken: longLivedToken.access_token,
          tokenExpiresAt: expiresAt,
        });

        return { success: true, profile, isReconnection: isReconnection || isReactivation };
      }),

    // Disconnect account
    disconnect: protectedProcedure
      .input(z.object({ accountId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const account = await db.getThreadsAccountById(input.accountId);
        if (!account || account.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Account not found' });
        }

        await db.deleteThreadsAccount(input.accountId);
        return { success: true };
      }),

    // Post to Threads
    post: protectedProcedure
      .input(z.object({
        accountId: z.number(),
        text: z.string(),
        mediaType: z.enum(["TEXT", "IMAGE", "VIDEO", "CAROUSEL"]).optional(),
        imageUrl: z.string().optional(),
        videoUrl: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { createAndPublishPost } = await import("./threadsPost");
        
        // Check monthly post limit
        const subscription = await db.getSubscriptionByUserId(ctx.user.id);
        const planId = subscription?.planId || 'free';
        const plan = getPlan(planId);
        
        if (plan && plan.features.maxScheduledPosts !== -1) {
          const monthlyCount = await db.countUserMonthlyPosts(ctx.user.id);
          if (monthlyCount >= plan.features.maxScheduledPosts) {
            throw new TRPCError({ 
              code: 'FORBIDDEN', 
              message: `月間投稿数の上限（${plan.features.maxScheduledPosts}件）に達しています。来月1日にリセットされます。` 
            });
          }
        }
        
        const account = await db.getThreadsAccountById(input.accountId);
        if (!account || account.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Account not found' });
        }

        // Check if token is still valid
        if (account.tokenExpiresAt && new Date(account.tokenExpiresAt) < new Date()) {
          throw new TRPCError({ 
            code: 'UNAUTHORIZED', 
            message: 'アクセストークンの有効期限が切れています。再度連携してください。' 
          });
        }

        try {
          // Post to Threads
          const result = await createAndPublishPost({
            accessToken: account.accessToken,
            threadsUserId: account.threadsUserId,
            text: input.text,
            mediaType: input.mediaType,
            imageUrl: input.imageUrl,
            videoUrl: input.videoUrl,
          });

          return { 
            success: true, 
            postId: result.id,
            message: 'Threadsに投稿しました'
          };
        } catch (error) {
          console.error('[Threads Post Error]', error);
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR', 
            message: `投稿に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}` 
          });
        }
      }),

    // Check publishing rate limit
    checkLimit: protectedProcedure
      .input(z.object({ accountId: z.number() }))
      .query(async ({ ctx, input }) => {
        const { checkPublishingLimit } = await import("./threadsPost");
        
        const account = await db.getThreadsAccountById(input.accountId);
        if (!account || account.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Account not found' });
        }

        try {
          const limit = await checkPublishingLimit(
            account.threadsUserId,
            account.accessToken
          );
          return limit;
        } catch (error) {
          console.error('[Check Limit Error]', error);
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR', 
            message: `レート制限の確認に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}` 
          });
        }
      }),

    // Sync profile from Threads
    syncProfile: protectedProcedure
      .input(z.object({ accountId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { getThreadsUserProfile, getThreadsUserCounts } = await import("./threadsApi");
        
        const account = await db.getThreadsAccountById(input.accountId);
        if (!account || account.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Account not found' });
        }

        try {
          // Fetch profile from Threads API
          const profile = await getThreadsUserProfile(account.accessToken);
          const counts = await getThreadsUserCounts(account.accessToken, account.threadsUserId);

          // Update database
          const updatedAccount = await db.updateThreadsAccountProfile(input.accountId, {
            threadsUsername: profile.username,
            profilePictureUrl: profile.threads_profile_picture_url || undefined,
            biography: profile.threads_biography || undefined,
            followersCount: counts.followersCount,
            followingCount: counts.followingCount,
          });

          return { 
            success: true, 
            account: updatedAccount,
            message: 'プロフィールを同期しました'
          };
        } catch (error) {
          console.error('[Profile Sync Error]', error);
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR', 
            message: `プロフィールの同期に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}` 
          });
        }
      }),

    // Get profile information
    getProfile: protectedProcedure
      .input(z.object({ accountId: z.number() }))
      .query(async ({ ctx, input }) => {
        const account = await db.getThreadsAccountById(input.accountId);
        if (!account || account.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Account not found' });
        }

        return {
          id: account.id,
          threadsUserId: account.threadsUserId,
          threadsUsername: account.threadsUsername,
          profilePictureUrl: account.profilePictureUrl,
          biography: account.biography,
          followersCount: account.followersCount,
          followingCount: account.followingCount,
          lastSyncedAt: account.lastSyncedAt,
          createdAt: account.createdAt,
        };
      }),

    // Manually refresh a single account's token
    refreshToken: protectedProcedure
      .input(z.object({ accountId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const account = await db.getThreadsAccountById(input.accountId);
        if (!account || account.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Account not found' });
        }

        const { refreshSingleAccountToken } = await import("./tokenRefreshJob");
        const result = await refreshSingleAccountToken(
          account.id,
          account.accessToken,
          account.threadsUsername
        );

        if (!result.success) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `トークンの更新に失敗しました: ${result.error || 'Unknown error'}`
          });
        }

        // Return updated account
        const updatedAccount = await db.getThreadsAccountById(input.accountId);
        return {
          success: true,
          account: updatedAccount,
          message: 'トークンを更新しました（有効期限: 60日後）'
        };
      }),

    // Refresh all expiring tokens for the current user
    refreshAllTokens: protectedProcedure
      .mutation(async ({ ctx }) => {
        const accounts = await db.getThreadsAccountsByUserId(ctx.user.id);
        const { refreshSingleAccountToken } = await import("./tokenRefreshJob");

        const results = [];
        for (const account of accounts) {
          const result = await refreshSingleAccountToken(
            account.id,
            account.accessToken,
            account.threadsUsername
          );
          results.push(result);
          // Small delay between API calls
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;

        return {
          success: failCount === 0,
          message: `${successCount}件のトークンを更新しました${failCount > 0 ? `（${failCount}件失敗）` : ''}`,
          results
        };
      }),

    // Get comments on user's posts via Threads API
    getComments: protectedProcedure
      .input(z.object({
        accountId: z.number(),
        limit: z.number().optional().default(25),
      }))
      .query(async ({ ctx, input }) => {
        const account = await db.getThreadsAccountById(input.accountId);
        if (!account || account.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'アカウントが見つかりません。' });
        }

        if (account.tokenExpiresAt && new Date(account.tokenExpiresAt) < new Date()) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'アクセストークンの有効期限が切れています。再度連携してください。'
          });
        }

        try {
          const { getThreadsComments } = await import("./threadsApi");
          const comments = await getThreadsComments(account.accessToken, account.threadsUserId, input.limit);
          return comments;
        } catch (error) {
          console.error('[Get Comments Error]', error);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `コメントの取得に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`
          });
        }
      }),

    // Generate AI reply to a comment
    generateReply: protectedProcedure
      .input(z.object({
        commentText: z.string(),
        originalPostText: z.string().optional(),
        commenterName: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check AI generation feature
        const subscription = await db.getSubscriptionByUserId(ctx.user.id);
        const planId = subscription?.planId || 'free';
        const plan = getPlan(planId);

        if (!ctx.user.isDemoMode && (!plan || plan.features.maxAiGenerations === 0)) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'AI文章生成機能は有料プランでのみ利用可能です。'
          });
        }

        const canGenerate = ctx.user.isDemoMode || await db.checkAiGenerationLimit(ctx.user.id);
        if (!canGenerate) {
          const { count, limit } = await db.getAiGenerationUsage(ctx.user.id);
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: `今月のAI生成回数の上限（${limit}回）に達しました。`
          });
        }

        const replyPrompt = `以下のThreads投稿へのコメントに、店舗オーナーとして自然で温かみのある返信を生成してください。AIっぽくならないように、人間味のある言葉遣いにしてください。

${input.originalPostText ? `【元の投稿】\n${input.originalPostText}\n\n` : ''}【コメント】${input.commenterName ? `（${input.commenterName}さんより）` : ''}
${input.commentText}

返信のルール:
- 100文字以内で簡潔に
- 絵文字は1-2個まで
- 丁寧だけど堅くならない、親しみやすいトーンで
- コメントの内容に具体的に触れる
- 3パターン生成してください`;

        const { invokeLLM } = await import('./_core/llm');
        const response = await invokeLLM({
          messages: [
            { role: 'user', content: replyPrompt },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'reply_variations',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  replies: {
                    type: 'array',
                    items: { type: 'string' },
                    description: '返信候補の配列（3パターン）'
                  },
                },
                required: ['replies'],
                additionalProperties: false,
              },
            },
          },
        });

        const content = response.choices[0].message.content;
        if (!content || typeof content !== 'string') {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'AI応答が空です。' });
        }

        const result = JSON.parse(content);
        await db.incrementAiGenerationUsage(ctx.user.id);

        return { replies: result.replies };
      }),

    // Post a reply to a comment via Threads API
    postReply: protectedProcedure
      .input(z.object({
        accountId: z.number(),
        commentId: z.string(),
        text: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const account = await db.getThreadsAccountById(input.accountId);
        if (!account || account.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'アカウントが見つかりません。' });
        }

        if (account.tokenExpiresAt && new Date(account.tokenExpiresAt) < new Date()) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'アクセストークンの有効期限が切れています。再度連携してください。'
          });
        }

        try {
          const { postThreadsReply } = await import("./threadsApi");
          const result = await postThreadsReply(
            account.accessToken,
            account.threadsUserId,
            input.commentId,
            input.text
          );
          return { success: true, replyId: result.id };
        } catch (error) {
          console.error('[Post Reply Error]', error);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `返信の投稿に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`
          });
        }
      }),
  }),

  // ============ Scheduled Posts ============
  scheduledPost: router({
    // List scheduled posts
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getScheduledPostsByUserId(ctx.user.id);
    }),

    // Create scheduled post
    create: protectedProcedure
      .input(z.object({
        projectId: z.string(),
        threadsAccountId: z.number(),
        scheduledAt: z.string(), // ISO date string
        postContent: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check scheduled post limit
        const subscription = await db.getSubscriptionByUserId(ctx.user.id);
        const planId = subscription?.planId || 'free';
        const plan = getPlan(planId);
        
        // Check pending scheduled posts limit
        if (plan && plan.features.maxScheduledPosts !== -1) {
          const count = await db.countUserScheduledPosts(ctx.user.id);
          if (count >= plan.features.maxScheduledPosts) {
            throw new TRPCError({ 
              code: 'FORBIDDEN', 
              message: `予約投稿数の上限（${plan.features.maxScheduledPosts}件）に達しています。` 
            });
          }
        }
        
        // Check monthly post limit
        if (plan && plan.features.maxScheduledPosts !== -1) {
          const monthlyCount = await db.countUserMonthlyPosts(ctx.user.id);
          if (monthlyCount >= plan.features.maxScheduledPosts) {
            throw new TRPCError({ 
              code: 'FORBIDDEN', 
              message: `月間投稿数の上限（${plan.features.maxScheduledPosts}件）に達しています。来月1日にリセットされます。` 
            });
          }
        }

        await db.createScheduledPost({
          userId: ctx.user.id,
          projectId: input.projectId,
          threadsAccountId: input.threadsAccountId,
          scheduledAt: new Date(input.scheduledAt),
          postContent: input.postContent,
        });

        return { success: true };
      }),

    // Cancel scheduled post
    cancel: protectedProcedure
      .input(z.object({ postId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.updateScheduledPost(input.postId, { status: 'canceled' });
        return { success: true };
      }),

    // Retry failed post - reschedule it for 5 minutes from now
    retry: protectedProcedure
      .input(z.object({ postId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const fiveMinLater = new Date(Date.now() + 5 * 60 * 1000);
        await db.updateScheduledPost(input.postId, {
          status: 'pending',
          scheduledAt: fiveMinLater,
          errorMessage: null,
        });
        return { success: true };
      }),
  }),

  // ============ Coupon Management ============
  coupon: router({
    // Validate coupon code
    validate: protectedProcedure
      .input(z.object({ code: z.string() }))
      .query(async ({ input }) => {
        const result = await couponService.validateCoupon(input.code);
        return result;
      }),

    // Apply coupon to user's subscription
    applyCode: protectedProcedure
      .input(z.object({ code: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const result = await couponService.applyCoupon(ctx.user.id, input.code);
        return result;
      }),
  }),

  // ============ Monitor Feedback ============
  monitor: router({
    // Submit feedback (monitor users only)
    submitFeedback: protectedProcedure
      .input(z.object({
        page: z.string().min(1).max(100),
        category: z.enum(["bug", "usability", "feature_request", "other"]),
        content: z.string().min(1).max(2000),
        screenshotUrl: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user.isMonitor) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'モニターユーザーのみフィードバックを送信できます。' });
        }
        const id = await db.createMonitorFeedback({
          userId: ctx.user.id,
          page: input.page,
          category: input.category,
          content: input.content,
          screenshotUrl: input.screenshotUrl,
        });
        return { success: true, id };
      }),

    // Get my feedback history
    myFeedback: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user.isMonitor) return [];
      return db.getMonitorFeedbackByUser(ctx.user.id);
    }),
  }),

  // ============ Onboarding Management ============
  onboarding: router({
    // Mark onboarding as completed
    complete: protectedProcedure.mutation(async ({ ctx }) => {
      await db.updateUserOnboardingCompleted(ctx.user.id, true);
      return { success: true };
    }),

    // Reset onboarding status (for testing or re-showing tour)
    reset: protectedProcedure.mutation(async ({ ctx }) => {
      await db.updateUserOnboardingCompleted(ctx.user.id, false);
      return { success: true };
    }),
  }),

  // ============ Template Management ============
  templates: router({
    // Get all templates
    getAll: publicProcedure.query(async () => {
      return await db.getAllTemplates();
    }),

    // Get templates by category
    getByCategory: publicProcedure
      .input(z.object({ category: z.string() }))
      .query(async ({ input }) => {
        return await db.getTemplatesByCategory(input.category);
      }),

    // Get template by ID
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getTemplateById(input.id);
      }),

    // Increment template usage count
    incrementUsage: protectedProcedure
      .input(z.object({ templateId: z.number() }))
      .mutation(async ({ input }) => {
        await db.incrementTemplateUsage(input.templateId);
        return { success: true };
      }),

    // Get user's favorite templates
    getFavorites: protectedProcedure.query(async ({ ctx }) => {
      return await db.getUserFavoriteTemplates(ctx.user.id);
    }),

    // Add template to favorites
    addFavorite: protectedProcedure
      .input(z.object({ templateId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.addUserFavorite(ctx.user.id, input.templateId);
        return { success: true };
      }),

    // Remove template from favorites
    removeFavorite: protectedProcedure
      .input(z.object({ templateId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.removeUserFavorite(ctx.user.id, input.templateId);
        return { success: true };
      }),

    // Check if template is favorited
    isFavorited: protectedProcedure
      .input(z.object({ templateId: z.number() }))
      .query(async ({ ctx, input }) => {
        return await db.isTemplateFavorited(ctx.user.id, input.templateId);
      }),
  }),

  // ============ Univapay Management ============
  univapay: router({
    // Cancel subscription
    cancelSubscription: protectedProcedure.mutation(async ({ ctx }) => {
      const subscription = await db.getSubscriptionByUserId(ctx.user.id);
      
      if (!subscription) {
        throw new TRPCError({ 
          code: 'BAD_REQUEST', 
          message: 'アクティブなサブスクリプションが見つかりません。' 
        });
      }

      if (!subscription.univapaySubscriptionId) {
        throw new TRPCError({ 
          code: 'BAD_REQUEST', 
          message: 'Univapayサブスクリプションが見つかりません。' 
        });
      }

      // Cancel subscription in Univapay
      const univapayService = await import('./univapay');
      await univapayService.cancelSubscription(subscription.univapaySubscriptionId);

      // Update database
      await db.updateSubscription(subscription.id, { 
        status: 'canceled',
        cancelAtPeriodEnd: true 
      });

      return { success: true };
    }),

    // Change subscription plan
    changePlan: protectedProcedure
      .input(z.object({ 
        newPlanId: z.string(),
        changeTiming: z.enum(['immediate', 'next_period']).default('immediate')
      }))
      .mutation(async ({ ctx, input }) => {
        const subscription = await db.getSubscriptionByUserId(ctx.user.id);
        const currentPlanId = subscription?.planId || 'free';
        
        if (currentPlanId === 'free') {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: '無料プランからの変更は新規購入として行ってください。' 
          });
        }

        if (!subscription?.univapaySubscriptionId) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'アクティブなサブスクリプションが見つかりません。' 
          });
        }

        if (currentPlanId === input.newPlanId) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: '現在と同じプランには変更できません。' 
          });
        }

        const currentPlan = getPlan(currentPlanId);
        const newPlan = getPlan(input.newPlanId);
        
        if (!currentPlan || !newPlan) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'プラン情報が見つかりません。' 
          });
        }

        // Calculate price difference
        const priceDiff = newPlan.priceMonthly - currentPlan.priceMonthly;
        const isUpgrade = priceDiff > 0;

        if (input.changeTiming === 'immediate') {
          // Immediate change: cancel old subscription and create new one
          const univapayService = await import('./univapay');
          await univapayService.updateSubscription(subscription.univapaySubscriptionId, input.newPlanId);

          // Update database immediately
          await db.updateSubscription(subscription.id, { 
            planId: input.newPlanId,
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
          });

          return { 
            success: true, 
            changeTiming: 'immediate',
            message: 'プランが即座に変更されました。' 
          };
        } else {
          // Next period change: schedule the change
          // In Univapay, we can't schedule changes, so we just update the database
          // The actual change will happen when the current period ends
          await db.updateSubscription(subscription.id, { 
            // Store the pending plan change in a custom field (you may need to add this to schema)
            planId: input.newPlanId,
            cancelAtPeriodEnd: false
          });

          return { 
            success: true, 
            changeTiming: 'next_period',
            message: '次回請求時にプランが変更されます。',
            effectiveDate: subscription.currentPeriodEnd || undefined
          };
        }
      }),

    // Preview plan change (calculate proration)
    previewPlanChange: protectedProcedure
      .input(z.object({ newPlanId: z.string() }))
      .query(async ({ ctx, input }) => {
        const subscription = await db.getSubscriptionByUserId(ctx.user.id);
        const currentPlanId = subscription?.planId || 'free';
        
        const currentPlan = getPlan(currentPlanId);
        const newPlan = getPlan(input.newPlanId);
        
        if (!currentPlan || !newPlan) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'プラン情報が見つかりません。' 
          });
        }

        const priceDiff = newPlan.priceMonthly - currentPlan.priceMonthly;
        const isUpgrade = priceDiff > 0;

        // Calculate prorated amount (simplified - assumes 30 days per month)
        let proratedAmount = 0;
        if (subscription?.currentPeriodEnd) {
          const now = Date.now();
          const periodEnd = subscription.currentPeriodEnd.getTime();
          const daysRemaining = Math.max(0, Math.ceil((periodEnd - now) / (1000 * 60 * 60 * 24)));
          proratedAmount = Math.round((priceDiff * daysRemaining) / 30);
        }

        return {
          currentPlan,
          newPlan,
          priceDiff,
          isUpgrade,
          proratedAmount,
          daysRemaining: subscription?.currentPeriodEnd 
            ? Math.max(0, Math.ceil((subscription.currentPeriodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
            : 0
        };
      }),
  }),

  // ============ Statistics Management ============
  stats: router({
    // Get user statistics
    getUserStats: protectedProcedure.query(async ({ ctx }) => {
      return await db.getUserStats(ctx.user.id);
    }),

    // Get popular templates
    getPopularTemplates: publicProcedure
      .input(z.object({ limit: z.number().optional().default(5) }))
      .query(async ({ input }) => {
        return await db.getPopularTemplates(input.limit);
      }),

    // Get post analytics for the current user
    postAnalytics: protectedProcedure.query(async ({ ctx }) => {
      return await db.getPostAnalyticsWithEngagement(ctx.user.id);
    }),

    // Identify hit posts (above average engagement)
    hitPosts: protectedProcedure.query(async ({ ctx }) => {
      const { posts, avgEngagement } = await db.getPostAnalyticsWithEngagement(ctx.user.id);
      const hitPosts = posts.filter(p => p.engagement > avgEngagement);
      return { hitPosts, avgEngagement };
    }),

    // Fetch and store analytics from Threads API for a user's posts
    fetchAndStoreAnalytics: protectedProcedure.mutation(async ({ ctx }) => {
      const { getThreadsUserPosts, getThreadsPostInsights } = await import("./threadsApi");

      // Get user's connected Threads accounts
      const accounts = await db.getThreadsAccountsByUserId(ctx.user.id);
      if (accounts.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Threadsアカウントが連携されていません。' });
      }

      let totalFetched = 0;

      for (const account of accounts) {
        // Fetch recent posts
        const posts = await getThreadsUserPosts(account.accessToken, account.threadsUserId, 25);

        // Fetch insights for each post
        for (const post of posts) {
          const insights = await getThreadsPostInsights(account.accessToken, post.id);

          await db.upsertPostAnalytics({
            userId: ctx.user.id,
            threadsPostId: post.id,
            postContent: post.text || null,
            postPermalink: post.permalink || null,
            postedAt: post.timestamp ? new Date(post.timestamp) : null,
            impressions: insights.views,
            likes: insights.likes,
            replies: insights.replies,
            reposts: insights.reposts,
            fetchedAt: new Date(),
          });
          totalFetched++;
        }
      }

      return { success: true, fetchedCount: totalFetched };
    }),
  }),

  // ============ Admin Management ============
  admin: router({
    // List all coupons (admin only)
    listCoupons: protectedProcedure
      .input(z.object({
        limit: z.number().optional().default(100),
        offset: z.number().optional().default(0),
      }))
      .query(async ({ ctx, input }) => {
        // Check if user is admin
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '管理者権限が必要です。' });
        }
        
        const coupons = await db.getAllCoupons(input.limit, input.offset);
        const total = await db.countCoupons();
        return { coupons, total };
      }),

    // Get coupon by ID (admin only)
    getCoupon: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '管理者権限が必要です。' });
        }
        
        const coupon = await db.getCouponById(input.id);
        if (!coupon) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'キャンペーンコードが見つかりません。' });
        }
        return coupon;
      }),

    // Create coupon (admin only)
    createCoupon: protectedProcedure
      .input(z.object({
        code: z.string().min(1).max(50),
        type: z.enum(['forever_free', 'trial_30', 'trial_14', 'discount_50', 'discount_30', 'special_price', 'monitor']),
        description: z.string().optional(),
        maxUses: z.number().optional(),
        expiresAt: z.date().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '管理者権限が必要です。' });
        }
        
        const id = await db.createCoupon(input);
        return { id };
      }),

    // Update coupon (admin only)
    updateCoupon: protectedProcedure
      .input(z.object({
        id: z.number(),
        code: z.string().min(1).max(50).optional(),
        type: z.enum(['forever_free', 'trial_30', 'trial_14']).optional(),
        description: z.string().optional(),
        maxUses: z.number().optional(),
        expiresAt: z.date().nullable().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '管理者権限が必要です。' });
        }
        
        const { id, ...updates } = input;
        const success = await db.updateCoupon(id, updates);
        if (!success) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'キャンペーンコードが見つかりません。' });
        }
        return { success: true };
      }),

    // Delete coupon (admin only)
    deleteCoupon: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '管理者権限が必要です。' });
        }
        
        const success = await db.deleteCoupon(input.id);
        if (!success) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'キャンペーンコードが見つかりません。' });
        }
        return { success: true };
      }),

    // Get coupon usage stats (admin only)
    getCouponStats: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '管理者権限が必要です。' });
        }
        
        const stats = await db.getCouponUsageStats(input.id);
        if (!stats) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'キャンペーンコードが見つかりません。' });
        }
        return stats;
      }),

    // ==================== User Management (Admin Only) ====================
    // Get all users (admin only)
    getAllUsers: adminProcedure.query(async () => {
      return await db.getAllUsers();
    }),

    // Reset user password (admin only)
    resetUserPassword: adminProcedure
      .input(z.object({
        userId: z.number(),
        newPassword: z.string().min(8),
      }))
      .mutation(async ({ input }) => {
        const { hashPassword, isValidPassword } = await import('./auth-helpers');
        
        // Validate password
        if (!isValidPassword(input.newPassword)) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'パスワードは8文字以上で、数字または記号を1つ以上含む必要があります。' 
          });
        }

        // Hash password
        const passwordHash = await hashPassword(input.newPassword);

        // Reset password
        await db.resetUserPassword(input.userId, passwordHash);

        return { success: true };
      }),

    // ==================== Monitor Feedback Management (Admin Only) ====================
    listMonitorFeedback: adminProcedure
      .input(z.object({
        limit: z.number().optional().default(50),
        offset: z.number().optional().default(0),
      }))
      .query(async ({ input }) => {
        const feedbackList = await db.getAllMonitorFeedback(input.limit, input.offset);
        const total = await db.countMonitorFeedback();
        return { feedback: feedbackList, total };
      }),

    updateFeedbackStatus: adminProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["new", "in_progress", "resolved", "wont_fix"]),
        adminNote: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const success = await db.updateMonitorFeedbackStatus(input.id, input.status, input.adminNote);
        if (!success) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'フィードバックが見つかりません。' });
        }
        return { success: true };
      }),

    // ==================== Preset Management (Admin Only) ====================
    // Create preset (admin only)
    createPreset: protectedProcedure
      .input(z.object({
        category: z.string(),
        name: z.string().min(1).max(100),
        description: z.string().optional(),
        icon: z.string().optional(),
        postType: z.string(),
        defaultParams: z.string(),
        displayOrder: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '管理者権限が必要です。' });
        }
        
        const id = await db.createPreset({
          ...input,
          description: input.description ?? null,
          icon: input.icon ?? null,
          isSystem: false,
        });
        return { id };
      }),

    // Update preset (admin only)
    updatePreset: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().nullable().optional(),
        icon: z.string().nullable().optional(),
        postType: z.string().optional(),
        defaultParams: z.string().optional(),
        displayOrder: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '管理者権限が必要です。' });
        }
        
        const { id, ...updates } = input;
        const success = await db.updatePreset(id, updates);
        if (!success) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'プリセットが見つかりません。' });
        }
        return { success: true };
      }),

    // Delete preset (admin only)
    deletePreset: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '管理者権限が必要です。' });
        }
        
        const success = await db.deletePreset(input.id);
        if (!success) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'プリセットが見つかりません。' });
        }
        return { success: true };
      }),
  }),

  // ============ AI Generation Templates ============
  template: router({
    // List user's templates
    list: protectedProcedure
      .input(z.object({
        limit: z.number().optional().default(50),
        offset: z.number().optional().default(0),
      }))
      .query(async ({ ctx, input }) => {
        const templates = await db.getUserTemplates(ctx.user.id, input.limit, input.offset);
        const total = await db.countUserTemplates(ctx.user.id);
        return { templates, total };
      }),

    // Get template by ID
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const template = await db.getAiTemplateById(input.id, ctx.user.id);
        if (!template) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'テンプレートが見つかりません。' });
        }
        return template;
      }),

    // Create template
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(100),
        description: z.string().optional(),
        postType: z.string(),
        generationParams: z.string(),
        isPublic: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await db.createTemplate({
          userId: ctx.user.id,
          ...input,
        });
        return { id };
      }),

    // Update template
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().optional(),
        postType: z.string().optional(),
        generationParams: z.string().optional(),
        isPublic: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...updates } = input;
        const success = await db.updateTemplate(id, ctx.user.id, updates);
        if (!success) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'テンプレートが見つかりません。' });
        }
        return { success: true };
      }),

    // Delete template
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const success = await db.deleteTemplate(input.id, ctx.user.id);
        if (!success) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'テンプレートが見つかりません。' });
        }
        return { success: true };
      }),

    // Get popular templates
    popular: publicProcedure
      .input(z.object({ limit: z.number().optional().default(10) }))
      .query(async ({ input }) => {
        return await db.getPopularAiTemplates(input.limit);
      }),
  }),

  // ==================== Setup Wizard ====================
  setup: router({
    // Get current setup step
    getStep: protectedProcedure
      .query(async ({ ctx }) => {
        const setupStep = await db.getUserSetupStep(ctx.user.id);
        return { setupStep };
      }),

    // Update setup step
    updateStep: protectedProcedure
      .input(z.object({ setupStep: z.number().min(0).max(5) }))
      .mutation(async ({ ctx, input }) => {
        const success = await db.updateUserSetupStep(ctx.user.id, input.setupStep);
        return { success };
      }),

    // Complete setup
    complete: protectedProcedure
      .mutation(async ({ ctx }) => {
        const success = await db.completeUserSetup(ctx.user.id);
        return { success };
      }),

    // Get demo mode status
    getDemoMode: protectedProcedure
      .query(async ({ ctx }) => {
        const isDemoMode = await db.getUserDemoMode(ctx.user.id);
        return { isDemoMode };
      }),

    // Exit demo mode (switch to production mode)
    exitDemoMode: protectedProcedure
      .mutation(async ({ ctx }) => {
        const success = await db.setUserDemoMode(ctx.user.id, false);
        return { success };
      }),

    // Initialize demo data for new user
    initializeDemoData: protectedProcedure
      .mutation(async ({ ctx }) => {
        // Create a demo project
        const demoProject = await db.createDemoProject(ctx.user.id);
        return { success: true, projectId: demoProject.id };
      }),
  }),

  // ==================== AI Generation Presets ====================
  preset: router({
    // Get all presets
    list: publicProcedure
      .query(async () => {
        return await db.getAllPresets();
      }),

    // Get presets by category
    byCategory: publicProcedure
      .input(z.object({ category: z.string() }))
      .query(async ({ input }) => {
        return await db.getPresetsByCategory(input.category);
      }),

    // Get preset by ID
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const preset = await db.getPresetById(input.id);
        if (!preset) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'プリセットが見つかりません。' });
        }
        return preset;
      }),

    // Increment preset usage
    incrementUsage: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.incrementPresetUsage(input.id);
        return { success: true };
      }),

    // Get popular presets
    popular: publicProcedure
      .input(z.object({ limit: z.number().optional().default(10) }))
      .query(async ({ input }) => {
        return await db.getPopularPresets(input.limit);
      }),

    // List custom presets for current user
    listCustom: protectedProcedure
      .query(async ({ ctx }) => {
        return await db.getCustomPresets(ctx.user.id);
      }),

    // Create custom preset from current settings
    createCustom: protectedProcedure
      .input(z.object({
        name: z.string().min(1, 'プリセット名を入力してください'),
        description: z.string().optional(),
        postType: z.string(),
        defaultParams: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await db.createCustomPreset(ctx.user.id, {
          name: input.name,
          description: input.description || null,
          postType: input.postType,
          defaultParams: input.defaultParams,
        });
        return { id };
      }),

    // Update custom preset (only own presets)
    updateCustom: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        postType: z.string().optional(),
        defaultParams: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        await db.updateCustomPreset(ctx.user.id, id, data);
        return { success: true };
      }),

    // Toggle pin on custom preset
    togglePin: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const isPinned = await db.togglePinPreset(ctx.user.id, input.id);
        return { success: true, isPinned };
      }),

    // Reorder custom presets
    reorder: protectedProcedure
      .input(z.object({ presetIds: z.array(z.number()) }))
      .mutation(async ({ ctx, input }) => {
        await db.updatePresetOrder(ctx.user.id, input.presetIds);
        return { success: true };
      }),

    // Delete custom preset (only own presets)
    deleteCustom: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.deleteCustomPreset(ctx.user.id, input.id);
        return { success: true };
      }),
  }),

  // ==================== AI Chat Assistant ====================
  aiChat: router({
    // Create a new conversation
    createConversation: protectedProcedure
      .input(z.object({ title: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const conversation = await db.createChatConversation(ctx.user.id, input.title);
        return conversation;
      }),

    // Get user's conversations
    listConversations: protectedProcedure
      .query(async ({ ctx }) => {
        return await db.getUserChatConversations(ctx.user.id);
      }),

    // Get messages in a conversation
    getMessages: protectedProcedure
      .input(z.object({ conversationId: z.number() }))
      .query(async ({ ctx, input }) => {
        const conversation = await db.getChatConversation(input.conversationId);
        if (!conversation || conversation.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: '会話が見つかりません。' });
        }
        return await db.getChatMessages(input.conversationId);
      }),

    // Send a message (non-streaming)
    sendMessage: protectedProcedure
      .input(z.object({
        conversationId: z.number().optional(),
        message: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        let conversationId = input.conversationId;

        // Create new conversation if not provided
        if (!conversationId) {
          const conversation = await db.createChatConversation(ctx.user.id);
          conversationId = conversation.id;
        }

        // Verify conversation ownership
        const conversation = await db.getChatConversation(conversationId);
        if (!conversation || conversation.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: '会話が見つかりません。' });
        }

        // Save user message
        await db.addChatMessage(conversationId, 'user', input.message);

        // Get conversation history
        const messages = await db.getChatMessages(conversationId);

        // Get user's projects for context
        const projects = await db.getProjectsByUserId(ctx.user.id);
        const projectContext = projects.length > 0
          ? `\n\nユーザーのプロジェクト: ${projects.map(p => p.title).join(', ')}`
          : '';

        // Build system prompt
        const systemPrompt = `あなたはThreads StudioのAIアシスタントです。ユーザーがThreads投稿を作成し、ビジネスを成長させるためのサポートをします。

主な役割:
- Threads投稿の内容改善提案
- プロジェクト作成のアドバイス
- ツールの使い方の説明
- マーケティング戦略の提案

ユーザー情報:
- 名前: ${ctx.user.name || '未設定'}
- メール: ${ctx.user.email || '未設定'}${projectContext}

常に親切で具体的なアドバイスを心がけてください。`;

        // Call LLM
        const { invokeLLM } = await import('./_core/llm');
        const response = await invokeLLM({
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages.map(m => ({
              role: m.role as 'user' | 'assistant' | 'system',
              content: m.content,
            })),
          ],
        });

        const assistantMessageContent = response.choices[0]?.message?.content;
        const assistantMessage = typeof assistantMessageContent === 'string'
          ? assistantMessageContent
          : '申し訳ありません、エラーが発生しました。';

        // Save assistant message
        await db.addChatMessage(conversationId, 'assistant', assistantMessage);

        return {
          conversationId,
          message: assistantMessage,
        };
      }),

    // Delete a conversation
    deleteConversation: protectedProcedure
      .input(z.object({ conversationId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const conversation = await db.getChatConversation(input.conversationId);
        if (!conversation || conversation.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: '会話が見つかりません。' });
        }
        await db.deleteChatConversation(input.conversationId);
        return { success: true };
      }),
  }),

  // ==================== Referral Program ====================
  referral: router({
    // Get user's referral code and link
    getMyReferralInfo: protectedProcedure.query(async ({ ctx }) => {
      const user = await db.getUserById(ctx.user.id);
      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'ユーザーが見つかりません。' });

      // Generate referral code if not exists
      if (!user.referralCode) {
        const referralCode = await db.generateReferralCode();
        await db.updateUserReferralCode(ctx.user.id, referralCode);
        const referralLink = `${ctx.req.protocol}://${ctx.req.headers.host}/register?ref=${referralCode}`;
        return {
          referralCode,
          referralLink,
        };
      }

      const referralLink = `${ctx.req.protocol}://${ctx.req.headers.host}/register?ref=${user.referralCode}`;
      return {
        referralCode: user.referralCode,
        referralLink,
      };
    }),

    // Get user's credit balance
    getMyCredits: protectedProcedure.query(async ({ ctx }) => {
      const credits = await db.getUserCredits(ctx.user.id);
      return { credits };
    }),

    // Get credit transaction history
    getCreditHistory: protectedProcedure.query(async ({ ctx }) => {
      return await db.getCreditTransactions(ctx.user.id);
    }),

    // Get referral history
    getReferralHistory: protectedProcedure.query(async ({ ctx }) => {
      return await db.getReferralsByReferrerId(ctx.user.id);
    }),
  }),

  // ==================== Auto Post Settings ====================
  autoPost: router({
    getSettings: protectedProcedure.query(async ({ ctx }) => {
      const settings = await db.getAutoPostSettings(ctx.user.id);
      return settings || { autoPostEnabled: true, autoPostFrequency: 'daily' };
    }),

    updateSettings: protectedProcedure
      .input(z.object({
        autoPostEnabled: z.boolean().optional(),
        autoPostFrequency: z.enum(['daily', 'twice_daily', 'three_daily']).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.updateAutoPostSettings(ctx.user.id, input);
        return { success: true };
      }),

    getHistory: protectedProcedure
      .input(z.object({ limit: z.number().optional().default(20) }))
      .query(async ({ ctx, input }) => {
        return await db.getAutoPostHistory(ctx.user.id, input.limit);
      }),

    // Manual trigger for testing
    generateNow: protectedProcedure.mutation(async ({ ctx }) => {
      const { processAutoPostGeneration } = await import('./autoPostScheduler');

      // Get user's projects and Threads accounts
      const userProjects = await db.getUserProjects(ctx.user.id);
      const accounts = await db.getActiveThreadsAccounts(ctx.user.id);

      if (!userProjects.length) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'プロジェクトを作成してください。' });
      }
      if (!accounts.length) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Threadsアカウントを連携してください。' });
      }

      const result = await processAutoPostGeneration();
      return result;
    }),
  }),

  // ============ Favorites ============
  favorite: router({
    toggle: protectedProcedure
      .input(z.object({ historyId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const favorited = await db.toggleHistoryFavorite(ctx.user.id, input.historyId);
        return { favorited };
      }),

    list: protectedProcedure
      .query(async ({ ctx }) => {
        return await db.getHistoryFavorites(ctx.user.id);
      }),
  }),

  // ==================== Account Management ====================
  account: router({
    // パスワード変更
    changePassword: protectedProcedure
      .input(z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "パスワードは大文字・小文字・数字を含む8文字以上にしてください"),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user || !user.passwordHash) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "パスワードの変更ができません" });
        }

        const isValid = await bcrypt.compare(input.currentPassword, user.passwordHash);
        if (!isValid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "現在のパスワードが正しくありません" });
        }

        const hashedPassword = await bcrypt.hash(input.newPassword, 10);
        await db.updateUserPassword(ctx.user.id, hashedPassword);

        return { success: true };
      }),

    // アカウント削除
    deleteAccount: protectedProcedure
      .input(z.object({
        password: z.string().min(1),
        confirmation: z.literal("DELETE"),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user || !user.passwordHash) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "アカウントの削除ができません" });
        }

        const isValid = await bcrypt.compare(input.password, user.passwordHash);
        if (!isValid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "パスワードが正しくありません" });
        }

        // Cancel Stripe subscription if active
        const subscription = await db.getSubscriptionByUserId(ctx.user.id);
        if (subscription?.stripeSubscriptionId) {
          try {
            await stripeService.cancelSubscription(subscription.stripeSubscriptionId);
          } catch (error) {
            console.error("[Account Delete] Failed to cancel Stripe subscription:", error);
          }
        }

        // Delete user (cascades to all related data)
        await db.deleteUser(ctx.user.id);

        return { success: true };
      }),
  }),

});

export type AppRouter = typeof appRouter;
