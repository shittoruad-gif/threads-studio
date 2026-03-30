import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { trpc } from '@/lib/trpc';
import { Clock } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useThreadsAccount } from '@/components/ThreadsAccountSwitcher';
import { triggerCelebration } from '@/components/Celebration';

interface SchedulePostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  postContent: string;
}

export function SchedulePostDialog({ open, onOpenChange, projectId, postContent }: SchedulePostDialogProps) {
  const { selectedAccountId: globalAccountId } = useThreadsAccount();
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');

  const { data: accounts } = trpc.threads.list.useQuery();

  // Auto-select account from global context
  useEffect(() => {
    if (globalAccountId && !selectedAccountId) {
      setSelectedAccountId(globalAccountId.toString());
    }
  }, [globalAccountId, open]);
  const createScheduledPost = trpc.scheduledPost.create.useMutation({
    onSuccess: () => {
      toast.success('予約投稿を設定しました');
      triggerCelebration('first-post');
      onOpenChange(false);
      setSelectedAccountId('');
      setScheduledDate('');
      setScheduledTime('');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmData, setConfirmData] = useState<{ scheduledAt: Date; accountName: string } | null>(null);

  const handleSchedule = () => {
    if (!selectedAccountId) {
      toast.error('Threadsアカウントを選択してください');
      return;
    }
    if (!scheduledDate || !scheduledTime) {
      toast.error('日時を選択してください');
      return;
    }

    const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`);
    const now = new Date();

    if (scheduledAt <= now) {
      toast.error('未来の日時を選択してください');
      return;
    }

    const account = accounts?.find((a) => a.id.toString() === selectedAccountId);
    setConfirmData({
      scheduledAt,
      accountName: account?.threadsUsername || selectedAccountId,
    });
    setShowConfirm(true);
  };

  const handleConfirmSchedule = () => {
    if (!confirmData) return;

    createScheduledPost.mutate({
      projectId,
      threadsAccountId: parseInt(selectedAccountId),
      scheduledAt: confirmData.scheduledAt.toISOString(),
      postContent,
    });
    setShowConfirm(false);
    setConfirmData(null);
  };

  // デフォルト値を設定（現在時刻の1時間後）
  const getDefaultDateTime = () => {
    const now = new Date();
    now.setHours(now.getHours() + 1);
    const date = now.toISOString().split('T')[0];
    const time = now.toTimeString().slice(0, 5);
    return { date, time };
  };

  const defaultDateTime = getDefaultDateTime();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background border border-border relative overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Clock className="w-5 h-5 text-emerald-600" />
            予約投稿を設定
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Threadsアカウントと投稿日時を選択してください
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Threadsアカウント選択 */}
          <div>
            <Label className="text-foreground/80">Threadsアカウント</Label>
            {accounts && accounts.length > 0 ? (
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="アカウントを選択" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem 
                      key={account.id} 
                      value={account.id.toString()}
                    >
                      @{account.threadsUsername}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="mt-2 p-3 rounded-lg bg-yellow-50 border border-yellow-200">
                <p className="text-yellow-700 text-sm">
                  Threadsアカウントが連携されていません。
                  <Button
                    variant="link"
                    className="text-yellow-700 underline p-0 h-auto ml-1"
                    onClick={() => {
                      onOpenChange(false);
                      window.location.href = '/threads-connect';
                    }}
                  >
                    連携する
                  </Button>
                </p>
              </div>
            )}
          </div>

          {/* 日付選択 */}
          <div>
            <Label htmlFor="date" className="text-foreground/80">投稿日</Label>
            <input
              id="date"
              type="date"
              value={scheduledDate || defaultDateTime.date}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="w-full mt-2 px-3 py-2 rounded-lg bg-background border border-border text-foreground"
              min={new Date().toISOString().split('T')[0]}
            />
          </div>

          {/* 時刻選択 */}
          <div>
            <Label htmlFor="time" className="text-foreground/80">投稿時刻</Label>
            <input
              id="time"
              type="time"
              value={scheduledTime || defaultDateTime.time}
              onChange={(e) => setScheduledTime(e.target.value)}
              className="w-full mt-2 px-3 py-2 rounded-lg bg-background border border-border text-foreground"
            />
          </div>

          {/* プレビュー */}
          <div className="p-3 rounded-lg bg-muted/50 border border-border">
            <p className="text-muted-foreground text-sm mb-2">投稿内容プレビュー</p>
            <p className="text-foreground text-sm line-clamp-3">{postContent}</p>
          </div>
        </div>

        {/* Confirmation overlay */}
        {showConfirm && confirmData && (
          <div className="absolute inset-0 bg-background/95 z-10 rounded-lg flex flex-col items-center justify-center p-6">
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                <Clock className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">予約を確定しますか？</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  <span className="font-medium text-foreground/80">@{confirmData.accountName}</span> に<br />
                  <span className="font-medium text-foreground/80">
                    {confirmData.scheduledAt.toLocaleString('ja-JP', {
                      month: 'long', day: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                  に投稿されます
                </p>
              </div>
              <div className="flex gap-3 justify-center">
                <Button
                  variant="outline"
                  onClick={() => { setShowConfirm(false); setConfirmData(null); }}
                >
                  戻る
                </Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={handleConfirmSchedule}
                  disabled={createScheduledPost.isPending}
                >
                  {createScheduledPost.isPending ? '設定中...' : '確定する'}
                </Button>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground/80"
          >
            キャンセル
          </Button>
          <Button
            onClick={handleSchedule}
            disabled={createScheduledPost.isPending || !accounts || accounts.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {createScheduledPost.isPending ? '設定中...' : '予約する'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
