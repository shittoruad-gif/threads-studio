import { useState } from "react";
import { useLocation } from "wouter";
import { Settings as SettingsIcon, Sparkles, Bell, User, CreditCard, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function Settings() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  // Auto-post settings
  const { data: autoPostSettings } = trpc.autoPost.getSettings.useQuery(undefined, {
    enabled: !!user,
  });
  const updateAutoPost = trpc.autoPost.updateSettings.useMutation({
    onSuccess: () => {
      utils.autoPost.getSettings.invalidate();
      toast.success("投稿設定を更新しました");
    },
  });

  // Subscription
  const { data: subscription } = trpc.subscription.getStatus.useQuery(undefined, {
    enabled: !!user,
  });

  // Local state for post settings
  const [postFrequency, setPostFrequency] = useState<number[]>([1]);
  const [postTimeSlots, setPostTimeSlots] = useState<string[]>(["morning"]);
  const [postTone, setPostTone] = useState("polite");

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

  const toggleTimeSlot = (slot: string) => {
    setPostTimeSlots((prev) =>
      prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot]
    );
  };

  const handleToggleAutoPost = () => {
    updateAutoPost.mutate({
      autoPostEnabled: !autoPostSettings?.autoPostEnabled,
    });
  };

  const handleFrequencyChange = (value: string) => {
    updateAutoPost.mutate({
      autoPostFrequency: value as "daily" | "twice_daily" | "three_daily",
    });
  };

  const planLabel = subscription?.planId
    ? subscription.planId === "pro"
      ? "プロプラン"
      : subscription.planId === "starter"
        ? "スタータープラン"
        : "無料プラン"
    : "無料プラン";

  const timeSlots = [
    { value: "morning", label: "朝（6:00〜9:00）" },
    { value: "noon", label: "昼（11:00〜13:00）" },
    { value: "evening", label: "夕方（17:00〜19:00）" },
    { value: "night", label: "夜（20:00〜21:00）" },
  ];

  return (
    <div className="max-w-3xl mx-auto">
      {/* Page Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
          <SettingsIcon className="w-5 h-5 text-orange-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">設定</h1>
          <p className="text-sm text-gray-500">投稿・アカウント・通知の設定を管理</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* ── 投稿設定 ── */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-5">
            <Sparkles className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-semibold text-gray-900">投稿設定</h2>
          </div>

          <div className="space-y-6">
            {/* Auto-post toggle */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium text-gray-900">自動投稿</Label>
                <p className="text-xs text-gray-500 mt-0.5">
                  AIが自動で投稿を生成・公開します
                </p>
              </div>
              <Switch
                checked={autoPostSettings?.autoPostEnabled ?? false}
                onCheckedChange={handleToggleAutoPost}
              />
            </div>

            {/* Frequency slider */}
            <div>
              <Label className="text-sm font-medium text-gray-900">
                投稿頻度（1日あたり）
              </Label>
              <div className="flex items-center gap-4 mt-2">
                <Slider
                  min={1}
                  max={5}
                  step={1}
                  value={postFrequency}
                  onValueChange={setPostFrequency}
                  className="flex-1"
                />
                <span className="text-sm font-semibold text-emerald-700 min-w-[3rem] text-center">
                  {postFrequency[0]}回/日
                </span>
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-1 px-1">
                <span>1回</span>
                <span>5回</span>
              </div>
            </div>

            {/* Time slots */}
            <div>
              <Label className="text-sm font-medium text-gray-900 mb-2 block">
                投稿時間帯
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {timeSlots.map((slot) => (
                  <label
                    key={slot.value}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                      postTimeSlots.includes(slot.value)
                        ? "border-emerald-300 bg-emerald-50"
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <Checkbox
                      checked={postTimeSlots.includes(slot.value)}
                      onCheckedChange={() => toggleTimeSlot(slot.value)}
                    />
                    <span className="text-sm text-gray-700">{slot.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Tone selection */}
            <div>
              <Label className="text-sm font-medium text-gray-900 mb-2 block">
                トーン選択
              </Label>
              <RadioGroup value={postTone} onValueChange={setPostTone} className="space-y-2">
                {[
                  { value: "polite", label: "丁寧", desc: "ですます調のフォーマルな文体" },
                  { value: "casual", label: "カジュアル", desc: "親しみやすいフレンドリーな文体" },
                  { value: "expert", label: "専門寄り", desc: "専門用語を交えた信頼感ある文体" },
                ].map((tone) => (
                  <label
                    key={tone.value}
                    className={`flex items-start gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                      postTone === tone.value
                        ? "border-emerald-300 bg-emerald-50"
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <RadioGroupItem value={tone.value} className="mt-0.5" />
                    <div>
                      <span className="text-sm font-medium text-gray-900">{tone.label}</span>
                      <p className="text-xs text-gray-500">{tone.desc}</p>
                    </div>
                  </label>
                ))}
              </RadioGroup>
            </div>
          </div>
        </Card>

        {/* ── アカウント設定 ── */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-5">
            <User className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">アカウント設定</h2>
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="name" className="text-sm font-medium text-gray-900">
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
              <Label htmlFor="email" className="text-sm font-medium text-gray-900">
                メールアドレス
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="mail@example.com"
                className="mt-1"
              />
            </div>

            <div className="pt-2 border-t border-gray-100">
              <Label className="text-sm font-medium text-gray-900 mb-1 block">
                パスワード変更
              </Label>
              <div className="space-y-2">
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="現在のパスワード"
                />
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="新しいパスワード"
                />
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
            <h2 className="text-lg font-semibold text-gray-900">通知設定</h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium text-gray-900">週次レポートメール</Label>
                <p className="text-xs text-gray-500 mt-0.5">
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
                <Label className="text-sm font-medium text-gray-900">コメント通知</Label>
                <p className="text-xs text-gray-500 mt-0.5">
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

        {/* ── プラン ── */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-5">
            <CreditCard className="w-5 h-5 text-purple-600" />
            <h2 className="text-lg font-semibold text-gray-900">プラン</h2>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">現在のプラン</p>
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
              <p className="text-sm text-gray-600 mb-3">
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
                <Label className="text-sm text-gray-700">パスワードを入力</Label>
                <Input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="現在のパスワード"
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-sm text-gray-700">
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
