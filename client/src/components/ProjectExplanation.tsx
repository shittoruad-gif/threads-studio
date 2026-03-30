import { Info } from 'lucide-react';

export default function ProjectExplanation() {
  return (
    <div className="bg-white rounded-xl p-6 border border-border mb-6">
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-xl bg-emerald-50">
          <Info className="w-6 h-6 text-emerald-600" />
        </div>
        <div className="flex-1">
          <h3 className="text-xl font-bold text-foreground mb-3">プロジェクトとは？</h3>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            プロジェクトは、投稿をまとめる<span className="text-emerald-600 font-semibold">「フォルダ」</span>のようなものです。
            テーマや目的ごとに投稿を整理できます。
          </p>
          
          <div className="bg-muted/50 rounded-xl p-4 mb-4">
            <p className="text-muted-foreground text-sm mb-3">例：美容サロンの場合</p>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  1
                </div>
                <p className="text-foreground/80">新メニュー紹介キャンペーン</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  2
                </div>
                <p className="text-foreground/80">お客様の声シリーズ</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  3
                </div>
                <p className="text-foreground/80">季節限定プロモーション</p>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-4 gap-3">
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-muted-foreground text-xs mb-1">無料</p>
              <p className="text-2xl font-bold text-muted-foreground/60">0<span className="text-sm font-normal text-muted-foreground/60">件</span></p>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-muted-foreground text-xs mb-1">ライト</p>
              <p className="text-2xl font-bold text-emerald-600">3<span className="text-sm font-normal text-muted-foreground">件</span></p>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-muted-foreground text-xs mb-1">プロ</p>
              <p className="text-2xl font-bold text-emerald-600">10<span className="text-sm font-normal text-muted-foreground">件</span></p>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-muted-foreground text-xs mb-1">ビジネス</p>
              <p className="text-lg font-bold text-emerald-600">無制限</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
