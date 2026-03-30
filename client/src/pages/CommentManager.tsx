import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, MessageCircle, Send, Sparkles, RefreshCw, User, Copy, Check } from 'lucide-react';
import ThreadsAccountSwitcher, { useThreadsAccount } from '@/components/ThreadsAccountSwitcher';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export default function CommentManager() {
  const breadcrumbItems = [
    { label: 'ダッシュボード', href: '/dashboard' },
    { label: 'コメント管理' },
  ];

  const { selectedAccountId, selectedAccount } = useThreadsAccount();

  const [replyDialogOpen, setReplyDialogOpen] = useState(false);
  const [selectedComment, setSelectedComment] = useState<any | null>(null);
  const [generatedReplies, setGeneratedReplies] = useState<string[]>([]);
  const [selectedReplyIndex, setSelectedReplyIndex] = useState<number>(0);
  const [editedReply, setEditedReply] = useState('');
  const [postedCommentIds, setPostedCommentIds] = useState<Set<string>>(new Set());

  const {
    data: comments,
    isLoading,
    refetch,
  } = trpc.threads.getComments.useQuery(
    { accountId: selectedAccountId!, limit: 25 },
    { enabled: !!selectedAccountId }
  );

  const generateReplyMutation = trpc.threads.generateReply.useMutation({
    onSuccess: (data) => {
      setGeneratedReplies(data.replies);
      if (data.replies.length > 0) {
        setSelectedReplyIndex(0);
        setEditedReply(data.replies[0]);
      }
      toast.success('返信候補を生成しました');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const postReplyMutation = trpc.threads.postReply.useMutation({
    onSuccess: () => {
      toast.success('返信を投稿しました');
      if (selectedComment) {
        setPostedCommentIds(prev => new Set(prev).add(selectedComment.id));
      }
      setReplyDialogOpen(false);
      setSelectedComment(null);
      setGeneratedReplies([]);
      setEditedReply('');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleOpenReplyDialog = (comment: any) => {
    setSelectedComment(comment);
    setGeneratedReplies([]);
    setEditedReply('');
    setReplyDialogOpen(true);
  };

  const handleGenerateReply = () => {
    if (!selectedComment) return;
    generateReplyMutation.mutate({
      commentText: selectedComment.text,
      originalPostText: selectedComment.parent_post_text || undefined,
      commenterName: selectedComment.username || undefined,
    });
  };

  const handleSelectReply = (index: number) => {
    setSelectedReplyIndex(index);
    setEditedReply(generatedReplies[index]);
  };

  const handlePostReply = () => {
    if (!selectedAccountId || !selectedComment || !editedReply.trim()) return;
    postReplyMutation.mutate({
      accountId: selectedAccountId,
      commentId: selectedComment.id,
      text: editedReply.trim(),
    });
  };

  const handleCopyReply = async () => {
    try {
      await navigator.clipboard.writeText(editedReply);
      toast.success('コピーしました');
    } catch (err) {
      toast.error('コピーに失敗しました。ブラウザの権限設定を確認してください。');
    }
  };

  if (!selectedAccountId) {
    return (
      <div className="container max-w-6xl py-8">
        <PageBreadcrumb items={breadcrumbItems} />
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">コメント管理</h1>
            <p className="text-muted-foreground">
              投稿へのコメントにAIで返信を生成・投稿できます
            </p>
          </div>
          <ThreadsAccountSwitcher />
        </div>
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            <MessageCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-lg font-medium mb-2">Threadsアカウントを連携してください</p>
            <p className="text-sm">コメント管理を使うには、まずThreadsアカウントの連携が必要です。</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-6xl py-8">
      <PageBreadcrumb items={breadcrumbItems} />
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">コメント管理</h1>
          <p className="text-muted-foreground">
            投稿へのコメントにAIで返信を生成・投稿できます
            {selectedAccount && (
              <span className="ml-2 text-sm">
                (@{selectedAccount.threadsUsername})
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
            更新
          </Button>
          <ThreadsAccountSwitcher />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : !comments || comments.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            <MessageCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-lg font-medium mb-2">コメントがまだありません</p>
            <p className="text-sm">投稿にコメントが付くとここに表示されます。</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {comments.map((comment: any) => {
            const isPosted = postedCommentIds.has(comment.id);
            return (
              <Card
                key={comment.id}
                className={`transition-all ${isPosted ? 'border-green-300 bg-green-50/30' : 'hover:shadow-md'}`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Parent post preview */}
                      {comment.parent_post_text && (
                        <div className="mb-3 p-2 bg-muted rounded-lg border-l-4 border-orange-300">
                          <p className="text-xs font-medium text-muted-foreground mb-1">元の投稿</p>
                          <p className="text-sm line-clamp-2">{comment.parent_post_text}</p>
                        </div>
                      )}

                      {/* Commenter info */}
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                          <User className="w-4 h-4 text-orange-600" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">
                            @{comment.username || '不明'}
                          </p>
                          {comment.timestamp && (
                            <p className="text-xs text-muted-foreground">
                              {new Date(comment.timestamp).toLocaleString('ja-JP')}
                            </p>
                          )}
                        </div>
                        {isPosted && (
                          <Badge className="bg-green-100 text-green-700 border-green-300 ml-auto">
                            <Check className="w-3 h-3 mr-1" />
                            返信済み
                          </Badge>
                        )}
                      </div>

                      {/* Comment text */}
                      <CardTitle className="text-base font-normal leading-relaxed">
                        {comment.text}
                      </CardTitle>
                    </div>

                    <div className="flex flex-col gap-2 shrink-0">
                      <Button
                        size="sm"
                        className="bg-orange-500 hover:bg-orange-600 text-white"
                        onClick={() => handleOpenReplyDialog(comment)}
                        disabled={isPosted}
                        aria-label={`@${comment.username || '不明'}のコメントにAI返信を生成`}
                      >
                        <Sparkles className="w-4 h-4 mr-1" />
                        AI返信を生成
                      </Button>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      )}

      {/* Reply Generation Dialog */}
      <Dialog open={replyDialogOpen} onOpenChange={(open) => { if (!open) { setReplyDialogOpen(false); setSelectedComment(null); setGeneratedReplies([]); setEditedReply(''); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" aria-describedby="reply-dialog-desc">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600">
              <MessageCircle className="w-5 h-5" />
              AI返信を生成
            </DialogTitle>
            <DialogDescription id="reply-dialog-desc">
              コメントに対する自然で温かい返信を生成します。
            </DialogDescription>
          </DialogHeader>

          {selectedComment && (
            <div className="space-y-4 py-2">
              {/* Original comment */}
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  @{selectedComment.username || '不明'} さんのコメント
                </p>
                <p className="text-sm">{selectedComment.text}</p>
              </div>

              {/* Generate button */}
              {generatedReplies.length === 0 && (
                <Button
                  onClick={handleGenerateReply}
                  disabled={generateReplyMutation.isPending}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                >
                  {generateReplyMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      返信を生成中...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      AI返信を生成する
                    </>
                  )}
                </Button>
              )}

              {/* Reply candidates */}
              {generatedReplies.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm font-medium">返信候補（クリックで選択）</p>
                  <div className="grid gap-2">
                    {generatedReplies.map((reply, index) => (
                      <button
                        key={index}
                        onClick={() => handleSelectReply(index)}
                        className={`text-left p-3 rounded-lg border-2 transition-all text-sm ${
                          selectedReplyIndex === index
                            ? 'border-orange-400 bg-orange-50'
                            : 'border-border hover:border-orange-200 hover:bg-orange-50/50'
                        }`}
                      >
                        <span className="text-xs font-medium text-orange-600 mb-1 block">
                          候補 {index + 1}
                        </span>
                        {reply}
                      </button>
                    ))}
                  </div>

                  {/* Editable reply */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">返信を編集</label>
                    <textarea
                      value={editedReply}
                      onChange={(e) => setEditedReply(e.target.value)}
                      rows={3}
                      className="w-full p-3 text-sm border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-orange-400"
                      placeholder="返信を入力..."
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {editedReply.length}文字
                    </p>
                  </div>

                  {/* Regenerate button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateReply}
                    disabled={generateReplyMutation.isPending}
                  >
                    <RefreshCw className={`w-4 h-4 mr-1 ${generateReplyMutation.isPending ? 'animate-spin' : ''}`} />
                    別の候補を生成
                  </Button>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => { setReplyDialogOpen(false); setSelectedComment(null); setGeneratedReplies([]); setEditedReply(''); }}
            >
              キャンセル
            </Button>
            {editedReply && (
              <Button
                variant="outline"
                onClick={handleCopyReply}
              >
                <Copy className="w-4 h-4 mr-1" />
                コピー
              </Button>
            )}
            {editedReply && (
              <Button
                onClick={handlePostReply}
                disabled={postReplyMutation.isPending || !editedReply.trim()}
                className="bg-orange-500 hover:bg-orange-600 text-white"
              >
                {postReplyMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    投稿中...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    投稿する
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
