import { useState } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MessageSquarePlus, X, Send, CheckCircle2, Bug, Lightbulb, HelpCircle, Wrench } from 'lucide-react';
import { toast } from 'sonner';

const categoryOptions = [
  { value: 'bug', label: 'バグ報告', icon: Bug, color: 'text-red-500' },
  { value: 'usability', label: '使いにくい点', icon: Wrench, color: 'text-orange-500' },
  { value: 'feature_request', label: '機能リクエスト', icon: Lightbulb, color: 'text-yellow-500' },
  { value: 'other', label: 'その他', icon: HelpCircle, color: 'text-blue-500' },
] as const;

export default function MonitorFeedbackWidget({ bottomOffset = false }: { bottomOffset?: boolean }) {
  const [location] = useLocation();
  // スマホの下部タブバー（約64px）と重ならないよう、FABの下位置を持ち上げる
  const posClass = bottomOffset ? 'fixed bottom-[76px] right-4 z-50' : 'fixed bottom-6 right-6 z-50';
  const [isOpen, setIsOpen] = useState(false);
  const [category, setCategory] = useState<string>('other');
  const [content, setContent] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const submitMutation = trpc.monitor.submitFeedback.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      setContent('');
      setCategory('other');
      setTimeout(() => {
        setSubmitted(false);
        setIsOpen(false);
      }, 2000);
      toast.success('送信しました！ありがとうございます。');
    },
    onError: (err) => {
      toast.error(err.message || '送信に失敗しました');
    },
  });

  const handleSubmit = () => {
    if (!content.trim()) {
      toast.error('内容を入力してください');
      return;
    }

    // Get the current page name from location
    const pageName = location === '/' ? 'ダッシュボード' : location.replace(/^\//, '');

    submitMutation.mutate({
      page: pageName,
      category: category as any,
      content: content.trim(),
    });
  };

  if (submitted) {
    return (
      <div className={posClass}>
        <div className="bg-background border border-border rounded-2xl shadow-xl p-6 w-[min(20rem,calc(100vw-2rem))] flex flex-col items-center gap-3">
          <CheckCircle2 className="h-10 w-10 text-green-500" />
          <p className="text-sm font-medium text-foreground">送信完了！</p>
          <p className="text-xs text-muted-foreground">ご協力ありがとうございます</p>
        </div>
      </div>
    );
  }

  return (
    <div className={posClass}>
      {isOpen ? (
        <div className="bg-background border border-border rounded-2xl shadow-xl w-[min(20rem,calc(100vw-2rem))] overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquarePlus className="h-4 w-4 text-white" />
              <span className="text-sm font-medium text-white">ご質問・ご要望</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white/80 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              現在のページ: <span className="font-medium text-foreground">{location === '/' ? 'ダッシュボード' : location.replace(/^\//, '')}</span>
            </p>

            <div className="space-y-1.5">
              <Label className="text-xs">カテゴリ</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex items-center gap-2">
                        <opt.icon className={`h-3.5 w-3.5 ${opt.color}`} />
                        <span>{opt.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">ご質問や改善してほしい点はこちら</Label>
              <Textarea
                placeholder="ご質問や改善してほしい点をご記入ください..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="text-sm min-h-[100px] resize-none"
                maxLength={2000}
              />
              <p className="text-xs text-muted-foreground text-right">{content.length}/2000</p>
            </div>

            <Button
              onClick={handleSubmit}
              disabled={submitMutation.isPending || !content.trim()}
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              size="sm"
            >
              {submitMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <span className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  送信中...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Send className="h-3.5 w-3.5" />
                  送信する
                </span>
              )}
            </Button>
          </div>
        </div>
      ) : (
        // ラベル付きピル型。AIアシスタントボタン（オレンジ・この上に浮く）と
        // 見分けがつくよう文字を出す
        <button
          onClick={() => setIsOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full h-11 px-4 flex items-center gap-2 shadow-lg hover:shadow-xl transition-all hover:scale-105 group"
          title="ご質問・ご要望"
        >
          <MessageSquarePlus className="h-5 w-5 group-hover:rotate-12 transition-transform" />
          <span className="text-sm font-medium">ご要望</span>
        </button>
      )}
    </div>
  );
}
