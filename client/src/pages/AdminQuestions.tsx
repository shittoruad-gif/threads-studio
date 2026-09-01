import { useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, MessageSquare, Send, BookOpen } from 'lucide-react';
import { toast } from 'sonner';

/**
 * お客様からのご質問の管理画面。
 *
 * ここでできること:
 *   1. 自動応答が何を聞かれて何と答えたかを確認する
 *   2. 担当者対応が必要なものに、LINEで直接返信する
 *   3. よくある質問に掲載する（お客様向けページにそのまま出る）
 *   4. 分類ごとの件数を見て、説明会で扱う題材を決める
 */
export default function AdminQuestions() {
  const [needsHumanOnly, setNeedsHumanOnly] = useState(false);
  const [replyTarget, setReplyTarget] = useState<any>(null);
  const [replyText, setReplyText] = useState('');
  const [faqTarget, setFaqTarget] = useState<any>(null);
  const [faqQuestion, setFaqQuestion] = useState('');
  const [faqAnswer, setFaqAnswer] = useState('');

  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.admin.listQuestions.useQuery({ needsHumanOnly });

  const reply = trpc.admin.replyToQuestion.useMutation({
    onSuccess: () => {
      toast.success('お客様のLINEに返信をお送りしました');
      setReplyTarget(null); setReplyText('');
      utils.admin.listQuestions.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const publish = trpc.admin.publishQuestionToFaq.useMutation({
    onSuccess: () => {
      toast.success('よくある質問を更新しました');
      setFaqTarget(null);
      utils.admin.listQuestions.invalidate();
      utils.support.publishedFaq.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const rows = data?.questions ?? [];
  const counts = data?.categoryCounts ?? [];
  const waiting = data?.waitingCount ?? 0;

  const openReply = (q: any) => { setReplyTarget(q); setReplyText(''); };
  const openFaq = (q: any) => {
    setFaqTarget(q);
    setFaqQuestion(q.faqQuestion || q.question || '');
    setFaqAnswer(q.faqAnswer || q.staffReply || q.aiAnswer || '');
  };

  const fmt = (d: any) => {
    if (!d) return '';
    try { return new Date(d).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  };

  const topCategories = useMemo(() => counts.slice(0, 8), [counts]);

  return (
    <div className="container max-w-5xl py-6 px-4 space-y-6">
      <PageBreadcrumb items={[{ label: 'ダッシュボード', href: '/' }, { label: 'お問い合わせ' }]} />

      <div>
        <h1 className="text-2xl font-bold text-foreground">お客様からのご質問</h1>
        <p className="text-sm text-muted-foreground mt-1">
          公式LINEに届いたご質問と、自動でお答えした内容です。答えられなかったものは、ここから直接ご返信いただけます。
        </p>
      </div>

      {/* 説明会の題材づくり用の集計 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">どんなことが多く聞かれているか</CardTitle>
        </CardHeader>
        <CardContent>
          {topCategories.length === 0 ? (
            <p className="text-sm text-muted-foreground">まだご質問がありません。</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {topCategories.map((c) => (
                <Badge key={c.category} variant="secondary" className="text-sm px-3 py-1">
                  {c.category} <span className="ml-2 font-bold">{c.count}</span>
                </Badge>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-3">
            件数の多い順です。無料説明会で扱う内容を決めるときの目安にしてください。
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3 flex-wrap">
        <Button
          variant={needsHumanOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => setNeedsHumanOnly((v) => !v)}
        >
          担当者対応が必要なものだけ
        </Button>
        {waiting > 0 && (
          <span className="text-sm font-bold text-red-600">未返信 {waiting} 件</span>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          該当するご質問はありません。
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {rows.map((q: any) => (
            <Card key={q.id}>
              <CardContent className="pt-5 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline">{q.category || 'その他'}</Badge>
                    <Badge variant="outline">{q.source === 'web' ? 'アプリから' : 'LINEから'}</Badge>
                    {q.needsHuman === 1 && !q.repliedAt && <Badge variant="destructive">要返信</Badge>}
                    {q.repliedAt && <Badge variant="secondary">返信済み</Badge>}
                    {q.faqPublished === 1 && <Badge className="bg-emerald-600">よくある質問に掲載中</Badge>}
                  </div>
                  <span className="text-xs text-muted-foreground">{fmt(q.createdAt)}</span>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground mb-1">ご質問</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap break-words">{q.question}</p>
                </div>

                {q.aiAnswer && (
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground mb-1">
                      自動でお答えした内容{q.aiConfident === 1 ? '' : '（自信なしと判断・お客様には送っていません）'}
                    </p>
                    <p className="text-sm text-foreground whitespace-pre-wrap break-words">{q.aiAnswer}</p>
                  </div>
                )}

                {q.staffReply && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/30">
                    <p className="text-xs text-muted-foreground mb-1">担当者の返信（{fmt(q.repliedAt)}）</p>
                    <p className="text-sm text-foreground whitespace-pre-wrap break-words">{q.staffReply}</p>
                  </div>
                )}

                <div className="flex gap-2 flex-wrap pt-1">
                  {q.lineUserId && (
                    <Button size="sm" onClick={() => openReply(q)}>
                      <Send className="w-4 h-4 mr-1.5" />
                      {q.repliedAt ? 'もう一度返信する' : 'LINEで返信する'}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => openFaq(q)}>
                    <BookOpen className="w-4 h-4 mr-1.5" />
                    {q.faqPublished === 1 ? '掲載内容を直す' : 'よくある質問に載せる'}
                  </Button>
                  {q.faqPublished === 1 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => publish.mutate({ id: q.id, publish: false })}
                      disabled={publish.isPending}
                    >
                      掲載をやめる
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* LINEで返信 */}
      <Dialog open={!!replyTarget} onOpenChange={(o) => !o && setReplyTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />お客様のLINEに返信する
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground mb-1">ご質問</p>
              <p className="text-sm whitespace-pre-wrap break-words">{replyTarget?.question}</p>
            </div>
            <Textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              rows={7}
              placeholder="お客様へのご返信を入力してください。押した時点でLINEに届きます。"
            />
            <p className="text-xs text-muted-foreground">
              送信ボタンを押すと、お客様のLINEトークにそのまま届きます。内容をご確認のうえ送信してください。
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReplyTarget(null)}>やめる</Button>
            <Button
              onClick={() => replyTarget && reply.mutate({ id: replyTarget.id, message: replyText })}
              disabled={reply.isPending || replyText.trim().length === 0}
            >
              {reply.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              LINEに送信する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* よくある質問への掲載 */}
      <Dialog open={!!faqTarget} onOpenChange={(o) => !o && setFaqTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5" />よくある質問に載せる
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">掲載する質問文</p>
              <Input value={faqQuestion} onChange={(e) => setFaqQuestion(e.target.value)} maxLength={255} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">掲載する回答</p>
              <Textarea value={faqAnswer} onChange={(e) => setFaqAnswer(e.target.value)} rows={7} />
            </div>
            <p className="text-xs text-muted-foreground">
              お客様が見る「よくある質問」ページに、この内容がそのまま表示されます。お名前や個別のご事情は書かないでください。
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFaqTarget(null)}>やめる</Button>
            <Button
              onClick={() => faqTarget && publish.mutate({ id: faqTarget.id, publish: true, faqQuestion, faqAnswer })}
              disabled={publish.isPending || !faqQuestion.trim() || !faqAnswer.trim()}
            >
              {publish.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              掲載する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
