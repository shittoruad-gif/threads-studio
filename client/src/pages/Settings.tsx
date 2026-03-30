import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Settings as SettingsIcon, Sparkles, Bell, User, CreditCard, AlertTriangle, Save, Loader2, Moon, Sun, Palette } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAuth } from "@/_core/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function Settings() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const utils = trpc.useUtils();

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
      setEmail(user.email || "");
    }
  }, [user]);

  // Password change mutation
  const changePassword = trpc.account.changePassword.useMutation({
    onSuccess: () => {
      toast.success("パスワードを変更しました");
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
      ? "プロプラン"
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
          <h1 className="text-2xl font-bold text-foreground">設定</h1>
          <p className="text-sm text-muted-foreground">投稿・アカウント・通知の設定を管理</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* ── 投稿設定 ── */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-5">
            <Sparkles className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-semibold text-foreground">投稿設定</h2>
          </div>

          {settingsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-emerald-500"></div>
              <span className="ml-2 text-sm text-muted-foreground">設定を読み込み中...</span>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Auto-post toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium text-foreground">自動投稿</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    AIが自動で投稿を生成・公開します
                  </p>
                </div>
                <Switch
                  checked={autoPostSettings?.autoPostEnabled ?? false}
                  onCheckedChange={handleToggleAutoPost}
                  disabled={updateAutoPost.isPending}
                />
              </div>

              {/* Frequency selection */}
              <div>
                <Label className="text-sm font-medium text-foreground mb-2 block">
                  投稿頻度（1日あたり）
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
                    { value: "daily", label: "1日1回", desc: "着実に認知を広げたい方に" },
                    { value: "twice_daily", label: "1日2回", desc: "朝と夕方に投稿で露出UP" },
                    { value: "three_daily", label: "1日3回", desc: "最大露出で一気に認知を拡大" },
                  ].map((freq) => (
                    <label
                      key={freq.value}
                      className={`flex items-start gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                        postFrequency === freq.value
                          ? "border-emerald-300 bg-emerald-50"
                          : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <RadioGroupItem value={freq.value} className="mt-0.5" />
                      <div>
                        <span className="text-sm font-medium text-foreground">{freq.label}</span>
                        <p className="text-xs text-muted-foreground">{freq.desc}</p>
                      </div>
                    </label>
                  ))}
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
            <h2 className="text-lg font-semibold text-foreground">アカウント設定</h2>
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="name" className="text-sm font-medium text-foreground">
                名前
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="表示名"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="email" className="text-sm font-medium text-foreground">
                メールアドレス
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
              <p className="text-xs text-muted-foreground/60 mt-1">メールアドレスは変更できません</p>
            </div>

            <div className="pt-2 border-t border-border/50">
              <Label className="text-sm font-medium text-foreground mb-1 block">
                パスワード変更
              </Label>
              <div className="space-y-2">
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="現在のパスワード"
                />
                <div>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="新しいパスワード（8文字以上）"
                  />
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    8文字以上で、数字または記号を1つ以上含む必要があります
                  </p>
                </div>
              </div>
            </div>

            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={!currentPassword || !newPassword || changePassword.isPending}
              onClick={() => {
                if (newPassword.length < 8) {
                  toast.error("新しいパスワードは8文字以上にしてください");
                  return;
                }
                changePassword.mutate({ currentPassword, newPassword });
              }}
            >
              {changePassword.isPending ? "変更中..." : "パスワードを変更"}
            </Button>
          </div>
        </Card>

        {/* ── 通知設定 ── */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-5">
            <Bell className="w-5 h-5 text-amber-600" />
            <h2 className="text-lg font-semibold text-foreground">通知設定</h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium text-foreground">週次レポートメール</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  毎週月曜日に1週間の投稿実績をお届けします
                </p>
              </div>
              <Switch
                checked={weeklyReport}
                onCheckedChange={setWeeklyReport}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium text-foreground">コメント通知</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Threadsの投稿にコメントがあったら通知します
                </p>
              </div>
              <Switch
                checked={commentNotification}
                onCheckedChange={setCommentNotification}
              />
            </div>
          </div>
        </Card>

        {/* ── 表示設定 ── */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-5">
            <Palette className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-semibold">表示設定</h2>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">ダークモード</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                暗い配色に切り替えます（目の負担を軽減）
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
        </Card>

        {/* ── プラン ── */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-5">
            <CreditCard className="w-5 h-5 text-purple-600" />
            <h2 className="text-lg font-semibold text-foreground">プラン</h2>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">現在のプラン</p>
              <p className="text-lg font-bold text-emerald-700 mt-1">{planLabel}</p>
            </div>
            <Button
              variant="outline"
              onClick={() => setLocation("/pricing")}
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            >
              プラン変更
            </Button>
          </div>
        </Card>

        {/* ── アカウント削除 ── */}
        <Card className="p-6 border-red-200">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <h2 className="text-lg font-semibold text-red-700">アカウント削除</h2>
          </div>

          {!showDeleteSection ? (
            <div>
              <p className="text-sm text-muted-foreground mb-3">
                アカウントを削除すると、すべてのデータ（投稿履歴・プロジェクト・Threadsアカウント連携など）が完全に削除されます。この操作は取り消せません。
              </p>
              <Button
                variant="outline"
                className="border-red-300 text-red-600 hover:bg-red-50"
                onClick={() => setShowDeleteSection(true)}
              >
                アカウント削除に進む
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-800 font-medium mb-2">以下の内容がすべて削除されます：</p>
                <ul className="text-sm text-red-700 list-disc pl-5 space-y-1">
                  <li>アカウント情報・メールアドレス</li>
                  <li>すべてのプロジェクト・投稿コンテンツ</li>
                  <li>予約投稿・投稿履歴</li>
                  <li>Threadsアカウント連携情報</li>
                  <li>サブスクリプション（自動キャンセルされます）</li>
                </ul>
              </div>

              <div>
                <Label className="text-sm text-foreground/80">パスワードを入力</Label>
                <Input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="現在のパスワード"
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-sm text-foreground/80">
                  確認のため <span className="font-mono font-bold">DELETE</span> と入力してください
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
                  キャンセル
                </Button>
                <Button
                  className="bg-red-600 hover:bg-red-700 text-white"
                  disabled={deleteConfirmation !== "DELETE" || !deletePassword || deleteAccount.isPending}
                  onClick={() => {
                    deleteAccount.mutate({
                      password: deletePassword,
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
