import { Card, CardContent } from "@/components/ui/card";
import { FileText, Edit3, Save, Send, Clock, Sparkles } from "lucide-react";

export default function HowToUse() {
  const steps = [
    {
      icon: FileText,
      title: "1. テンプレートを選択",
      description: "店舗集客に最適化された4種類のテンプレートから選択。共感型、FAQ型、体験談型、チェックリスト型など、目的に合わせて選べます。",
      color: "oklch(0.75 0.15 200)",
    },
    {
      icon: Edit3,
      title: "2. 情報を入力",
      description: "店舗名、対象顧客、悩み、ベネフィット、CTAなどを入力。トーン（丁寧/カジュアル/専門寄り）も選択できます。",
      color: "oklch(0.70 0.25 280)",
    },
    {
      icon: Sparkles,
      title: "3. スレッドを生成",
      description: "AIが広告規制・誇大表現を回避しながら、効果的なスレッド（1〜10ポスト）を自動生成します。",
      color: "oklch(0.65 0.25 330)",
    },
    {
      icon: Edit3,
      title: "4. 編集・調整",
      description: "ドラッグ&ドロップで並び替え、ポスト単位で編集・追加・削除が可能。文字数カウンタで上限も確認できます。",
      color: "oklch(0.85 0.20 100)",
    },
    {
      icon: Save,
      title: "5. 保存",
      description: "プロジェクトとして保存し、ライブラリで管理。後から編集や再利用も簡単です。",
      color: "oklch(0.75 0.15 200)",
    },
    {
      icon: Send,
      title: "6. 投稿・予約",
      description: "テキスト/JSON/CSV形式で書き出し、またはThreadsアカウントと連携して直接投稿・予約投稿が可能です。",
      color: "oklch(0.70 0.25 280)",
    },
  ];

  return (
    <section className="py-20 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 cyber-grid opacity-20" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-br from-primary/20 to-transparent rounded-full blur-3xl float" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-gradient-to-br from-accent/30 to-transparent rounded-full blur-3xl float-delayed" />

      <div className="container relative z-10">
        <div className="text-center mb-16 scale-in">
          <h2 className="text-4xl md:text-5xl font-bold gradient-text mb-4">
            使い方はとても簡単
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            6つのステップで、効果的なThreads投稿を作成できます
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <Card 
                key={index} 
                className="glass-card hover-lift group"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <CardContent className="p-6">
                  <div 
                    className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 holographic"
                    style={{
                      background: `linear-gradient(135deg, ${step.color} 0%, ${step.color}80 100%)`,
                      boxShadow: `0 0 20px ${step.color}40`,
                    }}
                  >
                    <Icon className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-xl font-bold mb-2 group-hover:gradient-text transition-all">
                    {step.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Additional tips */}
        <div className="mt-16 max-w-4xl mx-auto">
          <Card className="glass-card neon-button">
            <CardContent className="p-8">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center flex-shrink-0">
                  <Clock className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-2 gradient-text">
                    💡 プロのヒント
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    予約投稿機能を使えば、最適な時間帯に自動投稿できます。複数のスレッドを事前に作成し、スケジュールを組むことで、効率的なSNS運用が可能になります。
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
