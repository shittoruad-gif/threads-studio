import { useAuth } from '@/_core/hooks/useAuth';
import { useLang } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/lib/trpc';
import {
  CreditCard,
  Settings,
  Pencil,
  FileText,
  Calendar, 
  Link2, 
  Crown, 
  AlertCircle,
  ExternalLink,
  LogOut,
  Home,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  FolderOpen,
  Clock,
  Users,
  BarChart3,
  CheckCircle2,
  Sparkles,
  History,
  Gift,
  Coins,
  Sliders
} from 'lucide-react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { getLoginUrl } from '@/const';
import { lazy, Suspense, useEffect, useState } from 'react';
import CouponModal from '@/components/CouponModal';
import SetupChecklist from '@/components/SetupChecklist';
import PageGuide from '@/components/PageGuide';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { RELATED_SERVICES } from '@shared/relatedServices';
import TrialBanner from '@/components/TrialBanner';
import OnboardingTour from '@/components/OnboardingTour';
import ProjectExplanation from '@/components/ProjectExplanation';
import HelpTooltip from '@/components/HelpTooltip';
import { checkPostCountMilestone } from '@/components/Celebration';
import { UsageProgress } from '@/components/UsageProgress';
import SetupWizard from '@/components/SetupWizard';
import { DemoModeBanner } from '@/components/DemoModeBanner';
import { SetupProgress } from '@/components/SetupProgress';
// AIChatWidgetはmarkdownレンダラ（streamdown/shiki）を引き込み重いため遅延ロード
const AIChatWidget = lazy(() =>
  import('@/components/AIChatWidget').then((m) => ({ default: m.AIChatWidget })),
);
import ThreadsAccountSwitcher, { useThreadsAccount } from '@/components/ThreadsAccountSwitcher';
import WeeklyCalendarView from '@/components/WeeklyCalendarView';
import ErrorGuide from '@/components/ErrorGuide';
import PinnedPostRecommendation from '@/components/PinnedPostRecommendation';

export default function Dashboard() {
  const { t } = useLang();
  const { user, isAuthenticated, loading, logout } = useAuth();
  // ヘッダーの切替UIで選択中の連携アカウント（投稿・統計をこのアカウントに絞る）
  const { selectedAccountId, selectedAccount } = useThreadsAccount();
  const [location, setLocation] = useLocation();
  const [couponModalOpen, setCouponModalOpen] = useState(false);
  // ホームの「詳しいデータ」折りたたみ（スマホの縦長・ごちゃつき対策。開閉を記憶）
  const [showDetails, setShowDetails] = useState(() => {
    try { return localStorage.getItem('dashboard-details-open') === '1'; } catch { return false; }
  });
  // 解約アンケート（解約実行の前に理由を1タップで聞く）
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [cancelDetail, setCancelDetail] = useState('');
  const submitCancelFeedback = trpc.subscription.submitCancellationFeedback.useMutation();
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [setupWizardOpen, setSetupWizardOpen] = useState(false);
  const utils = trpc.useUtils();

  // Auth redirect is handled by DashboardLayout

  // Check for success parameter from Stripe checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      toast.success(t("サブスクリプションが開始されました！"));
      // Clean up URL
      window.history.replaceState({}, '', '/dashboard');
    }
  }, []);

  // Show setup wizard for new users
  const { data: setupData } = trpc.setup.getStep.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  // ★旧SetupWizardの自動表示は廃止（2026-08-13）。
  //   ウィザードのSTEP1が「渋谷区の整体院デモプロジェクト」を自動作成してしまい、
  //   ①プロジェクトが出来るためカウンセリング自動誘導（下のuseEffect）が発火しない
  //   ②ダミーの実績数字（年間1000名等）が残り事故のもと
  //   になっていた（滝本さんアカウントで実害）。登録後の最初の一歩は
  //   「プロジェクト0件 → /ai-counseling へ自動誘導」の一本に統一する。
  void setupData;

  // Show onboarding tour for new users (after setup wizard)
  // Check both server flag and localStorage for first-visit detection
  useEffect(() => {
    const onboardingDone = localStorage.getItem('onboarding-completed') === 'true';
    if (user && !user.onboardingCompleted && !onboardingDone && setupData && setupData.setupStep === 5) {
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

  // 契約時アンケート（興味のあるコンテンツ）：プロジェクトがあり未回答なら1回だけ表示
  const { data: contentInterestStatus } = trpc.survey.contentInterestStatus.useQuery(undefined, { enabled: isAuthenticated });
  const [surveyOpen, setSurveyOpen] = useState(false);
  const [surveyInterests, setSurveyInterests] = useState<string[]>([]);
  const [surveyFreeText, setSurveyFreeText] = useState('');
  const [surveyDismissed, setSurveyDismissed] = useState(false);
  const [surveySendInfo, setSurveySendInfo] = useState(true); // 登録メールに案内を送る（デフォルトON）
  const submitInterest = trpc.survey.submitContentInterest.useMutation({
    onSuccess: () => { utils.survey.contentInterestStatus.invalidate(); setSurveyOpen(false); toast.success(t("ありがとうございます！今後の改善に活かします")); },
    onError: (e) => toast.error(e.message || t('送信に失敗しました')),
  });
  useEffect(() => {
    if (surveyDismissed) return;
    if (contentInterestStatus && !contentInterestStatus.answered && projectCount && projectCount > 0) {
      // セッション内で一度きり（閉じても再表示しない）
      if (sessionStorage.getItem('contentSurveyShown') !== '1') {
        sessionStorage.setItem('contentSurveyShown', '1');
        setSurveyOpen(true);
      }
    }
  }, [contentInterestStatus, projectCount, surveyDismissed]);

  // 「登録情報を修正」導線用（先頭プロジェクトのカウンセリング編集へ直接飛ぶ）
  const { data: dashProjects } = trpc.project.list.useQuery(undefined, { enabled: isAuthenticated });
  const firstProjectId = dashProjects?.[0]?.id;
  const goEditInfo = () => {
    // 切替中アカウントの既定店舗を最優先（複数店舗で別の店の情報を開かないように）
    const targetProjectId = selectedAccount?.defaultProjectId ?? firstProjectId;
    if (targetProjectId) setLocation(`/ai-counseling?project=${targetProjectId}`);
    else setLocation('/ai-generate');
  };

  // ★登録後の最初の一歩はカウンセリング。プロジェクトが1つも無ければ自動誘導する。
  //   一度だけ実行（ユーザーが手動で /dashboard に戻った時に毎回飛ばさないよう sessionStorage で抑制）。
  useEffect(() => {
    if (!isAuthenticated) return;
    if (projectCount === 0) {
      const already = sessionStorage.getItem('counseling-redirected') === 'true';
      if (!already) {
        sessionStorage.setItem('counseling-redirected', 'true');
        setLocation('/ai-counseling');
      }
    }
  }, [isAuthenticated, projectCount, setLocation]);

  const { data: threadsAccounts } = trpc.threads.list.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const { data: stats } = trpc.stats.getUserStats.useQuery(
    { accountId: selectedAccountId },
    { enabled: isAuthenticated }
  );

  const { data: popularTemplates } = trpc.stats.getPopularTemplates.useQuery(
    { limit: 5 },
    { enabled: isAuthenticated }
  );

  // フォロワー推移（日次スナップショット。データが2日分たまると表示）
  const { data: followerTrend } = trpc.stats.followerTrend.useQuery({ accountId: selectedAccountId });
  // プロフィール診断（せっかく見られても予約に落ちない「受け皿の穴」をチェック）
  const { data: profileAudit } = trpc.stats.profileAudit.useQuery({ accountId: selectedAccountId }, { enabled: isAuthenticated });
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

  // Scheduled posts for calendar（切替中のアカウントに絞る）
  const { data: scheduledPosts } = trpc.scheduledPost.list.useQuery(
    { accountId: selectedAccountId },
    { enabled: isAuthenticated }
  );

  // Check post count milestones
  useEffect(() => {
    if (stats?.totalPosts) {
      checkPostCountMilestone(stats.totalPosts);
    }
  }, [stats?.totalPosts]);

  // Auto-post settings
  const { data: autoPostSettings } = trpc.autoPost.getSettings.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const { data: autoPostHistory } = trpc.autoPost.getHistory.useQuery(
    { limit: 5, accountId: selectedAccountId },
    { enabled: isAuthenticated }
  );

  const updateAutoPost = trpc.autoPost.updateSettings.useMutation({
    onSuccess: () => {
      utils.autoPost.getSettings.invalidate();
      toast.success(t("自動投稿設定を更新しました"));
    },
  });

  const cancelSubscription = trpc.univapay.cancelSubscription.useMutation({
    onSuccess: () => {
      toast.success(t("サブスクリプションを解約しました"));
      utils.subscription.getStatus.invalidate();
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
      active: { label: t('有効'), className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
      trialing: { label: t('トライアル中'), className: 'bg-blue-50 text-blue-700 border border-blue-200' },
      canceled: { label: t('キャンセル済み'), className: 'bg-red-50 text-red-700 border border-red-200' },
      past_due: { label: t('支払い遅延'), className: 'bg-yellow-50 text-yellow-700 border border-yellow-200' },
    };
    const badge = statusMap[status] || { label: status, className: 'bg-muted/50 text-foreground/80 border border-border' };
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
            planName={subscription.plan?.name ? t(subscription.plan.name) : t('トライアル')}
          />
        )}

        {/* カード決済失敗（past_due）→ カード再登録への強い導線 */}
        {subscription?.isPaymentPastDue && (
          <div className="mb-6 bg-red-50 border-2 border-red-300 rounded-xl p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm sm:text-base font-bold text-red-700">
                  {t("⚠️ カードのお引き落としに失敗しました")}
                </p>
                <p className="text-xs sm:text-sm text-red-600 mt-1 leading-relaxed">
                  {subscription.contractPlanName ? `「${subscription.contractPlanName}」${t('の')}` : ''}
                  {t("自動更新ができていません。サービス停止を避けるため、お早めにカード情報を再登録してください。")}
                  {t("（有効期限切れ・残高不足・利用停止などが原因として考えられます）")}
                </p>
              </div>
              <a
                href={subscription.reRegisterUrl || '/pricing'}
                {...(subscription.reRegisterUrl ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className="shrink-0 inline-flex items-center justify-center rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold px-5 py-2.5 text-sm transition-colors"
              >
                {t("カード情報を再登録する")}
              </a>
            </div>
          </div>
        )}

        {/* 承認待ちの自動投稿があれば通知（承認モードON時） */}
        {(() => {
          const awaitingCount = scheduledPosts?.filter((p) => p.status === 'awaiting_approval').length || 0;
          if (awaitingCount === 0) return null;
          return (
            <div className="mb-6 flex items-center justify-between gap-3 bg-amber-50 border-2 border-amber-200 rounded-xl p-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-amber-800">
                  ✋ {t('承認待ちの自動投稿が')} {awaitingCount} {t('件あります')}
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  {t("内容を確認して承認すると公開されます")}
                </p>
              </div>
              <Button
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
                onClick={() => setLocation('/post-history?status=awaiting_approval')}
              >
                {t("確認する")}
              </Button>
            </div>
          );
        })()}

        {/* ★連携失効の警告（自動投稿が止まる前に気づけるように） */}
        {(() => {
          if (!threadsAccounts || threadsAccounts.length === 0) return null;
          const now = Date.now();
          const DAY = 1000 * 60 * 60 * 24;
          // ★切替中のアカウントだけを判定する（別アカウントの期限切れで
          //   今見ているアカウントに赤い警告が出る混乱を防ぐ）
          const targetAccounts: any[] = selectedAccountId
            ? threadsAccounts.filter((a: any) => a.id === selectedAccountId)
            : threadsAccounts;
          const expired = targetAccounts.filter((a: any) => a.tokenExpiresAt && new Date(a.tokenExpiresAt).getTime() <= now);
          const expiringSoon = targetAccounts.filter((a: any) => {
            if (!a.tokenExpiresAt) return false;
            const d = (new Date(a.tokenExpiresAt).getTime() - now) / DAY;
            return d > 0 && d <= 7;
          });
          if (expired.length === 0 && expiringSoon.length === 0) return null;
          const isExpired = expired.length > 0;
          return (
            <div className={`mb-6 flex items-center justify-between gap-3 rounded-xl p-4 border-2 ${isExpired ? 'bg-red-50 border-red-300' : 'bg-yellow-50 border-yellow-300'}`}>
              <div className="flex items-start gap-2 min-w-0">
                <AlertCircle className={`w-5 h-5 shrink-0 mt-0.5 ${isExpired ? 'text-red-500' : 'text-yellow-600'}`} />
                <div className="min-w-0">
                  <p className={`text-sm font-bold ${isExpired ? 'text-red-800' : 'text-yellow-800'}`}>
                    {isExpired
                      ? `⚠️ ${t('Threads連携が切れています（')}${expired.length}${t('件）— 自動投稿が停止しています')}`
                      : `${t('Threads連携の期限が近づいています（')}${expiringSoon.length}${t('件）')}`}
                  </p>
                  <p className={`text-xs mt-0.5 ${isExpired ? 'text-red-700' : 'text-yellow-700'}`}>
                    {isExpired
                      ? t('連携を更新すると自動投稿が再開します。')
                      : t('期限が切れると自動投稿が止まります。早めの更新がおすすめです。')}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                className={`shrink-0 text-white ${isExpired ? 'bg-red-600 hover:bg-red-700' : 'bg-yellow-600 hover:bg-yellow-700'}`}
                onClick={() => setLocation('/threads-connect')}
              >
                {t("連携を更新する")}
              </Button>
            </div>
          );
        })()}

        {/* ★投稿失敗の警告（メール通知だけでなくアプリ内でも気づけるように・直近14日） */}
        {(() => {
          const now = Date.now();
          const DAY = 1000 * 60 * 60 * 24;
          const recentFailed = (scheduledPosts || []).filter((p: any) => {
            if (p.status !== 'failed') return false;
            const ts = p.scheduledAt ? new Date(p.scheduledAt).getTime() : now;
            return now - ts <= 14 * DAY;
          });
          if (recentFailed.length === 0) return null;
          return (
            <div className="mb-6 flex items-center justify-between gap-3 bg-red-50 border-2 border-red-200 rounded-xl p-4">
              <div className="flex items-start gap-2 min-w-0">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-500" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-red-800">
                    {t('投稿に失敗した予約が')} {recentFailed.length} {t('件あります')}
                  </p>
                  <p className="text-xs text-red-700 mt-0.5">
                    {t("原因と対処方法を確認して、再投稿または連携の更新を行えます。")}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-white shrink-0"
                onClick={() => setLocation('/post-history?status=failed')}
              >
                {t("確認する")}
              </Button>
            </div>
          );
        })()}

        {/* Pinned post recommendation (auto-hides once user creates one) */}
        <PinnedPostRecommendation />

        {/* Welcome + Plan Badge */}
        {/* スマホでtruncateすると「ようこそ...」と名前が消えるため、縦積み＋折返しにする */}
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground leading-snug">{t('ようこそ、')}{user?.name || t('ユーザー')}{t('さん')}</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {!threadsAccounts || threadsAccounts.length === 0
                ? t('まずはThreadsを連携して、投稿の自動化を始めましょう')
                : autoPostSettings?.autoPostEnabled
                  ? t('AIが毎日自動で投稿を生成・公開しています')
                  : t('準備OK！自動投稿をONにすると毎日自動で投稿されます')}
            </p>
          </div>
          <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-sm px-3 py-1 shrink-0 self-start">
            {subscription?.plan?.name ? t(subscription.plan.name) : t('無料プラン')}
          </Badge>
        </div>

        {/* ★よく使う操作への大きな入口（メニューを探さなくても1タップで届くように）。
            スマホ375pxでは1枚162px幅なので、アイコンは見出しの上に置いて
            見出しが途中で折れないようにする。高さも揃える。 */}
        <div className="mb-6 grid grid-cols-2 gap-3">
          {[
            { icon: CheckCircle2, color: 'text-emerald-600', title: '投稿を確認する', desc: '承認待ちの投稿を見て公開します', onClick: () => setLocation('/post-history?status=awaiting_approval'), primary: true },
            { icon: Sparkles, color: 'text-amber-500', title: '投稿を作る', desc: 'AIが投稿を作ります（固定投稿もここ）', onClick: () => setLocation('/ai-generate') },
            { icon: Pencil, color: 'text-blue-500', title: 'お店の情報', desc: 'メニューや強みを直します', onClick: goEditInfo },
            { icon: BarChart3, color: 'text-violet-500', title: '反応を見る', desc: 'どの投稿が見られたか分かります', onClick: () => setLocation('/post-analytics') },
          ].map(({ icon: Icon, color, title, desc, onClick, primary }) => (
            <button
              key={title}
              onClick={onClick}
              className={`flex h-full flex-col items-start gap-1.5 rounded-xl border-2 p-4 text-left transition-colors ${
                primary
                  ? 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/20'
                  : 'border-border bg-card hover:bg-muted/50'
              }`}
            >
              <Icon className={`h-6 w-6 shrink-0 ${color}`} />
              {/* 375pxでは1枚162px幅。16pxだと「投稿を確認する」が2行に折れるため15pxに */}
              <span className="font-bold text-foreground leading-snug text-[15px] sm:text-base">{t(title)}</span>
              <span className="text-xs text-muted-foreground leading-snug">{t(desc)}</span>
            </button>
          ))}
        </div>

        {/* 毎回表示の操作ガイド（オフ切替可）。毎日の運用手順を1画面目で思い出せるように */}
        <PageGuide steps={[
          <>毎日やることは1つ：下の<b>「予約・履歴」</b>→<b>「承認待ち」</b>→内容を見て<b>「承認して投稿」</b>（約1分）</>,
          <>週1回、<b>「投稿分析」</b>で数字と<b>「コメント管理」</b>の返信を確認します</>,
          <>お店の情報が変わったら<b>「登録情報を修正」</b>から直します（次の投稿から反映）</>,
        ]} />

        {/* 初心者向け「次にやること」チェックリスト（順番固定・実データ連動） */}
        <SetupChecklist
          threadsConnected={!!threadsAccounts && threadsAccounts.length > 0}
          hasProject={!!projectCount && projectCount > 0}
          autoPostOn={!!autoPostSettings?.autoPostEnabled}
          onNavigate={setLocation}
          onEnableAutoPost={() => updateAutoPost.mutate({ autoPostEnabled: true })}
          enablingAutoPost={updateAutoPost.isPending}
        />

        {/* Hero: Auto Post + Stats Row */}
        <div className="grid lg:grid-cols-3 gap-4 mb-6">
          {/* Auto Post Status - Takes 2 columns */}
          <div className="lg:col-span-2 min-w-0 bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-200 rounded-xl p-6" data-tour="auto-post">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="bg-emerald-100 p-3 rounded-xl shrink-0">
                  <Sparkles className="w-6 h-6 text-emerald-600" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h2 className="font-bold text-lg text-foreground">{t("自動投稿")}</h2>
                    <HelpTooltip content={t("ONにすると、AIが毎日自動で投稿を生成してThreadsに投稿します")} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {autoPostSettings?.autoPostEnabled ? t('AIが毎日自動で投稿を生成・公開中') : t('自動投稿はOFFです')}
                  </p>
                  {/* 自動投稿のON/OFF・頻度・承認モードはユーザー単位の設定で、
                      アカウントを切り替えても共通。誤解を避けるため明示する */}
                  {threadsAccounts && threadsAccounts.length > 1 && (
                    <p className="text-xs text-muted-foreground/80 mt-0.5">
                      {t('※このON/OFFは連携中の全アカウント共通です')}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-1">
                  <HelpTooltip content={t("1日に投稿する回数です。多いほど認知が広がりますが、3回/日が推奨です")} side="left" />
                  <select
                    value={autoPostSettings?.autoPostFrequency || 'daily'}
                    onChange={(e) => updateAutoPost.mutate({ autoPostFrequency: e.target.value as any })}
                    className="text-sm border border-emerald-300 rounded-lg px-3 py-1.5 bg-white"
                    disabled={!autoPostSettings?.autoPostEnabled}
                  >
                    {(() => {
                      const maxPerDay = subscription?.plan?.features?.maxAutoPostsPerDay ?? 0;
                      return (
                        <>
                          <option value="daily">{t("1日1回")}</option>
                          <option value="twice_daily" disabled={maxPerDay < 2}>{t('1日2回')}{maxPerDay < 2 ? t('（上位プラン）') : ''}</option>
                          <option value="three_daily" disabled={maxPerDay < 3}>{t('1日3回')}{maxPerDay < 3 ? t('（上位プラン）') : ''}</option>
                        </>
                      );
                    })()}
                  </select>
                </div>
                <button
                  onClick={() => updateAutoPost.mutate({ autoPostEnabled: !autoPostSettings?.autoPostEnabled })}
                  aria-label={autoPostSettings?.autoPostEnabled ? t('自動投稿をオフにする') : t('自動投稿をオンにする')}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                    autoPostSettings?.autoPostEnabled ? 'bg-emerald-500' : 'bg-muted-foreground/40'
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
                {/* ★いま表示しているアカウント名を出す（全体件数だと切替が伝わらない） */}
                {threadsAccounts && threadsAccounts.length > 0
                  ? (selectedAccount ? `@${selectedAccount.threadsUsername}` : `${t('Threads連携済（')}${threadsAccounts.length}${t('アカウント）')}`)
                  : t('Threads未連携')}
              </div>
              <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full ${
                projectCount && projectCount > 0
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-orange-100 text-orange-700'
              }`}>
                <FolderOpen className="w-3 h-3" />
                {projectCount && projectCount > 0
                  ? `${t('プロジェクト')} ${projectCount}${t('件')}`
                  : t('プロジェクト未作成')}
              </div>
            </div>

            {/* Token expiry warning */}
            {threadsAccounts && threadsAccounts.length > 0 && (() => {
              // ★切替中のアカウントの期限を表示（全アカウントの最短ではなく）
              const scope: any[] = selectedAccountId
                ? threadsAccounts.filter((a: any) => a.id === selectedAccountId)
                : threadsAccounts;
              const soonestExpiry = scope
                .filter((a: any) => a.tokenExpiresAt)
                .map((a: any) => new Date(a.tokenExpiresAt).getTime())
                .sort((a: number, b: number) => a - b)[0];
              if (!soonestExpiry) return null;
              const daysLeft = Math.ceil((soonestExpiry - Date.now()) / (1000 * 60 * 60 * 24));
              if (daysLeft > 7) return null;
              return (
                <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
                  daysLeft <= 3 ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}>
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>
                    {daysLeft <= 0
                      ? t('Threadsトークンが期限切れです。再連携してください。')
                      : `${t('Threadsトークンが')}${daysLeft}${t('日後に期限切れになります。')}`}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-6 px-2 text-xs"
                    onClick={() => setLocation('/threads-connect')}
                  >
                    {t("再連携")}
                  </Button>
                </div>
              );
            })()}

            {/* Recent auto-posts */}
            {autoPostHistory && autoPostHistory.length > 0 && (
              <div className="mt-4 space-y-1.5">
                {autoPostHistory.slice(0, 2).map((post: any) => (
                  <button
                    key={post.id}
                    onClick={() => setLocation('/post-history')}
                    className="w-full flex items-center justify-between text-sm bg-white/70 rounded-lg px-3 py-2 hover:bg-white transition-colors text-left"
                  >
                    <span className="truncate flex-1 min-w-0 mr-2 text-muted-foreground">{post.postContent?.substring(0, 40)}...</span>
                    <Badge variant={post.status === 'posted' ? 'default' : post.status === 'pending' ? 'secondary' : 'destructive'} className="text-xs shrink-0">
                      {post.status === 'posted' ? t('投稿済') : post.status === 'pending' ? t('予約中') : t('失敗')}
                    </Badge>
                  </button>
                ))}
              </div>
            )}

            {/* 予約投稿の個別管理への導線 */}
            {autoPostHistory && autoPostHistory.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-full bg-white/70"
                onClick={() => setLocation('/post-history?status=pending')}
              >
                <Calendar className="w-4 h-4 mr-2" />
                {t("予約投稿を管理（個別に停止・削除）")}
                <ChevronRight className="w-4 h-4 ml-auto" />
              </Button>
            )}

            {/* Error guide for failed posts */}
            {autoPostHistory && autoPostHistory.some((post: any) => post.status === 'failed') && (
              <div className="mt-3">
                <ErrorGuide
                  type="post-failed"
                  onRetry={() => setLocation('/post-history')}
                  compact
                />
              </div>
            )}

            {/* CTA if not set up */}
            {(!threadsAccounts || threadsAccounts.length === 0) && (
              <Button
                className="mt-4 w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => setLocation('/threads-connect')}
              >
                <Link2 className="w-4 h-4 mr-2" />
                {t("Threadsアカウントを連携して自動投稿を開始")}
              </Button>
            )}
          </div>

          {/* Stats Column */}
          {/* スマホは縦に3枚並べず、コンパクトな横3列にする（縦長対策） */}
          <div className="grid grid-cols-3 gap-2 lg:flex lg:flex-col lg:gap-4 min-w-0">
            <div className="lg:flex-1 flex flex-col justify-center bg-background rounded-xl p-3 lg:p-4 border border-border">
              <p className="text-muted-foreground text-xs mb-1">{t("総投稿数")}</p>
              <p className="text-xl lg:text-2xl font-bold text-foreground">{stats?.totalPosts || 0}</p>
            </div>
            <div className="lg:flex-1 flex flex-col justify-center bg-background rounded-xl p-3 lg:p-4 border border-border">
              <p className="text-muted-foreground text-xs mb-1">{t("予約中")}</p>
              <p className="text-xl lg:text-2xl font-bold text-foreground">
                {stats?.postsByStatus?.find((s: any) => s.status === 'pending')?.count || 0}
              </p>
            </div>
            <div className="lg:flex-1 flex flex-col justify-center bg-background rounded-xl p-3 lg:p-4 border border-border">
              <p className="text-muted-foreground text-xs mb-1">{t("今月のAI生成")}</p>
              <p className="text-xl lg:text-2xl font-bold text-foreground">
                {aiUsage?.count || 0}
                {aiUsage?.limit && aiUsage.limit > 0 && (
                  <span className="text-muted-foreground/60 text-sm font-normal">/{aiUsage.limit}</span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* フォロワーの伸び（日次スナップショットが2日分たまると表示） */}
        {followerTrend && followerTrend.trend.length >= 2 && (
          <div className="bg-background rounded-xl p-6 border border-border mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  {t("📈 フォロワーの伸び")}
                </h2>
                <p className="text-3xl font-bold text-foreground mt-1">
                  {followerTrend.latest.toLocaleString()}
                  <span className="text-sm font-normal text-muted-foreground ml-1">{t("人")}</span>
                </p>
                <p className={`text-sm font-medium mt-0.5 ${followerTrend.weeklyDelta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {followerTrend.weeklyDelta >= 0 ? '+' : ''}{followerTrend.weeklyDelta.toLocaleString()} {t('この1週間')}
                </p>
              </div>
              {/* 軽量SVGスパークライン（ライブラリ不使用） */}
              <div className="flex-1 min-w-0">
                {(() => {
                  const pts = followerTrend.trend;
                  const w = 320, h = 64, pad = 4;
                  const min = Math.min(...pts.map((p) => p.followers));
                  const max = Math.max(...pts.map((p) => p.followers));
                  const range = Math.max(1, max - min);
                  const coords = pts.map((p, i) => {
                    const x = pad + (i * (w - pad * 2)) / Math.max(1, pts.length - 1);
                    const y = h - pad - ((p.followers - min) * (h - pad * 2)) / range;
                    return `${x.toFixed(1)},${y.toFixed(1)}`;
                  });
                  return (
                    <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-sm h-16" preserveAspectRatio="none" role="img" aria-label={t("フォロワー数の推移グラフ")}>
                      <polyline
                        points={coords.join(' ')}
                        fill="none"
                        stroke="#10b981"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <circle
                        cx={coords[coords.length - 1]?.split(',')[0]}
                        cy={coords[coords.length - 1]?.split(',')[1]}
                        r="3.5"
                        fill="#10b981"
                      />
                    </svg>
                  );
                })()}
                <p className="text-xs text-muted-foreground mt-1">
                  {t('直近')}{followerTrend.trend.length}{t('日間（毎朝7時に自動記録）')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* プロフィール診断：受け皿の穴があるときだけ表示（3点チェック） */}
        {profileAudit?.hasProject && profileAudit?.hasAccounts &&
          (!profileAudit.linksOk || !profileAudit.bioAreaOk || !profileAudit.pinnedOk) && (
          <div className="mb-8 rounded-xl border-2 border-sky-200 bg-sky-50 p-4 sm:p-5">
            <p className="text-sm sm:text-base font-bold text-sky-800 mb-1">
              {t("🩺 かんたんプロフィール診断 — あと少しで「見られた人」を予約につなげられます")}
            </p>
            <p className="text-xs text-sky-700 mb-3">
              {t("投稿がたくさんの人に届いても、プロフィールの準備ができていないと予約につながりません。以下の3つを整えましょう。")}
            </p>
            <div className="space-y-2">
              <div className="flex items-start gap-2 text-sm">
                <span>{profileAudit.linksOk ? '✅' : '⬜️'}</span>
                <div className="min-w-0 flex-1">
                  <span className={profileAudit.linksOk ? 'text-muted-foreground line-through' : 'text-foreground font-medium'}>
                    {t("予約・LINEのリンクを登録する")}
                  </span>
                  {!profileAudit.linksOk && (
                    <button className="ml-2 text-xs text-emerald-700 underline" onClick={goEditInfo}>
                      {t("登録画面をひらく")}
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-start gap-2 text-sm">
                <span>{profileAudit.bioAreaOk ? '✅' : '⬜️'}</span>
                <div className="min-w-0 flex-1">
                  <span className={profileAudit.bioAreaOk ? 'text-muted-foreground line-through' : 'text-foreground font-medium'}>
                    {t('Threadsの自己紹介文に地域名')}{profileAudit.areaHint ? `（${profileAudit.areaHint}）` : ''}{t('を入れる')}
                  </span>
                  {!profileAudit.bioAreaOk && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("Threadsアプリ →「プロフィール」→「プロフィールを編集」→ 自己紹介に地域名を追加。地元の人が「近所のお店だ！」と気づけるようになります")}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-start gap-2 text-sm">
                <span>{profileAudit.pinnedOk ? '✅' : '⬜️'}</span>
                <div className="min-w-0 flex-1">
                  <span className={profileAudit.pinnedOk ? 'text-muted-foreground line-through' : 'text-foreground font-medium'}>
                    {t("固定投稿（お店の入口になる投稿）を作る")}
                  </span>
                  {!profileAudit.pinnedOk && (
                    <button
                      className="ml-2 text-xs text-emerald-700 underline"
                      onClick={() => setLocation('/ai-generate?postType=pinned')}
                    >
                      {t("固定投稿をAIで作る（3分）")}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 承認モードの状態（自動投稿がONのときに常時表示。ここから即切替できる） */}
        {autoPostSettings?.autoPostEnabled && (
          <div className={`mb-8 rounded-xl border-2 p-4 sm:p-5 ${
            autoPostSettings.autoPostRequireApproval
              ? 'bg-emerald-50 border-emerald-200'
              : 'bg-amber-50 border-amber-200'
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
              <div className="min-w-0 flex-1">
                {/* flexだとラベル折返し時に「オン」が縦1文字に潰れるため、インラインで続ける */}
                <p className="text-sm sm:text-base font-bold text-foreground leading-snug">
                  {t("🛡 投稿前チェック（承認モード）：")}
                  <span className={`whitespace-nowrap ${autoPostSettings.autoPostRequireApproval ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {autoPostSettings.autoPostRequireApproval ? t('オン') : t('オフ')}
                  </span>
                </p>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1 leading-relaxed">
                  {autoPostSettings.autoPostRequireApproval
                    ? t('自動で作られた投稿は「承認待ち」に入り、あなたが内容を確認して承認するまで公開されません。安心して運用できます。')
                    : t('現在、自動で作られた投稿は確認なしでそのまま公開されます。オンにすると、公開前にあなたが1件ずつ内容をチェックできます。')}
                  {threadsAccounts && threadsAccounts.length > 1 && (
                    <span className="block mt-1 text-muted-foreground/80">{t('※この設定は連携中の全アカウント共通です')}</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground">{t("公開前に確認する")}</span>
                <Switch
                  checked={autoPostSettings.autoPostRequireApproval ?? false}
                  onCheckedChange={(v) => updateAutoPost.mutate({ autoPostRequireApproval: v })}
                  disabled={updateAutoPost.isPending}
                  aria-label={t("公開前に承認するモードの切り替え")}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── ここから下は「詳しいデータ」。最初は閉じてホームを1〜2画面に収める ── */}
        <div className="mb-8">
          <Button
            variant="outline"
            className="w-full justify-center"
            onClick={() => {
              const next = !showDetails;
              setShowDetails(next);
              try { localStorage.setItem('dashboard-details-open', next ? '1' : '0'); } catch { /* ignore */ }
            }}
          >
            {showDetails ? t('詳しいデータを閉じる') : t('詳しいデータ・その他の機能を見る')}
            {showDetails ? <ChevronUp className="ml-1 w-4 h-4" /> : <ChevronDown className="ml-1 w-4 h-4" />}
          </Button>
        </div>
        {showDetails && (<>
        {/* Usage Progress Section */}
        {subscription?.plan && (
          <div className="bg-background rounded-xl p-6 border border-border mb-8">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-emerald-600" />
              {t("使用状況")}
            </h2>
            <div className="grid md:grid-cols-2 gap-6">
              <UsageProgress
                label={t("予約投稿数")}
                current={stats?.postsByStatus?.find((s: any) => s.status === 'pending')?.count || 0}
                limit={subscription.plan.features.maxScheduledPosts}
                icon={<Clock className="w-4 h-4" />}
              />
              <UsageProgress
                label={t("プロジェクト数")}
                current={projectCount || 0}
                limit={subscription.plan.features.maxProjects}
                icon={<FolderOpen className="w-4 h-4" />}
              />
              <UsageProgress
                label={t("連携アカウント数")}
                current={threadsAccounts?.length || 0}
                limit={subscription.plan.features.maxThreadsAccounts}
                icon={<Users className="w-4 h-4" />}
              />
              <UsageProgress
                label={t("今月のAI生成回数")}
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
            autoPostEnabled={autoPostSettings?.autoPostEnabled ?? false}
            autoPostFrequency={autoPostSettings?.autoPostFrequency ?? 'daily'}
          />
        </div>

        {/* Monthly Posts Chart */}
        {stats?.monthlyPosts && stats.monthlyPosts.length > 0 && (
          <div className="bg-background rounded-xl p-6 border border-border mb-8">
            <h2 className="text-lg font-semibold text-foreground mb-4">{t("月間投稿数")}</h2>
            <div className="space-y-3">
              {stats.monthlyPosts.map((item: any) => (
                <div key={item.month} className="flex items-center gap-4">
                  <div className="w-20 text-muted-foreground text-sm">{item.month}</div>
                  <div className="flex-1">
                    <div className="h-8 bg-muted rounded-full overflow-hidden">
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
          <div className="bg-background rounded-xl p-6 border border-border mb-8">
            <h2 className="text-lg font-semibold text-foreground mb-4">{t("人気テンプレート")}</h2>
            <div className="space-y-3">
              {popularTemplates.map((template: any, index: number) => (
                <div key={template.id} className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-sm">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <p className="text-foreground font-medium">{template.title}</p>
                    <p className="text-muted-foreground text-sm">{template.usageCount}{t('回使用')}</p>
                  </div>
                  <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50">{template.category}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          {/* Subscription Status */}
          <div className="lg:col-span-2 bg-background rounded-xl p-6 border border-border">
            {/* スマホで見出しが途中折れ＋バッジが浮くのを防ぐ（折返し許可・nowrap見出し） */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Crown className="w-5 h-5 text-emerald-600 shrink-0" />
                <span className="whitespace-nowrap">{t("契約プラン")}</span>
              </h2>
              {getStatusBadge(subscription?.status || 'free')}
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <p className="text-muted-foreground text-sm mb-1">{t("現在のプラン")}</p>
                <p className="text-2xl font-bold text-foreground">{subscription?.plan?.name ? t(subscription.plan.name) : t('無料プラン')}</p>
                {subscription?.plan?.priceMonthly ? (
                  <p className="text-muted-foreground">¥{subscription.plan.priceMonthly.toLocaleString()}{t('/月')}</p>
                ) : null}
              </div>

              {subscription?.isTrialing && subscription?.trialEndsAt && (
                <div>
                  <p className="text-muted-foreground text-sm mb-1">{t("トライアル終了日")}</p>
                  <p className="text-lg font-semibold text-foreground">
                    {formatDate(subscription.trialEndsAt)}
                  </p>
                </div>
              )}

              {subscription?.currentPeriodEnd && !subscription?.isTrialing && (
                <div>
                  <p className="text-muted-foreground text-sm mb-1">{t("次回請求日")}</p>
                  <p className="text-lg font-semibold text-foreground">
                    {formatDate(subscription.currentPeriodEnd)}
                  </p>
                </div>
              )}
            </div>

            {subscription?.cancelAtPeriodEnd && (
              <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-yellow-800 font-medium">{t("解約済み")}</p>
                  <p className="text-yellow-700 text-sm">
                    {t("現在の請求期間終了後にサブスクリプションが終了します。")}
                    {t("再度ご利用になる場合は、料金プランから再登録してください。")}
                  </p>
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
                {t("クーポンコードを適用")}
              </Button>
              {subscription?.planId !== 'free' && !subscription?.cancelAtPeriodEnd && (
                <Button
                  variant="ghost"
                  className="text-red-500 hover:text-red-700 hover:bg-red-50"
                  onClick={() => {
                    setCancelReason('');
                    setCancelDetail('');
                    setCancelDialogOpen(true);
                  }}
                  disabled={cancelSubscription.isPending}
                >
                  {t("解約する")}
                </Button>
              )}
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => setLocation('/pricing')}
              >
                {t("プランを変更")}
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="flex flex-col gap-4">
            <div className="flex-1 flex items-center bg-background rounded-xl p-4 border border-border">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-50">
                  <FileText className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-muted-foreground text-sm">{t("プロジェクト数")}</p>
                  <p className="text-xl font-bold text-foreground">
                    {projectCount ?? 0}
                    {subscription?.plan?.features?.maxProjects !== -1 && (
                      <span className="text-muted-foreground/60 text-sm font-normal">
                        /{subscription?.plan?.features?.maxProjects || 3}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 flex items-center bg-background rounded-xl p-4 border border-border">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-50">
                  <Link2 className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-muted-foreground text-sm">{t("Threads連携")}</p>
                  <p className="text-xl font-bold text-foreground">
                    {threadsAccounts?.length ?? 0}
                    {subscription?.plan?.features?.maxThreadsAccounts !== -1 && (
                      <span className="text-muted-foreground/60 text-sm font-normal">
                        /{subscription?.plan?.features?.maxThreadsAccounts || 0}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 flex items-center bg-background rounded-xl p-4 border border-border">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-50">
                  <Calendar className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-muted-foreground text-sm">{t("予約投稿")}</p>
                  <p className="text-xl font-bold text-foreground">
                    {subscription?.plan?.features?.maxScheduledPosts === 0 ? (
                      <span className="text-muted-foreground/60 text-sm">{t("利用不可")}</span>
                    ) : subscription?.plan?.features?.maxScheduledPosts === -1 ? (
                      t('無制限')
                    ) : (
                      `${subscription?.plan?.features?.maxScheduledPosts || 0}${t('件/月')}`
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Invoices */}
        {invoices && invoices.length > 0 && (
          <div className="bg-background rounded-xl p-6 border border-border mb-8">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-600" />
              {t("請求履歴")}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-muted-foreground text-sm border-b border-border">
                    <th className="pb-3 font-medium">{t("日付")}</th>
                    <th className="pb-3 font-medium">{t("金額")}</th>
                    <th className="pb-3 font-medium">{t("ステータス")}</th>
                    <th className="pb-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="border-b border-border/50">
                      <td className="py-3 text-foreground">
                        {new Date(invoice.created * 1000).toLocaleDateString('ja-JP')}
                      </td>
                      <td className="py-3 text-foreground font-medium">
                        ¥{(invoice.amount / 1).toLocaleString()}
                      </td>
                      <td className="py-3">
                        {invoice.status === 'paid' ? (
                          <span className="text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full text-xs font-medium">{t("支払い済み")}</span>
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
                            {t('詳細')} <ExternalLink className="w-3 h-3" />
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
        {/* 旧「最初の投稿を生成しましょう」カードは、最上部のSetupChecklistに統合済み（手順の二重表示・順序食い違いの解消） */}

        {/* Threads集客ガイド */}
        <div className="mt-8 bg-gradient-to-br from-emerald-900 to-teal-900 rounded-xl p-6 text-white mb-8">
          <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-300" />
            {t("Threads集客ガイド")}
          </h2>
          <p className="text-emerald-200 text-sm mb-5">{t("効果的な投稿のコツをまとめました。投稿タイプ・時間帯・ジャンルを意識して投稿しましょう。")}</p>
          <div className="grid md:grid-cols-3 gap-4">
            {/* 推奨投稿時間帯 */}
            <div className="bg-white/10 rounded-lg p-4">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-1">
                <Clock className="w-4 h-4 text-yellow-300" />
                {t("推奨投稿時間帯")}
              </h3>
              {/* 実測データ（114アカウント・12.9万投稿の分析）と同期。自動投稿の時刻設定とも一致させる */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-emerald-100">{t("15時台")}</span>
                  <span className="text-yellow-300 text-xs font-bold">{t("★★★★★ 最高")}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-emerald-100">{t("21時台")}</span>
                  <span className="text-yellow-300 text-xs font-bold">{t("★★★★★ 最高")}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-emerald-100">{t("22〜23時")}</span>
                  <span className="text-yellow-200 text-xs font-bold">{t("★★★★ 高い")}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-emerald-100">{t("昼12時前後")}</span>
                  <span className="text-emerald-300 text-xs">{t("★★ 低い")}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-emerald-100">{t("朝7〜10時")}</span>
                  <span className="text-emerald-300 text-xs">{t("★★ 低い")}</span>
                </div>
              </div>
              <p className="text-emerald-300 text-xs mt-3">{t("※114アカウント・12.9万投稿の実測データ")}</p>
            </div>
            {/* 強ジャンル */}
            <div className="bg-white/10 rounded-lg p-4">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-1">
                <BarChart3 className="w-4 h-4 text-blue-300" />
                {t("集客に強いジャンル")}
              </h3>
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-lg">📍</span>
                  <div>
                    <p className="text-sm font-medium">{t("地元ネタ")}</p>
                    <p className="text-emerald-200 text-xs">{t("予約につながりやすい / 地元の人に届きやすい")}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-lg">📊</span>
                  <div>
                    <p className="text-sm font-medium">{t("ビフォーアフター")}</p>
                    <p className="text-emerald-200 text-xs">{t("予約につながりやすい / 写真1枚で信頼感が伝わる")}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-lg">💰</span>
                  <div>
                    <p className="text-sm font-medium">{t("お金の話題")}</p>
                    <p className="text-emerald-200 text-xs">{t("多くの人に見てもらいやすい / 税金・補助金・年収")}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-lg">🔥</span>
                  <div>
                    <p className="text-sm font-medium">{t("時事ネタ")}</p>
                    <p className="text-emerald-200 text-xs">{t("多くの人に見てもらいやすい / 今話題のトピックを活用")}</p>
                  </div>
                </div>
              </div>
            </div>
            {/* 勝ちパターン */}
            <div className="bg-white/10 rounded-lg p-4">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-1">
                <Sparkles className="w-4 h-4 text-purple-300" />
                {t("勝ちパターンの法則")}
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <span className="text-emerald-300 font-bold text-xs mt-0.5">①</span>
                  <p className="text-emerald-100 text-xs">{t("1行目で止める（12〜18文字）")}</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-300 font-bold text-xs mt-0.5">②</span>
                  <p className="text-emerald-100 text-xs">{t("売り込まず「理由付き導線」")}</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-300 font-bold text-xs mt-0.5">③</span>
                  <p className="text-emerald-100 text-xs">{t("当たり投稿は10本以上量産")}</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-300 font-bold text-xs mt-0.5">④</span>
                  <p className="text-emerald-100 text-xs">{t("記事で伝えたいメッセージ（予約・LINE登録等）は1つに絞る")}</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-300 font-bold text-xs mt-0.5">⑤</span>
                  <p className="text-emerald-100 text-xs">{t("見られる数より「誰に届くか」を大事に")}</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-300 font-bold text-xs mt-0.5">⑥</span>
                  <p className="text-emerald-100 text-xs">{t("週１回振り返り：反応の良かった投稿のパターンをまた使う")}</p>
                </div>
              </div>
              <Button
                size="sm"
                className="mt-3 w-full bg-emerald-500 hover:bg-emerald-400 text-white border-0 text-xs"
                onClick={() => setLocation('/ai-generate')}
              >
                <Sparkles className="w-3 h-3 mr-1" />
                {t("AI投稿を生成する")}
              </Button>
            </div>
          </div>
        </div>

        {/* Quick Actions - Top 4 */}
        <div className="mt-8 grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* /ai-generate は既存プロジェクトへ自動で入る（無ければ新規作成へ）。
              直接 /ai-project-create に飛ばすと既存ユーザーに空のカウンセリングが
              表示され「入力が消えた」ように見えるため必ずこちらを経由する */}
          <button
            onClick={() => setLocation('/ai-generate')}
            className="bg-background p-6 rounded-xl text-left hover:shadow-md transition-all border border-border group relative overflow-hidden"
            data-tour="ai-generate"
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
              <h3 className="font-semibold text-foreground">{t("AI投稿生成")}</h3>
              <HelpTooltip content={t("業種・地域・ターゲットを設定するだけで、プロフィール遷移→LINE登録→予約に繋がる高品質なThreads投稿をAIが自動生成します。")} />
            </div>
            <p className="text-muted-foreground text-sm">{t("集客に特化した投稿を自動生成")}</p>
            <ChevronRight className="w-5 h-5 text-muted-foreground/40 group-hover:text-emerald-600 mt-2 transition-colors" />
          </button>

          {projectCount && projectCount > 0 ? (
            <button
              onClick={goEditInfo}
              className="bg-background p-6 rounded-xl text-left hover:shadow-md transition-all border border-border group"
            >
              <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center mb-3">
                <Pencil className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-foreground">{t("登録情報を修正")}</h3>
                <HelpTooltip content={t("お店の情報・カウンセリングの回答・予約/LINEのリンクを、いつでもまとめて修正できます。間違って入力した場合はここから直してください。")} />
              </div>
              <p className="text-muted-foreground text-sm">{t("店舗情報・カウンセリング・リンクを直す")}</p>
              <ChevronRight className="w-5 h-5 text-muted-foreground/40 group-hover:text-emerald-600 mt-2 transition-colors" />
            </button>
          ) : null}

          <button
            onClick={() => setLocation('/ai-history')}
            className="bg-background p-6 rounded-xl text-left hover:shadow-md transition-all border border-border group"
          >
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center mb-3">
              <History className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-foreground">{t("AI生成履歴")}</h3>
              <HelpTooltip content={t("過去にAIで生成した投稿を確認・再利用できます。履歴からコピーして、簡単に再度使用することができます。")} />
            </div>
            <p className="text-muted-foreground text-sm">{t("過去の生成内容を再利用")}</p>
            <ChevronRight className="w-5 h-5 text-muted-foreground/40 group-hover:text-emerald-600 mt-2 transition-colors" />
          </button>

          <button
            onClick={() => setLocation('/threads-connect')}
            className="bg-background p-6 rounded-xl text-left hover:shadow-md transition-all border border-border group"
            data-tour="threads-connect"
          >
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center mb-3">
              <Link2 className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="font-semibold text-foreground mb-1">{t("Threads連携")}</h3>
            <p className="text-muted-foreground text-sm">{t("アカウントを連携して直接投稿")}</p>
            <ChevronRight className="w-5 h-5 text-muted-foreground/40 group-hover:text-emerald-600 mt-2 transition-colors" />
          </button>

          <button
            onClick={() => setLocation('/post-history')}
            className="bg-background p-6 rounded-xl text-left hover:shadow-md transition-all border border-border group"
            data-tour="analytics"
          >
            <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center mb-3">
              <Calendar className="w-5 h-5 text-green-600" />
            </div>
            <h3 className="font-semibold text-foreground mb-1">{t("投稿履歴・予約")}</h3>
            <p className="text-muted-foreground text-sm">{t("予約投稿の管理と履歴確認")}</p>
            <ChevronRight className="w-5 h-5 text-muted-foreground/40 group-hover:text-emerald-600 mt-2 transition-colors" />
          </button>
        </div>
        </>)}
      </div>

      {/* Coupon Modal */}
      <CouponModal
        open={couponModalOpen}
        onClose={() => setCouponModalOpen(false)}
        onSuccess={(code) => {
          toast.success(t('クーポンが適用されました！'), {
            description: code ? `${t('適用コード')}：${code}` : undefined,
          });
        }}
      />

      {/* 契約時アンケート：興味のあるコンテンツ（初回1回だけ） */}
      <Dialog open={surveyOpen} onOpenChange={(o) => { if (!o) { setSurveyOpen(false); setSurveyDismissed(true); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("他に興味のあるサービスはありますか？")}</DialogTitle>
            <DialogDescription>
              {t("ご利用開始ありがとうございます。Threads集客のほかに、ご興味のあるものがあれば教えてください（複数OK・スキップも可能）。今後のご案内の参考にさせていただきます。")}
            </DialogDescription>
          </DialogHeader>
          {/* スマホはリストを低めに抑え、スキップ/回答ボタンが最初から見える高さにする */}
          <div className="space-y-2.5 max-h-[32vh] sm:max-h-[52vh] overflow-y-auto pr-1">
            <p className="text-xs font-medium text-muted-foreground">{t("気になるものを選んでください（複数OK）")}</p>
            {RELATED_SERVICES.map((opt) => {
              const on = surveyInterests.includes(opt.label);
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setSurveyInterests((prev) => on ? prev.filter((x) => x !== opt.label) : [...prev, opt.label])}
                  className={`w-full text-left rounded-lg border p-3 transition-colors ${
                    on ? 'border-emerald-500 bg-emerald-50' : 'border-border hover:bg-muted/40'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[12px] ${on ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-muted-foreground/40'}`}>
                      {on ? '✓' : ''}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{opt.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{opt.description}</p>
                    </div>
                  </div>
                </button>
              );
            })}
            <Textarea
              placeholder={t("その他・気になるサービスやご要望（任意）")}
              value={surveyFreeText}
              onChange={(e) => setSurveyFreeText(e.target.value)}
              className="text-sm min-h-[56px]"
              maxLength={1000}
            />
          </div>
          {/* 登録メールへの案内送付（デフォルトON） */}
          <label className="flex shrink-0 items-start gap-2.5 rounded-lg bg-muted/40 px-3 py-2.5 cursor-pointer">
            <Checkbox
              checked={surveySendInfo}
              onCheckedChange={(v) => setSurveySendInfo(v === true)}
              className="mt-0.5"
            />
            <span className="text-xs text-foreground leading-relaxed">
              {t("選んだサービスの詳しい案内を、ご登録のメールアドレス")}
              {user?.email ? <span className="font-medium">（{user.email}）</span> : ''}
              {t("に送る")}
            </span>
          </label>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => { setSurveyOpen(false); setSurveyDismissed(true); }}>
              {t("スキップ")}
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={submitInterest.isPending || (surveyInterests.length === 0 && !surveyFreeText.trim())}
              onClick={() => submitInterest.mutate({ interests: surveyInterests, freeText: surveyFreeText || undefined, sendInfo: surveySendInfo })}
            >
              {submitInterest.isPending ? t('送信中...') : t('回答する')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 解約アンケートダイアログ（理由を聞いてから解約を実行） */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("解約の前に、1つだけ教えてください")}</DialogTitle>
            <DialogDescription>
              {t("今後のサービス改善のため、解約の理由をお聞かせください。")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {[
              { value: 'price', label: t('💰 料金が高い') },
              { value: 'no_effect', label: t('📉 効果を感じられなかった') },
              { value: 'hard_to_use', label: t('🤔 使い方が難しい') },
              { value: 'pause', label: t('⏸ 一時的に休止したい') },
              { value: 'other', label: t('📝 その他') },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setCancelReason(opt.value)}
                className={`w-full text-left px-4 py-2.5 rounded-lg border text-sm transition-colors ${
                  cancelReason === opt.value
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800 font-medium'
                    : 'border-border hover:bg-muted/50'
                }`}
              >
                {cancelReason === opt.value ? '✓ ' : ''}{opt.label}
              </button>
            ))}
            <Textarea
              placeholder={t("よろしければ詳細をお聞かせください（任意）")}
              value={cancelDetail}
              onChange={(e) => setCancelDetail(e.target.value)}
              className="text-sm min-h-[70px]"
              maxLength={1000}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
              {t("解約をやめる")}
            </Button>
            <Button
              variant="destructive"
              disabled={!cancelReason || submitCancelFeedback.isPending || cancelSubscription.isPending}
              onClick={async () => {
                try {
                  await submitCancelFeedback.mutateAsync({
                    reason: cancelReason as any,
                    detail: cancelDetail || undefined,
                  });
                } catch {
                  // アンケート送信失敗でも解約は妨げない
                }
                cancelSubscription.mutate();
                setCancelDialogOpen(false);
              }}
            >
              {t("回答して解約する")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
      <Suspense fallback={null}>
        <AIChatWidget />
      </Suspense>
    </div>
  );
}
