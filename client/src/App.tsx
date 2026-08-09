import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import { lazy, Suspense } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { LangProvider } from "./i18n";
import { ThemeProvider } from "./contexts/ThemeContext";
import { SubscriptionProvider } from "./contexts/SubscriptionContext";
import DashboardLayout from "./components/DashboardLayout";
// 初回表示に必要なページだけ静的import（LP・認証系は最速で出す）
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
// それ以外はルート単位で遅延ロード（初回バンドルを軽くする。
// スマホ回線の先生でもLPとログインが即表示されることを優先）
const TemplateSelect = lazy(() => import("./pages/TemplateSelect"));
const Studio = lazy(() => import("./pages/Studio"));
const Editor = lazy(() => import("./pages/Editor"));
const Library = lazy(() => import("./pages/Library"));
const Export = lazy(() => import("./pages/Export"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const ThreadsConnect = lazy(() => import("./pages/ThreadsConnect"));
const PostHistory = lazy(() => import("./pages/PostHistory"));
const TemplateLibrary = lazy(() => import("./pages/TemplateLibrary"));
const Guide = lazy(() => import("./pages/Guide"));
const AIHistory = lazy(() => import("./pages/AIHistory"));
const AIGenerate = lazy(() => import("./pages/AIGenerate"));
const AICounseling = lazy(() => import("./pages/AICounseling"));
const AIStyleCalibration = lazy(() => import("./pages/AIStyleCalibration"));
const AdminCoupons = lazy(() => import("./pages/AdminCoupons"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const AITemplates = lazy(() => import("./pages/AITemplates"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail"));
const Referral = lazy(() => import("./pages/Referral"));
const AgencyClients = lazy(() => import("./pages/AgencyClients"));
const CommentManager = lazy(() => import("./pages/CommentManager"));
const PostAnalytics = lazy(() => import("./pages/PostAnalytics"));
const AdminPresets = lazy(() => import("./pages/AdminPresets"));
const AdminFeedback = lazy(() => import("./pages/AdminFeedback"));
const AdminHitPosts = lazy(() => import("./pages/AdminHitPosts"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const FAQ = lazy(() => import("./pages/FAQ"));
const CommercialTransaction = lazy(() => import("./pages/CommercialTransaction"));
const Settings = lazy(() => import("./pages/Settings"));
const TryGenerate = lazy(() => import("./pages/TryGenerate"));
import { ThreadsAccountProvider } from "./components/ThreadsAccountSwitcher";
import { PWAInstallBanner } from "./components/PWAInstallBanner";
import { CelebrationProvider } from "./components/Celebration";
import { CookieConsent } from "./components/CookieConsent";

/** 遅延ロード中のフォールバック（チラつき防止の控えめなスピナー） */
function PageLoading() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center">
      <div className="h-8 w-8 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
    </div>
  );
}

function DashboardRoutes() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/templates" component={TemplateSelect} />
        <Route path="/studio">
          {() => <Studio />}
        </Route>
        <Route path="/editor">
          {() => <Editor />}
        </Route>
        <Route path="/library" component={Library} />
        <Route path="/template-library" component={TemplateLibrary} />
        <Route path="/export">
          {() => <Export />}
        </Route>
        <Route path="/threads-connect" component={ThreadsConnect} />
        <Route path="/post-history" component={PostHistory} />
        <Route path="/comment-manager" component={CommentManager} />
        <Route path="/post-analytics" component={PostAnalytics} />
        {/* 旧プロジェクト作成は廃止。カウンセリング起点の新規作成フローに統合。 */}
        <Route path="/ai-project-create" component={AICounseling} />
        <Route path="/ai-generate" component={AIGenerate} />
        <Route path="/ai-counseling" component={AICounseling} />
        <Route path="/ai-style-calibration" component={AIStyleCalibration} />
        <Route path="/ai-history" component={AIHistory} />
        <Route path="/admin/coupons" component={AdminCoupons} />
        <Route path="/admin/users" component={AdminUsers} />
        <Route path="/admin/presets" component={AdminPresets} />
        <Route path="/admin/feedback" component={AdminFeedback} />
        <Route path="/admin/hit-posts" component={AdminHitPosts} />
        <Route path="/ai-templates" component={AITemplates} />
        <Route path="/referral" component={Referral} />
        <Route path="/agency-clients" component={AgencyClients} />
        <Route path="/settings" component={Settings} />
      </Switch>
    </DashboardLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/verify-email" component={VerifyEmail} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/guide" component={Guide} />
      <Route path="/try" component={TryGenerate} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/terms" component={Terms} />
      <Route path="/faq" component={FAQ} />
      <Route path="/commercial-transaction" component={CommercialTransaction} />
      <Route path="/dashboard">
        {() => <DashboardRoutes />}
      </Route>
      <Route path="/templates">
        {() => <DashboardRoutes />}
      </Route>
      <Route path="/studio">
        {() => <DashboardRoutes />}
      </Route>
      <Route path="/editor">
        {() => <DashboardRoutes />}
      </Route>
      <Route path="/library">
        {() => <DashboardRoutes />}
      </Route>
      <Route path="/template-library">
        {() => <DashboardRoutes />}
      </Route>
      <Route path="/export">
        {() => <DashboardRoutes />}
      </Route>
      <Route path="/threads-connect">
        {() => <DashboardRoutes />}
      </Route>
      <Route path="/post-history">
        {() => <DashboardRoutes />}
      </Route>
      <Route path="/comment-manager">
        {() => <DashboardRoutes />}
      </Route>
      <Route path="/post-analytics">
        {() => <DashboardRoutes />}
      </Route>
      <Route path="/ai-project-create">
        {() => <DashboardRoutes />}
      </Route>
      <Route path="/ai-generate">
        {() => <DashboardRoutes />}
      </Route>
      <Route path="/ai-counseling">
        {() => <DashboardRoutes />}
      </Route>
      <Route path="/ai-style-calibration">
        {() => <DashboardRoutes />}
      </Route>
      <Route path="/ai-history">
        {() => <DashboardRoutes />}
      </Route>
      <Route path="/admin/coupons">
        {() => <DashboardRoutes />}
      </Route>
      <Route path="/admin/users">
        {() => <DashboardRoutes />}
      </Route>
      <Route path="/admin/presets">
        {() => <DashboardRoutes />}
      </Route>
      <Route path="/admin/feedback">
        {() => <DashboardRoutes />}
      </Route>
      <Route path="/admin/hit-posts">
        {() => <DashboardRoutes />}
      </Route>
      <Route path="/ai-templates">
        {() => <DashboardRoutes />}
      </Route>
      <Route path="/referral">
        {() => <DashboardRoutes />}
      </Route>
      <Route path="/agency-clients">
        {() => <DashboardRoutes />}
      </Route>
      <Route path="/settings">
        {() => <DashboardRoutes />}
      </Route>
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <LangProvider>
      <ThemeProvider defaultTheme="light" switchable>
        <SubscriptionProvider>
          <ThreadsAccountProvider>
            <TooltipProvider>
              <Toaster />
              <CelebrationProvider />
              <Suspense fallback={<PageLoading />}>
                <Router />
              </Suspense>
              <PWAInstallBanner />
              <CookieConsent />
            </TooltipProvider>
          </ThreadsAccountProvider>
        </SubscriptionProvider>
      </ThemeProvider>
      </LangProvider>
    </ErrorBoundary>
  );
}

export default App;
