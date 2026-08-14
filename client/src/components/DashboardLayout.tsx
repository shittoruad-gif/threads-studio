import { useAuth } from "@/_core/hooks/useAuth";
import { useLang } from "@/i18n";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { cn } from "@/lib/utils";
import MonitorFeedbackWidget from "./MonitorFeedbackWidget";
import { SubscriptionAlertBanner } from "./SubscriptionAlertBanner";
import {
  BarChart3,
  BookOpen,
  Calendar,
  ChevronLeft,
  ChevronRight,
  FileText,
  FolderOpen,
  Gift,
  History,
  Home,
  HelpCircle,
  LayoutDashboard,
  Link2,
  LogOut,
  Menu,
  Settings,
  Sliders,
  Sparkles,
  Users,
  X,
  CreditCard,
  MessageCircle,
  Flame,
} from "lucide-react";
import { CSSProperties, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";
import ThreadsAccountSwitcher from "./ThreadsAccountSwitcher";
import { trpc } from "@/lib/trpc";

interface MenuItem {
  icon: React.ElementType;
  label: string;
  path: string;
  badge?: string;
  badgeKey?: string;
  adminOnly?: boolean;
}

// Sidebar "AI投稿生成" links to /ai-generate (no project= param). The page
// itself decides whether to auto-redirect to the user's existing project or
// to /ai-project-create — that way returning users skip the chat/form.
const mainMenuItems: MenuItem[] = [
  // 初心者向けにモバイル下タブと同じ「ホーム」に統一（「ダッシュボード」は横文字で伝わらない）
  { icon: LayoutDashboard, label: "ホーム", path: "/dashboard" },
  { icon: Sparkles, label: "AI投稿生成", path: "/ai-generate", badge: "NEW" },
  { icon: History, label: "作成した投稿の履歴", path: "/ai-history", badgeKey: "ai-history" },
  { icon: FileText, label: "保存したひな形", path: "/ai-templates" },
];

const contentMenuItems: MenuItem[] = [
  { icon: FileText, label: "投稿テンプレート集", path: "/templates" },
  { icon: FolderOpen, label: "ライブラリ", path: "/library" },
];

const accountMenuItems: MenuItem[] = [
  { icon: Link2, label: "Threads連携", path: "/threads-connect" },
  { icon: Calendar, label: "投稿履歴・予約", path: "/post-history" },
  { icon: MessageCircle, label: "コメント管理", path: "/comment-manager", badgeKey: "comments" },
  { icon: BarChart3, label: "投稿分析", path: "/post-analytics", badgeKey: "analytics" },
  { icon: Gift, label: "紹介プログラム", path: "/referral" },
  { icon: Settings, label: "設定", path: "/settings" },
  { icon: BookOpen, label: "使い方ガイド", path: "/guide" },
  { icon: HelpCircle, label: "よくある質問", path: "/faq" },
];

const agencyMenuItems: MenuItem[] = [
  { icon: Users, label: "クライアント管理", path: "/agency-clients" },
];

const adminMenuItems: MenuItem[] = [
  { icon: Users, label: "ユーザー管理", path: "/admin/users", adminOnly: true },
  { icon: CreditCard, label: "契約・メール", path: "/admin/billing", adminOnly: true },
  { icon: CreditCard, label: "クーポン管理", path: "/admin/coupons", adminOnly: true },
  { icon: Sliders, label: "プリセット管理", path: "/admin/presets", adminOnly: true },
  { icon: MessageCircle, label: "フィードバック", path: "/admin/feedback", adminOnly: true },
  { icon: Flame, label: "伸びた投稿", path: "/admin/hit-posts", adminOnly: true },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { loading, user, logout } = useAuth();
  const { t } = useLang();
  const [location, setLocation] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const isMobile = useIsMobile();

  // ---- Notification badge data ----
  const { data: threadsAccounts } = trpc.threads.list.useQuery(
    undefined,
    { enabled: !!user }
  );
  const firstAccountId = threadsAccounts?.[0]?.id;

  // Fetch comments for badge (only if account exists)
  const { data: commentsData } = trpc.threads.getComments.useQuery(
    { accountId: firstAccountId!, limit: 50 },
    { enabled: !!firstAccountId, refetchInterval: 5 * 60 * 1000 }
  );

  // Fetch AI history for unfavorited count
  const { data: aiHistoryData } = trpc.project.getAiHistory.useQuery(
    { limit: 20, offset: 0 },
    { enabled: !!user }
  );
  const { data: favoritesData } = trpc.favorite.list.useQuery(
    undefined,
    { enabled: !!user }
  );

  // 代理店プラン契約者だけに「クライアント管理」を出す
  const { data: agencyInfo } = trpc.agency.listClients.useQuery(undefined, { enabled: !!user });
  const isAgency = !!agencyInfo?.isAgency;

  // Compute badge values
  const dynamicBadges = useMemo(() => {
    const badges: Record<string, string | null> = {};

    // Comments badge: count of comments (as a simple unreplied proxy)
    if (commentsData && Array.isArray(commentsData) && commentsData.length > 0) {
      badges["comments"] = commentsData.length.toString();
    } else {
      badges["comments"] = null;
    }

    // Analytics badge: show NEW if user has analytics data they haven't viewed recently
    const analyticsViewed = localStorage.getItem("analytics-last-viewed");
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    if (!analyticsViewed || parseInt(analyticsViewed) < oneDayAgo) {
      badges["analytics"] = "NEW";
    } else {
      badges["analytics"] = null;
    }

    // AI history badge: count of recent unfavorited posts
    const historyItems = (aiHistoryData as any)?.history;
    if (historyItems && Array.isArray(historyItems) && historyItems.length > 0) {
      const favoriteIds = new Set(
        (favoritesData || []).map((f: any) => f.historyId ?? f.id)
      );
      const unfavorited = historyItems.filter(
        (h: any) => !favoriteIds.has(h.id)
      ).length;
      badges["ai-history"] = unfavorited > 0 ? unfavorited.toString() : null;
    } else {
      badges["ai-history"] = null;
    }

    return badges;
  }, [commentsData, aiHistoryData, favoritesData]);

  // Mark analytics as viewed when navigating to analytics page
  useEffect(() => {
    if (location === "/post-analytics") {
      localStorage.setItem("analytics-last-viewed", Date.now().toString());
    }
  }, [location]);

  // Auto-collapse on mobile
  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [isMobile]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      window.location.href = getLoginUrl();
    }
  }, [loading, user]);

  if (loading) {
    return <DashboardLayoutSkeleton />;
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-6">
            <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-center text-foreground">
              {t("ログインしてください")}
            </h1>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              {t("ダッシュボードにアクセスするにはログインが必要です。")}
            </p>
          </div>
          <Button
            onClick={() => {
              window.location.href = getLoginUrl();
            }}
            size="lg"
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {t("ログイン")}
          </Button>
        </div>
      </div>
    );
  }

  const handleLogout = async () => {
    await logout();
    setLocation("/");
  };

  const renderMenuSection = (
    title: string,
    items: MenuItem[],
    collapsed: boolean
  ) => {
    const filteredItems = items.filter(
      (item) => !item.adminOnly || user?.role === "admin"
    );
    if (filteredItems.length === 0) return null;

    return (
      <div className="mb-2">
        {!collapsed && (
          <p className="px-4 py-2 text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">
            {t(title)}
          </p>
        )}
        <nav className="space-y-0.5 px-2">
          {filteredItems.map((item) => {
            const isActive =
              location === item.path ||
              (item.path !== "/dashboard" && location.startsWith(item.path));
            return (
              <button
                key={item.path}
                onClick={() => {
                  setLocation(item.path);
                  if (isMobile) setMobileSidebarOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                title={collapsed ? t(item.label) : undefined}
              >
                <span className="relative flex-shrink-0">
                  <item.icon
                    className={cn(
                      "w-[18px] h-[18px]",
                      isActive ? "text-primary" : "text-muted-foreground/60"
                    )}
                  />
                  {collapsed && (item.badgeKey ? dynamicBadges[item.badgeKey] : item.badge) && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-orange-500 rounded-full border-2 border-background" />
                  )}
                </span>
                {!collapsed && (
                  <>
                    <span className="truncate">{t(item.label)}</span>
                    {(() => {
                      const dynamicBadge = item.badgeKey ? dynamicBadges[item.badgeKey] : null;
                      const badgeText = dynamicBadge || item.badge;
                      if (!badgeText) return null;
                      const isNumeric = /^\d+$/.test(badgeText);
                      return (
                        <span
                          className={cn(
                            "ml-auto text-[12px] font-bold px-1.5 py-0.5 rounded-full",
                            dynamicBadge
                              ? isNumeric
                                ? "bg-orange-500 text-white min-w-[20px] text-center"
                                : "bg-amber-100 text-amber-700 border border-amber-300"
                              : "bg-emerald-500 text-white"
                          )}
                        >
                          {badgeText}
                        </span>
                      );
                    })()}
                  </>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    );
  };

  const sidebarContent = (collapsed: boolean) => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          {!collapsed && (
            <span className="text-base font-bold text-foreground truncate">
              Threads Studio
            </span>
          )}
        </div>
      </div>

      {/* Menu */}
      <div className="flex-1 overflow-y-auto py-4">
        {renderMenuSection("メイン", mainMenuItems, collapsed)}
        {renderMenuSection("コンテンツ", contentMenuItems, collapsed)}
        {renderMenuSection("アカウント", accountMenuItems, collapsed)}
        {isAgency && renderMenuSection("代理店", agencyMenuItems, collapsed)}
        {user?.role === "admin" &&
          renderMenuSection("管理者", adminMenuItems, collapsed)}
      </div>

      {/* User Profile */}
      <div className="border-t border-border/50 p-3">
        {!collapsed ? (
          <div className="px-2 py-2 space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-semibold text-emerald-700">
                  {user?.name?.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {user?.name || "-"}
                </p>
                <p className="text-xs text-muted-foreground/60 truncate">
                  {user?.email || "-"}
                </p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label={t("ログアウト")}
            >
              <LogOut className="w-4 h-4" />
              {t("ログアウト")}
            </button>
          </div>
        ) : (
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-muted text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            title={t("ログアウト")}
            aria-label={t("ログアウト")}
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-muted/50">
      {/* Desktop Sidebar */}
      {!isMobile && (
        <aside
          className={cn(
            "fixed top-0 left-0 h-full bg-background border-r border-border z-30 transition-all duration-200",
            sidebarOpen ? "w-[260px]" : "w-[68px]"
          )}
        >
          {sidebarContent(!sidebarOpen)}
          {/* Collapse toggle */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={sidebarOpen ? t("サイドバーを閉じる") : t("サイドバーを開く")}
            className="absolute -right-3 top-20 w-6 h-6 bg-background border border-border rounded-full flex items-center justify-center shadow-sm hover:shadow-md transition-all z-50"
          >
            {sidebarOpen ? (
              <ChevronLeft className="w-3 h-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            )}
          </button>
        </aside>
      )}

      {/* Mobile Sidebar Overlay */}
      {isMobile && mobileSidebarOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/30 z-40"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <aside className="fixed top-0 left-0 h-full w-[280px] bg-background z-50 shadow-xl">
            <button
              onClick={() => setMobileSidebarOpen(false)}
              aria-label={t("メニューを閉じる")}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-muted"
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
            {sidebarContent(false)}
          </aside>
        </>
      )}

      {/* Main Content */}
      <div
        className={cn(
          "flex-1 min-w-0 overflow-x-hidden transition-all duration-200",
          !isMobile && sidebarOpen ? "ml-[260px]" : !isMobile ? "ml-[68px]" : "ml-0"
        )}
      >
        {/* Top Header */}
        <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border">
          <div className="flex items-center justify-between gap-2 h-14 px-4 sm:px-6">
            <div className="flex items-center gap-3 shrink-0">
              {isMobile && (
                <button
                  onClick={() => setMobileSidebarOpen(true)}
                  aria-label={t("メニューを開く")}
                  className="p-2 rounded-lg hover:bg-muted"
                >
                  <Menu className="w-5 h-5 text-muted-foreground" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <ThreadsAccountSwitcher compact={isMobile} className="min-w-0 max-w-[60vw] sm:max-w-none" />
              <button
                onClick={() => setLocation("/")}
                className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground/80 transition-colors"
                title={t("ホームに戻る")}
                aria-label={t("ホームに戻る")}
              >
                <Home className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* 決済失敗時の警告バナー — past_due / unpaid / incomplete のみ表示 */}
        <SubscriptionAlertBanner />

        {/* Page Content。スマホでは下部タブバーに隠れないよう余白を多めに確保 */}
        <main className="p-4 pb-28 sm:p-6 sm:pb-6 lg:p-8">{children}</main>
      </div>

      {/* スマホ用 下部タブバー — 主要4機能を常時1タップで。年配の方でも迷わない導線 */}
      {isMobile && (
        <nav
          className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-t border-border pb-[env(safe-area-inset-bottom)]"
          aria-label={t("メインメニュー")}
        >
          <div className="grid grid-cols-5">
            {[
              { icon: LayoutDashboard, label: "ホーム", path: "/dashboard" },
              { icon: Sparkles, label: "AI投稿", path: "/ai-generate" },
              { icon: Calendar, label: "予約・履歴", path: "/post-history" },
              { icon: Settings, label: "設定", path: "/settings" },
            ].map((item) => {
              const active =
                location === item.path ||
                (item.path !== "/dashboard" && location.startsWith(item.path));
              const Icon = item.icon;
              return (
                <button
                  key={item.path}
                  onClick={() => setLocation(item.path)}
                  aria-label={t(item.label)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center justify-center gap-0.5 min-h-[56px] py-1.5 transition-colors",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-[11px] font-medium leading-none">{t(item.label)}</span>
                </button>
              );
            })}
            {/* 5つ目：その他すべての画面へ（フルメニューを開く） */}
            <button
              onClick={() => setMobileSidebarOpen(true)}
              aria-label={t("メニューをすべて表示")}
              className="flex flex-col items-center justify-center gap-0.5 min-h-[56px] py-1.5 text-muted-foreground transition-colors"
            >
              <Menu className="w-5 h-5" />
              <span className="text-[11px] font-medium leading-none">{t("メニュー")}</span>
            </button>
          </div>
        </nav>
      )}

      {/* Monitor Feedback Widget - only for monitor users。スマホは下部ナビ分だけ持ち上げる */}
      {user?.isMonitor && <MonitorFeedbackWidget bottomOffset={isMobile} />}
    </div>
  );
}
