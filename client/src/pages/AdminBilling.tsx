import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, RefreshCw, AlertTriangle, Mail, CreditCard, ChevronDown, ChevronUp } from 'lucide-react';

/**
 * 管理者向け「契約・メール」画面。
 *
 * - 契約一覧: UnivaPayストアの全サブスクをAPI直結で表示（ストアは他事業と共用の
 *   ため、リンク説明で何の商品の契約かを出す）。アプリ登録ユーザーとメールで
 *   突き合わせ、同一メールで複数の有効契約がある場合は二重契約の警告を出す。
 * - 送信メール: アプリが顧客へ送ったメールの記録（2026-08-14以降の分）。
 */

function subStatusBadge(status: string) {
  switch (status) {
    case 'current':
      return <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200">契約中</Badge>;
    case 'canceled':
      return <Badge className="bg-muted text-muted-foreground border border-border">解約済</Badge>;
    case 'unpaid':
    case 'suspended':
      return <Badge className="bg-red-50 text-red-700 border border-red-200">支払い問題</Badge>;
    case 'unconfirmed':
      return <Badge className="bg-amber-50 text-amber-700 border border-amber-200">未確定</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function fmtDate(v: string | Date | null | undefined) {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('ja-JP');
}

export default function AdminBilling() {
  const [emailSearch, setEmailSearch] = useState('');
  const [expandedLog, setExpandedLog] = useState<number | null>(null);

  const contracts = trpc.admin.univapayContracts.useQuery(undefined, {
    // UnivaPay APIを100件叩くので、勝手に何度も再取得しない
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const logs = trpc.admin.emailLogs.useQuery(
    { search: emailSearch || undefined, limit: 200 },
    { refetchOnWindowFocus: false },
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">契約・メール</h1>
        <p className="text-sm text-muted-foreground mt-1">
          UnivaPayの全契約と、アプリから顧客へ送信したメールを確認できます。
        </p>
      </div>

      <Tabs defaultValue="contracts">
        <TabsList className="mb-4">
          <TabsTrigger value="contracts">
            <CreditCard className="mr-1.5 h-4 w-4" />
            契約一覧
          </TabsTrigger>
          <TabsTrigger value="emails">
            <Mail className="mr-1.5 h-4 w-4" />
            送信メール
          </TabsTrigger>
        </TabsList>

        {/* ── 契約一覧 ─────────────────────────────── */}
        <TabsContent value="contracts">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Threads Studio関連の契約のみ表示（【Threads】決済リンク経由＋アプリ登録ユーザーの契約）。「契約内容」は決済リンクの説明文です。
            </p>
            <Button size="sm" variant="outline" onClick={() => contracts.refetch()} disabled={contracts.isFetching}>
              {contracts.isFetching ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
              最新の情報に更新
            </Button>
          </div>

          {contracts.isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              UnivaPayから契約情報を取得中...（10秒ほどかかります）
            </div>
          ) : contracts.error ? (
            <p className="py-8 text-center text-sm text-red-600">取得に失敗しました: {contracts.error.message}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">契約者</th>
                    <th className="px-3 py-2 font-medium">メール</th>
                    <th className="px-3 py-2 font-medium text-right">月額</th>
                    <th className="px-3 py-2 font-medium">状態</th>
                    <th className="px-3 py-2 font-medium">契約内容（決済リンク）</th>
                    <th className="px-3 py-2 font-medium">開始日</th>
                    <th className="px-3 py-2 font-medium">次回課金</th>
                    <th className="px-3 py-2 font-medium">アプリ契約</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(contracts.data ?? []).map((c: any) => (
                    <tr key={c.id} className={c.duplicateWarning ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''}>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {c.payerName ?? '—'}
                        {c.duplicateWarning && (
                          <span className="ml-1.5 inline-flex items-center text-amber-600" title="同一メールで複数の有効契約があります（二重契約の可能性）">
                            <AlertTriangle className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{c.email ?? '—'}</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">¥{Number(c.amount).toLocaleString('ja-JP')}</td>
                      <td className="px-3 py-2.5">{subStatusBadge(c.status)}</td>
                      <td className="px-3 py-2.5 text-xs">{c.linkDescription ?? <span className="text-muted-foreground">（リンク情報なし）</span>}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs">{fmtDate(c.createdOn)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs">{c.status === 'current' ? fmtDate(c.nextPaymentDate) : '—'}</td>
                      <td className="px-3 py-2.5 text-xs">
                        {c.appUser
                          ? <span>{c.appUser.planId ?? '—'}<span className="text-muted-foreground">（{c.appUser.planStatus ?? '—'}）</span></span>
                          : <span className="text-muted-foreground">未登録</span>}
                      </td>
                    </tr>
                  ))}
                  {(contracts.data ?? []).length === 0 && (
                    <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">契約がありません</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            ⚠️ 黄色の行＝同一メールで複数の有効契約（二重契約の可能性）。「アプリ契約」はThreads Studio内の契約記録です。
          </p>
        </TabsContent>

        {/* ── 送信メール ─────────────────────────────── */}
        <TabsContent value="emails">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Input
              placeholder="宛先メールで検索..."
              value={emailSearch}
              onChange={(e) => setEmailSearch(e.target.value)}
              className="h-9 max-w-xs text-sm"
            />
            <p className="text-xs text-muted-foreground">
              2026年8月14日以降にアプリが送ったメールが記録されます（それ以前の分は記録がありません）。
            </p>
          </div>

          {logs.isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              読み込み中...
            </div>
          ) : (
            <div className="space-y-2">
              {(logs.data ?? []).map((log: any) => (
                <div key={log.id} className="rounded-lg border border-border">
                  <button
                    className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-left"
                    onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                  >
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('ja-JP')}
                    </span>
                    {log.status === 'sent'
                      ? <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200">送信済</Badge>
                      : log.status === 'failed'
                        ? <Badge className="bg-red-50 text-red-700 border border-red-200">失敗</Badge>
                        : <Badge variant="outline">未送信</Badge>}
                    <span className="text-xs text-muted-foreground">{log.toEmail}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{log.subject}</span>
                    {expandedLog === log.id ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  </button>
                  {expandedLog === log.id && (
                    <div className="border-t border-border p-3">
                      {log.error && <p className="mb-2 text-xs text-red-600">エラー: {log.error}</p>}
                      {/* 送信したHTMLをそのまま表示（サンドボックス付きiframeで隔離） */}
                      <iframe
                        title={`email-${log.id}`}
                        sandbox=""
                        srcDoc={log.body ?? ''}
                        className="h-[420px] w-full rounded border border-border bg-white"
                      />
                    </div>
                  )}
                </div>
              ))}
              {(logs.data ?? []).length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">送信メールの記録はまだありません</p>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
