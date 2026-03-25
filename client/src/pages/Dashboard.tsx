import { useAuth } from '@/_core/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/lib/trpc';
import { 
  CreditCard, 
  Settings, 
  FileText, 
  Calendar, 
  Link2, 
  Crown, 
  AlertCircle,
  ExternalLink,
  LogOut,
  Home,
  ChevronRight,
  HelpCircle,
  FolderOpen,
  Clock,
  Users,
  BarChart3,
  Sparkles,
  History,
  Gift,
  Coins,
  Sliders
} from 'lucide-react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { getLoginUrl } from '@/const';
import { useEffect, useState } from 'react';
import CouponModal from '@/components/CouponModal';
import TrialBanner from '@/components/TrialBanner';
import OnboardingTour from '@/components/OnboardingTour';
import ProjectExplanation from '@/components/ProjectExplanation';
import HelpTooltip from '@/components/HelpTooltip';
import { UsageProgress } from '@/components/UsageProgress';
import SetupWizard from '@/components/SetupWizard';
import { DemoModeBanner } from '@/components/DemoModeBanner';
import { SetupProgress } from '@/components/SetupProgress';
import { AIChatWidget } from '@/components/AIChatWidget';
import ThreadsAccountSwitcher from '@/components/ThreadsAccountSwitcher';
import WeeklyCalendarView from '@/components/WeeklyCalendarView';

export default function Dashboard() {
  const { user, isAuthenticated, loading, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const [couponModalOpen, setCouponModalOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [setupWizardOpen, setSetupWizardOpen] = useState(false);
  const utils = trpc.useUtils();

  // Auth redirect is handled by DashboardLayout

  // Check for success parameter from Stripe checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      toast.success('サブスクリプションが開始されました！');
      // Clean up URL
      window.history.replaceState({}, '', '/dashboard');
    }
  }, []);

  // Show setup wizard for new users
  const { data: setupData } = trpc.setup.getStep.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  useEffect(() => {
    if (setupData && setupData.setupStep !== null && setupData.setupStep < 5) {
      const timer = setTimeout(() => {
        setSetupWizardOpen(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [setupData]);

  // Show onboarding tour for new users (after setup wizard)
  useEffect(() => {
    if (user && !user.onboardingCompleted && setupData && setupData.setupStep === 5) {
      const timer = setTimeout(() => {
        setOnboardingOpen(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [user, setupData]);

  const { data: subscription, isLoading: subLoading } = trpc.subscription.getStatus.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const { data: invoices } = trpc.subscription.getInvoices.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const { data: projectCount } = trpc.project.count.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const { data: threadsAccounts } = trpc.threads.list.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const { data: stats } = trpc.stats.getUserStats.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const { data: popularTemplates } = trpc.stats.getPopularTemplates.useQuery(
    { limit: 5 },
    { enabled: isAuthenticated }
  );

  const { data: aiUsage } = trpc.subscription.getAiUsage.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const { data: referralData } = trpc.referral.getMyReferralInfo.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const { data: creditsData } = trpc.referral.getMyCredits.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  // Scheduled posts for calendar
  const { data: scheduledPosts } = trpc.scheduledPost.list.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  // Auto-post settings
  const { data: autoPostSettings } = trpc.autoPost.getSettings.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const { data: autoPostHistory } = trpc.autoPost.getHistory.useQuery(
    { limit: 5 },
    { enabled: isAuthenticated }
  );

  const updateAutoPost = trpc.autoPost.updateSettings.useMutation({
    onSuccess: () => {
      utils.autoPost.getSettings.invalidate();
      toast.success('自動投稿設定を更新しました');
    },
  });

  const createPortalSession = trpc.subscription.createPortalSession.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        window.open(data.url, '_blank');
      }
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const cancelSubscription = trpc.univapay.cancelSubscription.useMutation({
    onSuccess: () => {
      toast.success('サブスクリプションのキャンセルを予約しました');
      utils.subscription.getStatus.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const resumeSubscription = trpc.subscription.resume.useMutation({
    onSuccess: () => {
      toast.success('サブスクリプションを再開しました');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleLogout = async () => {
    await logout();
    setLocation('/');
  };

  if (subLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  const formatDate = (date: Date | string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; className: string }> = {
      active: { label: '有効', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
      trialing: { label: 'トライアル中', className: 'bg-blue-50 text-blue-700 border border-blue-200' },
      canceled: { label: 'キャンセル済み', className: 'bg-red-50 text-red-700 border border-red-200' },
      past_due: { label: '支払い遅延', className: 'bg-yellow-50 text-yellow-700 border border-yellow-200' },
    };
    const badge = statusMap[status] || { label: status, className: 'bg-gray-50 text-gray-700 border border-gray-200' };
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${badge.className}`}>
        {badge.label}
      </span>
    );
  };

  return (
    <div>
      <div className="max-w-5xl mx-auto">
        {/* Demo Mode Banner */}
        <DemoModeBanner />

        {/* Setup Progress */}
        <SetupProgress />

        {/* Trial Banner */}
        {subscription?.isTrialing && subscription?.trialEndsAt && (
          <TrialBanner
            trialEndsAt={subscription.trialEndsAt}
            planName={subscription.plan?.name || 'トライアル'}
          />
        )}

        {/* Welcome + Plan Badge */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">ようこそ、{user?.name || 'ユーザー'}さん</h1>
            <p className="text-gray-500 text-sm mt-1">
              {autoPostSettings?.autoPostEnabled
                ? 'AIが自動で投稿を生成・公開しています'
                : '自動投稿は停止中です'}
            </p>
          </div>
          <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-sm px-3 py-1">
            {subscription?.plan?.name || '無料プラン'}
          </Badge>
        </div>

        {/* Hero: Auto Post + Stats Row */}
        <div className="grid lg:grid-cols-3 gap-4 mb-6">
          {/* Auto Post Status - Takes 2 columns */}
          <div className="lg:col-span-2 bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="bg-emerald-100 p-3 rounded-xl">
                  <Sparkles className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <h2 className="font-bold text-lg text-gray-900">自動投稿</h2>
                  <p className="text-sm text-gray-500">
                    {autoPostSettings?.autoPostEnabled ? 'AIが毎日自動で投稿を生成・公開中' : '自動投稿はOFFです'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <select
                  value={autoPostSettings?.autoPostFrequency || 'daily'}
                  onChange={(e) => updateAutoPost.mutate({ autoPostFrequency: e.target.value as any })}
                  className="text-sm border border-emerald-300 rounded-lg px-3 py-1.5 bg-white"
                  disabled={!autoPostSettings?.autoPostEnabled}
                >
                  <option value="daily">1日1回</option>
                  <option value="twice_daily">1日2回</option>
                  <option value="three_daily">1日3回</option>
                </select>
                <button
                  onClick={() => updateAutoPost.mutate({ autoPostEnabled: !autoPostSettings?.autoPostEnabled })}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                    autoPostSettings?.autoPostEnabled ? 'bg-emerald-500' : 'bg-gray-300'
                  }`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                    autoPostSettings?.autoPostEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>
            </div>

            {/* Connection Status Chips */}
            <div className="flex flex-wrap gap-2">
              <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full ${
                threadsAccounts && threadsAccounts.length > 0
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-orange-100 text-orange-700'
              }`}>
                <Link2 className="w-3 h-3" />
                {threadsAccounts && threadsAccounts.length > 0
                  ? `Threads連携済（${threadsAccounts.length}アカウント）`
                  : 'Threads未連携'}
              </div>
              <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full ${
                projectCount && projectCount > 0
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-orange-100 text-orange-700'
              }`}>
                <FolderOpen className="w-3 h-3" />
                {projectCount && projectCount > 0
                  ? `プロジェクト ${projectCount}件`
                  : 'プロジェクト未作成'}
              </div>
            </div>

            {/* Recent auto-posts */}
            {autoPostHistory && autoPostHistory.length > 0 && (
              <div className="mt-4 space-y-1.5">
                {autoPostHistory.slice(0, 2).map((post: any) => (
                  <div key={post.id} className="flex items-center justify-between text-sm bg-white/70 rounded-lg px-3 py-2">
                    <span className="truncate flex-1 mr-2 text-gray-600">{post.postContent?.substring(0, 40)}...</span>
                    <Badge variant={post.status === 'posted' ? 'default' : post.status === 'pending' ? 'secondary' : 'destructive'} className="text-xs">
                      {post.status === 'posted' ? '投稿済' : post.status === 'pending' ? '予約中' : '失敗'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}

            {/* CTA if not set up */}
            {(!threadsAccounts || threadsAccounts.length === 0) && (
              <Button
                className="mt-4 w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => setLocation('/threads-connect')}
              >
                <Link2 className="w-4 h-4 mr-2" />
                Threadsアカウントを連携して自動投稿を開始
              </Button>
            )}
          </div>

          {/* Stats Column */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <p className="text-gray-500 text-xs mb-1">総投稿数</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.totalPosts || 0}</p>
            </div>
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <p className="text-gray-500 text-xs mb-1">予約中</p>
              <p className="text-2xl font-bold text-gray-900">
                {stats?.postsByStatus?.find((s: any) => s.status === 'pending')?.count || 0}
              </p>
            </div>
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <p className="text-gray-500 text-xs mb-1">今月のAI生成</p>
              <p className="text-2xl font-bold text-gray-900">
                {aiUsage?.count || 0}
                {aiUsage?.limit && aiUsage.limit > 0 && (
                  <span className="text-gray-400 text-sm font-normal">/{aiUsage.limit}</span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Usage Progress Section */}
        {subscription?.plan && (
          <div className="bg-white rounded-xl p-6 border border-gray-200 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-emerald-600" />
              使用状況
            </h2>
            <div className="grid md:grid-cols-2 gap-6">
              <UsageProgress
                label="予約投稿数"
                current={stats?.postsByStatus?.find((s: any) => s.status === 'pending')?.count || 0}
                limit={subscription.plan.features.maxScheduledPosts}
                icon={<Clock className="w-4 h-4" />}
              />
              <UsageProgress
                label="プロジェクト数"
                current={projectCount || 0}
                limit={subscription.plan.features.maxProjects}
                icon={<FolderOpen className="w-4 h-4" />}
              />
              <UsageProgress
                label="連携アカウント数"
                current={threadsAccounts?.length || 0}
                limit={subscription.plan.features.maxThreadsAccounts}
                icon={<Users className="w-4 h-4" />}
              />
              <UsageProgress
                label="今月のAI生成回数"
                current={aiUsage?.count || 0}
                limit={aiUsage?.limit || 0}
                icon={<Sparkles className="w-4 h-4" />}
              />
            </div>
          </div>
        )}

        {/* Weekly Calendar View */}
        <div className="mb-8">
          <WeeklyCalendarView
            scheduledPosts={(scheduledPosts || []).map((p: any) => ({
              id: p.id,
              scheduledAt: typeof p.scheduledAt === 'string' ? p.scheduledAt : new Date(p.scheduledAt).toISOString(),
              postContent: p.postContent || '',
              status: p.status || 'pending',
            }))}
            autoPostEnabled={autoPostSettings?.enabled ?? false}
            autoPostFrequency={autoPostSettings?.frequency ?? 'daily'}
          />
        </div>

        {/* Monthly Posts Chart */}
        {stats?.monthlyPosts && stats.monthlyPosts.length > 0 && (
          <div className="bg-white rounded-xl p-6 border border-gray-200 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">月間投稿数</h2>
            <div className="space-y-3">
              {stats.monthlyPosts.map((item: any) => (
                <div key={item.month} className="flex items-center gap-4">
                  <div className="w-20 text-gray-500 text-sm">{item.month}</div>
                  <div className="flex-1">
                    <div className="h-8 bg-gray-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full flex items-center justify-end px-3"
                        style={{ width: `${Math.min((item.count / Math.max(...stats.monthlyPosts.map((m: any) => m.count))) * 100, 100)}%` }}
                      >
                        <span className="text-white text-sm font-semibold">{item.count}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Popular Templates */}
        {popularTemplates && popularTemplates.length > 0 && (
          <div className="bg-white rounded-xl p-6 border border-gray-200 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">人気テンプレート</h2>
            <div className="space-y-3">
              {popularTemplates.map((template: any, index: number) => (
                <div key={template.id} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-sm">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <p className="text-gray-900 font-medium">{template.title}</p>
                    <p className="text-gray-500 text-sm">{template.usageCount}回使用</p>
                  </div>
                  <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50">{template.category}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          {/* Subscription Status */}
          <div className="lg:col-span-2 bg-white rounded-xl p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Crown className="w-5 h-5 text-emerald-600" />
                サブスクリプション
              </h2>
              {getStatusBadge(subscription?.status || 'free')}
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <p className="text-gray-500 text-sm mb-1">現在のプラン</p>
                <p className="text-2xl font-bold text-gray-900">{subscription?.plan?.name || '無料プラン'}</p>
                {subscription?.plan?.priceMonthly ? (
                  <p className="text-gray-500">¥{subscription.plan.priceMonthly.toLocaleString()}/月</p>
                ) : null}
              </div>

              {subscription?.isTrialing && subscription?.trialEndsAt && (
                <div>
                  <p className="text-gray-500 text-sm mb-1">トライアル終了日</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {formatDate(subscription.trialEndsAt)}
                  </p>
                </div>
              )}

              {subscription?.currentPeriodEnd && !subscription?.isTrialing && (
                <div>
                  <p className="text-gray-500 text-sm mb-1">次回請求日</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {formatDate(subscription.currentPeriodEnd)}
                  </p>
                </div>
              )}
            </div>

            {subscription?.cancelAtPeriodEnd && (
              <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-yellow-800 font-medium">キャンセル予約済み</p>
                  <p className="text-yellow-700 text-sm">
                    現在の請求期間終了後にサブスクリプションが終了します。
                  </p>
                  <Button
                    variant="link"
                    className="text-yellow-700 p-0 h-auto mt-2 hover:text-yellow-900"
                    onClick={() => resumeSubscription.mutate()}
                    disabled={resumeSubscription.isPending}
                  >
                    サブスクリプションを再開する
                  </Button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-3 mt-6">
              <Button
                variant="outline"
                className="text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                onClick={() => setCouponModalOpen(true)}
              >
                <Crown className="w-4 h-4 mr-2" />
                クーポンコードを適用
              </Button>
              {subscription?.planId !== 'free' && (
                <>
                  <Button
                    variant="outline"
                    className="text-gray-700"
                    onClick={() => createPortalSession.mutate()}
                    disabled={createPortalSession.isPending}
                  >
                    <CreditCard className="w-4 h-4 mr-2" />
                    支払い情報を管理
                  </Button>
                  {!subscription?.cancelAtPeriodEnd && (
                    <Button
                      variant="ghost"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => {
                        if (confirm('本当にサブスクリプションをキャンセルしますか？')) {
                          cancelSubscription.mutate();
                        }
                      }}
                      disabled={cancelSubscription.isPending}
                    >
                      キャンセル
                    </Button>
                  )}
                </>
              )}
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => setLocation('/pricing')}
              >
                プランを変更
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-50">
                  <FileText className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-gray-500 text-sm">プロジェクト数</p>
                  <p className="text-xl font-bold text-gray-900">
                    {projectCount ?? 0}
                    {subscription?.plan?.features?.maxProjects !== -1 && (
                      <span className="text-gray-400 text-sm font-normal">
                        /{subscription?.plan?.features?.maxProjects || 3}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-50">
                  <Link2 className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-gray-500 text-sm">Threads連携</p>
                  <p className="text-xl font-bold text-gray-900">
                    {threadsAccounts?.length ?? 0}
                    {subscription?.plan?.features?.maxThreadsAccounts !== -1 && (
                      <span className="text-gray-400 text-sm font-normal">
                        /{subscription?.plan?.features?.maxThreadsAccounts || 0}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-50">
                  <Calendar className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-gray-500 text-sm">予約投稿</p>
                  <p className="text-xl font-bold text-gray-900">
                    {subscription?.plan?.features?.maxScheduledPosts === 0 ? (
                      <span className="text-gray-400 text-sm">利用不可</span>
                    ) : subscription?.plan?.features?.maxScheduledPosts === -1 ? (
                      '無制限'
                    ) : (
                      `${subscription?.plan?.features?.maxScheduledPosts || 0}件/月`
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Invoices */}
        {invoices && invoices.length > 0 && (
          <div className="bg-white rounded-xl p-6 border border-gray-200 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-600" />
              請求履歴
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-gray-500 text-sm border-b border-gray-200">
                    <th className="pb-3 font-medium">日付</th>
                    <th className="pb-3 font-medium">金額</th>
                    <th className="pb-3 font-medium">ステータス</th>
                    <th className="pb-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="border-b border-gray-100">
                      <td className="py-3 text-gray-900">
                        {new Date(invoice.created * 1000).toLocaleDateString('ja-JP')}
                      </td>
                      <td className="py-3 text-gray-900 font-medium">
                        ¥{(invoice.amount / 1).toLocaleString()}
                      </td>
                      <td className="py-3">
                        {invoice.status === 'paid' ? (
                          <span className="text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full text-xs font-medium">支払い済み</span>
                        ) : (
                          <span className="text-yellow-600 bg-yellow-50 px-2 py-1 rounded-full text-xs font-medium">{invoice.status}</span>
                        )}
                      </td>
                      <td className="py-3">
                        {invoice.invoiceUrl && (
                          <a
                            href={invoice.invoiceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-600 hover:text-emerald-700 flex items-center gap-1 text-sm"
                          >
                            詳細 <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Project Explanation */}
        <ProjectExplanation />

        {/* Quick Start Card */}
        {(!projectCount || projectCount === 0 || !threadsAccounts || threadsAccounts.length === 0) && (
          <div className="mt-8 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-6 border-2 border-emerald-200">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-8 h-8 text-emerald-600" />
              <h3 className="font-semibold text-gray-900 text-lg">最初の投稿を生成しましょう！</h3>
            </div>
            <p className="text-gray-600 text-sm mb-4">
              3ステップで簡単に始められます
            </p>
            <div className="grid md:grid-cols-3 gap-4 mb-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">1</div>
                <div>
                  <p className="text-gray-900 text-sm font-medium">プロジェクト作成</p>
                  <p className="text-gray-500 text-xs">業種を選ぶだけで自動入力</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">2</div>
                <div>
                  <p className="text-gray-900 text-sm font-medium">Threads連携</p>
                  <p className="text-gray-500 text-xs">ガイドに沿って簡単連携</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">3</div>
                <div>
                  <p className="text-gray-900 text-sm font-medium">AI生成</p>
                  <p className="text-gray-500 text-xs">プリセットから選んで生成</p>
                </div>
              </div>
            </div>
            <Button
              onClick={() => {
                if (!projectCount || projectCount === 0) {
                  setLocation('/ai-project-create');
                } else if (!threadsAccounts || threadsAccounts.length === 0) {
                  setLocation('/threads-connect');
                } else {
                  setLocation('/ai-project-create');
                }
              }}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {!projectCount || projectCount === 0 ? 'プロジェクトを作成' : !threadsAccounts || threadsAccounts.length === 0 ? 'Threadsを連携' : 'AI生成を開始'}
            </Button>
          </div>
        )}

        {/* Threads集客ガイド */}
        <div className="mt-8 bg-gradient-to-br from-emerald-900 to-teal-900 rounded-xl p-6 text-white mb-8">
          <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-300" />
            Threads集客ガイド
          </h2>
          <p className="text-emerald-200 text-sm mb-5">効果的な投稿のコツをまとめました。投稿タイプ・時間帯・ジャンルを意識して投稿しましょう。</p>
          <div className="grid md:grid-cols-3 gap-4">
            {/* 推奨投稿時間帯 */}
            <div className="bg-white/10 rounded-lg p-4">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-1">
                <Clock className="w-4 h-4 text-yellow-300" />
                推奨投稿時間帯
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-emerald-100">20〜22時</span>
                  <span className="text-yellow-300 text-xs font-bold">★★★★★ 最高</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-emerald-100">23時前後</span>
                  <span className="text-yellow-300 text-xs font-bold">★★★★★ 最高</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-emerald-100">16〜17時</span>
                  <span className="text-yellow-200 text-xs font-bold">★★★★ 高い</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-emerald-100">12〜15時</span>
                  <span className="text-emerald-200 text-xs">★★★ 普通</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-emerald-100">6〜11時</span>
                  <span className="text-emerald-300 text-xs">★★ 低い</span>
                </div>
              </div>
              <p className="text-emerald-300 text-xs mt-3">※実績データに基づく分析</p>
            </div>
            {/* 強ジャンル */}
            <div className="bg-white/10 rounded-lg p-4">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-1">
                <BarChart3 className="w-4 h-4 text-blue-300" />
                集客に強いジャンル
              </h3>
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-lg">📍</span>
                  <div>
                    <p className="text-sm font-medium">地元ネタ</p>
                    <p className="text-emerald-200 text-xs">予約につながりやすい / 地元の人に届きやすい</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-lg">📊</span>
                  <div>
                    <p className="text-sm font-medium">ビフォーアフター</p>
                    <p className="text-emerald-200 text-xs">予約につながりやすい / 写真1枚で信頼感が伝わる</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-lg">💰</span>
                  <div>
                    <p className="text-sm font-medium">お金の話題</p>
                    <p className="text-emerald-200 text-xs">多くの人に見てもらいやすい / 税金・補助金・年収</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-lg">🔥</span>
                  <div>
                    <p className="text-sm font-medium">時事ネタ</p>
                    <p className="text-emerald-200 text-xs">多くの人に見てもらいやすい / 今話題のトピックを活用</p>
                  </div>
                </div>
              </div>
            </div>
            {/* 勝ちパターン */}
            <div className="bg-white/10 rounded-lg p-4">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-1">
                <Sparkles className="w-4 h-4 text-purple-300" />
                勝ちパターンの法則
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <span className="text-emerald-300 font-bold text-xs mt-0.5">①</span>
                  <p className="text-emerald-100 text-xs">1行目で止める（12〜18文字）</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-300 font-bold text-xs mt-0.5">②</span>
                  <p className="text-emerald-100 text-xs">売り込まず「理由付き導線」</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-300 font-bold text-xs mt-0.5">③</span>
                  <p className="text-emerald-100 text-xs">当たり投稿は10本以上量産</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-300 font-bold text-xs mt-0.5">④</span>
                  <p className="text-emerald-100 text-xs">記事で伝えたいメッセージ（予約・LINE登録等）は1つに絞る</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-300 font-bold text-xs mt-0.5">⑤</span>
                  <p className="text-emerald-100 text-xs">見られる数より「誰に届くか」を大事に</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-300 font-bold text-xs mt-0.5">⑥</span>
                  <p className="text-emerald-100 text-xs">週１回振り返り：反応の良かった投稿のパターンをまた使う</p>
                </div>
              </div>
              <Button
                size="sm"
                className="mt-3 w-full bg-emerald-500 hover:bg-emerald-400 text-white border-0 text-xs"
                onClick={() => setLocation('/ai-project-create')}
              >
                <Sparkles className="w-3 h-3 mr-1" />
                AI投稿を生成する
              </Button>
            </div>
          </div>
        </div>

        {/* Quick Actions - Top 4 */}
        <div className="mt-8 grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          <button
            onClick={() => setLocation('/ai-project-create')}
            className="bg-white p-6 rounded-xl text-left hover:shadow-md transition-all border border-gray-200 group relative overflow-hidden"
          >
            <div className="absolute top-3 right-3">
              <Badge className="bg-emerald-500 text-white border-0 text-xs">
                NEW
              </Badge>
            </div>
            <div className="w-10 h-10 bg-yellow-50 rounded-lg flex items-center justify-center mb-3">
              <Sparkles className="w-5 h-5 text-yellow-600" />
            </div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-gray-900">AI投稿生成</h3>
              <HelpTooltip content="業種・地域・ターゲットを設定するだけで、プロフィール遷移→LINE登録→予約に繋がる高品質なThreads投稿をAIが自動生成します。" />
            </div>
            <p className="text-gray-500 text-sm">集客に特化した投稿を自動生成</p>
            <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-emerald-600 mt-2 transition-colors" />
          </button>

          <button
            onClick={() => setLocation('/ai-history')}
            className="bg-white p-6 rounded-xl text-left hover:shadow-md transition-all border border-gray-200 group"
          >
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center mb-3">
              <History className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-gray-900">AI生成履歴</h3>
              <HelpTooltip content="過去にAIで生成した投稿を確認・再利用できます。履歴からコピーして、簡単に再度使用することができます。" />
            </div>
            <p className="text-gray-500 text-sm">過去の生成内容を再利用</p>
            <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-emerald-600 mt-2 transition-colors" />
          </button>

          <button
            onClick={() => setLocation('/threads-connect')}
            className="bg-white p-6 rounded-xl text-left hover:shadow-md transition-all border border-gray-200 group"
          >
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center mb-3">
              <Link2 className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-1">Threads連携</h3>
            <p className="text-gray-500 text-sm">アカウントを連携して直接投稿</p>
            <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-emerald-600 mt-2 transition-colors" />
          </button>

          <button
            onClick={() => setLocation('/post-history')}
            className="bg-white p-6 rounded-xl text-left hover:shadow-md transition-all border border-gray-200 group"
          >
            <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center mb-3">
              <Calendar className="w-5 h-5 text-green-600" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-1">投稿履歴・予約</h3>
            <p className="text-gray-500 text-sm">予約投稿の管理と履歴確認</p>
            <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-emerald-600 mt-2 transition-colors" />
          </button>
        </div>
      </div>

      {/* Coupon Modal */}
      <CouponModal
        open={couponModalOpen}
        onClose={() => setCouponModalOpen(false)}
        onSuccess={() => {
          toast.success('クーポンが適用されました！');
        }}
      />

      {/* Setup Wizard */}
      <SetupWizard
        open={setupWizardOpen}
        onOpenChange={setSetupWizardOpen}
      />

      {/* Onboarding Tour */}
      <OnboardingTour
        open={onboardingOpen}
        onClose={() => setOnboardingOpen(false)}
      />

      {/* AI Chat Widget */}
      <AIChatWidget />
    </div>
  );
}
