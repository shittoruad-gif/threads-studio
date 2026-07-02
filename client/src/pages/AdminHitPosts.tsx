import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { trpc } from '@/lib/trpc';
import { Flame, Download, Search, Eye, Heart, MessageCircle, Repeat2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * 全ユーザー横断の「伸びた投稿」アーカイブ（管理者専用）。
 * プロンプト・バズ型のアップデート時に、実際に伸びた投稿を学習素材として
 * 参照するためのページ。日次ジョブ(analytics_snapshot)が自動で蓄積する。
 */
export default function AdminHitPosts() {
  const [businessType, setBusinessType] = useState('');
  const [appliedFilter, setAppliedFilter] = useState('');

  const { data, isLoading } = trpc.admin.listHitPostArchive.useQuery({
    businessType: appliedFilter || undefined,
    limit: 200,
    offset: 0,
  });

  const rows = data?.rows ?? [];

  const formatNumber = (n: number) => {
    if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toLocaleString();
  };

  const handleExportCSV = () => {
    if (rows.length === 0) {
      toast.error('エクスポートするデータがありません');
      return;
    }
    const esc = (v: string | number | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = '業種,本文,インプレッション,いいね,返信,リポスト,エンゲージメント,投稿日\n';
    const body = rows
      .map((r) => [
        esc(r.businessType),
        esc(r.postContent),
        r.impressions, r.likes, r.replies, r.reposts, r.engagement,
        esc(r.postedAt ? new Date(r.postedAt).toLocaleDateString('ja-JP') : ''),
      ].join(','))
      .join('\n');
    const csv = '﻿' + header + body;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hit_posts_archive_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${rows.length}件をエクスポートしました`);
  };

  return (
    <div className="container py-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flame className="w-6 h-6 text-orange-500" />
            伸びた投稿アーカイブ（全ユーザー横断）
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            平均エンゲージメントを超えた投稿を毎朝自動収集。プロンプトやバズ型を改善する際の学習素材です。
            {data && <span className="ml-2 font-medium text-foreground">全{data.total}件</span>}
          </p>
          <div className="flex flex-col sm:flex-row gap-2 mt-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="業種で絞り込み（例：整体）"
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') setAppliedFilter(businessType.trim()); }}
                className="pl-9 h-9"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-9" onClick={() => setAppliedFilter(businessType.trim())}>
                絞り込む
              </Button>
              <Button variant="outline" size="sm" className="h-9" onClick={handleExportCSV}>
                <Download className="w-4 h-4 mr-1.5" />
                CSVエクスポート
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">読み込み中...</p>
          ) : rows.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              まだアーカイブがありません（毎朝7時の自動収集で蓄積されます）
            </p>
          ) : (
            <div className="space-y-3">
              {rows.map((r, idx) => (
                <div key={r.id} className="p-4 rounded-lg border border-border bg-muted/20">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-sm font-bold text-muted-foreground">#{idx + 1}</span>
                    {r.businessType && <Badge variant="secondary" className="text-xs">{r.businessType}</Badge>}
                    <span className="text-xs text-muted-foreground">
                      {r.postedAt ? new Date(r.postedAt).toLocaleDateString('ja-JP') : ''}
                    </span>
                    <span className="ml-auto text-xs font-semibold text-orange-600">
                      エンゲージメント {r.engagement}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap text-foreground">{r.postContent || '（テキストなし）'}</p>
                  <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{formatNumber(r.impressions)}</span>
                    <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{r.likes}</span>
                    <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" />{r.replies}</span>
                    <span className="flex items-center gap-1"><Repeat2 className="w-3 h-3" />{r.reposts}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
