import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { industryTemplates } from '@/data/industry-templates';
import { Sparkles } from 'lucide-react';

export interface ProjectSettings {
  businessType: string;
  area: string;
  target: string;
  mainProblem: string;
  strength: string;
  proof?: string;
  ctaLink?: string;
  usp?: string;
  n1Customer?: string;
}

interface ProjectSettingsFormProps {
  initialValues?: Partial<ProjectSettings>;
  onSave: (settings: ProjectSettings) => void;
  onCancel?: () => void;
}

export function ProjectSettingsForm({ initialValues, onSave, onCancel }: ProjectSettingsFormProps) {
  const [settings, setSettings] = useState<ProjectSettings>({
    businessType: initialValues?.businessType || '',
    area: initialValues?.area || '',
    target: initialValues?.target || '',
    mainProblem: initialValues?.mainProblem || '',
    strength: initialValues?.strength || '',
    proof: initialValues?.proof || '',
    ctaLink: initialValues?.ctaLink || '',
    usp: initialValues?.usp || '',
    n1Customer: initialValues?.n1Customer || '',
  });

  const handleTemplateSelect = (templateId: string) => {
    const template = industryTemplates.find(t => t.id === templateId);
    if (template) {
      setSettings({
        businessType: template.businessType,
        area: template.area,
        target: template.target,
        mainProblem: template.mainProblem,
        strength: template.strength,
        proof: template.proof,
        ctaLink: settings.ctaLink,
        usp: settings.usp,
        n1Customer: settings.n1Customer,
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(settings);
  };

  const isValid = settings.businessType && settings.area && settings.target && settings.mainProblem && settings.strength;

  return (
    <Card>
      <CardHeader>
        <CardTitle>お店・サービスの基本情報</CardTitle>
        <CardDescription>
          入力した情報をもとに、AIがあなたのお店に合った投稿文を自動で作ります
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">

          {/* 業種テンプレート */}
          <div className="space-y-2">
            <Label htmlFor="template">業種から自動入力（任意）</Label>
            <Select onValueChange={handleTemplateSelect}>
              <SelectTrigger>
                <SelectValue placeholder="業種を選ぶと下の項目が自動で入力されます" />
              </SelectTrigger>
              <SelectContent>
                {industryTemplates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4" />
                      {template.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              選択後、内容を自分のお店に合わせて書き直してください
            </p>
          </div>

          {/* 業種 */}
          <div className="space-y-2">
            <Label htmlFor="businessType">お店・サービスの種類 <span className="text-destructive">*</span></Label>
            <Input
              id="businessType"
              placeholder="例：整体院、美容サロン、カフェ、ネイルサロン"
              value={settings.businessType}
              onChange={(e) => setSettings({ ...settings, businessType: e.target.value })}
              required
            />
          </div>

          {/* 地域 */}
          <div className="space-y-2">
            <Label htmlFor="area">お店がある場所 <span className="text-destructive">*</span></Label>
            <Input
              id="area"
              placeholder="例：岡山県倉敷市、東京都渋谷区"
              value={settings.area}
              onChange={(e) => setSettings({ ...settings, area: e.target.value })}
              required
            />
            <p className="text-sm text-muted-foreground">
              地域名を入れると、近くに住む人に届きやすい投稿になります
            </p>
          </div>

          {/* ターゲット */}
          <div className="space-y-2">
            <Label htmlFor="target">来てほしいお客様はどんな人？ <span className="text-destructive">*</span></Label>
            <Textarea
              id="target"
              placeholder="例：30〜50代の女性、産後のママ、デスクワークで肩こりに悩む会社員"
              value={settings.target}
              onChange={(e) => setSettings({ ...settings, target: e.target.value })}
              rows={3}
              required
            />
            <p className="text-sm text-muted-foreground">
              具体的に書くほど、その人に刺さる投稿になります
            </p>
          </div>

          {/* 主な悩み */}
          <div className="space-y-2">
            <Label htmlFor="mainProblem">そのお客様が抱えている悩みは？ <span className="text-destructive">*</span></Label>
            <Textarea
              id="mainProblem"
              placeholder="例：慢性的な腰痛、姿勢の悪さ、産後から体型が戻らない"
              value={settings.mainProblem}
              onChange={(e) => setSettings({ ...settings, mainProblem: e.target.value })}
              rows={3}
              required
            />
            <p className="text-sm text-muted-foreground">
              「そうそう、まさに私のことだ！」と思ってもらえる投稿を作るために使います
            </p>
          </div>

          {/* 強み */}
          <div className="space-y-2">
            <Label htmlFor="strength">お店・サービスの特徴や強みは？ <span className="text-destructive">*</span></Label>
            <Textarea
              id="strength"
              placeholder="例：国家資格保持者による施術、完全個室でプライバシー配慮、子連れOK"
              value={settings.strength}
              onChange={(e) => setSettings({ ...settings, strength: e.target.value })}
              rows={3}
              required
            />
          </div>

          {/* USP → 「他のお店と違うところ」 */}
          <div className="space-y-2">
            <Label htmlFor="usp">他のお店と違うところ（任意）</Label>
            <Textarea
              id="usp"
              placeholder="例：産後骨盤矯正に特化・国家資格保持者のみ在籍・完全予約制なので待ち時間なし"
              value={settings.usp}
              onChange={(e) => setSettings({ ...settings, usp: e.target.value })}
              rows={2}
            />
            <p className="text-sm text-muted-foreground">
              「うちだけ」「うちが一番」と言えることを書いてください。投稿に自然に盛り込みます。
            </p>
          </div>

          {/* N1分析 → 「印象に残っているお客様のエピソード」 */}
          <div className="space-y-2">
            <Label htmlFor="n1Customer">印象に残っているお客様のエピソード（任意）</Label>
            <Textarea
              id="n1Customer"
              placeholder="例：43歳の主婦の方で、産後から10年間腰痛が続いていました。「もう治らないと思っていた」とおっしゃっていたのですが、3回の施術で痛みが取れ、「こんなに楽になるとは思わなかった」と涙を流してくれました。"
              value={settings.n1Customer}
              onChange={(e) => setSettings({ ...settings, n1Customer: e.target.value })}
              rows={4}
            />
            <p className="text-sm text-muted-foreground">
              実際のお客様の言葉やエピソードをそのまま書いてください。リアルな体験談は、読んだ人の心に一番刺さります。
            </p>
          </div>

          {/* 実績 */}
          <div className="space-y-2">
            <Label htmlFor="proof">実績・数字（任意）</Label>
            <Textarea
              id="proof"
              placeholder="例：月間100名以上の来院実績、お客様満足度95%、創業10年"
              value={settings.proof}
              onChange={(e) => setSettings({ ...settings, proof: e.target.value })}
              rows={2}
            />
            <p className="text-sm text-muted-foreground">
              具体的な数字があると、信頼感が上がります
            </p>
          </div>

          {/* CTA */}
          <div className="space-y-2">
            <Label htmlFor="ctaLink">予約・問い合わせ先のURL（任意）</Label>
            <Input
              id="ctaLink"
              type="url"
              placeholder="例：https://lin.ee/xxxxx（LINE）、https://example.com/reserve（予約ページ）"
              value={settings.ctaLink}
              onChange={(e) => setSettings({ ...settings, ctaLink: e.target.value })}
            />
            <p className="text-sm text-muted-foreground">
              LINEや予約サイトのURLを入れると、投稿の最後に「プロフィールのリンクから」などの誘導文が入ります
            </p>
          </div>

          <div className="flex gap-3 justify-end">
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>
                キャンセル
              </Button>
            )}
            <Button type="submit" disabled={!isValid}>
              保存する
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
