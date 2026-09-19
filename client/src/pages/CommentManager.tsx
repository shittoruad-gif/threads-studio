import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useLang } from '@/i18n';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, MessageCircle, Send, Sparkles, RefreshCw, User, Copy, Check, BellOff, Undo2, ShieldAlert } from 'lucide-react';
import ThreadsAccountSwitcher, { useThreadsAccount } from '@/components/ThreadsAccountSwitcher';
import PageGuide from '@/components/PageGuide';
import { toast } from 'sonner';
import { looksLikeSpamComment } from '@shared/commentSpam';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export default function CommentManager() {
  const { t, lang } = useLang();
  const breadcrumbItems = [
    { label: t('ダッシュボード'), href: '/dashboard' },
    { label: t('コメント管理') },
  ];

  const { selectedAccountId, selectedAccount } = useThreadsAccount();

  const [replyDialogOpen, setReplyDialogOpen] = useState(false);
  const [selectedComment, setSelectedComment] = useState<any | null>(null);
  const [generatedReplies, setGeneratedReplies] = useState<string[]>([]);
  const [selectedReplyIndex, setSelectedReplyIndex] = useState<number>(0);
  const [editedReply, setEditedReply] = useState('');
  const [postedCommentIds, setPostedCommentIds] = useState<Set<string>>(new Set());
  // ★スルーしたコメント（2026-09-19 三上様指示）。勧誘・出会い系のコメントは来るものなので、
  //   「返信しない」を押して一覧から消せるようにする。LINEのカードには9/17から同じボタンがある。
  const [showSkipped, setShowSkipped] = useState(false);

  const { data: hiddenItems } = trpc.hidden.list.useQuery();
  const skippedCommentIds = new Set((hiddenItems?.comment ?? []).map(String));
  const utils = trpc.useUtils();
  const skipCommentMutation = trpc.hidden.hide.useMutation({
    onSuccess: () => { utils.hidden.list.invalidate(); },
    onError: (error) => { toast.error(error.message); },
  });
  const unskipCommentMutation = trpc.hidden.unhide.useMutation({
    onSuccess: () => { utils.hidden.list.invalidate(); },
    onError: (error) => { toast.error(error.message); },
  });

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
      toast.success(t('返信候補を生成しました'));
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const postReplyMutation = trpc.threads.postReply.useMutation({
    onSuccess: () => {
      toast.success(t('返信を投稿しました'));
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

  /** 返信しない（スルー）。一覧から消えるだけで、Threads側には何もしない */
  const handleSkipComment = (comment: any) => {
    skipCommentMutation.mutate({ itemType: 'comment', itemKey: String(comment.id) });
    toast.success(t('このコメントには返信しません。一覧から外しました'));
  };

  const handleUnskipComment = (comment: any) => {
    unskipCommentMutation.mutate({ itemType: 'comment', itemKey: String(comment.id) });
  };

  const handleCopyReply = async () => {
    try {
      await navigator.clipboard.writeText(editedReply);
      toast.success(t('コピーしました'));
    } catch (err) {
      toast.error(t('コピーに失敗しました。ブラウザの権限設定を確認してください。'));
    }
  };

  const skippedCount = (comments ?? []).filter((c: any) => skippedCommentIds.has(String(c.id))).length;
  const visibleComments = showSkipped
    ? (comments ?? [])
    : (comments ?? []).filter((c: any) => !skippedCommentIds.has(String(c.id)));

  if (!selectedAccountId) {
    return (
      <div className="container max-w-6xl py-8">
        <PageBreadcrumb items={breadcrumbItems} />
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">{t('コメント管理')}</h1>
            <p className="text-muted-foreground">
              {t('投稿へのコメントにAIで返信を生成・投稿できます')}
            </p>
          </div>
          <ThreadsAccountSwitcher />
        </div>
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            <MessageCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-lg font-medium mb-2">{t('Threadsアカウントを連携してください')}</p>
            <p className="text-sm">{t('コメント管理を使うには、まずThreadsアカウントの連携が必要です。')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-6xl py-8">
      <PageBreadcrumb items={breadcrumbItems} />
      {/* スマホでは横並びだと切替UI(最小180px)が画面外へはみ出すため縦積みにする */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">{t('コメント管理')}</h1>
          <p className="text-muted-foreground">
            {t('投稿へのコメントにAIで返信を生成・投稿できます')}
            {selectedAccount && (
              <span className="ml-2 text-sm">
                (@{selectedAccount.threadsUsername})
              </span>
            )}
          </p>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
            {t('更新')}
          </Button>
          <ThreadsAccountSwitcher compact className="min-w-0 flex-1 sm:flex-none" />
        </div>
      </div>

      <PageGuide steps={[
        <>{t('返信したいコメントの')}<b>{t('AI返信を生成')}</b>{t('を押します')}</>,
        <>{t('出てきた候補をタップで選び、必要なら文章を手直しします')}</>,
        <><b>{t('投稿する')}</b>{t('を押すとThreadsに返信されます')}</>,
        <>{t('勧誘や出会い系のコメントは')}<b>{t('返信しない')}</b>{t('を押してください。一覧から外れます（返信しないことで不利になることはありません）')}</>,
      ]} />

      {isLoading ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : !comments || comments.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            <MessageCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-lg font-medium mb-2">{t('コメントがまだありません')}</p>
            <p className="text-sm">{t('投稿にコメントが付くとここに表示されます。')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {/* スルーしたコメントは既定で隠す。押し間違えても、ここから戻せる */}
          {skippedCount > 0 && (
            <button
              type="button"
              onClick={() => setShowSkipped((v) => !v)}
              className="self-start text-sm text-muted-foreground underline underline-offset-4"
            >
              {showSkipped
                ? t('返信しないコメントを隠す')
                : `${t('返信しないことにしたコメント')}（${skippedCount}${t('件')}）${t('を表示')}`}
            </button>
          )}
          {visibleComments.map((comment: any) => {
            const isPosted = postedCommentIds.has(comment.id);
            const isSkipped = skippedCommentIds.has(String(comment.id));
            // ★勧誘・出会い系は、LINEのカードと同じ見分け方（shared/commentSpam.ts）
            const isSpam = !isSkipped && looksLikeSpamComment(String(comment.text || ''), comment.username ?? null);
            return (
              <Card
                key={comment.id}
                className={`transition-all ${isSkipped ? 'border-muted bg-muted/30 opacity-70' : isPosted ? 'border-green-300 bg-green-50/30' : isSpam ? 'border-amber-300 bg-amber-50/30' : 'hover:shadow-md'}`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Parent post preview */}
                      {comment.parent_post_text && (
                        <div className="mb-3 p-2 bg-muted rounded-lg border-l-4 border-orange-300">
                          <p className="text-xs font-medium text-muted-foreground mb-1">{t('元の投稿')}</p>
                          <p className="text-sm line-clamp-2">{comment.parent_post_text}</p>
                        </div>
                      )}

                      {/* Commenter info */}
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                          <User className="w-4 h-4 text-orange-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">
                            @{comment.username || t('不明')}
                          </p>
                          {comment.timestamp && (
                            <p className="text-xs text-muted-foreground">
                              {new Date(comment.timestamp).toLocaleString(lang === 'en' ? 'en-US' : 'ja-JP')}
                            </p>
                          )}
                        </div>
                        {isPosted && (
                          <Badge className="bg-green-100 text-green-700 border-green-300 ml-auto shrink-0">
                            <Check className="w-3 h-3 mr-1" />
                            {t('返信済み')}
                          </Badge>
                        )}
                        {isSkipped && (
                          <Badge variant="outline" className="ml-auto shrink-0 text-muted-foreground">
                            <BellOff className="w-3 h-3 mr-1" />
                            {t('返信しない')}
                          </Badge>
                        )}
                      </div>

                      {/* Comment text */}
                      <CardTitle className="text-base font-normal leading-relaxed">
                        {comment.text}
                      </CardTitle>

                      {/* 勧誘・出会い系のときのご案内（LINEのカードと同じ考え方） */}
                      {isSpam && (
                        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2">
                          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                          <p className="text-sm text-amber-900">
                            {t('勧誘・出会い系のコメントのようです。返信しないことをおすすめします（返信すると相手への反応になり、アカウントが止められやすくなります）。')}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 shrink-0">
                      {!isSkipped && (
                        <Button
                          size="sm"
                          variant={isSpam ? 'outline' : 'default'}
                          className={isSpam ? '' : 'bg-orange-500 hover:bg-orange-600 text-white'}
                          onClick={() => handleOpenReplyDialog(comment)}
                          disabled={isPosted}
                          aria-label={`@${comment.username || t('不明')}`}
                        >
                          <Sparkles className="w-4 h-4 mr-1" />
                          {t('AI返信を生成')}
                        </Button>
                      )}
                      {/* ★返信しない（スルー）。Threads側には何もせず、一覧から外すだけ */}
                      {isSkipped ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleUnskipComment(comment)}
                          disabled={unskipCommentMutation.isPending}
                        >
                          <Undo2 className="w-4 h-4 mr-1" />
                          {t('元に戻す')}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant={isSpam ? 'default' : 'ghost'}
                          className={isSpam ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'text-muted-foreground'}
                          onClick={() => handleSkipComment(comment)}
                          disabled={isPosted || skipCommentMutation.isPending}
                        >
                          <BellOff className="w-4 h-4 mr-1" />
                          {t('返信しない')}
                        </Button>
                      )}
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
              {t('AI返信を生成')}
            </DialogTitle>
            <DialogDescription id="reply-dialog-desc">
              {t('コメントに対する自然で温かい返信を生成します。')}
            </DialogDescription>
          </DialogHeader>

          {selectedComment && (
            <div className="space-y-4 py-2">
              {/* Original comment */}
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  @{selectedComment.username || t('不明')}{t('さんのコメント')}
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
                      {t('返信を生成中...')}
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      {t('AI返信を生成する')}
                    </>
                  )}
                </Button>
              )}

              {/* Reply candidates */}
              {generatedReplies.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm font-medium">{t('返信候補（クリックで選択）')}</p>
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
                          {t('候補')} {index + 1}
                        </span>
                        {reply}
                      </button>
                    ))}
                  </div>

                  {/* Editable reply */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">{t('返信を編集')}</label>
                    <textarea
                      value={editedReply}
                      onChange={(e) => setEditedReply(e.target.value)}
                      rows={3}
                      className="w-full p-3 text-sm border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-orange-400"
                      placeholder={t('返信を入力...')}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {editedReply.length}{t('文字')}
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
                    {t('別の候補を生成')}
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
              {t('キャンセル')}
            </Button>
            {editedReply && (
              <Button
                variant="outline"
                onClick={handleCopyReply}
              >
                <Copy className="w-4 h-4 mr-1" />
                {t('コピー')}
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
                    {t('投稿中...')}
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    {t('投稿する')}
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
