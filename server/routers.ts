import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { normalizeEmail, normalizeCouponCode } from "@shared/inputNormalize";
import { toPublicErrorMessage, stripRawUrls } from "../shared/sanitize";
import { CONCEPT_DESIGN_PROMPT } from "../shared/conceptDesign";
import { z } from "zod";
import * as db from "./db";
import { ENV } from "./_core/env";
import bcrypt from "bcryptjs";
import * as couponService from "./coupon";
import { PLANS, TRIAL_DAYS, getPlan, resolveEffectivePlanId } from "../shared/plans";
import { TRPCError } from "@trpc/server";
import { approvedLocalTerms } from './localGeo';
import { buildShowcase, MIN_IMPRESSIONS } from './showcase';

// ── アカウント切替用の共通部品 ─────────────────────────────
// ヘッダーの切替UIで選んだ連携アカウントに、各画面のデータを絞るための入力。
// 未指定（nullish）は従来どおり全アカウント合算。
const accountFilterInput = z.object({ accountId: z.number().nullish() }).optional();

/** accountId が本人の連携アカウントであることを確認して返す（IDOR対策）。未指定は undefined。 */
async function resolveOwnedAccountId(
  userId: number,
  accountId: number | null | undefined,
): Promise<number | undefined> {
  if (accountId == null) return undefined;
  const account = await db.getThreadsAccountById(accountId);
  if (!account || account.userId !== userId) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'アカウントが見つかりません。' });
  }
  return accountId;
}

// Global rate limit store for tryGenerate
declare global {
  var __tryGenerateRateLimit: Map<string, number[]> | undefined;
  var __pwResetRateLimit: Map<string, number[]> | undefined;
  var __loginAttempts: Map<string, { count: number; lockedUntil: number }> | undefined;
}

export const appRouter = router({
  system: systemRouter,

  /**
   * 実例ショーケース（公開・ログイン不要）。
   *
   * /tour に「実際に反応が取れた投稿」を出すためのデータ。
   * 本番で配信され数字が出た投稿だけを、店が特定できない形に伏せて返す。
   * 新しく伸びた投稿が出れば自動で入れ替わるので、紹介ページを書き直す必要がない。
   *
   * 掲載を拒否したユーザー（users.showcaseOptOut）の投稿は showcase.ts 側で除外する。
   */
  showcase: router({
    list: publicProcedure.query(async () => {
      const rows = await db.getShowcaseCandidates();
      return { items: buildShowcase(rows), minImpressions: MIN_IMPRESSIONS };
    }),
  }),
  
  // ── お客様サポート（自動応答とよくある質問）─────────────────
  support: router({
    /** よくある質問に掲載中のQ&A（ログイン不要で表示する） */
    publishedFaq: publicProcedure.query(async () => {
      const rows = await db.listPublishedFaqQuestions();
      return rows.map((r: any) => ({
        id: r.id,
        question: r.faqQuestion,
        answer: r.faqAnswer,
        category: r.category || 'その他',
      }));
    }),

    /**
     * 設定の工程一覧。
     * ★アプリのチェックリストは、必ずこれを表示すること。
     *   画面側で条件を書き直すと、LINE・メールの案内とすぐ食い違う。
     */
    setupSteps: protectedProcedure.query(async ({ ctx }) => {
      const { getSetupSteps } = await import('./nextAction');
      const steps = await getSetupSteps(ctx.user.id);
      const done = steps.filter((s) => s.done).length;
      return {
        steps,
        done,
        total: steps.length,
        percent: steps.length === 0 ? 100 : Math.round((done / steps.length) * 100),
        next: steps.find((s) => !s.done) ?? null,
      };
    }),

    /** 「Threadsでピン留めしました」を記録する（APIでは確認できないため申告制） */
    confirmPinned: protectedProcedure.mutation(async ({ ctx }) => {
      await db.confirmPinnedPost(ctx.user.id);
      return { success: true } as const;
    }),

    /** アプリの画面からご質問いただく（自動でお答えし、記録する） */
    ask: protectedProcedure
      .input(z.object({ question: z.string().min(3).max(1000) }))
      .mutation(async ({ ctx, input }) => {
        const { answerQuestion } = await import('./supportBot');
        const res = await answerQuestion({
          question: input.question,
          userId: ctx.user.id,
          source: 'web',
        });
        return {
          answer: res.confident ? res.answer : '',
          confident: res.confident,
          questionId: res.questionId ?? null,
        };
      }),

    /** アプリの画面から担当者におつなぎする */
    contactStaff: protectedProcedure
      .input(z.object({ message: z.string().min(3).max(2000), questionId: z.number().optional() }))
      .mutation(async ({ ctx, input }) => {
        let qid = input.questionId;
        if (qid) {
          await db.updateSupportQuestion(qid, { needsHuman: 1 });
        } else {
          qid = await db.createSupportQuestion({
            userId: ctx.user.id, source: 'web', question: input.message, needsHuman: 1, category: 'その他',
          });
        }
        const { notifyStaffOfQuestion } = await import('./supportNotify');
        await notifyStaffOfQuestion({
          questionId: qid,
          userName: ctx.user.name ?? null,
          userEmail: (ctx.user as any).email ?? null,
          message: input.message,
        });
        return { success: true } as const;
      }),
  }),

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
        // 全角の英数字・＠や、コピー時に付いた前後の空白で弾かれないよう、
        // 検証の前に整形する（お客様には原因が分からないため）
        email: z.preprocess(
          (v) => (typeof v === 'string' ? normalizeEmail(v) : v),
          z.string().email(),
        ),
        password: z.string().min(10),
        name: z.string().min(1, '名前を入力してください'),
        storeName: z.string().max(255).optional(), // 店舗名・屋号（任意）
        couponCode: z.preprocess(
          (v) => (typeof v === 'string' ? normalizeCouponCode(v) : v),
          z.string().optional(),
        ),
        // #28 紹介コード（/register?ref=XXX から取得）
        referralCode: z.string().trim().min(1).max(16).optional(),
        // ★規約同意（後日の紛争に備えて記録する。false では登録できない）
        agreedToTerms: z.boolean(),
        termsVersion: z.string().max(20).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { hashPassword, isValidEmail, isValidPassword } = await import('./auth-helpers');

        // ★規約への同意は必須（画面のチェックだけに頼らずサーバーでも止める）
        if (!input.agreedToTerms) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: '利用規約・プライバシーポリシー・特定商取引法に基づく表記への同意が必要です。',
          });
        }

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
        const user = await db.createEmailUser(input.email, passwordHash, input.name, input.storeName?.trim() || undefined);
        if (!user) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'ユーザーの作成に失敗しました。' });
        }

        // ★規約同意の記録（誰が・いつ・どの版に・どの端末から）
        try {
          const { LEGAL_VERSION } = await import('../shared/legalVersion');
          const ipRaw = ctx.req.ip || ctx.req.headers['x-forwarded-for'] || '';
          const ip = String(Array.isArray(ipRaw) ? ipRaw[0] : ipRaw).slice(0, 64);
          const ua = String(ctx.req.headers['user-agent'] || '').slice(0, 255);
          await db.recordTermsAgreement(user.id, {
            version: input.termsVersion || LEGAL_VERSION,
            ip,
            userAgent: ua,
          });
        } catch (e) {
          console.error('[Register] 規約同意の記録に失敗:', e);
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
        // 全角の英数字・＠や、コピー時に付いた前後の空白で弾かれないよう、
        // 検証の前に整形する（お客様には原因が分からないため）
        email: z.preprocess(
          (v) => (typeof v === 'string' ? normalizeEmail(v) : v),
          z.string().email(),
        ),
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
        // ★永続Cookie（maxAge付き）にして、ブラウザ/アプリを閉じても
        //   ログイン状態を保持する。OAuthログイン(oauth.ts)と同じ1年間に揃える。
        //   これが無いとセッションCookie扱いになり、ブラウザ終了で毎回ログインが必要になる。
        ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });

        return { success: true, user: { id: user.id, email: user.email, name: user.name } };
      }),

    // Request Password Reset
    requestPasswordReset: publicProcedure
      .input(z.object({
        // 全角の英数字・＠や、コピー時に付いた前後の空白で弾かれないよう、
        // 検証の前に整形する（お客様には原因が分からないため）
        email: z.preprocess(
          (v) => (typeof v === 'string' ? normalizeEmail(v) : v),
          z.string().email(),
        ),
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
          'https://threads-studio.com';
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

    // 認証メールの再送（メール未着・紛失時の救済）。
    // メアド列挙を防ぐため、存在有無に関わらず常に同じ成功レスポンスを返す。
    resendVerification: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ input }) => {
        const GENERIC = { success: true } as const;
        try {
          const user = await db.getUserByEmail(input.email);
          // 対象外（未登録／メール認証以外／既に認証済み）は黙って成功扱い。
          if (!user || user.authProvider !== 'email' || user.emailVerified) {
            return GENERIC;
          }
          // 作成から7日を超えていると検証リンク自体が期限切れになるため再送しない。
          const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
          if (user.createdAt && Date.now() - new Date(user.createdAt).getTime() > TOKEN_TTL_MS) {
            return GENERIC;
          }
          const { generateToken } = await import('./auth-helpers');
          const verificationToken = generateToken(32);
          await db.updateEmailVerificationToken(user.id, verificationToken);
          const { sendVerificationEmail } = await import('./_core/notification');
          const baseUrl =
            process.env.APP_BASE_URL || process.env.VITE_APP_URL || 'https://threads-studio.com';
          if (user.email) {
            await sendVerificationEmail(user.email, verificationToken, baseUrl);
          }
        } catch (e) {
          console.warn('[resendVerification] failed:', e);
        }
        return GENERIC;
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
          // 決済失敗フォロー用（未契約なので常に無し）
          isPaymentPastDue: false,
          failedPaymentCount: 0,
          reRegisterUrl: null as string | null,
          contractPlanName: null as string | null,
        };
      }

      // ★機能ゲートは実効プラン（active/trialing以外はfree）で判定する。
      //   表示用の planId は実際の契約プランを返すが、plan.features は実効プランに合わせる
      //   ことで、解約/決済失敗後に有料機能が使える課金漏れを防ぐ。
      const effPlanId = resolveEffectivePlanId(subscription.planId, subscription.status);
      const plan = getPlan(effPlanId);

      // ★決済失敗フォロー：past_due/unpaid のときはバナー表示と
      //   「カード再登録」リンクを返す。再登録先は契約プラン（実効プランは
      //   free になるため subscription.planId から解決）の Univapay リンク。
      const isPaymentPastDue = subscription.status === 'past_due' || subscription.status === 'unpaid';
      const contractPlan = getPlan(subscription.planId);

      return {
        planId: subscription.planId,
        plan: plan || PLANS.free,
        status: subscription.status,
        isTrialing: subscription.status === 'trialing',
        trialEndsAt: subscription.trialEndsAt,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        // 決済失敗フォロー用
        isPaymentPastDue,
        failedPaymentCount: subscription.failedPaymentCount ?? 0,
        reRegisterUrl: isPaymentPastDue ? (contractPlan?.univapayLinkUrl ?? null) : null,
        contractPlanName: isPaymentPastDue ? (contractPlan?.name ?? null) : null,
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

    // 解約時アンケート（解約処理の前に呼ぶ。保存＋運営へ通知）
    submitCancellationFeedback: protectedProcedure
      .input(z.object({
        reason: z.enum(['price', 'no_effect', 'hard_to_use', 'pause', 'other']),
        detail: z.string().max(1000).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const subscription = await db.getSubscriptionByUserId(ctx.user.id);
        await db.createCancellationFeedback({
          userId: ctx.user.id,
          planId: subscription?.planId ?? null,
          reason: input.reason,
          detail: input.detail?.trim() || null,
        });
        const reasonLabel: Record<string, string> = {
          price: '料金が高い',
          no_effect: '効果を感じられなかった',
          hard_to_use: '使い方が難しい',
          pause: '一時的に休止したい',
          other: 'その他',
        };
        try {
          const { notifyOwner } = await import('./_core/notification');
          await notifyOwner({
            title: `📝 解約アンケート: ${ctx.user.name ?? ctx.user.email}`,
            content:
              `顧客: ${ctx.user.name ?? '(名前未設定)'} <${ctx.user.email ?? '不明'}>\n` +
              `プラン: ${subscription?.planId ?? '不明'}\n` +
              `理由: ${reasonLabel[input.reason] ?? input.reason}\n` +
              (input.detail?.trim() ? `詳細: ${input.detail.trim()}\n` : '') +
              `\n※ このあと解約処理が実行されます。フォローで引き止められる可能性があれば早めのご連絡を。`,
          });
        } catch (e) { console.error('[cancelFeedback] 通知失敗:', e); }
        return { success: true };
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
        localTerms: z.string().optional(), // 地元の呼び方（最寄り駅・通称・ランドマーク）改行区切り
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
        styleSamples: z.string().optional(), // 過去の良かった投稿（文体模倣のお手本）
        ngWords: z.string().optional(), // 投稿に入れたくないワード（改行/カンマ区切り）
      }))
      .mutation(async ({ ctx, input }) => {
        // Check project limit
        const subscription = await db.getSubscriptionByUserId(ctx.user.id);
        const planId = resolveEffectivePlanId(subscription?.planId, subscription?.status);
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
        localTerms: z.string().optional(), // 地元の呼び方（最寄り駅・通称・ランドマーク）改行区切り
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
        styleSamples: z.string().optional(), // 過去の良かった投稿（文体模倣のお手本）
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

    // ── 地元の呼び方の候補を「実在の地図データ」から取得（最寄り駅・町名・ランドマーク）──
    // OpenStreetMap（Nominatim+Overpass）の実データのみを返す。LLMの推測は使わない
    // （存在しない施設の捏造＝ハルシネーションを防ぐため）。
    // 取得した候補は最終的にユーザー本人が選択・編集して確定する前提。
    /**
     * 商圏の提案：まだ本人が確認していない店舗について、
     * 「この商圏で運用してよいか」をアプリから提案するための情報を返す。
     * 商圏を書く意味がない業種（Web制作等）は提案しない。
     */
    localAreaProposal: protectedProcedure
      .input(z.object({ projectId: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        const project: any = await db.getProjectById(input.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
        }
        const { isLocalCatchmentBusiness } = await import('../shared/businessScope');
        if (!isLocalCatchmentBusiness(project.businessType)) {
          return { needed: false as const, reason: 'not_local_business' as const };
        }
        if (project.localTermsConfirmedAt) {
          return { needed: false as const, reason: 'already_confirmed' as const };
        }
        // 既に自動取得済みならそれを提案。無ければ地図から取りに行く。
        let terms: string[] = String(project.localTerms || '')
          .split(/\r?\n/).map((t: string) => t.trim()).filter(Boolean);
        if (terms.length === 0 && project.area) {
          try {
            const { fetchLocalTerms } = await import('./localGeo');
            const r = await fetchLocalTerms(String(project.area));
            terms = [...r.nicknames.slice(0, 1), ...r.stations.slice(0, 1)];
          } catch { /* 取得失敗時は提案なし */ }
        }
        if (terms.length === 0) return { needed: false as const, reason: 'no_candidate' as const };
        return {
          needed: true as const,
          projectId: project.id,
          projectTitle: project.title ?? '',
          area: project.area ?? '',
          terms,
        };
      }),

    /**
     * 商圏の承認：本人が確認した内容で確定し、以降の投稿で使えるようにする。
     */
    confirmLocalTerms: protectedProcedure
      .input(z.object({ projectId: z.string().min(1), terms: z.array(z.string().max(120)).max(10) }))
      .mutation(async ({ ctx, input }) => {
        const project: any = await db.getProjectById(input.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
        }
        const cleaned = input.terms.map((t) => t.trim()).filter(Boolean);
        await db.updateProject(input.projectId, {
          localTerms: cleaned.join('\n'),
          localTermsConfirmedAt: new Date(),
        } as any);
        return { success: true, count: cleaned.length };
      }),

    suggestLocalTerms: protectedProcedure
      .input(z.object({
        area: z.string().min(1).max(120),
        businessType: z.string().max(100).optional(),
      }))
      .mutation(async ({ input }) => {
        try {
          const { fetchLocalTerms } = await import('./localGeo');
          return await fetchLocalTerms(input.area.trim());
        } catch (e) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '地図データの取得に失敗しました。少し時間をおいてお試しください。' });
        }
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
          isPrimary: z.boolean().optional(),
        })).max(20),
      }))
      .mutation(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
        }
        const { normaliseDefaults, setPrimaryLink } = await import('../shared/projectLinks');
        let normalised = normaliseDefaults(input.links);
        // 案内先の指定は全体で1つだけ（複数付いていたら先頭を採用）
        const primary = normalised.find((l) => l.isPrimary);
        if (primary) normalised = setPrimaryLink(normalised, primary.id);
        await db.updateProject(input.projectId, {
          links: JSON.stringify(normalised),
        });
        return { success: true, links: normalised };
      }),

    // 固定投稿ウィザードStep3の好みフィードバックを保存する
    savePinnedPostFeedback: protectedProcedure
      .input(z.object({
        projectId: z.string(),
        // 「好みでない」理由のリスト（ユーザーが選んだチップ）
        dislikes: z.array(z.string().max(50)).max(10),
      }))
      .mutation(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
        }
        const feedback = {
          dislikes: input.dislikes,
          updatedAt: new Date().toISOString(),
        };
        await db.updateProject(input.projectId, {
          pinnedPostFeedback: JSON.stringify(feedback),
        });
        return { success: true };
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
        // 'personal'=個人ブランディングモード（shared/personalBrand.ts）
        mode: z.enum(['store', 'personal']).default('store'),
        answers: z.object({
          // 基本情報（プロジェクト作成/更新に使う）
          storeNameRaw: z.string().default(''),
          businessTypeRaw: z.string().default(''),
          areaRaw: z.string().default(''),
          targetRaw: z.string().default(''),
          mainProblemRaw: z.string().default(''),
          strengthRaw: z.string().default(''),
          // 深掘り
          brandVoiceRaw: z.string().default(''),
          uspRaw: z.string().default(''),
          menuRaw: z.string().default(''),
          hoursInfoRaw: z.string().default(''),
          realProofsRaw: z.string().default(''),
          realEpisodesRaw: z.string().default(''),
          benefitsDailyRaw: z.string().default(''),
          ctaAssetsRaw: z.string().default(''),
          faqRaw: z.string().default(''),
          industryMythsRaw: z.string().default(''),
          originStoryRaw: z.string().default(''),
          ngListRaw: z.string().default(''),
          preferredTypesRaw: z.string().default(''),
          useThreadsKnowhow: z.enum(['on', 'off']).default('on'),
        }),
        /** 確認画面で書き換えた「一言でいうと」。空なら回答から下書きする */
        oneLine: z.string().max(120).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // 保存処理は server/counselingSave.ts に集約（LINEチャットでの聞き取りと同じ結果にする）
        const { saveCounselingAnswers } = await import('./counselingSave');
        const saved = await saveCounselingAnswers({
          userId: ctx.user.id,
          projectId: input.projectId,
          mode: input.mode,
          answers: input.answers as any,
          oneLine: input.oneLine ?? '',
        });
        if (!saved.ok) {
          throw new TRPCError({
            code: saved.reason === 'not_found' ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR',
            message: saved.reason === 'not_found' ? 'Project not found' : 'プロジェクトの作成に失敗しました。',
          });
        }
        const { buildCounselingResult } = await import('../shared/counseling');
        const result = buildCounselingResult(input.answers, '', input.oneLine ?? '');
        return { success: true, result, projectId: input.projectId };
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
        seasonalTopic: z.string().max(300).optional(), // 季節ネタ（今月のおすすめネタ。静的データ由来）
        buzzPattern: z.string().max(800).optional(), // コメントが集まる型（バズパターン。静的データ由来）
        // 地域トレンド参考投稿ID（regionalRefPostsのid。所有確認の上、本文を参考として渡す）
        regionalRefIds: z.array(z.number()).max(3).optional(),
        purpose: z.enum(['cv', 'awareness', 'authority', 'fan']).optional(), // 投稿の目的
        tone: z.enum(['polite', 'casual', 'professional', 'energetic', 'storytelling']).optional(), // 口調
        // 「いま伸びている型」から指定される切り口（shared/postAngles.ts のid）
        angle: z.string().max(50).optional(),
        // 固定投稿ウィザードでユーザーが選んだ優先チャネル種別（line / reservation / website 等）
        preferredLinkType: z.string().max(20).optional(),
        // 返信誘発フレーズを投稿末尾に付加する（true = 付加する）
        withReplyHook: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check AI generation feature
        const subscription = await db.getSubscriptionByUserId(ctx.user.id);
        const planId = resolveEffectivePlanId(subscription?.planId, subscription?.status);
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
          localTerms: approvedLocalTerms(project),
          target: project.target,
          mainProblem: project.mainProblem,
          strength: project.strength,
          proof: project.proof || undefined,
          styleSamples: (project as any).styleSamples || undefined,
          link: project.ctaLink || undefined,
          links: projectLinks.map(l => ({ type: l.type, label: l.label, url: l.url })),
          preferredLinkType: input.preferredLinkType,
          postType: input.postType,
          treeCount: input.treeCount,
          usp: (project as any).usp || undefined,
          n1Customer: (project as any).n1Customer || undefined,
          belief: (project as any).belief || undefined,
          catchphrase: (project as any).catchphrase || undefined,
          customerWords: (project as any).customerWords || undefined,
          trendWord: input.trendWord || undefined,
          seasonalTopic: input.seasonalTopic || undefined,
          buzzPattern: input.buzzPattern || undefined,
          regionalReferences: await (async () => {
            // IDから本文を解決（このプロジェクトの参考投稿のみ＝他人のIDを渡されても無効）
            if (!input.regionalRefIds || input.regionalRefIds.length === 0) return undefined;
            const refs = await db.listRegionalRefPosts(input.projectId);
            const wanted = new Set(input.regionalRefIds);
            const texts = refs.filter((r) => wanted.has(r.id) && r.text).map((r) => r.text as string);
            return texts.length > 0 ? texts : undefined;
          })(),
          purpose: input.purpose,
          tone: input.tone,
          counseling: counselingResult,
          useThreadsKnowhow,
          stylePreference,
          ngWords,
        });

        // 「いま伸びている型」から切り口が指定されていれば、その指示を末尾に足す
        // （末尾の指示が最も守られやすい）。
        let angleNote = '';
        if (input.angle) {
          const { getAngle } = await import('../shared/postAngles');
          const a = getAngle(input.angle);
          if (a) {
            angleNote = `\n\n【今回の切り口（厳守）】\n- 「${a.label}」の切り口で書くこと：${a.hint}`;
          }
        }

        // 返信誘発フレーズ（withReplyHook=true のとき末尾に追加）
        const replyHookNote = input.withReplyHook
          ? '\n\n【返信誘発フレーズ（必須）】\n投稿の最後に、読者が一言で答えられる具体的な問いかけを1文だけ追加すること。二択・体験質問・Yes/No形式など、答えやすいものを選ぶこと。「〜だと思いませんか？」「いかがでしょうか？」などのぼんやりした質問は禁止。例：「あなたはAとB、どちら派ですか？」「最後に行ったのはいつですか？」「コメント欄で教えてください！」'
          : '';

        // Call LLM（個人ブランディングモードなら発信者設定を最優先で上書き）
        const { invokeLLM } = await import('./_core/llm');
        const { isPersonalMode, personalModePromptOverride } = await import('../shared/personalBrand');
        const personalOverride = isPersonalMode((project as any).mode) ? personalModePromptOverride() : '';
        const response = await invokeLLM({
          messages: [
            { role: 'user', content: prompt + angleNote + replyHookNote + personalOverride },
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

        let rawResult: any;
        try {
          rawResult = JSON.parse(content);
        } catch {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '生成結果の解析に失敗しました。もう一度お試しください。' });
        }
        // ★NGワードを「自然な文章のまま」除外（違反時のみAI書き換え→最終手段で確定削除）
        const { enforceNgWords } = await import('./ngwordGuard');
        const result = await enforceNgWords(rawResult, ngWords);
        // ★方針A：本文に生URLを混入させない（AIが無視した場合の機械担保）
        if (result.mainPost) result.mainPost = stripRawUrls(result.mainPost);
        if (Array.isArray(result.treePosts)) result.treePosts = result.treePosts.map((t: string) => stripRawUrls(t));
        if (result.cta) result.cta = stripRawUrls(result.cta);

        // ★事実ガード：裏付けの無い捏造（先着/受賞/メディア掲載/満足度◯%/No.1等）を機械的に除去。
        //   裏付け＝店舗情報・カウンセリング由来の事実（proof/strength等に自動転記済み）。
        const { scrubPost, buildSupportedFacts } = await import('../shared/factGuard');
        const supportedFacts = buildSupportedFacts(
          project.businessType, project.area, (project as any).localTerms,
          project.strength, project.proof, (project as any).usp,
          (project as any).n1Customer, (project as any).belief, (project as any).customerWords,
        );
        const guarded = scrubPost(result, supportedFacts);
        const cleanResult = guarded.post;

        // Increment AI generation usage count
        await db.incrementAiGenerationUsage(ctx.user.id);

        // Save to AI generation history
        await db.saveAiGenerationHistory({
          userId: ctx.user.id,
          projectId: input.projectId,
          postType: input.postType || 'hook_tree',
          content: JSON.stringify(cleanResult),
          metadata: JSON.stringify({
            businessType: project.businessType,
            area: project.area,
            localTerms: approvedLocalTerms(project),
            target: project.target,
            mainProblem: project.mainProblem,
            strength: project.strength,
            proof: project.proof,
            ctaLink: project.ctaLink,
          }),
        });

        return { ...cleanResult, factGuardRemoved: guarded.removed };
      }),

    // ── 3案の自動採点・最優秀の推薦 ───────────────────────────────
    // 生成した複数案を「共感性／読みやすさ／話題性」で100点採点し、最も良い案を推薦する。
    // 生成枠（maxAiGenerations）は消費しない補助機能。
    evaluateOptions: protectedProcedure
      .input(z.object({
        options: z.array(z.object({
          title: z.string().optional().default(''),
          mainPost: z.string().default(''),
          treePosts: z.array(z.string()).optional().default([]),
          cta: z.string().optional().default(''),
        })).min(2).max(5),
      }))
      .mutation(async ({ input }) => {
        const optionsText = input.options.map((o, i) => {
          const body = [o.mainPost, ...(o.treePosts ?? []), o.cta].filter(Boolean).join('\n');
          return `案${i + 1}:\n${body}`;
        }).join('\n\n----\n\n');
        const prompt = `あなたはThreadsのエンゲージメント分析の専門家です。
以下の投稿案を、次の3観点でそれぞれ0〜100点で厳しく採点してください。
- empathy（共感性：いいね/保存したくなるか）
- readability（読みやすさ：スマホで読んだ時のテンポ）
- topicality（話題性：返信したくなるか）
各案に short な日本語の講評(reason)を付け、合計点が最も高い案の番号(0始まりのindex)を recommendedIndex として返してください。

${optionsText}`;
        try {
          const { invokeLLM } = await import('./_core/llm');
          const res = await invokeLLM({
            temperature: 0.3,
            messages: [{ role: 'user', content: prompt }],
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'option_eval',
                strict: true,
                schema: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    evaluations: {
                      type: 'array',
                      items: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                          empathy: { type: 'number' },
                          readability: { type: 'number' },
                          topicality: { type: 'number' },
                          total: { type: 'number' },
                          reason: { type: 'string' },
                        },
                        required: ['empathy', 'readability', 'topicality', 'total', 'reason'],
                      },
                    },
                    recommendedIndex: { type: 'number' },
                  },
                  required: ['evaluations', 'recommendedIndex'],
                },
              },
            },
          });
          const content = res?.choices?.[0]?.message?.content;
          const parsed = JSON.parse(typeof content === 'string' ? content : '{}');
          const evals = Array.isArray(parsed.evaluations) ? parsed.evaluations : [];
          // recommendedIndex を範囲内に丸める（無ければ合計点最大を選ぶ）
          let rec = Number.isInteger(parsed.recommendedIndex) ? parsed.recommendedIndex : -1;
          if (rec < 0 || rec >= input.options.length) {
            rec = evals.reduce((best: number, e: any, i: number) =>
              (e?.total ?? 0) > (evals[best]?.total ?? -1) ? i : best, 0);
          }
          return { evaluations: evals, recommendedIndex: rec };
        } catch (e) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '評価の取得に失敗しました。少し時間をおいてお試しください。' });
        }
      }),

    // ── @meta.ai メンション投稿ジェネレーター ─────────────────────────
    // ユーザーの業種・ターゲット・強みをもとに、@meta.ai に質問する形式の
    // 投稿を指定本数生成する。Meta AI が返信することでエンゲージメントが上がる。
    // AI生成カウントは消費しない（補助機能）。
    generateMetaAiPosts: protectedProcedure
      .input(z.object({
        projectId: z.string(),
        count: z.number().min(3).max(5).optional().default(5),
      }))
      .mutation(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
        }
        if (!project.businessType || !project.target || !project.mainProblem) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'プロジェクトの業種、ターゲット、主な悩みを設定してから使用してください。',
          });
        }

        const storeName = (project as any).storeName || project.businessType;
        const prompt = `あなたはThreadsのエンゲージメント戦略の専門家です。
以下のお店の情報をもとに、「@meta.ai」をメンションして質問する形式のThreads投稿を${input.count}本生成してください。

【お店の情報】
業種: ${project.businessType}
店舗名: ${storeName}
地域: ${project.area || '未設定'}
ターゲット: ${project.target}
お客様の主な悩み: ${project.mainProblem}
強み: ${project.strength || '未設定'}

【ルール】
- 各投稿は必ず「@meta.ai 」から始めること
- Meta AIに対して、お店のビジネスや顧客の悩みに関連した具体的な質問をすること
- 質問は店舗集客・マーケティング・健康・美容・地域情報など業種に合わせた実用的なものにすること
- 投稿本文は150文字以内のシンプルな質問文1つだけ（ツリー不要）
- 読んだ人も「気になる」と思える質問にすること（Meta AIの回答がタイムラインに流れてくるので、フォロワー以外にもリーチする）
- ハッシュタグ不要
- 各投稿は独立した内容にすること（同じ質問の言い換えは禁止）

【良い例（整骨院の場合）】
@meta.ai 肩こりを根本から改善するには、ストレッチと整体どちらが効果的ですか？毎日デスクワークで悩んでいる方に、最新の研究結果を踏まえて教えてください。

【返答形式】
JSON配列で返してください: { "posts": ["投稿1", "投稿2", ...] }`;

        try {
          const { invokeLLM } = await import('./_core/llm');
          const res = await invokeLLM({
            temperature: 0.8,
            messages: [{ role: 'user', content: prompt }],
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'meta_ai_posts',
                strict: true,
                schema: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    posts: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                  },
                  required: ['posts'],
                },
              },
            },
          });
          const content = res?.choices?.[0]?.message?.content;
          const parsed = JSON.parse(typeof content === 'string' ? content : '{}');
          const posts: string[] = Array.isArray(parsed.posts)
            ? parsed.posts.filter((p: unknown) => typeof p === 'string' && p.trim().startsWith('@meta.ai'))
            : [];
          if (posts.length === 0) {
            throw new Error('生成結果が空でした');
          }
          return { posts };
        } catch (e) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Meta AI投稿の生成に失敗しました。時間をおいてお試しください。',
          });
        }
      }),

    // Get AI generation history
    getAiHistory: protectedProcedure
      .input(z.object({
        limit: z.number().optional().default(50),
        offset: z.number().optional().default(0),
        // 切替中アカウントの既定店舗に絞る（アカウント切替追随）
        accountId: z.number().nullish(),
      }))
      .query(async ({ ctx, input }) => {
        const accountId = await resolveOwnedAccountId(ctx.user.id, input.accountId);
        let projectId: string | undefined;
        if (accountId != null) {
          const account = await db.getThreadsAccountById(accountId);
          projectId = (account as any)?.defaultProjectId ?? undefined;
        }
        const history = await db.getAiGenerationHistory(ctx.user.id, input.limit, input.offset, projectId);
        const total = await db.countAiGenerationHistory(ctx.user.id, projectId);
        return { history, total };
      }),

    // Has the user generated their 固定投稿 (pinned profile post) yet?
    // Used by the dashboard to surface a "create your pinned post first"
    // recommendation banner when this returns false.
    // 固定投稿はアカウント（＝店舗）ごとに必要なため、accountId指定時は
    // そのアカウントの既定店舗の固定投稿だけを数える。
    hasPinnedPost: protectedProcedure
      .input(accountFilterInput)
      .query(async ({ ctx, input }) => {
        const accountId = await resolveOwnedAccountId(ctx.user.id, input?.accountId);
        let projectId: string | undefined;
        if (accountId != null) {
          const account = await db.getThreadsAccountById(accountId);
          projectId = (account as any)?.defaultProjectId ?? undefined;
        }
        const has = await db.hasGeneratedPinnedPost(ctx.user.id, projectId);
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
        const planId = resolveEffectivePlanId(subscription?.planId, subscription?.status);
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

        // 量産は「1本＝AI生成1回」で課金カウントする（B-4）。残り枠が要求本数に満たない
        // 場合は、作れる本数だけ生成する（不足分は弾く）。canGenerate を通過しているので
        // 残り枠は最低1ある。
        const { count: aiUsed, limit: aiLimit } = await db.getAiGenerationUsage(ctx.user.id);
        let aiRemaining: number;
        if (ctx.user.isDemoMode) {
          aiRemaining = Math.max(0, db.DEMO_AI_GEN_CAP - aiUsed);
        } else if (aiLimit === null || aiLimit === -1) {
          aiRemaining = Math.max(0, db.HARD_AI_GEN_CAP_PER_MONTH - aiUsed);
        } else {
          aiRemaining = Math.max(0, Math.min(aiLimit, db.HARD_AI_GEN_CAP_PER_MONTH) - aiUsed);
        }
        const allowedCount = Math.max(1, Math.min(input.count, aiRemaining || 1));

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
        const cloneMenu = (counselingForClone?.menu ?? []) as string[];

        // Build clone prompt
        const clonePrompt = `以下の投稿が高いエンゲージメントを獲得しました。同じ構成・トーン・長さで、内容を変えた${allowedCount}本のバリエーションを生成してください。

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
${metadata.localTerms ? `地元での呼び方（事実確認済み・推測で増やさない）: ${String(metadata.localTerms).replace(/\r?\n/g, ' / ')}` : ''}
ターゲット: ${metadata.target || '不明'}
主な悩み: ${metadata.mainProblem || '不明'}
強み: ${metadata.strength || '不明'}
${counselingForClone ? `
【★このユーザーのカウンセリング結果★（最優先）】
${cloneMenu.length > 0
  ? `- 実際に提供しているメニュー（このリスト以外の施術を作らない）:\n${cloneMenu.map(m => `    ・${m}`).join('\n')}`
  : ''}
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
元の投稿の構成（段落構成、トーン、長さ、絵文字の使い方）を維持しつつ、具体的な内容・エピソード・表現を変えて${allowedCount}本のバリエーションを生成してください。各バリエーションは独立した投稿として使えるようにしてください。`;

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

        let result: any;
        try {
          result = JSON.parse(content);
        } catch {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '生成結果の解析に失敗しました。もう一度お試しください。' });
        }

        // ★NGワードを各バリエーションから自然な形で除外（違反時のみ書き換え→最終手段で削除）
        // 許可本数（allowedCount）を超えるぶんは破棄してカウントの整合を保つ。
        const { enforceNgWords } = await import('./ngwordGuard');
        const rawVariations = Array.isArray(result.variations)
          ? result.variations.slice(0, allowedCount)
          : [];
        const ngFiltered = await Promise.all(
          rawVariations.map((v: any) => enforceNgWords(v, cloneNgWords))
        );
        // ★事実ガード：元投稿＋店舗事実に裏付けの無い捏造（先着/受賞/メディア掲載/満足度◯%等）を除去。
        const { scrubPost: scrubClone, buildSupportedFacts: buildCloneFacts } = await import('../shared/factGuard');
        const cloneFacts = buildCloneFacts(
          originalContent.title, originalContent.mainPost, originalContent.cta,
          originalContent.treePosts, metadata.area, metadata.localTerms, metadata.strength, metadata.proof,
          cloneMenu, cloneRealProofs, cloneRealEpisodes, cloneCtaAssets,
        );
        const filteredVariations = ngFiltered.map((v: any) => scrubClone(v, cloneFacts).post);

        // ★B-4: 量産は「生成1本＝AI生成1回」でカウント（実際に生成できた本数ぶん加算）。
        const producedCount = Math.max(1, filteredVariations.length);
        await db.incrementAiGenerationUsage(ctx.user.id, producedCount);

        return {
          variations: filteredVariations,
          originalTitle: originalContent.title,
          requestedCount: input.count,
          generatedCount: filteredVariations.length,
        };
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

        let result: any;
        try {
          result = JSON.parse(content);
        } catch {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '生成結果の解析に失敗しました。もう一度お試しください。' });
        }

        // ★方針A：本文に生URLを混入させない
        if (result.mainPost) result.mainPost = stripRawUrls(result.mainPost);
        if (result.cta) result.cta = stripRawUrls(result.cta);

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
    // ── BYOA（自分のMetaアプリで連携する）設定 ─────────────────────
    // 弊社アプリがMeta審査未承認でも、利用者が自分で作ったアプリなら
    // 自分のThreadsアカウントに対して審査なしで全権限を使える。
    getOwnApp: protectedProcedure.query(async ({ ctx }) => {
      const user = await db.getUserById(ctx.user.id);
      const origin = ENV.threadsRedirectBaseUrl || 'https://threads-studio.com';
      return {
        // Secretは返さない（設定済みかどうかだけ返す）
        appId: user?.threadsAppId ?? null,
        configured: !!(user?.threadsAppId && user?.threadsAppSecretEnc),
        // Meta側に登録してもらう必要がある値（画面にそのまま出す）
        redirectUri: `${origin}/threads-connect`,
        deauthorizeUri: `${origin}/api/threads/deauthorize`,
        deleteUri: `${origin}/api/threads/data-deletion`,
      };
    }),

    setOwnApp: protectedProcedure
      .input(z.object({
        appId: z.string().trim().regex(/^\d{10,20}$/, 'アプリIDは10〜20桁の数字です'),
        appSecret: z.string().trim().min(16, 'アプリシークレットが短すぎます').max(200),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.setUserThreadsAppCreds(ctx.user.id, {
          appId: input.appId,
          appSecret: input.appSecret,
        });
        console.log(`[BYOA] user=${ctx.user.id} set own Threads app: ${input.appId}`);
        return { success: true };
      }),

    clearOwnApp: protectedProcedure.mutation(async ({ ctx }) => {
      await db.setUserThreadsAppCreds(ctx.user.id, null);
      console.log(`[BYOA] user=${ctx.user.id} cleared own Threads app`);
      return { success: true };
    }),

    // List connected accounts
    list: protectedProcedure.query(async ({ ctx }) => {
      const accounts = await db.getThreadsAccountsByUserId(ctx.user.id);
      // ★アクセストークンはクライアントに渡さない（トークン露出対策 / 欠点#6）。
      //   投稿等はサーバー側でトークンを取得して使うため、フロントには不要。
      return accounts.map(({ accessToken, ...safe }) => {
        void accessToken;
        return safe;
      });
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
        // BYOA: 自分のMetaアプリを登録していればそちらの資格情報で認証する
        const byoa = await db.getUserThreadsAppCreds(ctx.user.id);
        console.log('[Threads OAuth] Generated redirect_uri:', redirectUri, 'forceReauth:', input?.forceReauth, 'byoa:', !!byoa);
        return {
          authUrl: getThreadsAuthUrl(
            { redirectUri },
            { forceReauth: input?.forceReauth },
            byoa,
          ),
          usingOwnApp: !!byoa,
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
        // BYOA: 認証URL生成時と同じ資格情報でトークン交換する（食い違うと invalid_client になる）
        const byoaCreds = await db.getUserThreadsAppCreds(ctx.user.id);
        const shortLivedToken = await exchangeCodeForToken(input.code, redirectUri, byoaCreds);

        // Exchange for long-lived token (60 days)
        const longLivedToken = await exchangeForLongLivedToken(shortLivedToken.access_token, byoaCreds);
        
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
          const planId = resolveEffectivePlanId(subscription?.planId, subscription?.status);
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
          // このトークンを返信権限付きで取得したか（threadsAuth.tsのスコープ既定と対で真実を記録）
          hasReplyScope: process.env.THREADS_MANAGE_REPLIES_APPROVED === "true",
        } as any);

        // ★Threadsがつながった時点で、デモモードは自動で終了する。
        //   以前は「本番モードに切り替える」を別途押す必要があり、連携済みなのに
        //   「体験版として利用中」の帯が出続ける方がいた（2026-09-03 三上様指示）。
        //   連携＝本番で使う意思なので、ここで切り替える。
        await db.setUserDemoMode(ctx.user.id, false).catch((e) => {
          console.error(`[ThreadsConnect] デモモード解除に失敗 user=${ctx.user.id}:`, e);
        });

        // 連携できた瞬間に、今日の分の投稿を作る（朝6時を待たない）
        import('./autoPostScheduler')
          .then(({ runAutoPostCatchUpForUser }) => runAutoPostCatchUpForUser(ctx.user.id, 'Threads連携'))
          .catch(() => {});

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

    // ★アカウント別の投稿設定（自動投稿ON/OFF・公開前の確認・回数・長さ）。
    //   null を渡した項目は「共通設定に従う」に戻る。
    updateAccountSettings: protectedProcedure
      .input(z.object({
        accountId: z.number(),
        autoPostEnabled: z.boolean().nullable().optional(),
        autoPostRequireApproval: z.boolean().nullable().optional(),
        autoPostFrequency: z.enum(['daily', 'twice_daily', 'three_daily']).nullable().optional(),
        postLength: z.enum(['short', 'long', 'alternate']).nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const account = await db.getThreadsAccountById(input.accountId);
        if (!account || account.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Account not found' });
        }
        const { accountId, ...patch } = input;
        // 自動投稿が使えないプランで、アカウント別にONにさせない（共通設定と同じ守り）
        if (patch.autoPostEnabled === true) {
          const sub = await db.getSubscriptionByUserId(ctx.user.id);
          const plan = getPlan(resolveEffectivePlanId(sub?.planId, sub?.status));
          if ((plan?.features.maxAutoPostsPerDay ?? 0) <= 0) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'ご利用中のプランでは自動投稿はご利用いただけません。' });
          }
        }
        await db.updateThreadsAccount(accountId, patch as any);
        return { success: true };
      }),

    // ★複数店舗対応：このアカウントの自動投稿に使う「店舗(プロジェクト)」を設定する。
    //   projectId=null で「全店舗を日替わりローテーション」（従来挙動）に戻す。
    setDefaultProject: protectedProcedure
      .input(z.object({ accountId: z.number(), projectId: z.string().nullable() }))
      .mutation(async ({ ctx, input }) => {
        const account = await db.getThreadsAccountById(input.accountId);
        if (!account || account.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Account not found' });
        }
        if (input.projectId) {
          const project = await db.getProjectById(input.projectId);
          if (!project || project.userId !== ctx.user.id) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'プロジェクトが見つかりません。' });
          }
        }
        await db.updateThreadsAccount(input.accountId, { defaultProjectId: input.projectId });
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
        // 固定投稿の公開時、このプロジェクトの公式LINE URLを
        // 1件目のコメントとして自動添付する（本文にURLを貼らない方式の受け皿）
        pinnedLineCommentProjectId: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { createAndPublishPost, createAndPublishThread, splitThreadSegments } = await import("./threadsPost");
        
        // Check monthly post limit
        const subscription = await db.getSubscriptionByUserId(ctx.user.id);
        const planId = resolveEffectivePlanId(subscription?.planId, subscription?.status);
        const plan = getPlan(planId);
        
        // 月間上限は「連携アカウント単位」で適用（複数アカウントで枠を共有しない）。
        // B-5: 当月公開済み＋当月予約済みの合計で判定し、予約だけで枠を超過するのを防ぐ。
        if (plan && plan.features.maxScheduledPosts !== -1) {
          const monthlyCount = await db.countAccountMonthlyUsage(input.accountId);
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

          // ★連続投稿（2件目以降）は「返信を作成する」操作＝threads_manage_replies が必要。
          //   権限の無い連携でツリーを投げると、1件目だけ公開→2件目で権限エラーになり、
          //   「エラー表示なのにThreadsには途中まで載っている」という最悪の状態になる
          //   （2026-09-02 梅原様で発生）。投稿を始める前に止める。
          if (!isMedia && segments.length > 1 && (account as any).hasReplyScope === false) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message:
                '連続投稿（ツリー）は、Meta社の追加審査の承認待ちのため、この連携ではまだ使えません。\n' +
                'お手数ですが、ツリーなし（1投稿・500文字以内）で作り直してから投稿してください。承認され次第、そのまま使えるようになります。',
            });
          }

          // トピックタグ（設定ONのとき、店舗情報から1つ自動付与。発見性UP）
          let topicTag: string | undefined;
          if (ctx.user && (ctx.user as any).autoTopicTag !== false) {
            const { deriveTopicTag } = await import('./reachBoost');
            const proj = (account as any).defaultProjectId
              ? await db.getProjectById((account as any).defaultProjectId)
              : (await db.getUserProjects(ctx.user.id))?.[0];
            if (proj) topicTag = deriveTopicTag(proj) ?? undefined;
          }

          const result = (!isMedia && segments.length > 1)
            ? await createAndPublishThread(
                { accessToken: account.accessToken, threadsUserId: account.threadsUserId, topicTag },
                segments,
              )
            : await createAndPublishPost({
                accessToken: account.accessToken,
                threadsUserId: account.threadsUserId,
                text: isMedia ? input.text : (segments[0] ?? input.text),
                mediaType: input.mediaType,
                imageUrl: input.imageUrl,
                videoUrl: input.videoUrl,
                topicTag,
              });

          // ★固定投稿：公式LINEのURLを1件目のコメントとして自動添付。
          //   コメントは付加機能なので、失敗しても本体投稿は成功として返す。
          if (input.pinnedLineCommentProjectId) {
            try {
              const pj = await db.getProjectById(input.pinnedLineCommentProjectId);
              if (pj && pj.userId === ctx.user.id) {
                const { attachLineUrlComment } = await import('./pinnedPostFlow');
                const replyId = await attachLineUrlComment({
                  accessToken: account.accessToken,
                  threadsUserId: account.threadsUserId,
                  rootThreadsPostId: result.id,
                  project: pj as any,
                });
                if (replyId) console.log(`[Threads Post] Pinned LINE comment posted (root=${result.id} reply=${replyId})`);
              }
            } catch (e) {
              console.error('[Threads Post] pinned LINE comment failed:', e);
            }
          }

          return {
            success: true,
            postId: result.id,
            message: 'Threadsに投稿しました'
          };
        } catch (error) {
          console.error('[Threads Post Error]', error);
          // ★ツリーの途中失敗：1件目はThreads上に公開済み。
          //   「投稿に失敗しました」とだけ出すと、公開済みなのに作り直して
          //   再投稿→1件目が二重、という事故になる。事実をそのまま伝える。
          const { PartialThreadError } = await import('./threadsPost');
          if (error instanceof PartialThreadError) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message:
                '1件目の投稿はThreadsに公開されています。続き（2件目以降）の公開に失敗しました。\n' +
                '同じ投稿を作り直して再投稿しないでください（1件目が二重になります）。' +
                '続きを載せたい場合は、Threadsアプリでその投稿に返信の形で追加してください。',
            });
          }
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
        const planId = resolveEffectivePlanId(subscription?.planId, subscription?.status);
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
- 3パターン生成してください

【★最重要・事実厳守（守らないと法令違反・信用失墜になる）】
- 事実かどうか分からない数字・期間・料金・実績・効果を**絶対に作らない**。「平均◯回で改善」「必ず治る」「◯日で解消」のような**未確認の約束・効果保証はしない**（薬機法・景品表示法）。
- 受賞歴・メディア掲載・ランキング・有名人対応など、確証のない権威付けを書かない。
- 具体的な回数・料金・効果を聞かれたら、断定せず「人によって異なるので、詳しくはDM／ご来院時にご案内します」のように誠実に返す。
- 誇張・煽り（「予約殺到」「今だけ」等の未確認表現）を使わない。`;

        const { invokeLLM } = await import('./_core/llm');
        const response = await invokeLLM({
          temperature: 0.5,
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

        let result: any;
        try {
          result = JSON.parse(content);
        } catch {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'AI返信の解析に失敗しました。もう一度お試しください。' });
        }
        if (!result || !Array.isArray(result.replies)) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'AI返信を生成できませんでした。もう一度お試しください。' });
        }
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

        // 返信の「送信」には threads_manage_replies が必要（2026-08-30審査で承認待ち）。
        // 権限の無い連携では文案のコピーまで案内し、送信はブロックする。
        if ((account as any).hasReplyScope === false) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: '返信の送信は、Meta社の追加審査の承認待ちです。文案をコピーしてThreadsアプリから返信してください。承認され次第、ここから直接送信できるようになります。',
          });
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
    // List scheduled posts（accountId指定でそのアカウントの投稿だけに絞る）
    list: protectedProcedure
      .input(accountFilterInput)
      .query(async ({ ctx, input }) => {
        const accountId = await resolveOwnedAccountId(ctx.user.id, input?.accountId);
        return await db.getScheduledPostsByUserId(ctx.user.id, accountId);
      }),

    // Create scheduled post
    create: protectedProcedure
      .input(z.object({
        projectId: z.string(),
        threadsAccountId: z.number(),
        scheduledAt: z.string(), // ISO date string
        postContent: z.string().min(1).max(5000),
      }))
      .mutation(async ({ ctx, input }) => {
        // ★所有権チェック（他人の projectId / threadsAccountId を指定した不正投稿を防ぐ / IDOR対策）
        const project = await db.getProjectById(input.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'プロジェクトが見つかりません。' });
        }
        const account = await db.getThreadsAccountById(input.threadsAccountId);
        if (!account || account.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'アカウントが見つかりません。' });
        }

        // ★ツリー（2件目以降＝返信）は threads_manage_replies が必要。
        //   権限の無い連携で予約を受け付けると、実行時に1本目しか公開されず
        //   「途中で切れた投稿」になる。予約の時点で明確に断る。
        {
          const { splitThreadSegments } = await import('./threadsPost');
          if (splitThreadSegments(input.postContent).length > 1 && (account as any).hasReplyScope === false) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message:
                '連続投稿（ツリー）は、Meta社の追加審査の承認待ちのため、この連携ではまだ使えません。\n' +
                'ツリーなし（1投稿・500文字以内）に直してから予約してください。',
            });
          }
        }

        // Check scheduled post limit
        const subscription = await db.getSubscriptionByUserId(ctx.user.id);
        const planId = resolveEffectivePlanId(subscription?.planId, subscription?.status);
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
          // B-5: 当月公開済み＋当月予約済みの合計で判定（予約だけで枠超過するのを防ぐ）。
          const monthlyCount = await db.countAccountMonthlyUsage(input.threadsAccountId);
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
        // ★所有権チェック（他人の予約投稿を操作させない / IDOR対策）
        const post = await db.getScheduledPostById(input.postId);
        if (!post || post.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Post not found' });
        }
        await db.updateScheduledPost(input.postId, { status: 'canceled' });
        return { success: true };
      }),

    // ◯✕フィードバック（切り口の好み学習）。
    // good=◯いい / bad=✕違う / null=評価を取り消し。
    // 評価は投稿の公開/非公開に影響しない（承認・キャンセルとは独立）。
    rate: protectedProcedure
      .input(z.object({
        postId: z.number(),
        rating: z.enum(['good', 'bad']).nullable(),
      }))
      .mutation(async ({ ctx, input }) => {
        const post = await db.getScheduledPostById(input.postId);
        if (!post || post.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Post not found' });
        }
        await db.updateScheduledPost(input.postId, {
          clientRating: input.rating,
          ratedAt: input.rating ? new Date() : null,
        } as any);
        return { success: true };
      }),

    // Approve an auto-generated post that is awaiting approval.
    // 承認すると status を pending にし、次回の投稿実行で公開される。
    // 公開時刻が既に過ぎていれば直近の実行タイミングで投稿される。
    approve: protectedProcedure
      .input(z.object({ postId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const post = await db.getScheduledPostById(input.postId);
        if (!post || post.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Post not found' });
        }
        if (post.status !== 'awaiting_approval') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'この投稿は承認待ちではありません。' });
        }
        // 予約時刻が過去なら、すぐ投稿対象になるよう現在時刻に寄せる
        const now = new Date();
        const scheduledAt = post.scheduledAt && new Date(post.scheduledAt) > now ? undefined : now;
        await db.updateScheduledPost(input.postId, {
          status: 'pending',
          ...(scheduledAt ? { scheduledAt } : {}),
        });
        return { success: true };
      }),

    // Edit the content of a post that is awaiting approval (then it can be approved).
    editContent: protectedProcedure
      .input(z.object({ postId: z.number(), postContent: z.string().min(1).max(5000) }))
      .mutation(async ({ ctx, input }) => {
        const post = await db.getScheduledPostById(input.postId);
        if (!post || post.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Post not found' });
        }
        if (post.status !== 'awaiting_approval' && post.status !== 'pending') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'この投稿は編集できません。' });
        }
        await db.updateScheduledPost(input.postId, { postContent: input.postContent });
        return { success: true };
      }),

    // Retry failed post - reschedule it for 5 minutes from now
    retry: protectedProcedure
      .input(z.object({ postId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // ★所有権チェック（他人の失敗投稿を再実行させない / IDOR対策）
        const post = await db.getScheduledPostById(input.postId);
        if (!post || post.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Post not found' });
        }
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
  // ============ 代理店プラン：クライアントID発行 ============
  // 代理店(¥55,000/月)が契約すると、自社のクライアントごとにログインIDを発行できる。
  // 発行されたIDは代理店契約に内包されるため、クライアント側の決済は発生しない。
  agency: router({
    /** 代理店本人かどうか＋発行済みクライアント一覧 */
    listClients: protectedProcedure.query(async ({ ctx }) => {
      const sub = await db.getSubscriptionByUserId(ctx.user.id);
      const planId = resolveEffectivePlanId(sub?.planId, sub?.status);
      const isAgency = planId === 'agency';
      if (!isAgency) return { isAgency: false as const, clients: [], limit: 0, used: 0 };

      const { AGENCY_CLIENT_LIMIT } = await import('../shared/plans');
      const clients = await db.listAgencyClients(ctx.user.id);
      // 各クライアントの現在の有効/停止状態も返す
      const withStatus = await Promise.all(clients.map(async (c) => {
        const s = await db.getSubscriptionByUserId(c.id);
        return { ...c, active: s?.status === 'active' };
      }));
      return {
        isAgency: true as const,
        clients: withStatus,
        limit: AGENCY_CLIENT_LIMIT,
        used: clients.length,
      };
    }),

    /** クライアント用アカウントを発行する。パスワードは代理店が決めて本人に渡す。 */
    createClient: protectedProcedure
      .input(z.object({
        email: z.string().email('メールアドレスの形式が正しくありません'),
        password: z.string().min(10, 'パスワードは10文字以上にしてください').max(200),
        name: z.string().max(100).optional(),
        storeName: z.string().max(255).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const sub = await db.getSubscriptionByUserId(ctx.user.id);
        if (resolveEffectivePlanId(sub?.planId, sub?.status) !== 'agency') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '代理店プランのご契約が必要です。' });
        }
        const { AGENCY_CLIENT_LIMIT } = await import('../shared/plans');
        const used = await db.countAgencyClients(ctx.user.id);
        if (used >= AGENCY_CLIENT_LIMIT) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `発行できるクライアントIDは${AGENCY_CLIENT_LIMIT}件までです。不要なIDを停止してからお試しください。`,
          });
        }
        const email = input.email.trim().toLowerCase();
        const existing = await db.getUserByEmail(email);
        if (existing) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'このメールアドレスは既に登録されています。' });
        }
        const { hashPassword } = await import('./auth-helpers');
        const passwordHash = await hashPassword(input.password);
        const created = await db.createAgencyClient({
          agencyUserId: ctx.user.id,
          email,
          passwordHash,
          name: input.name?.trim() || null,
          storeName: input.storeName?.trim() || null,
        });
        console.log(`[Agency] user=${ctx.user.id} issued client account: ${created.id} (${email})`);
        return { success: true, clientId: created.id, email };
      }),

    /** クライアントの利用を停止/再開する */
    setClientActive: protectedProcedure
      .input(z.object({ clientUserId: z.number(), active: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const sub = await db.getSubscriptionByUserId(ctx.user.id);
        if (resolveEffectivePlanId(sub?.planId, sub?.status) !== 'agency') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '代理店プランのご契約が必要です。' });
        }
        // 自分が発行したクライアント以外は操作させない
        if (!(await db.isAgencyClientOf(ctx.user.id, input.clientUserId))) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'このアカウントは操作できません。' });
        }
        await db.setAgencyClientActive(input.clientUserId, input.active);
        return { success: true };
      }),

    /** クライアントのパスワードを再設定する（本人が忘れた場合に代理店が再発行） */
    resetClientPassword: protectedProcedure
      .input(z.object({ clientUserId: z.number(), password: z.string().min(10).max(200) }))
      .mutation(async ({ ctx, input }) => {
        const sub = await db.getSubscriptionByUserId(ctx.user.id);
        if (resolveEffectivePlanId(sub?.planId, sub?.status) !== 'agency') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '代理店プランのご契約が必要です。' });
        }
        if (!(await db.isAgencyClientOf(ctx.user.id, input.clientUserId))) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'このアカウントは操作できません。' });
        }
        const { hashPassword } = await import('./auth-helpers');
        await db.updateUserPassword(input.clientUserId, await hashPassword(input.password));
        return { success: true };
      }),
  }),

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
        // ★運営へ即時メール通知（見に行かなくても気づけるように）。
        //   ADMIN_NOTIFICATION_EMAIL 宛。失敗しても投稿自体は成功扱い。
        try {
          const categoryLabel: Record<string, string> = {
            bug: 'バグ報告',
            usability: '使いにくい点',
            feature_request: '機能リクエスト',
            other: 'その他',
          };
          const base = process.env.APP_BASE_URL || 'https://threads-studio.com';
          const { notifyOwner } = await import('./_core/notification');
          await notifyOwner({
            title: `📮 新しいご質問・ご要望（${categoryLabel[input.category] ?? input.category}）`,
            content:
              `送信者: ${ctx.user.name ?? '(名前未設定)'} <${ctx.user.email ?? '不明'}>\n` +
              `ページ: ${input.page}\n` +
              `カテゴリ: ${categoryLabel[input.category] ?? input.category}\n` +
              (input.screenshotUrl ? `スクリーンショット: ${input.screenshotUrl}\n` : '') +
              `\n内容:\n${input.content}\n` +
              `\n管理画面で確認: ${base}/admin/feedback`,
          });
        } catch (e) {
          console.error('[submitFeedback] 運営通知メール送信エラー:', e);
        }
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

        // ★#3 ダウングレードで現在の利用量が新プラン上限を超える場合は、
        //   データを壊さずに「先に整理してください」とブロックする（grandfatheredによる
        //   「作れないのに残っている」混乱や、上限超過での運用を防ぐ）。
        const overLimits: string[] = [];
        if (newPlan.features.maxProjects !== -1) {
          const projectCount = await db.countUserProjects(ctx.user.id);
          if (projectCount > newPlan.features.maxProjects) {
            overLimits.push(`プロジェクトを ${projectCount} → ${newPlan.features.maxProjects} 件以下に`);
          }
        }
        if (newPlan.features.maxThreadsAccounts !== -1) {
          const activeAccounts = await db.getThreadsAccountsByUserId(ctx.user.id);
          if (activeAccounts.length > newPlan.features.maxThreadsAccounts) {
            overLimits.push(`連携アカウントを ${activeAccounts.length} → ${newPlan.features.maxThreadsAccounts} 件以下に`);
          }
        }
        if (overLimits.length > 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `このプランに変更するには、先に${overLimits.join('、')}減らしてください。`,
          });
        }

        // 通常プラン同士の変更のみ。Univapayの定期課金金額を即時更新する。
        const univapayService = await import('./univapay');
        await univapayService.updateSubscription(subscription.univapaySubscriptionId, input.newPlanId);

        await db.updateSubscription(subscription.id, {
          planId: input.newPlanId,
        });

        // 上位プランへの変更なら、自動投稿の回数を新しい上限まで引き上げる。
        try {
          const { raiseAutoPostFrequencyOnUpgrade } = await import('./planUpgrade');
          await raiseAutoPostFrequencyOnUpgrade(ctx.user.id, subscription.planId, input.newPlanId);
        } catch (e) { console.error('[PlanChange] 自動投稿回数の引き上げに失敗:', e); }

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
    getUserStats: protectedProcedure
      .input(accountFilterInput)
      .query(async ({ ctx, input }) => {
        const accountId = await resolveOwnedAccountId(ctx.user.id, input?.accountId);
        return await db.getUserStats(ctx.user.id, accountId);
      }),

    // Get popular templates
    getPopularTemplates: publicProcedure
      .input(z.object({ limit: z.number().optional().default(5) }))
      .query(async ({ input }) => {
        return await db.getPopularTemplates(input.limit);
      }),

    // Get post analytics for the current user（accountId指定でそのアカウントに絞る）
    postAnalytics: protectedProcedure
      .input(accountFilterInput)
      .query(async ({ ctx, input }) => {
        const accountId = await resolveOwnedAccountId(ctx.user.id, input?.accountId);
        return await db.getPostAnalyticsWithEngagement(ctx.user.id, accountId);
      }),

    // Identify hit posts (above average engagement)
    hitPosts: protectedProcedure
      .input(accountFilterInput)
      .query(async ({ ctx, input }) => {
        const accountId = await resolveOwnedAccountId(ctx.user.id, input?.accountId);
        const { posts, avgEngagement } = await db.getPostAnalyticsWithEngagement(ctx.user.id, accountId);
        const hitPosts = posts.filter(p => p.engagement > avgEngagement);
        return { hitPosts, avgEngagement };
      }),

    /**
     * 切り口ごとの成績（実績学習の中身をクライアントに見せる）。
     *
     * 「どの型が効いているか」を数字で返し、AIが何を増やそうとしているかを
     * 分かるようにする。◯✕の手動評価と、実測インプレッションの両方を含む。
     */
    anglePerformance: protectedProcedure
      .input(accountFilterInput)
      .query(async ({ ctx, input }) => {
        const accountId = await resolveOwnedAccountId(ctx.user.id, input?.accountId);
        // アカウントに店舗が紐付いていれば、その店舗の成績だけを見る
        let projectId: string | undefined;
        if (accountId) {
          const account = await db.getThreadsAccountById(accountId);
          projectId = (account as any)?.defaultProjectId || undefined;
        }
        const [perf, ratings] = await Promise.all([
          db.getAnglePerformanceStats(ctx.user.id, projectId),
          db.getAngleFeedbackStats(ctx.user.id, projectId),
        ]);
        const { POST_ANGLES } = await import("../shared/postAngles");
        const rows = POST_ANGLES.map((a) => {
          const p = perf.perAngle[a.id];
          const r = ratings[a.id];
          return {
            id: a.id,
            label: a.label,
            avgImpressions: p?.avgImpressions ?? null,
            count: p?.count ?? 0,
            good: r?.good ?? 0,
            bad: r?.bad ?? 0,
          };
        })
          // 実績がある順 → 評価がある順で並べる（何も無い型は下に）
          .sort((x, y) => (y.avgImpressions ?? -1) - (x.avgImpressions ?? -1) || (y.good + y.bad) - (x.good + x.bad));
        return { rows, overallAvg: perf.overallAvg };
      }),

    // Fetch and store analytics from Threads API for a user's posts
    fetchAndStoreAnalytics: protectedProcedure.mutation(async ({ ctx }) => {
      const accounts = await db.getThreadsAccountsByUserId(ctx.user.id);
      if (accounts.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Threadsアカウントが連携されていません。' });
      }
      // 日次自動取得（dailyOpsJobs）と同じ共通処理を使う
      const { fetchAndStoreAnalyticsForUser } = await import("./dailyOpsJobs");
      const totalFetched = await fetchAndStoreAnalyticsForUser(ctx.user.id);
      return { success: true, fetchedCount: totalFetched };
    }),

    // プロフィール診断：リーチが予約につながる「受け皿」3点チェック
    profileAudit: protectedProcedure
      .input(accountFilterInput)
      .query(async ({ ctx, input }) => {
      const accountId = await resolveOwnedAccountId(ctx.user.id, input?.accountId);
      const projects = await db.getUserProjects(ctx.user.id);
      const accounts = await db.getThreadsAccountsByUserId(ctx.user.id).catch(() => []);
      // ★アカウント切替追随：指定アカウントの既定店舗＋そのアカウントのbioだけで診断する
      //   （別アカウントのbioに地域名があるだけで合格になる誤判定を防ぐ）
      const selectedAccount: any = accountId != null
        ? accounts.find((a: any) => a.id === accountId)
        : accounts[0];
      const project = (selectedAccount?.defaultProjectId
        ? projects?.find((p: any) => p.id === selectedAccount.defaultProjectId)
        : undefined) ?? projects?.[0];

      // ① 予約/LINEリンクの登録
      let linksOk = false;
      try {
        const links = (project as any)?.links ? JSON.parse((project as any).links) : [];
        linksOk = Array.isArray(links) && links.some((l: any) => l?.url && String(l.url).trim().length > 0);
      } catch { linksOk = false; }

      // ② Threadsの自己紹介（bio）に地域名が入っているか
      //   （地域の人が「近所のお店だ」と気づけるかどうか）
      const areaTokens = (project?.area || '')
        .split(/[都道府県市区町村\s　]/)
        .map((s: string) => s.trim())
        .filter((s: string) => s.length >= 2);
      const bios = String(selectedAccount?.biography || '');
      const bioAreaOk = !!selectedAccount && areaTokens.length > 0
        ? areaTokens.some((t: string) => bios.includes(t))
        : false;

      // ③ 固定投稿（お店の入口）を作ったことがあるか（この店舗のもの）
      let pinnedOk = false;
      try {
        pinnedOk = await db.hasGeneratedPinnedPost(ctx.user.id, (project as any)?.id);
      } catch { pinnedOk = false; }

      return {
        hasProject: !!project,
        hasAccounts: accounts.length > 0,
        linksOk,
        bioAreaOk,
        pinnedOk,
        areaHint: areaTokens[areaTokens.length - 1] ?? null,
      };
    }),

    // LINE問い合わせ計測（Keiro連携）。
    // 自動投稿のコメントで案内した合言葉ごとのLINE受信数をKeiroから取得し、
    // 「その合言葉を最後に案内した投稿」に紐付けて投稿別の問い合わせ数を返す。
    // プロジェクトにKeiro連携（keiroHitsUrl/Key）が未設定なら enabled:false を返しUIは非表示。
    inquiryStats: protectedProcedure
      .input(accountFilterInput)
      .query(async ({ ctx, input }) => {
      const { INQUIRY_KEYWORDS, inquiryKeywordForPost } = await import("../shared/inquiryKeywords");
      const accountId = await resolveOwnedAccountId(ctx.user.id, input?.accountId);
      const projects = await db.getUserProjects(ctx.user.id);
      // ★アカウント切替追随：切替中アカウントの既定店舗がKeiro連携済みならそれを優先
      let project: any = undefined;
      if (accountId != null) {
        const account = await db.getThreadsAccountById(accountId);
        const pid = (account as any)?.defaultProjectId;
        if (pid) {
          const p: any = (projects || []).find((x: any) => x.id === pid);
          if (p?.keiroHitsUrl && p?.keiroHitsKey) project = p;
        }
      }
      if (!project) project = (projects || []).find((p: any) => p.keiroHitsUrl && p.keiroHitsKey);
      if (!project) return { enabled: false as const };

      const DAYS = 30;
      const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);

      // 1) 集計対象の自動投稿（メインのみ）と各投稿の合言葉
      const posts = await db.getPostedAutoPostsByProject(project.id, since);
      const postRows = posts
        .filter((p) => p.postedAt)
        .map((p) => ({
          id: p.id,
          postedAt: (p.postedAt as Date).getTime(),
          keyword: inquiryKeywordForPost(p.id),
          excerpt: String(p.postContent || '').replace(/\s+/g, ' ').slice(0, 40),
        }));

      // 2) Keiroから合言葉ヒット（LINE受信）を取得
      let hits: Array<{ keyword: string; at: number }> = [];
      try {
        const url = new URL(String(project.keiroHitsUrl));
        url.searchParams.set('keywords', INQUIRY_KEYWORDS.join(','));
        url.searchParams.set('since', String(since.getTime()));
        const r = await fetch(url.toString(), {
          headers: { 'x-api-key': String(project.keiroHitsKey) },
          signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) throw new Error(`Keiro API ${r.status}`);
        const data = await r.json() as { hits?: Array<{ keyword: string; at: number }> };
        hits = Array.isArray(data.hits) ? data.hits : [];
      } catch (e) {
        console.error('[inquiryStats] Keiro fetch failed:', (e as Error).message);
        return { enabled: true as const, error: 'LINE側の集計データを取得できませんでした。', posts: [], totalHits: 0, days: DAYS };
      }

      // 3) 紐付け：各ヒットを「その時点までに同じ合言葉を案内した最新の投稿」に帰属させる。
      //    （合言葉はローテーションするため、直近にその言葉を出した投稿が最有力）
      const counts = new Map<number, number>();
      let unattributed = 0;
      for (const h of hits) {
        const candidates = postRows.filter((p) => p.keyword === h.keyword && p.postedAt <= h.at);
        if (candidates.length === 0) { unattributed++; continue; }
        const target = candidates[candidates.length - 1];
        counts.set(target.id, (counts.get(target.id) || 0) + 1);
      }

      return {
        enabled: true as const,
        days: DAYS,
        totalHits: hits.length,
        unattributed,
        posts: postRows
          .map((p) => ({ ...p, inquiries: counts.get(p.id) || 0 }))
          .sort((a, b) => b.postedAt - a.postedAt),
      };
    }),

    // フォロワー推移（日次スナップショットの合計。ダッシュボードのミニグラフ用）
    followerTrend: protectedProcedure
      .input(accountFilterInput)
      .query(async ({ ctx, input }) => {
      const accountId = await resolveOwnedAccountId(ctx.user.id, input?.accountId);
      const trend = await db.getFollowerTrend(ctx.user.id, 14, accountId);
      const latest = trend.length > 0 ? trend[trend.length - 1].followers : 0;
      // 7日前（無ければ最古）との差分
      const baseIdx = Math.max(0, trend.length - 8);
      const weeklyDelta = trend.length >= 2 ? latest - trend[baseIdx].followers : 0;
      return { trend, latest, weeklyDelta };
    }),
  }),

  // ============ Admin Management ============
  admin: router({
    // ── 契約・課金一覧（UnivaPayストア直結・管理者のみ）────────────
    // ストアは他事業と共用のため全契約を出し、リンク説明で「何の契約か」を表示。
    // アプリ登録ユーザーとはメールで突き合わせ、二重契約（同一メールで複数の
    // 有効サブスク）には警告フラグを立てる。
    univapayContracts: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '管理者権限が必要です。' });
      }
      const univapay = await import('./univapay');
      const [subs, links] = await Promise.all([
        univapay.listStoreSubscriptions(100),
        univapay.listCheckoutLinks(100).catch(() => []),
      ]);
      const linkDesc = new Map<string, string>();
      for (const l of links) linkDesc.set(l.id, l.description || '');

      // トークン照会でメールを解決（同時2件まで・失敗は無視）
      // ★8並列だとUnivaPayの上限に当たり 429 が連発して契約が欠けていた。
      //   univapayRequest 側の再試行と合わせ、並列数を絞る（100件でも十数秒で終わる）
      const rows: any[] = [];
      const queue = [...subs];
      const workers = Array.from({ length: 2 }, async () => {
        while (queue.length > 0) {
          const s = queue.shift();
          if (!s) break;
          let email: string | null = null;
          try {
            const token = await univapay.getTransactionToken(s.transaction_token_id);
            email = token?.email ?? null;
          } catch { /* 古いトークン等は取得不可 */ }
          rows.push({
            id: s.id,
            amount: s.amount,
            status: s.status,
            createdOn: s.created_on,
            nextPaymentDate: s.next_payment?.due_date ?? null,
            payerName: s.metadata?.['univapay-name'] ?? null,
            email,
            linkDescription: linkDesc.get(s.metadata?.['univapay-link-id']) ?? null,
          });
        }
      });
      await Promise.all(workers);

      // アプリユーザーとの突き合わせ
      for (const r of rows) {
        if (r.email) {
          const user = await db.getUserByEmail(r.email);
          if (user) {
            const sub = await db.getSubscriptionByUserId(user.id);
            r.appUser = { id: user.id, name: user.name, planId: sub?.planId ?? null, planStatus: sub?.status ?? null };
          } else {
            r.appUser = null;
          }
        } else {
          r.appUser = null;
        }
      }

      // ★Threads Studio関連の契約だけに絞る（ストアは他事業と共用のため、
      //   広告代行・Keiro・コンサル等の契約は表示しない。三上さん指示 2026-08-15）。
      //   判定: 【Threads】決済リンク経由、またはアプリ登録ユーザーのメールと一致。
      const tsRows = rows.filter((r) =>
        String(r.linkDescription ?? '').includes('【Threads】') || r.appUser,
      );

      // 二重契約検知（Threads関連の中で、同一メールに複数の有効契約）
      const activeByEmail = new Map<string, number>();
      for (const r of tsRows) {
        if (r.email && (r.status === 'current' || r.status === 'unpaid' || r.status === 'suspended')) {
          activeByEmail.set(r.email, (activeByEmail.get(r.email) ?? 0) + 1);
        }
      }
      for (const r of tsRows) {
        r.duplicateWarning = !!(r.email && (activeByEmail.get(r.email) ?? 0) >= 2 &&
          (r.status === 'current' || r.status === 'unpaid' || r.status === 'suspended'));
      }
      // 新しい契約順
      tsRows.sort((a, b) => String(b.createdOn).localeCompare(String(a.createdOn)));
      return tsRows;
    }),

    // ── 送信メールログ（管理者のみ）────────────────────────────
    emailLogs: protectedProcedure
      .input(z.object({
        search: z.string().optional(),
        limit: z.number().min(1).max(500).default(100),
      }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '管理者権限が必要です。' });
        }
        return await db.listEmailLogs(input.limit, input.search);
      }),

    // 全ユーザー横断ヒット投稿アーカイブ（プロンプト改善の学習素材。管理者のみ）
    listHitPostArchive: protectedProcedure
      .input(z.object({
        businessType: z.string().optional(),
        limit: z.number().min(1).max(500).default(100),
        offset: z.number().min(0).default(0),
      }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '管理者権限が必要です。' });
        }
        return await db.listHitPostArchive({
          businessType: input.businessType?.trim() || undefined,
          limit: input.limit,
          offset: input.offset,
        });
      }),

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
    // ── お客様からのご質問（自動応答の記録・担当者返信・よくある質問への反映）──
    listQuestions: adminProcedure
      .input(z.object({ needsHumanOnly: z.boolean().optional(), limit: z.number().min(1).max(500).optional() }).optional())
      .query(async ({ input }) => {
        const rows = await db.listSupportQuestions({
          needsHumanOnly: input?.needsHumanOnly,
          limit: input?.limit,
        });
        // 集計（説明会の題材づくり用）：分類ごとの件数
        const counts: Record<string, number> = {};
        for (const r of rows) {
          const k = r.category || 'その他';
          counts[k] = (counts[k] ?? 0) + 1;
        }
        return {
          questions: rows,
          categoryCounts: Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([category, count]) => ({ category, count })),
          waitingCount: rows.filter((r: any) => r.needsHuman === 1 && !r.repliedAt).length,
        };
      }),

    /** 担当者としてお客様に返信する（LINEに直接お送りする）。 */
    replyToQuestion: adminProcedure
      .input(z.object({ id: z.number(), message: z.string().min(1).max(2000) }))
      .mutation(async ({ input }) => {
        const q = await db.getSupportQuestionById(input.id);
        if (!q) throw new TRPCError({ code: 'NOT_FOUND', message: 'ご質問が見つかりません' });
        if (!q.lineUserId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'このご質問にはLINEの送り先がありません（アプリからのご質問です）' });
        }
        const { pushTextTo } = await import('./lineNotify');
        const ok = await pushTextTo(q.lineUserId, input.message);
        if (!ok) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'LINEへの送信に失敗しました' });
        }
        await db.updateSupportQuestion(input.id, { staffReply: input.message, repliedAt: new Date() });
        return { success: true } as const;
      }),

    /** よくある質問への掲載・取り下げ。 */
    publishQuestionToFaq: adminProcedure
      .input(z.object({
        id: z.number(),
        publish: z.boolean(),
        faqQuestion: z.string().max(255).optional(),
        faqAnswer: z.string().max(4000).optional(),
        category: z.string().max(40).optional(),
      }))
      .mutation(async ({ input }) => {
        const q = await db.getSupportQuestionById(input.id);
        if (!q) throw new TRPCError({ code: 'NOT_FOUND', message: 'ご質問が見つかりません' });
        if (input.publish) {
          const fq = (input.faqQuestion ?? q.faqQuestion ?? q.question ?? '').trim();
          const fa = (input.faqAnswer ?? q.faqAnswer ?? q.staffReply ?? q.aiAnswer ?? '').trim();
          if (!fq || !fa) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: '掲載する質問文と回答の両方を入力してください' });
          }
          await db.updateSupportQuestion(input.id, {
            faqPublished: 1,
            faqQuestion: fq.slice(0, 255),
            faqAnswer: fa,
            faqPublishedAt: new Date(),
            ...(input.category ? { category: input.category } : {}),
          });
        } else {
          await db.updateSupportQuestion(input.id, { faqPublished: 0 });
        }
        return { success: true } as const;
      }),

    /** どのお客様が、どの段階で止まっているかの一覧（設定の取りこぼしを見つける） */
    // ★業種と「はじめの設定」の答えがずれているお店の情報（呉服店に整体の選択肢・2026-09-06）。
    //   朝の点検（scripts/ops/daily-check.mjs）が読む。保存時の通知とは別に、既存分を拾う。
    listIndustryMismatches: adminProcedure.query(async () => {
      const { detectProjectIndustryMismatch } = await import('../shared/industryMismatch');
      const users = await db.getAllUsers();
      const out: any[] = [];
      for (const u of users as any[]) {
        let projects: any[] = [];
        try { projects = (await db.getProjectsByUserId(u.id)) || []; } catch { continue; }
        for (const p of projects) {
          if (String(p.id).startsWith('demo_')) continue;
          const r = detectProjectIndustryMismatch(p);
          if (!r.mismatch) continue;
          out.push({
            userId: u.id, name: u.name, email: u.email,
            projectId: p.id, storeName: p.storeName ?? null, businessType: p.businessType ?? null,
            summary: r.summary,
            hits: r.hits.map((h) => ({ field: h.fieldLabel, term: h.term, group: h.groupLabel })),
            updatedAt: p.updatedAt ?? null,
          });
        }
      }
      return out;
    }),

    listStuckUsers: adminProcedure.query(async () => {
      const { detectNextAction } = await import('./nextAction');
      const users = await db.getAllUsers();
      const out: any[] = [];
      for (const u of users as any[]) {
        try {
          const action = await detectNextAction(u.id);
          if (!action) continue;
          out.push({
            userId: u.id,
            name: u.name,
            email: u.email,
            key: action.key,
            message: action.text,
            notifyEnabled: Number((u as any).nextActionNotifyEnabled ?? 1) === 1,
            lastSentAt: (u as any).nextActionLastSentAt ?? null,
          });
        } catch (e) {
          console.error('[Admin] 状態の判定に失敗 user=', u.id, e);
        }
      }
      return out;
    }),

    getAllUsers: adminProcedure.query(async () => {
      return await db.getAllUsers();
    }),

    // モニターフラグの ON/OFF（DB/SSH不要で運営者が切替できるように）
    // ★管理者がプランを切り替える（こちら側からのプラン変更・2026-09-03 三上様指示）。
    //   決済の扱いは3通り:
    //   - guide_link   : アプリ側を先に切り替え、お客様には支払いリンクを案内（セミナー価格など、
    //                    UnivaPayの金額変更ができない契約に使う）
    //   - univapay_amount: 契約中のUnivaPayの継続金額を新プランの額に変更（通常プラン同士のみ）
    //   - none         : 課金なしで付与（無償提供・別途請求など）
    setUserPlan: adminProcedure
      .input(z.object({
        userId: z.number(),
        planId: z.string().min(1).max(50),
        billing: z.enum(['guide_link', 'univapay_amount', 'none']),
        sendEmail: z.boolean().default(false),
        cancelOldUnivapay: z.boolean().default(false),
        note: z.string().max(300).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserById(input.userId);
        if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'ユーザーが見つかりません' });
        const plan = getPlan(input.planId);
        if (!plan || input.planId === 'agency_client') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'そのプランは指定できません' });
        }
        const existing = await db.getSubscriptionByUserId(user.id);
        const prevPlanId = existing?.planId ?? 'free';
        const warnings: string[] = [];
        let paymentLink: string | null = null;

        if (input.billing === 'univapay_amount') {
          if (!existing?.univapaySubscriptionId) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: '契約中のUnivaPay定期課金がありません。「支払いリンクを案内」を使ってください。' });
          }
          const prev = getPlan(prevPlanId);
          if (plan.isCampaign || prev?.isCampaign) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'キャンペーン価格（セミナー価格）はUnivaPayの金額変更ができません。「支払いリンクを案内」を使ってください。' });
          }
          const univapay = await import('./univapay');
          await univapay.updateSubscriptionNextAmount(existing.univapaySubscriptionId, plan.priceMonthly);
          await db.updateSubscription(existing.id, { planId: plan.id, cancelAtPeriodEnd: false });
        } else {
          if (input.billing === 'guide_link') {
            paymentLink = plan.univapayLinkUrl ?? null;
            if (!paymentLink) warnings.push('このプランには支払いリンクが登録されていません。');
          }
          // 旧契約が残っていれば、明示された場合だけUnivaPay側を解約する（二重課金防止）
          if (existing?.univapaySubscriptionId && existing.status !== 'canceled') {
            if (input.cancelOldUnivapay) {
              try {
                const univapay = await import('./univapay');
                await univapay.cancelSubscription(existing.univapaySubscriptionId);
                warnings.push(`旧契約（${existing.univapaySubscriptionId}）をUnivaPayで解約しました。`);
              } catch (e) {
                warnings.push(`旧契約（${existing.univapaySubscriptionId}）のUnivaPay解約に失敗しました。UnivaPay管理画面で確認してください。`);
              }
            } else {
              warnings.push(`旧契約（${existing.univapaySubscriptionId}・${prevPlanId}）のUnivaPay定期課金は残っています。二重課金にならないよう解約が必要です。`);
            }
          }
          const patch = {
            planId: plan.id,
            status: 'active' as const,
            trialEndsAt: null,
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
            campaignChargeCount: 0,
            // 支払い待ちの間は旧IDを残さない（Webhookで新契約のIDが入る）
            univapaySubscriptionId: input.cancelOldUnivapay ? null : (existing?.univapaySubscriptionId ?? null),
          };
          if (existing) await db.updateSubscription(existing.id, patch as any);
          else await db.createSubscription({ userId: user.id, ...patch } as any);
        }

        // キャンペーン価格のプランなら、料金プラン画面にもその価格が出るようにする（クーポン適用と同じ状態）
        if (plan.isCampaign) {
          const { campaignTierForCode } = await import('@shared/plans');
          const tier = plan.id.endsWith('_seminar') ? campaignTierForCode('SEMINAR2026') : campaignTierForCode('CPMONITOR2026');
          await db.setUserMonitor(user.id, true).catch(() => {});
          try {
            const { users: usersT } = await import('../drizzle/schema');
            const { eq: eqOp } = await import('drizzle-orm');
            const database = await (await import('./db')).getDb();
            if (database) await database.update(usersT).set({ campaignTier: tier } as any).where(eqOp(usersT.id, user.id));
          } catch (e) { console.error('[admin.setUserPlan] campaignTier更新に失敗:', e); }
        }

        // 上位プランなら自動投稿の回数を引き上げる
        try {
          const { raiseAutoPostFrequencyOnUpgrade } = await import('./planUpgrade');
          await raiseAutoPostFrequencyOnUpgrade(user.id, prevPlanId, plan.id);
        } catch (e) { console.error('[admin.setUserPlan] 自動投稿回数の引き上げに失敗:', e); }

        // お客様への案内メール（管理者が明示した場合だけ）
        let emailSent = false;
        if (input.sendEmail && user.email && input.billing !== 'none') {
          const { sendPlanGuideEmail } = await import('./_core/notification');
          emailSent = await sendPlanGuideEmail({
            to: user.email,
            name: user.name,
            planName: plan.name,
            priceMonthly: plan.priceMonthly,
            paymentLink: input.billing === 'guide_link' ? paymentLink : null,
            isCampaign: Boolean(plan.isCampaign),
            campaignCharges: plan.campaignCharges ?? null,
          });
        }

        console.log(`[admin.setUserPlan] by=${ctx.user.id} user=${user.id} ${prevPlanId}→${plan.id} billing=${input.billing} email=${emailSent} note=${input.note ?? ''}`);
        try {
          const { notifyOwner } = await import('./_core/notification');
          await notifyOwner({
            title: `プラン変更（管理者）: ${user.name ?? user.email} ${prevPlanId}→${plan.id}`,
            content: `決済の扱い: ${input.billing}\n案内メール: ${emailSent ? '送信' : 'なし'}\n${warnings.join('\n')}${input.note ? `\nメモ: ${input.note}` : ''}`,
          });
        } catch { /* 通知失敗は無視 */ }

        return { success: true, prevPlanId, planId: plan.id, paymentLink, warnings, emailSent };
      }),

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

    // ── 代理店解約時のクライアント引き継ぎ（shared/takeover.ts に流れの説明） ──

    // 引き継ぎ待ちクライアント一覧（残り日数つき）
    listTakeoverClients: adminProcedure.query(async () => {
      const { takeoverDaysLeft } = await import('../shared/takeover');
      const rows = await db.listTakeoverPendingClients();
      const now = new Date();
      return rows.map((r) => ({
        ...r,
        daysLeft: r.takeoverPendingAt ? takeoverDaysLeft(r.takeoverPendingAt, now) : 0,
      }));
    }),

    // クライアントへ「同じ金額での直接契約」の案内メールを送る。
    // 金額は代理店がそのクライアントに請求していた月額（運営が入力）。
    // 決済リンクは UnivaPay 管理画面でその金額のリンクを作って貼る。
    sendTakeoverOffer: adminProcedure
      .input(z.object({
        userId: z.number(),
        monthlyPrice: z.number().int().min(0).max(1000000),
        paymentLinkUrl: z.string().url(),
      }))
      .mutation(async ({ input }) => {
        const user = await db.getUserById(input.userId);
        if (!user?.email || !user.takeoverPendingAt) {
          throw new TRPCError({ code: 'NOT_FOUND', message: '引き継ぎ待ちのクライアントが見つかりません' });
        }
        const { TAKEOVER_GRACE_DAYS, takeoverDaysLeft } = await import('../shared/takeover');
        const daysLeft = takeoverDaysLeft(user.takeoverPendingAt, new Date());
        const { sendEmail } = await import('./_core/notification');
        const price = input.monthlyPrice.toLocaleString();
        const store = (user.storeName || user.name || '').replace(/</g, '&lt;');
        const ok = await sendEmail({
          to: user.email,
          subject: '【Threads Studio】ご利用継続のご案内（お手続きのお願い）',
          html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
            <h2>Threads Studio ご利用継続のご案内</h2>
            <p>${store ? store + ' さま' : 'ご担当者さま'}</p>
            <p>いつもThreads Studioをご利用いただきありがとうございます。運営元の株式会社しっとるです。</p>
            <p>これまで代理店経由でご提供していたThreads Studioのご契約について、
            代理店との契約終了に伴い、今後は当社が<strong>直接</strong>お引き継ぎいたします。</p>
            <p>月額はこれまでと同じ <strong>${price}円</strong> です。機能・データ・設定はそのまま、
            何も変わりません。下のリンクからお支払いのご登録をお願いいたします。</p>
            <a href="${input.paymentLinkUrl}" style="display:inline-block;background:#10b981;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0;">お支払いを登録する（月額${price}円）</a>
            <p style="font-size:13px;color:#6b7280;">お手続きの目安は残り${daysLeft}日です（猶予期間は${TAKEOVER_GRACE_DAYS}日間）。
            期間中も通常どおりご利用いただけます。ご不明点はこのメールへの返信でお気軽にどうぞ。</p>
          </div>`,
        });
        return { sent: ok, daysLeft };
      }),

    // 決済確認後: 通常プランの直接契約へ切り替える（親子関係も解消）
    finalizeTakeover: adminProcedure
      .input(z.object({ userId: z.number(), planId: z.string() }))
      .mutation(async ({ input }) => {
        const { isTakeoverTargetPlan } = await import('../shared/takeover');
        if (!isTakeoverTargetPlan(input.planId)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: '引き継ぎ先はライト/プロ/ビジネスのいずれかです' });
        }
        const user = await db.getUserById(input.userId);
        if (!user?.takeoverPendingAt) {
          throw new TRPCError({ code: 'NOT_FOUND', message: '引き継ぎ待ちのクライアントが見つかりません' });
        }
        await db.finalizeTakeover(input.userId, input.planId);
        return { success: true };
      }),

    // 引き継がない場合: 停止して猶予を終了する
    stopTakeoverClient: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ input }) => {
        const user = await db.getUserById(input.userId);
        if (!user?.takeoverPendingAt) {
          throw new TRPCError({ code: 'NOT_FOUND', message: '引き継ぎ待ちのクライアントが見つかりません' });
        }
        await db.stopTakeoverClient(input.userId);
        return { success: true };
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
  // 契約時アンケート（興味のあるコンテンツ）
  survey: router({
    // 回答済みか（未回答なら初回ダイアログを出す判定に使う）
    contentInterestStatus: protectedProcedure.query(async ({ ctx }) => {
      const row = await db.getContentInterestSurvey(ctx.user.id);
      return { answered: !!row };
    }),
    submitContentInterest: protectedProcedure
      .input(z.object({
        interests: z.array(z.string().max(80)).max(20),
        freeText: z.string().max(1000).optional(),
        sendInfo: z.boolean().default(true), // 登録メールに案内を送ってよいか
      }))
      .mutation(async ({ ctx, input }) => {
        const interestsStr = input.interests.join(', ');
        await db.upsertContentInterestSurvey(ctx.user.id, interestsStr, input.freeText?.trim() || null, input.sendInfo);

        // ★案内希望かつ該当サービスがあれば、本人の登録メールへ自動でご案内を送る。
        //   サービスごとに1通ずつ（それぞれの紹介ページ /services/<slug> へのリンク付き）。
        //   1通にまとめると読まれにくく、どれに興味があったのかも本人に伝わりにくいため。
        if (input.sendInfo && ctx.user.email && input.interests.length > 0) {
          try {
            const { servicesFromLabels, serviceIntroUrl, RELATED_SERVICES_CONTACT_EMAIL } = await import('../shared/relatedServices');
            const matched = servicesFromLabels(input.interests);
            if (matched.length > 0) {
              const { sendServiceIntroEmails } = await import('./_core/notification');
              const sent = await sendServiceIntroEmails(ctx.user.email, matched, RELATED_SERVICES_CONTACT_EMAIL, (s) => serviceIntroUrl(s));
              console.log(`[survey] 案内メール ${sent}/${matched.length}通 → ${ctx.user.email}`);
            }
          } catch (e) { console.error('[survey] 案内メール送信失敗:', e); }
        }

        // 運営へ通知（クロスセルの見込み把握）。失敗しても回答は成功。
        try {
          const { notifyOwner } = await import('./_core/notification');
          await notifyOwner({
            title: `🧭 興味のあるサービス アンケート回答: ${ctx.user.name ?? ctx.user.email}`,
            content:
              `顧客: ${ctx.user.name ?? '(名前未設定)'} <${ctx.user.email ?? '不明'}>\n` +
              `興味のあるサービス: ${interestsStr || '(未選択)'}\n` +
              (input.freeText?.trim() ? `自由記述: ${input.freeText.trim()}\n` : '') +
              `メールでの案内: ${input.sendInfo ? '希望する（' + (ctx.user.email ?? '') + '）' : '希望しない'}\n` +
              `\n→ クロスセルの見込み。案内希望の方には登録メールへご案内を。`,
          });
        } catch (e) { console.error('[survey] 通知失敗:', e); }
        return { success: true };
      }),
  }),

  // ============ 地域トレンド（地域で反応の高い投稿の収集→似た投稿の生成） ============
  regional: router({
    // プロジェクトの参考投稿一覧
    list: protectedProcedure
      .input(z.object({ projectId: z.string() }))
      .query(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'プロジェクトが見つかりません' });
        }
        return await db.listRegionalRefPosts(input.projectId);
      }),

    // Threadsキーワード検索APIで地域の人気投稿（TOP）を自動収集
    collect: protectedProcedure
      .input(z.object({ projectId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'プロジェクトが見つかりません' });
        }
        const accounts = await db.getThreadsAccountsByUserId(ctx.user.id);
        if (accounts.length === 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Threadsアカウントの連携が必要です。' });
        }
        const { searchRegionalTopPosts, buildRegionalKeywords } = await import('./threadsRegional');
        const localTerms = ((project as any).localTerms || '')
          .split(/\r?\n/).map((s: string) => s.trim()).filter(Boolean);
        const keywords = buildRegionalKeywords(project.area || '', localTerms);
        if (keywords.length === 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: '地域情報が未設定です。先に登録情報（地域）を入力してください。' });
        }

        const result = await searchRegionalTopPosts(accounts[0].accessToken, keywords);
        if (result.errorCode === 'permission') {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: '地域検索の権限（keyword_search）がまだ有効ではありません。Meta審査の承認後に使えるようになります。それまでは「手動で追加」から参考投稿を登録してください。',
          });
        }
        if (result.errorCode === 'auth') {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Threads連携の有効期限が切れています。再連携してください。' });
        }

        // 重複（同一permalink）を避けて保存
        const existing = await db.getRegionalRefPermalinks(input.projectId);
        let saved = 0;
        for (const p of result.posts.slice(0, 20)) {
          if (p.permalink && existing.has(p.permalink)) continue;
          await db.addRegionalRefPost({
            userId: ctx.user.id,
            projectId: input.projectId,
            source: 'collected',
            area: project.area || null,
            keyword: p.keyword,
            authorUsername: p.username,
            text: p.text,
            permalink: p.permalink,
            postedAt: p.timestamp ? new Date(p.timestamp) : null,
          });
          saved++;
        }
        return { success: true, collected: saved, searchedKeywords: keywords };
      }),

    // 手動で参考投稿を追加（Threadsで見つけた良い投稿を貼り付け）
    addManual: protectedProcedure
      .input(z.object({
        projectId: z.string(),
        text: z.string().min(10, '本文を入力してください').max(2000),
        permalink: z.string().max(500).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'プロジェクトが見つかりません' });
        }
        await db.addRegionalRefPost({
          userId: ctx.user.id,
          projectId: input.projectId,
          source: 'manual',
          area: project.area || null,
          text: input.text.trim(),
          permalink: input.permalink?.trim() || null,
        });
        return { success: true };
      }),

    // 参考投稿の削除
    remove: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.removeRegionalRefPost(input.id, ctx.user.id);
        return { success: true };
      }),
  }),

  // 非表示アイテム（初期プリセット・投稿テンプレート集で「使わないもの」を隠す）
  hidden: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getHiddenItems(ctx.user.id);
    }),
    hide: protectedProcedure
      .input(z.object({
        itemType: z.enum(['preset', 'template']),
        itemKey: z.string().min(1).max(100),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.addHiddenItem(ctx.user.id, input.itemType, input.itemKey);
        return { success: true };
      }),
    unhide: protectedProcedure
      .input(z.object({
        itemType: z.enum(['preset', 'template']),
        itemKey: z.string().min(1).max(100),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.removeHiddenItem(ctx.user.id, input.itemType, input.itemKey);
        return { success: true };
      }),
  }),

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

常に親切で具体的なアドバイスを心がけてください。
${CONCEPT_DESIGN_PROMPT}`;

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

  // ==================== イベント告知（開催日から逆算した告知投稿） ====================
  events: router({
    // 登録と同時に、開催日から逆算した告知投稿を生成して予約する
    create: protectedProcedure
      .input(z.object({
        threadsAccountId: z.number(),
        projectId: z.string().min(1),
        title: z.string().min(1).max(120),
        eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        eventTime: z.string().max(40).optional(),
        venue: z.string().max(200).optional(),
        description: z.string().max(1000).optional(),
        offer: z.string().max(300).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { planCountdownSlots } = await import('../shared/eventCountdown');
        const slots = planCountdownSlots(input.eventDate, new Date());
        if (slots.length === 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: '開催日が過ぎているか、近すぎるため告知を予約できません。開催日をご確認ください。' });
        }

        const account = await db.getThreadsAccountById(input.threadsAccountId);
        if (!account || account.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Threadsアカウントが見つかりません' });
        }
        const project = await db.getProjectById(input.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'プロジェクトが見つかりません' });
        }

        // 月間投稿数の上限（連携アカウント単位）: 逆算分をまとめて予約できるか確認
        const subscription = await db.getSubscriptionByUserId(ctx.user.id);
        const planId = resolveEffectivePlanId(subscription?.planId, subscription?.status);
        const plan = getPlan(planId);
        if (plan && plan.features.maxScheduledPosts !== -1) {
          const monthlyCount = await db.countAccountMonthlyUsage(input.threadsAccountId);
          if (monthlyCount + slots.length > plan.features.maxScheduledPosts) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: `イベント告知${slots.length}件を予約すると月間投稿数の上限（${plan.features.maxScheduledPosts}件）を超えます。`,
            });
          }
        }

        const event = await db.createEvent({
          userId: ctx.user.id,
          projectId: input.projectId,
          threadsAccountId: input.threadsAccountId,
          title: input.title,
          eventDate: input.eventDate,
          eventTime: input.eventTime ?? null,
          venue: input.venue ?? null,
          description: input.description ?? null,
          offer: input.offer ?? null,
        } as any);

        const settings = await db.getAutoPostSettings(ctx.user.id);
        const { createEventPosts } = await import('./eventAnnounce');
        const created = await createEventPosts({
          userId: ctx.user.id,
          event: event as any,
          projectId: input.projectId,
          threadsAccountId: input.threadsAccountId,
          project: {
            businessType: (project as any).businessType,
            area: (project as any).area,
            storeName: (project as any).storeName ?? (project as any).title,
          },
          slots,
          requireApproval: Boolean((settings as any)?.autoPostRequireApproval),
        });

        return {
          eventId: (event as any).id,
          created,
          requireApproval: Boolean((settings as any)?.autoPostRequireApproval),
          schedule: slots.map((s) => ({ label: s.stage.label, scheduledAt: s.scheduledAt })),
        };
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      const rows = await db.listEvents(ctx.user.id);
      const withPosts = await Promise.all(rows.map(async (e) => ({
        ...e,
        posts: await db.listEventPosts(ctx.user.id, e.id),
      })));
      return withPosts;
    }),

    cancel: protectedProcedure
      .input(z.object({ eventId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const event = await db.getEventById(ctx.user.id, input.eventId);
        if (!event) throw new TRPCError({ code: 'NOT_FOUND', message: 'イベントが見つかりません' });
        const canceled = await db.cancelEvent(ctx.user.id, input.eventId);
        return { success: true, canceledPosts: canceled };
      }),
  }),

  // ==================== LINE通知連携（段階1） ====================
  lineNotify: router({
    // 連携状態と、設定画面の案内に必要な情報。
    // 1アカウントに複数のLINEを連携できる（オーナー＋店長など）。links に全員分を返す。
    getStatus: protectedProcedure.query(async ({ ctx }) => {
      const { lineNotifyEnabled } = await import('./lineNotify');
      const links = await db.listLineLinks(ctx.user.id);
      const cap = await db.getLineLinkCapacity(ctx.user.id);
      return {
        available: lineNotifyEnabled(),
        linked: links.length > 0,
        links: links.map((l) => ({
          // 生のLINE userIdは画面に出す必要がないので解除用の識別子としてだけ返す
          lineUserId: l.lineUserId,
          displayName: l.displayName,
          createdAt: l.createdAt,
        })),
        // プランごとの連携上限（-1=無制限）。UIの追加連携ボタンの出し分けに使う
        maxLinks: cap.limit,
        canAddMore: cap.canAdd,
        addFriendUrl: process.env.LINE_NOTIFY_ADD_URL || null,
      };
    }),

    // 特定のLINEだけ連携解除する（設定画面の一覧から）
    unlinkOne: protectedProcedure
      .input(z.object({ lineUserId: z.string().min(5).max(64) }))
      .mutation(async ({ ctx, input }) => {
        await db.unlinkLineLink(ctx.user.id, input.lineUserId);
        return { success: true };
      }),

    // 6桁の連携コードを発行（10分有効）
    createLinkCode: protectedProcedure.mutation(async ({ ctx }) => {
      const { lineNotifyEnabled, generateLinkCode, LINK_CODE_TTL_MS } = await import('./lineNotify');
      if (!lineNotifyEnabled()) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'LINE通知は現在準備中です。' });
      }
      const cap = await db.getLineLinkCapacity(ctx.user.id);
      if (!cap.canAdd) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `ご利用中のプランで連携できるLINEは${cap.limit}人までです。不要な連携を解除するか、上位プランをご検討ください。`,
        });
      }
      const code = generateLinkCode();
      await db.setLineLinkCode(ctx.user.id, code, new Date(Date.now() + LINK_CODE_TTL_MS));
      return { code, expiresInMinutes: 10 };
    }),

    unlink: protectedProcedure.mutation(async ({ ctx }) => {
      await db.unlinkLineByUserId(ctx.user.id);
      return { success: true };
    }),

    // ── LIFF（LINEトーク内でアプリを開く）──────────────────

    // クライアントがLIFF初期化に使う設定（LIFF IDはビルドに埋めず実行時に配る）
    liffConfig: publicProcedure.query(async () => {
      const { liffEnabled } = await import('./lineNotify');
      return { enabled: liffEnabled(), liffId: process.env.LIFF_ID || null };
    }),

    // LIFFの自動ログイン: LINEのIDトークンを検証し、連携済みユーザーなら
    // 通常ログインと同じセッションCookieを発行する。
    liffLogin: publicProcedure
      .input(z.object({ idToken: z.string().min(10) }))
      .mutation(async ({ ctx, input }) => {
        const { verifyLineIdToken } = await import('./lineNotify');
        const lineUserId = await verifyLineIdToken(input.idToken);
        if (!lineUserId) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'LINEの本人確認に失敗しました。開き直してお試しください。' });
        }
        const user = await db.getUserByLineUserId(lineUserId);
        if (!user || !user.openId) {
          // まだアプリのアカウントと紐づいていない（初回だけログインしてもらう）
          return { ok: false as const, reason: 'not_linked' as const };
        }
        const { sdk } = await import('./_core/sdk');
        const token = await sdk.createSessionToken(user.openId, { name: user.name ?? '' });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
        await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });
        return { ok: true as const };
      }),

    // ログイン済みユーザーをLIFF内から即時連携する（6桁コード不要。
    // LIFFのIDトークン＝LINE本人の証明なので、そのまま紐づけてよい）
    linkByLiff: protectedProcedure
      .input(z.object({ idToken: z.string().min(10) }))
      .mutation(async ({ ctx, input }) => {
        const { verifyLineIdToken, fetchLineDisplayName } = await import('./lineNotify');
        const lineUserId = await verifyLineIdToken(input.idToken);
        if (!lineUserId) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'LINEの本人確認に失敗しました。開き直してお試しください。' });
        }
        // 同じLINEの付け直しは上限に数えない
        const existing = await db.listLineLinks(ctx.user.id);
        if (!existing.some((l) => l.lineUserId === lineUserId)) {
          const cap = await db.getLineLinkCapacity(ctx.user.id);
          if (!cap.canAdd) {
            throw new TRPCError({
              code: 'PRECONDITION_FAILED',
              message: `ご利用中のプランで連携できるLINEは${cap.limit}人までです。不要な連携を解除するか、上位プランをご検討ください。`,
            });
          }
        }
        const displayName = await fetchLineDisplayName(lineUserId);
        await db.linkLineDirect(ctx.user.id, lineUserId, displayName);
        // 連携できたら、その方のリッチメニューを通常メニュー（6ボタン）に切り替える
        try {
          const { switchToMainRichMenu } = await import('./lineNotify');
          await switchToMainRichMenu(lineUserId);
        } catch { /* 切替失敗は連携成立に影響させない */ }
        return { success: true };
      }),
  }),

  // ==================== Auto Post Settings ====================
  autoPost: router({
    getSettings: protectedProcedure.query(async ({ ctx }) => {
      const settings = await db.getAutoPostSettings(ctx.user.id);
      return settings || { autoPostEnabled: true, autoPostFrequency: 'daily', autoPostRequireApproval: false, autoTopicTag: true, autoFollowUpEnabled: true, metaAiAskEnabled: true, showcaseOptOut: false, postLength: 'short' };
    }),

    updateSettings: protectedProcedure
      .input(z.object({
        autoPostEnabled: z.boolean().optional(),
        autoPostFrequency: z.enum(['daily', 'twice_daily', 'three_daily']).optional(),
        autoPostRequireApproval: z.boolean().optional(),
        autoTopicTag: z.boolean().optional(),
        autoFollowUpEnabled: z.boolean().optional(),
        // 「Meta AIに聞く」返信（shared/metaAiAsk.ts）。既定ON
        metaAiAskEnabled: z.boolean().optional(),
        // 実例ショーケース（/tour）への匿名掲載を止める。利用規約 第11条第3項
        showcaseOptOut: z.boolean().optional(),
        // 投稿の長さ（shared/postLength.ts）
        postLength: z.enum(['short', 'long', 'alternate']).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.updateAutoPostSettings(ctx.user.id, input);
        // 自動投稿をONにした／回数を増やしたときは、今日の不足分をすぐ作る
        if (input.autoPostEnabled === true || input.autoPostFrequency) {
          import('./autoPostScheduler')
            .then(({ runAutoPostCatchUpForUser }) => runAutoPostCatchUpForUser(ctx.user.id, '自動投稿の設定変更'))
            .catch(() => {});
        }
        return { success: true };
      }),

    getHistory: protectedProcedure
      .input(z.object({ limit: z.number().optional().default(20), accountId: z.number().nullish() }))
      .query(async ({ ctx, input }) => {
        const accountId = await resolveOwnedAccountId(ctx.user.id, input.accountId);
        return await db.getAutoPostHistory(ctx.user.id, input.limit, accountId);
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

      // ★押した本人の分だけ、今日の不足分を作る。
      //   以前は全ユーザー分を回していた（1人のボタンで全員に生成が走る）。
      const result = await processAutoPostGeneration({ onlyUserId: ctx.user.id, fillToday: true });
      return result;
    }),
  }),

  // ============ Favorites ============
  favorite: router({
    toggle: protectedProcedure
      .input(z.object({ historyId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // ★所有権チェック：自分の生成履歴のみお気に入りにできる
        const history = await db.getAiGenerationHistoryById(input.historyId, ctx.user.id);
        if (!history) {
          throw new TRPCError({ code: 'NOT_FOUND', message: '履歴が見つかりません。' });
        }
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
    // プロフィール（名前・店舗名）の更新。登録後いつでも変更できる。
    updateProfile: protectedProcedure
      .input(z.object({
        name: z.string().min(1, '名前を入力してください').max(100),
        storeName: z.string().max(255).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.updateUserProfile(ctx.user.id, {
          name: input.name.trim(),
          storeName: input.storeName?.trim() || null,
        });
        return { success: true };
      }),
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

  // ==================== アプリ内通知バナー ====================
  notification: router({
    /**
     * 固定投稿ウィザード通知バナーが未確認かどうか返す。
     * true = 未確認（バナーを表示すべき）
     */
    wizardUnseen: protectedProcedure
      .query(async ({ ctx }) => {
        const unseen = await db.isWizardNotificationUnseen(ctx.user.id);
        return { unseen };
      }),

    /**
     * 固定投稿ウィザード通知バナーを「確認済み」にする。
     */
    markWizardSeen: protectedProcedure
      .mutation(async ({ ctx }) => {
        await db.markWizardNotificationSeen(ctx.user.id);
        return { success: true };
      }),
  }),

});

export type AppRouter = typeof appRouter;
