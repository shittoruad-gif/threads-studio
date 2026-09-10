import { useEffect, useRef, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Loader2, MessageCircle, Copy } from 'lucide-react';
import { toast } from 'sonner';

/**
 * 登録直後の「1本道」画面（2026-09-08 三上様指示「ド素人でも自動投稿まで進める」）。
 *
 * 直近30日の新規17名のうち5名が、登録後に何もせず止まっていた。原因はダッシュボードに
 * 「LINE」「固定投稿」「デモモード」「料金」が同時に並び、何を押せばいいか分からないこと。
 * お店の情報も Threads も LINE も無い方には、この画面だけを出し、やることを1つにする。
 *
 * やること：公式LINEを友だち追加 → トークに6桁のコードを送る。あとは全部LINEの中で進む。
 */
export function OnboardingStart() {
  const { data: line } = trpc.lineNotify.getStatus.useQuery();
  const createCode = trpc.lineNotify.createLinkCode.useMutation({ onError: (e) => toast.error(e.message) });
  const [code, setCode] = useState<string | null>(null);
  // ★コードは1回だけ発行する。2回発行すると、画面の数字とサーバーの数字が食い違うことがある
  //   （後から発行した方が有効になるため）。React の二重実行にも耐えるよう ref で守る。
  const requested = useRef(false);

  useEffect(() => {
    if (!line?.available || requested.current) return;
    requested.current = true;
    createCode.mutateAsync().then((r: any) => setCode(String(r?.code ?? ''))).catch(() => { requested.current = false; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line?.available]);

  const addUrl = (line as any)?.addFriendUrl || 'https://line.me/R/ti/p/@936rschf';

  const copy = async () => {
    if (!code) return;
    try { await navigator.clipboard.writeText(code); toast.success('コードをコピーしました'); } catch { /* 手で打ってもらう */ }
  };

  return (
    <div className="max-w-md mx-auto py-6 px-4">
      <div className="rounded-2xl border bg-card p-6 space-y-5 shadow-sm">
        <div>
          <p className="text-xs text-muted-foreground">はじめに 1つだけ</p>
          <h1 className="text-xl font-bold text-foreground mt-1">公式LINEを友だち追加してください</h1>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            設定も毎日の投稿の確認も、すべてLINEのトークの中で終わります。この画面に戻る必要はありません。
          </p>
        </div>

        <ol className="space-y-4 text-sm text-foreground">
          <li className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center">1</span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">下のボタンで友だち追加</p>
              <a href={addUrl} target="_blank" rel="noopener noreferrer" className="inline-block mt-2">
                <Button className="bg-[#06C755] hover:bg-[#05b34c] text-white">
                  <MessageCircle className="w-4 h-4 mr-1.5" />
                  公式LINEを友だち追加
                </Button>
              </a>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center">2</span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">トークに、この6桁の数字をそのまま送る</p>
              <div className="mt-2 flex items-center gap-2">
                <div className="text-3xl font-bold tracking-[0.3em] text-foreground min-w-[9rem]">
                  {code ? code : <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}
                </div>
                <Button size="sm" variant="outline" onClick={copy} disabled={!code}>
                  <Copy className="w-4 h-4 mr-1" />コピー
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">10分間有効です。切れたら、このページを開き直すと新しい数字が出ます。</p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center">3</span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">あとはLINEの案内どおりに</p>
              <p className="text-xs text-muted-foreground mt-1">
                お店のことを5問だけお聞きして（2分）、その場で最初の投稿をお届けします。
              </p>
            </div>
          </li>
        </ol>

        <p className="text-xs text-muted-foreground border-t pt-4">
          うまくいかないときは、公式LINEのトークに「連携」と送ってください。案内が届きます。
        </p>
        <p className="text-xs text-muted-foreground">
          最初にお聞きするのは5つだけ（お店のホームページのURL1つと質問4つ・2分ほど）です。
        </p>
      </div>
    </div>
  );
}
