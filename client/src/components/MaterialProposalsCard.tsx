import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

/**
 * ホームページから足した材料の一覧（2026-09-24 三上様指示）。
 *
 * > 「一回反映した後に『なんかちょっと違うな』となった場合は、
 * >   反映させず元の状態に戻すという選択肢もできるようにしといてください」
 *
 * 「元に戻す」は足した項目だけを外す（お客様ご自身がその後に直した分は残る）。
 * 公式LINEの「元に戻す」ボタンと同じ処理（server/declineFollowup.ts の decideProposal）。
 */
const STATUS_LABEL: Record<string, string> = {
  applied: '反映ずみ', pending: '未反映', undone: '元に戻した', skipped: '見送った', no_new: '新しい材料なし', no_url: '読めなかった',
};
const FIELD_LABEL: Record<string, string> = {
  strength: '強み', realEpisodes: '実例', faq: 'よくある質問', menu: 'メニュー', realProofs: '実績', discrepancies: '食い違い（入れていない）',
};

export default function MaterialProposalsCard() {
  const utils = trpc.useUtils();
  const { data } = trpc.admin.listMaterialProposals.useQuery();
  const decide = trpc.admin.decideMaterialProposal.useMutation({
    onSuccess: (r) => { toast.success(r.message.split('\n')[0]); utils.admin.listMaterialProposals.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const confirmUndo = (id: number, store: string) => {
    if (window.confirm(`${store} に足した材料を外して、足す前の状態に戻します。よろしいですか？`)) {
      decide.mutate({ id, action: 'undo' });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">ホームページから足した材料</CardTitle>
      </CardHeader>
      <CardContent>
        {!data ? (
          <p className="text-sm text-muted-foreground">確認中です。</p>
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground">まだありません。</p>
        ) : (
          <div className="space-y-3">
            {data.map((m) => {
              const fields = Object.entries(m.proposal ?? {}).filter(([, v]) => Array.isArray(v) && (v as string[]).length > 0);
              const count = fields.filter(([k]) => k !== 'discrepancies').reduce((n, [, v]) => n + (v as string[]).length, 0);
              return (
                <div key={m.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm font-bold text-foreground break-words min-w-0">
                      {m.userName}　{m.store}
                    </span>
                    <Badge variant={m.status === 'applied' ? 'default' : 'secondary'}>{STATUS_LABEL[m.status] ?? m.status}</Badge>
                  </div>
                  {m.sourceUrl && (
                    <a href={m.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-primary break-all hover:underline">
                      {m.sourceUrl}
                    </a>
                  )}
                  <details className="mt-2">
                    <summary className="text-sm cursor-pointer text-muted-foreground">中身を見る（{count}件）</summary>
                    <div className="mt-2 space-y-2">
                      {fields.map(([k, v]) => (
                        <div key={k}>
                          <p className="text-xs font-bold text-foreground">{FIELD_LABEL[k] ?? k}</p>
                          <ul className="text-sm text-foreground list-disc pl-5">
                            {(v as string[]).map((x, i) => <li key={i} className="break-words">{x}</li>)}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </details>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {m.status === 'applied' && (
                      <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => confirmUndo(m.id, m.store)}>
                        元に戻す
                      </Button>
                    )}
                    {m.status === 'pending' && (
                      <>
                        <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: m.id, action: 'apply' })}>足す</Button>
                        <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate({ id: m.id, action: 'skip' })}>見送る</Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-3">
          「元に戻す」は、足した項目だけを外します。その後にお客様ご自身が直した内容は残ります。お客様には何も送りません。
        </p>
      </CardContent>
    </Card>
  );
}
