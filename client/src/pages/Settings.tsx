import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Settings as SettingsIcon, Sparkles, Bell, User, CreditCard, AlertTriangle, Save, Loader2, Moon, Sun, Palette, LogOut, KeyRound, Copy, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAuth } from "@/_core/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { useFontScale } from "@/hooks/useFontScale";
import { useLang } from "@/i18n";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function Settings() {
  const { user, refresh, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      window.location.href = "/login";
    } catch {
      setLoggingOut(false);
      toast.error(t("ログアウトに失敗しました"));
    }
  };
  const [, setLocation] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { isLarge, setFontScale } = useFontScale();
  const { lang, setLang, t } = useLang();
  const utils = trpc.useUtils();

  // ── BYOA（自分のMetaアプリで連携）─────────────────────────────
  const { data: ownApp } = trpc.threads.getOwnApp.useQuery(undefined, { enabled: !!user });
  const [byoaOpen, setByoaOpen] = useState(false);
  const [byoaAppId, setByoaAppId] = useState("");
  const [byoaSecret, setByoaSecret] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const setOwnApp = trpc.threads.setOwnApp.useMutation({
    onSuccess: () => {
      toast.success("自分のMetaアプリを登録しました。次回のThreads連携から使われます");
      setByoaSecret("");
      utils.threads.getOwnApp.invalidate();
    },
    onError: (e) => toast.error(e.message || "登録に失敗しました"),
  });
  const clearOwnApp = trpc.threads.clearOwnApp.useMutation({
    onSuccess: () => {
      toast.success("自分のMetaアプリの登録を解除しました");
      setByoaAppId("");
      setByoaSecret("");
      utils.threads.getOwnApp.invalidate();
    },
    onError: (e) => toast.error(e.message || "解除に失敗しました"),
  });
  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      toast.error("コピーできませんでした。長押しで選択してコピーしてください");
    }
  };

  // Auto-post settings from API
  const { data: autoPostSettings, isLoading: settingsLoading } = trpc.autoPost.getSettings.useQuery(undefined, {
    enabled: !!user,
  });
  const updateAutoPost = trpc.autoPost.updateSettings.useMutation({
    onSuccess: () => {
      utils.autoPost.getSettings.invalidate();
      toast.success("投稿設定を更新しました");
    },
    onError: (error) => {
      toast.error(error.message || "設定の更新に失敗しました");
    },
  });

  // Subscription
  const { data: subscription } = trpc.subscription.getStatus.useQuery(undefined, {
    enabled: !!user,
  });

  // Local state for post settings - synced from API
  const [postFrequency, setPostFrequency] = useState<"daily" | "twice_daily" | "three_daily">("daily");
  const [settingsDirty, setSettingsDirty] = useState(false);

  // Local state for account
  const [name, setName] = useState(user?.name || "");
  const [storeName, setStoreName] = useState((user as any)?.storeName || "");
  const [email, setEmail] = useState(user?.email || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  // Local state for notifications
  const [weeklyReport, setWeeklyReport] = useState(true);
  const [commentNotification, setCommentNotification] = useState(true);

  // Account deletion state
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [showDeleteSection, setShowDeleteSection] = useState(false);

  // Sync local state from API data
  useEffect(() => {
    if (autoPostSettings) {
      const freq = autoPostSettings.autoPostFrequency;
      if (freq === "daily" || freq === "twice_daily" || freq === "three_daily") {
        setPostFrequency(freq);
      }
      setSettingsDirty(false);
    }
  }, [autoPostSettings]);

  // Sync user data
  useEffect(() => {
    if (user) {
      setName(user.name || "");
      setStoreName((user as any).storeName || "");
      setEmail(user.email || "");
    }
  }, [user]);

  // プロフィール（名前・店舗名）の保存
  const updateProfile = trpc.account.updateProfile.useMutation({
    onSuccess: () => { toast.success("プロフィールを更新しました"); refresh?.(); },
    onError: (error) => { toast.error(error.message || "更新に失敗しました"); },
  });

  // Password change mutation
  const changePassword = trpc.account.changePassword.useMutation({
    onSuccess: () => {
      toast.success(t("パスワードを変更しました"));
      setCurrentPassword("");
      setNewPassword("");
    },
    onError: (error) => {
      toast.error(error.message || "パスワードの変更に失敗しました");
    },
  });

  // Account delete mutation
  const deleteAccount = trpc.account.deleteAccount.useMutation({
    onSuccess: () => {
      toast.success("アカウントを削除しました");
      setTimeout(() => {
        window.location.href = "/";
      }, 1500);
    },
    onError: (error) => {
      toast.error(error.message || "アカウントの削除に失敗しました");
    },
  });

  const handleToggleAutoPost = () => {
    updateAutoPost.mutate({
      autoPostEnabled: !autoPostSettings?.autoPostEnabled,
    });
  };

  const handleSavePostSettings = () => {
    updateAutoPost.mutate({
      autoPostFrequency: postFrequency,
    });
    setSettingsDirty(false);
  };

  const planLabel = subscription?.planId
    ? subscription.planId === "pro"
      ? t("プロプラン")
      : subscription.planId === "starter"
        ? "スタータープラン"
        : "無料プラン"
    : "無料プラン";

  return (
    <div className="max-w-3xl mx-auto">
      {/* Page Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
          <SettingsIcon className="w-5 h-5 text-orange-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("設定")}</h1>
          <p className="text-sm text-muted-foreground">{t("投稿・アカウント・通知の設定を管理")}</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* ── 投稿設定 ── */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-5">
            <Sparkles className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-semibold text-foreground">{t("投稿設定")}</h2>
          </div>

          {settingsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-emerald-500"></div>
              <span className="ml-2 text-sm text-muted-foreground">{t("設定を読み込み中...")}</span>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Auto-post toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium text-foreground">{t("自動投稿")}</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("AIが自動で投稿を生成・公開します")}
                  </p>
                </div>
                <Switch
                  checked={autoPostSettings?.autoPostEnabled ?? false}
                  onCheckedChange={handleToggleAutoPost}
                  disabled={updateAutoPost.isPending}
                />
              </div>

              {/* 公開前の承認モード */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium text-foreground">{t("公開前に承認する")}</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("ONにすると、自動生成された投稿は「承認待ち」として保存され、")}<br className="hidden sm:inline" />
                    {t("あなたが内容を確認・承認するまで公開されません")}
                  </p>
                </div>
                <Switch
                  checked={autoPostSettings?.autoPostRequireApproval ?? false}
                  onCheckedChange={(v) => updateAutoPost.mutate({ autoPostRequireApproval: v })}
                  disabled={updateAutoPost.isPending}
                />
              </div>

              {/* トピックタグ自動付与 */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium text-foreground">{t("投稿に「トピック」を自動でつける（おすすめ）")}</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("Threadsには投稿に「話題のラベル」をつける機能があります。ONにすると、")}
                    {t("お店の悩みワードや地域名を自動でつけて、")}<br className="hidden sm:inline" />
                    {t("フォロワー以外の「同じ話題を見ている人」にも届きやすくします")}
                  </p>
                </div>
                <Switch
                  checked={(autoPostSettings as any)?.autoTopicTag ?? true}
                  onCheckedChange={(v) => updateAutoPost.mutate({ autoTopicTag: v } as any)}
                  disabled={updateAutoPost.isPending}
                />
              </div>

              {/* 投稿の長さ（shared/postLength.ts） */}
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Label className="text-sm font-medium text-foreground">{t("投稿の長さ")}</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("短めは50〜100字。実測でいちばん見られる長さです。")}<br className="hidden sm:inline" />
                    {t("長めは250〜300字。悩みをじっくり書く型に向きますが、表示回数は落ちます。")}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1 rounded-lg border border-border p-1">
                  {(["short", "long"] as const).map((v) => {
                    const active = ((autoPostSettings as any)?.postLength ?? "short") === v;
                    return (
                      <button
                        key={v}
                        type="button"
                        disabled={updateAutoPost.isPending}
                        onClick={() => updateAutoPost.mutate({ postLength: v } as any)}
                        className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                          active
                            ? "bg-emerald-600 text-white"
                            : "text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {v === "short" ? t("短め") : t("長め")}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 実例としての匿名掲載（利用規約 第11条） */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium text-foreground">{t("紹介ページに実例として匿名で載せる")}</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("反応が良かった投稿を、サービス紹介ページの実例として掲載します。")}
                    {t("アカウント名・店名・駅名・URLはすべて伏せるため、お店が特定されることはありません。")}<br className="hidden sm:inline" />
                    {t("OFFにすると掲載対象から外れます（利用規約 第11条）")}
                  </p>
                </div>
                <Switch
                  checked={!((autoPostSettings as any)?.showcaseOptOut ?? false)}
                  onCheckedChange={(v) => updateAutoPost.mutate({ showcaseOptOut: !v } as any)}
                  disabled={updateAutoPost.isPending}
                />
              </div>

              {/* 追い投稿（セルフリプライ） */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium text-foreground">{t("投稿の6時間後に「ひとこと」を自動追加（おすすめ）")}</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("自動投稿の数時間後に、その投稿へ「気軽にコメントくださいね」などの")}
                    {t("やわらかい一言を自動で追加します。")}<br className="hidden sm:inline" />
                    {t("投稿がもう一度みんなの画面に表示されやすくなります（深夜は翌朝に自動調整）")}
                  </p>
                </div>
                <Switch
                  checked={(autoPostSettings as any)?.autoFollowUpEnabled ?? true}
                  onCheckedChange={(v) => updateAutoPost.mutate({ autoFollowUpEnabled: v } as any)}
                  disabled={updateAutoPost.isPending}
                />
              </div>

              {/* Frequency selection */}
              <div>
                <Label className="text-sm font-medium text-foreground mb-2 block">
                  {t("投稿頻度（1日あたり）")}
                </Label>
                <RadioGroup
                  value={postFrequency}
                  onValueChange={(val) => {
                    setPostFrequency(val as "daily" | "twice_daily" | "three_daily");
                    setSettingsDirty(true);
                  }}
                  className="space-y-2"
                >
                  {[
                    { value: "daily", label: t("1日1回"), desc: t("着実に認知を広げたい方に"), min: 1 },
                    { value: "twice_daily", label: t("1日2回"), desc: t("朝と夕方に投稿で露出UP"), min: 2 },
                    { value: "three_daily", label: t("1日3回"), desc: t("最大露出で一気に認知を拡大"), min: 3 },
                  ].map((freq) => {
                    const maxPerDay = (subscription as any)?.plan?.features?.maxAutoPostsPerDay ?? 0;
                    const locked = maxPerDay < freq.min;
                    return (
                    <label
                      key={freq.value}
                      className={`flex items-start gap-3 rounded-lg border px-4 py-3 transition-colors ${
                        locked
                          ? "border-border opacity-50 cursor-not-allowed"
                          : postFrequency === freq.value
                            ? "border-emerald-300 bg-emerald-50 cursor-pointer"
                            : "border-border hover:bg-muted/50 cursor-pointer"
                      }`}
                    >
                      <RadioGroupItem value={freq.value} className="mt-0.5" disabled={locked} />
                      <div>
                        <span className="text-sm font-medium text-foreground">{freq.label}{locked ? "（上位プラン）" : ""}</span>
                        <p className="text-xs text-muted-foreground">{freq.desc}</p>
                      </div>
                    </label>
                    );
                  })}
                </RadioGroup>
              </div>

              {/* Save button */}
              {settingsDirty && (
                <div className="pt-2 border-t border-border/50">
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700 text-white w-full"
                    disabled={updateAutoPost.isPending}
                    onClick={handleSavePostSettings}
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {updateAutoPost.isPending ? "保存中..." : "投稿設定を保存"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* ── アカウント設定 ── */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-5">
            <User className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-foreground">{t("アカウント設定")}</h2>
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="name" className="text-sm font-medium text-foreground">
                {t("名前")}
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("表示名")}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="storeName" className="text-sm font-medium text-foreground">
                {t("店舗名・屋号")}
              </Label>
              <Input
                id="storeName"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder={t("例：○○整体院")}
                className="mt-1"
              />
            </div>

            <div>
              <Button
                size="sm"
                onClick={() => updateProfile.mutate({ name: name.trim(), storeName: storeName.trim() || undefined })}
                disabled={updateProfile.isPending || !name.trim()}
              >
                <Save className="w-4 h-4 mr-2" />
                {updateProfile.isPending ? t('保存中...') : t('名前・店舗名を保存')}
              </Button>
            </div>

            <div>
              <Label htmlFor="email" className="text-sm font-medium text-foreground">
                {t("メールアドレス")}
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="mail@example.com"
                className="mt-1"
                disabled
              />
              <p className="text-xs text-muted-foreground/60 mt-1">{t("メールアドレスは変更できません（セミナー等のご案内にはこのアドレスを使用します）")}</p>
            </div>

            <div className="pt-2 border-t border-border/50">
              <Label className="text-sm font-medium text-foreground mb-1 block">
                {t("パスワード変更")}
              </Label>
              <div className="space-y-2">
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder={t("現在のパスワード")}
                />
                <div>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={t("新しいパスワード（10文字以上）")}
                  />
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    {t("10文字以上で、英字・数字・記号のうち2種類以上を含む必要があります")}
                  </p>
                </div>
              </div>
            </div>

            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={!currentPassword || !newPassword || changePassword.isPending}
              onClick={() => {
                if (newPassword.length < 10) {
                  toast.error("新しいパスワードは10文字以上にしてください");
                  return;
                }
                // バックエンドと同じ「英字・数字・記号のうち2種類以上」をフロントでも事前チェック
                const kinds =
                  (/[a-zA-Z]/.test(newPassword) ? 1 : 0) +
                  (/[0-9]/.test(newPassword) ? 1 : 0) +
                  (/[!@#$%^&*(),.?":{}|<>_\-+=/\\\[\];'`~]/.test(newPassword) ? 1 : 0);
                if (kinds < 2) {
                  toast.error("英字・数字・記号のうち2種類以上を含めてください");
                  return;
                }
                changePassword.mutate({ currentPassword, newPassword });
              }}
            >
              {changePassword.isPending ? t("変更中...") : t("パスワードを変更")}
            </Button>

            {/* ログアウト */}
            <div className="pt-4 border-t border-border/50">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label className="text-sm font-medium text-foreground">{t("ログアウト")}</Label>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">
                    {t("このアカウントからサインアウトします")}
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="shrink-0"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  {loggingOut ? t("ログアウト中...") : t("ログアウト")}
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* ── 通知設定 ── */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-5">
            <Bell className="w-5 h-5 text-amber-600" />
            <h2 className="text-lg font-semibold text-foreground">{t("通知設定")}</h2>
            <span className="ml-1 px-2 py-0.5 text-[13px] font-medium rounded-full bg-muted text-muted-foreground">{t("準備中")}</span>
          </div>

          <div className="space-y-4 opacity-60">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium text-foreground">{t("週次レポートメール")}</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("毎週月曜日に1週間の投稿実績をお届けします（近日対応）")}
                </p>
              </div>
              <Switch
                checked={weeklyReport}
                onCheckedChange={setWeeklyReport}
                disabled
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium text-foreground">{t("コメント通知")}</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("Threadsの投稿にコメントがあったら通知します（近日対応）")}
                </p>
              </div>
              <Switch
                checked={commentNotification}
                onCheckedChange={setCommentNotification}
                disabled
              />
            </div>
          </div>
        </Card>

        {/* ── 表示設定 ── */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-5">
            <Palette className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-semibold">{t("表示設定")}</h2>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">{t("ダークモード")}</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("暗い配色に切り替えます（目の負担を軽減）")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Sun className="w-4 h-4 text-muted-foreground" />
              <Switch
                checked={theme === "dark"}
                onCheckedChange={() => toggleTheme?.()}
              />
              <Moon className="w-4 h-4 text-muted-foreground" />
            </div>
          </div>

          {/* 文字を大きく */}
          <div className="flex items-center justify-between pt-5 mt-5 border-t border-border/50">
            <div>
              <Label className="text-sm font-medium">{t("文字を大きくする")}</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("画面全体の文字を一回り大きく表示します（読みやすさ重視）")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{t("小")}</span>
              <Switch
                checked={isLarge}
                onCheckedChange={(v) => setFontScale(v ? "large" : "normal")}
              />
              <span className="text-lg font-bold text-muted-foreground">{t("大")}</span>
            </div>
          </div>

          {/* 表示言語（日本語 / English）。審査用の英語スクリーンキャストを撮るときに使う */}
          <div className="flex items-center justify-between pt-5 mt-5 border-t border-border/50">
            <div>
              <Label className="text-sm font-medium">{t("表示言語 / Language")}</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("日本語 / English（審査用の英語表示に切り替えられます）")}
              </p>
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
              <button
                type="button"
                onClick={() => setLang("ja")}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${lang === "ja" ? "bg-emerald-600 text-white" : "text-muted-foreground hover:bg-muted"}`}
              >
                {t("日本語")}
              </button>
              <button
                type="button"
                onClick={() => setLang("en")}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${lang === "en" ? "bg-emerald-600 text-white" : "text-muted-foreground hover:bg-muted"}`}
              >
                English
              </button>
            </div>
          </div>
        </Card>

        {/* ── 自分のMetaアプリで連携（BYOA）── */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-2">
            <KeyRound className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-foreground">{t("自分のMetaアプリで連携する（上級者向け）")}</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            {t("通常はこの設定は不要です。ご自身でMetaのアプリを作って登録すると、その資格情報でThreadsに接続します。")}
            {ownApp?.configured && (
              <span className="ml-1 font-medium text-indigo-700">
                現在このアカウントは自分のアプリ（ID: {ownApp.appId}）で連携する設定です。
              </span>
            )}
          </p>
          <p className="text-xs mb-4">
            <a
              href="/threads-setup-guide"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-indigo-700 underline underline-offset-2 hover:text-indigo-800"
            >
              {t("Metaアプリの作り方（画像つきの手順書）を開く")}
            </a>
            <span className="text-muted-foreground ml-1">{t("— Facebookアカウントの作成から順に説明しています")}</span>
          </p>

          {!byoaOpen && !ownApp?.configured ? (
            <Button variant="outline" onClick={() => setByoaOpen(true)}>
              {t("設定する")}
            </Button>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-2">
                <p className="font-medium text-foreground">{t("Metaのアプリ作成時に、次の3つのURLを登録してください")}</p>
                {[
                  { key: "redirect", label: "リダイレクトURL（コールバック）", value: ownApp?.redirectUri ?? "" },
                  { key: "deauth", label: "アンインストールのコールバックURL", value: ownApp?.deauthorizeUri ?? "" },
                  { key: "delete", label: "データ削除のコールバックURL", value: ownApp?.deleteUri ?? "" },
                ].map((row) => (
                  <div key={row.key} className="flex items-center gap-2">
                    <span className="w-56 shrink-0">{row.label}</span>
                    <code className="flex-1 min-w-0 truncate rounded bg-background px-2 py-1 text-[11px]">{row.value}</code>
                    <button
                      type="button"
                      onClick={() => copyText(row.key, row.value)}
                      className="shrink-0 rounded p-1 hover:bg-background"
                      aria-label={t("コピー")}
                    >
                      {copiedKey === row.key
                        ? <Check className="w-3.5 h-3.5 text-emerald-600" />
                        : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-sm">{t("ThreadsアプリID")}</Label>
                  <Input
                    value={byoaAppId}
                    onChange={(e) => setByoaAppId(e.target.value)}
                    placeholder={ownApp?.appId ?? "例: 1234567890123456"}
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <Label className="text-sm">{t("Threadsアプリシークレット")}</Label>
                  <Input
                    type="password"
                    value={byoaSecret}
                    onChange={(e) => setByoaSecret(e.target.value)}
                    placeholder={ownApp?.configured ? "登録済み（変更する場合のみ入力）" : "Meta画面の「表示」で確認できます"}
                    autoComplete="off"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("シークレットは暗号化して保存し、画面には二度と表示されません。")}
              </p>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => setOwnApp.mutate({ appId: byoaAppId.trim(), appSecret: byoaSecret.trim() })}
                  disabled={setOwnApp.isPending || !byoaAppId.trim() || !byoaSecret.trim()}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  {setOwnApp.isPending ? "保存中..." : "保存する"}
                </Button>
                {ownApp?.configured && (
                  <Button
                    variant="outline"
                    onClick={() => clearOwnApp.mutate()}
                    disabled={clearOwnApp.isPending}
                    className="border-red-300 text-red-600 hover:bg-red-50"
                  >
                    {clearOwnApp.isPending ? "解除中..." : "登録を解除して通常の連携に戻す"}
                  </Button>
                )}
                {!ownApp?.configured && (
                  <Button variant="ghost" onClick={() => setByoaOpen(false)}>{t("キャンセル")}</Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("保存したら「Threads連携」で接続をやり直すと、この設定が反映されます。")}
              </p>
            </div>
          )}
        </Card>

        {/* ── プラン ── */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-5">
            <CreditCard className="w-5 h-5 text-purple-600" />
            <h2 className="text-lg font-semibold text-foreground">{t("プラン")}</h2>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">{t("現在のプラン")}</p>
              <p className="text-lg font-bold text-emerald-700 mt-1">{planLabel}</p>
            </div>
            <Button
              variant="outline"
              onClick={() => setLocation("/pricing")}
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            >
              {t("プラン変更")}
            </Button>
          </div>
        </Card>

        {/* ── アカウント削除 ── */}
        <Card className="p-6 border-red-200">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <h2 className="text-lg font-semibold text-red-700">{t("アカウント削除")}</h2>
          </div>

          {!showDeleteSection ? (
            <div>
              <p className="text-sm text-muted-foreground mb-3">
                {t("アカウントを削除すると、すべてのデータ（投稿履歴・プロジェクト・Threadsアカウント連携など）が完全に削除されます。この操作は取り消せません。")}
              </p>
              <Button
                variant="outline"
                className="border-red-300 text-red-600 hover:bg-red-50"
                onClick={() => setShowDeleteSection(true)}
              >
                {t("アカウント削除に進む")}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-800 font-medium mb-2">{t("以下の内容がすべて削除されます：")}</p>
                <ul className="text-sm text-red-700 list-disc pl-5 space-y-1">
                  <li>{t("アカウント情報・メールアドレス")}</li>
                  <li>{t("すべてのプロジェクト・投稿コンテンツ")}</li>
                  <li>{t("予約投稿・投稿履歴")}</li>
                  <li>{t("Threadsアカウント連携情報")}</li>
                  <li>{t("サブスクリプション（自動キャンセルされます）")}</li>
                </ul>
              </div>

              {/* email 認証ユーザはパスワードで確認、OAuth ユーザはメアド完全一致で確認 */}
              {(user as any)?.authProvider === 'email' ? (
                <div>
                  <Label className="text-sm text-foreground/80">{t("パスワードを入力")}</Label>
                  <Input
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder={t("現在のパスワード")}
                    className="mt-1"
                  />
                </div>
              ) : (
                <div>
                  <Label className="text-sm text-foreground/80">
                    {t("確認のため、ご自身のメールアドレスを入力してください")}
                  </Label>
                  <Input
                    type="email"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder={(user as any)?.email ?? 'your@email.com'}
                    className="mt-1"
                  />
                </div>
              )}

              <div>
                <Label className="text-sm text-foreground/80">
                  {t("確認のため")} <span className="font-mono font-bold">DELETE</span> {t("と入力してください")}
                </Label>
                <Input
                  value={deleteConfirmation}
                  onChange={(e) => setDeleteConfirmation(e.target.value)}
                  placeholder="DELETE"
                  className="mt-1"
                />
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowDeleteSection(false);
                    setDeletePassword("");
                    setDeleteConfirmation("");
                  }}
                >
                  {t("キャンセル")}
                </Button>
                <Button
                  className="bg-red-600 hover:bg-red-700 text-white"
                  disabled={deleteConfirmation !== "DELETE" || !deletePassword || deleteAccount.isPending}
                  onClick={() => {
                    const isEmailAuth = (user as any)?.authProvider === 'email';
                    deleteAccount.mutate({
                      password: isEmailAuth ? deletePassword : undefined,
                      emailConfirmation: isEmailAuth ? undefined : deletePassword,
                      confirmation: "DELETE" as const,
                    });
                  }}
                >
                  {deleteAccount.isPending ? "削除中..." : "アカウントを完全に削除"}
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
