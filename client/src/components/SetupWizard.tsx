import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { trpc } from '@/lib/trpc';
import { useLocation } from 'wouter';
import {
  Sparkles,
  Link2,
  Store,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  X,
  Zap
} from 'lucide-react';
import { toast } from 'sonner';

interface SetupWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TOTAL_STEPS = 3;

export default function SetupWizard({ open, onOpenChange }: SetupWizardProps) {
  const [, setLocation] = useLocation();
  const [currentStep, setCurrentStep] = useState(1);
  const utils = trpc.useUtils();

  const { data: setupData } = trpc.setup.getStep.useQuery(undefined, {
    enabled: open,
  });

  const updateStepMutation = trpc.setup.updateStep.useMutation({
    onSuccess: () => {
      utils.setup.getStep.invalidate();
    },
  });

  const completeSetupMutation = trpc.setup.complete.useMutation({
    onSuccess: () => {
      utils.setup.getStep.invalidate();
      toast.success('セットアップ完了！自動投稿が有効になりました');
      onOpenChange(false);
    },
  });

  const initializeDemoMutation = trpc.setup.initializeDemoData.useMutation({
    onSuccess: () => {
      utils.project.list.invalidate();
    },
  });

  useEffect(() => {
    if (setupData?.setupStep) {
      // Map old 5-step to new 3-step
      const mapped = Math.min(setupData.setupStep, TOTAL_STEPS);
      setCurrentStep(mapped || 1);
    }
  }, [setupData]);

  const handleNext = async () => {
    const nextStep = currentStep + 1;

    if (currentStep === 1) {
      await initializeDemoMutation.mutateAsync();
    }

    if (nextStep <= TOTAL_STEPS) {
      setCurrentStep(nextStep);
      await updateStepMutation.mutateAsync({ setupStep: nextStep });
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = async () => {
    await completeSetupMutation.mutateAsync();
  };

  const handleComplete = async () => {
    await completeSetupMutation.mutateAsync();
  };

  const handleNavigate = (path: string) => {
    onOpenChange(false);
    setLocation(path);
  };

  const progress = (currentStep / TOTAL_STEPS) * 100;

  const steps = [
    {
      id: 1,
      title: 'ようこそ！',
      icon: <Sparkles className="w-12 h-12 text-primary" />,
      description: 'Threads Studioは、あなたの代わりにThreads投稿を毎日自動で作成・投稿します。',
      content: (
        <div className="space-y-4">
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-3">
              <Zap className="w-6 h-6 text-primary" />
              <h4 className="font-bold text-lg">3ステップで完全自動化</h4>
            </div>
            <ol className="space-y-3 ml-9">
              <li className="flex items-start gap-2">
                <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold flex-shrink-0">1</span>
                <span>Threadsアカウントを連携</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold flex-shrink-0">2</span>
                <span>店舗情報を入力</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold flex-shrink-0">3</span>
                <span>あとはAIにおまかせ！</span>
              </li>
            </ol>
          </div>
          <p className="text-sm text-muted-foreground text-center">
            設定完了後、毎日AIが最適な投稿を自動生成してThreadsに投稿します
          </p>
        </div>
      ),
      action: (
        <Button onClick={handleNext} className="w-full" size="lg">
          始める
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      ),
    },
    {
      id: 2,
      title: 'Threadsアカウント連携',
      icon: <Link2 className="w-12 h-12 text-primary" />,
      description: 'ボタンひとつでThreadsアカウントと連携できます。',
      content: (
        <div className="space-y-4">
          <ul className="space-y-3 text-muted-foreground">
            <li className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
              <span>AIが生成した投稿を自動でThreadsに公開</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
              <span>最適な時間帯に自動投稿（9時/12時/18時/21時）</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
              <span>投稿スタイルを自動ローテーション</span>
            </li>
          </ul>
          <div className="bg-muted p-4 rounded-lg">
            <p className="text-sm text-muted-foreground">
              連携にはInstagramアカウントが必要です。Threads連携画面で認証を行ってください。
            </p>
          </div>
        </div>
      ),
      action: (
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleBack} className="flex-1">
            <ArrowLeft className="w-4 h-4 mr-2" />
            戻る
          </Button>
          <Button onClick={() => handleNavigate('/threads-connect')} className="flex-1">
            アカウント連携へ
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      ),
    },
    {
      id: 3,
      title: '店舗情報を入力して完了！',
      icon: <Store className="w-12 h-12 text-primary" />,
      description: 'あなたの店舗・サービスの情報を入力するだけ。あとはAIが毎日投稿します。',
      content: (
        <div className="space-y-4">
          <ul className="space-y-2 text-muted-foreground">
            <li className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
              <span><strong>業種:</strong> 例）整体院・サロン・飲食店</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
              <span><strong>地域:</strong> 例）渋谷区・横浜市</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
              <span><strong>ターゲット:</strong> 例）30-50代の腰痛に悩む女性</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
              <span><strong>強み:</strong> 例）20年の実績、痛くない施術</span>
            </li>
          </ul>
          <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-5 h-5 text-green-600" />
              <h4 className="font-semibold text-green-800 dark:text-green-200">入力完了後、自動投稿が開始されます</h4>
            </div>
            <p className="text-sm text-green-700 dark:text-green-300">
              明日から毎日、AIがあなたの店舗に最適なThreads投稿を自動で生成・公開します。
            </p>
          </div>
        </div>
      ),
      action: (
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleBack} className="flex-1">
            <ArrowLeft className="w-4 h-4 mr-2" />
            戻る
          </Button>
          <Button onClick={() => handleNavigate('/ai-project-create')} className="flex-1">
            店舗情報を入力
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      ),
    },
  ];

  const step = steps[currentStep - 1];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <Button
          variant="ghost"
          size="sm"
          className="absolute right-4 top-4"
          onClick={handleSkip}
        >
          <X className="w-4 h-4 mr-1" />
          スキップ
        </Button>

        <DialogHeader className="text-center">
          <div className="flex justify-center mb-4">
            {step.icon}
          </div>
          <DialogTitle className="text-2xl">{step.title}</DialogTitle>
          <DialogDescription className="text-base">
            {step.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <Progress value={progress} className="h-2" />

          <div className="text-center text-sm text-muted-foreground">
            ステップ {currentStep} / {TOTAL_STEPS}
          </div>

          <div className="min-h-[250px]">
            {step.content}
          </div>

          {step.action}
        </div>
      </DialogContent>
    </Dialog>
  );
}
