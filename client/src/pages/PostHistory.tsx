import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Calendar, CheckCircle2, Clock, XCircle, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function PostHistory() {
  const [, setLocation] = useLocation();
  const { data: scheduledPosts, isLoading, refetch } = trpc.scheduledPost.list.useQuery();
  const cancelPost = trpc.scheduledPost.cancel.useMutation({
    onSuccess: () => {
      toast.success('予約投稿をキャンセルしました');
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200">
          <Clock className="w-3 h-3 mr-1" />
          予約中
        </Badge>;
      case 'processing':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-600 border-yellow-200">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          処理中
        </Badge>;
      case 'posted':
        return <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          投稿済み
        </Badge>;
      case 'failed':
        return <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200">
          <XCircle className="w-3 h-3 mr-1" />
          失敗
        </Badge>;
      case 'canceled':
        return <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200">
          <XCircle className="w-3 h-3 mr-1" />
          キャンセル
        </Badge>;
      default:
        return null;
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Animated background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-96 h-96 bg-primary/20 rounded-full blur-3xl float" style={{animationDelay: '0s'}} />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-accent/30 rounded-full blur-3xl float" style={{animationDelay: '2s'}} />
      </div>

      <div className="container py-8 relative z-10">
        <div className="flex items-center justify-between mb-6 scale-in">
          <Button variant="ghost" className="glass hover-lift" onClick={() => setLocation("/dashboard")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            ダッシュボードに戻る
          </Button>
        </div>

        <Card className="glass-card mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 gradient-text">
              <Calendar className="w-6 h-6" />
              投稿履歴・予約一覧
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : scheduledPosts && scheduledPosts.length > 0 ? (
              <div className="space-y-4">
                {scheduledPosts.map((post) => (
                  <Card key={post.id} className="glass hover-lift">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            {getStatusBadge(post.status)}
                            <span className="text-sm text-muted-foreground">
                              {formatDate(post.scheduledAt)}
                            </span>
                          </div>
                          
                          <p className="text-sm line-clamp-3 text-foreground">
                            {post.postContent}
                          </p>

                          {post.postedAt && (
                            <p className="text-xs text-green-600">
                              投稿完了: {formatDate(post.postedAt)}
                            </p>
                          )}

                          {post.errorMessage && (
                            <p className="text-xs text-red-600">
                              エラー: {post.errorMessage}
                            </p>
                          )}
                        </div>

                        {post.status === 'pending' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="glass hover-lift"
                            onClick={() => cancelPost.mutate({ postId: post.id })}
                            disabled={cancelPost.isPending}
                          >
                            キャンセル
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Calendar className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground mb-4">予約投稿はありません</p>
                <Button
                  variant="outline"
                  className="glass hover-lift"
                  onClick={() => setLocation("/")}
                >
                  スレッドを作成する
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
