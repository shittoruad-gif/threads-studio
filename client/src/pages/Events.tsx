import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CalendarClock, ChevronDown } from "lucide-react";
import { toast } from "sonner";

/**
 * イベント告知（開催日から逆算した告知投稿を自動生成・予約する）。
 *
 * イベントを登録すると、2週間前/1週間前/3日前/前日/当日の告知投稿をAIが作り
 * 予約に積む（開催日が近い場合は残りの回だけ）。承認モードONなら承認待ちで止まる。
 * 生成された投稿は「投稿の確認・予定」から通常どおり修正・キャンセルできる。
 */

const STATUS_LABEL: Record<string, string> = {
  pending: "予約中",
  awaiting_approval: "承認待ち",
  posted: "投稿済み",
  processing: "投稿中",
  failed: "失敗",
  canceled: "取消",
};

function fmtJst(v: string | Date) {
  return new Date(v).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });
}

export default function Events() {
  const utils = trpc.useUtils();
  const accounts = trpc.threads.list.useQuery();
  const projects = trpc.project.list.useQuery();
  const eventsList = trpc.events.list.useQuery();

  const [form, setForm] = useState({
    title: "", eventDate: "", eventTime: "", venue: "", description: "", offer: "",
    threadsAccountId: 0, projectId: "",
  });
  const [openId, setOpenId] = useState<number | null>(null);

  const createEvent = trpc.events.create.useMutation({
    onSuccess: (res) => {
      toast.success(
        `告知${res.created}件を予約しました` +
        (res.requireApproval ? "（承認モードのため、承認後に公開されます）" : ""),
      );
      setForm({ title: "", eventDate: "", eventTime: "", venue: "", description: "", offer: "", threadsAccountId: form.threadsAccountId, projectId: form.projectId });
      utils.events.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const cancelEvent = trpc.events.cancel.useMutation({
    onSuccess: (res) => { toast.success(`イベントを中止し、未投稿の告知${res.canceledPosts}件を取り消しました`); utils.events.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const accountId = form.threadsAccountId || accounts.data?.[0]?.id || 0;
  const projectId = form.projectId || projects.data?.[0]?.id || "";
  const canSubmit = Boolean(form.title && form.eventDate && accountId && projectId) && !createEvent.isPending;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <CalendarClock className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">イベント告知</h1>
          <p className="text-sm text-muted-foreground">開催日から逆算して、告知投稿を自動で予約します</p>
        </div>
      </div>

      {/* 登録フォーム */}
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="mb-1 text-sm font-bold text-foreground">イベントを登録する</p>
        <p className="mb-4 text-xs text-muted-foreground">
          2週間前・1週間前・3日前・前日・当日の5回に分けて告知します（開催日が近い場合は残りの回だけ）。
          内容はAIが登録情報だけを使って書き、「投稿の確認・予定」からいつでも修正できます。
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label className="text-sm">イベント名 *</Label>
            <Input value={form.title} maxLength={120} placeholder="例：3周年感謝祭 / 骨盤ケア体験会"
                   onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <Label className="text-sm">開催日 *</Label>
            <Input type="date" value={form.eventDate}
                   onChange={(e) => setForm({ ...form, eventDate: e.target.value })} />
          </div>
          <div>
            <Label className="text-sm">時間（任意）</Label>
            <Input value={form.eventTime} maxLength={40} placeholder="例：14:00〜16:00"
                   onChange={(e) => setForm({ ...form, eventTime: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-sm">場所（任意）</Label>
            <Input value={form.venue} maxLength={200} placeholder="例：店内 / 〇〇公民館"
                   onChange={(e) => setForm({ ...form, venue: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-sm">内容（任意・書いたことだけが投稿に使われます）</Label>
            <Textarea value={form.description} maxLength={1000} rows={3}
                      placeholder="例：日頃の感謝を込めて、施術の割引と物販セールを行います。"
                      onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-sm">参加方法・特典（任意）</Label>
            <Input value={form.offer} maxLength={300} placeholder="例：予約不要・当日ご来店ください / LINEで事前予約"
                   onChange={(e) => setForm({ ...form, offer: e.target.value })} />
          </div>
          {(accounts.data?.length ?? 0) > 1 && (
            <div>
              <Label className="text-sm">投稿するアカウント</Label>
              <select className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                      value={accountId} onChange={(e) => setForm({ ...form, threadsAccountId: Number(e.target.value) })}>
                {accounts.data!.map((a: any) => <option key={a.id} value={a.id}>@{a.threadsUsername}</option>)}
              </select>
            </div>
          )}
          {(projects.data?.length ?? 0) > 1 && (
            <div>
              <Label className="text-sm">お店（プロジェクト）</Label>
              <select className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                      value={projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
                {projects.data!.map((p: any) => <option key={p.id} value={p.id}>{p.storeName || p.title}</option>)}
              </select>
            </div>
          )}
        </div>
        <Button className="mt-4" disabled={!canSubmit}
                onClick={() => createEvent.mutate({
                  threadsAccountId: accountId,
                  projectId,
                  title: form.title.trim(),
                  eventDate: form.eventDate,
                  eventTime: form.eventTime.trim() || undefined,
                  venue: form.venue.trim() || undefined,
                  description: form.description.trim() || undefined,
                  offer: form.offer.trim() || undefined,
                })}>
          {createEvent.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {createEvent.isPending ? "告知を作成しています…" : "登録して告知を予約する"}
        </Button>
      </div>

      {/* イベント一覧 */}
      <div className="mt-6 space-y-3">
        <p className="text-sm font-bold text-foreground">登録済みのイベント</p>
        {eventsList.isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (eventsList.data ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">まだイベントはありません</p>
        ) : (
          (eventsList.data ?? []).map((ev: any) => (
            <div key={ev.id} className="rounded-xl border border-border bg-card">
              <button className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left"
                      onClick={() => setOpenId(openId === ev.id ? null : ev.id)}>
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">{ev.title}</span>
                <span className="text-xs text-muted-foreground">開催 {ev.eventDate}{ev.eventTime ? ` ${ev.eventTime}` : ""}</span>
                {ev.status === "canceled"
                  ? <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">中止</span>
                  : <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">告知{ev.posts.length}件</span>}
                <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${openId === ev.id ? "rotate-180" : ""}`} />
              </button>
              {openId === ev.id && (
                <div className="space-y-2 border-t border-border p-4">
                  {ev.posts.map((p: any) => (
                    <div key={p.id} className="rounded-lg border border-border bg-background px-3 py-2">
                      <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{fmtJst(p.scheduledAt)}</span>
                        <span className="rounded bg-muted px-1.5 py-0.5">{STATUS_LABEL[p.status] ?? p.status}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-foreground/90">{p.postContent}</p>
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">
                    修正・個別キャンセルは「投稿の確認・予定」からできます。
                  </p>
                  {ev.status !== "canceled" && (
                    <Button size="sm" variant="destructive" disabled={cancelEvent.isPending}
                            onClick={() => { if (confirm("このイベントを中止し、未投稿の告知をすべて取り消しますか？")) cancelEvent.mutate({ eventId: ev.id }); }}>
                      イベントを中止する（未投稿の告知を取消）
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
