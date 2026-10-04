import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Copy, Loader2, Sparkles, CalendarPlus, Lock } from "lucide-react";
import { useLocation } from "wouter";
import { isProOrAbove, VARIATION_COUNTS } from "@shared/postVariations";

/**
 * 1つの投稿から、同じ内容でいろいろな形の投稿を作る（2026-10-04 三上様指示・プロプラン以上）。
 * できた案は、そのままコピーするか、日時を選んで予約する。
 */
export default function PostVariationsDialog({
  open,
  onOpenChange,
  post,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  post: { id: number; postContent?: string | null; threadsAccountId?: number | null; projectId?: string | null } | null;
}) {
  const [, setLocation] = useLocation();
  const [count, setCount] = useState<3 | 5 | 10>(5);
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<{ drafts: Array<{ patternId: string; label: string; text: string }>; dropped: number; threadsAccountId: number | null; projectId: string | null } | null>(null);
  const [scheduleFor, setScheduleFor] = useState<string | null>(null); // patternId
  const [when, setWhen] = useState<string>(() => defaultWhen());
  const utils = trpc.useUtils();
  const { data: sub } = trpc.subscription.getStatus.useQuery();
  // 実効プラン（解約後・決済失敗中は「お申し込み前」）で判定する。最終の判定はサーバー側
  const canUse = isProOrAbove((sub as any)?.plan?.id ?? null);

  const gen = trpc.scheduledPost.variations.useMutation({
    onSuccess: (r) => {
      setResult(r as any);
      setOffset((o) => (o + count) % 10);
      if (r.drafts.length === 0) toast.error("検査に通る案を作れませんでした。もう一度お試しください。");
    },
    onError: (e) => toast.error(e.message),
  });
  const create = trpc.scheduledPost.create.useMutation({
    onSuccess: () => {
      toast.success("予約しました");
      setScheduleFor(null);
      utils.scheduledPost.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const close = (v: boolean) => {
    onOpenChange(v);
    if (!v) { setResult(null); setScheduleFor(null); }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="bg-background border border-border w-[calc(100vw-2rem)] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" />似たパターンを作る</DialogTitle>
          <DialogDescription>
            この投稿と同じ内容のまま、書き出し・構成・長さを変えた案を作ります。登録されているお店の情報に無いことは書きません。
          </DialogDescription>
        </DialogHeader>

        {post?.postContent && (
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground whitespace-pre-wrap break-words max-h-28 overflow-y-auto">
            {post.postContent}
          </div>
        )}

        {!canUse ? (
          <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-bold text-emerald-800 flex items-center gap-1.5"><Lock className="w-4 h-4" />プロプラン以上でご利用いただけます</p>
            <p className="text-xs text-emerald-700 mt-1">1本の投稿から、同じ内容で形の違う案を最大10本まとめて作れます。</p>
            <Button size="sm" className="mt-3 w-full bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setLocation("/pricing")}>料金プランを見る</Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">作る数</span>
              {VARIATION_COUNTS.map((n) => (
                <button
                  key={n}
                  onClick={() => setCount(n)}
                  className={`rounded-full border px-3 py-1 text-sm font-bold ${count === n ? "bg-primary text-white border-primary" : "border-border text-foreground"}`}
                >
                  {n}本
                </button>
              ))}
              <Button
                size="sm"
                className="ml-auto"
                disabled={!post || gen.isPending}
                onClick={() => post && gen.mutate({ postId: post.id, count, offset })}
              >
                {gen.isPending ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />作っています</> : result ? "別の案を作る" : "案を作る"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">1本につきAI生成1回として数えます。作るのに30秒ほどかかることがあります。</p>

            {result && (
              <div className="space-y-3">
                {result.dropped > 0 && (
                  <p className="text-xs text-muted-foreground">登録情報に無い内容が入った案など{result.dropped}本は、出さずに外しました。</p>
                )}
                {result.drafts.map((d) => (
                  <div key={d.patternId} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-bold text-primary">{d.label}</span>
                      <span className="text-xs text-muted-foreground">{Array.from(d.text.replace(/\s+/g, "")).length}字</span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap break-words">{d.text}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => { navigator.clipboard?.writeText(d.text).then(() => toast.success("コピーしました")).catch(() => toast.error("コピーできませんでした")); }}>
                        <Copy className="w-3 h-3 mr-1" />コピー
                      </Button>
                      {result.projectId && result.threadsAccountId && (
                        <Button size="sm" variant="outline" onClick={() => { setScheduleFor(d.patternId); setWhen(defaultWhen()); }}>
                          <CalendarPlus className="w-3 h-3 mr-1" />予約する
                        </Button>
                      )}
                    </div>
                    {scheduleFor === d.patternId && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="w-auto max-w-full" />
                        <Button
                          size="sm"
                          disabled={create.isPending || !when}
                          onClick={() => create.mutate({
                            projectId: String(result.projectId),
                            threadsAccountId: Number(result.threadsAccountId),
                            scheduledAt: new Date(when).toISOString(),
                            postContent: d.text,
                          })}
                        >
                          この日時で予約
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** 予約の初期値：明日の同じ時刻（分は00に丸める・ブラウザの時刻） */
function defaultWhen(): string {
  const d = new Date(Date.now() + 24 * 3600_000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
}
