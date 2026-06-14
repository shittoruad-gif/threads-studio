import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { toPublicErrorMessage } from "../shared/sanitize";
import { z } from "zod";
import * as db from "./db";
import { ENV } from "./_core/env";
import bcrypt from "bcryptjs";
import * as couponService from "./coupon";
import { PLANS, TRIAL_DAYS, getPlan } from "../shared/plans";
import { TRPCError } from "@trpc/server";

// Global rate limit store for tryGenerate
declare global {
  var __tryGenerateRateLimit: Map<string, number[]> | undefined;
  var __pwResetRateLimit: Map<string, number[]> | undefined;
  var __loginAttempts: Map<string, { count: number; lockedUntil: number }> | undefined;
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
        password: z.string().min(10),
        name: z.string().min(1, '名前を入力してください'),
        couponCode: z.string().optional(),
        // #28 紹介コード（/register?ref=XXX から取得）
        referralCode: z.string().trim().min(1).max(16).optional(),
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
            message: 'パスワードは10文字以上で、英字・数字・記号のうち2種類以上を含む必要があります。' 
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

        // 認証メールはユーザー本人へ送る（本番URL = APP_BASE_URL を使用）。
        // 送信失敗（Resendドメイン未認証等）でも登録自体は成功させる。
        try {
          const { sendVerificationEmail } = await import('./_core/notification');
          const baseUrl =
            process.env.APP_BASE_URL || process.env.VITE_APP_URL || 'https://threads-studio.com';
          if (user.email) {
            await sendVerificationEmail(user.email, verificationToken, baseUrl);
          }
        } catch (e) {
          console.warn(`[Register] verification email send failed for ${user.email}:`, e);
        }

        // Apply coupon code if provided
        if (input.couponCode && input.couponCode.trim()) {
          try {
            await couponService.applyCoupon(user.id, input.couponCode.trim());
          } catch (e) {
            // Don't fail registration if coupon fails - user can apply later
            console.warn(`[Register] Coupon application failed for user ${user.id}:`, e);
          }
        }

        // ── #28 紹介コードを消費（あれば） ──────────────────────────
        // 紹介者・被紹介者の両方にクレジットを付与。
        // 自己参照（同一ユーザ）/ 重複適用（既に紹介関係あり）はDB側で拒否。
        if (input.referralCode && input.referralCode.trim()) {
          try {
            const referrer = await db.getUserByReferralCode(input.referralCode.trim().toUpperCase());
            if (referrer && referrer.id !== user.id) {
              // 自己参照を防ぐ（同一メアド or 同一openId）
              const sameUser =
                (referrer.email && referrer.email === user.email) ||
                (referrer.openId && referrer.openId === user.openId);
              if (!sameUser) {
                const REFERRER_REWARD = 100;
                const REFERRED_REWARD = 50;
                await db.createReferralWithRewards({
                  referrerId: referrer.id,
                  referredUserId: user.id,
                  referrerReward: REFERRER_REWARD,
                  referredReward: REFERRED_REWARD,
                });
                console.log(`[Referral] Applied: referrer=${referrer.id} referred=${user.id}`);
              }
            }
          } catch (e) {
            console.warn(`[Register] Referral application failed for user ${user.id}:`, e);
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

        // ★認証プロバイダの違いを外部に漏らさないため、すべて同じメッセージで弾く。
        // メアド列挙 / OAuth ユーザ判定攻撃を防止。
        const GENERIC_LOGIN_FAIL = 'メールアドレスまたはパスワードが正しくありません。';

        if (user.authProvider !== 'email' || !user.passwordHash) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: GENERIC_LOGIN_FAIL });
        }

        // ─── #4 ログイン試行回数のレート制限（per-account & per-IP） ───
        // 5 回失敗で 15 分ロック。短期ブルートフォースを止める。
        const ipForLogin = ctx.req.ip || ctx.req.headers['x-forwarded-for'] || 'unknown';
        const ipForLoginStr = Array.isArray(ipForLogin) ? ipForLogin[0] : ipForLogin;
        if (!globalThis.__loginAttempts) {
          globalThis.__loginAttempts = new Map<string, { count: number; lockedUntil: number }>();
        }
        const attempts = globalThis.__loginAttempts as Map<string, { count: number; lockedUntil: number }>;
        const lockKey = `${user.id}:${ipForLoginStr}`;
        const lockEntry = attempts.get(lockKey);
        const lockNow = Date.now();
        if (lockEntry && lockEntry.lockedUntil > lockNow) {
          const remainMin = Math.ceil((lockEntry.lockedUntil - lockNow) / 60000);
          throw new TRPCError({
            code: 'TOO_MANY_REQUESTS',
            message: `連続して失敗しました。${remainMin}分後に再度お試しください。`,
          });
        }

        const isValid = await verifyPassword(input.password, user.passwordHash);
        if (!isValid) {
          // 失敗カウンタを進める
          const cur = attempts.get(lockKey) ?? { count: 0, lockedUntil: 0 };
          cur.count += 1;
          if (cur.count >= 5) {
            cur.lockedUntil = lockNow + 15 * 60 * 1000;
            cur.count = 0;
          }
          attempts.set(lockKey, cur);
          throw new TRPCError({ code: 'UNAUTHORIZED', message: GENERIC_LOGIN_FAIL });
        }
        // 成功時はカウンタをクリア
        attempts.delete(lockKey);

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
      .mutation(async ({ ctx, input }) => {
        const { generateToken } = await import('./auth-helpers');
        const { sendPasswordResetEmail } = await import('./_core/notification');

        // ── 濫用防止：メアドごと・IPごとに 3 回 / 60 分制限 ──────────
        // 任意のメールアドレスに対する大量のリセットメール送信を防ぐ。
        const ip = ctx.req.ip || ctx.req.headers['x-forwarded-for'] || 'unknown';
        const ipStr = Array.isArray(ip) ? ip[0] : ip;
        const now = Date.now();
        const windowMs = 60 * 60 * 1000;
        if (!globalThis.__pwResetRateLimit) {
          globalThis.__pwResetRateLimit = new Map<string, number[]>();
        }
        const rate = globalThis.__pwResetRateLimit as Map<string, number[]>;
        const keys = [`ip:${ipStr}`, `mail:${input.email.toLowerCase()}`];
        for (const k of keys) {
          const arr = (rate.get(k) || []).filter((t) => now - t < windowMs);
          if (arr.length >= 3) {
            // 同じメッセージで返す（攻撃者にレート制限の有無を悟らせない）
            return { success: true };
          }
        }

        // Get user by email
        const user = await db.getUserByEmail(input.email);

        // ★成功・失敗いずれでもレートカウンタは進める（メアド存在の探り防止）
        for (const k of keys) {
          const arr = (rate.get(k) || []).filter((t) => now - t < windowMs);
          arr.push(now);
          rate.set(k, arr);
        }

        // メアドが存在しない / OAuth ユーザの場合は何もしない（成功レスポンスのみ返す）
        if (!user || user.authProvider !== 'email') {
          return { success: true };
        }

        // Generate reset token
        const token = generateToken(32);
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        // Delete old tokens
        await db.deletePasswordResetTokensByUserId(user.id);

        // Create new token
        await db.createPasswordResetToken(user.id, token, expiresAt);

        // ★トークンはメールでのみ送る。HTTP レスポンスには絶対に含めない。
        const baseUrl =
          process.env.APP_BASE_URL ||
          process.env.VITE_APP_URL ||
          ctx.req.headers.origin ||
          'https://threads.shittoru.com';
        if (user.email) {
          await sendPasswordResetEmail(user.email, token, baseUrl);
        }

        // フロントには「メール送信した」とだけ伝える。トークンは返さない。
        return { success: true };
      }),

    // Reset Password
    resetPassword: publicProcedure
      .input(z.object({
        token: z.string(),
        newPassword: z.string().min(10),
      }))
      .mutation(async ({ input }) => {
        const { hashPassword, isValidPassword } = await import('./auth-helpers');
        
        // Validate password
        if (!isValidPassword(input.newPassword)) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'パスワードは10文字以上で、英字・数字・記号のうち2種類以上を含む必要があります。' 
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

        // Update user password（専用の更新関数でユーザーIDを直接更新する）
        const user = await db.getUserById(resetToken.userId);
        if (!user) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'ユーザーが見つかりません。' });
        }

        await db.updateUserPassword(user.id, passwordHash);

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

        // ★#8 トークンの有効期限を 7 日に設定（既存の createdAt を基準に判定）。
        //   過去の永続的に有効だったトークンを期限切れにする。
        const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
        const issuedAt = user.createdAt;
        if (issuedAt && Date.now() - new Date(issuedAt).getTime() > TOKEN_TTL_MS) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: '認証リンクの有効期限が切れています（7日）。サポートまでお問い合わせください。',
          });
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

        // 決済はUnivapayリンク経由に一本化。リンクが未設定なら設定不備として弾く。
        if (!plan.univapayLinkUrl) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'このプランの決済リンクが未設定です。お手数ですがサポートまでお問い合わせください。',
          });
        }
        return { url: plan.univapayLinkUrl };
      }),

    // 解約・プラン変更は univapay ルーター（univapay.cancelSubscription /
    // changePlan / previewPlanChange）に一本化済み。カード情報の更新ポータルは
    // Univapayリンクフォーム方式には無く、再申込（再登録）で復旧する運用。
    // 請求履歴はアプリ側では保持しないため空配列を返す（UIは非表示になる）。
    getInvoices: protectedProcedure.query(async () => {
      return [] as Array<{
        id: string;
        amount: number;
        currency: string;
        status: string | null;
        created: number;
        invoiceUrl: string | null;
        pdfUrl: string | null;
      }>;
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
        storeName: z.string().optional(), // 店名（一度登録すれば毎回再入力不要）
        businessType: z.string().optional(),
        area: z.string().optional(),
        target: z.string().optional(),
        mainProblem: z.string().optional(),
        strength: z.string().optional(),
        proof: z.string().optional(),
        ctaLink: z.string().optional(),
        links: z.string().optional(), // JSON string of ProjectLink[]
        usp: z.string().optional(),
        n1Customer: z.string().optional(),
        belief: z.string().optional(), // 主張・信念
        catchphrase: z.string().optional(), // 口癖・方言・決めゼリフ
        customerWords: z.string().optional(), // お客さんが実際に使った言葉ストック
        ngWords: z.string().optional(), // 投稿に入れたくないワード（改行/カンマ区切り）
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
        storeName: z.string().optional(), // 店名（一度登録すれば毎回再入力不要）
        businessType: z.string().optional(),
        area: z.string().optional(),
        target: z.string().optional(),
        mainProblem: z.string().optional(),
        strength: z.string().optional(),
        proof: z.string().optional(),
        ctaLink: z.string().optional(),
        links: z.string().optional(), // JSON string of ProjectLink[]
        usp: z.string().optional(),
        n1Customer: z.string().optional(),
        belief: z.string().optional(), // 主張・信念
        catchphrase: z.string().optional(), // 口癖・方言・決めゼリフ
        customerWords: z.string().optional(), // お客さんが実際に使った言葉ストック
        useThreadsKnowhow: z.boolean().optional(),
        ngWords: z.string().optional(), // 投稿に入れたくないワード（改行/カンマ区切り）
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

    // ── Project links (LINE / 予約 / HP / etc.) ──────────────────────────
    // Replace the entire links array on a project. Client sends the full
    // intended state so we don't need separate add/remove/update endpoints.
    setLinks: protectedProcedure
      .input(z.object({
        projectId: z.string(),
        links: z.array(z.object({
          id: z.string(),
          type: z.enum(['line', 'reservation', 'website', 'instagram', 'youtube', 'other']),
          label: z.string().min(1).max(40),
          url: z.string().url('有効なURLを入力してください'),
          isDefault: z.boolean().optional(),
        })).max(20),
      }))
      .mutation(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
        }
        const { normaliseDefaults } = await import('../shared/projectLinks');
        const normalised = normaliseDefaults(input.links);
        await db.updateProject(input.projectId, {
          links: JSON.stringify(normalised),
        });
        return { success: true, links: normalised };
      }),

    // Get project count
    count: protectedProcedure.query(async ({ ctx }) => {
      return await db.countUserProjects(ctx.user.id);
    }),

    // ── AIカウンセリング: 結果取得 ─────────────────────────────────────
    // プロジェクトに保存された CounselingResult を返す。未カウンセリング時は null。
    getCounseling: protectedProcedure
      .input(z.object({ projectId: z.string() }))
      .query(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
        }
        const raw = (project as any).counselingResult as string | null | undefined;
        const useThreadsKnowhow = (project as any).useThreadsKnowhow;
        if (!raw) {
          return {
            counseledAt: null as number | null,
            useThreadsKnowhow: useThreadsKnowhow !== false, // 未設定はON扱い
            result: null,
          };
        }
        try {
          const parsed = JSON.parse(raw);
          return {
            counseledAt: parsed?.counseledAt ?? null,
            useThreadsKnowhow: useThreadsKnowhow !== false,
            result: parsed,
          };
        } catch {
          return {
            counseledAt: null,
            useThreadsKnowhow: useThreadsKnowhow !== false,
            result: null,
          };
        }
      }),

    // ── AIカウンセリング: 一括保存 ─────────────────────────────────────
    // 質問1〜8の生回答をまとめて受け取り、サーバ側で構造化して保存する。
    // useThreadsKnowhow フラグも一緒に projects テーブルに反映する。
    saveCounseling: protectedProcedure
      .input(z.object({
        projectId: z.string(),
        answers: z.object({
          brandVoiceRaw: z.string().default(''),
          uspRaw: z.string().default(''),
          realProofsRaw: z.string().default(''),
          realEpisodesRaw: z.string().default(''),
          ctaAssetsRaw: z.string().default(''),
          ngListRaw: z.string().default(''),
          preferredTypesRaw: z.string().default(''),
          useThreadsKnowhow: z.enum(['on', 'off']).default('on'),
        }),
      }))
      .mutation(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
        }
        const { buildCounselingResult } = await import('../shared/counseling');
        const result = buildCounselingResult(input.answers);

        // USP / N1 が未設定なら、カウンセリングの内容で埋める（ユーザの手間削減）。
        const updatePatch: any = {
          counselingResult: JSON.stringify(result),
          useThreadsKnowhow: result.useThreadsKnowhow,
        };
        if (!project.usp && input.answers.uspRaw.trim()) {
          updatePatch.usp = input.answers.uspRaw.trim();
        }
        if (!project.n1Customer && result.realEpisodes.length > 0) {
          updatePatch.n1Customer = result.realEpisodes.join('\n');
        }
        if (!project.proof && result.realProofs.length > 0) {
          updatePatch.proof = result.realProofs.join('\n');
        }

        await db.updateProject(input.projectId, updatePatch);
        return { success: true, result };
      }),

    // ── AIカウンセリング: ノウハウ使用フラグだけ後から切り替える ────────
    setUseThreadsKnowhow: protectedProcedure
      .input(z.object({
        projectId: z.string(),
        useThreadsKnowhow: z.boolean(),
      }))
      .mutation(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
        }
        await db.updateProject(input.projectId, {
          useThreadsKnowhow: input.useThreadsKnowhow,
        } as any);
        return { success: true };
      }),

    // ── スタイル校正: サンプル投稿を6パターン返す ────────────────────
    // LLM 呼び出しなし。テンプレート集 (shared/styleSamples.ts) の
    // tone 別バリエーションからランダムに 6 個ピックして、プロジェクト固有の
    // businessType / area / target / mainProblem を差し込んで返す。
    generateStyleSamples: protectedProcedure
      .input(z.object({ projectId: z.string() }))
      .query(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
        }
        const { generateStyleSamples } = await import('../shared/styleSamples');
        const samples = generateStyleSamples({
          businessType: project.businessType ?? null,
          area: project.area ?? null,
          target: project.target ?? null,
          mainProblem: project.mainProblem ?? null,
          strength: project.strength ?? null,
        }, 6);
        return { samples };
      }),

    // ── スタイル校正: ユーザが選んだサンプルから好みを抽出して保存 ──────
    saveStylePreference: protectedProcedure
      .input(z.object({
        projectId: z.string(),
        selectedStyleIds: z.array(z.string()).min(1).max(6),
      }))
      .mutation(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
        }
        const { buildStylePreferenceFromSelection } = await import('../shared/styleSamples');
        const profile = buildStylePreferenceFromSelection(input.selectedStyleIds);
        if (!profile) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'サンプルが見つかりませんでした' });
        }
        await db.updateProject(input.projectId, {
          stylePreference: JSON.stringify(profile),
        } as any);
        return { success: true, profile };
      }),

    // ── スタイル校正: 現在の好みプロファイルを取得 ──────────────────
    getStylePreference: protectedProcedure
      .input(z.object({ projectId: z.string() }))
      .query(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
        }
        const raw = (project as any).stylePreference as string | null | undefined;
        if (!raw) return { profile: null };
        try {
          return { profile: JSON.parse(raw) };
        } catch {
          return { profile: null };
        }
      }),

    // Generate AI post
    generatePost: protectedProcedure
      .input(z.object({
        projectId: z.string(),
        postType: z.enum(['hook_tree', 'expertise', 'local', 'proof', 'empathy', 'story', 'list', 'offer', 'enemy', 'qa', 'trend', 'aruaru', 'pinned']).optional(),
        treeCount: z.number().min(0).max(5).optional(), // 0 = 本文のみ, 1〜5 = ツリー投稿数
        trendWord: z.string().optional(), // トレンドワード（trend型で使用）
        purpose: z.enum(['cv', 'awareness', 'authority', 'fan']).optional(), // 投稿の目的
        tone: z.enum(['polite', 'casual', 'professional', 'energetic', 'storytelling']).optional(), // 口調
      }))
      .mutation(async ({ ctx, input }) => {
        // Check AI generation feature
        const subscription = await db.getSubscriptionByUserId(ctx.user.id);
        const planId = subscription?.planId || 'free';
        const plan = getPlan(planId);
        
        // デモモードではAI生成を許可
        // ★#2 デモモードの場合は 10 回までで打ち切り → 自動的に通常判定へ。
        //   バイパス不能の収益保護ルール。
        let effectiveDemo = ctx.user.isDemoMode;
        if (effectiveDemo) {
          const demo = await db.checkAndEnforceDemoCap(ctx.user.id, true);
          if (!demo.allowed) {
            // デモ枠終了。以降は通常プラン判定へ移行
            effectiveDemo = false;
          }
        }
        if (!effectiveDemo && (!plan || plan.features.maxAiGenerations === 0)) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'デモ枠（10回）を使い切りました。続けてご利用には有料プランへのアップグレードが必要です。'
          });
        }

        // Check AI generation limit (skip for demo mode within cap)
        const canGenerate = effectiveDemo || await db.checkAiGenerationLimit(ctx.user.id);
        if (!canGenerate) {
          const { count, limit } = await db.getAiGenerationUsage(ctx.user.id);
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: `${limit === -1 ? `今月のAI生成回数のハードキャップ（${db.HARD_AI_GEN_CAP_PER_MONTH}回）に達しました。利用が異常に多い場合はサポートまでご連絡ください。` : `今月のAI生成回数の上限（${limit}回）に達しました。プロプラン以上にアップグレードすると無制限でご利用いただけます。`}`
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
        const { parseProjectLinks } = await import('../shared/projectLinks');
        const { parseNgWords } = await import('../shared/ngwords');
        const projectLinks = parseProjectLinks((project as any).links || null);
        const ngWords = parseNgWords((project as any).ngWords || null);

        // カウンセリング結果（あれば）と Threadsノウハウ使用フラグを取得
        let counselingResult: any = null;
        const counselingRaw = (project as any).counselingResult as string | null | undefined;
        if (counselingRaw) {
          try { counselingResult = JSON.parse(counselingRaw); } catch {}
        }
        const useThreadsKnowhow = (project as any).useThreadsKnowhow !== false;

        // スタイル校正結果（あれば）— ユーザがサンプル投稿で選んだ好みの口調
        let stylePreference: any = null;
        const styleRaw = (project as any).stylePreference as string | null | undefined;
        if (styleRaw) {
          try { stylePreference = JSON.parse(styleRaw); } catch {}
        }

        const prompt = generateThreadsPrompt({
          storeName: (project as any).storeName || undefined,
          businessType: project.businessType,
          area: project.area,
          target: project.target,
          mainProblem: project.mainProblem,
          strength: project.strength,
          proof: project.proof || undefined,
          link: project.ctaLink || undefined,
          links: projectLinks.map(l => ({ type: l.type, label: l.label, url: l.url })),
          postType: input.postType,
          treeCount: input.treeCount,
          usp: (project as any).usp || undefined,
          n1Customer: (project as any).n1Customer || undefined,
          belief: (project as any).belief || undefined,
          catchphrase: (project as any).catchphrase || undefined,
          customerWords: (project as any).customerWords || undefined,
          trendWord: input.trendWord || undefined,
          purpose: input.purpose,
          tone: input.tone,
          counseling: counselingResult,
          useThreadsKnowhow,
          stylePreference,
          ngWords,
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

        const rawResult = JSON.parse(content);
        // ★NGワードを「自然な文章のまま」除外（違反時のみAI書き換え→最終手段で確定削除）
        const { enforceNgWords } = await import('./ngwordGuard');
        const result = await enforceNgWords(rawResult, ngWords);

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

    // Has the user generated their 固定投稿 (pinned profile post) yet?
    // Used by the dashboard to surface a "create your pinned post first"
    // recommendation banner when this returns false.
    hasPinnedPost: protectedProcedure
      .query(async ({ ctx }) => {
        const has = await db.hasGeneratedPinnedPost(ctx.user.id);
        return { hasPinnedPost: has };
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
            message: `${limit === -1 ? `今月のAI生成回数のハードキャップ（${db.HARD_AI_GEN_CAP_PER_MONTH}回）に達しました。利用が異常に多い場合はサポートまでご連絡ください。` : `今月のAI生成回数の上限（${limit}回）に達しました。プロプラン以上にアップグレードすると無制限でご利用いただけます。`}`
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

        // 量産時もカウンセリング結果（あれば）を尊重して捏造を防ぐ
        let counselingForClone: any = null;
        let cloneNgWords: string[] = [];
        if (history.projectId) {
          const cloneProject = await db.getProjectById(history.projectId);
          if (cloneProject?.userId === ctx.user.id) {
            const raw = (cloneProject as any).counselingResult as string | null | undefined;
            if (raw) {
              try { counselingForClone = JSON.parse(raw); } catch {}
            }
            const { parseNgWords } = await import('../shared/ngwords');
            cloneNgWords = parseNgWords((cloneProject as any).ngWords || null);
          }
        }
        const cloneNgList = (counselingForClone?.ngList ?? []) as string[];
        const cloneRealProofs = (counselingForClone?.realProofs ?? []) as string[];
        const cloneRealEpisodes = (counselingForClone?.realEpisodes ?? []) as string[];
        const cloneCtaAssets = (counselingForClone?.ctaAssets ?? []) as string[];

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
${counselingForClone ? `
【★このユーザーのカウンセリング結果★（最優先）】
${cloneRealProofs.length > 0
  ? `- 使ってよい実績数字（このリスト以外は捏造禁止）:\n${cloneRealProofs.map(p => `    ・${p}`).join('\n')}`
  : '- 実績数字: ユーザー本人から「数字なし」と回答あり → 数字は出さない'}
${cloneRealEpisodes.length > 0
  ? `- 使ってよい顧客エピソード（このリスト以外は架空エピソード禁止）:\n${cloneRealEpisodes.map(e => `    ・${e}`).join('\n')}`
  : '- 顧客エピソード: 「実例なし」と回答あり → 物語型エピソードを作らない'}
${cloneCtaAssets.length > 0
  ? `- CTA特典:\n${cloneCtaAssets.map(c => `    ・${c}`).join('\n')}`
  : '- CTA特典: なし → 「LINEで気軽に相談」止まり'}
${cloneNgList.length > 0
  ? `- 絶対NGリスト（例外なく禁止）:\n${cloneNgList.map(n => `    ・${n}`).join('\n')}`
  : ''}
` : ''}
【最重要：事実ベースルール】
- **元の投稿または店舗情報・カウンセリング結果に書かれていない事実（数字・実績・年数・キャンセル待ち・予約状況・割引・料金・顧客エピソード・本人の発言）は絶対に作らない**。
- バリエーションを増やすために具体性を盛りたくなっても、入力にない数字・体験談を捏造してはいけない。具体例を変える場合も、店舗情報の \`強み\` の範囲内で書ける一般表現に置き換える。
- 元の投稿に登場した数字や事例は使ってよい（同じ事業者の同じ事実を別表現で書く）。

${cloneNgWords.length > 0 ? `
【★最優先・絶対禁止ワード（ユーザー指定）】
次の語句は全バリエーションのタイトル・本文・ツリー・CTAのどこにも絶対に使わないこと：
${cloneNgWords.map((w) => `    ・「${w}」`).join('\n')}
` : ''}
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

        // ★NGワードを各バリエーションから自然な形で除外（違反時のみ書き換え→最終手段で削除）
        const { enforceNgWords } = await import('./ngwordGuard');
        const filteredVariations = Array.isArray(result.variations)
          ? await Promise.all(result.variations.map((v: any) => enforceNgWords(v, cloneNgWords)))
          : result.variations;

        // Increment AI generation usage count
        await db.incrementAiGenerationUsage(ctx.user.id);

        return { variations: filteredVariations, originalTitle: originalContent.title };
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
        // 投稿の狙い（任意）。指定するとAIがその目的に最適化して生成する。
        purpose: z.enum(['cv', 'awareness', 'authority', 'fan']).optional(),
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
            message: '無料お試しの上限に達しました。続けてご利用いただくには無料登録してください。',
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
          purpose: input.purpose, // 投稿の狙い（任意）
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
    // Pass `forceReauth: true` when the user wants to connect a different
    // Threads account than the one currently active in their Threads.com
    // session — this adds `auth_type=reauthenticate` to the OAuth URL so
    // Threads forces a fresh login instead of silently reusing the session.
    getAuthUrl: protectedProcedure
      .input(
        z
          .object({
            forceReauth: z.boolean().optional(),
          })
          .optional(),
      )
      .query(async ({ ctx, input }) => {
        const { getThreadsAuthUrl } = await import("./threadsAuth");
        // Use THREADS_REDIRECT_BASE_URL if set (must match Meta Developer Portal callback URL)
        // Otherwise fall back to origin header for dynamic detection
        const origin = ENV.threadsRedirectBaseUrl
          || ctx.req.headers.origin
          || `${ctx.req.headers['x-forwarded-proto'] || ctx.req.protocol}://${ctx.req.headers['x-forwarded-host'] || ctx.req.get('host')}`;
        // Use frontend route /threads-connect directly as redirect_uri
        // This avoids dependency on /api/threads/callback server route which may not work in production
        const redirectUri = `${origin}/threads-connect`;
        console.log('[Threads OAuth] Generated redirect_uri:', redirectUri, 'forceReauth:', input?.forceReauth);
        return {
          authUrl: getThreadsAuthUrl(
            { redirectUri },
            { forceReauth: input?.forceReauth },
          ),
        };
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
        const { createAndPublishPost, createAndPublishThread, splitThreadSegments } = await import("./threadsPost");
        
        // Check monthly post limit
        const subscription = await db.getSubscriptionByUserId(ctx.user.id);
        const planId = subscription?.planId || 'free';
        const plan = getPlan(planId);
        
        // 月間上限は「連携アカウント単位」で適用（複数アカウントで枠を共有しない）
        if (plan && plan.features.maxScheduledPosts !== -1) {
          const monthlyCount = await db.countAccountMonthlyPosts(input.accountId);
          if (monthlyCount >= plan.features.maxScheduledPosts) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: `このアカウントの月間投稿数の上限（${plan.features.maxScheduledPosts}件）に達しています。来月1日にリセットされます。`
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
          // テキストは区切りがあれば返信チェーン（ツリー）として連続投稿。
          // 画像/動画は単一投稿で扱う。
          const isMedia = input.mediaType && input.mediaType !== 'TEXT';
          const segments = isMedia ? [] : splitThreadSegments(input.text);
          const result = (!isMedia && segments.length > 1)
            ? await createAndPublishThread(
                { accessToken: account.accessToken, threadsUserId: account.threadsUserId },
                segments,
              )
            : await createAndPublishPost({
                accessToken: account.accessToken,
                threadsUserId: account.threadsUserId,
                text: isMedia ? input.text : (segments[0] ?? input.text),
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
            message: `投稿に失敗しました: ${toPublicErrorMessage(error)}` 
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
            message: `レート制限の確認に失敗しました: ${toPublicErrorMessage(error)}` 
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
            message: `プロフィールの同期に失敗しました: ${toPublicErrorMessage(error)}` 
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
            message: `コメントの取得に失敗しました: ${toPublicErrorMessage(error)}`
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
            message: `返信の投稿に失敗しました: ${toPublicErrorMessage(error)}`
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
        
        // 予約中の件数・月間投稿数の上限は「連携アカウント単位」で適用
        if (plan && plan.features.maxScheduledPosts !== -1) {
          const count = await db.countAccountScheduledPosts(input.threadsAccountId);
          if (count >= plan.features.maxScheduledPosts) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: `このアカウントの予約投稿数の上限（${plan.features.maxScheduledPosts}件）に達しています。`
            });
          }
          const monthlyCount = await db.countAccountMonthlyPosts(input.threadsAccountId);
          if (monthlyCount >= plan.features.maxScheduledPosts) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: `このアカウントの月間投稿数の上限（${plan.features.maxScheduledPosts}件）に達しています。来月1日にリセットされます。`
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

    // Permanently remove a scheduled post from history. Allowed for any
    // status the current user owns. For pending posts this also stops the
    // cron worker from posting them, since the row is gone.
    remove: protectedProcedure
      .input(z.object({ postId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const post = await db.getScheduledPostById(input.postId);
        if (!post || post.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Post not found' });
        }
        await db.deleteScheduledPost(input.postId);
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
        // 互換のため受け取るが、Univapayは将来予約の金額切替を持たないため常に即時変更。
        changeTiming: z.enum(['immediate', 'next_period']).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const subscription = await db.getSubscriptionByUserId(ctx.user.id);
        const currentPlanId = subscription?.planId || 'free';

        if (currentPlanId === 'free') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: '無料プランからの変更は、料金プランから新規にお申し込みください。',
          });
        }

        if (!subscription?.univapaySubscriptionId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'アクティブなサブスクリプションが見つかりません。',
          });
        }

        if (currentPlanId === input.newPlanId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: '現在と同じプランには変更できません。',
          });
        }

        const currentPlan = getPlan(currentPlanId);
        const newPlan = getPlan(input.newPlanId);

        if (!currentPlan || !newPlan) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'プラン情報が見つかりません。',
          });
        }

        // キャンペーンプラン（回数制限付き定期課金）はUnivapay仕様上、
        // 金額のAPI変更ができない。変更元・変更先のどちらかがキャンペーンなら、
        // 一旦解約 → 希望プランに新規申込、という運用にする（サポート案内）。
        if (currentPlan.isCampaign || newPlan.isCampaign) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'キャンペーンプランからの変更・キャンペーンプランへの変更は、現在のプランを解約のうえ、料金プランから希望プランに新規お申し込みください。',
          });
        }

        // 通常プラン同士の変更のみ。Univapayの定期課金金額を即時更新する。
        const univapayService = await import('./univapay');
        await univapayService.updateSubscription(subscription.univapaySubscriptionId, input.newPlanId);

        await db.updateSubscription(subscription.id, {
          planId: input.newPlanId,
        });

        return {
          success: true,
          changeTiming: 'immediate' as const,
          message: 'プランを変更しました。次回のお支払いから新しいプランの金額が適用されます。',
        };
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
        type: z.enum(['forever_free', 'trial_30', 'trial_14', 'discount_50', 'discount_30', 'special_price', 'monitor', 'monitor_only']),
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
        type: z.enum(['forever_free', 'trial_30', 'trial_14', 'discount_50', 'discount_30', 'special_price', 'monitor', 'monitor_only']).optional(),
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

    // モニターフラグの ON/OFF（DB/SSH不要で運営者が切替できるように）
    setUserMonitor: adminProcedure
      .input(z.object({ userId: z.number(), isMonitor: z.boolean() }))
      .mutation(async ({ input }) => {
        await db.setUserMonitor(input.userId, input.isMonitor);
        return { success: true };
      }),

    // ──────── 決済失敗ユーザー一覧（管理者用）────────
    // status が past_due / unpaid / incomplete のサブスクとそのユーザを返す。
    // 管理者が「いま誰が困っているか」を一覧で把握するための画面。
    listPaymentIssues: adminProcedure.query(async () => {
      const subs = await db.getSubscriptionsWithPaymentIssues();
      const result = await Promise.all(
        subs.map(async (s) => {
          const u = await db.getUserById(s.userId);
          return {
            subscriptionId: s.id,
            userId: s.userId,
            userEmail: u?.email ?? null,
            userName: u?.name ?? null,
            planId: s.planId,
            status: s.status,
            currentPeriodEnd: s.currentPeriodEnd,
            cancelAtPeriodEnd: s.cancelAtPeriodEnd,
            updatedAt: s.updatedAt,
            stripeSubscriptionId: s.stripeSubscriptionId,
          };
        }),
      );
      // updatedAt 降順（最近の失敗から表示）
      result.sort((a, b) =>
        (b.updatedAt?.getTime?.() ?? 0) - (a.updatedAt?.getTime?.() ?? 0),
      );
      return { items: result, total: result.length };
    }),

    // 管理者が任意のユーザに「決済失敗リマインダー」を再送する
    resendPaymentFailureEmail: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ input }) => {
        const user = await db.getUserById(input.userId);
        const sub = await db.getSubscriptionByUserId(input.userId);
        if (!user?.email) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'ユーザーまたはメールアドレスが見つかりません' });
        }
        if (!sub) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'サブスクリプションが見つかりません' });
        }
        const { sendPaymentFailedEmail } = await import('./_core/notification');
        const { getPlan } = await import('../shared/plans');
        const plan = getPlan(sub.planId);
        await sendPaymentFailedEmail(
          user.email,
          plan?.name ?? sub.planId,
          null,
          1, // 手動再送なので 1 回目扱い（強い文言は出さない）
          null,
        );
        return { success: true };
      }),

    // Reset user password (admin only)
    resetUserPassword: adminProcedure
      .input(z.object({
        userId: z.number(),
        newPassword: z.string().min(10),
      }))
      .mutation(async ({ input }) => {
        const { hashPassword, isValidPassword } = await import('./auth-helpers');
        
        // Validate password
        if (!isValidPassword(input.newPassword)) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'パスワードは10文字以上で、英字・数字・記号のうち2種類以上を含む必要があります。' 
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
        newPassword: z.string().min(10),
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
    // ★#15 OAuth ユーザもパスワード代わりに「メールアドレスの完全一致」で確認できる
    // ★#16 削除後は cookie をクリアしてゾンビセッションを残さない
    // ★#19 有料プラン契約中の場合は事前に解約必須（Univapay側の課金継続事故を防ぐ）
    deleteAccount: protectedProcedure
      .input(z.object({
        // パスワード（email 認証ユーザのみ） or 自分のメアド（OAuth ユーザ）の確認
        password: z.string().optional(),
        emailConfirmation: z.string().optional(),
        confirmation: z.literal("DELETE"),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user) {
          throw new TRPCError({ code: "NOT_FOUND", message: "ユーザーが見つかりません" });
        }

        // 認証方法ごとに確認手段を分岐
        if (user.authProvider === 'email') {
          if (!user.passwordHash || !input.password) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "削除にはパスワードの入力が必要です",
            });
          }
          const isValid = await bcrypt.compare(input.password, user.passwordHash);
          if (!isValid) {
            throw new TRPCError({ code: "UNAUTHORIZED", message: "パスワードが正しくありません" });
          }
        } else {
          // OAuth ユーザはメアド完全一致で確認
          if (!input.emailConfirmation || input.emailConfirmation.trim().toLowerCase() !== (user.email ?? '').trim().toLowerCase()) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "確認のためご自身のメールアドレスを入力してください",
            });
          }
        }

        // Univapayの定期課金は、アプリ側のアカウント削除では止められない仕様。
        // 有料プラン契約中のユーザーが誤って削除すると、課金が継続してしまうため、
        // 削除を拒否してサポート経由での解約を案内する。
        const subscription = await db.getSubscriptionByUserId(ctx.user.id);
        if (subscription && subscription.planId !== 'free' && subscription.status === 'active') {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "有料プランの契約中はアカウントを削除できません。" +
              "課金継続を防ぐため、先にサポートまで解約をお申し込みください。",
          });
        }

        // Delete user (cascades to all related data)
        await db.deleteUser(ctx.user.id);

        // ★#16 セッション cookie をクリア。
        try {
          ctx.res.clearCookie(COOKIE_NAME, { path: '/' });
        } catch {
          // res.clearCookie は失敗しないが念のため try-catch
        }

        return { success: true };
      }),
  }),

});

export type AppRouter = typeof appRouter;
