import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Users, UserPlus, Copy, Check, KeyRound, Power, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "@/i18n";

/**
 * 代理店プラン専用：クライアントへログインIDを発行して管理する画面。
 * 発行したIDは代理店の契約に内包されるため、クライアント側に課金は発生しない。
 */
export default function AgencyClients() {
  const [, setLocation] = useLocation();
  const { t } = useLang();
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.agency.listClients.useQuery();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [storeName, setStoreName] = useState("");
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [resetFor, setResetFor] = useState<number | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const createClient = trpc.agency.createClient.useMutation({
    onSuccess: (_res, vars) => {
      // 発行直後だけ、渡すための情報を画面に出す（パスワードは保存されないので今しか見せられない）
      setIssued({ email: vars.email, password: vars.password });
      setEmail(""); setPassword(""); setStoreName("");
      utils.agency.listClients.invalidate();
      toast.success("クライアントIDを発行しました");
    },
    onError: (e) => toast.error(e.message || "発行に失敗しました"),
  });

  const setActive = trpc.agency.setClientActive.useMutation({
    onSuccess: () => { utils.agency.listClients.invalidate(); toast.success("状態を変更しました"); },
    onError: (e) => toast.error(e.message || "変更に失敗しました"),
  });

  const resetPw = trpc.agency.resetClientPassword.useMutation({
    onSuccess: () => { setResetFor(null); setResetPassword(""); toast.success("パスワードを再設定しました"); },
    onError: (e) => toast.error(e.message || "再設定に失敗しました"),
  });

  const generatePassword = () => {
    // 紛らわしい文字（0/O, 1/l/I）を除いた読み上げやすい12桁
    const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const arr = new Uint32Array(12);
    crypto.getRandomValues(arr);
    return Array.from(arr, (n) => chars[n % chars.length]).join("");
  };

  const copyIssued = async () => {
    if (!issued) return;
    // そのままメール／LINEに貼って送れる案内文にする
    const o = window.location.origin;
    const text =
      `このたびはお申し込みいただきありがとうございます。\n` +
      `Threads自動投稿サービスのアカウントをご用意しましたので、下記よりご利用ください。\n\n` +
      `■ はじめにお読みください（5分ほどで読めます）\n` +
      `${o}/welcome\n\n` +
      `■ ログイン情報\n` +
      `URL: ${o}/login\n` +
      `メールアドレス: ${issued.email}\n` +
      `パスワード: ${issued.password}\n` +
      `※ログイン後、設定画面からパスワードの変更をおすすめします\n\n` +
      `■ Threads連携の設定手順（Facebookアカウントの作成から説明しています）\n` +
      `${o}/threads-setup-guide\n\n` +
      `ご不明な点がございましたら、お気軽にご連絡ください。`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("ログイン情報をコピーしました");
    } catch {
      toast.error("コピーできませんでした。手動で選択してコピーしてください");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // 代理店プラン以外には案内だけ出す
  if (!data?.isAgency) {
    return (
      <div className="container max-w-2xl py-10 px-4">
        <Button variant="ghost" onClick={() => setLocation("/dashboard")} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" />{t("ダッシュボードに戻る")}
        </Button>
        <Card className="p-8 text-center">
          <Users className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <h1 className="text-xl font-bold mb-2">{t("クライアント管理は代理店プラン専用です")}</h1>
          <p className="text-sm text-muted-foreground mb-5">
            {t("代理店プランにご契約いただくと、クライアントごとにログインIDを発行して、それぞれのお店を運用してもらえます。")}
          </p>
          <Button onClick={() => setLocation("/pricing")} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {t("プランを見る")}
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-3xl py-8 px-4">
      <Button variant="ghost" onClick={() => setLocation("/dashboard")} className="mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" />{t("ダッシュボードに戻る")}
      </Button>

      <div className="flex items-center gap-2 mb-1">
        <Users className="w-6 h-6 text-orange-500" />
        <h1 className="text-2xl font-bold">{t("クライアント管理")}</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        {t("クライアントごとにログインIDを発行できます。料金は代理店プランに含まれるため、クライアント側の決済は不要です。")}
        <span className="ml-1 font-medium text-foreground">{data.used} / {data.limit}{t("件")}</span>
      </p>

      {/* 発行直後の受け渡し情報 */}
      {issued && (
        <Card className="p-5 mb-6 border-emerald-300 bg-emerald-50/60">
          <p className="text-sm font-semibold text-emerald-800 mb-2">
            {t("このログイン情報をクライアントにお渡しください（パスワードは今しか表示されません）")}
          </p>
          <div className="rounded-lg bg-background p-3 text-sm font-mono space-y-1">
            <div>URL: {window.location.origin}/login</div>
            <div>{t("メールアドレス")}: {issued.email}</div>
            <div>{t("パスワード")}: {issued.password}</div>
          </div>
          <p className="text-xs text-emerald-800 mt-2">
            {t("下のボタンで、案内文（はじめにお読みください・ログイン情報・設定手順）をまとめてコピーできます。そのままメールやLINEに貼ってお送りください。")}
          </p>
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={copyIssued} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
              {t("案内文をまとめてコピー")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setIssued(null)}>{t("閉じる")}</Button>
          </div>
        </Card>
      )}

      {/* 新規発行 */}
      <Card className="p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <UserPlus className="w-5 h-5 text-emerald-600" />
          <h2 className="font-semibold">{t("クライアントIDを発行")}</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-sm">{t("メールアドレス")}</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@example.com" type="email" />
          </div>
          <div>
            <Label className="text-sm">{t("店舗名（任意）")}</Label>
            <Input value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder={t("例：○○整体院")} />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-sm">{t("パスワード（10文字以上）")}</Label>
            <div className="flex gap-2">
              <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("自動生成もできます")} />
              <Button type="button" variant="outline" onClick={() => setPassword(generatePassword())}>
                {t("自動生成")}
              </Button>
            </div>
          </div>
        </div>
        <Button
          className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white"
          disabled={createClient.isPending || !email.trim() || password.trim().length < 10 || data.used >= data.limit}
          onClick={() => createClient.mutate({
            email: email.trim(),
            password: password.trim(),
            storeName: storeName.trim() || undefined,
          })}
        >
          {createClient.isPending ? t("発行中...") : t("この内容で発行する")}
        </Button>
        {data.used >= data.limit && (
          <p className="text-xs text-red-600 mt-2">{t("上限に達しています。不要なIDを停止してください。")}</p>
        )}
      </Card>

      {/* 一覧 */}
      <Card className="p-5">
        <h2 className="font-semibold mb-4">{t("発行済みクライアント")}</h2>
        {data.clients.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">{t("まだ発行していません")}</p>
        ) : (
          <div className="space-y-2">
            {data.clients.map((c) => (
              <div key={c.id} className="rounded-lg border border-border/60 p-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.storeName || c.name || c.email}</p>
                    <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                  </div>
                  <Badge variant={c.active ? "default" : "outline"} className={c.active ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "text-muted-foreground"}>
                    {c.active ? t("利用中") : t("停止中")}
                  </Badge>
                  <Button
                    size="sm" variant="outline"
                    onClick={() => setActive.mutate({ clientUserId: c.id, active: !c.active })}
                    disabled={setActive.isPending}
                  >
                    <Power className="w-3.5 h-3.5 mr-1" />
                    {c.active ? t("停止") : t("再開")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setResetFor(resetFor === c.id ? null : c.id); setResetPassword(""); }}>
                    <KeyRound className="w-3.5 h-3.5 mr-1" />{t("パスワード再設定")}
                  </Button>
                </div>

                {resetFor === c.id && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-border/50">
                    <Input
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                      placeholder={t("新しいパスワード（10文字以上）")}
                    />
                    <Button type="button" variant="outline" onClick={() => setResetPassword(generatePassword())}>
                      {t("自動生成")}
                    </Button>
                    <Button
                      disabled={resetPw.isPending || resetPassword.trim().length < 10}
                      onClick={() => resetPw.mutate({ clientUserId: c.id, password: resetPassword.trim() })}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      {resetPw.isPending ? t("設定中...") : t("設定する")}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
