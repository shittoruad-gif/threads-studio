import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  BarChart3,
  Download,
  Eye,
  Heart,
  Loader2,
  MessageCircle,
  RefreshCw,
  Repeat2,
  Star,
  TrendingUp,
  Clock,
  Flame,
} from "lucide-react";
import { useLocation } from "wouter";
import { useLang } from "@/i18n";
import { toast } from "sonner";
import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Cell,
} from "recharts";

export default function PostAnalytics() {
  const { t } = useLang();
  const [, setLocation] = useLocation();
  const { data: analyticsData, isLoading, refetch } = trpc.stats.postAnalytics.useQuery();
  const { data: inquiryData } = trpc.stats.inquiryStats.useQuery();
  const { data: hitPostsData } = trpc.stats.hitPosts.useQuery();
  const fetchAnalytics = trpc.stats.fetchAndStoreAnalytics.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.fetchedCount}${t('件の投稿データを取得しました')}`);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const [activeTab, setActiveTab] = useState<"overview" | "ranking" | "timing">("overview");

  // ── 当たり投稿 →「文体のお手本」への昇格 ──────────────────────
  const { data: projectList } = trpc.project.list.useQuery();
  const utils = trpc.useUtils();
  const updateProject = trpc.project.update.useMutation({
    onSuccess: () => {
      toast.success(t('文体のお手本に追加しました！今後のAI生成がこの文体を参考にします'));
      utils.project.list.invalidate();
    },
    onError: (e) => toast.error(e.message || t('追加に失敗しました')),
  });
  // 複数プロジェクト時の選択用
  const [promoteContent, setPromoteContent] = useState<string | null>(null);

  const doPromote = (project: { id: string; styleSamples?: string | null }, content: string) => {
    const existing = (project.styleSamples || '').trim();
    // 同一投稿の二重追加を防ぐ（区切りで分割し「完全一致」で判定。
    // 先頭一致だと、定型の書き出しが同じ別投稿を誤って弾いてしまうため）
    const segments = existing ? existing.split('\n---\n').map((s) => s.trim()) : [];
    if (segments.includes(content.trim())) {
      toast.info(t('この投稿はすでにお手本に追加されています'));
      return;
    }
    let next = existing ? `${existing}\n---\n${content}` : content;
    // プロンプト側の上限(2000字)に合わせ、超える場合は古いお手本から削る
    while (next.length > 2000 && next.includes('\n---\n')) {
      next = next.slice(next.indexOf('\n---\n') + 5);
    }
    updateProject.mutate({ id: project.id, styleSamples: next });
  };

  const handlePromote = (content: string | null) => {
    if (!content?.trim()) { toast.error(t('本文が取得できない投稿です')); return; }
    const projects = projectList || [];
    if (projects.length === 0) { toast.error(t('プロジェクトがありません')); return; }
    if (projects.length === 1) { doPromote(projects[0] as any, content.trim()); return; }
    setPromoteContent(content.trim()); // 複数ある場合は選択ダイアログ
  };

  const posts = analyticsData?.posts ?? [];
  const avgEngagement = analyticsData?.avgEngagement ?? 0;
  const hitPostIds = new Set(hitPostsData?.hitPosts?.map((p) => p.threadsPostId) ?? []);

  // Sort by engagement rate (highest first)
  const sortedPosts = [...posts].sort((a, b) => b.engagementRate - a.engagementRate);

  // Calculate summary stats
  const totalImpressions = posts.reduce((sum, p) => sum + p.impressions, 0);
  const totalLikes = posts.reduce((sum, p) => sum + p.likes, 0);
  const totalReplies = posts.reduce((sum, p) => sum + p.replies, 0);
  const totalReposts = posts.reduce((sum, p) => sum + p.reposts, 0);

  // Engagement trend data (last 10 posts, chronological)
  const trendData = [...posts]
    .sort((a, b) => {
      const dateA = a.postedAt ? new Date(a.postedAt).getTime() : 0;
      const dateB = b.postedAt ? new Date(b.postedAt).getTime() : 0;
      return dateA - dateB;
    })
    .slice(-10)
    .map((p, i) => ({
      name: p.postedAt
        ? new Date(p.postedAt).toLocaleDateString("ja-JP", { month: "short", day: "numeric" })
        : `投稿${i + 1}`,
      インプレッション: p.impressions,
      エンゲージメント: p.engagement,
      エンゲージメント率: Number(p.engagementRate.toFixed(2)),
    }));

  // Best posting time analysis
  const hourCounts: Record<number, { count: number; totalEngagement: number }> = {};
  for (const p of posts) {
    if (!p.postedAt) continue;
    const hour = new Date(p.postedAt).getHours();
    if (!hourCounts[hour]) hourCounts[hour] = { count: 0, totalEngagement: 0 };
    hourCounts[hour].count++;
    hourCounts[hour].totalEngagement += p.engagement;
  }

  const timingData = Array.from({ length: 24 }, (_, h) => ({
    時間帯: `${h}時`,
    hour: h,
    投稿数: hourCounts[h]?.count ?? 0,
    平均エンゲージメント: hourCounts[h]
      ? Math.round(hourCounts[h].totalEngagement / hourCounts[h].count)
      : 0,
  })).filter((d) => d.投稿数 > 0 || (d.hour >= 6 && d.hour <= 23));

  // Find best hour
  let bestHour = -1;
  let bestAvgEngagement = 0;
  for (const [hour, data] of Object.entries(hourCounts)) {
    const avg = data.totalEngagement / data.count;
    if (avg > bestAvgEngagement) {
      bestAvgEngagement = avg;
      bestHour = parseInt(hour);
    }
  }

  const formatNumber = (n: number) => {
    if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toLocaleString();
  };

  const truncateText = (text: string | null, maxLen: number = 60) => {
    if (!text) return t("（テキストなし）");
    return text.length > maxLen ? text.slice(0, maxLen) + "..." : text;
  };

  const handleExportCSV = () => {
    if (posts.length === 0) {
      toast.error(t("エクスポートするデータがありません"));
      return;
    }
    const header = "投稿日時,投稿内容,閲覧数,いいね,返信,リポスト,エンゲージメント,エンゲージメント率(%)\n";
    const rows = sortedPosts.map((p) => {
      const date = p.postedAt ? new Date(p.postedAt).toLocaleString("ja-JP") : "";
      const content = `"${(p.postContent || "").replace(/"/g, '""')}"`;
      return `${date},${content},${p.impressions},${p.likes},${p.replies},${p.reposts},${p.engagement},${p.engagementRate.toFixed(2)}`;
    }).join("\n");
    const csv = "\uFEFF" + header + rows; // BOM for Excel
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `threads_analytics_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(t("分析データをCSVでダウンロードしました"));
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Animated background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute top-20 left-10 w-96 h-96 bg-primary/20 rounded-full blur-3xl float"
          style={{ animationDelay: "0s" }}
        />
        <div
          className="absolute bottom-20 right-10 w-96 h-96 bg-accent/30 rounded-full blur-3xl float"
          style={{ animationDelay: "2s" }}
        />
      </div>

      <div className="container py-6 sm:py-8 relative z-10 max-w-6xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4 scale-in">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="glass hover-lift"
              onClick={() => setLocation("/dashboard")}
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              {t('戻る')}
            </Button>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
                <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                {t('投稿分析')}
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {t('Threads投稿のパフォーマンスを分析')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {posts.length > 0 && (
              <Button
                variant="outline"
                onClick={handleExportCSV}
              >
                <Download className="w-4 h-4 mr-2" />
                {t('CSV出力')}
              </Button>
            )}
            <Button
              onClick={() => fetchAnalytics.mutate()}
              disabled={fetchAnalytics.isPending}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {fetchAnalytics.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              {t('最新データを取得')}
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="mt-4 text-muted-foreground">{t('データを読み込み中...')}</p>
          </div>
        ) : posts.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <BarChart3 className="w-12 h-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold mb-2">{t('分析データがありません')}</h3>
              <p className="text-muted-foreground text-center mb-6 max-w-md">
                {t('Threadsアカウントを連携して「最新データを取得」ボタンを押すと、投稿のパフォーマンスデータが表示されます。')}
              </p>
              <Button
                onClick={() => fetchAnalytics.mutate()}
                disabled={fetchAnalytics.isPending}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {fetchAnalytics.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                {t('データを取得する')}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
              <Card className="glass-card hover-lift">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                      <Eye className="w-4 h-4 text-blue-600" />
                    </div>
                    <span className="text-xs text-muted-foreground">{t('閲覧数')}</span>
                  </div>
                  <p className="text-xl sm:text-2xl font-bold">{formatNumber(totalImpressions)}</p>
                </CardContent>
              </Card>
              <Card className="glass-card hover-lift">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center">
                      <Heart className="w-4 h-4 text-rose-500" />
                    </div>
                    <span className="text-xs text-muted-foreground">{t('いいね')}</span>
                  </div>
                  <p className="text-xl sm:text-2xl font-bold">{formatNumber(totalLikes)}</p>
                </CardContent>
              </Card>
              <Card className="glass-card hover-lift">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                      <MessageCircle className="w-4 h-4 text-amber-600" />
                    </div>
                    <span className="text-xs text-muted-foreground">{t('返信')}</span>
                  </div>
                  <p className="text-xl sm:text-2xl font-bold">{formatNumber(totalReplies)}</p>
                </CardContent>
              </Card>
              <Card className="glass-card hover-lift">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                      <Repeat2 className="w-4 h-4 text-emerald-600" />
                    </div>
                    <span className="text-xs text-muted-foreground">{t('リポスト')}</span>
                  </div>
                  <p className="text-xl sm:text-2xl font-bold">{formatNumber(totalReposts)}</p>
                </CardContent>
              </Card>
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-1 mb-6 bg-muted/50 rounded-lg p-1 w-fit">
              {([
                { key: "overview" as const, label: t("概要"), icon: TrendingUp },
                { key: "ranking" as const, label: t("投稿ランキング"), icon: Star },
                { key: "timing" as const, label: t("投稿時間分析"), icon: Clock },
              ]).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                    activeTab === tab.key
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  <span className="text-xs sm:text-sm">{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Overview Tab */}
            {activeTab === "overview" && (
              <div className="space-y-6">
                {/* Engagement Trend Chart */}
                <Card className="glass-card">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-primary" />
                      {t("エンゲージメント推移")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {trendData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={trendData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis
                            dataKey="name"
                            tick={{ fontSize: 12 }}
                            stroke="hsl(var(--muted-foreground))"
                          />
                          <YAxis
                            tick={{ fontSize: 12 }}
                            stroke="hsl(var(--muted-foreground))"
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "8px",
                              fontSize: "12px",
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="インプレッション"
                            name={t("インプレッション")}
                            stroke="hsl(220, 70%, 55%)"
                            strokeWidth={2}
                            dot={{ fill: "hsl(220, 70%, 55%)", r: 4 }}
                          />
                          <Line
                            type="monotone"
                            dataKey="エンゲージメント"
                            name={t("エンゲージメント")}
                            stroke="hsl(var(--primary))"
                            strokeWidth={2}
                            dot={{ fill: "hsl(var(--primary))", r: 4 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-center text-muted-foreground py-8">
                        {t("トレンドデータがありません")}
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Hit Posts Summary */}
                {hitPostsData && hitPostsData.hitPosts.length > 0 && (
                  <Card className="glass-card border-primary/20">
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Flame className="w-4 h-4 text-orange-500" />
                        {t("当たり投稿 TOP3")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {hitPostsData.hitPosts.slice(0, 3).map((post, idx) => (
                          <div
                            key={post.threadsPostId}
                            className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/10"
                          >
                            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                              {idx + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium line-clamp-2">
                                {truncateText(post.postContent, 80)}
                              </p>
                              <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Eye className="w-3 h-3" />
                                  {formatNumber(post.impressions)}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Heart className="w-3 h-3" />
                                  {post.likes}
                                </span>
                                <span className="flex items-center gap-1">
                                  <MessageCircle className="w-3 h-3" />
                                  {post.replies}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Repeat2 className="w-3 h-3" />
                                  {post.reposts}
                                </span>
                              </div>
                            </div>
                            <Badge className="bg-orange-100 text-orange-700 border-orange-200 flex-shrink-0">
                              <Flame className="w-3 h-3 mr-1" />
                              {t("当たり")}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* LINE問い合わせ計測（Keiro連携時のみ表示） */}
                {inquiryData?.enabled && (
                  <Card className="glass-card border-green-500/20">
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <MessageCircle className="w-4 h-4 text-green-600" />
                        {t("LINE問い合わせ（投稿別・直近")}{inquiryData.days}{t("日）")}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {t("各投稿のコメントで案内した合言葉が公式LINEに届いた数です。どの投稿が問い合わせにつながったかが分かります。")}
                      </p>
                    </CardHeader>
                    <CardContent>
                      {"error" in inquiryData && inquiryData.error ? (
                        <p className="text-sm text-muted-foreground py-4 text-center">{inquiryData.error}</p>
                      ) : inquiryData.posts.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4 text-center">
                          {t("集計対象の自動投稿がまだありません")}
                        </p>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm pb-2 border-b border-border/50">
                            <span className="text-muted-foreground">{t("期間合計")}</span>
                            <span className="font-bold text-green-600">{inquiryData.totalHits}{t("件")}</span>
                          </div>
                          {inquiryData.posts.map((p) => (
                            <div
                              key={p.id}
                              className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/40"
                            >
                              <Badge variant="outline" className="flex-shrink-0 font-normal">
                                「{p.keyword}」
                              </Badge>
                              <p className="flex-1 min-w-0 text-xs text-muted-foreground truncate">
                                {p.excerpt || t("（本文なし）")}
                              </p>
                              <span className={`flex-shrink-0 text-sm font-bold ${p.inquiries > 0 ? "text-green-600" : "text-muted-foreground"}`}>
                                {p.inquiries}{t("件")}
                              </span>
                            </div>
                          ))}
                          {(inquiryData.unattributed ?? 0) > 0 && (
                            <p className="text-xs text-muted-foreground pt-1">
                              {t("ほか、投稿に紐付かない合言葉の受信が")}{inquiryData.unattributed}{t("件（固定投稿や過去投稿経由の可能性）")}
                            </p>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* Ranking Tab */}
            {activeTab === "ranking" && (
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Star className="w-4 h-4 text-primary" />
                    投稿ランキング（エンゲージメント率順）
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {sortedPosts.map((post, idx) => {
                      const isHit = hitPostIds.has(post.threadsPostId);
                      return (
                        <div
                          key={post.threadsPostId}
                          className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
                            isHit
                              ? "bg-primary/5 border border-primary/15"
                              : "bg-muted/30 hover:bg-muted/50"
                          }`}
                        >
                          <div
                            className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
                              idx < 3
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-sm font-medium line-clamp-2 flex-1">
                                {truncateText(post.postContent, 80)}
                              </p>
                              {isHit && (
                                <Badge className="bg-orange-100 text-orange-700 border-orange-200 flex-shrink-0 text-xs">
                                  <Flame className="w-3 h-3 mr-0.5" />
                                  当たり投稿
                                </Badge>
                              )}
                            </div>
                            {isHit && (
                              <button
                                type="button"
                                onClick={() => handlePromote(post.postContent)}
                                disabled={updateProject.isPending}
                                className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1 hover:bg-emerald-100 transition-colors"
                              >
                                ✍️ 文体のお手本に追加
                              </button>
                            )}
                            <div className="flex flex-wrap gap-2 sm:gap-4 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Eye className="w-3 h-3" />
                                {formatNumber(post.impressions)}
                              </span>
                              <span className="flex items-center gap-1">
                                <Heart className="w-3 h-3" />
                                {post.likes}
                              </span>
                              <span className="flex items-center gap-1">
                                <MessageCircle className="w-3 h-3" />
                                {post.replies}
                              </span>
                              <span className="flex items-center gap-1">
                                <Repeat2 className="w-3 h-3" />
                                {post.reposts}
                              </span>
                              <span className="flex items-center gap-1 font-medium text-primary">
                                <TrendingUp className="w-3 h-3" />
                                {post.engagementRate.toFixed(2)}%
                              </span>
                            </div>
                            {post.postedAt && (
                              <p className="text-xs text-muted-foreground/60 mt-1">
                                {new Date(post.postedAt).toLocaleString("ja-JP", {
                                  year: "numeric",
                                  month: "2-digit",
                                  day: "2-digit",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Timing Tab */}
            {activeTab === "timing" && (
              <div className="space-y-6">
                {/* Best Time Badge */}
                {bestHour >= 0 && (
                  <Card className="glass-card border-primary/20">
                    <CardContent className="p-4 sm:p-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                          <Clock className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">
                            最もエンゲージメントが高い時間帯
                          </p>
                          <p className="text-2xl font-bold text-foreground">
                            {bestHour}:00 ~ {bestHour + 1}:00
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            平均エンゲージメント: {Math.round(bestAvgEngagement)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Timing Chart */}
                <Card className="glass-card">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Clock className="w-4 h-4 text-primary" />
                      時間帯別パフォーマンス
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {timingData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={timingData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis
                            dataKey="時間帯"
                            tick={{ fontSize: 11 }}
                            stroke="hsl(var(--muted-foreground))"
                          />
                          <YAxis
                            tick={{ fontSize: 12 }}
                            stroke="hsl(var(--muted-foreground))"
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "8px",
                              fontSize: "12px",
                            }}
                          />
                          <Bar dataKey="平均エンゲージメント" radius={[4, 4, 0, 0]}>
                            {timingData.map((entry) => (
                              <Cell
                                key={entry.時間帯}
                                fill={
                                  entry.hour === bestHour
                                    ? "hsl(var(--primary))"
                                    : "hsl(var(--primary) / 0.3)"
                                }
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-center text-muted-foreground py-8">
                        時間帯データがありません
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </>
        )}
      </div>

      {/* 複数プロジェクト時：どの店舗のお手本に追加するか選ぶ */}
      {promoteContent && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setPromoteContent(null)}>
          <div className="bg-background rounded-2xl border border-border shadow-xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold text-foreground mb-1">どの店舗のお手本に追加しますか？</p>
            <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{promoteContent}</p>
            <div className="space-y-2">
              {(projectList || []).map((p: any) => (
                <button
                  key={p.id}
                  type="button"
                  className="w-full text-left px-4 py-2.5 rounded-lg border border-border text-sm hover:bg-emerald-50 hover:border-emerald-300 transition-colors"
                  onClick={() => { doPromote(p, promoteContent); setPromoteContent(null); }}
                >
                  {p.name || p.businessType || p.id}
                </button>
              ))}
            </div>
            <Button variant="ghost" className="w-full mt-3" onClick={() => setPromoteContent(null)}>キャンセル</Button>
          </div>
        </div>
      )}
    </div>
  );
}
