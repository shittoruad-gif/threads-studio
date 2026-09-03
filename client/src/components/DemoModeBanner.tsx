import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sparkles, ArrowRight, Info } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";

export function DemoModeBanner() {
  const [, setLocation] = useLocation();
  const { data: demoModeData } = trpc.setup.getDemoMode.useQuery();
  const utils = trpc.useUtils();
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const exitDemoModeMutation = trpc.setup.exitDemoMode.useMutation({
    onSuccess: () => {
      utils.setup.getDemoMode.invalidate();
      toast.success("本番モードに切り替えました");
      setLocation("/threads-connect");
    },
    onError: () => {
      toast.error("切り替えに失敗しました");
    },
  });

  if (!demoModeData?.isDemoMode) {
    return null;
  }

  const handleExitDemo = () => {
    setShowExitConfirm(true);
  };

  const confirmExitDemo = () => {
    setShowExitConfirm(false);
    exitDemoModeMutation.mutate();
  };

  return (
    <>
    {/* ★Alert は grid（1列目=アイコン用・幅0、2列目=本文）。
        以前は本文を <div> で包んで1列目に入れていたため、スマホ幅で本文が
        幅ゼロの列に押し込まれ、1文字ずつ縦に折れて表示されていた（2026-09-03 指摘）。
        アイコンは Alert の直下に置き、本文は2列目（col-start-2）に置く。 */}
    <Alert className="border-primary/50 bg-primary/5 mb-6">
      <Sparkles className="text-primary" />
      <div className="col-start-2 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <Badge variant="outline" className="border-primary text-primary">
            デモモード
          </Badge>
          <span className="text-sm font-semibold">体験版として利用中</span>
        </div>
        <AlertDescription className="text-sm text-muted-foreground mb-3 block">
          現在、Threads連携なしでツールを体験できるデモモードで利用しています。
          実際にThreadsへ投稿するには、本番モードに切り替えてアカウントを連携してください。
        </AlertDescription>
        {/* ★スマホ幅ではボタンが2つ並びきらず、右のボタンが画面外へ切れていた */}
        <div className="flex flex-wrap gap-2">
          <Button 
            size="sm" 
            onClick={handleExitDemo}
            disabled={exitDemoModeMutation.isPending}
          >
            本番モードに切り替える
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
          <Button 
            size="sm" 
            variant="outline"
            onClick={() => setLocation("/guide")}
          >
            <Info className="w-4 h-4 mr-2" />
            使い方を見る
          </Button>
        </div>
      </div>
    </Alert>

      <AlertDialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>本番モードに切り替えますか？</AlertDialogTitle>
            <AlertDialogDescription>
              Threadsアカウントの連携が必要になります。連携ページに移動します。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={confirmExitDemo}>
              本番モードに切り替える
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
