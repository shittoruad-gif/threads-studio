import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ExternalLink, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ThreadsConnectionGuideProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ThreadsConnectionGuide({ open, onOpenChange }: ThreadsConnectionGuideProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Threadsアカウント連携ガイド</DialogTitle>
          <DialogDescription>
            Threads Studioを使用するには、Threadsアカウントの連携が必要です。以下の手順に従って設定してください。
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="setup" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="setup">連携手順</TabsTrigger>
            <TabsTrigger value="errors">よくあるエラー</TabsTrigger>
            <TabsTrigger value="faq">FAQ</TabsTrigger>
          </TabsList>

          <TabsContent value="setup" className="space-y-6 mt-6">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm">1</span>
                Threads Developer Portalにアクセス
              </h3>
              <div className="pl-8 space-y-2">
                <p className="text-sm text-muted-foreground">
                  Threads Developer Portalにアクセスし、Metaアカウントでログインします。
                </p>
                <Button variant="outline" size="sm" asChild>
                  <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Developer Portalを開く
                  </a>
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm">2</span>
                アプリを作成
              </h3>
              <div className="pl-8 space-y-2">
                <p className="text-sm text-muted-foreground">
                  「アプリを作成」ボタンをクリックし、以下の情報を入力します：
                </p>
                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                  <li>アプリ名：任意の名前（例：「Threads Studio」）</li>
                  <li>アプリの目的：「ビジネス」を選択</li>
                  <li>カテゴリ：「ソーシャルメディア」を選択</li>
                </ul>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm">3</span>
                Threads APIを有効化
              </h3>
              <div className="pl-8 space-y-2">
                <p className="text-sm text-muted-foreground">
                  アプリダッシュボードから「製品を追加」→「Threads API」を選択し、有効化します。
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm">4</span>
                アプリIDとシークレットを取得
              </h3>
              <div className="pl-8 space-y-2">
                <p className="text-sm text-muted-foreground">
                  「設定」→「ベーシック」から、アプリIDとアプリシークレットをコピーします。
                </p>
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    アプリシークレットは他人に共有しないでください。漏洩した場合は、すぐに再生成してください。
                  </AlertDescription>
                </Alert>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm">5</span>
                リダイレクトURIを設定
              </h3>
              <div className="pl-8 space-y-2">
                <p className="text-sm text-muted-foreground">
                  「Threads API」→「設定」から、以下のリダイレクトURIを追加します：
                </p>
                <code className="block bg-muted p-2 rounded text-sm">
                  {window.location.origin}/api/threads/callback
                </code>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm">6</span>
                Threads Studioで連携
              </h3>
              <div className="pl-8 space-y-2">
                <p className="text-sm text-muted-foreground">
                  ダッシュボードの「Threadsアカウント連携」ボタンをクリックし、取得したアプリIDとシークレットを入力します。
                </p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="errors" className="space-y-4 mt-6">
            <div className="space-y-4">
              <div className="border rounded-lg p-4 space-y-2">
                <div className="flex items-start gap-2">
                  <XCircle className="w-5 h-5 text-destructive mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-semibold">「アプリIDが無効です」エラー</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      アプリIDが正しく入力されているか確認してください。スペースや改行が含まれていないか注意してください。
                    </p>
                  </div>
                </div>
              </div>

              <div className="border rounded-lg p-4 space-y-2">
                <div className="flex items-start gap-2">
                  <XCircle className="w-5 h-5 text-destructive mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-semibold">「リダイレクトURIが一致しません」エラー</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Developer Portalで設定したリダイレクトURIが正しいか確認してください。HTTPSが必要です。
                    </p>
                  </div>
                </div>
              </div>

              <div className="border rounded-lg p-4 space-y-2">
                <div className="flex items-start gap-2">
                  <XCircle className="w-5 h-5 text-destructive mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-semibold">「アクセス権限がありません」エラー</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Threads APIが正しく有効化されているか確認してください。また、必要な権限が付与されているか確認してください。
                    </p>
                  </div>
                </div>
              </div>

              <div className="border rounded-lg p-4 space-y-2">
                <div className="flex items-start gap-2">
                  <XCircle className="w-5 h-5 text-destructive mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-semibold">「トークンの有効期限が切れました」エラー</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      アクセストークンの有効期限が切れています。ダッシュボードから再度連携を行ってください。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="faq" className="space-y-4 mt-6">
            <div className="space-y-4">
              <div className="border rounded-lg p-4 space-y-2">
                <h4 className="font-semibold">Q: Threads APIは無料ですか？</h4>
                <p className="text-sm text-muted-foreground">
                  A: はい、Threads APIは無料で使用できます。ただし、Meta Developer Portalでアプリを作成する必要があります。
                </p>
              </div>

              <div className="border rounded-lg p-4 space-y-2">
                <h4 className="font-semibold">Q: 複数のThreadsアカウントを連携できますか？</h4>
                <p className="text-sm text-muted-foreground">
                  A: はい、プロジェクトごとに異なるThreadsアカウントを連携できます。
                </p>
              </div>

              <div className="border rounded-lg p-4 space-y-2">
                <h4 className="font-semibold">Q: 連携を解除するにはどうすればいいですか？</h4>
                <p className="text-sm text-muted-foreground">
                  A: ダッシュボードの「Threadsアカウント管理」から連携を解除できます。
                </p>
              </div>

              <div className="border rounded-lg p-4 space-y-2">
                <h4 className="font-semibold">Q: アプリシークレットを忘れました</h4>
                <p className="text-sm text-muted-foreground">
                  A: Developer Portalから新しいシークレットを生成してください。古いシークレットは無効になります。
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            閉じる
          </Button>
          <Button asChild>
            <a href="https://developers.facebook.com/docs/threads" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4 mr-2" />
              公式ドキュメント
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
