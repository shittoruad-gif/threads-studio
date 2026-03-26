import { useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { nanoid } from 'nanoid';
import { ArrowLeft, Sparkles, Store, ChevronRight, Edit3, MessageCircle, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { industryTemplates, INDUSTRY_CATEGORIES } from '@/data/industry-templates';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import ChatProjectSetup from '@/components/ChatProjectSetup';
import { cn } from '@/lib/utils';

type Mode = 'chat' | 'form';

export default function AIProjectCreate() {
  const [, setLocation] = useLocation();
  const [projectId] = useState(nanoid());
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>(INDUSTRY_CATEGORIES[0].id);
  const [showDetails, setShowDetails] = useState(false);
  const [mode, setMode] = useState<Mode>('chat');

  const [form, setForm] = useState({
    title: '',
    businessType: '',
    area: '',
    target: '',
    mainProblem: '',
    strength: '',
    proof: '',
    ctaLink: '',
  });

  // Sync data from chat mode back to form state
  const handleChatDataChange = useCallback((data: typeof form) => {
    setForm(data);
  }, []);

  const createProjectMutation = trpc.project.create.useMutation({
    onSuccess: () => {
      toast.success('プロジェクトを作成しました');
      setLocation(`/ai-generate?project=${projectId}`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleTemplateSelect = (templateId: string) => {
    const template = industryTemplates.find(t => t.id === templateId);
    if (template) {
      setSelectedTemplate(templateId);
      setForm({
        title: `${template.name} Threads集客`,
        businessType: template.businessType,
        area: template.area,
        target: template.target,
        mainProblem: template.mainProblem,
        strength: template.strength,
        proof: template.proof,
        ctaLink: form.ctaLink,
      });
    }
  };

  const handleSubmit = async () => {
    if (!form.businessType || !form.area || !form.target || !form.mainProblem || !form.strength) {
      toast.error('必須項目を入力してください');
      return;
    }
    await createProjectMutation.mutateAsync({
      id: projectId,
      title: form.title || `${form.businessType} Threads集客`,
      businessType: form.businessType,
      area: form.area,
      target: form.target,
      mainProblem: form.mainProblem,
      strength: form.strength,
      proof: form.proof || undefined,
      ctaLink: form.ctaLink || undefined,
    });
  };

  const isValid = form.businessType && form.area && form.target && form.mainProblem && form.strength;

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-2xl py-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation('/dashboard')}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          ダッシュボードに戻る
        </Button>

        {/* Mode toggle */}
        <div className="flex items-center justify-center mb-6">
          <div className="inline-flex items-center bg-gray-100 rounded-full p-1 gap-1">
            <button
              onClick={() => setMode('chat')}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all',
                mode === 'chat'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <MessageCircle className="w-4 h-4" />
              チャット形式
            </button>
            <button
              onClick={() => setMode('form')}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all',
                mode === 'form'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <ClipboardList className="w-4 h-4" />
              フォーム入力
            </button>
          </div>
        </div>

        {/* Chat mode */}
        {mode === 'chat' && (
          <ChatProjectSetup
            initialData={form}
            onDataChange={handleChatDataChange}
          />
        )}

        {/* Form mode */}
        {mode === 'form' && (
          <Card>
            <CardHeader className="text-center pb-2">
              <div className="flex justify-center mb-3">
                <div className="bg-primary/10 p-3 rounded-xl">
                  <Store className="h-8 w-8 text-primary" />
                </div>
              </div>
              <CardTitle className="text-xl">店舗情報を設定</CardTitle>
              <CardDescription>
                業種を選ぶだけで自動入力されます。あとから編集もできます。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Industry Category Tabs + Templates */}
              <div>
                <Label className="text-sm font-medium mb-3 block">業種を選択</Label>
                {/* Category Tabs */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {INDUSTRY_CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setActiveCategory(cat.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                        activeCategory === cat.id
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
                {/* Filtered Templates */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {industryTemplates
                    .filter((t) => t.category === activeCategory)
                    .map((template) => (
                      <button
                        key={template.id}
                        onClick={() => handleTemplateSelect(template.id)}
                        className={`text-left p-3 rounded-lg border-2 transition-all text-sm ${
                          selectedTemplate === template.id
                            ? 'border-primary bg-primary/5 text-primary font-medium'
                            : 'border-gray-200 hover:border-gray-300 text-gray-700'
                        }`}
                      >
                        {template.name}
                      </button>
                    ))}
                </div>
              </div>

              {/* Auto-filled preview */}
              {selectedTemplate && (
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-700">自動入力された情報</p>
                    <button
                      onClick={() => setShowDetails(!showDetails)}
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      <Edit3 className="w-3 h-3" />
                      {showDetails ? '閉じる' : '編集する'}
                    </button>
                  </div>
                  {!showDetails && (
                    <div className="space-y-1 text-sm text-gray-500">
                      <p>業種: {form.businessType} / 地域: {form.area}</p>
                      <p>ターゲット: {form.target.substring(0, 40)}...</p>
                    </div>
                  )}
                </div>
              )}

              {/* Editable details (collapsed by default) */}
              {showDetails && (
                <div className="space-y-4 border-t pt-4">
                  <div className="space-y-2">
                    <Label>プロジェクト名</Label>
                    <Input
                      value={form.title}
                      onChange={(e) => setForm({...form, title: e.target.value})}
                      placeholder="例：渋谷整体院 Threads集客"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>業種 *</Label>
                      <Input
                        value={form.businessType}
                        onChange={(e) => setForm({...form, businessType: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>地域 *</Label>
                      <Input
                        value={form.area}
                        onChange={(e) => setForm({...form, area: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>ターゲット *</Label>
                    <Textarea
                      value={form.target}
                      onChange={(e) => setForm({...form, target: e.target.value})}
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>主な悩み *</Label>
                    <Textarea
                      value={form.mainProblem}
                      onChange={(e) => setForm({...form, mainProblem: e.target.value})}
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>強み・特徴 *</Label>
                    <Textarea
                      value={form.strength}
                      onChange={(e) => setForm({...form, strength: e.target.value})}
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>実績（任意）</Label>
                    <Textarea
                      value={form.proof}
                      onChange={(e) => setForm({...form, proof: e.target.value})}
                      rows={2}
                      placeholder="例：月間100名の来院実績、Google口コミ4.8"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>CTA URL（任意）</Label>
                    <Input
                      value={form.ctaLink}
                      onChange={(e) => setForm({...form, ctaLink: e.target.value})}
                      placeholder="例：https://lin.ee/xxxxx"
                    />
                  </div>
                </div>
              )}

              {/* Submit */}
              <Button
                onClick={handleSubmit}
                disabled={!isValid || createProjectMutation.isPending}
                className="w-full"
                size="lg"
              >
                {createProjectMutation.isPending ? (
                  <span className="animate-spin mr-2">...</span>
                ) : (
                  <Sparkles className="w-4 h-4 mr-2" />
                )}
                プロジェクトを作成してAI投稿を始める
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>

              {!selectedTemplate && (
                <p className="text-center text-sm text-muted-foreground">
                  業種を選択するか、
                  <button onClick={() => setShowDetails(true)} className="text-primary hover:underline">
                    手動で入力
                  </button>
                  してください
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
