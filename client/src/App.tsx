import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { SubscriptionProvider } from "./contexts/SubscriptionContext";
import DashboardLayout from "./components/DashboardLayout";
import TemplateSelect from "./pages/TemplateSelect";
import Studio from "./pages/Studio";
import Editor from "./pages/Editor";
import Library from "./pages/Library";
import Export from "./pages/Export";
import Pricing from "./pages/Pricing";
import Dashboard from "./pages/Dashboard";
import ThreadsConnect from "./pages/ThreadsConnect";
import PostHistory from "./pages/PostHistory";
import Landing from "./pages/Landing";
import TemplateLibrary from "./pages/TemplateLibrary";
import Guide from "./pages/Guide";
import AIProjectCreate from "./pages/AIProjectCreate";
import AIHistory from "./pages/AIHistory";
import AIGenerate from "./pages/AIGenerate";
import AdminCoupons from "./pages/AdminCoupons";
import AdminUsers from "./pages/AdminUsers";
import AITemplates from "./pages/AITemplates";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import VerifyEmail from "./pages/VerifyEmail";
import Referral from "./pages/Referral";
import AdminPresets from "./pages/AdminPresets";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import { ThreadsAccountProvider } from "./components/ThreadsAccountSwitcher";
import { PWAInstallBanner } from "./components/PWAInstallBanner";

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
        <Route path="/ai-project-create" component={AIProjectCreate} />
        <Route path="/ai-generate" component={AIGenerate} />
        <Route path="/ai-history" component={AIHistory} />
        <Route path="/admin/coupons" component={AdminCoupons} />
        <Route path="/admin/users" component={AdminUsers} />
        <Route path="/admin/presets" component={AdminPresets} />
        <Route path="/ai-templates" component={AITemplates} />
        <Route path="/referral" component={Referral} />
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
      <Route path="/privacy" component={Privacy} />
      <Route path="/terms" component={Terms} />
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
      <Route path="/ai-project-create">
        {() => <DashboardRoutes />}
      </Route>
      <Route path="/ai-generate">
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
      <Route path="/ai-templates">
        {() => <DashboardRoutes />}
      </Route>
      <Route path="/referral">
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
      <ThemeProvider defaultTheme="light">
        <SubscriptionProvider>
          <ThreadsAccountProvider>
            <TooltipProvider>
              <Toaster />
              <Router />
              <PWAInstallBanner />
            </TooltipProvider>
          </ThreadsAccountProvider>
        </SubscriptionProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
